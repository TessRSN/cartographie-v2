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

const NOM_CATALOGUE = 'Cartographie des ressources en santé numérique';
const EDITEUR = { '@type': 'Organization', name: 'Réseau santé numérique', url: 'https://rsn.quebec/' };
const CODES_LANGUE = { 'Français': 'fr', 'Anglais': 'en' };
// Modes d'accès qui ne disent rien de la ressource : jamais déclarés aux moteurs.
const MODES_SANS_INFORMATION = new Set(['Non précisé par la ressource', 'Sans objet']);
// Licences écrites exactement comme leur identifiant SPDX : on en donne l'adresse officielle.
const LICENCES_SPDX = new Set(['MIT', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'AGPL-3.0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0']);

const organismes = (noms) => (noms || []).filter(Boolean).map((nom) => ({ '@type': 'Organization', name: nom }));
const unOuPlusieurs = (liste) => (liste.length === 1 ? liste[0] : liste);

// Une licence reconnue devient son adresse officielle ; tout autre texte est gardé tel quel.
function licenceDeclaree(texte) {
  const t = String(texte || '').trim();
  if (!t) return null;
  if (LICENCES_SPDX.has(t)) return `https://spdx.org/licenses/${t}.html`;
  const cc = /^CC (BY(?:-(?:NC|ND|SA))*) (\d\.\d)$/.exec(t);
  if (cc) return `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/`;
  if (t === 'CC0' || t === 'CC0 1.0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return t;
}

// Période au format ISO 8601, seulement quand le texte se lit sans ambiguïté
// (« 2015 », « 1995 à 2022 », « Depuis 1980 »). Sinon rien : on n'invente pas.
function periodeDeclaree(texte) {
  const t = String(texte || '').trim();
  let m;
  if ((m = /^(\d{4})$/.exec(t))) return m[1];
  if ((m = /^(?:de )?(\d{4}) (?:à|-|–) (\d{4})$/i.exec(t))) return `${m[1]}/${m[2]}`;
  if ((m = /^depuis (\d{4})$/i.exec(t))) return `${m[1]}/..`;
  return null;
}

function donneesStructurees(fiche, origine) {
  const type = TYPES_SCHEMA[fiche.typePrincipal] || 'Service';
  const depot = type === 'SoftwareApplication' && /^https?:\/\//i.test(fiche.depotCode || '') ? fiche.depotCode : null;
  const d = {
    '@context': 'https://schema.org',
    // codeRepository appartient à SoftwareSourceCode : un logiciel dont le dépôt est public porte les deux types.
    '@type': depot ? [type, 'SoftwareSourceCode'] : type,
    name: fiche.nom,
    url: adresseFiche(fiche, origine),
  };
  if (fiche.autresNoms) d.alternateName = fiche.autresNoms;
  const description = [fiche.phrase, fiche.description].filter(Boolean).join(' ');
  if (description) d.description = description;
  if ((fiche.motsCles || []).length) d.keywords = fiche.motsCles;
  if (/^https?:\/\//i.test(fiche.lien || '')) d.sameAs = fiche.lien;
  const porteurs = organismes((fiche.porteurs || []).map((p) => p.nom));

  // Un service n'est pas une œuvre : schema.org ne lui reconnaît ni langue, ni licence, ni bailleur.
  if (type === 'Service') {
    if (porteurs.length) d.provider = unOuPlusieurs(porteurs);
    if (fiche.portee) d.areaServed = fiche.portee;
    if (fiche.typePrincipal) d.serviceType = fiche.typePrincipal;
    return d;
  }

  if (porteurs.length) d.publisher = unOuPlusieurs(porteurs);
  const licence = licenceDeclaree(fiche.licence);
  if (licence) d.license = licence;
  if (depot) d.codeRepository = depot;
  const langues = (fiche.langues || []).map((l) => CODES_LANGUE[l]).filter(Boolean);
  if (langues.length) d.inLanguage = unOuPlusieurs(langues);
  const bailleurs = organismes(fiche.financePar);
  if (bailleurs.length) d.funder = unOuPlusieurs(bailleurs);
  const modes = (fiche.modesAcces || []).filter((m) => m && !MODES_SANS_INFORMATION.has(m));
  if (modes.length) d.conditionsOfAccess = modes.join(' ; ');
  if (fiche.frais === 'Non') d.isAccessibleForFree = true;
  else if (fiche.frais === 'Oui') d.isAccessibleForFree = false;

  if (type === 'Dataset' || type === 'DataCatalog') {
    if (fiche.portee) d.spatialCoverage = fiche.portee;
  }
  if (type === 'Dataset') {
    if (porteurs.length) d.creator = unOuPlusieurs(porteurs);
    d.includedInDataCatalog = { '@type': 'DataCatalog', name: NOM_CATALOGUE, url: `${origine}/` };
    if ((fiche.typesDonnees || []).length) d.variableMeasured = fiche.typesDonnees;
    const periode = periodeDeclaree(fiche.periode);
    if (periode) d.temporalCoverage = periode;
  }
  return d;
}

// Le site lui-même, déclaré sur l'accueil.
function donneesDuSite(origine) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: NOM_CATALOGUE, url: `${origine}/`, inLanguage: 'fr', publisher: EDITEUR };
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
  html = remplacerUneFois(html, /<script type="application\/ld\+json" id="donneesStructurees">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="donneesStructurees">${jsonPourScript(donneesDuSite(origine))}</script>`, 'données structurées', manquants);
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
    ? `User-agent: *\nAllow: /\nDisallow: /proposer\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origine}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}

module.exports = { rendrePage, rendreAccueil, rendreIntrouvable, rendrePlanDuSite, rendreRobots, donneesStructurees, jsonPourScript, tronquer };
