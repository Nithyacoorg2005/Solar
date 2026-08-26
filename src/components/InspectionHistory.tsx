import { useEffect, useState } from 'react';
import { Calendar, ImageOff } from 'lucide-react';
import { getInspectionHistory, formatDateTime } from '@/lib/inspectionApi';
import type { Inspection } from '@/types';
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
              <button
                key={insp.id}
                onClick={() => onSelectInspection(insp.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-ink-50/50 text-left transition-colors"
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
