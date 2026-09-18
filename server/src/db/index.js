import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

let db;
try {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (err) {
  logger.fatal("Impossible d'ouvrir la base de donnees:", err.message);
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  minecraft_version TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  UNIQUE(project_id, path)
);
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, day)
);
/* Partage de projets : un role par utilisateur et par projet.
   'viewer' = lecture seule, 'editor' = lecture/ecriture des fichiers.
   Le proprietaire (projects.user_id) n'est jamais liste ici. */
CREATE TABLE IF NOT EXISTS project_collaborators (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON project_collaborators(user_id);
`);

/* Migrations legeres : ajout de colonnes sur des bases deja existantes
   (CREATE TABLE IF NOT EXISTS ne modifie pas une table deja creee). */
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(table, column, ddl) {
  if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

addColumn('users', 'modrinth_token', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'modrinth_project', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'modrinth_version', "TEXT NOT NULL DEFAULT ''");


export const queries = {
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserByUsername: db.prepare('SELECT id, email, username FROM users WHERE username = ? COLLATE NOCASE'),
  getUserById: db.prepare('SELECT id, email, username, settings, is_admin, created_at FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)'),
  updateSettings: db.prepare('UPDATE users SET settings = ? WHERE id = ?'),
  listProjects: db.prepare('SELECT id, name, namespace, minecraft_version, description, icon != \'\' AS has_icon, modrinth_project, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'),
  getProject: db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?'),
  getProjectById: db.prepare('SELECT * FROM projects WHERE id = ?'),
  insertProject: db.prepare('INSERT INTO projects (user_id, name, namespace, minecraft_version, description, icon) VALUES (?, ?, ?, ?, ?, ?)'),
  updateProject: db.prepare('UPDATE projects SET name = ?, namespace = ?, minecraft_version = ?, description = ?, icon = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'),
  updateProjectById: db.prepare('UPDATE projects SET name = ?, namespace = ?, minecraft_version = ?, description = ?, icon = ?, updated_at = datetime(\'now\') WHERE id = ?'),
  touchProject: db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?'),
  deleteProject: db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?'),
  listFiles: db.prepare('SELECT path, content FROM files WHERE project_id = ? ORDER BY path'),
  upsertFile: db.prepare('INSERT INTO files (project_id, path, content) VALUES (?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content'),
  deleteFile: db.prepare('DELETE FROM files WHERE project_id = ? AND path = ?'),
  deleteProjectFiles: db.prepare('DELETE FROM files WHERE project_id = ?'),
  getUsage: db.prepare('SELECT tokens_used FROM ai_usage WHERE user_id = ? AND day = ?'),
  addUsage: db.prepare('INSERT INTO ai_usage (user_id, day, tokens_used) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET tokens_used = tokens_used + excluded.tokens_used'),

  /* --- Partage : collaborateurs d'un projet --- */
  getCollaborator: db.prepare('SELECT * FROM project_collaborators WHERE project_id = ? AND user_id = ?'),
  listCollaborators: db.prepare(`SELECT c.user_id, c.role, c.created_at, u.username, u.email
    FROM project_collaborators c JOIN users u ON u.id = c.user_id
    WHERE c.project_id = ? ORDER BY c.created_at`),
  upsertCollaborator: db.prepare(`INSERT INTO project_collaborators (project_id, user_id, role, invited_by)
    VALUES (?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`),
  updateCollaboratorRole: db.prepare('UPDATE project_collaborators SET role = ? WHERE project_id = ? AND user_id = ?'),
  deleteCollaborator: db.prepare('DELETE FROM project_collaborators WHERE project_id = ? AND user_id = ?'),
  /* Projets partages AVEC l'utilisateur (il n'en est pas le proprietaire). */
  listSharedProjects: db.prepare(`SELECT p.id, p.name, p.namespace, p.minecraft_version, p.description,
      p.icon != '' AS has_icon, p.modrinth_project, p.created_at, p.updated_at, c.role,
      u.username AS owner_username
    FROM project_collaborators c
    JOIN projects p ON p.id = c.project_id
    JOIN users u ON u.id = p.user_id
    WHERE c.user_id = ? ORDER BY p.updated_at DESC`),

  /* --- Modrinth --- */
  getModrinthToken: db.prepare('SELECT modrinth_token FROM users WHERE id = ?'),
  setModrinthToken: db.prepare('UPDATE users SET modrinth_token = ? WHERE id = ?'),
  setProjectModrinth: db.prepare('UPDATE projects SET modrinth_project = ?, modrinth_version = ? WHERE id = ?'),
  setModrinthVersion: db.prepare('UPDATE projects SET modrinth_version = ? WHERE id = ?'),
};

export { db };
export default db;
