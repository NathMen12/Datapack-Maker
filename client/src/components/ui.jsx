import React from 'react';
import { X } from 'lucide-react';

/* Petits composants UI reutilisables, styles Tailwind/CSS vars. */

export function Button({ variant = 'ghost', className = '', ...props }) {
  const cls = variant === 'primary' ? 'btn btn-primary' : variant === 'danger' ? 'btn btn-danger' : 'btn btn-ghost';
  return <button className={`${cls} ${className}`} {...props} />;
}

export function Field({ label, hint, children }) {
  return (
    <div className="mb-4">
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{hint}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl w-full flex flex-col max-h-[85vh]"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', maxWidth: wide ? '640px' : '420px' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, color = 'var(--accent-2)' }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5"
      style={{ color, border: `1px solid ${color}` }}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full animate-spin"
      style={{ border: '2px solid var(--border)', borderTopColor: 'var(--accent-2)' }}
    />
  );
}

export function ProgressBar({ percent, danger = false }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${p}%`, background: p >= 100 ? 'var(--danger)' : p >= 80 ? 'var(--warn)' : 'var(--accent-2)' }}
      />
    </div>
  );
}
