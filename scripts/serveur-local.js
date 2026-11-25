/**
 * Serveur local pour le développement : sert les fichiers statiques et fait
 * tourner les fonctions de /api comme le ferait Vercel (réécritures comprises).
 * Lancement : node --env-file=.env.local scripts/serveur-local.js
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3210;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// Mêmes réécritures que vercel.json.
function reecrire(chemin) {
  let m;
  if ((m = /^\/ressource\/([^/]+)\/?$/.exec(chemin))) return { fonction: 'ressource', query: { vue: 'page', adresse: m[1] } };
  if (chemin === '/') return { fonction: 'ressource', query: { vue: 'accueil' } };
  if (chemin === '/sitemap.xml') return { fonction: 'ressource', query: { vue: 'plan' } };
  if (chemin === '/robots.txt') return { fonction: 'ressource', query: { vue: 'robots' } };
  if ((m = /^\/api\/([a-z-]+)$/.exec(chemin))) return { fonction: m[1], query: {} };
  return null;
}

// Corps JSON d'une requête POST (4 Mo au plus, pour un logo joint), comme Vercel le fournit dans req.body.
function lireCorps(req) {
  return new Promise((resoudre) => {
    let brut = ''; let trop = false;
    req.on('data', (morceau) => { brut += morceau; if (brut.length > 4000000) trop = true; });
    req.on('end', () => { try { resoudre(trop ? null : JSON.parse(brut)); } catch (err) { resoudre(null); } });
    req.on('error', () => resoudre(null));
  });
}

function enrichir(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (objet) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(objet)); return res; };
  res.send = (corps) => { res.end(corps); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cible = reecrire(url.pathname);
  try {
    if (cible) {
      const fichier = path.join(RACINE, 'api', `${cible.fonction}.js`);
      if (!fs.existsSync(fichier)) { res.statusCode = 404; return res.end('Fonction introuvable'); }
      req.query = { ...Object.fromEntries(url.searchParams), ...cible.query };
      if (req.method === 'POST') req.body = await lireCorps(req);
      return await require(fichier)(req, enrichir(res));
    }
    // Mêmes réécritures de pages que vercel.json.
    const PAGES = { '/proposer': 'proposer.html', '/admin': 'admin.html' };
    const relatif = PAGES[url.pathname] || decodeURIComponent(url.pathname.slice(1));
    // Comme sous Vercel, seuls les fichiers du dossier public sont servis.
    const PUBLIC = path.join(RACINE, 'public');
    const fichier = path.join(PUBLIC, relatif);
    const interdit = !fichier.startsWith(PUBLIC + path.sep);
    if (interdit || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) { res.statusCode = 404; return res.end('Introuvable'); }
    res.setHeader('Content-Type', TYPES[path.extname(fichier)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(fichier).pipe(res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500; res.end('Erreur du serveur local');
  }
}).listen(PORT, () => console.log(`Cartographie en local : http://localhost:${PORT}`));
