import { TriangleAlert, AlarmClock } from 'lucide-react';
import { formatCurrency } from '../utils/format';

function fillClass(progress) {
  if (progress >= 100) return 'over';
  if (progress >= 80) return 'warn';
  return 'ok';
}

export default function BudgetProgressBar({ name, color, amount, spent, progress, showAlerts = true }) {
  const status = progress >= 100 ? 'danger' : progress >= 80 ? 'warning' : 'ok';
  const remaining = Math.max(0, amount - spent);

  return (
    <div className="budget-item">
      <div className="budget-head">
        <span className="budget-cat">
          <span className="badge-dot" style={{ background: color || 'var(--primary)' }} />
          {name}
        </span>
        <span className="budget-amounts">
          {formatCurrency(spent)} / {formatCurrency(amount)}
        </span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
        <div className={`progress-fill ${fillClass(progress)}`} style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <div className="budget-head" style={{ marginTop: 6, marginBottom: 0 }}>
        <span className="budget-amounts" style={{ fontSize: 11.5 }}>
          {progress}% used
        </span>
        <span className="budget-amounts" style={{ fontSize: 11.5 }}>
          {status === 'danger' ? `Over by ${formatCurrency(spent - amount)}` : `${formatCurrency(remaining)} left`}
        </span>
      </div>
      {showAlerts && progress >= 100 && (
        <div className="alert alert-danger" style={{ marginTop: 10, marginBottom: 0 }}>
          <TriangleAlert size={16} />
          <span>Budget exceeded for {name}! You have spent {formatCurrency(spent)} of {formatCurrency(amount)}.</span>
        </div>
      )}
      {showAlerts && progress >= 80 && progress < 100 && (
        <div className="alert alert-warning" style={{ marginTop: 10, marginBottom: 0 }}>
          <AlarmClock size={16} />
          <span>Heads up: you have used {progress}% of the {name} budget.</span>
        </div>
      )}
    </div>
  );
}
