import { Bell, BellOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { getNotificationPermission, ensureNotificationPermission } from '@/lib/notificationService';
import { useEffect, useState } from 'react';

export function NotificationStatus() {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    const granted = await ensureNotificationPermission();
    setPermission(granted ? 'granted' : 'denied');
    setRequesting(false);
  };

  if (permission === 'unsupported') {
    return (
      <div className="flex items-center gap-2.5 text-sm text-ink-400 px-5 py-4 bg-ink-50 rounded-xl border border-ink-200/60">
        <BellOff size={16} /> Notifications not supported on this device.
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2.5 text-sm text-green-700 px-5 py-4 bg-green-50 rounded-xl border border-green-200/60">
        <CheckCircle2 size={16} /> Notifications enabled — you'll be alerted when a fault is detected.
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2.5 text-sm text-amber-700 px-5 py-4 bg-amber-50 rounded-xl border border-amber-200/60">
        <AlertCircle size={16} /> Notifications blocked. Enable in browser settings to receive fault alerts.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 bg-ink-50 rounded-xl border border-ink-200/60">
      <div className="flex items-center gap-2.5 text-sm text-ink-500">
        <Bell size={16} /> Notifications not enabled.
      </div>
      <button
        onClick={handleEnable}
        disabled={requesting}
        className="px-4 py-2 text-xs font-medium text-ink-700 border border-ink-200 rounded-lg hover:bg-white transition-colors"
      >
        {requesting ? 'Requesting...' : 'Enable'}
      </button>
    </div>
  );
}
