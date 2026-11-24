/**
 * Pages pour les moteurs de recherche, selon ?vue= :
 *   page    → /ressource/<adresse>   (réécriture dans vercel.json)
 *   accueil → /
 *   plan    → /sitemap.xml
 *   robots  → /robots.txt
 * L'indexation n'est ouverte que si INDEXATION vaut « oui ».
 */
const fs = require('node:fs');
const path = require('node:path');
const { donneesPubliques } = require('./export');
const { rendrePage, rendreAccueil, rendreIntrouvable, rendrePlanDuSite, rendreRobots } = require('../lib/page-publique');
const { TEXTES } = require('../public/js/texte.js');

// gabarit.html est joint à la fonction par « includeFiles » dans vercel.json.
let gabaritGarde = null;
function lireGabarit() {
  if (gabaritGarde) return gabaritGarde;
  for (const fichier of [path.join(__dirname, '..', 'public', 'gabarit.html'), path.join(process.cwd(), 'public', 'gabarit.html')]) {
    try {
      const html = fs.readFileSync(fichier, 'utf8');
      if (html.includes('id="ficheStatique"')) { gabaritGarde = html; return html; }
    } catch (err) { /* essai suivant */ }
  }
  throw new Error('gabarit.html introuvable');
}

// Origine du site : SITE_URL si elle est définie, sinon l'hôte de la requête.
function origineDe(req) {
  const fixe = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(fixe)) return fixe;
  const hote = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(hote)) return '';
  return `${/^(localhost|127\.0\.0\.1)(:|$)/.test(hote) ? 'http' : 'https'}://${hote}`;
}

function creerGestionnaire({ source = donneesPubliques, gabarit = lireGabarit, journal = console.error } = {}) {
  return async function gestionnaire(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).send('Méthode non permise');
    }
    const vue = String((req.query && req.query.vue) || '');
    const origine = origineDe(req);
    const indexation = process.env.INDEXATION === 'oui';
    const html = (code, contenu, cache) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', cache || 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      return res.status(code).send(contenu);
    };

    if (vue === 'robots') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(200).send(rendreRobots(indexation, origine));
    }
    if (vue === 'accueil') return html(200, rendreAccueil(gabarit(), { origine, indexation }));

    let donnees;
    try {
      donnees = await source();
    } catch (err) {
      journal('[ressource] Lecture de Notion impossible :', err.message);
      if (vue === 'plan') return res.status(503).send('');
      return html(503, rendreIntrouvable(gabarit(), { origine, message: TEXTES.indisponible }), 'no-store');
    }

    if (vue === 'plan') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(rendrePlanDuSite(donnees.ressources, origine));
    }

    const adresse = String((req.query && req.query.adresse) || '');
    const fiche = /^[a-z0-9-]{1,200}$/.test(adresse) ? donnees.ressources.find((r) => r.adresse === adresse) : null;
    if (!fiche) return html(404, rendreIntrouvable(gabarit(), { origine }), 'no-store');
    const page = rendrePage(gabarit(), fiche, { origine, indexation });
    if (page.manquants.length) journal('[ressource] Repères absents du gabarit :', page.manquants.join(', '));
    return html(200, page.html);
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
module.exports.origineDe = origineDe;
