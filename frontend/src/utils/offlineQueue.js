const DB_NAME = 'pennywise-offline';
const STORE = 'queue';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadQueue() {
  try {
    return await withStore('readonly', (store) => store.getAll());
  } catch (e) {
    return legacyLoadQueue();
  }
}

export async function saveQueue(queue) {
  try {
    await withStore('readwrite', (store) => {
      store.clear();
      for (const op of queue) store.put(op);
    });
  } catch (e) {
    legacySaveQueue(queue);
  }
}

export async function enqueue(op) {
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...op,
  };
  try {
    await withStore('readwrite', (store) => store.add(item));
  } catch (e) {
    const q = legacyLoadQueue();
    q.push(item);
    legacySaveQueue(q);
  }
  return item;
}

export async function removeQueued(id) {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch (e) {
    legacySaveQueue(legacyLoadQueue().filter((op) => op.id !== id));
  }
}

export async function clearQueue() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch (e) {
    legacySaveQueue([]);
  }
}

export async function getPendingCount() {
  return (await loadQueue()).length;
}

// --- Legacy localStorage fallback (used only when IndexedDB is unavailable) ---

const LEGACY_KEY = 'pennywise_offline_queue_v1';

function legacyLoadQueue() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function legacySaveQueue(queue) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(queue));
  } catch (e) {
    // storage full or unavailable
  }
}
