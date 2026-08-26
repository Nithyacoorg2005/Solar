import type { Inspection } from '@/types';
import { formatDateTime } from './inspectionApi';

/**
 * Notification Service
 * ---------------------
 * Sends a push notification to the user's phone when a fault is detected.
 *
 * For the demo, this uses the browser's built-in Notification API which works
 * on phones (Android Chrome, desktop). The user is asked for permission once.
 *
 * To use a server-side notification service (e.g. Telegram Bot, Pushover,
 * ntfy.sh) later, set the relevant env vars and uncomment the fetch block below.
 *
 * Environment variables (all optional — browser notifications work without them):
 *   VITE_NOTIFICATION_WEBHOOK_URL  — webhook URL for server-side notifications
 */

let permissionRequested = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  if (permissionRequested) return false;

  permissionRequested = true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationPermission(): 'default' | 'granted' | 'denied' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Send a fault notification. Only called when is_fault is true.
 * Returns the notification status to store in the database.
 */
export async function sendFaultNotification(inspection: Inspection): Promise<'sent' | 'failed' | 'skipped'> {
  const title = 'Solar Panel Fault Detected';
  const body = [
    `Panel: ${inspection.panel_id}`,
    `Fault: ${inspection.prediction ?? 'Unknown'}`,
    `Time: ${formatDateTime(inspection.inspection_at)}`,
    inspection.confidence != null ? `Confidence: ${(inspection.confidence * 100).toFixed(1)}%` : '',
  ].filter(Boolean).join('\n');

  let browserSent = false;

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: inspection.id });
      browserSent = true;
    } catch {
      browserSent = false;
    }
  }

  // Optional: server-side webhook for cross-device delivery
  const webhookUrl = import.meta.env.VITE_NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, inspection_id: inspection.id }),
      });
      return 'sent';
    } catch {
      return browserSent ? 'sent' : 'failed';
    }
  }

  return browserSent ? 'sent' : 'skipped';
}
