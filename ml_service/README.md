# Solar-panel image classifier

This service trains on the six folders in `../Faulty_solar_panel` and exposes the `POST /predict` endpoint used by the React app.

Use Python **3.11 or 3.12**. The installed Python 3.14 in this workspace is newer than the broadly supported PyTorch releases, so create a compatible virtual environment first. From this directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python train.py --epochs 12
uvicorn app:app --host 0.0.0.0 --port 8000
```

The training command saves the best checkpoint to `models/solar_panel_classifier.pt`. It uses a stratified 80/20 validation split and weighted sampling to compensate for the smaller Electrical-damage, Physical-Damage, and Snow-Covered folders.

Then add this line to the root `.env` file and restart Vite:

```dotenv
VITE_MODEL_INFERENCE_URL=http://localhost:8000/predict
```

The response is compatible with the app’s existing model adapter:

```json
{"class":"Dusty","confidence":0.91,"is_fault":true}
```

`Clean` is treated as normal; every other supplied class is treated as a fault. Train/test accuracy is only a guide—the model may be less reliable on photos taken in lighting, angle, or panel types unlike the dataset.
