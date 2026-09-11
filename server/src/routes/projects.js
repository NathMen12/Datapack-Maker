import { Router } from 'express';
import { z } from 'zod';
import { queries, db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const projectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  namespace: z.string().trim().regex(/^[a-z0-9_-]+$/, { message: 'namespace invalide' }),
  minecraftVersion: z.string().trim().min(1),
  description: z.string().max(500).optional().default(''),
  files: z.array(z.object({ path: z.string(), content: z.string() })).optional(),
});

function projectRow(row) {
  return {
    id: row.id,
    name: row.name,
    namespace: row.namespace,
    minecraftVersion: row.minecraft_version,
    description: row.description,
    hasIcon: Boolean(row.has_icon),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownProject(req, res) {
  const project = queries.getProject.get(Number(req.params.id), req.user.id);
  if (!project) {
    res.status(404).json({ error: 'project_not_found' });
    return null;
  }
  return project;
}

router.get('/me', (req, res) => {
  const rows = queries.listProjects.all(req.user.id).map(projectRow);
  res.json({ projects: rows });
});

router.post('/', (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const { name, namespace, minecraftVersion, description, files } = parsed.data;
  const tx = db.transaction(() => {
    const info = queries.insertProject.run(req.user.id, name, namespace, minecraftVersion, description, '');
    const pid = info.lastInsertRowid;
    for (const f of files || []) {
      queries.upsertFile.run(pid, f.path, f.content);
    }
    return pid;
  });
  const pid = tx();
  const row = queries.listProjects.all(req.user.id).find((p) => p.id === pid);
  res.status(201).json({ project: projectRow(row) });
});

router.patch('/:id', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const d = parsed.data;
  queries.updateProject.run(
    d.name ?? project.name,
    d.namespace ?? project.namespace,
    d.description ?? project.description,
    'icon' in d ? d.icon : project.icon,
    project.id,
    req.user.id
  );
  const row = queries.getProject.get(project.id, req.user.id);
  res.json({ project: projectRow(row) });
});

router.delete('/:id', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  queries.deleteProject.run(project.id, req.user.id);
  res.json({ ok: true });
});

router.get('/:id/files', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  res.json({ files: queries.listFiles.all(project.id) });
});

const saveFilesSchema = z.object({
  saves: z.array(z.object({ path: z.string(), content: z.string() })).max(500),
  deletes: z.array(z.string()).max(500),
});

router.put('/:id/files', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  const parsed = saveFilesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const { saves, deletes } = parsed.data;
  const tx = db.transaction(() => {
    for (const f of saves) queries.upsertFile.run(project.id, f.path, f.content);
    for (const p of deletes) queries.deleteFile.run(project.id, p);
    queries.touchProject.run(project.id);
  });
  tx();
  res.json({ ok: true });
});

router.post('/:id/icon', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  const icon = String(req.body?.icon || '');
  if (icon && !/^data:image\/png;base64,/.test(icon)) {
    return res.status(400).json({ error: 'invalid_icon' });
  }
  if (icon.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'icon_too_large' });
  }
  queries.updateProject.run(project.name, project.namespace, project.description, icon, project.id, req.user.id);
  res.json({ ok: true });
});

/* Icône du projet (PNG base64 en data URI). */
router.get('/:id/icon', (req, res) => {
  const project = queries.getProject.get(Number(req.params.id), req.user.id);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  if (!project.icon) return res.status(404).json({ error: 'no_icon' });
  const base64 = project.icon.split(',')[1] || '';
  res.set('Content-Type', 'image/png');
  res.send(Buffer.from(base64, 'base64'));
});

router.delete('/:id/icon', (req, res) => {
  const project = ownProject(req, res);
  if (!project) return;
  queries.updateProject.run(project.name, project.namespace, project.description, '', project.id, req.user.id);
  res.json({ ok: true });
});

export default router;
