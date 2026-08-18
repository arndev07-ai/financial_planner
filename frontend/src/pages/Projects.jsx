import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Link2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, todayISO } from '../utils/format';

export default function Projects() {
  const { projectBudgets, refreshProjects, addProject, expenses, refreshExpenses } = useData();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', total_budget: '', start_date: todayISO(), end_date: '' });
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [showLink, setShowLink] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    refreshProjects();
    refreshExpenses();
  }, [refreshProjects, refreshExpenses]);

  async function fetchDetail(id) {
    try {
      const res = await fetch(`/api/projects/${id}`, { credentials: 'include' });
      const data = await res.json();
      setProjectDetail(data);
    } catch (err) {
      // ignore
    }
  }

  function handleSelect(project) {
    setSelected(project);
    fetchDetail(project.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name is required';
    if (!Number(form.total_budget) || Number(form.total_budget) <= 0) errs.total_budget = 'Total budget must be greater than 0';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setCreating(true);
    try {
      await addProject({
        name: form.name.trim(),
        total_budget: Number(form.total_budget),
        start_date: form.start_date,
        end_date: form.end_date || undefined,
      });
      toast.success('Project created');
      setShowModal(false);
      setForm({ name: '', total_budget: '', start_date: todayISO(), end_date: '' });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setCreating(false);
    }
  }

  function handleDelete() {
    if (!deleting) return;
    fetch(`/api/projects/${deleting.id}`, { method: 'DELETE', credentials: 'include' })
      .then((res) => res.json())
      .then(() => {
        toast.success('Project deleted');
        setDeleting(null);
        if (selected?.id === deleting.id) setSelected(null);
        refreshProjects();
      })
      .catch(() => toast.error('Failed to delete project'));
  }

  async function handleLinkExpense(expense) {
    if (!selected) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/projects/${selected.id}/expenses`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_id: expense.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link expense');
      toast.success('Expense linked to project');
      setShowLink(false);
      fetchDetail(selected.id);
      refreshProjects();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(expense) {
    if (!selected) return;
    try {
      const res = await fetch(`/api/projects/${selected.id}/expenses/${expense.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlink expense');
      toast.success('Expense unlinked from project');
      fetchDetail(selected.id);
      refreshProjects();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const linkedExpenseIds = useMemo(
    () => new Set((projectDetail?.expenses || []).map((e) => e.id)),
    [projectDetail]
  );
  const linkableExpenses = useMemo(
    () => expenses.filter((e) => !linkedExpenseIds.has(e.id)),
    [expenses, linkedExpenseIds]
  );

  const totals = useMemo(
    () => ({
      total: projectBudgets.reduce((s, p) => s + p.total_budget, 0),
      spent: projectBudgets.reduce((s, p) => s + p.spent, 0),
    }),
    [projectBudgets]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Project budgets</h1>
          <p className="page-subtitle">Plan and track spending for specific goals</p>
        </div>
        <button className="btn" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New project
        </button>
      </div>

      {projectBudgets.length > 0 && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="card stat-card">
            <div className="stat-label">Total planned</div>
            <div className="stat-value">{formatCurrency(totals.total)}</div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">Total spent</div>
            <div className="stat-value" style={{ color: 'var(--expense)' }}>{formatCurrency(totals.spent)}</div>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Projects</div>
          </div>
          {projectBudgets.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><Plus size={28} /></div>
              <div className="empty-title">No projects yet</div>
              <div className="empty-text">Create a project budget for goals like renovations, weddings or vacations.</div>
            </div>
          ) : (
            projectBudgets.map((p) => {
              const progress = p.total_budget > 0 ? Math.min(100, Math.round((p.spent / p.total_budget) * 100)) : 0;
              return (
                <div className="tx-item" key={p.id} style={{ cursor: 'pointer' }} onClick={() => handleSelect(p)}>
                  <div className="tx-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{progress}%</span>
                  </div>
                  <div className="tx-main">
                    <div className="tx-title">{p.name}</div>
                    <div className="tx-meta">
                      {p.expense_count} expense{p.expense_count === 1 ? '' : 's'} · started {p.start_date}
                    </div>
                    <div className="progress" style={{ height: 5, marginTop: 6, maxWidth: 220 }}>
                      <div className={`progress-fill ${progress >= 100 ? 'over' : progress >= 80 ? 'warn' : 'ok'}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="tx-amount" style={{ color: 'var(--text-soft)' }}>
                    {formatCurrency(p.spent)}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}> / {formatCurrency(p.total_budget)}</span>
                  </div>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setDeleting(p); }} aria-label={`Delete ${p.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{selected ? selected.name : 'Project detail'}</div>
            {selected && <button className="btn btn-sm btn-secondary" onClick={() => setSelected(null)}>Close</button>}
          </div>
          {!selected ? (
            <div className="empty">
              <div className="empty-title">Select a project</div>
              <div className="empty-text">Click a project to see its budget breakdown and linked expenses.</div>
            </div>
          ) : !projectDetail ? (
            <div className="loading-dots"><span>Loading...</span></div>
          ) : (
            <div>
              <div style={{ marginBottom: 14 }}>
                <div className="budget-head">
                  <span className="budget-cat">{selected.name}</span>
                  <span className="budget-amounts">
                    {formatCurrency(projectDetail.spent)} / {formatCurrency(projectDetail.total_budget)}
                  </span>
                </div>
                <div className="progress">
                  <div
                    className={`progress-fill ${projectDetail.total_budget > 0 && projectDetail.spent / projectDetail.total_budget >= 1 ? 'over' : 'ok'}`}
                    style={{ width: `${projectDetail.total_budget > 0 ? Math.min(100, (projectDetail.spent / projectDetail.total_budget) * 100) : 0}%` }}
                  />
                </div>
                <div className="tx-meta" style={{ marginTop: 6 }}>
                  {projectDetail.start_date}{projectDetail.end_date ? ` → ${projectDetail.end_date}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="card-title" style={{ fontSize: 13.5 }}>Linked expenses</div>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowLink(true)} disabled={linkableExpenses.length === 0}>
                  <Link2 size={13} /> Link expense
                </button>
              </div>
              {projectDetail.expenses.length === 0 ? (
                <div className="tx-meta">No expenses linked yet. Link an expense below or choose this project when adding an expense.</div>
              ) : (
                projectDetail.expenses.map((e) => (
                  <div className="tx-item" key={e.id}>
                    <div className="tx-main">
                      <div className="tx-title">{e.merchant}</div>
                      <div className="tx-meta">{e.category} · {e.date}</div>
                    </div>
                    <div className="tx-amount expense">{formatCurrency(e.amount)}</div>
                    <button className="icon-btn" onClick={() => handleUnlink(e)} title="Unlink from project" aria-label={`Unlink ${e.merchant}`}>
                      <X size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Create project"
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
            <label>Project name</label>
            <input
              type="text"
              placeholder="e.g. Home renovation"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            {errors.name && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field">
            <label>Total budget ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 5000"
              value={form.total_budget}
              onChange={(e) => setForm({ ...form, total_budget: e.target.value })}
            />
            {errors.total_budget && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors.total_budget}</div>}
          </div>
          <div className="field-row">
            <div className="field">
              <label>Start date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="field">
              <label>End date (optional)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={showLink}
        onClose={() => setShowLink(false)}
        title={`Link an expense to "${selected?.name}"`}
        footer={
          <button className="btn btn-secondary" onClick={() => setShowLink(false)}>Close</button>
        }
      >
        {linkableExpenses.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No expenses to link</div>
            <div className="empty-text">Every expense is already linked. Add a new expense first.</div>
          </div>
        ) : (
          <div className="tx-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {linkableExpenses.slice(0, 50).map((e) => (
              <div className="tx-item" key={e.id}>
                <div className="tx-main">
                  <div className="tx-title">{e.merchant}</div>
                  <div className="tx-meta">{e.category} · {e.date}</div>
                </div>
                <div className="tx-amount expense">{formatCurrency(e.amount)}</div>
                <button className="btn btn-sm" disabled={linking} onClick={() => handleLinkExpense(e)}>
                  Link
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete project?"
        message={`Delete "${deleting?.name}"? Linked expenses will be kept but detached from the project.`}
      />
    </>
  );
}
