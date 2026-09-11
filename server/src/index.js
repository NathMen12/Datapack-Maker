import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config, SERVER_ROOT } from './config.js';
import { logger, httpColor } from './lib/logger.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import projectsRoutes from './routes/projects.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

/* Journal des requetes, colore. */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} (${Date.now() - start}ms)`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.alert(line);
    else logger.info(line);
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, model: config.aiModel }));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);

/* Servir le client build (client/dist) en production, si present. */
const CLIENT_DIST = path.resolve(SERVER_ROOT, '../client/dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

/* Gestionnaire d'erreurs global. */
app.use((err, req, res, next) => {
  logger.error('Erreur non geree:', err.message);
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Serveur demarre sur le port ${config.port} (${config.env})`);
  logger.info(`Modele IA: ${config.aiModel} | Quota: ${config.aiQuotaTokens} tokens/jour/utilisateur`);
  if (!config.groqApiKey) {
    logger.alert('GROQ_API_KEY absente: l\'autocompletion IA sera indisponible jusqu\'a ce qu\'elle soit definie');
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetee non geree:', reason);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(`Le port ${config.port} est deja utilise. Arret.`);
  } else {
    logger.fatal('Erreur du serveur HTTP:', err.message);
  }
});

export default app;
