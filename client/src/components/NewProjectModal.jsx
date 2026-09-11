import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Field } from './ui.jsx';
import { MC_VERSIONS, DEFAULT_MC_VERSION } from '../lib/datapack.js';

/* ---------- Modal : nouveau projet ---------- */
export default function NewProjectModal({ onClose, onCreate }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [version, setVersion] = useState(DEFAULT_MC_VERSION);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (name && !namespace) {
      setNamespace(
        name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'mon_datapack'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError(t('projects.nameRequired'));
    if (!/^[a-z0-9_-]+$/.test(namespace)) return setError(t('projects.invalidNamespace'));
    onCreate({ name: name.trim(), namespace, minecraftVersion: version, description: description.trim() });
  }

  return (
    <Modal title={t('projects.newProject')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('projects.name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('projects.namespace')} hint={t('projects.namespaceHint')}>
          <input className="input" value={namespace} onChange={(e) => setNamespace(e.target.value.toLowerCase())} />
        </Field>
        <Field label={t('projects.version')}>
          <select className="select-css input" value={version} onChange={(e) => setVersion(e.target.value)}>
            {MC_VERSIONS.map((v) => (
              <option key={v.version} value={v.version}>{v.version} (pack_format {v.packFormat})</option>
            ))}
          </select>
        </Field>
        <Field label={t('projects.description')}>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button onClick={onClose}>{t('projects.cancel')}</Button>
          <Button variant="primary" type="submit">{t('projects.create')}</Button>
        </div>
      </form>
    </Modal>
  );
}
