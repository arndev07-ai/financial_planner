import { Pencil, Trash2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/format';
import { getCategoryMeta } from '../utils/categories';

export default function TransactionList({ items, categories, onEdit, onDelete }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <ArrowDownCircle size={28} />
        </div>
        <div className="empty-title">No transactions yet</div>
        <div className="empty-text">Add your first transaction to start tracking your finances.</div>
      </div>
    );
  }

  return (
    <div className="tx-list">
      {items.map((item) => {
        const isIncome = Boolean(item.source !== undefined);
        const meta = getCategoryMeta(categories, item.category, isIncome ? 'income' : 'expense');
        return (
          <div className="tx-item" key={item.id}>
            <div className={`tx-icon ${isIncome ? 'income' : 'expense'}`}>
              {isIncome ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
            </div>
            <div className="tx-main">
              <div className="tx-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isIncome ? item.source : item.merchant}
                {item._pending && <span className="pending-tag">Pending</span>}
              </div>
              <div className="tx-meta">
                {meta && (
                  <span style={{ marginRight: 8 }}>
                    <span className="badge-dot" style={{ background: meta.color }} />
                  </span>
                )}
                {item.category} · {formatDate(item.date)}
                {item.receipt_path && ' · Receipt'}
              </div>
            </div>
            <div className={`tx-amount ${isIncome ? 'income' : 'expense'}`}>
              {isIncome ? '+' : '−'}
              {formatCurrency(item.amount)}
            </div>
            <div className="tx-actions">
              <button className="icon-btn" onClick={() => onEdit(item)} aria-label="Edit">
                <Pencil size={15} />
              </button>
              <button className="icon-btn" onClick={() => onDelete(item)} aria-label="Delete">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
