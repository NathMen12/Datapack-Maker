import { queries } from '../db/index.js';

/* ============================================================
   Permissions de projet (partage temps reel).

   Trois roles, du plus faible au plus fort :
     viewer : lecture seule (fichiers, icone, metadonnees)
     editor : lecture + ecriture des fichiers
     owner  : tout (fichiers, reglages, collaborateurs, publication)

   Le proprietaire est projects.user_id ; les autres passent par
   la table project_collaborators.
   ============================================================ */

export const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

/* Role de `userId` sur `project`, ou null s'il n'y a aucun acces. */
export function roleOf(project, userId) {
  if (!project) return null;
  if (project.user_id === userId) return 'owner';
  const collaborator = queries.getCollaborator.get(project.id, userId);
  return collaborator ? collaborator.role : null;
}

export function canWrite(role) {
  return (ROLE_RANK[role] || 0) >= ROLE_RANK.editor;
}

/* Middleware : resout le projet et exige au moins `minRole`.
   Pose req.project et req.projectRole. 404 si aucun acces (ne revele
   pas l'existence d'un projet prive), 403 si le role est insuffisant. */
export function accessProject(minRole = 'viewer') {
  return (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'project_not_found' });
    }
    const project = queries.getProjectById.get(id);
    const role = roleOf(project, req.user.id);
    if (!role) return res.status(404).json({ error: 'project_not_found' });
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: 'forbidden', requiredRole: minRole });
    }
    req.project = project;
    req.projectRole = role;
    next();
  };
}
