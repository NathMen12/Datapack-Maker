import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal, Button } from './ui.jsx';

/* Modal de confirmation reutilisable (remplace window.confirm). */
export default function ConfirmModal({ title, message, detail, danger = true, onConfirm, onClose }) {
  const { t } = useTranslation();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 anim-fade-in">
        <span
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: danger ? 'rgba(248,113,113,.12)' : 'rgba(34,197,94,.12)' }}
        >
          {danger ? <Trash2 size={26} className="text-red-400" /> : <AlertTriangle size={26} className="text-amber-400" />}
        </span>
        <p className="text-sm text-center">{message}</p>
        {detail && (
          <p className="text-xs font-mono px-3 py-1.5 rounded" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
            {detail}
          </p>
        )}
        <div className="flex gap-2 mt-1">
          <Button onClick={onClose}>{t('projects.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
            {t('projects.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
