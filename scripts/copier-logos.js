/**
 * Copie dans public/logos/ les logos dont l'adresse est inscrite dans Notion
 * (colonne « Logo »), et écrit la table lib/logos.json (adresse d'origine →
 * fichier local). Le site sert ensuite la copie : un site qui refuse
 * l'affichage de ses images ailleurs, ou qui change d'adresse, ne casse plus rien.
 * Ne modifie pas Notion.
 * Lancement : node --env-file=.env.local scripts/copier-logos.js
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lireRessources } = require('../lib/notion');

const DOSSIER = path.join(__dirname, '..', 'public', 'logos');
const TABLE = path.join(__dirname, '..', 'lib', 'logos.json');
const TAILLE_MAX = 600 * 1024;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

function extensionDe(type, octets) {
  const propre = String(type || '').split(';')[0].trim().toLowerCase();
  if (EXTENSIONS[propre]) return EXTENSIONS[propre];
  // Type absent ou générique : on regarde la signature du fichier.
  if (octets.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (octets.subarray(0, 3).toString('hex') === 'ffd8ff') return 'jpg';
  if (octets.subarray(0, 4).toString('hex') === '00000100') return 'ico';
  if (octets.subarray(0, 4).toString('latin1') === 'RIFF' && octets.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (octets.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (/<svg[\s>]/i.test(octets.subarray(0, 2000).toString('utf8'))) return 'svg';
  return null;
}

async function copier(adresse) {
  const reponse = await fetch(adresse, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; copie-logo/1.0)', Accept: 'image/*,*/*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
  const octets = Buffer.from(await reponse.arrayBuffer());
  if (octets.length < 100 || octets.length > TAILLE_MAX) throw new Error(`taille ${octets.length}`);
  const extension = extensionDe(reponse.headers.get('content-type'), octets);
  if (!extension) throw new Error('pas une image');
  const nom = `${crypto.createHash('sha1').update(adresse).digest('hex').slice(0, 16)}.${extension}`;
  fs.writeFileSync(path.join(DOSSIER, nom), octets);
  return `/logos/${nom}`;
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const fiches = (await lireRessources()).filter((f) => f.statutFiche !== 'Écartée' && /^https?:\/\//i.test(f.logo || ''));
  const adresses = [...new Set(fiches.map((f) => f.logo))];
  const table = {};
  const echecs = [];
  for (let i = 0; i < adresses.length; i += 8) {
    await Promise.all(adresses.slice(i, i + 8).map(async (adresse) => {
      try { table[adresse] = await copier(adresse); } catch (err) { echecs.push(`${adresse} (${err.message})`); }
    }));
  }
  const triee = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(TABLE, JSON.stringify(triee, null, 2) + '\n');
  // Retire les fichiers qui ne sont plus dans la table.
  const gardes = new Set(Object.values(triee).map((c) => path.basename(c)));
  for (const fichier of fs.readdirSync(DOSSIER)) if (!gardes.has(fichier)) fs.unlinkSync(path.join(DOSSIER, fichier));
  console.log(`${Object.keys(triee).length} logos copiés sur ${adresses.length}`);
  if (echecs.length) console.log('Non copiés :\n' + echecs.join('\n'));
})();
