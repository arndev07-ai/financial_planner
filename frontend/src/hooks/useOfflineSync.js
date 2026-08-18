import { useCallback, useEffect, useState } from 'react';
import api, { ApiError } from '../api/client';
import { loadQueue, saveQueue, getPendingCount } from '../utils/offlineQueue';

export function useOfflineSync({ onSynced } = {}) {
  const [pendingCount, setPendingCount] = useState(getPendingCount());
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const updateCount = useCallback(() => setPendingCount(getPendingCount()), []);

  const syncAll = useCallback(async () => {
    const queue = loadQueue();
    if (queue.length === 0) {
      updateCount();
      return 0;
    }
    if (!navigator.onLine) return queue.length;

    setSyncing(true);
    let remaining = [...queue];
    const failed = [];

    for (const op of remaining) {
      try {
        if (op.method === 'POST') {
          await api.post(op.url, op.body);
        } else if (op.method === 'PUT') {
          await api.put(op.url, op.body);
        } else if (op.method === 'DELETE') {
          await api.del(op.url);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 0 && err.body?.offline) {
          failed.push(op);
        } else {
          failed.push({ ...op, dropped: true });
        }
      }
    }

    const stillPending = failed.filter((op) => !op.dropped);
    saveQueue(stillPending);
    remaining = stillPending;
    setPendingCount(stillPending.length);
    setSyncing(false);

    if (queue.length > 0) {
      onSynced?.(queue.length - stillPending.length, stillPending.length);
    }
    return stillPending.length;
  }, [onSynced, updateCount]);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncAll();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('pennywise:queue-changed', updateCount);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('pennywise:queue-changed', updateCount);
    };
  }, [syncAll, updateCount]);

  useEffect(() => {
    syncAll();
  }, [syncAll]);

  return { pendingCount, syncing, isOnline, syncAll, updateCount };
}

export { ApiError };
