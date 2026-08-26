import { useEffect, useState } from 'react';
import { Calendar, Clock, Camera, Save, Check } from 'lucide-react';
import { getSchedule, upsertSchedule, DAY_NAMES, DAY_FULL_NAMES } from '@/lib/inspectionApi';
import type { InspectionSchedule } from '@/types';
import { Spinner } from './StatusBadges';

interface ScheduleSettingsProps {
  panelId: string;
}

export function ScheduleSettings({ panelId }: ScheduleSettingsProps) {
  const [schedule, setSchedule] = useState<InspectionSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [days, setDays] = useState<number[]>([1, 4]);
  const [time, setTime] = useState('09:00');
  const [camera, setCamera] = useState('phone');
  const [panel, setPanel] = useState(panelId);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getSchedule(panelId);
        if (cancelled) return;
        if (data) {
          setSchedule(data);
          setDays(data.days_of_week);
          setTime(data.inspection_time);
          setCamera(data.camera_device);
          setPanel(data.panel_id);
          setActive(data.is_active);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load schedule.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [panelId]);

  const toggleDay = (day: number) => {
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await upsertSchedule({
        id: schedule?.id,
        panel_id: panel,
        days_of_week: days,
        inspection_time: time,
        camera_device: camera,
        is_active: active,
      });
      setSchedule(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6 text-ink-300" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div className="px-5 py-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-ink-200/60 p-6 space-y-6">
        {/* Panel ID */}
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-2">Panel / Site Identifier</label>
          <input
            type="text"
            value={panel}
            onChange={(e) => setPanel(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-colors"
            placeholder="e.g. Panel-A1, Rooftop-1"
          />
          <p className="mt-1.5 text-xs text-ink-400">The solar panel or site being monitored.</p>
        </div>

        {/* Days */}
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-2">
            <Calendar size={14} className="inline mr-1.5 -mt-0.5" /> Inspection Days
          </label>
          <p className="text-xs text-ink-400 mb-3">Select the days of the week for automatic inspection.</p>
          <div className="grid grid-cols-7 gap-2">
            {DAY_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`py-2.5 text-xs font-medium rounded-xl border transition-all ${
                  days.includes(i)
                    ? 'bg-ink-900 text-white border-ink-900 scale-100'
                    : 'bg-white text-ink-500 border-ink-200 hover:border-ink-400 hover:scale-105'
                }`}
                title={DAY_FULL_NAMES[i]}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-400">
            {days.length === 0
              ? 'No days selected — schedule is inactive.'
              : `Inspection runs ${days.length}x per week on ${days.map((d) => DAY_FULL_NAMES[d]).join(', ')}.`}
          </p>
        </div>

        {/* Time */}
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-2">
            <Clock size={14} className="inline mr-1.5 -mt-0.5" /> Inspection Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="px-4 py-2.5 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-colors"
          />
        </div>

        {/* Camera */}
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-2">
            <Camera size={14} className="inline mr-1.5 -mt-0.5" /> Camera / Device
          </label>
          <input
            type="text"
            value={camera}
            onChange={(e) => setCamera(e.target.value)}
            className="w-full px-4 py-2.5 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-colors"
            placeholder="e.g. phone, ip-camera-01"
          />
        </div>

        {/* Active toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="text-sm font-medium text-ink-700">Schedule Active</label>
            <p className="text-xs text-ink-400 mt-0.5">When enabled, inspections run automatically on schedule.</p>
          </div>
          <button
            onClick={() => setActive(!active)}
            className={`relative w-12 h-6.5 rounded-full transition-colors ${active ? 'bg-ink-900' : 'bg-ink-300'}`}
            style={{ width: '48px', height: '26px' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${active ? 'translate-x-[22px]' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || days.length === 0 || !panel}
          className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {saving ? <Spinner className="w-4 h-4" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Schedule'}
        </button>
        {days.length === 0 && <span className="text-xs text-amber-600">Select at least one day.</span>}
      </div>

      {/* Info note */}
      <div className="px-5 py-4 bg-ink-50 border border-ink-200 rounded-xl text-xs text-ink-500 leading-relaxed">
        <strong className="text-ink-600">Note:</strong> The browser-based scheduler checks the configured days and time
        when the dashboard is open. For 24/7 scheduled inspections independent of the browser, a server-side cron job
        calling the inspection API is needed. Manual inspections always work regardless of this schedule.
      </div>
    </div>
  );
}
