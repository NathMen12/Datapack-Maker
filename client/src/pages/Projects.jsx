import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Braces, ChevronRight, CloudUpload, FolderKanban, HardDrive, Home, LogOut,
  Package, PenTool, Plus, Search, Sparkles, Trash2, Download,
} from 'lucide-react';
import { useAuth } from '../stores/auth.js';
import { useProjects } from '../stores/projects.js';
import { Badge, Button, ProgressBar, Spinner } from '../components/ui.jsx';
import { exportToZip } from '../lib/zip.js';

/* ============ Page Projets dediee (/projects) ============ */
export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { projects, loading, load, remove, migrateLocalToCloud, getFiles } = useProjects();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    load();
    import('../api/client.js').then(({ api }) =>
      api.aiQuota().then((d) => setQuota(d.percentUsed)).catch(() => {})  );
  }, [load]);

  const filtered = projects
    .filter((p) => (filter === 'all' ? true : filter === 'local' ? p.isLocal : !p.isLocal))
    .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function onMigrate(p) {
    setBusy(p.id);
    try { await migrateLocalToCloud(p.id); } catch (e) { console.error(e); }
    finally { setBusy(''); }
  }

  async function onDelete(p) {
    if (!window.confirm(t('projects.deleteConfirm', { name: p.name }))) return;
    setBusy(p.id);
    try { await remove(p.id); } catch (e) { console.error(e); }
    finally { setBusy(''); }
  }

  async function onExport(p) {
    setBusy(p.id);
    try {
      const files = await getFiles(p.id);
      let icon = p.icon || '';
      if (!p.isLocal && p.hasIcon) {
        try {
          const res = await fetch(`/api/projects/${p.rawId}/icon`);
          if (res.ok) {
            const blob = await res.blob();
            icon = await new Promise((resolve) => {
              const fr = new FileReader();
              fr.onload = () => resolve(fr.result);
              fr.readAsDataURL(blob);
            });
          }
        } catch { /* pas d'icone */ }
      }
      await exportToZip({ name: p.name, files, icon });
    } catch (e) { console.error(e); }
    finally { setBusy(''); }
  }

  const FILTERS = [
    { key: 'all', label: t('projectsPage.all') },
    { key: 'local', label: t('projectsPage.local') },
    { key: 'cloud', label: t('projectsPage.cloud') },
  ];

  return (
    <div className="min-h-full anim-page">
      <header className="border-b sticky top-0 z-40 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(13,17,23,.85)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Braces className="text-emerald-400" size={22} /> {t('app.name')}
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/studio" className="btn btn-ghost flex items-center gap-1"><PenTool size={15} /> {t('app.openStudio')}</Link>
            {user ? (
              <>
                <Link to="/dashboard" className="btn btn-ghost flex items-center gap-1"><Sparkles size={15} /> {t('app.dashboard')}</Link>
                <Button onClick={logout} className="flex items-center gap-1"><LogOut size={15} /> {t('app.logout')}</Button>
              </>
            ) : (
              <Link to="/login" className="btn btn-ghost flex items-center gap-1">{t('app.login')}</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-1">
          <FolderKanban size={28} className="text-emerald-400" />
          <h1 className="text-3xl font-bold">{t('projectsPage.title')}</h1>
        </div>
        <p className="mb-8" style={{ color: 'var(--muted)' }}>{t('projectsPage.subtitle')}</p>

        {/* Recherche + filtres */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input className="input pl-9" placeholder={t('projectsPage.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--panel-2)' }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className="px-3 py-1.5 text-sm rounded-md transition-all"
                style={{
                  background: filter === f.key ? 'var(--accent-2)' : 'transparent',
                  color: filter === f.key ? '#04140a' : 'var(--text)',
                  fontWeight: filter === f.key ? 600 : 400,
                }}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Link to="/studio" className="btn btn-primary flex items-center gap-1 ml-auto">
            <Plus size={15} /> {t('projects.newProject')}
          </Link>
        </div>

        {/* Grille projets */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 anim-fade-in">
            <FolderKanban size={40} className="mx-auto mb-3 text-emerald-400 opacity-60" />
            <p style={{ color: 'var(--muted)' }}>{t('projectsPage.empty')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <div
n                key={p.id}
                className="project-card rounded-xl p-4 flex flex-col gap-2 anim-rise"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms`, background: 'var(--panel)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.hasIcon ? (
                      <img src={p.isLocal ? p.icon : `/api/projects/${p.rawId}/icon`} alt="" className="w-11 h-11 rounded shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--panel-2)' }}>
                        <Braces size={18} className="text-emerald-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate" title={p.name}>{p.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{p.namespace} · {p.minecraftVersion}</div>
                    </div>
                  </div>
                  <Badge color={p.isLocal ? 'var(--warn)' : 'var(--accent-2)'}>
                    {p.isLocal ? t('projects.localBadge') : t('projects.cloudBadge')}
                  </Badge>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Button className="!py-1.5 text-sm flex-1 flex items-center justify-center gap-1" onClick={() => navigate(`/studio?project=${encodeURIComponent(p.id)}`)}>
                    <ChevronRight size={14} /> {t('projects.open')}
                  </Button>
                  {user && p.isLocal && (
                    <Button className="!py-1.5 text-sm" onClick={() => onMigrate(p)} disabled={busy === p.id} title={t('dashboard.migrate')}><CloudUpload size={14} /></Button>
                  )}
                  <Button className="!py-1.5 text-sm" onClick={() => onExport(p)} disabled={busy === p.id} title={t('studio.exportZip')}><Download size={14} /></Button>
                  <Button variant="danger" className="!py-1.5 text-sm" onClick={() => onDelete(p)}><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
