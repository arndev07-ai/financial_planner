import { ArrowDownCircle, ArrowUpCircle, PiggyBank, ReceiptText } from 'lucide-react';

const ICONS = {
  income: { icon: ArrowDownCircle, className: 'income', label: 'Income' },
  expense: { icon: ArrowUpCircle, className: 'expense', label: 'Expenses' },
  savings: { icon: PiggyBank, className: 'savings', label: 'Net Savings' },
  count: { icon: ReceiptText, className: 'count', label: 'Transactions' },
};

export default function StatCard({ type, label, value, hint, accent = false }) {
  const def = ICONS[type] || ICONS.count;
  const Icon = def.icon;
  return (
    <div className={`card stat-card${accent ? ' stat-card-accent' : ''}`}>
      <div className={`stat-icon ${def.className}`}>
        <Icon size={20} />
      </div>
      <div className="stat-label">{label || def.label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
