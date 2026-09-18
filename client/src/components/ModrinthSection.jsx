/* ============ Publication Modrinth d'un projet cloud ============
   Jeton PAT (jamais renvoye par l'API), liaison a un projet Modrinth,
   formulaire pre-rempli (numero/nom/version de jeu suggerees) puis
   publication du ZIP genere cote client. Consultation possible pour
   les membres, publication reservee au proprietaire (cote serveur). */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Link2, RefreshCw, Rocket, Trash2, Unlink } from 'lucide-react';
import { api } from '../api/client.js';
import { useProjects } from '../stores/projects.js';
import { MC_VERSIONS } from '../lib/datapack.js';
import { buildZipBase64 } from '../lib/zip.js';
import { Button, Field, Spinner } from './ui.jsx';

const VERSION_TYPES = ['release', 'beta', 'alpha'];

function errText(t, err) {
  return t(`modrinth.errors.${err.message}`, { defaultValue: err.message });
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export default function ModrinthSection({ project }) {
  const { t } = useTranslation();
  const getFiles = useProjects((s) => s.getFiles);
  const [account, setAccount] = useState(null);
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [busy, setBusy] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [modrinthProjects, setModrinthProjects] = useState([]);
  const [form, setForm] = useState({
    versionNumber: '', name: '', changelog: '', versionType: 'release', gameVersions: [],
  });

  const refreshAccount = useCallback(async () => {
    try { setAccount((await api.getModrinthAccount()).account); }
    catch { setAccount(null); }
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const s = await api.getModrinthState(project.rawId);
      setState(s);
      setFailed(false);
      /* Pre-remplissage : numero et nom suggerees + versions de jeu compatibles. */
      setForm((f) => ({
        ...f,
        versionNumber: s.suggestedVersionNumber || f.versionNumber,
        name: s.suggestedName || f.name,
        gameVersions: s.suggestedGameVersions?.length ? s.suggestedGameVersions : f.gameVersions,
      }));
    } catch {
      setFailed(true);
    }
  }, [project.rawId]);

  useEffect(() => { refreshAccount(); refreshState(); }, [refreshAccount, refreshState]);

  const isOwner = state?.role === 'owner';

  /* Versions proposables : suggestions de l'API + toutes les versions
     partageant le pack_format du projet (meme compatibilite). */
  const candidateVersions = (() => {
    const set = new Set(state?.suggestedGameVersions || []);
    const fmt = MC_VERSIONS.find((v) => v.version === (state?.minecraftVersion || project.minecraftVersion))?.packFormat;
    if (fmt !== undefined) for (const v of MC_VERSIONS) if (v.packFormat === fmt) set.add(v.version);
    return MC_VERSIONS.filter((v) => set.has(v.version)).map((v) => v.version);
  })();

  function toggleGameVersion(v) {
    setForm((f) => ({
      ...f,
      gameVersions: f.gameVersions.includes(v)
        ? f.gameVersions.filter((x) => x !== v)
        : [...f.gameVersions, v],
    }));
  }

  async function saveToken(e) {
    e.preventDefault();
    setError('');
    if (!tokenInput.trim()) return;
    setBusy('token');
    try {
      /* Verifie par l'API avant enregistrement ; jamais renvoye ensuite. */
      setAccount((await api.saveModrinthToken(tokenInput.trim())).account);
      setTokenInput('');
      refreshState();
    } catch (err) { setError(errText(t, err)); }
    finally { setBusy(''); }
  }

  async function deleteToken() {
    setError('');
    setBusy('token');
    try { setAccount((await api.deleteModrinthToken()).account); }
    catch (err) { setError(errText(t, err)); }
    finally { setBusy(''); }
  }

  async function loadModrinthProjects() {
    setBusy('projects');
    try { setModrinthProjects((await api.listModrinthProjects()).projects || []); }
    catch (err) { setError(errText(t, err)); }
    finally { setBusy(''); }
  }

  async function link(ref) {
    setError('');
    setBusy('link');
    try {
      await api.linkModrinth(project.rawId, { project: ref });
      setLinkInput('');
      setPublishedUrl('');
      await refreshState();
    } catch (err) { setError(errText(t, err)); }
    finally { setBusy(''); }
  }

  async function unlink() {
    setError('');
    setBusy('link');
    try {
      await api.unlinkModrinth(project.rawId);
      setModrinthProjects([]);
      setPublishedUrl('');
      await refreshState();
    } catch (err) { setError(errText(t, err)); }
    finally { setBusy(''); }
  }

  async function publish(e) {
    e.preventDefault();
    setError('');
    setPublishedUrl('');
    if (!form.versionNumber.trim() || !form.name.trim()) { setError(t('modrinth.formRequired')); return; }
    if (!form.gameVersions.length) { setError(t('modrinth.gameVersionRequired')); return; }
    setPublishing(true);
    try {
      const files = await getFiles(project.id);
      if (!files.length) throw new Error('no_files');
      /* Icone optionnelle du projet (pack.png dans l'archive). */
      let icon = '';
      try {
        const res = await fetch(`/api/projects/${project.rawId}/icon`);
        if (res.ok) icon = await blobToDataUri(await res.blob());
      } catch { /* pas d'icone */ }
      const zip = await buildZipBase64({ files, icon });
      const res = await api.publishModrinth(project.rawId, {
        zip,
        versionNumber: form.versionNumber.trim(),
        name: form.name.trim(),
        changelog: form.changelog,
        gameVersions: form.gameVersions,
        versionType: form.versionType,
      });
      setPublishedUrl(res.version?.url || '');
      await refreshState();
    } catch (err) {
      setError(errText(t, err));
    } finally {
      setPublishing(false);
    }
  }

  if (failed) return null;
  if (!account || !state) return <div className="flex justify-center py-6"><Spinner /></div>;

  return (
    <section className="rounded-2xl p-6 anim-rise" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
      <h2 className="font-semibold mb-1">{t('modrinth.title')}</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('modrinth.hint')}</p>

      {/* --- Compte / jeton d'acces personnel --- */}
      <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--panel-2)' }}>
        {account.linked && account.valid ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {t('modrinth.tokenOk', { username: account.username })}
            </span>
            <Button className="ml-auto" onClick={deleteToken} disabled={busy === 'token'}>
              <Trash2 size={14} /> {t('modrinth.removeToken')}
            </Button>
          </div>
        ) : (
          <form onSubmit={saveToken} className="flex flex-col gap-2">
            {account.linked && !account.valid && (
              <p className="text-xs" style={{ color: 'var(--warn)' }}>{t('modrinth.tokenInvalid')}</p>
            )}
            <p className="text-sm">{t('modrinth.tokenNeeded')}</p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="input flex-1 min-w-[220px] font-mono"
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={t('modrinth.tokenPlaceholder')}
                autoComplete="off"
              />
              <Button type="submit" variant="primary" disabled={busy === 'token' || tokenInput.trim().length < 8}>
                {t('modrinth.saveToken')}
              </Button>
            </div>
            <a
              className="text-xs underline"
              href="https://modrinth.com/settings/pats"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--muted)' }}
            >
              {t('modrinth.tokenHelp')}
            </a>
          </form>
        )}
      </div>

      {/* --- Liaison a un projet Modrinth --- */}
      {state.linked && state.project ? (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'var(--panel-2)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{state.project.title}</div>
            <a
              className="text-xs underline"
              href={state.project.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-2)' }}
            >
              {state.project.url.replace('https://', '')} <ExternalLink size={10} className="inline" />
            </a>
          </div>
          {isOwner && (
            <Button onClick={unlink} disabled={busy === 'link'}>
              <Unlink size={14} /> {t('modrinth.unlink')}
            </Button>
          )}
        </div>
      ) : isOwner ? (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--panel-2)' }}>
          <p className="text-sm mb-2">{t('modrinth.linkHint')}</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              className="input flex-1 min-w-[200px]"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={t('modrinth.linkPlaceholder')}
            />
            <Button variant="primary" onClick={() => link(linkInput.trim())} disabled={busy === 'link' || !linkInput.trim()}>
              <Link2 size={15} /> {t('modrinth.link')}
            </Button>
            {account.linked && account.valid && (
              <Button onClick={loadModrinthProjects} disabled={busy === 'projects'}>
                <RefreshCw size={14} /> {busy === 'projects' ? t('modrinth.loading') : t('modrinth.listMine')}
              </Button>
            )}
          </div>
          {modrinthProjects.length > 0 && (
            <ul className="flex flex-col gap-1 mt-2">
              {modrinthProjects.map((p) => (
                <li key={p.id}>
                  <button className="btn btn-ghost !py-1 text-xs" onClick={() => link(p.slug)} disabled={busy === 'link'}>
                    {p.title} <span style={{ color: 'var(--muted)' }}>({p.slug})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('modrinth.notLinkedOwnerOnly')}</p>
      )}

      {/* --- Formulaire de publication --- */}
      {state.linked && (
        <form onSubmit={publish}>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label={t('modrinth.versionNumber')}>
              <input
                className="input"
                value={form.versionNumber}
                onChange={(e) => setForm((f) => ({ ...f, versionNumber: e.target.value }))}
              />
            </Field>
            <Field label={t('modrinth.versionName')}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t('modrinth.gameVersions')} hint={t('modrinth.gameVersionsHint')}>
            <div className="flex flex-wrap gap-2">
              {candidateVersions.map((v) => {
                const checked = form.gameVersions.includes(v);
                return (
                  <button
                    type="button"
                    key={v}
                    onClick={() => toggleGameVersion(v)}
                    className="btn !py-1 !px-2 text-xs"
                    style={checked
                      ? { background: 'var(--accent-2)', color: '#0b0f14', borderColor: 'var(--accent-2)' }
                      : { color: 'var(--muted)', borderColor: 'var(--border)' }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t('modrinth.versionType')}>
            <select
              className="input"
              value={form.versionType}
              onChange={(e) => setForm((f) => ({ ...f, versionType: e.target.value }))}
            >
              {VERSION_TYPES.map((vt) => <option key={vt} value={vt}>{t(`modrinth.types.${vt}`)}</option>)}
            </select>
          </Field>
          <Field label={t('modrinth.changelog')}>
            <textarea
              className="input"
              rows={3}
              value={form.changelog}
              onChange={(e) => setForm((f) => ({ ...f, changelog: e.target.value }))}
            />
          </Field>

          {isOwner ? (
            <Button type="submit" variant="primary" disabled={publishing}>
              <Rocket size={15} /> {publishing ? t('modrinth.publishing') : t('modrinth.publish')}
            </Button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('modrinth.publishOwnerOnly')}</p>
          )}
          {publishedUrl && (
            <p className="text-sm mt-2">
              <span className="text-emerald-400 mr-1">✓</span>
              <a className="underline" href={publishedUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)' }}>
                {t('modrinth.published')} <ExternalLink size={10} className="inline" />
              </a>
            </p>
          )}
        </form>
      )}

      {/* --- Versions deja publiees --- */}
      {(state.publishedVersions || []).length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>
            {t('modrinth.publishedVersions')}
          </h3>
          <ul className="flex flex-col gap-1">
            {state.publishedVersions.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-xs rounded px-2 py-1" style={{ background: 'var(--panel-2)' }}>
                <span className="font-mono">{v.versionNumber}</span>
                <span style={{ color: 'var(--muted)' }}>{v.gameVersions?.join(', ')}</span>
                <span className="ml-auto" style={{ color: 'var(--muted)' }}>
                  {new Date(v.datePublished).toLocaleDateString()} · {v.downloads} ↓
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
    </section>
  );
}
