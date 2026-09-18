/* ============ Partage d'un projet cloud : membres et permissions ============
   Invitations par e-mail ou pseudo, roles viewer/editor, retrait.
   L'etat complet (owner + membres + connectes) est renvoye par l'API
   apres chaque changement, ce qui evite toute derive locale. */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Trash2, UserPlus } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../stores/auth.js';
import { useProjects } from '../stores/projects.js';
import { Button, Spinner } from './ui.jsx';

const ROLES = ['viewer', 'editor'];

export default function ShareSection({ project }) {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const loadProjects = useProjects((s) => s.load);
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setState(await api.getCollaborators(project.rawId));
      setFailed(false);
    } catch {
      /* Acces peut-etre retire entre-temps : la section disparait. */
      setFailed(true);
    }
  }, [project.rawId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* La liste change aussi quand un autre membre la modifie : le Studio
     relaie l'evenement WebSocket en CustomEvent. */
  useEffect(() => {
    const onPing = (e) => {
      if (Number(e.detail?.projectId) === Number(project.rawId)) refresh();
    };
    window.addEventListener('dm:collaborators-changed', onPing);
    return () => window.removeEventListener('dm:collaborators-changed', onPing);
  }, [refresh, project.rawId]);

  const isOwner = state?.role === 'owner';
  const online = new Set((state?.online || []).map((u) => u.id));

  function errText(err) {
    return t(`sharing.errors.${err.message}`, { defaultValue: err.message });
  }

  async function invite(e) {
    e.preventDefault();
    setError('');
    const id = identifier.trim();
    if (!id) return;
    setBusy(true);
    try {
      /* E-mail (identifiant unique) ou pseudo, selon la saisie. */
      const body = id.includes('@') ? { email: id.toLowerCase(), role } : { username: id, role };
      setState(await api.inviteCollaborator(project.rawId, body));
      setIdentifier('');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId, newRole) {
    setError('');
    try { setState(await api.updateCollaborator(project.rawId, userId, newRole)); }
    catch (err) { setError(errText(err)); }
  }

  async function removeMember(userId) {
    setError('');
    try {
      setState(await api.removeCollaborator(project.rawId, userId));
      if (userId === user?.id) {
        /* Auto-retrait : le projet quitte la liste et la section se ferme. */
        await loadProjects();
        setFailed(true);
      }
    } catch (err) {
      setError(errText(err));
    }
  }

  if (failed) return null;
  if (!state) return <div className="flex justify-center py-6"><Spinner /></div>;

  return (
    <section className="rounded-2xl p-6 anim-rise" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
      <h2 className="font-semibold mb-1">{t('sharing.title')}</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{t('sharing.hint')}</p>

      {/* Membres */}
      <ul className="flex flex-col gap-2 mb-4">
        <li className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--panel-2)' }}>
          <Crown size={16} className="text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{state.owner?.username}</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('sharing.owner')}</div>
          </div>
          {online.has(state.owner?.id) && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title={t('sharing.online')} />
          )}
        </li>
        {(state.collaborators || []).map((c) => (
          <li key={c.userId} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--panel-2)' }}>
            <span
              className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
              style={{ border: '1px solid var(--accent-2)', color: 'var(--accent-2)' }}
            >
              {String(c.username || '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{c.username}</div>
              {c.email && <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{c.email}</div>}
            </div>
            {isOwner ? (
              <>
                <select
                  className="input !py-1 !px-2 text-xs w-auto"
                  value={c.role}
                  onChange={(e) => changeRole(c.userId, e.target.value)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{t(`sharing.roles.${r}`)}</option>)}
                </select>
                <button
                  className="btn btn-ghost !p-1.5 text-red-400"
                  title={t('sharing.remove')}
                  onClick={() => removeMember(c.userId)}
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{t(`sharing.roles.${c.role}`)}</span>
            )}
            {online.has(c.userId) && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title={t('sharing.online')} />
            )}
          </li>
        ))}
      </ul>

      {/* Invitation (proprietaire uniquement) ou auto-retrait */}
      {isOwner && (
        <form onSubmit={invite} className="flex gap-2 flex-wrap items-start">
          <input
            className="input flex-1 min-w-[200px]"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('sharing.identifierPlaceholder')}
          />
          <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`sharing.roles.${r}`)}</option>)}
          </select>
          <Button type="submit" variant="primary" disabled={busy || !identifier.trim()}>
            <UserPlus size={15} /> {t('sharing.invite')}
          </Button>
        </form>
      )}
      {!isOwner && (
        <Button variant="danger" onClick={() => removeMember(user?.id)} disabled={busy}>
          {t('sharing.leave')}
        </Button>
      )}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
    </section>
  );
}
