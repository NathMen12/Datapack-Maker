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
`);

export const queries = {
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById: db.prepare('SELECT id, email, username, settings, is_admin, created_at FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)'),
  updateSettings: db.prepare('UPDATE users SET settings = ? WHERE id = ?'),
  listProjects: db.prepare('SELECT id, name, namespace, minecraft_version, description, icon != \'\' AS has_icon, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'),
  getProject: db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?'),
  insertProject: db.prepare('INSERT INTO projects (user_id, name, namespace, minecraft_version, description, icon) VALUES (?, ?, ?, ?, ?, ?)'),
  updateProject: db.prepare('UPDATE projects SET name = ?, namespace = ?, description = ?, icon = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?'),
  touchProject: db.prepare('UPDATE projects SET updated_at = datetime(\'now\') WHERE id = ?'),
  deleteProject: db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?'),
  listFiles: db.prepare('SELECT path, content FROM files WHERE project_id = ? ORDER BY path'),
  upsertFile: db.prepare('INSERT INTO files (project_id, path, content) VALUES (?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content'),
  deleteFile: db.prepare('DELETE FROM files WHERE project_id = ? AND path = ?'),
  deleteProjectFiles: db.prepare('DELETE FROM files WHERE project_id = ?'),
  getUsage: db.prepare('SELECT tokens_used FROM ai_usage WHERE user_id = ? AND day = ?'),
  addUsage: db.prepare('INSERT INTO ai_usage (user_id, day, tokens_used) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET tokens_used = tokens_used + excluded.tokens_used'),
};

export { db };
export default db;
