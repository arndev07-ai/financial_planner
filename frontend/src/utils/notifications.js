const STORAGE_KEY = 'pennywise_notifications_enabled';

export function notificationsSupported() {
  return 'Notification' in window;
}

export function areNotificationsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') {
    localStorage.setItem(STORAGE_KEY, '1');
    return true;
  }
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    localStorage.setItem(STORAGE_KEY, '1');
    return true;
  }
  return false;
}

export function setNotificationsEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function sendNotification(title, body = '', { tag = 'pennywise', icon = '/icons/icon-192.png' } = {}) {
  if (!notificationsSupported() || !areNotificationsEnabled()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag, icon });
    return true;
  } catch {
    return false;
  }
}
