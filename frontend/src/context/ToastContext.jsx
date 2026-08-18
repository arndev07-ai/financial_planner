import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, type = 'success', title) => {
      const id = ++toastId;
      setToasts((list) => [...list, { id, message, type, title }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const Icon = ({ type }) => {
    if (type === 'success') return <CheckCircle2 size={18} className="toast-icon success" />;
    if (type === 'error') return <AlertCircle size={18} className="toast-icon error" />;
    return <Info size={18} className="toast-icon info" />;
  };

  return (
    <ToastContext.Provider value={{ show, dismiss, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') }}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            <Icon type={t.type} />
            <div className="toast-body">
              {t.title && <strong className="toast-title">{t.title}</strong>}
              <span>{t.message}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
