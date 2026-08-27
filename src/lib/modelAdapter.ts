import type { ModelPrediction, WeatherSnapshot } from '@/types';

/**
 * Model Adapter Interface
 * -----------------------
 * This is the single integration point between the application and the trained
 * solar panel fault detection model. The frontend never knows how the model is
 * implemented — it only calls this function.
 *
 * To connect the real model:
 *   1. Deploy an inference service that loads your trained model file
 *      (e.g. a FastAPI server loading a .h5/.pt/.onnx model).
 *   2. Set the VITE_MODEL_INFERENCE_URL env var to that service's /predict URL.
 *   3. The adapter below will POST the image and return the prediction.
 *
 * Until the inference service is connected, the adapter returns a clear status
 * indicating the model is not yet available — it does NOT fabricate predictions.
 */

export interface ModelAdapterConfig {
  inferenceUrl: string | undefined;
}

const MODEL_NOT_CONNECTED_ERROR = 'Model inference service is not connected. Set VITE_MODEL_INFERENCE_URL to enable AI predictions.';

/**
 * Send an image to the model inference service and return the prediction.
 *
 * @param imageBlob - The captured/uploaded image as a Blob.
 * @returns ModelPrediction with class, confidence, and is_fault flag.
 */
export async function runInference(imageBlob: Blob, weather?: WeatherSnapshot | null): Promise<ModelPrediction> {
  const inferenceUrl = import.meta.env.VITE_MODEL_INFERENCE_URL;

  if (!inferenceUrl) {
    throw new Error(MODEL_NOT_CONNECTED_ERROR);
  }

  const formData = new FormData();
  formData.append('image', imageBlob, 'solar-panel.jpg');
  if (weather && !weather.error) {
    formData.append('weather', JSON.stringify(weather));
  }

  let response: Response;
  try {
    response = await fetch(inferenceUrl, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    throw new Error(`Cannot reach model inference service at ${inferenceUrl}. ${err instanceof Error ? err.message : 'Network error.'}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Model inference failed (HTTP ${response.status}). ${body}`);
  }

  const data = await response.json().catch(() => {
    throw new Error('Model inference service returned invalid JSON.');
  });

  return normalizePrediction(data);
}

/**
 * Normalize the raw model response into the application's ModelPrediction type.
 *
 * This handles common response shapes:
 *   - { class: "Healthy", confidence: 0.98, is_fault: false }
 *   - { prediction: "Crack", confidence: 0.87 }
 *   - { class_index: 2, classes: ["Healthy","Crack","Hotspot"], probabilities: [0.1,0.8,0.1] }
 *
 * Adjust this function to match your model's actual output format.
 */
function normalizePrediction(raw: unknown): ModelPrediction {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Model returned an empty or invalid response.');
  }

  const data = raw as Record<string, unknown>;

  // Shape 1: { class, confidence, is_fault }
  if (typeof data.class === 'string') {
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
    const isFault = typeof data.is_fault === 'boolean'
      ? data.is_fault
      : data.class.toLowerCase() !== 'healthy' && data.class.toLowerCase() !== 'normal';
    return { class: data.class, confidence, is_fault: isFault };
  }

  // Shape 2: { prediction, confidence }
  if (typeof data.prediction === 'string') {
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
    const isFault = data.prediction.toLowerCase() !== 'healthy' && data.prediction.toLowerCase() !== 'normal';
    return { class: data.prediction, confidence, is_fault: isFault };
  }

  // Shape 3: { class_index, classes, probabilities }
  if (typeof data.class_index === 'number' && Array.isArray(data.classes)) {
    const classes = data.classes as string[];
    const probs = Array.isArray(data.probabilities) ? (data.probabilities as number[]) : [];
    const cls = classes[data.class_index] ?? 'Unknown';
    const confidence = probs[data.class_index] ?? 0;
    const isFault = cls.toLowerCase() !== 'healthy' && cls.toLowerCase() !== 'normal';
    const all_classes = classes.map((c, i) => ({ class: c, confidence: probs[i] ?? 0 }));
    return { class: cls, confidence, is_fault: isFault, all_classes };
  }

  throw new Error('Model response did not match any expected format. Update normalizePrediction() to match your model output.');
}

export function isModelConnected(): boolean {
  return Boolean(import.meta.env.VITE_MODEL_INFERENCE_URL);
}
