// The day's pressing alerts as browser notifications, once a day, while the app is open and allowed to.

import { useEffect } from 'react';
import type { Alert } from '../lib/alerts';
import type { Settings } from '../db/types';
import { todayStr } from '../lib/dates';

const KEY = 'pmtoolbox.notifiedOn';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function askNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function useBrowserNotifications(alerts: Alert[], settings: Settings) {
  useEffect(() => {
    if (!settings.browserNotifications || !notificationsSupported() || Notification.permission !== 'granted') return;
    const urgent = alerts.filter((a) => a.severity !== 'info');
    if (!urgent.length) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(KEY);
    } catch {
      /* fine */
    }
    const today = todayStr();
    if (last === today) return;
    try {
      localStorage.setItem(KEY, today);
      new Notification(`PM Toolbox: ${urgent.length} thing${urgent.length === 1 ? '' : 's'} need attention`, { body: urgent.slice(0, 4).map((a) => `• ${a.title}`).join('\n'), tag: 'pmtoolbox-daily' });
    } catch {
      /* the browser said no */
    }
  }, [alerts, settings.browserNotifications]);
}
