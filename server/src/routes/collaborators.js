import { Router } from 'express';
import { z } from 'zod';
import { queries } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { accessProject } from '../middleware/access.js';
import { broadcastToProject, broadcastToUser, projectPresence } from '../services/realtime.js';

/* ============================================================
   Collaboration : gestion des membres d'un projet.

   Monte sur /api/projects/:id/collaborators (mergeParams).

   Permissions :
     - consulter la liste : tout membre (owner / editor / viewer) ;
     - inviter, changer un role, retirer quelqu'un : proprietaire ;
     - se retirer soi-meme (quitter un projet partage) : tout membre.
   Le proprietaire n'apparait pas dans la table : il est renvoye a part.
   ============================================================ */

const router = Router({ mergeParams: true });
router.use(requireAuth);
/* La liste des membres n'est visible que par ceux qui ont deja acces. */
router.use(accessProject('viewer'));

const inviteSchema = z.object({
  /* Invitation par e-mail (identifiant unique) ou par nom d'utilisateur. */
  email: z.string().trim().email().max(254).optional(),
  username: z.string().trim().min(3).max(32).optional(),
  role: z.enum(['viewer', 'editor']).default('editor'),
}).refine((d) => Boolean(d.email || d.username), { message: 'email_or_username_required' });

const roleSchema = z.object({ role: z.enum(['viewer', 'editor']) });

function memberRows(project, includeEmail) {
  return queries.listCollaborators.all(project.id).map((c) => ({
    userId: c.user_id,
    username: c.username,
    email: includeEmail ? c.email : undefined,
    role: c.role,
    since: c.created_at,
  }));
}

/* Renvoie l'etat complet (proprietaire + membres + connectes) : utilise
   par l'interface apres chaque changement. */
function shareState(project, viewerRole) {
  const owner = queries.getUserById.get(project.user_id);
  return {
    owner: { id: project.user_id, username: owner?.username || 'owner' },
    collaborators: memberRows(project, viewerRole === 'owner'),
    online: projectPresence(project.id),
    role: viewerRole,
  };
}

function notifyChange(project) {
  broadcastToProject(project.id, { type: 'collaborators:changed' });
}

router.get('/', (req, res) => {
  res.json(shareState(req.project, req.projectRole));
});

router.post('/', (req, res) => {
  if (req.projectRole !== 'owner') return res.status(403).json({ error: 'forbidden', requiredRole: 'owner' });
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const { email, username, role } = parsed.data;
  /* Recherche de l'invite par e-mail (identifiant unique) ou par pseudo. */
  const target = email
    ? queries.getUserByEmail.get(email.toLowerCase())
    : queries.findUserByUsername.get(username);
  if (!target) return res.status(404).json({ error: 'user_not_found' });
  if (target.id === req.project.user_id) {
    return res.status(400).json({ error: 'already_owner' });
  }
  const existing = queries.getCollaborator.get(req.project.id, target.id);
  queries.upsertCollaborator.run(req.project.id, target.id, role, req.user.id);
  /* Notification temps reel : le membre est prevenu meme s'il est ailleurs. */
  broadcastToUser(target.id, {
    type: existing ? 'project:role' : 'project:invited',
    projectId: req.project.id,
    projectName: req.project.name,
    role,
  });
  notifyChange(req.project);
  res.status(existing ? 200 : 201).json(shareState(req.project, 'owner'));
});

router.patch('/:userId', (req, res) => {
  if (req.projectRole !== 'owner') return res.status(403).json({ error: 'forbidden', requiredRole: 'owner' });
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const userId = Number(req.params.userId);
  if (!queries.getCollaborator.get(req.project.id, userId)) {
    return res.status(404).json({ error: 'collaborator_not_found' });
  }
  queries.updateCollaboratorRole.run(parsed.data.role, req.project.id, userId);
  broadcastToUser(userId, {
    type: 'project:role',
    projectId: req.project.id,
    projectName: req.project.name,
    role: parsed.data.role,
  });
  notifyChange(req.project);
  res.json(shareState(req.project, 'owner'));
});

router.delete('/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const selfRemoval = userId === req.user.id;
  if (req.projectRole !== 'owner' && !selfRemoval) {
    return res.status(403).json({ error: 'forbidden', requiredRole: 'owner' });
  }
  if (!queries.getCollaborator.get(req.project.id, userId)) {
    return res.status(404).json({ error: 'collaborator_not_found' });
  }
  queries.deleteCollaborator.run(req.project.id, userId);
  broadcastToUser(userId, { type: 'project:removed', projectId: req.project.id, projectName: req.project.name });
  notifyChange(req.project);
  res.json(shareState(req.project, req.projectRole));
});

export default router;
