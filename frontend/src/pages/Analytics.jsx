import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { useData } from '../context/DataContext';
import StatCard from '../components/StatCard';
import { daysAgo, formatCurrency, formatCompact, formatDateShort, todayISO } from '../utils/format';

const CHART_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7', '#eab308', '#64748b'];
const EXPENSE_COLOR = '#ef4444';
const INCOME_COLOR = '#10b981';

const RANGES = [
  { label: '7D', days: 6 },
  { label: '30D', days: 29 },
  { label: '90D', days: 89 },
  { label: '12M', days: 364 },
];

export default function Analytics() {
  const { analytics, loading, refreshAnalytics } = useData();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayISO());

  useEffect(() => {
    refreshAnalytics({ from, to });
  }, [from, to, refreshAnalytics]);

  const summary = analytics?.summary;

  const dailyData = useMemo(() => {
    const days = analytics?.daily?.days || [];
    return days.map((d) => ({ ...d, label: formatDateShort(d.date) }));
  }, [analytics]);

  const catData = useMemo(
    () => (analytics?.categoryDist?.categories || []).slice(0, 8).map((c) => ({ name: c.name, value: c.total })),
    [analytics]
  );

  const weekData = useMemo(
    () =>
      (analytics?.weekly?.weeks || []).map((w) => ({
        name: `W${w.week.split('-')[1] || ''}`,
        spending: w.spending,
      })),
    [analytics]
  );

  const monthData = useMemo(() => {
    const months = analytics?.monthly?.months || [];
    return months.slice(-6).map((m) => ({ ...m, name: m.month }));
  }, [analytics]);

  const topMerchants = analytics?.topSpending?.merchants || [];
  const highDays = analytics?.highDays?.highDays || [];

  const avgDaily = analytics?.highDays?.avgDaily || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analytics &amp; Insights</h1>
          <p className="page-subtitle">Understand your spending patterns</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {RANGES.map((r) => (
            <button
              key={r.label}
              className="btn btn-sm btn-secondary"
              style={{ background: from === daysAgo(r.days) ? 'var(--primary-soft)' : undefined, color: from === daysAgo(r.days) ? 'var(--primary)' : undefined }}
              onClick={() => {
                setFrom(daysAgo(r.days));
                setTo(todayISO());
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span style={{ color: 'var(--text-muted)' }}>to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>

      <div className="stats-grid">
        <StatCard type="income" label="Total Income" value={formatCurrency(summary?.income)} hint={`${formatDateShort(summary?.from)} → ${formatDateShort(summary?.to)}`} />
        <StatCard type="expense" label="Total Expenses" value={formatCurrency(summary?.expenses)} hint="Sum of all expenses" />
        <StatCard type="savings" label="Net Savings" value={formatCurrency(summary?.net)} hint={summary?.net >= 0 ? 'Positive cash flow' : 'Negative cash flow'} />
        <StatCard type="count" label="Avg daily spend" value={formatCompact(avgDaily)} hint="Across the selected range" />
      </div>

      {loading.analytics ? (
        <div className="loading-dots"><span>Loading analytics...</span></div>
      ) : (
        <>
          <div className="chart-grid">
            <div className="card chart-full">
              <div className="card-header">
                <div>
                  <div className="card-title">Daily income vs spending</div>
                  <div className="card-subtitle">Daily totals across the selected range</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} tickMargin={6} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="income" name="Income" stroke={INCOME_COLOR} fill="url(#gIncome)" strokeWidth={2} />
                  <Area type="monotone" dataKey="spending" name="Spending" stroke={EXPENSE_COLOR} fill="url(#gExpense)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Spending by category</div>
                  <div className="card-subtitle">Where your money goes</div>
                </div>
              </div>
              {catData.length === 0 ? (
                <div className="empty"><div className="empty-title">No data</div><div className="empty-text">Add expenses to see distribution.</div></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2}>
                      {catData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Weekly spending trend</div>
                  <div className="card-subtitle">Total per calendar week</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weekData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="spending" name="Spending" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Monthly summary</div>
                  <div className="card-subtitle">Income vs spending by month</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickMargin={6} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="income" name="Income" stroke={INCOME_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spending" name="Spending" stroke={EXPENSE_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={17} color="var(--expense)" /> Top spending
                </div>
              </div>
              <TopMerchantsList merchants={topMerchants} />
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Flame size={17} color="var(--warning)" /> High-spending days
                </div>
              </div>
              {highDays.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">No unusual spending days</div>
                  <div className="empty-text">Days where spending exceeded the average by more than one standard deviation appear here.</div>
                </div>
              ) : (
                <div className="tx-list">
                  {highDays.slice(0, 6).map((d) => (
                    <div className="tx-item" key={d.date}>
                      <div className="tx-icon expense"><TrendingUp size={18} /></div>
                      <div className="tx-main">
                        <div className="tx-title">{formatDateShort(d.date)}</div>
                        <div className="tx-meta">{d.count} transaction{d.count > 1 ? 's' : ''} that day</div>
                      </div>
                      <div className="tx-amount expense">{formatCurrency(d.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TopMerchantsList({ merchants }) {
  if (!merchants || merchants.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No merchant data</div>
        <div className="empty-text">Add expenses to see your most frequent spending.</div>
      </div>
    );
  }
  const max = Math.max(...merchants.map((m) => m.total), 1);
  return (
    <div className="tx-list">
      {merchants.map((m, i) => (
        <div className="tx-item" key={m.merchant}>
          <div style={{ width: 22, fontWeight: 800, color: i < 3 ? 'var(--warning)' : 'var(--text-muted)' }}>{i + 1}</div>
          <div className="tx-main">
            <div className="tx-title">{m.merchant}</div>
            <div className="tx-meta">
              {m.category} · {m.occurrences}×
              <div className="progress" style={{ height: 5, marginTop: 6, maxWidth: 220 }}>
                <div className="progress-fill" style={{ width: `${(m.total / max) * 100}%`, background: 'var(--primary)' }} />
              </div>
            </div>
          </div>
          <div className="tx-amount expense">{formatCurrency(m.total)}</div>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label || payload[0].name}</div>
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {formatCurrency(p.value)}
        </div>
      ))}
    </div>
  );
}
