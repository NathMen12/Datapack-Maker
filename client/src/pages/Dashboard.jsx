import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Braces, ChevronRight, CloudUpload, FolderKanban, HardDrive, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../stores/auth.js';
import { useProjects } from '../stores/projects.js';
import { api } from '../api/client.js';
import { Badge, Button, ProgressBar } from '../components/ui.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { projects, load, migrateLocalToCloud, remove } = useProjects();
  const [quota, setQuota] = useState(null);
  const [localSize, setLocalSize] = useState(0);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    load();
    api.aiQuota().then((d) => setQuota(d.percentUsed)).catch(() => setQuota(null));
    import('../lib/storage.js').then(({ localDB }) => {
      localDB.estimateSize().then(setLocalSize).catch(() => {});
    });
  }, []);

  async function migrate(p) {
    setBusy(p.id);
    try {
      await migrateLocalToCloud(p.id);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy('');
    }
  }

  /* Ouvre la modal ; la suppression reelle attend la confirmation. */
  function askDelete(p) {
    setConfirmDelete(p);
  }

  async function confirmDeleteProject() {
    const p = confirmDelete;
    setConfirmDelete(null);
    try { await remove(p.id); } catch (e) { console.error(e); }
  }

  return (
    <div className="min-h-full">
      <header className="border-b sticky top-0 z-40 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(13,17,23,.85)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Braces className="text-emerald-400" size={22} /> {t('app.name')}
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/studio" className="btn btn-primary flex items-center gap-1">
              {t('app.openStudio')} <ChevronRight size={16} />
            </Link>
            <Button onClick={logout} className="flex items-center gap-1"><LogOut size={16} /> {t('app.logout')}</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-1">{t('dashboard.welcome', { name: user?.username })}</h1>
        <p className="mb-8" style={{ color: 'var(--muted)' }}>{t('dashboard.title')}</p>

        <div className="grid gap-4 md:grid-cols-2 mb-10">
          <div className="rounded-xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={18} className="text-emerald-400" />
              <h2 className="font-semibold">{t('dashboard.aiQuota')}</h2>
            </div>
            {quota === null ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>—</p>
            ) : (
              <>
                <div className="text-3xl font-extrabold mb-2">{quota}<span className="text-base font-normal"> %</span></div>
                <ProgressBar percent={quota} />
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{t('dashboard.aiQuotaToday')}</p>
              </>
            )}
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={18} className="text-emerald-400" />
              <h2 className="font-semibold">{t('dashboard.storage')}</h2>
            </div>
            <div className="text-3xl font-extrabold mb-2">{fmtSize(localSize)}</div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>IndexedDB + gzip</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{t('dashboard.projects')}</h2>
          <Link to="/projects" className="btn btn-ghost !py-1.5 text-sm flex items-center gap-1 anim-fade-in">
            <FolderKanban size={14} /> {t('dashboard.manageProjects')}
          </Link>
        </div>
        {projects.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('dashboard.noProjects')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl p-4 flex flex-col gap-2" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.hasIcon ? (
                      <img
                        src={p.isLocal ? p.icon : `/api/projects/${p.rawId}/icon`}
                        alt=""
                        className="w-10 h-10 rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--panel-2)' }}>
                        <Braces size={18} className="text-emerald-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{p.namespace} · {p.minecraftVersion}</div>
                    </div>
                  </div>
                  <Badge color={p.isLocal ? 'var(--warn)' : 'var(--accent-2)'}>
                    {p.isLocal ? t('projects.localBadge') : t('projects.cloudBadge')}
                  </Badge>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Button className="!py-1.5 text-sm flex-1" onClick={() => navigate(`/studio?project=${encodeURIComponent(p.id)}`)}>
                    {t('projects.open')}
                  </Button>
                  {p.isLocal && user && (
                    <Button className="!py-1.5 text-sm flex items-center gap-1" onClick={() => migrate(p)} disabled={busy === p.id} title={t('dashboard.migrate')}>
                      <CloudUpload size={14} />
                    </Button>
                  )}
                  <Button variant="danger" className="!py-1.5 text-sm" onClick={() => askDelete(p)}>{t('projects.delete')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {confirmDelete && (
        <ConfirmModal
          title={t("projects.delete")}
          message={t("projects.deleteConfirm", { name: confirmDelete.name })}
          detail={confirmDelete.name}
          onConfirm={confirmDeleteProject}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
