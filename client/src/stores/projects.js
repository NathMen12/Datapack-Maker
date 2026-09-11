import { create } from 'zustand';
import { api } from '../api/client.js';
import { localDB, STORAGE_LIMIT_BYTES } from '../lib/storage.js';
import { buildDatapackStructure } from '../lib/datapack.js';

/* Normalisation : le client manipule toujours le meme format de projet,
   qu'il soit local (IndexedDB) ou distant (API). */
function normLocal(p) {
  return {
    id: `local-${p.id}`,
    name: p.name,
    namespace: p.namespace,
    minecraftVersion: p.minecraft_version ?? p.minecraftVersion,
    description: p.description ?? '',
    hasIcon: Boolean(p.icon),
    icon: p.icon || null,
    updatedAt: p.updated_at ?? p.updatedAt,
    createdAt: p.created_at ?? p.createdAt,
    isLocal: true,
    rawId: p.id,
  };
}

function normCloud(p) {
  return { ...p, isLocal: false };
}

export const useProjects = create((set, get) => ({
  projects: [],
  loading: true,
  saveError: null,

  load: async () => {
    set({ loading: true });
    const { useAuth } = await import('./auth.js');
    const user = useAuth.getState().user;
    let projects = [];
    try {
      if (user) {
        const { projects: rows } = await api.listProjects();
        projects = rows.map(normCloud);
        /* Fusionner les projets locaux non encore migres */
        const locals = await localDB.listProjects();
        for (const lp of locals) {
          projects.push(normLocal(lp));
        }
      } else {
        const locals = await localDB.listProjects();
        projects = locals.map(normLocal);
      }
    } catch (e) {
      console.error('Chargement des projets', e);
    }
    set({ projects, loading: false });
  },

  create: async (data) => {
    const { useAuth } = await import('./auth.js');
    const user = useAuth.getState().user;
    const files = data.files?.length ? data.files : buildDatapackStructure(data);
    let project;
    if (user) {
      const { project: row } = await api.createProject({
        name: data.name,
        namespace: data.namespace,
        minecraftVersion: data.minecraftVersion,
        description: data.description || '',
        files,
      });
      project = normCloud(row);
      if (data.icon) {
        try {
          await api.setIcon(row.id, data.icon);
          project.hasIcon = true;
        } catch { /* icone optionnelle */ }
      }
    } else {
      const row = await localDB.createProject({ ...data, icon: data.icon || '' });
      for (const f of files) {
        await localDB.upsertFile(row.id, f.path, f.content);
      }
      const full = await localDB.getProject(row.id);
      project = normLocal(full);
    }
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  getFiles: async (projectId) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return [];
    if (p.isLocal) {
      return localDB.listFiles(p.rawId);
    }
    const { files } = await api.getFiles(p.rawId);
    return files.map((f) => ({ path: f.path, content: f.content }));
  },

  saveFiles: async (projectId, saves, deletes) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return;
    if (p.isLocal) {
      await localDB.saveFiles(p.rawId, saves, deletes);
      localDB.estimateSize().then((size) => set({ localSize: size }));
    } else {
      await api.saveFiles(p.rawId, saves, deletes);
    }
  },

  remove: async (projectId) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return;
    if (p.isLocal) await localDB.deleteProject(p.rawId);
    else await api.deleteProject(p.rawId);
    set((s) => ({ projects: s.projects.filter((x) => x.id !== projectId) }));
  },

  update: async (projectId, patch) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return;
    if (p.isLocal) {
      await localDB.updateProject(p.rawId, {
        name: patch.name,
        namespace: patch.namespace,
        description: patch.description,
        icon: patch.icon,
        minecraft_version: patch.minecraftVersion,
      });
    } else {
      const { icon, ...rest } = patch;
      if (Object.keys(rest).length) await api.updateProject(p.rawId, rest);
      if (icon !== undefined) await api.setIcon(p.rawId, icon);
    }
    set((s) => ({
      projects: s.projects.map((x) => (x.id === projectId ? { ...x, ...patch, hasIcon: patch.icon ? true : x.hasIcon } : x)),
    }));
  },

  migrateLocalToCloud: async (projectId) => {
    const p = get().projects.find((x) => x.id === projectId);
    if (!p || !p.isLocal) return null;
    const files = await localDB.listFiles(p.rawId);
    const icon = p.icon || '';
    const { project: row } = await api.createProject({
      name: p.name,
      namespace: p.namespace,
      minecraftVersion: p.minecraftVersion,
      description: p.description || '',
      files: files.map((f) => ({ path: f.path, content: f.content })),
    });
    if (icon) await api.setIcon(row.id, icon);
    await localDB.deleteProject(p.rawId);
    const created = normCloud(row);
    if (icon) created.hasIcon = true;
    set((s) => ({
      projects: s.projects.map((x) => (x.id === projectId ? created : x)),
    }));
    return created;
  },
}));

export default useProjects;
