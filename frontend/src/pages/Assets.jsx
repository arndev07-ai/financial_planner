import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Wallet, TrendingUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatCompact } from '../utils/format';

const ASSET_TYPES = [
  { value: 'cash', label: 'Cash / Bank', icon: '💵' },
  { value: 'investment', label: 'Investments', icon: '📈' },
  { value: 'property', label: 'Property', icon: '🏠' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'other', label: 'Other', icon: '💼' },
];

export default function Assets() {
  const { assets, netWorth, refreshAssets, addAsset, updateAsset, deleteAsset } = useData();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'cash', value: '', currency: 'USD', note: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshAssets();
  }, [refreshAssets]);

  function openNew() {
    setEditing(null);
    setForm({ name: '', type: 'cash', value: '', currency: 'USD', note: '' });
    setShowModal(true);
  }

  function openEdit(asset) {
    setEditing(asset);
    setForm({ name: asset.name, type: asset.type, value: asset.value, currency: asset.currency || 'USD', note: asset.note || '' });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name is required';
    if (!Number(form.value) || Number(form.value) < 0) errs.value = 'Value must be 0 or greater';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        value: Number(form.value),
        currency: form.currency.toUpperCase(),
        note: form.note?.trim() || undefined,
      };
      if (editing) {
        await updateAsset(editing.id, payload);
        toast.success('Asset updated');
      } else {
        await addAsset(payload);
        toast.success('Asset added');
      }
      setShowModal(false);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!deleting) return;
    deleteAsset(deleting.id);
    toast.success('Asset removed');
    setDeleting(null);
  }

  const typeMeta = (t) => ASSET_TYPES.find((a) => a.value === t) || ASSET_TYPES[4];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Assets &amp; net worth</h1>
          <p className="page-subtitle">Track what you own and your total net worth</p>
        </div>
        <button className="btn" onClick={openNew}>
          <Plus size={16} /> Add asset
        </button>
      </div>

      {netWorth && (
        <div className="stats-grid">
          <div className="card stat-card">
            <div className="stat-label">Net worth</div>
            <div className="stat-value">{formatCurrency(netWorth.total)}</div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">Asset count</div>
            <div className="stat-value">{netWorth.count}</div>
          </div>
          <div className="card stat-card" style={{ gridColumn: 'span 2' }}>
            <div className="stat-label">Allocation</div>
            <div className="stat-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {Object.entries(netWorth.byType).map(([type, value]) => {
                const meta = typeMeta(type);
                return (
                  <div key={type} className="badge" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                    <span>{meta.icon}</span>
                    <span style={{ fontWeight: 600 }}>{meta.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatCompact(value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Your assets</div>
            <div className="card-subtitle">Net worth snapshot from all holdings</div>
          </div>
        </div>
        {assets.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Wallet size={28} /></div>
            <div className="empty-title">No assets yet</div>
            <div className="empty-text">Add checking accounts, investments, property and crypto to track your net worth.</div>
          </div>
        ) : (
          <div className="tx-list">
            {assets.map((a) => {
              const meta = typeMeta(a.type);
              return (
                <div className="tx-item" key={a.id}>
                  <div className="tx-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    <span>{meta.icon}</span>
                  </div>
                  <div className="tx-main">
                    <div className="tx-title">{a.name}</div>
                    <div className="tx-meta">{meta.label}{a.currency !== 'USD' ? ` · ${a.currency}` : ''}{a.note ? ` · ${a.note}` : ''}</div>
                  </div>
                  <div className="tx-amount" style={{ color: 'var(--income)' }}>
                    {a.currency !== 'USD' ? `${a.currency} ` : ''}{formatCurrency(a.value)}
                  </div>
                  <button className="icon-btn" onClick={() => openEdit(a)} aria-label={`Edit ${a.name}`}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => setDeleting(a)} aria-label={`Delete ${a.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {netWorth?.history?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Net worth history</div>
              <div className="card-subtitle">Daily snapshots</div>
            </div>
            <TrendingUp size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="tx-list">
            {netWorth.history.slice(-10).reverse().map((h) => (
              <div className="tx-item" key={h.date}>
                <div className="tx-main">
                  <div className="tx-title">{h.date}</div>
                </div>
                <div className="tx-amount" style={{ color: 'var(--text)' }}>{formatCurrency(h.value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`${editing ? 'Edit' : 'Add'} asset`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Add asset'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          {errors.form && <div className="form-error">{errors.form}</div>}
          <div className="field">
            <label>Asset name</label>
            <input
              type="text"
              placeholder="e.g. Checking account"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            {errors.name && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field-row">
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CNY', 'CHF', 'SGD'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Value</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
            {errors.value && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.value}</div>}
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Emergency fund" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove asset?"
        message={`Remove "${deleting?.name}" (${formatCurrency(deleting?.value)}) from your net worth?`}
      />
    </>
  );
}
