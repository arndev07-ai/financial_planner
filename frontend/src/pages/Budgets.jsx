import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import BudgetProgressBar from '../components/BudgetProgressBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, monthLabel, currentMonthYear } from '../utils/format';

export default function Budgets() {
  const { budgets, categories, loading, refreshBudgets, setBudget, deleteBudget } = useData();
  const toast = useToast();

  const [month, setMonth] = useState(currentMonthYear());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '' });
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    refreshBudgets(month);
  }, [month, refreshBudgets]);

  const expenseCats = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories]);

  const budgetedIds = useMemo(() => new Set((budgets.budgets || []).map((b) => b.category_id)), [budgets]);

  const uncategorizedCats = useMemo(() => expenseCats.filter((c) => !budgetedIds.has(c.id)), [expenseCats, budgetedIds]);

  const totalBudget = useMemo(() => (budgets.budgets || []).reduce((s, b) => s + b.amount, 0), [budgets]);
  const totalSpent = useMemo(() => (budgets.budgets || []).reduce((s, b) => s + b.spent, 0), [budgets]);

  function openAdd() {
    const preferred = uncategorizedCats.find((c) => c.name === 'Food & Dining')?.id || uncategorizedCats[0]?.id || '';
    setForm({ category_id: preferred, amount: '' });
    setErrors({});
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.category_id) errs.category_id = 'Select a category';
    if (!Number(form.amount) || Number(form.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      await setBudget({ category_id: Number(form.category_id), amount: Number(form.amount), month_year: month });
      toast.success('Budget saved');
      setShowModal(false);
      refreshBudgets(month);
    } catch (err) {
      setErrors({ form: err.message });
    }
  }

  function handleDelete() {
    if (!deleting) return;
    deleteBudget(deleting.id);
    toast.success('Budget removed');
    setDeleting(null);
    refreshBudgets(month);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Budgets</h1>
          <p className="page-subtitle">Set monthly spending limits per category</p>
        </div>
        <button className="btn" onClick={openAdd} disabled={uncategorizedCats.length === 0}>
          <Plus size={16} /> Add budget
        </button>
      </div>

      <div className="filters">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
        <div className="badge">
          <span className="badge-dot" style={{ background: 'var(--primary)' }} />
          {monthLabel(month)}
        </div>
      </div>

      {!loading.budgets && (budgets.budgets || []).length > 0 && (
        <div className="stats-grid">
          <StatCardSimple label="Total budget" value={formatCurrency(totalBudget)} />
          <StatCardSimple label="Total spent" value={formatCurrency(totalSpent)} danger={totalSpent > totalBudget} />
          <StatCardSimple
            label="Remaining"
            value={formatCurrency(Math.max(0, totalBudget - totalSpent))}
            hint={`${totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0}% of budget used`}
          />
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Monthly budgets</div>
            <div className="card-subtitle">Alerts trigger at 80% and 100% usage</div>
          </div>
        </div>
        {loading.budgets ? (
          <div className="loading-dots"><span>Loading budgets...</span></div>
        ) : (budgets.budgets || []).length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Plus size={28} /></div>
            <div className="empty-title">No budgets set for {monthLabel(month)}</div>
            <div className="empty-text">Create a budget to start tracking category spending.</div>
            <button className="btn" onClick={openAdd} disabled={uncategorizedCats.length === 0}>Set a budget</button>
          </div>
        ) : (
          <div>
            {(budgets.budgets || []).map((b) => (
              <div key={b.id} style={{ position: 'relative' }}>
                <BudgetProgressBar
                  name={b.category_name}
                  color={b.category_color}
                  amount={b.amount}
                  spent={b.spent}
                  progress={b.progress}
                />
                <button
                  className="icon-btn"
                  onClick={() => setDeleting(b)}
                  style={{ position: 'absolute', right: 0, top: 12, width: 30, height: 30 }}
                  aria-label={`Delete ${b.category_name} budget`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Set budget · ${monthLabel(month)}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn" onClick={handleSubmit}>Save budget</button>
          </>
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          {errors.form && <div className="form-error">{errors.form}</div>}
          <div className="field">
            <label>Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Select a category...</option>
              {uncategorizedCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category_id && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.category_id}</div>}
            {uncategorizedCats.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                All expense categories already have a budget for this month. Remove one to add a new budget.
              </div>
            )}
          </div>
          <div className="field">
            <label>Monthly amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 500"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            {errors.amount && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.amount}</div>}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove budget?"
        message={`Remove the ${deleting?.category_name} budget of ${formatCurrency(deleting?.amount)}?`}
      />
    </>
  );
}

function StatCardSimple({ label, value, hint, danger }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={danger ? { color: 'var(--danger)' } : undefined}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
