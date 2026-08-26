"""HTTP inference service consumed by the Vite frontend."""

from __future__ import annotations

import io
import os
from pathlib import Path

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from torch import nn
from torchvision import models, transforms


MODEL_PATH = Path(os.getenv("MODEL_PATH", "models/solar_panel_classifier.pt"))
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


def load_model() -> None:
    global model, classes, transform
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"Model checkpoint not found at {MODEL_PATH.resolve()}. Run train.py first.")
    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
    classes = checkpoint["classes"]
    image_size = checkpoint.get("image_size", 224)
    network = models.resnet18(weights=None)
    network.fc = nn.Linear(network.fc.in_features, len(classes))
    network.load_state_dict(checkpoint["model_state"])
    network.eval()
    model = network
    transform = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


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
    with torch.inference_mode():
        probabilities = torch.softmax(model(transform(photo).unsqueeze(0)), dim=1)[0]
    predictions = [
        {"class": label, "confidence": round(float(probabilities[index]), 6)}
        for index, label in enumerate(classes)
    ]
    predictions.sort(key=lambda entry: entry["confidence"], reverse=True)
    top = predictions[0]
    return {
        "class": top["class"],
        "confidence": top["confidence"],
        "is_fault": top["class"] in FAULT_CLASSES,
        "all_classes": predictions,
    }
