import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Wifi, WifiOff, CloudUpload, Download, Upload, FileText, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import api from '../api/client';
import { formatCurrency, todayISO, initials } from '../utils/format';
import { areNotificationsEnabled, setNotificationsEnabled, requestNotificationPermission, sendNotification } from '../utils/notifications';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

export default function Settings() {
  const { user } = useAuth();
  const {
    isOnline,
    pendingCount,
    syncPending,
    syncing,
    recurring,
    refreshRecurring,
    addRecurring,
    deleteRecurring,
    settings,
    updateSettings,
    currencyRates,
  } = useData();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'expense', amount: '', description: '', frequency: 'monthly', next_date: todayISO() });
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(areNotificationsEnabled());
  const [importing, setImporting] = useState(false);
  const [importingFile, setImportingFile] = useState(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    refreshRecurring();
  }, [refreshRecurring]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!Number(form.amount) || Number(form.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (form.description.trim().length < 2) errs.description = 'Description is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await addRecurring({
        type: form.type,
        amount: Number(form.amount),
        description: form.description.trim(),
        frequency: form.frequency,
        next_date: form.next_date,
      });
      toast.success('Recurring transaction added');
      setShowModal(false);
      setForm({ type: 'expense', amount: '', description: '', frequency: 'monthly', next_date: todayISO() });
    } catch (err) {
      setErrors({ form: err.message });
    }
  }

  function handleDelete() {
    if (!deleting) return;
    deleteRecurring(deleting.id);
    toast.success('Recurring transaction removed');
    setDeleting(null);
  }

  async function downloadFile(format) {
    try {
      const res = await api.download(`/export/expenses.${format}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pennywise-expenses.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()} report`);
    } catch (err) {
      toast.error('Export failed. Check your connection.');
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingFile(file);
  }

  async function runImport() {
    if (!importingFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importingFile);
      const res = await api.uploadImport(formData);
      toast.success(res.message || 'Import complete');
      setImportingFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleCurrencyChange(e) {
    const currency = e.target.value;
    await updateSettings({ preferred_currency: currency });
    toast.success(`Preferred currency set to ${currency}`);
  }

  async function toggleNotifications() {
    if (notifEnabled) {
      setNotificationsEnabled(false);
      setNotifEnabled(false);
      toast.info('Notifications disabled');
      return;
    }
    const ok = await requestNotificationPermission();
    if (ok) {
      setNotificationsEnabled(true);
      setNotifEnabled(true);
      sendNotification('Notifications enabled', 'PennyWise will alert you about budgets and payments.', { tag: 'enabled' });
      toast.success('Notifications enabled');
    } else {
      toast.error('Notification permission denied by the browser');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Account, offline sync and recurring transactions</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Account</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>{initials(user?.name)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.name}</div>
              <div className="tx-meta">{user?.email}</div>
              <div className="badge" style={{ marginTop: 6 }}>
                <span className="badge-dot" style={{ background: 'var(--success)' }} />
                Free plan
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Offline &amp; sync</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="tx-item">
              <div className={`tx-icon ${isOnline ? 'income' : 'expense'}`}>
                {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
              </div>
              <div className="tx-main">
                <div className="tx-title">{isOnline ? 'Online' : 'Offline mode'}</div>
                <div className="tx-meta">
                  {isOnline
                    ? pendingCount > 0 ? `${pendingCount} change(s) waiting to sync` : 'All changes synced'
                    : 'Changes are saved locally and queued'}
                </div>
              </div>
              {pendingCount > 0 && (
                <button className="btn btn-sm" onClick={syncPending} disabled={syncing}>
                  <CloudUpload size={14} /> {syncing ? 'Syncing...' : 'Sync'}
                </button>
              )}
            </div>
            <div className="tx-item">
              <div className="tx-icon count" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Download size={18} />
              </div>
              <div className="tx-main">
                <div className="tx-title">Install app</div>
                <div className="tx-meta">Add PennyWise to your home screen for offline use</div>
              </div>
              {installPrompt ? (
                <button className="btn btn-sm" onClick={handleInstall}>Install</button>
              ) : (
                <span className="badge">PWA enabled</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Export data</div>
              <div className="card-subtitle">Download your expense history</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => downloadFile('csv')}>
              <Download size={15} /> CSV
            </button>
            <button className="btn btn-secondary" onClick={() => downloadFile('json')}>
              <Download size={15} /> JSON
            </button>
            <button className="btn btn-secondary" onClick={() => downloadFile('pdf')}>
              <FileText size={15} /> PDF report
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Import transactions</div>
              <div className="card-subtitle">Upload a bank CSV statement</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv,text/plain,application/vnd.ms-excel"
              onChange={handleImportFile}
            />
            {importingFile && (
              <button className="btn" onClick={runImport} disabled={importing}>
                <Upload size={15} /> {importing ? 'Importing...' : `Import ${importingFile.name}`}
              </button>
            )}
          </div>
          {!importingFile && (
            <div className="tx-meta" style={{ marginTop: 8 }}>
              Supports comma/semicolon delimiters with date, description, amount or debit/credit columns.
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Preferences</div>
              <div className="card-subtitle">Currency display and alerts</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Preferred currency</label>
              <select value={settings.preferred_currency} onChange={handleCurrencyChange}>
                <option value="USD">USD</option>
                {currencyRates
                  .map((r) => r.quote)
                  .filter((c, i, arr) => arr.indexOf(c) === i)
                  .map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
              </select>
            </div>
            <div className="tx-item" style={{ margin: 0 }}>
              <div className="tx-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Bell size={18} />
              </div>
              <div className="tx-main">
                <div className="tx-title">Browser notifications</div>
                <div className="tx-meta">Get alerts when budgets are exceeded or payments are due</div>
              </div>
              <button className="btn btn-sm" onClick={toggleNotifications}>
                {notifEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Currency rates</div>
          </div>
          <div className="tx-list">
            {currencyRates.slice(0, 9).map((r) => (
              <div className="tx-item" key={`${r.base}-${r.quote}`}>
                <div className="tx-main">
                  <div className="tx-title">{r.base} → {r.quote}</div>
                </div>
                <div className="tx-amount" style={{ color: 'var(--text)' }}>{r.rate}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Recurring transactions</div>
            <div className="card-subtitle">Automatically scheduled income and expenses</div>
          </div>
          <button className="btn" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add recurring
          </button>
        </div>
        {recurring.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No recurring transactions</div>
            <div className="empty-text">Set up regular payments like rent, subscriptions or salary.</div>
          </div>
        ) : (
          recurring.map((r) => (
            <div className="tx-item" key={r.id}>
              <div className={`tx-icon ${r.type === 'income' ? 'income' : 'expense'}`}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{r.frequency.slice(0, 3)}</span>
              </div>
              <div className="tx-main">
                <div className="tx-title">{r.description}</div>
                <div className="tx-meta">{r.frequency} · next: {r.next_date}</div>
              </div>
              <div className={`tx-amount ${r.type === 'income' ? 'income' : 'expense'}`}>
                {r.type === 'income' ? '+' : '−'}{formatCurrency(r.amount)}
              </div>
              <button className="icon-btn" onClick={() => setDeleting(r)} aria-label="Delete recurring">
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="alert alert-success" style={{ marginTop: 16 }}>
        <div>
          <strong>Demo account</strong> — you can also sign in with <code>demo@pennywise.app</code> / <code>demo12345</code> to explore sample data.
        </div>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add recurring transaction"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn" onClick={handleSubmit}>Add</button>
          </>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          {errors.form && <div className="form-error">{errors.form}</div>}
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.amount}</div>}
            </div>
            <div className="field">
              <label>Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input type="text" placeholder="e.g. Netflix subscription" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {errors.description && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.description}</div>}
          </div>
          <div className="field">
            <label>Next date</label>
            <input type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove recurring transaction?"
        message={`Remove the ${deleting?.frequency} "${deleting?.description}" (${formatCurrency(deleting?.amount)})?`}
      />
    </>
  );
}
