
from __future__ import annotations

import argparse
import random
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset, WeightedRandomSampler
from torchvision import datasets, models, transforms


IMAGE_SIZE = 224
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_DATA_DIR = PROJECT_ROOT / "cleaned_dataset"
DEFAULT_OUTPUT = SCRIPT_DIR / "models" / "solar_panel_mobilenetv3.pth"


def make_transforms() -> tuple[transforms.Compose, transforms.Compose]:
    normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    train = transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(12),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.ToTensor(),
        normalize,
    ])
    validate = transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        normalize,
    ])
    return train, validate


def split_indices(labels: list[int], validation_fraction: float, seed: int) -> tuple[list[int], list[int]]:
    """Make a reproducible class-stratified split without an extra dependency."""
    grouped: dict[int, list[int]] = {}
    for index, label in enumerate(labels):
        grouped.setdefault(label, []).append(index)
    rng = random.Random(seed)
    train_indices: list[int] = []
    validation_indices: list[int] = []
    for indices in grouped.values():
        rng.shuffle(indices)
        validation_count = max(1, round(len(indices) * validation_fraction))
        validation_indices.extend(indices[:validation_count])
        train_indices.extend(indices[validation_count:])
    return train_indices, validation_indices


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float]:
    model.eval()
    loss_fn = nn.CrossEntropyLoss()
    total_loss = 0.0
    correct = 0
    total = 0
    with torch.inference_mode():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            total_loss += loss_fn(logits, labels).item() * labels.size(0)
            correct += (logits.argmax(dim=1) == labels).sum().item()
            total += labels.size(0)
    return total_loss / total, correct / total


def build_model(num_classes: int) -> nn.Module:
    weights = models.MobileNet_V3_Small_Weights.DEFAULT
    model = models.mobilenet_v3_small(weights=weights)

    for parameter in model.features.parameters():
        parameter.requires_grad = False

    classifier_input_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(classifier_input_features, 512),
        nn.Hardswish(),
        nn.Dropout(p=0.2, inplace=True),
        nn.Linear(512, num_classes),
    )
    return model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if not args.data_dir.is_dir():
        raise SystemExit(f"Dataset directory does not exist: {args.data_dir.resolve()}")

    train_transform, validation_transform = make_transforms()
    # ImageFolder defines the labels from folder names, which keeps the model aligned with the dataset.
    label_dataset = datasets.ImageFolder(args.data_dir)
    train_indices, validation_indices = split_indices(label_dataset.targets, args.validation_fraction, args.seed)
    train_dataset = datasets.ImageFolder(args.data_dir, transform=train_transform)
    validation_dataset = datasets.ImageFolder(args.data_dir, transform=validation_transform)

    counts = torch.bincount(torch.tensor(label_dataset.targets), minlength=len(label_dataset.classes)).float()
    sample_weights = (1.0 / counts)[torch.tensor([label_dataset.targets[i] for i in train_indices])]
    sampler = WeightedRandomSampler(sample_weights, num_samples=len(train_indices), replacement=True)
    train_loader = DataLoader(Subset(train_dataset, train_indices), batch_size=args.batch_size, sampler=sampler, num_workers=0)
    validation_loader = DataLoader(Subset(validation_dataset, validation_indices), batch_size=args.batch_size, shuffle=False, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(len(label_dataset.classes))
    model.to(device)
    optimizer = torch.optim.AdamW(
        (parameter for parameter in model.parameters() if parameter.requires_grad),
        lr=args.learning_rate,
        weight_decay=1e-4,
    )
    loss_fn = nn.CrossEntropyLoss()

    print(f"Classes: {label_dataset.classes}")
    print(f"Training: {len(train_indices)} images | validation: {len(validation_indices)} images | device: {device}")
    print("Model: torchvision MobileNetV3 Small | pretrained weights: DEFAULT | frozen feature extractor")
    best_accuracy = -1.0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            loss_fn(model(images), labels).backward()
            optimizer.step()
        validation_loss, validation_accuracy = evaluate(model, validation_loader, device)
        print(f"Epoch {epoch}/{args.epochs}: validation loss={validation_loss:.4f}, accuracy={validation_accuracy:.2%}")
        if validation_accuracy > best_accuracy:
            best_accuracy = validation_accuracy
            torch.save({
                "model_state": model.state_dict(),
                "classes": label_dataset.classes,
                "image_size": IMAGE_SIZE,
                "validation_accuracy": validation_accuracy,
                "architecture": "mobilenet_v3_small",
            }, args.output)
    print(f"Saved best model ({best_accuracy:.2%} validation accuracy) to {args.output}")


if __name__ == "__main__":
    main()
