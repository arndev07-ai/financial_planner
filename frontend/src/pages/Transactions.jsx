import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';
import ConfirmDialog from '../components/ConfirmDialog';
import { daysAgo, formatCurrency, todayISO } from '../utils/format';

export default function Transactions() {
  const {
    income,
    expenses,
    categories,
    projectBudgets,
    loading,
    refreshIncome,
    refreshExpenses,
    addIncome,
    addExpense,
    updateIncome,
    updateExpense,
    deleteIncome,
    deleteExpense,
  } = useData();
  const toast = useToast();

  const [tab, setTab] = useState('all');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const params = { from, to, category: category || undefined };
    if (tab === 'income') refreshIncome(params);
    else if (tab === 'expense') refreshExpenses(params);
    else {
      refreshIncome(params);
      refreshExpenses(params);
    }
  }, [tab, from, to, category, refreshIncome, refreshExpenses]);

  const filtered = useMemo(() => {
    const applySearch = (list) =>
      search.trim()
        ? list.filter((r) =>
            `${r.source || r.merchant} ${r.category} ${r.notes || ''}`
              .toLowerCase()
              .includes(search.toLowerCase())
          )
        : list;
    if (tab === 'income') return applySearch(income);
    if (tab === 'expense') return applySearch(expenses);
    return applySearch(
      [...income.map((i) => ({ ...i, _type: 'income' })), ...expenses.map((e) => ({ ...e, _type: 'expense' }))]
    ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [income, expenses, tab, search]);

  async function handleSubmitForm(data) {
    if (editing) {
      if (editing.source !== undefined) {
        await updateIncome(editing.id, data);
        toast.success('Income updated');
      } else {
        await updateExpense(editing.id, data);
        toast.success('Expense updated');
      }
    } else if (showAdd === 'income') {
      await addIncome(data);
      toast.success('Income added');
    } else {
      await addExpense(data);
      toast.success('Expense added');
    }
    setEditing(null);
    setShowAdd(null);
  }

  function handleDelete() {
    if (!deleting) return;
    if (deleting.source !== undefined) {
      deleteIncome(deleting.id);
      toast.success('Income deleted');
    } else {
      deleteExpense(deleting.id);
      toast.success('Expense deleted');
    }
    setDeleting(null);
  }

  const totals = useMemo(() => {
    const inc = filtered.filter((f) => f._type === 'income' || f.source !== undefined).reduce((s, r) => s + Number(r.amount), 0);
    const exp = filtered.filter((f) => f._type === 'expense' || f.source === undefined).reduce((s, r) => s + Number(r.amount), 0);
    return { inc, exp };
  }, [filtered]);

  const isLoading = tab === 'income' ? loading.income : tab === 'expense' ? loading.expenses : loading.income || loading.expenses;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">Manage all your income and expenses</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowAdd('income')}>
            <Plus size={16} /> Income
          </button>
          <button className="btn" onClick={() => setShowAdd('expense')}>
            <Plus size={16} /> Expense
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tabs">
            <button className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All</button>
            <button className={`tab${tab === 'income' ? ' active' : ''}`} onClick={() => setTab('income')}>Income</button>
            <button className={`tab${tab === 'expense' ? ' active' : ''}`} onClick={() => setTab('expense')}>Expenses</button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: 'var(--income)', fontWeight: 700 }}>+{formatCurrency(totals.inc)}</span>
            <span style={{ color: 'var(--expense)', fontWeight: 700 }}>−{formatCurrency(totals.exp)}</span>
          </div>
        </div>
        <div className="filters" style={{ marginTop: 14, marginBottom: 0 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading-dots"><span>Loading transactions...</span></div>
        ) : (
          <TransactionList items={filtered} categories={categories} onEdit={setEditing} onDelete={setDeleting} />
        )}
      </div>

      {(showAdd || editing) && (
        <TransactionForm
          type={showAdd || (editing?.source !== undefined ? 'income' : 'expense')}
          categories={categories}
          initial={editing}
          projects={projectBudgets}
          onSubmit={handleSubmitForm}
          onClose={() => {
            setShowAdd(null);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete transaction?"
        message={`This will permanently delete the ${deleting?.source !== undefined ? 'income' : 'expense'} of ${formatCurrency(deleting?.amount)} from ${deleting?.date || ''}.`}
      />
    </>
  );
}
