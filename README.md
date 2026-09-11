# Datapack Maker

Créez des datapacks Minecraft directement dans votre navigateur : éditeur mcfunction avec coloration syntaxique, autocomplétion IA (Groq), import/export ZIP, projets sauvegardés en local ou sur votre compte.

## Démarrage

```bash
npm install
npm run dev        # serveur API (port 3000) + client Vite (port 5173)
```

Ouvrez http://localhost:5173

## Configuration (server/.env)

Copiez `server/.env.example` vers `server/.env` puis renseignez :

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port de l'API | `3000` |
| `JWT_SECRET` | Secret des tokens d'authentification | à changer |
| `GROQ_API_KEY` | Clé API Groq pour l'autocomplétion IA | vide (IA désactivée) |
| `AI_MODEL` | Modèle Groq | `openai/gpt-oss-120b` |
| `AI_QUOTA_TOKENS` | **Quota de tokens IA par utilisateur/jour (modifiable)** | `5000` |

## Fonctionnalités (V1)

- **Studio sans compte** : projets stockés dans le navigateur (IndexedDB + compression gzip, pas de crash au-delà de 5 Mo, erreurs de quota gérées proprement).
- **Compte** : projets sauvegardés sur le serveur (SQLite), migration local → cloud en un clic depuis le tableau de bord.
- **Coloration syntaxique mcfunction** : commandes, sous-commandes, sélecteurs `@a[...]`, NBT, chaînes, nombres, commentaires, macros.
- **Autocomplétion statique** : commandes et arguments de sélecteurs (données locales, sans IA).
- **Autocomplétion IA** : suggestion inline (ghost text, Tab pour accepter) via Groq, réservée aux comptes connectés. Quota quotidien affiché **en pourcentage** sur le tableau de bord.
- **Import / Export ZIP** : export d'un datapack prêt à l'emploi (`pack.mcmeta`, `pack.png`, `data/...`), import d'un ZIP existant.
- **Générateur de texte coloré** : composants texte JSON (tellraw/title) avec aperçu live des 16 couleurs Minecraft.
- **Icône de datapack** : upload d'un PNG par projet, inclus comme `pack.png` à l'export.
- **Interface FR/EN**, vraies icônes (lucide-react), aucun emoji.
- **Paramètres** : langue, autocomplétion IA on/off, délais, taille de police.

## Arborescence

```
server/          API Express (auth JWT, projets, fichiers, IA, settings)
client/          React + Vite (studio, éditeur CodeMirror 6, i18n)
server/data/     SQLite (créé automatiquement, gitignoré)
server/logs/     Logs du serveur (gitignoré)
```

## Scripts

| Commande | Action |
|---|---|
| `npm run dev` | Développement (API + client) |
| `npm run dev:server` | API seule |
| `npm run dev:client` | Client seul |
| `npm run build` | Build production du client |
| `npm start` | Serveur en production |
