import { Router } from 'express';
import { z } from 'zod';
import { queries } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { accessProject } from '../middleware/access.js';
import { getUserToken } from '../lib/modrinthToken.js';
import {
  ModrinthError, checkToken, createVersion, getGameVersions, getProject, isValidProjectRef,
  listVersions, suggestNextVersion,
} from '../services/modrinth.js';
import { suggestGameVersions } from '../lib/mcVersions.js';
import { logger } from '../lib/logger.js';

/* ============================================================
   Publication Modrinth d'un projet datapack.
   Monte sur /api/projects/:id/modrinth (mergeParams).

     GET    /        etat de la liaison + pre-remplissage du formulaire
     PUT    /        lie le projet a un projet Modrinth (slug ou ID)
     DELETE /        retire la liaison
     POST   /publish publie une version (ZIP fourni par le client, base64)

   Permissions : consultation pour tout membre, liaison et publication
   reservees au proprietaire du projet.
   ============================================================ */

const router = Router({ mergeParams: true });
router.use(requireAuth);

const ZIP_BASE64_MAX = 12 * 1024 * 1024; /* ~9 Mo de ZIP (limite express.json 12 Mo) */

function fail(res, err) {
  if (err instanceof ModrinthError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  logger.error('Modrinth (projet):', err.message);
  return res.status(502).json({ error: 'modrinth_error', message: err.message });
}

/* Nom propose a partir du nom de la derniere version publiee :
   « Release 1.0.0 » -> « Release 1.0.1 ». Si aucun motif exploitable,
   on retombe sur « <nom du datapack> <version> ». */
function suggestVersionName(latest, nextNumber, fallbackName) {
  if (latest?.name && latest.version_number && latest.name.includes(latest.version_number)) {
    return latest.name.replace(latest.version_number, nextNumber);
  }
  return `${fallbackName} ${nextNumber}`;
}

function versionRow(v) {
  return {
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    versionType: v.version_type,
    gameVersions: v.game_versions || [],
    loaders: v.loaders || [],
    downloads: v.downloads ?? 0,
    datePublished: v.date_published,
    status: v.status,
  };
}

function projectRow(p) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    iconUrl: p.icon_url,
    projectType: p.project_type,
    loaders: p.loaders || [],
    gameVersions: p.game_versions || [],
    url: `https://modrinth.com/${p.project_type}/${p.slug}`,
  };
}

/* --- Etat de la liaison + donnees de pre-remplissage du formulaire --- */
router.get('/', accessProject('viewer'), async (req, res) => {
  const ref = req.project.modrinth_project || '';
  const token = getUserToken(req.user.id);
  const response = {
    linked: Boolean(ref),
    ref,
    tokenLinked: Boolean(token),
    role: req.projectRole,
    minecraftVersion: req.project.minecraft_version,
    project: null,
    publishedVersions: [],
    lastVersionNumber: req.project.modrinth_version || '',
    suggestedVersionNumber: '',
    suggestedName: '',
    suggestedGameVersions: [],
  };
  if (!ref) return res.json(response);

  try {
    const modrinthProject = await getProject(ref);
    const versions = await listVersions(ref);
    const knownTags = await getGameVersions().catch(() => []);
    const sorted = (versions || [])
      .slice()
      .sort((a, b) => String(b.date_published || '').localeCompare(String(a.date_published || '')));
    const latest = sorted[0] || null;
    const nextNumber = suggestNextVersion(sorted, req.project.modrinth_version);

    response.project = projectRow(modrinthProject);
    response.publishedVersions = sorted.slice(0, 10).map(versionRow);
    response.lastVersionNumber = latest?.version_number || req.project.modrinth_version || '';
    response.suggestedVersionNumber = nextNumber;
    response.suggestedName = suggestVersionName(latest, nextNumber, modrinthProject.title || req.project.name);
    /* Versions de jeu compatibles avec le pack_format du projet (et connues
       de Modrinth) : pre-selectionnees dans l'interface, l'utilisateur choisit. */
    response.suggestedGameVersions = suggestGameVersions({
      minecraftVersion: req.project.minecraft_version,
      knownVersions: knownTags.map((v) => v.version),
      publishedGameVersions: latest?.game_versions || [],
    });
    res.json(response);
  } catch (err) {
    fail(res, err);
  }
});

/* --- Lier le projet a un projet Modrinth existant --- */
const linkSchema = z.object({ project: z.string().trim().min(1).max(64) });

router.put('/', accessProject('owner'), async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const ref = parsed.data.project;
  if (!isValidProjectRef(ref)) return res.status(400).json({ error: 'invalid_project_ref' });
  try {
    const modrinthProject = await getProject(ref);
    /* On memorise le slug (stable et lisible) plutot que la saisie brute. */
    queries.setProjectModrinth.run(modrinthProject.slug || ref, '', req.project.id);
    logger.info(`Modrinth: projet ${req.project.id} lie a ${modrinthProject.slug || ref}`);
    res.json({ linked: true, ref: modrinthProject.slug || ref, project: projectRow(modrinthProject) });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/', accessProject('owner'), (req, res) => {
  queries.setProjectModrinth.run('', '', req.project.id);
  res.json({ linked: false, ref: '' });
});

/* --- Publication d'une version --- */
const publishSchema = z.object({
  /* ZIP du datapack (pack.mcmeta + data/...) encode en base64. */
  zip: z.string().min(1).max(ZIP_BASE64_MAX),
  fileName: z.string().trim().max(120).optional(),
  versionNumber: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  changelog: z.string().max(10_000).optional(),
  gameVersions: z.array(z.string().trim().min(1).max(32)).min(1).max(64),
  versionType: z.enum(['release', 'beta', 'alpha']).default('release'),
  loaders: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  featured: z.boolean().optional(),
});

/* Nom de fichier sur : alphanumeriques, tirets, underscores et points. */
function safeFileName(name, fallback) {
  const base = String(name || '').replace(/\.zip$/i, '').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 80);
  return `${base || fallback}.zip`;
}

router.post('/publish', accessProject('owner'), async (req, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const ref = req.project.modrinth_project;
  if (!ref) return res.status(400).json({ error: 'modrinth_not_linked' });

  const token = getUserToken(req.user.id);
  if (!token) return res.status(400).json({ error: 'modrinth_token_required' });

  const { zip, fileName, ...data } = parsed.data;
  const buffer = Buffer.from(zip, 'base64');
  /* Signature ZIP (PK\x03\x04) : on refuse tout ce qui n'est pas un ZIP,
     avant de solliciter l'API Modrinth. */
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return res.status(400).json({ error: 'invalid_zip' });
  }

  try {
    /* Compte reverifie a chaque publication : jeton revoque = erreur claire. */
    await checkToken(token);
    const modrinthProject = await getProject(ref);
    /* Loaders : ceux declares par le projet Modrinth, sinon « datapack ». */
    const loaders = data.loaders?.length
      ? data.loaders
      : (modrinthProject.loaders?.length ? modrinthProject.loaders : ['datapack']);

    const version = await createVersion({
      token,
      project_id: modrinthProject.id,
      name: data.name,
      version_number: data.versionNumber,
      changelog: data.changelog || '',
      game_versions: data.gameVersions,
      loaders,
      version_type: data.versionType,
      ...(data.featured !== undefined ? { featured: data.featured } : {}),
      file: {
        name: safeFileName(fileName, `${req.project.namespace}-${data.versionNumber}`),
        buffer,
      },
    });

    /* Memorise la derniere version publiee : repli pour la suggestion suivante. */
    queries.setModrinthVersion.run(data.versionNumber, req.project.id);
    queries.touchProject.run(req.project.id);
    logger.info(`Modrinth: version ${data.versionNumber} publiee pour le projet ${req.project.id}`);

    const slug = modrinthProject.slug || ref;
    const type = modrinthProject.project_type || 'datapack';
    /* Relecture des versions : propose directement la suivante pour un
       enchainement de publications. */
    const refreshed = await listVersions(ref).catch(() => []);
    res.status(201).json({
      version: {
        id: version.id,
        name: version.name,
        versionNumber: version.version_number,
        versionType: version.version_type,
        gameVersions: version.game_versions || [],
        url: `https://modrinth.com/${type}/${slug}/version/${version.version_number}`,
        projectUrl: `https://modrinth.com/${type}/${slug}`,
      },
      nextVersionNumber: suggestNextVersion(refreshed, data.versionNumber),
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;


