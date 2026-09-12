import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import {
  Braces, ChevronRight, Download, Home, Image as ImageIcon,
  LogIn, Palette, Plus, Settings as SettingsIcon, Sparkles, Upload, AlertTriangle, Trash2, File, X,
} from 'lucide-react';
import { useAuth } from '../stores/auth.js';
import { useProjects } from '../stores/projects.js';
import { useSettings } from '../stores/settings.js';
import { api } from '../api/client.js';
import { mcfunction } from '../editor/lang-mcfunction.js';
import { staticCompletion, editorBase } from '../editor/setup.js';
import { mcHighlight } from '../editor/highlight.js';
import { makeAIVoiceExtension, fileName } from '../editor/ai-ghost.js';
import FileTree from '../components/FileTree.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import ColorToolModal from '../components/ColorToolModal.jsx';
import NameModal from '../components/NameModal.jsx';
import { Button, Modal } from '../components/ui.jsx';
import { exportToZip, importFromZip } from '../lib/zip.js';
import { getMCVersionInfo } from '../lib/datapack.js';

export default function Studio() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const user = useAuth((s) => s.user);
  const { projects, load, create, getFiles, saveFiles, remove, update } = useProjects();
  const settings = useSettings();

  const [activeProject, setActiveProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [activePath, setActivePath] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [quota, setQuota] = useState(null);
  const [toast, setToast] = useState(null); /* { kind: 'error'|'ok', text } */
  const [modal, setModal] = useState(null);
  const [nameModal, setNameModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [extraFolders, setExtraFolders] = useState(new Set()); /* dossiers crees sans fichier */
  const [openTabs, setOpenTabs] = useState([]);
  const iconInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const filesRef = useRef([]);
  filesRef.current = files;
  const saveTimer = useRef(null);

  function showToast(kind, text) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!projects.length || activeProject) return;
    const wanted = searchParams.get('project');
    const target = (wanted && projects.find((p) => String(p.id) === wanted)) || projects[0];
    if (target) openProject(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  async function openProject(p) {
    /* Activer le projet AVANT le chargement des fichiers : meme si le
       chargement echoue, activeProject n'est jamais null (fix "d is null"). */
    setActiveProject(p);
    try {
      const list = await getFiles(p.id);
      setFiles(list);
      const first = list.find((f) => f.path.endsWith('.mcfunction')) || list[0];
      if (first) { openTab(first.path, first.content); }
      else { setActivePath(''); setContent(''); }
      if (user) api.aiQuota().then((d) => setQuota(d.percentUsed)).catch(() => {});
    } catch (e) {
      showToast('error', e.message);
    }
  }

  /* ---------- Sauvegarde debounced ---------- */
  function scheduleSave(path, value) {
    if (!activeProject) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveFiles(activeProject.id, [{ path, content: value }], []);
        setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, path: f.path, content: value } : f)));
      } catch (e) {
        showToast('error', e.name === 'StorageFullError' ? t('studio.storageFull') : t('studio.storageError', { message: e.message }));
      } finally {
        setSaving(false);
      }
    }, settings.autosaveDelay || 1200);
  }

  function onEditorChange(value) {
    setContent(value);
    updateTabContent(activePath, value);
    if (activePath) scheduleSave(activePath, value);
  }
  /* ---------- Onglets multi-fichiers ---------- */
  function openTab(path, content) {
    setActivePath(path);
    setContent(content);
    setOpenTabs((tabs) => (tabs.some((x) => x.path === path) ? tabs : [...tabs, { path, content }]));
  }

  function closeTab(path) {
    const next = openTabs.filter((x) => x.path !== path);
    if (activePath === path) {
      const last = next[next.length - 1];
      if (last) { setActivePath(last.path); setContent(last.content); }
      else { setActivePath(""); setContent(""); }
    }
    setOpenTabs(next);
  }

  function selectTab(path) {
    const tab = openTabs.find((x) => x.path === path);
    if (!tab) return;
    setActivePath(path);
    setContent(tab.content);
  }

  function updateTabContent(path, value) {
    setOpenTabs((tabs) => tabs.map((x) => (x.path === path ? { ...x, content: value } : x)));
  }

  /* ---------- IA ---------- */
  const fetchAI = useCallback(
    async ({ prefix, context, fileName: fn }) => {
      if (!user || !settings.autocompleteEnabled) return { completion: '' };
      try {
        const res = await api.aiComplete({ prefix, context, fileName: fn });
        if (typeof res.percentUsed === 'number') setQuota(res.percentUsed);
        return res;
      } catch (e) {
        if (e.status === 403) setQuota(100);
        return { completion: '' };
      }
    },
    [user, settings.autocompleteEnabled]
  );

  /* ---------- Nouveau fichier / dossier / renommer / supprimer ---------- */
  function defaultDir() {
    if (activePath) return activePath.split('/').slice(0, -1).join('/');
    const mcVersion = activeProject?.minecraftVersion || '1.21.8';
    const folder = getMCVersionInfo(mcVersion).functionFolder;
    return `data/${activeProject?.namespace || 'custom'}/${folder}`;
  }

  /* Ouvre la modal de nommage. */
  function openNameModal(mode, oldPath) {
    setNameModal({ mode, oldPath: oldPath || null, defaultFolder: defaultDir() });
  }

  function listFolders() {
    const dirs = new Set();
    for (const f of filesRef.current) {
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    return [...dirs].sort();
  }

  async function submitNameModal(arg) {
    const name = arg.name; const folder = arg.folder; const mode = arg.mode; const oldPath = arg.oldPath;
    let path = folder ? folder + "/" + name : name;
    if (mode === "newFile" && !/\.(mcfunction|json)$/.test(path)) path += ".mcfunction";
    if (mode === "renameFile" && !/\.(mcfunction|json)$/.test(path)) {
      const ext = (String(oldPath).match(/\.(mcfunction|json)$/) || [])[0] || ".mcfunction";
      path += ext;
    }
    try {
      if (mode === "renameFile") {
        const file = filesRef.current.find((f) => f.path === oldPath);
        await saveFiles(activeProject.id, [{ path, content: file ? file.content : "" }], [oldPath]);
        setFiles((fs) => fs.map((f) => (f.path === oldPath ? { ...f, path } : f)));
        if (activePath === oldPath) setActivePath(path);
      } else if (mode === "newFolder") {
        setExtraFolders((set) => new Set([...set, path]));
        showToast("ok", t("studio.folderCreated"));
      } else {
        await saveFiles(activeProject.id, [{ path, content: "" }], []);
        setFiles((fs) => [...fs.filter((f) => f.path !== path), { path, content: "" }]);
        setActivePath(path);
        setContent("");
      }
    } catch (e) {
      showToast("error", t("studio.storageError", { message: e.message }));
    }
  }


  function deleteFile(path) {
    setConfirmDelete(path);
  }

  /* Suppression reelle, appelee par la modal de confirmation. */
  async function confirmDeleteFile() {
    const path = confirmDelete;
    setConfirmDelete(null);
    try {
      await saveFiles(activeProject.id, [], [path]);
      const remaining = filesRef.current.filter((f) => f.path !== path);
      setFiles(remaining);
      if (activePath === path) {
        if (remaining.length) { setActivePath(remaining[0].path); setContent(remaining[0].content); }
        else { setActivePath(""); setContent(""); }
      }
    } catch (e) {
      showToast("error", t("studio.storageError", { message: e.message }));
    }
  }

  function renameFile(oldPath) {
    openNameModal('renameFile', oldPath);
  }

  /* ---------- Import / Export ---------- */
  async function onImportZip(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await importFromZip(file);
      if (!data) return showToast('error', t('studio.importInvalid'));
      const project = await create(data);
      await openProject(project);
      showToast('ok', t('studio.importSuccess'));
    } catch (err) {
      showToast('error', t('studio.storageError', { message: err.message }));
    }
  }

  async function onExport() {
    if (!activeProject) return;
    try {
      let icon = '';
      if (activeProject.isLocal) {
        const { localDB } = await import('../lib/storage.js');
        const row = await localDB.getProject(activeProject.rawId);
        icon = row?.icon || '';
      } else {
        try {
          const res = await fetch(`/api/projects/${activeProject.rawId}/icon`);
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
      await exportToZip({ name: activeProject.name, files: filesRef.current, icon });
    } catch (e) {
      showToast('error', e.message);
    }
  }

  /* ---------- Icone du projet ---------- */
  async function onIconUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeProject) return;
    if (!/^image\/png$/.test(file.type) || file.size > 512 * 1024) {
      return showToast('error', t('studio.iconHint'));
    }
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(file);
    });
    try {
      await update(activeProject.id, { icon: dataUrl });
      setActiveProject((p) => ({ ...p, hasIcon: true, icon: dataUrl }));
      showToast('ok', t('studio.iconUpdated'));
    } catch (err) {
      showToast('error', err.message);
    }
  }

  /* ---------- Creation projet ---------- */
  async function handleCreateProject(data) {
    setModal(null);
    try {
      const project = await create(data);
      await openProject(project);
    } catch (e) {
      showToast('error', e.name === 'StorageFullError' ? t('studio.storageFull') : e.message);
    }
  }

  /* ---------- Rendu ---------- */
  const editorExtensions = useMemo(() => [
    mcfunction(),
    mcHighlight(),
    editorBase(),
    staticCompletion(),
    makeAIVoiceExtension({
      fetchCompletion: fetchAI,
      getEnabled: () => Boolean(user) && settings.autocompleteEnabled,
      getDelay: () => settings.autocompleteDelay || 700,
      onQuota: (p) => setQuota(p),
    }),
    fileName(activePath || 'function.mcfunction'),
  ], [fetchAI, user, settings.autocompleteEnabled, settings.autocompleteDelay, activePath]);

  return (
    <div className="h-full flex flex-col">
      {/* Barre superieure */}
      <header className="h-12 flex items-center justify-between px-4 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-1.5 font-bold"><Braces className="text-emerald-400 shrink-0" size={18} /> <span className="hidden sm:inline">Datapack Maker</span></Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="text-sm truncate max-w-[280px]" title={activeProject?.name}>
            {activeProject ? activeProject.name : t('app.openStudio')}
            {activeProject && <span className="ml-2" style={{ color: 'var(--muted)' }}>{activeProject.namespace}</span>}
          </span>
          {saving && <span className="text-xs anim-saving" style={{ color: 'var(--muted)' }}>{t('projects.saving')}</span>}
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }} title={t('studio.quota')}>
              <Sparkles size={12} className="text-emerald-400" />
              {quota !== null ? `${quota}%` : '—'}
            </span>
          ) : (
            <Link to="/login" className="btn btn-ghost !py-1 text-xs flex items-center gap-1" title={t('studio.connectForAI')}><LogIn size={12} /> {t('app.login')}</Link>
          )}
          <button className="btn btn-ghost !py-1.5 !px-2" title={t('studio.colorTool')} onClick={() => setModal('color')}><Palette size={15} /></button>
          <button className="btn btn-ghost !py-1.5 !px-2" title={t('studio.importZip')} onClick={() => zipInputRef.current?.click()}><Upload size={15} /></button>
          <button className="btn btn-ghost !py-1.5 !px-2" title={t('studio.exportZip')} onClick={onExport} disabled={!activeProject}><Download size={15} /></button>
          <button className="btn btn-ghost !py-1.5 !px-2" title={t('studio.changeIcon')} onClick={() => iconInputRef.current?.click()} disabled={!activeProject}><ImageIcon size={15} /></button>
          <button className="btn btn-ghost !py-1.5 !px-2" title={t('settings.title')} onClick={() => setModal('settings')}><SettingsIcon size={15} /></button>
          {user && <Link to="/dashboard" className="btn btn-ghost !py-1.5 text-xs"><Home size={13} /> {t('app.dashboard')}</Link>}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* La liste des projets vit dans la page Projets dediee. */}

        {/* Arborescence fichiers */}
        <aside className="w-60 border-r shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <FileTree
            files={files}
            extraFolders={[...extraFolders]}
            activePath={activePath}
            onOpen={(p) => { if (p.endsWith('.keep')) return; const f = filesRef.current.find((x) => x.path === p); openTab(p, f ? f.content : ''); }}
            onNewFile={() => openNameModal("newFile")}
            onNewFolder={() => openNameModal("newFolder")}
            onDelete={deleteFile}
            onRename={renameFile}
          />
        </aside>

        {/* Editeur */}
        <main className="flex-1 min-w-0 flex flex-col">
          {activePath || openTabs.length ? (
            <>
              {/* Barre d onglets multi-fichiers */}
              <div className="tabs-bar flex items-stretch overflow-x-auto border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                {openTabs.map((tab) => (
                  <div
                    key={tab.path}
                    className={"tab-item flex items-center gap-1.5 px-3 h-9 text-xs cursor-pointer shrink-0 border-r " + (activePath === tab.path ? "tab-active" : "")}
                    style={{ borderColor: "var(--border)", background: activePath === tab.path ? "var(--panel-2)" : undefined }}
                    onClick={() => selectTab(tab.path)}
                    title={tab.path}
                  >
                    <File size={13} className="shrink-0" style={{ color: activePath === tab.path ? "var(--accent-2)" : "var(--muted)" }} />
                    <span className="truncate max-w-[180px]">{tab.path.split("/").pop()}</span>
                    <button
                      className="ml-1 p-0.5 rounded hover:bg-[var(--border)] flex items-center"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                      title="Close"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {/* Barre de statut du fichier actif */}
              <div className="h-9 flex items-center gap-2 px-4 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                <span className="font-mono">{activePath}</span>
                {user && settings.autocompleteEnabled && (
                  <span className="ml-auto flex items-center gap-1"><Sparkles size={11} className="text-emerald-400" /> {t("editor.aiHint")} — Tab</span>
                )}
                {!user && <span className="ml-auto">{t("studio.connectForAI")}</span>}
                {user && !settings.autocompleteEnabled && <span className="ml-auto">{t("studio.aiDisabled")}</span>}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <CodeMirror
                  value={content}
                  height="100%"
                  theme="none"
                  basicSetup={false}
                  extensions={editorExtensions}
                  onChange={onEditorChange}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: 'var(--muted)' }}>
              <Braces size={48} className="text-emerald-400 opacity-50" />
              <p>{activeProject ? t('studio.newFile') : t('dashboard.noProjects')}</p>
              <Button variant="primary" className="flex items-center gap-1" onClick={() => setModal('newProject')}>
                <Plus size={16} /> {t('projects.newProject')}
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Inputs caches */}
      <input ref={iconInputRef} type="file" accept="image/png" hidden onChange={onIconUpload} />
      <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={onImportZip} />

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg px-4 py-3 flex items-start gap-2 text-sm shadow-xl toast-anim"
          style={{
            background: 'var(--panel)',
            border: `1px solid ${toast.kind === 'error' ? 'var(--danger)' : 'var(--accent-2)'}`,
          }}
        >
          {toast.kind === 'error' ? <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" /> : <Sparkles size={16} className="text-emerald-400 shrink-0 mt-0.5" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Modals */}
      {modal === 'newProject' && <NewProjectModal onClose={() => setModal(null)} onCreate={handleCreateProject} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'color' && <ColorToolModal onClose={() => setModal(null)} />}
      {nameModal && (
        <NameModal
          mode={nameModal.mode}
          oldPath={nameModal.oldPath || ''}
          defaultFolder={nameModal.defaultFolder}
          folders={{
            list: listFolders(),
            existingPaths: new Set(filesRef.current.map((f) => f.path)),
          }}
          onClose={() => setNameModal(null)}
          onSubmit={submitNameModal}
        />
      )}
      {confirmDelete && (
        <Modal title={t("studio.deleteFile")} onClose={() => setConfirmDelete(null)}>
          <div className="flex flex-col items-center gap-4">
            <Trash2 size={40} className="text-red-400" />
            <p className="text-sm text-center">{t("studio.deleteFileConfirm")}</p>
            <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>{confirmDelete}</p>
            <div className="flex gap-2">
              <Button onClick={() => setConfirmDelete(null)}>{t("projects.cancel")}</Button>
              <Button variant="danger" onClick={confirmDeleteFile}>{t("projects.delete")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

