"""HTTP inference service consumed by the Vite frontend."""

from __future__ import annotations

import io
import os
import base64
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from torch import nn
from torchvision import transforms

from services.gradcam import (
    MODEL_PATH as DEFAULT_MODEL_PATH,
    GradCAM,
    colorize_heatmap,
    get_gradcam_target_layer,
    get_preprocess_transform,
    load_solarai_model,
    run_prediction,
)


MODEL_PATH = Path(os.getenv("MODEL_PATH", DEFAULT_MODEL_PATH))
FAULT_CLASSES = {"Bird-drop", "Dusty", "Electrical-damage", "Physical-Damage", "Snow-Covered"}
app = FastAPI(title="Solar Panel Classifier")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

model: nn.Module | None = None
classes: list[str] = []
transform: transforms.Compose | None = None
device = torch.device("cpu")


def load_model() -> None:
    global model, classes, transform
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"Model checkpoint not found at {MODEL_PATH.resolve()}. Run train.py first.")
    model, classes, image_size, _checkpoint = load_solarai_model(MODEL_PATH, device=device)
    transform = get_preprocess_transform(image_size)


@app.on_event("startup")
def startup() -> None:
    load_model()


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok" if model else "not_ready", "classes": classes}


@app.post("/predict")
async def predict(image: UploadFile = File(...)) -> dict[str, object]:
    if model is None or transform is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image file")
    try:
        photo = Image.open(io.BytesIO(await image.read())).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=400, detail="Invalid image file") from error
    image_tensor = transform(photo).unsqueeze(0).to(device)
    class_index, confidence, probabilities = run_prediction(model, image_tensor)
    predictions = [
        {"class": label, "confidence": round(float(probabilities[index]), 6)}
        for index, label in enumerate(classes)
    ]
    predictions.sort(key=lambda entry: entry["confidence"], reverse=True)
    predicted_class = classes[class_index]
    result: dict[str, object] = {
        "class": predicted_class,
        "confidence": round(confidence, 6),
        "is_fault": predicted_class in FAULT_CLASSES,
        "all_classes": predictions,
    }

    try:
        target_layer = get_gradcam_target_layer(model)
        gradcam = GradCAM(model, target_layer)
        try:
            heatmap = gradcam.generate(image_tensor, class_index)
        finally:
            gradcam.close()
        result["gradcam_image"] = create_gradcam_data_url(photo, heatmap)
    except Exception as error:
        result["gradcam_image"] = None
        result["gradcam_error"] = f"Grad-CAM generation failed: {error}"

    return result


def create_gradcam_data_url(original_image: Image.Image, heatmap: torch.Tensor, alpha: float = 0.45) -> str:
    original_rgb = original_image.convert("RGB")
    original_array = np.asarray(original_rgb).astype(np.float32) / 255.0

    heatmap_image = Image.fromarray(np.uint8(heatmap.numpy() * 255), mode="L")
    heatmap_image = heatmap_image.resize(original_rgb.size, Image.Resampling.BILINEAR)
    heatmap_array = np.asarray(heatmap_image).astype(np.float32) / 255.0
    colored_heatmap = colorize_heatmap(heatmap_array)

    overlay = ((1.0 - alpha) * original_array) + (alpha * colored_heatmap)
    overlay_image = Image.fromarray(np.uint8(np.clip(overlay, 0.0, 1.0) * 255))

    buffer = io.BytesIO()
    overlay_image.save(buffer, format="JPEG", quality=90)
    encoded_heatmap = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded_heatmap}"
