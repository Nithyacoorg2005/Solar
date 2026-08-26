import { useEffect, useState } from 'react';
import { Clock, ImageOff, Calendar, TrendingUp, CheckCircle2, AlertTriangle, Bell } from 'lucide-react';
import { getDashboardStats, getInspectionHistory, formatDateTime } from '@/lib/inspectionApi';
import { getNotificationPermission } from '@/lib/notificationService';
import type { Inspection, DashboardStats } from '@/types';
import { FaultBadge, StatusBadge, ConfidenceBar, Spinner, EmptyState } from './StatusBadges';

interface DashboardProps {
  panelId: string;
  onSelectInspection: (id: string) => void;
  refreshKey: number;
}

export function Dashboard({ panelId, onSelectInspection, refreshKey }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifPerm] = useState(getNotificationPermission());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [s, h] = await Promise.all([
          getDashboardStats(panelId),
          getInspectionHistory(10, panelId),
        ]);
        if (cancelled) return;
        setStats(s);
        setHistory(h);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
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
      <div className="px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
        {error}
      </div>
    );
  }

  const latest = stats?.latest;
  const isUnderInspection = latest?.processing_status === 'processing' || latest?.processing_status === 'pending';

  return (
    <div className="space-y-8">
      {/* Current Status — Hero Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Status card */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-100">
            <h3 className="text-sm font-semibold text-ink-700">Current Panel Status</h3>
          </div>
          <div className="p-6">
            {!latest && (
              <EmptyState title="No inspections yet" description="Run your first inspection to see the panel status here." />
            )}
            {latest && (
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Image */}
                <div className="flex-shrink-0">
                  {latest.image_path ? (
                    <img
                      src={latest.image_path}
                      alt="Latest inspection"
                      className="w-full sm:w-48 h-48 object-cover rounded-xl border border-ink-200"
                    />
                  ) : (
                    <div className="w-full sm:w-48 h-48 flex items-center justify-center bg-ink-50 rounded-xl border border-ink-200">
                      <ImageOff size={24} className="text-ink-300" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-4">
                  <div>
                    {isUnderInspection ? (
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Under Inspection
                      </span>
                    ) : latest.processing_status === 'failed' ? (
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                        <AlertTriangle size={16} /> Inspection Failed
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <FaultBadge isFault={latest.is_fault} />
                        <p className="text-lg font-semibold text-ink-900">{latest.prediction ?? 'No prediction'}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <p className="text-xs text-ink-400 mb-1 flex items-center gap-1.5">
                        <Clock size={12} /> Last Inspected
                      </p>
                      <p className="text-sm text-ink-700">{formatDateTime(latest.inspection_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-400 mb-1.5">Confidence Score</p>
                      <ConfidenceBar confidence={latest.confidence} />
                    </div>
                    <div>
                      <p className="text-xs text-ink-400 mb-1">Processing Status</p>
                      <StatusBadge status={latest.processing_status} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats column */}
        <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-4">
          <StatTile
            icon={<TrendingUp size={16} />}
            label="Total Inspections"
            value={stats?.total ?? 0}
          />
          <StatTile
            icon={<CheckCircle2 size={16} />}
            label="Normal"
            value={stats?.normal ?? 0}
            accent="green"
          />
          <StatTile
            icon={<AlertTriangle size={16} />}
            label="Fault Detections"
            value={stats?.faults ?? 0}
            accent="red"
          />
          <StatTile
            icon={<Bell size={16} />}
            label="Notifications"
            value={
              notifPerm === 'granted' ? 'On' :
              notifPerm === 'denied' ? 'Blocked' :
              notifPerm === 'unsupported' ? 'N/A' : 'Off'
            }
            accent={notifPerm === 'granted' ? 'green' : 'neutral'}
          />
        </div>
      </div>

      {/* Recent Inspections */}
      <div className="bg-white rounded-2xl border border-ink-200/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-700 flex items-center gap-2">
            <Calendar size={15} /> Recent Inspections
          </h3>
        </div>
        {history.length === 0 ? (
          <EmptyState title="No inspection history" description="Inspections will appear here once you run them." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400">
                  <th className="text-left font-medium px-6 py-2.5">Date & Time</th>
                  <th className="text-left font-medium px-6 py-2.5 hidden sm:table-cell">Prediction</th>
                  <th className="text-left font-medium px-6 py-2.5">Status</th>
                  <th className="text-left font-medium px-6 py-2.5 hidden md:table-cell">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {history.map((insp) => (
                  <tr
                    key={insp.id}
                    onClick={() => onSelectInspection(insp.id)}
                    className="cursor-pointer hover:bg-ink-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5 text-ink-600 whitespace-nowrap">{formatDateTime(insp.inspection_at)}</td>
                    <td className="px-6 py-3.5 text-ink-600 hidden sm:table-cell">{insp.prediction ?? '—'}</td>
                    <td className="px-6 py-3.5">
                      {insp.processing_status === 'completed' ? (
                        <FaultBadge isFault={insp.is_fault} />
                      ) : (
                        <StatusBadge status={insp.processing_status} />
                      )}
                    </td>
                    <td className="px-6 py-3.5 hidden md:table-cell">
                      {insp.confidence != null ? (
                        <span className="text-xs font-mono text-ink-600 tabular-nums">{(insp.confidence * 100).toFixed(1)}%</span>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: 'neutral' | 'green' | 'red';
}) {
  const valueColors = {
    neutral: 'text-ink-900',
    green: 'text-green-700',
    red: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-ink-200/60 p-5">
      <div className="flex items-center gap-2 text-ink-400 mb-3">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-semibold tracking-tight tabular-nums ${valueColors[accent]}`}>{value}</p>
    </div>
  );
}
