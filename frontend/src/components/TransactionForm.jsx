import { useMemo, useRef, useState } from 'react';
import { ScanLine, Upload, Loader2, Sparkles } from 'lucide-react';
import api, { ApiError } from '../api/client';
import Modal from './Modal';
import { todayISO } from '../utils/format';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'CNY', 'CHF', 'SGD'];

const FIELD_DEFS = {
  income: [
    { key: 'source', label: 'Source', type: 'text', placeholder: 'e.g. Salary, Freelance', required: true },
    { key: 'category', label: 'Category', type: 'select', required: true },
    { key: 'amount', label: 'Amount', type: 'number', placeholder: '0.00', required: true, step: '0.01', min: '0' },
    { key: 'date', label: 'Date', type: 'date', required: true },
  ],
  expense: [
    { key: 'merchant', label: 'Merchant', type: 'text', placeholder: 'e.g. Starbucks', required: true },
    { key: 'category', label: 'Category', type: 'select', required: true },
    { key: 'amount', label: 'Amount', type: 'number', placeholder: '0.00', required: true, step: '0.01', min: '0' },
    { key: 'date', label: 'Date', type: 'date', required: true },
  ],
};

export default function TransactionForm({ type, categories, initial, projects = [], onSubmit, onClose }) {
  const isEdit = Boolean(initial);
  const fileRef = useRef(null);

  const [form, setForm] = useState(() => ({
    amount: initial?.amount ?? '',
    source: initial?.source ?? '',
    merchant: initial?.merchant ?? '',
    category: initial?.category ?? categories[0]?.name ?? '',
    date: initial?.date ?? todayISO(),
    is_recurring: Boolean(initial?.is_recurring),
    notes: initial?.notes ?? '',
    project_id: initial?.project_id ?? '',
    receipt_path: initial?.receipt_path ?? '',
    currency: initial?.currency ?? 'USD',
  }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [scanMeta, setScanMeta] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(initial?.receipt_path || '');

  const fields = FIELD_DEFS[type];
  const typeCats = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function validate() {
    const errs = {};
    const amount = Number(form.amount);
    if (!amount || amount <= 0) errs.amount = 'Amount must be greater than 0';
    if (isNaN(new Date(`${form.date}T00:00:00`).getTime())) errs.date = 'A valid date is required';
    const titleField = type === 'income' ? 'source' : 'merchant';
    if (!form[titleField].trim()) errs[titleField] = `${titleField === 'source' ? 'Source' : 'Merchant'} is required`;
    if (!form.category) errs.category = 'Category is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
      notes: form.notes?.trim() || undefined,
      currency: form.currency,
      ...(type === 'income'
        ? { source: form.source.trim(), is_recurring: form.is_recurring }
        : {
            merchant: form.merchant.trim(),
            receipt_path: form.receipt_path || undefined,
            project_id: form.project_id ? Number(form.project_id) : undefined,
          }),
    };
    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleScanFile(file) {
    if (!file) return;
    setScanning(true);
    setScanNote('');
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const res = await api.uploadReceipt(formData);
      setReceiptPreview(res.url);
      setForm((f) => ({
        ...f,
        merchant: res.scan.merchant || f.merchant,
        amount: res.scan.amount || f.amount,
        date: res.scan.date || f.date,
        receipt_path: res.url,
      }));
      setScanNote(res.scan.note);
      setScanMeta({
        source: res.scan.source,
        confidence: res.scan.confidence,
        merchant: res.scan.merchant,
        amount: res.scan.amount,
        date: res.scan.date,
      });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Receipt scan failed' });
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const inputProps = (field) => {
    if (field.type === 'select') {
      return {
        value: form.category,
        onChange: (e) => set('category', e.target.value),
      };
    }
    return {
      value: form[field.key],
      onChange: (e) => set(field.key, e.target.value),
    };
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isEdit ? 'Edit' : 'Add'} ${type === 'income' ? 'Income' : 'Expense'}`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 size={16} className="spin" />}
            {isEdit ? 'Save changes' : 'Add ' + (type === 'income' ? 'income' : 'expense')}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {errors.form && <div className="form-error">{errors.form}</div>}

        {type === 'expense' && (
          <div className="field">
            <label>Receipt (optional)</label>
            <div className="field-row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => handleScanFile(e.target.files?.[0])}
              />
              <button type="button" className="btn btn-secondary" disabled={scanning} onClick={() => fileRef.current?.click()}>
                {scanning ? <Loader2 size={16} className="spin" /> : <ScanLine size={16} />}
                Scan receipt
              </button>
            </div>
            {scanNote && <div className="alert alert-success" style={{ marginTop: 8, marginBottom: 0 }}>{scanNote}</div>}
            {scanMeta && (
              <div className="scan-confirm" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--primary-soft)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                  Scanned data {scanMeta.source === 'ocr' ? '(OCR)' : '(fallback)'}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    confidence {Math.round((scanMeta.confidence || 0) * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                  Merchant: <strong>{scanMeta.merchant}</strong> · Amount: <strong>{scanMeta.amount}</strong> · Date: <strong>{scanMeta.date}</strong>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Please verify the extracted details and correct any mistakes below before saving.
                </div>
              </div>
            )}
            {receiptPreview && (
              <div style={{ marginTop: 8 }}>
                <img src={receiptPreview} alt="Receipt" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
            )}
          </div>
        )}

        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            {field.type === 'select' ? (
              <select {...inputProps(field)}>
                {typeCats.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                placeholder={field.placeholder}
                step={field.step}
                min={field.min}
                {...inputProps(field)}
              />
            )}
            {errors[field.key] && <div className="form-error" style={{ marginBottom: 0, marginTop: 6 }}>{errors[field.key]}</div>}
          </div>
        ))}

        {type === 'expense' && projects.length > 0 && (
          <div className="field">
            <label>Project (optional)</label>
            <select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === 'income' && (
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="is_recurring"
              checked={form.is_recurring}
              onChange={(e) => set('is_recurring', e.target.checked)}
              style={{ width: 'auto' }}
            />
            <label htmlFor="is_recurring" style={{ margin: 0 }}>Recurring income</label>
          </div>
        )}

        <div className="field">
          <label>Currency</label>
          <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            rows={2}
            placeholder="Optional notes..."
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
