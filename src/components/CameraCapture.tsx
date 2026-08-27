import { useEffect, useState, useRef, useCallback } from 'react';
import { Camera, RefreshCw, Upload, CheckCircle2, AlertCircle, X, Loader2, CloudSun, Droplets } from 'lucide-react';
import { runInspection } from '@/lib/inspectionApi';
import { ensureNotificationPermission, sendFaultNotification } from '@/lib/notificationService';
import { isModelConnected } from '@/lib/modelAdapter';
import type { CleaningDecision, Inspection, WeatherSnapshot } from '@/types';
import { ErrorBanner, FaultBadge, ConfidenceBar } from './StatusBadges';

type CapturePhase = 'idle' | 'preview' | 'processing' | 'success' | 'error';

interface CameraCaptureProps {
  panelId: string;
  onInspectionComplete: (inspection: Inspection) => void;
}

export function CameraCapture({ panelId, onInspectionComplete }: CameraCaptureProps) {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Inspection | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelConnected = isModelConnected();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to access camera.';
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowed')) {
        setCameraError('Camera permission denied. Use the upload option below to select an image instead.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFoundError')) {
        setCameraError('No camera detected on this device. Use the upload option below.');
      } else {
        setCameraError(`Camera unavailable: ${msg}. You can upload an image instead.`);
      }
    }
  }, [facingMode]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setImageBlob(blob);
      setImageDataUrl(canvas.toDataURL('image/jpeg', 0.85));
      stopCamera();
      setPhase('preview');
    }, 'image/jpeg', 0.85);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImageBlob(file);
      setPhase('preview');
      setError(null);
    };
    reader.onerror = () => setError('Failed to read the selected image.');
    reader.readAsDataURL(file);
  };

  const resetCapture = () => {
    setImageDataUrl(null);
    setImageBlob(null);
    setResult(null);
    setError(null);
    setPhase('idle');
  };

  const runInspectionPipeline = async () => {
    if (!imageBlob) return;
    setPhase('processing');
    setError(null);
    await ensureNotificationPermission();

    try {
      const inspection = await runInspection(panelId, imageBlob, 'manual');
      if (inspection.is_fault && inspection.processing_status === 'completed') {
        await sendFaultNotification(inspection);
      }
      setResult(inspection);
      setPhase('success');
      onInspectionComplete(inspection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection failed unexpectedly.');
      setPhase('error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {!modelConnected && phase === 'idle' && (
        <div className="mb-6 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 animate-fade-in">
          <strong className="font-semibold">Model not connected.</strong> The AI inference service URL is not configured.
          You can still capture and store images, but predictions will be marked as failed until
          <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded font-mono text-xs">VITE_MODEL_INFERENCE_URL</code>
          is set in the environment.
        </div>
      )}

      {error && <div className="mb-6"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* IDLE */}
      {phase === 'idle' && (
        <div className="space-y-4 animate-fade-in">
          {cameraError && (
            <div className="px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              {cameraError}
            </div>
          )}

          {cameraActive && (
            <div className="relative bg-ink-950 rounded-2xl overflow-hidden animate-scale-in">
              <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
              <div className="absolute inset-0 pointer-events-none border-2 border-white/20 m-4 rounded-xl" />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                <button
                  onClick={captureFromCamera}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-ink-900 text-sm font-medium rounded-xl hover:bg-ink-100 transition-colors"
                >
                  <Camera size={16} /> Capture
                </button>
                <button
                  onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white/90 text-ink-900 text-sm rounded-xl hover:bg-white transition-colors"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={stopCamera}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white/90 text-ink-900 text-sm rounded-xl hover:bg-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {!cameraActive && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="group flex flex-col items-center gap-3 py-12 border-2 border-ink-200 rounded-2xl hover:border-ink-900 hover:bg-ink-50 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-ink-100 group-hover:bg-ink-900 flex items-center justify-center transition-colors">
                  <Camera size={22} className="text-ink-600 group-hover:text-white transition-colors" />
                </div>
                <span className="text-sm font-medium text-ink-700">Use Phone Camera</span>
                <span className="text-xs text-ink-400">Live capture</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center gap-3 py-12 border-2 border-ink-200 rounded-2xl hover:border-ink-900 hover:bg-ink-50 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-ink-100 group-hover:bg-ink-900 flex items-center justify-center transition-colors">
                  <Upload size={22} className="text-ink-600 group-hover:text-white transition-colors" />
                </div>
                <span className="text-sm font-medium text-ink-700">Upload Image</span>
                <span className="text-xs text-ink-400">Select from device</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
            </div>
          )}
        </div>
      )}

      {/* PREVIEW */}
      {phase === 'preview' && imageDataUrl && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-ink-950 rounded-2xl overflow-hidden">
            <img src={imageDataUrl} alt="Captured solar panel" className="w-full object-contain max-h-[450px]" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-500">
              Panel: <span className="font-medium text-ink-700">{panelId}</span>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={resetCapture}
                className="px-4 py-2.5 text-sm font-medium text-ink-600 border border-ink-200 rounded-xl hover:bg-ink-50 transition-colors"
              >
                Retake
              </button>
              <button
                onClick={runInspectionPipeline}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <CheckCircle2 size={16} /> Run Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-ink-400" />
            </div>
          </div>
          <p className="mt-6 text-sm font-medium text-ink-700">Running AI inspection</p>
          <p className="mt-1.5 text-xs text-ink-400">GPS weather check, model analysis, and cleaning decision</p>
        </div>
      )}

      {/* SUCCESS */}
      {phase === 'success' && result && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="flex items-center gap-2.5">
            {result.processing_status === 'completed' ? (
              <CheckCircle2 size={22} className="text-green-600" />
            ) : (
              <AlertCircle size={22} className="text-red-600" />
            )}
            <h3 className="text-lg font-semibold text-ink-900">
              {result.processing_status === 'completed' ? 'Inspection Complete' : 'Inspection Failed'}
            </h3>
          </div>

          {imageDataUrl && (
            <div className="bg-ink-950 rounded-2xl overflow-hidden">
              <img src={imageDataUrl} alt="Inspected solar panel" className="w-full object-contain max-h-[350px]" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-px bg-ink-200/60 rounded-2xl overflow-hidden border border-ink-200/60">
            <div className="bg-white p-5">
              <p className="text-xs text-ink-400 mb-1">Panel</p>
              <p className="text-sm font-medium text-ink-800">{result.panel_id}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-xs text-ink-400 mb-1.5">Status</p>
              <FaultBadge isFault={result.is_fault} />
            </div>
            <div className="bg-white p-5">
              <p className="text-xs text-ink-400 mb-1">Prediction</p>
              <p className="text-sm font-medium text-ink-800">{result.prediction ?? 'N/A'}</p>
            </div>
            <div className="bg-white p-5">
              <p className="text-xs text-ink-400 mb-1.5">Confidence</p>
              <ConfidenceBar confidence={result.confidence} />
            </div>
          </div>

          {result.error_message && (
            <div className="px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {result.error_message}
            </div>
          )}

          <InspectionContext result={result} />

          <button
            onClick={resetCapture}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Camera size={16} /> New Inspection
          </button>
        </div>
      )}

      {/* ERROR */}
      {phase === 'error' && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <AlertCircle size={32} className="text-red-500" />
          <p className="mt-4 text-sm font-medium text-ink-700">Inspection failed</p>
          <button
            onClick={() => setPhase('preview')}
            className="mt-5 px-4 py-2.5 text-sm font-medium text-ink-600 border border-ink-200 rounded-xl hover:bg-ink-50 transition-colors"
          >
            Back to Preview
          </button>
        </div>
      )}
    </div>
  );
}

function InspectionContext({ result }: { result: Inspection }) {
  const weather = result.raw_output?.weather as WeatherSnapshot | undefined;
  const cleaningDecision = result.raw_output?.cleaning_decision as CleaningDecision | undefined;

  if (!weather && !cleaningDecision) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {weather && (
        <div className="bg-white border border-ink-200/60 rounded-xl p-4">
          <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5">
            <CloudSun size={13} /> Weather
          </p>
          {weather.error ? (
            <p className="text-sm text-amber-700">{weather.error}</p>
          ) : (
            <p className="text-sm text-ink-700">
              {formatWeatherValue(weather.temperature_c, 'C')} | rain {formatWeatherValue(weather.forecast_24h_precipitation_mm, 'mm')}
            </p>
          )}
          {!weather.error && (
            <p className="text-xs text-ink-400 mt-1">
              GPS {weather.latitude.toFixed(4)}, {weather.longitude.toFixed(4)}
            </p>
          )}
        </div>
      )}

      {cleaningDecision && (
        <div className="bg-white border border-ink-200/60 rounded-xl p-4">
          <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5">
            <Droplets size={13} /> Cleaning Decision
          </p>
          <p className="text-sm font-medium text-ink-800">{cleaningDecision.label}</p>
          <p className="text-xs text-ink-500 mt-1">{cleaningDecision.reason}</p>
        </div>
      )}
    </div>
  );
}

function formatWeatherValue(value: number | null | undefined, unit: string): string {
  return value == null ? 'N/A' : `${value}${unit}`;
}
