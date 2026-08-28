"""Local smoke test for PyTorch Grad-CAM on a SolarAI image."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from PIL import Image

from services.gradcam import (
    MODEL_PATH,
    GradCAM,
    get_gradcam_target_layer,
    get_preprocess_transform,
    load_solarai_model,
    run_prediction,
    save_gradcam_overlay,
)


RESULTS_DIR = Path(__file__).resolve().parent / "models" / "gradcam_results"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path", type=Path, help="Path to a solar-panel image.")
    parser.add_argument("--checkpoint", type=Path, default=MODEL_PATH)
    parser.add_argument("--output-dir", type=Path, default=RESULTS_DIR)
    args = parser.parse_args()

    if not args.image_path.is_file():
        raise SystemExit(f"Image not found: {args.image_path}")

    device = torch.device("cpu")
    model, classes, image_size, _checkpoint = load_solarai_model(args.checkpoint, device=device)
    transform = get_preprocess_transform(image_size)

    original = Image.open(args.image_path).convert("RGB")
    image_tensor = transform(original).unsqueeze(0).to(device)

    predicted_index, confidence, _probabilities = run_prediction(model, image_tensor)
    predicted_class = classes[predicted_index]

    target_layer = get_gradcam_target_layer(model)
    gradcam = GradCAM(model, target_layer)
    try:
        heatmap = gradcam.generate(image_tensor, predicted_index)
    finally:
        gradcam.close()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    original_output = args.output_dir / "result_original.jpg"
    heatmap_output = args.output_dir / "result_gradcam.jpg"

    original.save(original_output)
    save_gradcam_overlay(original, heatmap, heatmap_output)

    print(f"Predicted class: {predicted_class}")
    print(f"Confidence: {confidence * 100:.2f}%")
    print(f"Original image saved to: {original_output}")
    print(f"Heatmap saved to: {heatmap_output}")
    print("Grad-CAM layer: model.features[-1]")


if __name__ == "__main__":
    main()
