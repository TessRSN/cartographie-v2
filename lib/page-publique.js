/**
 * Pages servies aux moteurs de recherche : la page d'une ressource
 * (/ressource/<adresse>), l'accueil, le plan du site et robots.txt.
 * Le gabarit est gabarit.html (et non index.html, que Vercel servirait tel quel à la racine, sans passer par la fonction) : le serveur y remplace le titre, la description,
 * les balises d'indexation et insère la fiche, lisible sans JavaScript.
 */
const { echapper, TEXTES } = require('../public/js/texte.js');
const { htmlFiche } = require('../public/js/fiche.js');

const NOM_SITE = 'Cartographie du RSN';

function tronquer(texte, n) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const coupe = t.slice(0, n - 1);
  return coupe.slice(0, Math.max(coupe.lastIndexOf(' '), n - 40)).trim() + '…';
}

// JSON placé dans une balise <script> : aucune séquence ne doit pouvoir la fermer.
function jsonPourScript(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const TYPES_SCHEMA = {
  'Jeu de données, cohorte ou biobanque': 'Dataset',
  'Catalogue ou entrepôt de données': 'DataCatalog',
  'Logiciel ou application': 'SoftwareApplication',
};

function adresseFiche(fiche, origine) {
  return `${origine}/ressource/${fiche.adresse}`;
}

function donneesStructurees(fiche, origine) {
  const d = {
    '@context': 'https://schema.org',
    '@type': TYPES_SCHEMA[fiche.typePrincipal] || 'Service',
    name: fiche.nom,
    url: adresseFiche(fiche, origine),
  };
  if (fiche.autresNoms) d.alternateName = fiche.autresNoms;
  const description = [fiche.phrase, fiche.description].filter(Boolean).join(' ');
  if (description) d.description = description;
  if ((fiche.motsCles || []).length) d.keywords = fiche.motsCles;
  if (/^https?:\/\//i.test(fiche.lien || '')) d.sameAs = fiche.lien;
  const porteurs = (fiche.porteurs || []).map((p) => ({ '@type': 'Organization', name: p.nom }));
  if (porteurs.length) d[d['@type'] === 'Service' ? 'provider' : 'publisher'] = porteurs.length === 1 ? porteurs[0] : porteurs;
  if (fiche.licence && d['@type'] !== 'Service') d.license = fiche.licence;
  if (d['@type'] === 'SoftwareApplication' && /^https?:\/\//i.test(fiche.depotCode || '')) d.codeRepository = fiche.depotCode;
  return d;
}

// Remplace exactement une occurrence. Le remplacement passe par une fonction :
// un « $ » dans le contenu n'est jamais interprété.
function remplacerUneFois(html, re, remplacement, libelle, manquants) {
  let n = 0;
  const sortie = html.replace(re, () => { n++; return remplacement; });
  if (n !== 1) { manquants.push(libelle); return html; }
  return sortie;
}

function entete(html, { titre, description, canonique, indexation, donnees }, manquants) {
  const e = echapper;
  html = remplacerUneFois(html, /<title>[^<]*<\/title>/, `<title>${e(titre)}</title>`, 'title', manquants);
  html = remplacerUneFois(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${e(description)}">`, 'description', manquants);
  html = remplacerUneFois(html, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${indexation ? 'index, follow' : 'noindex, nofollow'}">`, 'robots', manquants);
  html = remplacerUneFois(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${e(canonique)}">`, 'canonical', manquants);
  html = remplacerUneFois(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${e(titre)}">`, 'og:title', manquants);
  html = remplacerUneFois(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${e(description)}">`, 'og:description', manquants);
  if (donnees) {
    html = remplacerUneFois(html, /<script type="application\/ld\+json" id="donneesStructurees">[\s\S]*?<\/script>/,
      `<script type="application/ld+json" id="donneesStructurees">${jsonPourScript(donnees)}</script>`, 'données structurées', manquants);
  }
  return html;
}

// Montre le bloc de fiche et masque l'accueil : le script de la page fait
// l'inverse dès qu'il a chargé les fiches.
function corps(html, contenuHtml, manquants) {
  html = remplacerUneFois(html, /<main id="ficheStatique" class="fiche-statique" hidden><!--FICHE--><\/main>/,
    `<main id="ficheStatique" class="fiche-statique">${contenuHtml}</main>`, 'fiche', manquants);
  return remplacerUneFois(html, /<div id="accueil">/, '<div id="accueil" hidden>', 'accueil', manquants);
}

function lienRetour() {
  return `<p class="fiche-retour"><a class="bouton" href="/">${echapper(TEXTES.fiche.retour)}</a></p>`;
}

function rendrePage(gabarit, fiche, { origine, indexation }) {
  const manquants = [];
  let html = entete(gabarit, {
    titre: `${fiche.nom} | ${NOM_SITE}`,
    description: tronquer(fiche.phrase || fiche.description || TEXTES.sousTitre, 300),
    canonique: adresseFiche(fiche, origine),
    indexation,
    donnees: donneesStructurees(fiche, origine),
  }, manquants);
  html = corps(html, htmlFiche(fiche) + lienRetour(), manquants);
  return { html, manquants };
}

function rendreAccueil(gabarit, { origine, indexation }) {
  const manquants = [];
  let html = remplacerUneFois(gabarit, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${indexation ? 'index, follow' : 'noindex, nofollow'}">`, 'robots', manquants);
  html = remplacerUneFois(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${echapper(origine)}/">`, 'canonical', manquants);
  return html;
}

// Adresse sans ressource : un message, le lien vers l'accueil, jamais indexée.
function rendreIntrouvable(gabarit, { origine, message } = {}) {
  const manquants = [];
  let html = remplacerUneFois(gabarit, /<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">', 'robots', manquants);
  html = remplacerUneFois(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${echapper(origine || '')}/">`, 'canonical', manquants);
  return corps(html, `<p>${echapper(message || TEXTES.fiche.introuvable)}</p>${lienRetour()}`, manquants);
}

function rendrePlanDuSite(fiches, origine) {
  const adresses = [`${origine}/`].concat(fiches.map((f) => adresseFiche(f, origine)).sort());
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + adresses.map((u) => `<url><loc>${echapper(u)}</loc></url>`).join('\n')
    + '\n</urlset>\n';
}

function rendreRobots(indexation, origine) {
  return indexation
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origine}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}

module.exports = { rendrePage, rendreAccueil, rendreIntrouvable, rendrePlanDuSite, rendreRobots, donneesStructurees, jsonPourScript, tronquer };
