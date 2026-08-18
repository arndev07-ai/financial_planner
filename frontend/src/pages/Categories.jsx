import { useMemo, useState } from 'react';
import { Plus, Trash2, Lock } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#10b981', '#14b8a6', '#0ea5e9', '#2563eb', '#8b5cf6', '#a855f7', '#ec4899', '#64748b'];

export default function Categories() {
  const { categories, loading, addCategory, deleteCategory } = useData();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'expense', color: PRESET_COLORS[0] });
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [creating, setCreating] = useState(false);

  const incomeCats = useMemo(() => categories.filter((c) => c.type === 'income'), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories]);

  function openAdd() {
    setForm({ name: '', type: 'expense', color: PRESET_COLORS[0] });
    setErrors({});
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setCreating(true);
    try {
      await addCategory({ name: form.name.trim(), type: form.type, color: form.color });
      toast.success('Category created');
      setShowModal(false);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setCreating(false);
    }
  }

  function handleDelete() {
    if (!deleting) return;
    deleteCategory(deleting.id);
    toast.success('Category deleted');
    setDeleting(null);
  }

  function CategoryRow({ cat }) {
    const isCustom = cat.user_id !== null;
    return (
      <div className="tx-item" key={cat.id}>
        <div className="tx-icon" style={{ background: `${cat.color}22`, color: cat.color }}>
          <span className="badge-dot" style={{ background: cat.color, width: 12, height: 12 }} />
        </div>
        <div className="tx-main">
          <div className="tx-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cat.name}
            {!isCustom && (
              <span className="badge">
                <Lock size={11} /> Default
              </span>
            )}
          </div>
          <div className="tx-meta">#{cat.color}</div>
        </div>
        {isCustom && (
          <button className="icon-btn" onClick={() => setDeleting(cat)} aria-label={`Delete ${cat.name}`}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Organize transactions with colors and icons</p>
        </div>
        <button className="btn" onClick={openAdd}>
          <Plus size={16} /> New category
        </button>
      </div>

      {loading.categories ? (
        <div className="loading-dots"><span>Loading categories...</span></div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Expense categories</div>
            </div>
            {expenseCats.map((c) => <CategoryRow key={c.id} cat={c} />)}
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Income categories</div>
            </div>
            {incomeCats.map((c) => <CategoryRow key={c.id} cat={c} />)}
          </div>
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Create category"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn" onClick={handleSubmit} disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
          </>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          {errors.form && <div className="form-error">{errors.form}</div>}
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. Subscriptions"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            {errors.name && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field">
            <label>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  aria-label={`Color ${color}`}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: color,
                    border: form.color === color ? '3px solid var(--text)' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete category?"
        message={`Delete "${deleting?.name}"? Existing transactions keep their category name, but any budgets for it will be removed.`}
      />
    </>
  );
}
