import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FilePlus2, FolderPlus, Pencil } from 'lucide-react';
import { Modal, Button, Field } from './ui.jsx';

/* ============================================================
   Modal de nommage reutilisable (nouveau fichier / dossier / renommer).
   - Saisie du NOM SEUL, plus besoin de retaper toute la racine.
   - Choix du dossier parent via un <select> des dossiers existants.
   - Messages d'erreur inline, focus auto, selection du nom.
   ============================================================ */

const NAME_RE = /^[a-z0-9_-]+$/i;

export default function NameModal({ mode, oldPath, folders, defaultFolder, onClose, onSubmit }) {
  const { t } = useTranslation();
  const isFolder = mode === 'newFolder' || mode === 'renameFolder';
  const isRename = mode === 'renameFile' || mode === 'renameFolder';

  const initialName = isRename ? (oldPath.split('/').pop() || '') : '';
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState(isRename ? (oldPath.split('/').slice(0, -1).join('/')) : (defaultFolder || ''));
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    /* Selectionne le nom sans l'extension pour un renommage rapide. */
    const dot = name.indexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : name.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon =
    mode === 'newFile' ? <FilePlus2 size={38} className="text-emerald-400" /> :
    mode === 'newFolder' ? <FolderPlus size={38} className="text-amber-400" /> :
    <Pencil size={38} className="text-emerald-400" />;

  const title =
    mode === 'newFile' ? t('studio.newFile') :
    mode === 'newFolder' ? t('studio.newFolder') :
    t('studio.renameFile');

  const hint = isFolder
    ? t('studio.nameFolderHint')
    : t('studio.nameFileHint');

  const fullPreview = useMemo(() => {
    const n = name.trim();
    if (!n) return '';
    const ext = isFolder ? '' : (/\.(mcfunction|json)$/.test(n) ? '' : '.mcfunction');
    return folder ? `${folder}/${n}${ext}` : `${n}${ext}`;
  }, [name, folder, isFolder]);
  const duplicate = useMemo(() => {
    if (!fullPreview) return false;
    return folders.existingPaths?.has(fullPreview) || false;
  }, [fullPreview, folders]);
  
  const tooManySlashes = false; /* Le select garantit un dossier valide. */

  function submit(e) {
    e.preventDefault();
    const n = name.trim().toLowerCase();
    if (!n) return setError(t('projects.nameRequired'));
    if (!NAME_RE.test(n.replace(/\.(mcfunction|json)$/, ''))) {
      return setError(t('projects.invalidNamespace'));
    }
    if (duplicate) return setError(t('studio.pathAlreadyExists'));
    onSubmit({ name: n, folder, mode });
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex justify-center mb-4">{icon}</div>
        {isRename && (
          <p className="text-xs mb-4 text-center font-mono" style={{ color: 'var(--muted)' }}>
            {oldPath}
          </p>
        )}
        <Field label={isFolder ? t('studio.folderName') : t('studio.fileName')} hint={hint}>
          <input
            ref={inputRef}
            className="input"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder={isFolder ? 'utils' : 'ma_fonction'}
            spellCheck={false}
            autoFocus
          />
        </Field>
        {!isRename && (
          <Field label={t('studio.parentFolder')}>
            <select
              className="input"
              value={folder}
              onChange={(e) => setFolder(e.target.value)
}
            >
              {folders.list.map((f) => (
                <option key={f} value={f}>
                  {f || '— racine du projet —'}
              </option>
              ))}
            </select>
          </Field>
        )}
        {fullPreview && (
          <p className="text-xs mb-4 -mt-2 font-mono anim-fade-in" style={{ color: duplicate ? 'var(--danger)' : 'var(--muted)' }}>
            {t('studio.resultingPath')} : {fullPreview}
          </p>        )}
        {duplicate && !error && (
          <p className="mb-3 text-sm flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={14} /> {t('studio.pathAlreadyExists')}
          </p>
        )}
        {error && <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
           <div className="flex gap-2 justify-end">
          <Button onClick={onClose}>{t('projects.cancel')}</Button>
          <Button variant="primary" type="submit">{isRename ? t('projects.save') : t('projects.create')}</Button>
        </div>
      </form>
    </Modal>
      );
}
