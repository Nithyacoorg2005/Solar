import type { ProcessingStatus, NotificationStatus } from '@/types';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-ink-500', dot: 'bg-ink-300' },
  processing: { label: 'Under Inspection', color: 'text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', color: 'text-ink-500', dot: 'bg-ink-300' },
  failed: { label: 'Failed', color: 'text-red-600', dot: 'bg-red-500' },
} as const;

const NOTIF_CONFIG = {
  not_required: { label: 'Not Required', color: 'text-ink-400' },
  sent: { label: 'Sent', color: 'text-green-700' },
  failed: { label: 'Failed', color: 'text-red-600' },
  skipped: { label: 'Skipped', color: 'text-ink-400' },
} as const;

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'processing' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

export function NotificationBadge({ status }: { status: NotificationStatus }) {
  const cfg = NOTIF_CONFIG[status];
  return <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>;
}

export function FaultBadge({ isFault }: { isFault: boolean; prediction?: string | null }) {
  if (isFault) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Fault Detected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Normal
    </span>
  );
}

export function ConfidenceBar({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <span className="text-xs text-ink-400">N/A</span>;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 bg-ink-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-ink-600 w-10 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-500 hover:text-red-700 text-xs underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center mb-4">
        <div className="w-2 h-2 rounded-full bg-ink-300" />
      </div>
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {description && <p className="mt-1.5 text-xs text-ink-400 max-w-sm">{description}</p>}
    </div>
  );
}
