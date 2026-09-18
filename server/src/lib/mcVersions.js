/* ============================================================
   Table des versions Minecraft -> pack_format.

   Miroir de client/src/lib/datapack.js (MC_VERSIONS), utilisee par
   l'API pour proposer les versions de jeu compatibles lors d'une
   publication Modrinth. Si une version est ajoutee cote client, il
   faut l'ajouter ici aussi (source unique de verite = client).
   ============================================================ */

export const MC_VERSIONS = [
  { version: '1.20.1', packFormat: 15 },
  { version: '1.20.2', packFormat: 18 },
  { version: '1.20.3', packFormat: 26 },
  { version: '1.20.4', packFormat: 26 },
  { version: '1.20.5', packFormat: 41 },
  { version: '1.20.6', packFormat: 41 },
  { version: '1.21',   packFormat: 48 },
  { version: '1.21.1', packFormat: 48 },
  { version: '1.21.2', packFormat: 57 },
  { version: '1.21.3', packFormat: 57 },
  { version: '1.21.4', packFormat: 61 },
  { version: '1.21.5', packFormat: 71 },
  { version: '1.21.6', packFormat: 80 },
  { version: '1.21.7', packFormat: 81 },
  { version: '1.21.8', packFormat: 81 },
  { version: '1.21.9', packFormat: 88 },
  { version: '1.21.10', packFormat: 88 },
  { version: '1.21.11', packFormat: 94 },
];

export const DEFAULT_MC_VERSION = '1.21.8';

export function packFormatOf(version) {
  const row = MC_VERSIONS.find((v) => v.version === version);
  return row ? row.packFormat : null;
}

/* Versions partageant le meme pack_format que `version` : un datapack
   ecrit pour un pack_format donne fonctionne sur toutes ces versions. */
export function compatibleVersions(version) {
  const format = packFormatOf(version);
  if (format === null) return version ? [version] : [];
  return MC_VERSIONS.filter((v) => v.packFormat === format).map((v) => v.version);
}

/* Comparaison de deux versions « 1.21.10 » (numerique, pas alphabetique). */
export function compareMcVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/* Suggestion de versions de jeu a publier :
   1. les versions compatibles (meme pack_format) connues de Modrinth ;
   2. sinon, les versions de jeu de la derniere version publiee ;
   3. sinon, la version du projet elle-meme. */
export function suggestGameVersions({ minecraftVersion, knownVersions = [], publishedGameVersions = [] }) {
  const known = new Set(knownVersions);
  const compatible = compatibleVersions(minecraftVersion).filter((v) => known.size === 0 || known.has(v));
  if (compatible.length) return compatible.sort(compareMcVersions);

  const published = [...new Set(publishedGameVersions)].filter((v) => known.size === 0 || known.has(v));
  if (published.length) return published.sort(compareMcVersions);

  return minecraftVersion ? [minecraftVersion] : [];
}
