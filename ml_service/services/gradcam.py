"""PyTorch Grad-CAM utilities for the SolarAI MobileNetV3 model."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms


IMAGE_SIZE = 224
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "solar_panel_mobilenetv3.pth"
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_mobilenetv3_small(num_classes: int) -> nn.Module:
    """Rebuild the exact classifier architecture used by train.py."""
    model = models.mobilenet_v3_small(weights=None)
    classifier_input_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(classifier_input_features, 512),
        nn.Hardswish(),
        nn.Dropout(p=0.2, inplace=True),
        nn.Linear(512, num_classes),
    )
    return model


def load_solarai_model(
    checkpoint_path: str | Path = MODEL_PATH,
    device: torch.device | str = "cpu",
) -> tuple[nn.Module, list[str], int, dict[str, Any]]:
    """Load the trained MobileNetV3 checkpoint on CPU by default."""
    checkpoint_path = Path(checkpoint_path)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    classes = list(checkpoint["classes"])
    image_size = int(checkpoint.get("image_size", IMAGE_SIZE))

    model = build_mobilenetv3_small(len(classes))
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, classes, image_size, checkpoint


def get_preprocess_transform(image_size: int = IMAGE_SIZE) -> transforms.Compose:
    """Use the same resize and ImageNet normalization used during training."""
    return transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


def get_gradcam_target_layer(model: nn.Module) -> nn.Module:
    """Return MobileNetV3 Small's final convolutional feature block.

    For torchvision MobileNetV3 Small, model.features is a Sequential stack.
    The final element, model.features[-1], is a Conv2dNormActivation block with
    spatial feature maps, making it the last suitable convolutional layer for
    Grad-CAM before average pooling and the classifier.
    """
    return model.features[-1]


class GradCAM:
    """Generate Grad-CAM heatmaps with PyTorch forward/backward hooks."""

    def __init__(self, model: nn.Module, target_layer: nn.Module) -> None:
        self.model = model
        self.target_layer = target_layer
        self.feature_maps: torch.Tensor | None = None
        self.gradients: torch.Tensor | None = None
        self._handles = [
            target_layer.register_forward_hook(self._capture_feature_maps),
            target_layer.register_full_backward_hook(self._capture_gradients),
        ]

    def _capture_feature_maps(
        self,
        _module: nn.Module,
        _inputs: tuple[torch.Tensor, ...],
        output: torch.Tensor,
    ) -> None:
        self.feature_maps = output

    def _capture_gradients(
        self,
        _module: nn.Module,
        _grad_input: tuple[torch.Tensor | None, ...],
        grad_output: tuple[torch.Tensor | None, ...],
    ) -> None:
        self.gradients = grad_output[0]

    def generate(self, image_tensor: torch.Tensor, class_index: int | None = None) -> torch.Tensor:
        """Return a normalized 0-1 heatmap for the selected class."""
        self.model.zero_grad(set_to_none=True)
        logits = self.model(image_tensor)

        if class_index is None:
            class_index = int(logits.argmax(dim=1).item())

        score = logits[:, class_index].sum()
        score.backward()

        if self.feature_maps is None or self.gradients is None:
            raise RuntimeError("Grad-CAM hooks did not capture feature maps or gradients.")

        # Global-average-pool gradients to get one importance weight per channel.
        gradients = self.gradients.detach()[0]
        feature_maps = self.feature_maps.detach()[0]
        weights = gradients.mean(dim=(1, 2), keepdim=True)

        # Weight feature maps, sum channels, keep only positive class evidence.
        heatmap = (weights * feature_maps).sum(dim=0)
        heatmap = torch.relu(heatmap)

        max_value = heatmap.max()
        if max_value > 0:
            heatmap = heatmap / max_value
        return heatmap.cpu()

    def close(self) -> None:
        for handle in self._handles:
            handle.remove()


def run_prediction(model: nn.Module, image_tensor: torch.Tensor) -> tuple[int, float, torch.Tensor]:
    """Run one CPU-safe inference pass and return class index, confidence, probabilities."""
    with torch.inference_mode():
        logits = model(image_tensor)
        probabilities = torch.softmax(logits, dim=1)[0]
    class_index = int(probabilities.argmax().item())
    confidence = float(probabilities[class_index].item())
    return class_index, confidence, probabilities


def colorize_heatmap(heatmap: np.ndarray) -> np.ndarray:
    """Apply a small jet-like colormap without adding matplotlib as a dependency."""
    heatmap = np.clip(heatmap, 0.0, 1.0)
    red = np.clip(1.5 - np.abs(4.0 * heatmap - 3.0), 0.0, 1.0)
    green = np.clip(1.5 - np.abs(4.0 * heatmap - 2.0), 0.0, 1.0)
    blue = np.clip(1.5 - np.abs(4.0 * heatmap - 1.0), 0.0, 1.0)
    return np.stack([red, green, blue], axis=-1)


def save_gradcam_overlay(
    original_image: Image.Image,
    heatmap: torch.Tensor,
    output_path: str | Path,
    alpha: float = 0.45,
) -> Path:
    """Resize the heatmap to the original image and save a blended overlay."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    original_rgb = original_image.convert("RGB")
    original_array = np.asarray(original_rgb).astype(np.float32) / 255.0

    heatmap_image = Image.fromarray(np.uint8(heatmap.numpy() * 255), mode="L")
    heatmap_image = heatmap_image.resize(original_rgb.size, Image.Resampling.BILINEAR)
    heatmap_array = np.asarray(heatmap_image).astype(np.float32) / 255.0
    colored_heatmap = colorize_heatmap(heatmap_array)

    overlay = ((1.0 - alpha) * original_array) + (alpha * colored_heatmap)
    overlay_image = Image.fromarray(np.uint8(np.clip(overlay, 0.0, 1.0) * 255))
    overlay_image.save(output_path)
    return output_path
