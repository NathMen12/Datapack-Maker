import { Router } from 'express';
import { z } from 'zod';
import { queries, db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { filePath, filesArray, isValidPngDataUri } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const projectSchema = z.object({
  name: z.string().trim().min(1).max(64),
  namespace: z.string().trim().regex(/^[a-z0-9_-]+$/, { message: 'namespace invalide' }),
  minecraftVersion: z.string().trim().min(1),
  /* Pas de .default('') ici : combine a .partial() sur le PATCH, ce defaut
     s'appliquait meme quand le champ etait absent et VIDait la description
     a chaque mise a jour partielle (ex : simple changement d'icone). */
  description: z.string().max(500).optional(),
  icon: z.string().max(5 * 1024 * 1024).optional(),
  files: filesArray.optional(),
});

function projectRow(row) {
  return {
    id: row.id,
    name: row.name,
    namespace: row.namespace,
    minecraftVersion: row.minecraft_version,
    description: row.description,
    /* listProjects expose has_icon (il ne selectionne pas l'icone, trop lourde),
       alors que getProject fait SELECT * : on deduit dans ce cas. Sans ce
       repli, hasIcon valait toujours false sur GET /:id et PATCH /:id et
       l'icone ne s'affichait jamais apres enregistrement. */
    hasIcon: Boolean(row.has_icon ?? (row.icon && row.icon.length > 0)),
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

/* Detail d'un projet (charge la page Settings). */
router.get('/:id', (req, res) => {
  const project = queries.getProject.get(Number(req.params.id), req.user.id);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  res.json({ project: projectRow(project) });
});

router.post('/', (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const { name, namespace, minecraftVersion, description, files, icon } = parsed.data;
  const tx = db.transaction(() => {
    const info = queries.insertProject.run(req.user.id, name, namespace, minecraftVersion, description ?? '', icon || '');
    const pid = info.lastInsertRowid;
    for (const f of files || []) queries.upsertFile.run(pid, f.path, f.content);
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
  let icon = project.icon;
  if ('icon' in d && d.icon !== undefined) {
    if (d.icon && !isValidPngDataUri(d.icon)) {
      return res.status(400).json({ error: 'invalid_icon' });
    }
    icon = d.icon;
  }
  queries.updateProject.run(
    d.name ?? project.name,
    d.namespace ?? project.namespace,
    d.minecraftVersion ?? project.minecraft_version,
    d.description ?? project.description,
    icon,
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
  saves: filesArray,
  deletes: z.array(filePath).max(500),
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
  const icon = typeof req.body?.icon === 'string' ? req.body.icon : '';
  if (icon && !isValidPngDataUri(icon)) {
    return res.status(400).json({ error: 'invalid_icon' });
  }
  queries.updateProject.run(project.name, project.namespace, project.minecraft_version, project.description, icon, project.id, req.user.id);
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
  queries.updateProject.run(project.name, project.namespace, project.minecraft_version, project.description, '', project.id, req.user.id);
  res.json({ ok: true });
});

export default router;
