/* ============================================================
   Donnees Datapack : versions Minecraft -> pack_format,
   generation de l'arborescence, import/export ZIP.
   ============================================================ */

/* pack_format par version (source : wiki minecraft). Maintenable dans un JSON. */
export const MC_VERSIONS = [
  { version: '1.20.1', packFormat: 15, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.20.2', packFormat: 18, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.20.3', packFormat: 26, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.20.4', packFormat: 26, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.20.5', packFormat: 41, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.20.6', packFormat: 41, functionFolder: 'functions', tagFolder: 'tags/functions' },
  { version: '1.21',   packFormat: 48, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.1', packFormat: 48, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.2', packFormat: 57, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.3', packFormat: 57, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.4', packFormat: 61, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.5', packFormat: 71, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.6', packFormat: 80, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.7', packFormat: 80, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.8', packFormat: 81, functionFolder: 'function',  tagFolder: 'tags/function' },
  { version: '1.21.9', packFormat: 88, functionFolder: 'function',  tagFolder: 'tags/function' },
];

export const DEFAULT_MC_VERSION = '1.21.8';

export function getMCVersionInfo(version) {
  return MC_VERSIONS.find((v) => v.version === version) || MC_VERSIONS[MC_VERSIONS.length - 1];
}

/* Genere pack.mcmeta + arborescence de fonctions de base. */
export function buildDatapackStructure({ name, namespace, minecraftVersion, description }) {
  const info = getMCVersionInfo(minecraftVersion);
  const { functionFolder, tagFolder } = info;
  const packMcmeta = JSON.stringify(
    {
      pack: {
        pack_format: info.packFormat,
        description: description || `${name} - ${minecraftVersion}`,
      },
    },
    null,
    2
  );
  const loadJson = JSON.stringify({ values: [`${namespace}:load`] }, null, 2);
  const tickJson = JSON.stringify({ values: [`${namespace}:tick`] }, null, 2);
  return [
    { path: 'pack.mcmeta', content: `${packMcmeta}\n` },
    { path: `data/${namespace}/${functionFolder}/load.mcfunction`, content: '# Appelee une seule fois au chargement du datapack\n' },
    { path: `data/${namespace}/${functionFolder}/tick.mcfunction`, content: '# Appelee a chaque tick (20 fois par seconde)\n' },
    { path: `data/${namespace}/${functionFolder}/main.mcfunction`, content: `# Fonction principale de ${name}\n` },
    { path: `data/minecraft/${tagFolder}/load.json`, content: `${loadJson}\n` },
    { path: `data/minecraft/${tagFolder}/tick.json`, content: `${tickJson}\n` },
  ];
}
