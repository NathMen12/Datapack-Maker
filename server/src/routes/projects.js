import { Router } from 'express';
import { z } from 'zod';
import { queries, db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { accessProject } from '../middleware/access.js';
import { broadcastToProject, projectPresence } from '../services/realtime.js';
import { filePath, filesArray, isValidPngDataUri } from '../middleware/validate.js';
import collaboratorsRouter from './collaborators.js';
import projectModrinthRouter from './projectModrinth.js';

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

/* Role de l'appelant sur le projet : 'owner' pour ses propres projets,
   'editor'/'viewer' pour les projets partages (voir middleware/access.js). */
function projectRow(row, role = 'owner') {
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
    modrinthProject: row.modrinth_project || '',
    role,
    shared: role !== 'owner',
    owner: row.owner_username || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/me', (req, res) => {
  /* Projets possedes + projets partages par quelqu'un d'autre. */
  const owned = queries.listProjects.all(req.user.id).map((p) => projectRow(p, 'owner'));
  const shared = queries.listSharedProjects.all(req.user.id).map((p) => projectRow(p, p.role));
  res.json({ projects: [...owned, ...shared] });
});

/* Detail d'un projet (charge la page Settings). */
router.get('/:id', accessProject('viewer'), (req, res) => {
  res.json({ project: projectRow(req.project, req.projectRole) });
});

/* Qui est connecte sur ce projet (indicateur de collaboration). */
router.get('/:id/presence', accessProject('viewer'), (req, res) => {
  res.json({ online: projectPresence(req.project.id), role: req.projectRole });
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

router.patch('/:id', accessProject('editor'), (req, res) => {
  const project = req.project;
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const d = parsed.data;
  /* Un editeur peut changer l'icone (bouton du studio) mais pas les reglages
     structurels du projet (nom, namespace, version, description) : ceux-ci
     restent reserves au proprietaire. */
  if (req.projectRole !== 'owner') {
    const forbiddenKeys = Object.keys(d).filter((k) => k !== 'icon');
    if (forbiddenKeys.length) {
      return res.status(403).json({ error: 'forbidden', requiredRole: 'owner', fields: forbiddenKeys });
    }
  }
  let icon = project.icon;
  if ('icon' in d && d.icon !== undefined) {
    if (d.icon && !isValidPngDataUri(d.icon)) {
      return res.status(400).json({ error: 'invalid_icon' });
    }
    icon = d.icon;
  }
  /* updateProjectById : pas de filtre user_id, l'acces est deja verifie
     par accessProject (un editeur peut modifier les metadonnees). */
  queries.updateProjectById.run(
    d.name ?? project.name,
    d.namespace ?? project.namespace,
    d.minecraftVersion ?? project.minecraft_version,
    d.description ?? project.description,
    icon,
    project.id
  );
  const row = queries.getProjectById.get(project.id);
  /* Les autres editeurs voient le changement sans recharger la page. */
  broadcastToProject(project.id, {
    type: 'project:changed',
    by: req.user.username,
    userId: req.user.id,
    project: projectRow(row, 'owner'),
  }, { exceptUserId: req.user.id });
  res.json({ project: projectRow(row, req.projectRole) });
});

router.delete('/:id', accessProject('owner'), (req, res) => {
  queries.deleteProject.run(req.project.id, req.user.id);
  /* Previent les collaborateurs eventuellement connectes sur ce projet. */
  broadcastToProject(req.project.id, { type: 'project:removed', projectId: req.project.id });
  res.json({ ok: true });
});

router.get('/:id/files', accessProject('viewer'), (req, res) => {
  res.json({ files: queries.listFiles.all(req.project.id) });
});

const saveFilesSchema = z.object({
  saves: filesArray,
  deletes: z.array(filePath).max(500),
});

router.put('/:id/files', accessProject('editor'), (req, res) => {
  const project = req.project;
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
  /* Diffusion temps reel : chaque fichier sauvegarde est pousse aux autres
     editeurs connectes (le WebSocket ne persiste rien, il ne fait que
     relayer ce qui vient d'etre ecrit en base). */
  for (const f of saves) {
    broadcastToProject(project.id, {
      type: 'file:change', path: f.path, content: f.content, by: req.user.username, userId: req.user.id,
    }, { exceptUserId: req.user.id });
  }
  for (const p of deletes) {
    broadcastToProject(project.id, {
      type: 'file:delete', path: p, by: req.user.username, userId: req.user.id,
    }, { exceptUserId: req.user.id });
  }
  res.json({ ok: true });
});

router.post('/:id/icon', accessProject('editor'), (req, res) => {
  const project = req.project;
  const icon = typeof req.body?.icon === 'string' ? req.body.icon : '';
  if (icon && !isValidPngDataUri(icon)) {
    return res.status(400).json({ error: 'invalid_icon' });
  }
  queries.updateProjectById.run(project.name, project.namespace, project.minecraft_version, project.description, icon, project.id);
  broadcastToProject(project.id, { type: 'project:icon', by: req.user.username }, { exceptUserId: req.user.id });
  res.json({ ok: true });
});

/* Icône du projet (PNG base64 en data URI). */
router.get('/:id/icon', accessProject('viewer'), (req, res) => {
  if (!req.project.icon) return res.status(404).json({ error: 'no_icon' });
  const base64 = req.project.icon.split(',')[1] || '';
  res.set('Content-Type', 'image/png');
  res.send(Buffer.from(base64, 'base64'));
});

router.delete('/:id/icon', accessProject('editor'), (req, res) => {
  const project = req.project;
  queries.updateProjectById.run(project.name, project.namespace, project.minecraft_version, project.description, '', project.id);
  broadcastToProject(project.id, { type: 'project:icon', by: req.user.username }, { exceptUserId: req.user.id });
  res.json({ ok: true });
});

/* Sous-routeurs : partage (collaborateurs) et publication Modrinth. */
router.use('/:id/collaborators', collaboratorsRouter);
router.use('/:id/modrinth', projectModrinthRouter);

export default router;
