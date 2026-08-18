import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Bell } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import StatCard from '../components/StatCard';
import TransactionList from '../components/TransactionList';
import TransactionForm from '../components/TransactionForm';
import BudgetProgressBar from '../components/BudgetProgressBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatCompact, daysAgo, currentMonthYear } from '../utils/format';
import { sendNotification } from '../utils/notifications';

const CHART_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7', '#eab308', '#64748b'];

export default function Dashboard() {
  const {
    analytics,
    budgets,
    categories,
    projectBudgets,
    upcoming,
    loading,
    addIncome,
    addExpense,
    updateIncome,
    updateExpense,
    deleteIncome,
    deleteExpense,
    refreshAnalytics,
    refreshBudgets,
    refreshUpcoming,
  } = useData();
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const summary = analytics?.summary;

  const budgetsWithProgress = budgets?.budgets || [];

  const totalBudgetAlert = useMemo(() => {
    const over = budgetsWithProgress.filter((b) => b.progress >= 100);
    const warn = budgetsWithProgress.filter((b) => b.progress >= 80 && b.progress < 100);
    return { over: over.length, warn: warn.length };
  }, [budgetsWithProgress]);

  useEffect(() => {
    refreshAnalytics();
    refreshBudgets();
    refreshUpcoming();
  }, [refreshAnalytics, refreshBudgets, refreshUpcoming]);

  useEffect(() => {
    if (!totalBudgetAlert.over) return;
    sendNotification('Budget alert', `${totalBudgetAlert.over} budget(s) exceeded this month.`, { tag: 'budget' });
  }, [totalBudgetAlert.over]);

  const chartData = useMemo(
    () => (analytics?.categoryDist?.categories || []).map((c) => ({ name: c.name, value: c.total })),
    [analytics]
  );

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your financial overview for the last 30 days</p>
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

      {totalBudgetAlert.over > 0 && (
        <div className="alert alert-danger">
          {totalBudgetAlert.over} budget{totalBudgetAlert.over > 1 ? 's' : ''} exceeded. Check the Budgets page.
        </div>
      )}
      {totalBudgetAlert.over === 0 && totalBudgetAlert.warn > 0 && (
        <div className="alert alert-warning">
          {totalBudgetAlert.warn} budget{totalBudgetAlert.warn > 1 ? 's' : ''} are above 80%. Keep an eye on spending.
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          type="income"
          label="Total Income"
          value={formatCurrency(summary?.income)}
          hint={`${summary?.transactionCount ?? 0} transactions in range`}
        />
        <StatCard
          type="expense"
          label="Total Expenses"
          value={formatCurrency(summary?.expenses)}
          hint={`From ${formatDateShort(summary?.from)} to ${formatDateShort(summary?.to)}`}
        />
        <StatCard
          type="savings"
          label="Net Savings"
          value={formatCurrency(summary?.net)}
          hint={summary?.net >= 0 ? 'You are saving money' : 'You are overspending'}
        />
        <StatCard type="count" label="Transactions" value={summary?.transactionCount ?? 0} hint="Last 30 days" />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Budget status</div>
              <div className="card-subtitle">{currentMonthYear()}</div>
            </div>
            <Link to="/budgets" className="btn btn-sm btn-secondary">Manage</Link>
          </div>
          {loading.budgets ? (
            <div className="loading-dots"><span>Loading budgets...</span></div>
          ) : budgetsWithProgress.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No budgets set</div>
              <div className="empty-text">Set a monthly budget to track your category spending.</div>
              <Link to="/budgets" className="btn btn-sm">Set budgets</Link>
            </div>
          ) : (
            budgetsWithProgress.slice(0, 6).map((b) => (
              <BudgetProgressBar
                key={b.id}
                name={b.category_name}
                color={b.category_color}
                amount={b.amount}
                spent={b.spent}
                progress={b.progress}
              />
            ))
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Spending by category</div>
              <div className="card-subtitle">Last 30 days</div>
            </div>
          </div>
          {loading.analytics ? (
            <div className="loading-dots"><span>Loading...</span></div>
          ) : chartData.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No spending data</div>
              <div className="empty-text">Add expenses to see your category breakdown.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {chartData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent transactions</div>
              <div className="card-subtitle">Latest entries</div>
            </div>
            <Link to="/transactions" className="btn btn-sm btn-secondary">View all</Link>
          </div>
          <RecentTransactions categories={categories} onEdit={setEditing} onDelete={setDeleting} />
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Upcoming payments</div>
              <div className="card-subtitle">Next {upcoming.days} days from recurring</div>
            </div>
            <Bell size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          {upcoming.items.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Nothing scheduled</div>
              <div className="empty-text">Add recurring transactions in Settings to see upcoming payments here.</div>
              <Link to="/settings" className="btn btn-sm">Manage recurring</Link>
            </div>
          ) : (
            <div className="tx-list">
              {upcoming.items.map((r) => (
                <div className="tx-item" key={r.id}>
                  <div className={`tx-icon ${r.type === 'income' ? 'income' : 'expense'}`}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{r.frequency.slice(0, 3)}</span>
                  </div>
                  <div className="tx-main">
                    <div className="tx-title">{r.description}</div>
                    <div className="tx-meta">Due {r.next_date}</div>
                  </div>
                  <div className={`tx-amount ${r.type === 'income' ? 'income' : 'expense'}`}>
                    {r.type === 'income' ? '+' : '−'}{formatCurrency(r.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">What I spend most on</div>
              <div className="card-subtitle">Top merchants · last 30 days</div>
            </div>
          </div>
          <TopSpending merchants={analytics?.topSpending?.merchants} loading={loading.analytics} />
        </div>
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
        message={`This will permanently delete the ${deleting?.source !== undefined ? 'income' : 'expense'} of ${formatCurrency(deleting?.amount)}.`}
      />
    </>
  );
}

function RecentTransactions({ categories, onEdit, onDelete }) {
  const { income, expenses, loading } = useData();
  const recent = [...income.slice(0, 4), ...expenses.slice(0, 4)].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  if (loading.income && loading.expenses) return <div className="loading-dots"><span>Loading...</span></div>;
  return (
    <TransactionList
      items={recent}
      categories={categories}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function TopSpending({ merchants, loading }) {
  if (loading) return <div className="loading-dots"><span>Loading...</span></div>;
  if (!merchants || merchants.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No merchant data</div>
        <div className="empty-text">Add expenses to discover what you spend the most on.</div>
      </div>
    );
  }
  const max = Math.max(...merchants.map((m) => m.total), 1);
  return (
    <div className="tx-list">
      {merchants.map((m) => (
        <div className="tx-item" key={m.merchant}>
          <div className="tx-main">
            <div className="tx-title">{m.merchant}</div>
            <div className="tx-meta">{m.category} · {m.occurrences} purchase{m.occurrences > 1 ? 's' : ''}</div>
          </div>
          <div className="tx-amount expense">{formatCompact(m.total)}</div>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{data.name}</div>
      <div>{formatCurrency(data.value)}</div>
    </div>
  );
}

function formatDateShort(str) {
  if (!str) return '';
  const d = new Date(`${str}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
