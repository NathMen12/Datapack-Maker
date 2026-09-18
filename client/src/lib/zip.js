/* --- Import / Export ZIP --- */
import JSZip from 'jszip';

function detectVersionFromPackFormat(packFormat) {
  const matches = MC_VERSIONS.filter((v) => v.packFormat === packFormat);
  return matches.length ? matches[matches.length - 1].version : DEFAULT_MC_VERSION;
}

export async function exportToZip({ name, files, icon }) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  if (icon) {
    try {
      const base64 = icon.split(',')[1];
      zip.file('pack.png', base64, { base64: true });
    } catch { /* icone invalide : ignoree */ }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'datapack'}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Publication Modrinth : retourne le ZIP du datapack en base64
   (envoye tel quel a l'API, qui le transmet en multipart). */
export async function buildZipBase64({ files, icon }) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  if (icon) {
    try {
      const base64 = icon.split(',')[1];
      zip.file('pack.png', base64, { base64: true });
    } catch { /* icone invalide : ignoree */ }
  }
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

/* --- Import d'un ZIP datapack ; retourne { name, namespace, minecraftVersion, description, files, icon } ou null. */
export async function importFromZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  /* pack.mcmeta a la racine, ou dans un unique dossier racine. */
  let rootPrefix = '';
  if (!entries.some((f) => f.name === 'pack.mcmeta')) {
    const roots = [...new Set(entries.map((f) => f.name.split('/')[0]))];
    if (roots.length === 1 && entries.some((f) => f.name === `${roots[0]}/pack.mcmeta`)) {
      rootPrefix = `${roots[0]}/`;
    } else {
      return null;
    }
  }

  const strip = (p) => p.slice(rootPrefix.length);
  const packEntry = entries.find((f) => strip(f.name) === 'pack.mcmeta');
  let meta = {};
  try {
    meta = JSON.parse(await packEntry.async('string'));
  } catch {
    return null;
  }
  const packFormat = meta?.pack?.pack_format;
  const description = typeof meta?.pack?.description === 'string' ? meta.pack.description : '';
  const minecraftVersion = detectVersionFromPackFormat(packFormat);

  /* Namespace deduit de data/<ns>/... */
  let namespace = 'imported';
  for (const f of entries) {
    const m = strip(f.name).match(/^data\/([a-z0-9_.-]+)\//);
    if (m) { namespace = m[1]; break; }
  }

  /* Securite : n accepter que des chemins relatifs internes au projet.
     Un ZIP malveillant peut contenir "../evil" (zip-slip a l export). */
  const isSafePath = (p) =>
    typeof p === 'string' &&
    p.length <= 255 &&
    !p.includes('..') &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !p.includes('//') &&
    /^[a-zA-Z0-9_\-./]+$/.test(p);

  const skip = new Set(['pack.mcmeta', 'pack.png']);
  const files = [];
  for (const f of entries) {
    const path = strip(f.name);
    if (skip.has(path)) continue;
    if (!isSafePath(path)) continue; /* entree dangereuse ou exotique : ignoree */
    if (/\.(mcfunction|json|mcmeta)$/.test(path) && files.length < 500) {
      files.push({ path, content: await f.async('string') });
    }
  }

  let icon = '';
  const pngEntry = entries.find((f) => strip(f.name) === 'pack.png');
  if (pngEntry) {
    try {
      icon = `data:image/png;base64,${await pngEntry.async('base64')}`;
    } catch { /* ignore */ }
  }

  const name = description.trim() || file.name.replace(/\.zip$/i, '') || 'Imported datapack';
  return { name, namespace, minecraftVersion, description, files, icon };
}
