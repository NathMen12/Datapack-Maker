import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Palette } from 'lucide-react';
import { Modal, Button, Field } from './ui.jsx';
import { MC_COLORS, buildTextCommand, buildTextComponent } from '../lib/mcColors.js';

export default function ColorToolModal({ onClose }) {
  const { t } = useTranslation();
  const [text, setText] = useState('Hello world');
  const [color, setColor] = useState('gold');
  const [style, setStyle] = useState({ bold: false, italic: false, underlined: false, obfuscated: false });
  const [commandType, setCommandType] = useState('tellraw');
  const [target, setTarget] = useState('@a');
  const [copied, setCopied] = useState(false);

  const component = useMemo(() => buildTextComponent({ text, color, ...style }), [text, color, style]);
  const command = useMemo(() => buildTextCommand(commandType, target, component), [commandType, target, component]);
  const cssColor = useMemo(() => MC_COLORS.find((c) => c.name === color)?.css, [color]);

  function copy() {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const toggles = [
    ['bold', t('studio.bold')],
    ['italic', t('studio.italic')],
    ['underlined', t('studio.underline')],
    ['obfuscated', t('studio.obfuscated')],
  ];

  return (
    <Modal title={t('studio.colorToolTitle')} onClose={onClose} wide>
      <Field label={t('studio.text')}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label={t('studio.color')}>
        <div className="grid grid-cols-8 gap-2">
          {MC_COLORS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => setColor(c.name)}
              className="h-7 rounded border-2 flex items-center justify-center"
              style={{ background: c.css, borderColor: color === c.name ? 'var(--accent-2)' : 'transparent' }}
            >
              {color === c.name && <Check size={12} color="#000" /> }
            </button>
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap gap-2 mb-4">
        {toggles.map(([key, label]) => (
          <Button
            key={key}
            variant={style[key] ? 'primary' : 'ghost'}
            className="!py-1.5 text-sm"
            onClick={() => setStyle((s) => ({ ...s, [key]: !s[key] }))}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label={t('studio.commandType')}>
          <select className="input" value={commandType} onChange={(e) => setCommandType(e.target.value)}>
            <option value="tellraw">tellraw</option>
            <option value="title">title</option>
            <option value="subtitle">title subtitle</option>
            <option value="actionbar">title actionbar</option>
          </select>
        </Field>
        <Field label="Target">
          <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      </div>
      <Field label={t('studio.preview')}>
        <div
          className="rounded-lg p-4 text-2xl font-mono"
          style={{
            background: 'var(--panel-2)',
            color: cssColor,
            fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? 'italic' : 'normal',
            textDecoration: style.underlined ? 'underline' : 'none',
          }}
        >
          {text || '...'}
        </div>
      </Field>
      <div className="flex gap-2 items-center">
        <code className="flex-1 text-xs rounded-lg p-3 font-mono break-all" style={{ background: 'var(--panel-2)' }}>
          {command}
        </code>
        <Button variant="primary" onClick={copy} className="flex items-center gap-1">
          {copied ? <Check size={14} /> : <Copy size={14} />} {t('studio.copyCommand')}
        </Button>
      </div>
    </Modal>
  );
}
