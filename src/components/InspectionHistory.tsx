import { useEffect, useState } from 'react';
import { Calendar, Download, ImageOff } from 'lucide-react';
import { getInspectionHistory, formatDateTime } from '@/lib/inspectionApi';
import type { Inspection, WeatherSnapshot } from '@/types';
import { FaultBadge, StatusBadge, Spinner, EmptyState } from './StatusBadges';

interface InspectionHistoryProps {
  panelId: string;
  onSelectInspection: (id: string) => void;
  refreshKey: number;
}

export function InspectionHistory({ panelId, onSelectInspection, refreshKey }: InspectionHistoryProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getInspectionHistory(100, panelId);
        if (cancelled) return;
        setInspections(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [panelId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6 text-ink-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 py-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
        {error}
      </div>
    );
  }

  if (inspections.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-ink-200/60">
        <EmptyState title="No inspections recorded" description="Run an inspection to start building the history." />
      </div>
    );
  }

  const grouped = new Map<string, Inspection[]>();
  for (const insp of inspections) {
    const dateKey = new Date(insp.inspection_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(insp);
  }

  return (
    <div className="space-y-8">
      <div className="text-sm text-ink-500">
        {inspections.length} inspection{inspections.length !== 1 ? 's' : ''} recorded.
      </div>

      {[...grouped.entries()].map(([date, items]) => (
        <div key={date} className="animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Calendar size={14} className="text-ink-400" />
            <h3 className="text-sm font-medium text-ink-500">{date}</h3>
          </div>
          <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden divide-y divide-ink-50">
            {items.map((insp) => (
              <div
                key={insp.id}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-ink-50/50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onSelectInspection(insp.id)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  aria-label={`View inspection from ${formatDateTime(insp.inspection_at)}`}
                >
                  <div className="w-14 h-14 flex-shrink-0 bg-ink-100 rounded-xl overflow-hidden">
                    {insp.image_path ? (
                      <img src={insp.image_path} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff size={16} className="text-ink-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800">{insp.prediction ?? 'No prediction'}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {formatTimeShort(insp.inspection_at)} · {insp.trigger_type}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {insp.processing_status === 'completed' ? (
                      <FaultBadge isFault={insp.is_fault} />
                    ) : (
                      <StatusBadge status={insp.processing_status} />
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInspectionReport(insp)}
                  className="flex-shrink-0 p-2 text-ink-400 hover:text-ink-900 hover:bg-ink-100 rounded-lg transition-colors"
                  aria-label={`Generate report for inspection from ${formatDateTime(insp.inspection_at)}`}
                  title="Generate report"
                >
                  <Download size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function downloadInspectionReport(inspection: Inspection): void {
  const reportDate = formatDateTime(inspection.inspection_at);
  const gradcamImage = typeof inspection.raw_output?.gradcam_image === 'string'
    ? inspection.raw_output.gradcam_image
    : null;
  const weather = inspection.raw_output?.weather as WeatherSnapshot | undefined;
  const report = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solar Inspection Report - ${escapeHtml(reportDate)}</title>
  <style>
    body { font: 15px system-ui, sans-serif; color: #17202a; max-width: 900px; margin: 40px auto; padding: 0 24px; }
    h1 { margin-bottom: 4px; } h2 { margin-top: 32px; border-bottom: 1px solid #d8dee4; padding-bottom: 8px; }
    dl { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 8px 16px; }
    dt { color: #64707d; } dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    img { max-width: 100%; max-height: 520px; object-fit: contain; background: #111820; }
    @media print { body { margin: 0; } button { display: none; } }
  </style>
</head>
<body>
  <h1>Solar Inspection Report</h1>
  <p>${escapeHtml(reportDate)}</p>
  <h2>Inspection Data</h2>
  <dl>
    ${reportField('Inspection ID', inspection.id)}
    ${reportField('Panel / Site', inspection.panel_id)}
    ${reportField('Inspection time', reportDate)}
    ${reportField('Prediction', inspection.prediction ?? 'N/A')}
    ${reportField('Confidence', inspection.confidence == null ? 'N/A' : `${Math.round(inspection.confidence * 100)}%`)}
    ${reportField('Fault detected', inspection.is_fault ? 'Yes' : 'No')}
    ${reportField('Processing status', inspection.processing_status)}
    ${reportField('Notification status', inspection.notification_status)}
    ${reportField('Trigger type', inspection.trigger_type)}
    ${reportField('Error', inspection.error_message ?? 'None')}
    ${reportField('Created at', inspection.created_at)}
  </dl>
  <h2>Weather Conditions</h2>
  ${weather ? `<dl>
    ${weatherField('Captured at', weather.captured_at)}
    ${weatherField('GPS location', weather.error ? weather.error : `${weather.latitude.toFixed(4)}, ${weather.longitude.toFixed(4)}`)}
    ${weatherField('Temperature', formatWeatherValue(weather.temperature_c, ' C'))}
    ${weatherField('Humidity', formatWeatherValue(weather.humidity_pct, '%'))}
    ${weatherField('Wind speed', formatWeatherValue(weather.wind_speed_kmh, ' km/h'))}
    ${weatherField('Wind gusts', formatWeatherValue(weather.wind_gusts_kmh, ' km/h'))}
    ${weatherField('Cloud cover', formatWeatherValue(weather.cloud_cover_pct, '%'))}
    ${weatherField('Current precipitation', formatWeatherValue(weather.precipitation_mm, ' mm'))}
    ${weatherField('Rain', formatWeatherValue(weather.rain_mm, ' mm'))}
    ${weatherField('Showers', formatWeatherValue(weather.showers_mm, ' mm'))}
    ${weatherField('Next 24-hour rain', formatWeatherValue(weather.forecast_24h_precipitation_mm, ' mm'))}
    ${weatherField('24-hour rain probability', formatWeatherValue(weather.forecast_24h_precipitation_probability_max_pct, '%'))}
    ${weatherField('Weather source', weather.source)}
  </dl>` : '<p>No weather data was recorded for this inspection.</p>'}
  <h2>Inspection Image</h2>
  ${inspection.image_path ? `<img src="${escapeHtml(inspection.image_path)}" alt="Inspected solar panel">` : '<p>No image available.</p>'}
  ${gradcamImage ? `<h2>AI Explainability (Grad-CAM)</h2><img src="${escapeHtml(gradcamImage)}" alt="Grad-CAM heatmap">` : ''}
</body>
</html>`;

  const blob = new Blob([report], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `solar-inspection-${inspection.id}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function reportField(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function weatherField(label: string, value: string): string {
  return reportField(label, value);
}

function formatWeatherValue(value: number | null | undefined, unit: string): string {
  return value == null ? 'N/A' : `${value}${unit}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
