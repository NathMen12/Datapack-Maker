/* ============ Page Parametres du projet (/projects/:id/settings) ============
   Fonctionne pour les projets locaux (IndexedDB) ET cloud (API) :
   tout passe par le store useProjects qui gere les deux cas. */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Braces, Download, Image as ImageIcon, Trash2, X,
} from 'lucide-react';
import { useProjects } from '../stores/projects.js';
import { MC_VERSIONS, DEFAULT_MC_VERSION } from '../lib/datapack.js';
import { Button, Field, Spinner } from '../components/ui.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { exportToZip } from '../lib/zip.js';

const MAX_ICON = 512 * 1024;

function toDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(iso, fallback) {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString();
}

export default function ProjectSettings() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, loading, load, update, remove, getFiles } = useProjects();

  const project = useMemo(
    () => projects.find((p) => String(p.id) === String(id)),
    [projects, id],
  );

  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [version, setVersion] = useState(DEFAULT_MC_VERSION);
  const [description, setDescription] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState('');
  const [iconRemoved, setIconRemoved] = useState(false);
  const [fileCount, setFileCount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { load(); }, [load]);

  /* Remplit le formulaire quand le projet devient disponible ou change. */
  useEffect(() => {
    if (!project) return;
    setName(project.name || '');
    setNamespace(project.namespace || '');
    setVersion(project.minecraftVersion || DEFAULT_MC_VERSION);
    setDescription(project.description || '');
    setIconFile(null);
    setIconRemoved(false);
    setIconPreview(project.hasIcon
      ? (project.isLocal ? (project.icon || '') : `/api/projects/${project.rawId}/icon`)
      : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.hasIcon]);

  /* Nombre de fichiers du projet (information). */
  useEffect(() => {
    if (!project) return;
    let alive = true;
    getFiles(project.id)
      .then((list) => { if (alive) setFileCount(list.length); })
      .catch(() => { if (alive) setFileCount(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    if (!name.trim()) return setError(t('projects.nameRequired'));
    if (!/^[a-z0-9_-]+$/.test(namespace)) return setError(t('projects.invalidNamespace'));
    setSaving(true);
    try {
      const patch = {
        name: name.trim(),
        namespace: namespace.trim().toLowerCase(),
        minecraftVersion: version,
        description: description.trim(),
      };
      if (iconFile) {
        const dataUri = await toDataUri(iconFile);
        if (dataUri.length > MAX_ICON) throw new Error(t('projectSettings.iconTooBig'));
        patch.icon = dataUri;
      } else if (iconRemoved) {
        patch.icon = '';
      }
      await update(project.id, patch);
      setIconFile(null);
      setIconRemoved(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || t('projectSettings.error'));
    } finally {
      setSaving(false);
    }
  }

  async function onExport() {
    setBusy('export');
    setError('');
    try {
      const files = await getFiles(project.id);
      await exportToZip({
        name: project.name,
        files,
        icon: iconPreview && !iconRemoved ? iconPreview : '',
      });
    } catch (err) {
      setError(err.message || t('projectSettings.error'));
    } finally {
      setBusy('');
    }
  }

  async function onDelete() {
    setBusy('delete');
    try {
      await remove(project.id);
      navigate('/projects');
    } catch (err) {
      setError(err.message || t('projectSettings.error'));
      setBusy('');
    }
  }

  if (!project) {
    if (loading) {
      return <div className="flex justify-center py-24"><Spinner /></div>;
    }
    return (
      <div className="text-center py-24 anim-fade-in" style={{ color: 'var(--muted)' }}>
        <Braces size={40} className="mx-auto mb-3 opacity-60" />
        <p>{t('projectSettings.noProject')}</p>
        <Link to="/projects" className="btn btn-ghost mt-4 inline-flex items-center gap-1">
          <ArrowLeft size={15} /> {t('projectsPage.title')}
        </Link>
      </div>
    );
  }

  const details = [
    { label: t('projectSettings.badge'), value: project.isLocal ? t('projects.localBadge') : t('projects.cloudBadge') },
    { label: t('projectSettings.files'), value: fileCount === null ? '—' : String(fileCount) },
    { label: t('projectSettings.created'), value: fmtDate(project.createdAt, '—') },
    { label: t('projectSettings.updated'), value: fmtDate(project.updatedAt, '—') },
  ];

  return (
    <div className="min-h-full anim-page pb-16">
      <header className="border-b sticky top-0 z-40 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(13,17,23,.85)' }}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link to="/projects" className="btn btn-ghost !p-1.5" aria-label={t('projectSettings.back')}>
            <ArrowLeft size={18} />
          </Link>
          <span className="font-bold truncate" title={project.name}>{project.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
            {project.namespace}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 grid gap-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">{t('projectSettings.title')}</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('projectSettings.subtitle')}</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl p-6 anim-rise" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-4">{t('projectSettings.general')}</h2>

          <Field label={t('projectSettings.name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label={t('projectSettings.namespace')} hint={t('projectSettings.namespaceHint')}>
            <input className="input" value={namespace} onChange={(e) => setNamespace(e.target.value.toLowerCase())} spellCheck={false} />
          </Field>

          <Field label={t('projectSettings.version')}>
            <select className="select-css input" value={version} onChange={(e) => setVersion(e.target.value)}>
              {MC_VERSIONS.map((v) => (
                <option key={v.version} value={v.version}>{v.version} (pack_format {v.packFormat})</option>
              ))}
            </select>
          </Field>

          <Field label={t('projectSettings.description')}>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('projects.description')} />
          </Field>

          <Field label={t('projectSettings.icon')} hint={t('projectSettings.iconHint')}>
            <div className="flex items-center gap-4 flex-wrap">
              {iconPreview && !iconRemoved ? (
                <img src={iconPreview} alt="" className="w-16 h-16 rounded-lg" style={{ border: '1px solid var(--border)' }} />
              ) : (
                <span className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--panel-2)' }}>
                  <Braces size={20} className="text-emerald-400 opacity-70" />
                </span>
              )}
              <label className="btn btn-ghost cursor-pointer">
                <ImageIcon size={15} /> {t('projectSettings.chooseIcon')}
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setIconFile(f); setIconRemoved(false); setIconPreview(URL.createObjectURL(f)); }
                  }}
                />
              </label>
              {iconPreview && !iconRemoved && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setIconFile(null); setIconRemoved(true); setIconPreview(''); }}
                >
                  <X size={15} /> {t('projectSettings.removeIcon')}
                </button>
              )}
            </div>
          </Field>

          {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
          {saved && <p className="text-sm mb-3 text-emerald-400">{t('projectSettings.saved')}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/projects')}>{t('projects.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('projects.saving') : t('projectSettings.save')}</Button>
          </div>
        </form>

        <section className="rounded-2xl p-6 anim-rise" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-4">{t('projectSettings.details')}</h2>
          <dl className="grid sm:grid-cols-2 gap-4">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{d.label}</dt>
                <dd className="text-sm font-medium mt-0.5">{d.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl p-6 anim-rise" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-1">{t('projectSettings.actions')}</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('projectSettings.actionsHint')}</p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="primary" onClick={() => navigate(`/studio?project=${encodeURIComponent(project.id)}`)}>
              {t('projects.open')}
            </Button>
            <Button variant="ghost" onClick={onExport} disabled={busy === 'export'}>
              <Download size={15} /> {busy === 'export' ? t('projectSettings.exporting') : t('studio.exportZip')}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl p-6 anim-rise" style={{ background: 'rgba(248,113,113,.05)', border: '1px solid rgba(248,113,113,.28)' }}>
          <h2 className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>{t('projectSettings.dangerZone')}</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('projectSettings.dangerHint')}</p>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy === 'delete'}>
            <Trash2 size={15} /> {t('projects.delete')}
          </Button>
        </section>
      </main>

      {confirmDelete && (
        <ConfirmModal
          title={t('projects.delete')}
          message={t('projects.deleteConfirm', { name: project.name })}
          detail={project.name}
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
