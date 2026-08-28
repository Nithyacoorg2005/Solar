import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Clock, ImageOff, Cpu, Bell, MapPin, AlertCircle, CloudSun, Droplets, Wind, ScanSearch, Play } from 'lucide-react';
import { getInspectionById, formatDateTime, formatDate, formatTime, runInspection } from '@/lib/inspectionApi';
import { ensureNotificationPermission, sendFaultNotification } from '@/lib/notificationService';
import type { CleaningDecision, Inspection, WeatherSnapshot } from '@/types';
import { FaultBadge, StatusBadge, NotificationBadge, ConfidenceBar, Spinner } from './StatusBadges';

interface InspectionDetailsProps {
  inspectionId: string;
  onBack: () => void;
}

export function InspectionDetails({ inspectionId, onBack }: InspectionDetailsProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getInspectionById(inspectionId);
        if (cancelled) return;
        setInspection(data);
        if (!data) setError('Inspection not found.');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load inspection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [inspectionId]);

  const runSavedInspection = async () => {
    if (!inspection?.image_path || running) return;
    setRunning(true);
    setError(null);
    try {
      const imageBlob = await (await fetch(inspection.image_path)).blob();
      await ensureNotificationPermission();
      const updated = await runInspection(inspection.panel_id, imageBlob, inspection.trigger_type, inspection.id);
      if (updated.is_fault && updated.processing_status === 'completed') {
        await sendFaultNotification(updated);
      }
      setInspection(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run inspection.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6 text-ink-300" />
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 transition-colors">
          <ArrowLeft size={16} /> Back to History
        </button>
        <div className="px-5 py-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
          {error ?? 'Inspection not found.'}
        </div>
      </div>
    );
  }

  const rawClasses = inspection.raw_output?.all_classes as { class: string; confidence: number }[] | undefined;
  const weather = inspection.raw_output?.weather as WeatherSnapshot | undefined;
  const cleaningDecision = inspection.raw_output?.cleaning_decision as CleaningDecision | undefined;
  const gradcamImage = inspection.raw_output?.gradcam_image as string | undefined;
  const gradcamError = inspection.raw_output?.gradcam_error as string | undefined;

  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Inspection Details</h2>
          <p className="text-sm text-ink-400 mt-1">{formatDateTime(inspection.inspection_at)}</p>
        </div>
        <FaultBadge isFault={inspection.is_fault} />
      </div>

      {inspection.processing_status === 'pending' && (
        <button
          type="button"
          onClick={runSavedInspection}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={16} /> {running ? 'Running Inspection...' : 'Run Inspection'}
        </button>
      )}

      {/* Image */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-ink-400">Original Image</p>
        <div className="bg-ink-950 rounded-2xl overflow-hidden">
          {inspection.image_path ? (
            <img src={inspection.image_path} alt="Inspected solar panel" className="w-full object-contain max-h-[500px]" />
          ) : (
            <div className="w-full h-64 flex items-center justify-center">
              <ImageOff size={32} className="text-ink-600" />
            </div>
          )}
        </div>
      </div>

      {(gradcamImage || gradcamError) && (
        <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-100">
            <h3 className="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
              <ScanSearch size={14} /> AI Explainability - Grad-CAM
            </h3>
          </div>
          {gradcamImage ? (
            <div className="bg-ink-950">
              <img src={gradcamImage} alt="Grad-CAM heatmap for inspected solar panel" className="w-full object-contain max-h-[500px]" />
            </div>
          ) : (
            <div className="px-6 py-5 text-sm text-amber-700 bg-amber-50">
              {gradcamError ?? 'Grad-CAM heatmap could not be generated for this image.'}
            </div>
          )}
          {gradcamImage && gradcamError && (
            <p className="px-6 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">{gradcamError}</p>
          )}
        </div>
      )}

      {/* Details grid */}
      <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-ink-200/60">
          <DetailCell icon={<MapPin size={14} />} label="Panel / Site" value={inspection.panel_id} />
          <DetailCell icon={<Calendar size={14} />} label="Date" value={formatDate(inspection.inspection_at)} />
          <DetailCell icon={<Clock size={14} />} label="Time" value={formatTime(inspection.inspection_at)} />
          <DetailCell icon={<Cpu size={14} />} label="AI Prediction" value={inspection.prediction ?? 'N/A'} />
        </div>
        <div className="px-6 py-5 border-t border-ink-100">
          <p className="text-xs text-ink-400 mb-2 flex items-center gap-1.5"><Cpu size={14} /> Confidence Score</p>
          <ConfidenceBar confidence={inspection.confidence} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink-200/60 border-t border-ink-100">
          <div className="bg-white px-6 py-5">
            <p className="text-xs text-ink-400 mb-1.5">Processing Status</p>
            <StatusBadge status={inspection.processing_status} />
          </div>
          <div className="bg-white px-6 py-5">
            <p className="text-xs text-ink-400 mb-1.5 flex items-center gap-1.5"><Bell size={12} /> Notification</p>
            <NotificationBadge status={inspection.notification_status} />
          </div>
          <div className="bg-white px-6 py-5">
            <p className="text-xs text-ink-400 mb-1">Trigger Type</p>
            <p className="text-sm text-ink-700 capitalize">{inspection.trigger_type}</p>
          </div>
        </div>
      </div>

      {/* Error message */}
      {inspection.error_message && (
        <div className="px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <p className="font-medium mb-1 flex items-center gap-2"><AlertCircle size={14} /> Error</p>
          {inspection.error_message}
        </div>
      )}

      {(weather || cleaningDecision) && (
        <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-100">
            <h3 className="text-sm font-semibold text-ink-700">Weather and Cleaning Decision</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-ink-200/60">
            {weather && (
              <>
                <DetailCell
                  icon={<CloudSun size={14} />}
                  label="GPS Location"
                  value={
                    weather.error
                      ? weather.error
                      : `${weather.latitude.toFixed(4)}, ${weather.longitude.toFixed(4)}`
                  }
                />
                <DetailCell
                  icon={<CloudSun size={14} />}
                  label="Current Weather"
                  value={
                    weather.error
                      ? weather.error
                      : `${formatWeatherValue(weather.temperature_c, 'C')} | humidity ${formatWeatherValue(weather.humidity_pct, '%')}`
                  }
                />
                <DetailCell
                  icon={<Wind size={14} />}
                  label="Wind / Clouds"
                  value={`${formatWeatherValue(weather.wind_speed_kmh, ' km/h')} | clouds ${formatWeatherValue(weather.cloud_cover_pct, '%')}`}
                />
                <DetailCell
                  icon={<Droplets size={14} />}
                  label="Rain Now"
                  value={`${formatWeatherValue(weather.precipitation_mm, ' mm')} current precipitation`}
                />
                <DetailCell
                  icon={<Droplets size={14} />}
                  label="Next 24 Hours"
                  value={`${formatWeatherValue(weather.forecast_24h_precipitation_mm, ' mm')} rain | ${formatWeatherValue(weather.forecast_24h_precipitation_probability_max_pct, '%')} max chance`}
                />
              </>
            )}
            {cleaningDecision && (
              <div className="bg-white px-6 py-5 sm:col-span-2">
                <p className="text-xs text-ink-400 mb-1 flex items-center gap-1.5">
                  <Droplets size={14} /> Cleaning Decision
                </p>
                <p className="text-sm font-semibold text-ink-800">{cleaningDecision.label}</p>
                <p className="text-sm text-ink-600 mt-1">{cleaningDecision.reason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All classes */}
      {rawClasses && rawClasses.length > 0 && (
        <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-100">
            <h3 className="text-sm font-semibold text-ink-700">Model Output — All Classes</h3>
          </div>
          <div className="p-6 space-y-3">
            {rawClasses.map((c) => (
              <div key={c.class} className="flex items-center gap-4">
                <span className="text-sm text-ink-600 w-32 flex-shrink-0">{c.class}</span>
                <div className="flex-1"><ConfidenceBar confidence={c.confidence} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON */}
      {inspection.raw_output && (
        <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-100">
            <h3 className="text-sm font-semibold text-ink-700">Raw Model Response</h3>
          </div>
          <pre className="p-6 text-xs font-mono text-ink-600 overflow-x-auto scrollbar-thin bg-ink-50/50">
            {JSON.stringify(inspection.raw_output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white px-6 py-5">
      <p className="text-xs text-ink-400 mb-1 flex items-center gap-1.5">{icon} {label}</p>
      <div className="text-sm text-ink-800">{value}</div>
    </div>
  );
}

function formatWeatherValue(value: number | null | undefined, unit: string): string {
  return value == null ? 'N/A' : `${value}${unit}`;
}
