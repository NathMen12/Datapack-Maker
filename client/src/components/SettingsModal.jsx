import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Modal, Button, Field } from './ui.jsx';
import { useSettings } from '../stores/settings.js';
import { setLanguage } from '../i18n/index.js';

export default function SettingsModal({ onClose }) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const autocompleteEnabled = useSettings((s) => s.autocompleteEnabled);
  const update = useSettings((s) => s.update);
  const [saved, setSaved] = useState(false);

  function apply(partial) {
    update(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const langs = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
  ];

  return (
    <Modal title={t('settings.title')} onClose={onClose}>
      <Field label={t('settings.language')}>
        <div className="flex gap-2">
          {langs.map((l) => (
            <Button
              key={l.code}
              className="flex-1 flex items-center justify-center gap-1"
              variant={language === l.code ? 'primary' : 'ghost'}
              onClick={() => apply({ language: l.code })}
            >
              <Globe size={14} /> {l.label}
            </Button>
          ))}
        </div>
      </Field>

      <Field label={t('settings.autocomplete')}>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autocompleteEnabled}
            onChange={(e) => apply({ autocompleteEnabled: e.target.checked })}
          />
          {t('settings.autocomplete')}
        </label>
      </Field>

      <RangeField
        label={t('settings.autocompleteDelay')}
        value={useSettings.getState().autocompleteDelay}
        min={300} max={2000} step={100}
        onCommit={(v) => apply({ autocompleteDelay: v })}
      />
      <RangeField
        label={t('settings.autosave')}
        value={useSettings.getState().autosaveDelay}
        min={400} max={5000} step={200}
        onCommit={(v) => apply({ autosaveDelay: v })}
      />
      <RangeField
        label={t('settings.fontSize')}
        value={useSettings.getState().fontSize}
        min={11} max={22} step={1}
        onCommit={(v) => apply({ fontSize: v })}
      />

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-sm text-emerald-400">{t('settings.saved')}</span>}
        <Button variant="primary" onClick={onClose}>{t('settings.close')}</Button>
      </div>
    </Modal>
  );
}

function RangeField({ label, value, min, max, step, onCommit }) {
  const { t } = useTranslation();
  const [v, setV] = useState(value);
  return (
    <Field label={`${label} : ${v}${step === 1 ? 'px' : 'ms'}`}>
      <input
        type="range" min={min} max={max} step={step} value={v}
        className="w-full"
        onChange={(e) => setV(Number(e.target.value))}
        onMouseUp={() => onCommit(v)}
        onTouchEnd={() => onCommit(v)}
      />
    </Field>
  );
}
