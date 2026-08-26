# Solar Panel Fault Detection

A React web application for capturing solar-panel photos, classifying their condition with an AI model, recording inspections, and notifying users when a fault is found.

## Features

- Capture a photo with a device camera or upload an existing image
- Classify the panel as `Clean`, `Bird-drop`, `Dusty`, `Electrical-damage`, `Physical-Damage`, or `Snow-Covered`
- Store inspection history, confidence, status, and schedules in Supabase
- Authenticate users with Supabase email/password authentication
- Send browser notifications when a fault is detected

## Tech stack

- React, TypeScript, Vite, and Tailwind CSS
- Supabase (PostgreSQL and Auth)
- PyTorch, FastAPI, and Uvicorn for model training and inference

## Frontend setup

```powershell
npm install
npm run dev
```

Create a `.env` file in the project root with your Supabase values:

```dotenv
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_MODEL_INFERENCE_URL=http://localhost:8000/predict
```

Apply the SQL migrations in `supabase/migrations/` to your Supabase project before using the application.

## Train and run the AI model

The local `Faulty_solar_panel/` dataset is intentionally excluded from Git. It must contain one folder per class:

```text
Faulty_solar_panel/
├── Bird-drop/
├── Clean/
├── Dusty/
├── Electrical-damage/
├── Physical-Damage/
└── Snow-Covered/
```

Install Python **3.11 or 3.12**, then run:

```powershell
cd ml_service
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python train.py --epochs 12
uvicorn app:app --host 0.0.0.0 --port 8000
```

The model is saved to `ml_service/models/solar_panel_classifier.pt`. Keep the inference service running while using the camera inspection feature.

`Clean` is handled as normal. Every other class is treated as a fault and can trigger a notification.

## Available scripts

```powershell
npm run dev        # Start the Vite development server
npm run build      # Create a production build
npm run typecheck  # Check TypeScript types
npm run lint       # Run ESLint
```
