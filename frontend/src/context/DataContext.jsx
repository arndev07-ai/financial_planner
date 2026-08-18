import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import api, { ApiError } from '../api/client';
import { enqueue, loadQueue, saveQueue, removeQueued } from '../utils/offlineQueue';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useToast } from './ToastContext';
const DataContext = createContext(null);

function isOfflineError(err) {
  return err instanceof ApiError && err.status === 0;
}

function notifyQueue() {
  window.dispatchEvent(new Event('pennywise:queue-changed'));
}

export function DataProvider({ children }) {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState({ month: null, budgets: [] });
  const [projectBudgets, setProjectBudgets] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [assets, setAssets] = useState([]);
  const [netWorth, setNetWorth] = useState(null);
  const [settings, setSettings] = useState({ preferred_currency: 'USD', notify_budget: 1 });
  const [currencyRates, setCurrencyRates] = useState([]);
  const [upcoming, setUpcoming] = useState({ days: 14, items: [] });

  const [loading, setLoading] = useState({
    income: true,
    expenses: true,
    categories: true,
    budgets: true,
    analytics: true,
  });

  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refreshPending = useCallback(async () => {
    const q = await loadQueue();
    setPendingCount(q.length);
  }, []);
  const appliedLocal = useRef(new Set());

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  const markLoading = (key, value) =>
    setLoading((prev) => ({ ...prev, [key]: value }));

  const refreshIncome = useCallback(
    async (params) => {
      markLoading('income', true);
      try {
        const rows = await api.get('/income', params);
        setIncome(rows);
      } catch (err) {
        if (!isOfflineError(err)) toast.error(err.message);
      } finally {
        markLoading('income', false);
      }
    },
    [toast]
  );

  const refreshExpenses = useCallback(
    async (params) => {
      markLoading('expenses', true);
      try {
        const rows = await api.get('/expenses', params);
        setExpenses(rows);
      } catch (err) {
        if (!isOfflineError(err)) toast.error(err.message);
      } finally {
        markLoading('expenses', false);
      }
    },
    [toast]
  );

  const refreshCategories = useCallback(async () => {
    markLoading('categories', true);
    try {
      const rows = await api.get('/categories');
      setCategories(rows);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    } finally {
      markLoading('categories', false);
    }
  }, [toast]);

  const refreshBudgets = useCallback(
    async (month) => {
      markLoading('budgets', true);
      try {
        const res = await api.get('/budgets', { month });
        setBudgets(res);
      } catch (err) {
        if (!isOfflineError(err)) toast.error(err.message);
      } finally {
        markLoading('budgets', false);
      }
    },
    [toast]
  );

  const refreshProjects = useCallback(async () => {
    try {
      const rows = await api.get('/projects');
      setProjectBudgets(rows);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    }
  }, [toast]);

  const refreshRecurring = useCallback(async () => {
    try {
      const rows = await api.get('/recurring');
      setRecurring(rows);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    }
  }, [toast]);

  const refreshAnalytics = useCallback(
    async (params) => {
      markLoading('analytics', true);
      try {
        const [summary, daily, weekly, monthly, categories, top, highDays] = await Promise.all([
          api.get('/analytics/summary', params),
          api.get('/analytics/daily', params),
          api.get('/analytics/weekly', params),
          api.get('/analytics/monthly'),
          api.get('/analytics/categories', params),
          api.get('/analytics/top-spending', params),
          api.get('/analytics/high-spending-days', params),
        ]);
        setAnalytics({ summary, daily, weekly, monthly, categoryDist: categories, topSpending: top, highDays });
      } catch (err) {
        if (!isOfflineError(err)) toast.error(err.message);
      } finally {
        markLoading('analytics', false);
      }
    },
    [toast]
  );

  const refreshAssets = useCallback(async () => {
    try {
      const [list, net] = await Promise.all([api.get('/assets'), api.get('/assets/networth')]);
      setAssets(list);
      setNetWorth(net);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    }
  }, [toast]);

  const refreshSettings = useCallback(async () => {
    try {
      const row = await api.get('/settings');
      setSettings(row);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    }
  }, [toast]);

  const refreshCurrencyRates = useCallback(async () => {
    try {
      const res = await api.get('/currency/rates');
      setCurrencyRates(res.rates || []);
    } catch (err) {
      if (!isOfflineError(err)) toast.error(err.message);
    }
  }, [toast]);

  const refreshUpcoming = useCallback(
    async (days = 14) => {
      try {
        const res = await api.get('/recurring/upcoming', { days });
        setUpcoming(res);
      } catch (err) {
        if (!isOfflineError(err)) toast.error(err.message);
      }
    },
    [toast]
  );

  const refreshAll = useCallback(() => {
    refreshIncome();
    refreshExpenses();
    refreshCategories();
    refreshBudgets();
    refreshProjects();
    refreshRecurring();
    refreshAnalytics();
    refreshAssets();
    refreshSettings();
    refreshCurrencyRates();
    refreshUpcoming();
  }, [refreshIncome, refreshExpenses, refreshCategories, refreshBudgets, refreshProjects, refreshRecurring, refreshAnalytics, refreshAssets, refreshSettings, refreshCurrencyRates, refreshUpcoming]);

  // ---- Mutations with offline queueing ----

  async function runMutation({ optimistic, op }) {
    if (isOnline) {
      try {
        const result = await op.run();
        if (op.after) op.after(result);
        optimistic?.onSuccess?.(result);
        return { ok: true, result };
      } catch (err) {
        if (isOfflineError(err)) {
          return handleOffline(op, optimistic);
        }
        optimistic?.onFailure?.(err);
        toast.error(err.message);
        return { ok: false, error: err };
      }
    }
    return handleOffline(op, optimistic);
  }

  function handleOffline(op, optimistic) {
    enqueue(op).then(() => {
      optimistic?.applyLocal?.();
      notifyQueue();
      refreshPending();
    });
    toast.info('You are offline - this change was saved locally and will sync when you reconnect.');
    return { ok: true, offline: true };
  }

  const addIncome = useCallback(
    (data) =>
      runMutation({
        optimistic: {
          applyLocal: () => {
            setIncome((list) => [{ ...data, id: `temp-${Date.now()}`, _pending: true, source: data.source }, ...list]);
          },
          onSuccess: () => refreshIncome(),
        },
        op: {
          method: 'POST',
          url: '/income',
          body: data,
          after: () => refreshIncome(),
        },
      }),
    [isOnline]
  );

  const updateIncome = useCallback(
    (id, data) =>
      runMutation({
        optimistic: {
          applyLocal: () => setIncome((list) => list.map((r) => (r.id === id ? { ...r, ...data, _pending: true } : r))),
          onSuccess: () => refreshIncome(),
          onFailure: () => refreshIncome(),
        },
        op: {
          method: 'PUT',
          url: `/income/${id}`,
          body: data,
          after: () => refreshIncome(),
        },
      }),
    [isOnline]
  );

  const deleteIncome = useCallback(
    (id) =>
      runMutation({
        optimistic: {
          applyLocal: () => setIncome((list) => list.filter((r) => r.id !== id)),
          onFailure: () => refreshIncome(),
        },
        op: {
          method: 'DELETE',
          url: `/income/${id}`,
          after: () => refreshIncome(),
        },
      }),
    [isOnline]
  );

  const addExpense = useCallback(
    (data) =>
      runMutation({
        optimistic: {
          applyLocal: () => {
            setExpenses((list) => [{ ...data, id: `temp-${Date.now()}`, _pending: true }, ...list]);
          },
          onSuccess: () => {
            refreshExpenses();
            refreshBudgets();
            refreshAnalytics();
          },
        },
        op: {
          method: 'POST',
          url: '/expenses',
          body: data,
          after: () => {
            refreshExpenses();
            refreshBudgets();
            refreshAnalytics();
            refreshProjects();
          },
        },
      }),
    [isOnline]
  );

  const updateExpense = useCallback(
    (id, data) =>
      runMutation({
        optimistic: {
          applyLocal: () => setExpenses((list) => list.map((r) => (r.id === id ? { ...r, ...data, _pending: true } : r))),
          onSuccess: () => {
            refreshExpenses();
            refreshBudgets();
            refreshAnalytics();
          },
          onFailure: () => {
            refreshExpenses();
            refreshBudgets();
          },
        },
        op: {
          method: 'PUT',
          url: `/expenses/${id}`,
          body: data,
          after: () => {
            refreshExpenses();
            refreshBudgets();
            refreshAnalytics();
            refreshProjects();
          },
        },
      }),
    [isOnline]
  );

  const deleteExpense = useCallback(
    (id) =>
      runMutation({
        optimistic: {
          applyLocal: () => setExpenses((list) => list.filter((r) => r.id !== id)),
          onFailure: () => {
            refreshExpenses();
            refreshBudgets();
          },
        },
        op: {
          method: 'DELETE',
          url: `/expenses/${id}`,
          after: () => {
            refreshExpenses();
            refreshBudgets();
            refreshAnalytics();
            refreshProjects();
          },
        },
      }),
    [isOnline]
  );

  const addCategory = useCallback(
    async (data) => {
      const res = await api.post('/categories', data);
      refreshCategories();
      return res;
    },
    [refreshCategories]
  );

  const deleteCategory = useCallback(
    async (id) => {
      const res = await api.del(`/categories/${id}`);
      refreshCategories();
      return res;
    },
    [refreshCategories]
  );

  const setBudget = useCallback(
    async (data) => {
      const res = await api.post('/budgets', data);
      refreshBudgets();
      return res;
    },
    [refreshBudgets]
  );

  const deleteBudget = useCallback(
    async (id) => {
      const res = await api.del(`/budgets/${id}`);
      refreshBudgets();
      return res;
    },
    [refreshBudgets]
  );

  const addProject = useCallback(
    async (data) => {
      const res = await api.post('/projects', data);
      refreshProjects();
      return res;
    },
    [refreshProjects]
  );

  const addRecurring = useCallback(
    async (data) => {
      const res = await api.post('/recurring', data);
      refreshRecurring();
      return res;
    },
    [refreshRecurring]
  );

  const deleteRecurring = useCallback(
    async (id) => {
      const res = await api.del(`/recurring/${id}`);
      refreshRecurring();
      refreshUpcoming();
      return res;
    },
    [refreshRecurring, refreshUpcoming]
  );

  const addAsset = useCallback(
    async (data) => {
      const res = await api.post('/assets', data);
      refreshAssets();
      return res;
    },
    [refreshAssets]
  );

  const updateAsset = useCallback(
    async (id, data) => {
      const res = await api.put(`/assets/${id}`, data);
      refreshAssets();
      return res;
    },
    [refreshAssets]
  );

  const deleteAsset = useCallback(
    async (id) => {
      const res = await api.del(`/assets/${id}`);
      refreshAssets();
      return res;
    },
    [refreshAssets]
  );

  const updateSettings = useCallback(
    async (data) => {
      const res = await api.put('/settings', data);
      setSettings(res);
      return res;
    },
    []
  );

  const syncPending = useCallback(async () => {
    const queue = await loadQueue();
    if (queue.length === 0) return;
    setSyncing(true);
    let remaining = [];
    let synced = 0;
    for (const op of queue) {
      try {
        if (op.method === 'POST') await api.post(op.url, op.body);
        else if (op.method === 'PUT') {
          try {
            await api.put(op.url, op.body);
          } catch (err) {
            // Conflict resolution: if the server rejects an update because the
            // record was changed since it was queued, replay the newest local
            // version as an update against the current server state.
            if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
              await api.put(op.url, { ...op.body, _conflict: true });
            } else {
              throw err;
            }
          }
        } else if (op.method === 'DELETE') await api.del(op.url);
        synced += 1;
        await removeQueued(op.id);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 0) {
          appliedLocal.current.add(op.id);
          await removeQueued(op.id);
        } else {
          remaining.push(op);
        }
      }
    }
    await saveQueue(remaining);
    refreshPending();
    setSyncing(false);
    if (synced > 0) {
      toast.success(`${synced} offline change${synced > 1 ? 's' : ''} synced.`);
      refreshAll();
    }
  }, [refreshAll, refreshPending, toast]);

  const value = {
    income,
    expenses,
    categories,
    budgets,
    projectBudgets,
    recurring,
    analytics,
    assets,
    netWorth,
    settings,
    currencyRates,
    upcoming,
    loading,
    isOnline,
    pendingCount,
    syncing,
    refreshIncome,
    refreshExpenses,
    refreshCategories,
    refreshBudgets,
    refreshProjects,
    refreshRecurring,
    refreshAnalytics,
    refreshAssets,
    refreshSettings,
    refreshCurrencyRates,
    refreshUpcoming,
    refreshAll,
    addIncome,
    updateIncome,
    deleteIncome,
    addExpense,
    updateExpense,
    deleteExpense,
    addCategory,
    deleteCategory,
    setBudget,
    deleteBudget,
    addProject,
    addRecurring,
    deleteRecurring,
    addAsset,
    updateAsset,
    deleteAsset,
    updateSettings,
    syncPending,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
