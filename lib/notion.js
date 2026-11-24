/**
 * Lecture des bases Notion de la cartographie (Ressources et Porteurs).
 * Seul fichier qui connaît Notion : les noms de colonnes sont dans PROP.
 * Cette version ne fait que lire.
 */
const { Client } = require('@notionhq/client');

// Client créé au premier appel : les variables d'environnement sont lues
// à l'exécution de la fonction, pas au chargement du module.
let _notion;
function notion() {
  if (!_notion) _notion = new Client({ auth: process.env.NOTION_KEY, timeoutMs: 8000 });
  return _notion;
}

// ─── NOMS DES COLONNES ───
// Les champs internes (notes de veille, remarques, sources) n'y figurent
// pas : ils ne sont jamais lus.
const PROP = {
  nom: 'Nom',                                   // title
  autresNoms: 'Sigle et autres noms',           // rich_text
  typePrincipal: 'Type principal',              // select
  secondType: 'Second type',                    // select
  phrase: 'En une phrase',                      // rich_text
  description: 'Description',                   // rich_text
  motsCles: 'Mots-clés',                        // multi_select
  lien: 'Lien principal',                       // url
  autresLiens: 'Autres liens',                  // rich_text
  etat: 'État',                                 // select
  verifieeLe: 'Vérifiée le',                    // date
  verifieePar: 'Vérifiée par',                  // select
  langues: 'Langues',                           // multi_select
  modesAcces: "Mode d'accès",                   // multi_select
  commentAcceder: 'Comment y accéder',          // url
  frais: 'Frais',                               // select
  environnementSecurise: 'Environnement sécurisé', // checkbox
  reserveA: 'Réservé à',                        // rich_text
  responsable: 'Responsable',                   // rich_text
  profilResponsable: 'Profil du responsable',   // url
  contact: 'Contact',                           // email
  porteurs: 'Porté par',                        // relation -> Porteurs
  portee: 'Portée',                             // select
  financePar: 'Financé par',                    // multi_select
  population: 'Population',                     // rich_text
  periode: 'Période couverte',                  // rich_text
  typesDonnees: 'Types de données',             // multi_select
  collecte: 'Collecte',                         // select
  jumelage: 'Jumelage possible',                // checkbox
  dictionnaire: 'Dictionnaire ou catalogue détaillé', // url
  depotCode: 'Dépôt de code',                   // url
  licence: 'Licence',                           // rich_text
  logo: 'Logo',                                 // url
  statutFiche: 'Statut de la fiche',            // select
  faitPartieDe: 'Fait partie de',               // relation -> Ressources
  reposeSur: 'Repose sur',                      // relation -> Ressources
  donneAccesA: 'Donne accès à',                 // relation -> Ressources
  remplace: 'Remplace',                         // relation -> Ressources
};

const PROP_PORTEUR = {
  nom: 'Nom',                                   // title
  adresse: 'Adresse',                           // rich_text
  latitude: 'Latitude',                         // number
  longitude: 'Longitude',                       // number
  siteWeb: 'Site web',                          // url
  institutionBottin: 'Institution du bottin',   // relation -> Institutions (bottin)
};

// ─── LECTURE PAR TYPE DE PROPRIÉTÉ ───
function texte(prop) {
  if (!prop) return '';
  const segments = prop.title || prop.rich_text || [];
  return segments.map((s) => s.plain_text || '').join('').trim();
}
function choix(prop) {
  return (prop && prop.select && prop.select.name) || null;
}
function choixMultiples(prop) {
  return ((prop && prop.multi_select) || []).map((o) => o.name);
}
function adresseWeb(prop) {
  return (prop && prop.url) || null;
}
function relation(prop) {
  return ((prop && prop.relation) || []).map((r) => r.id);
}
function coche(prop) {
  return !!(prop && prop.checkbox);
}
function nombre(prop) {
  return prop && typeof prop.number === 'number' ? prop.number : null;
}

function ficheDepuisPage(page) {
  const p = page.properties || {};
  const date = p[PROP.verifieeLe] && p[PROP.verifieeLe].date;
  return {
    id: page.id,
    nom: texte(p[PROP.nom]),
    autresNoms: texte(p[PROP.autresNoms]),
    typePrincipal: choix(p[PROP.typePrincipal]),
    secondType: choix(p[PROP.secondType]),
    phrase: texte(p[PROP.phrase]),
    description: texte(p[PROP.description]),
    motsCles: choixMultiples(p[PROP.motsCles]),
    lien: adresseWeb(p[PROP.lien]),
    autresLiens: texte(p[PROP.autresLiens]),
    etat: choix(p[PROP.etat]),
    verifieeLe: (date && date.start) || null,
    verifieePar: choix(p[PROP.verifieePar]),
    langues: choixMultiples(p[PROP.langues]),
    modesAcces: choixMultiples(p[PROP.modesAcces]),
    commentAcceder: adresseWeb(p[PROP.commentAcceder]),
    frais: choix(p[PROP.frais]),
    environnementSecurise: coche(p[PROP.environnementSecurise]),
    reserveA: texte(p[PROP.reserveA]),
    responsable: texte(p[PROP.responsable]),
    profilResponsable: adresseWeb(p[PROP.profilResponsable]),
    contact: (p[PROP.contact] && p[PROP.contact].email) || null,
    porteurIds: relation(p[PROP.porteurs]),
    portee: choix(p[PROP.portee]),
    financePar: choixMultiples(p[PROP.financePar]),
    population: texte(p[PROP.population]),
    periode: texte(p[PROP.periode]),
    typesDonnees: choixMultiples(p[PROP.typesDonnees]),
    collecte: choix(p[PROP.collecte]),
    jumelage: coche(p[PROP.jumelage]),
    dictionnaire: adresseWeb(p[PROP.dictionnaire]),
    depotCode: adresseWeb(p[PROP.depotCode]),
    licence: texte(p[PROP.licence]),
    logo: adresseWeb(p[PROP.logo]),
    statutFiche: choix(p[PROP.statutFiche]),
    faitPartieDe: relation(p[PROP.faitPartieDe]),
    reposeSur: relation(p[PROP.reposeSur]),
    donneAccesA: relation(p[PROP.donneAccesA]),
    remplace: relation(p[PROP.remplace]),
  };
}

function porteurDepuisPage(page) {
  const p = page.properties || {};
  const institution = relation(p[PROP_PORTEUR.institutionBottin]);
  return {
    id: page.id,
    nom: texte(p[PROP_PORTEUR.nom]),
    adresse: texte(p[PROP_PORTEUR.adresse]),
    latitude: nombre(p[PROP_PORTEUR.latitude]),
    longitude: nombre(p[PROP_PORTEUR.longitude]),
    siteWeb: adresseWeb(p[PROP_PORTEUR.siteWeb]),
    institutionBottinId: institution[0] || null,
  };
}

// Lit toutes les pages d'une base, page de résultats par page de résultats.
async function lireBase(databaseId) {
  if (!databaseId) throw new Error('Identifiant de base Notion manquant');
  const pages = [];
  let curseur;
  do {
    const reponse = await notion().databases.query({ database_id: databaseId, page_size: 100, start_cursor: curseur });
    pages.push(...reponse.results);
    curseur = reponse.has_more ? reponse.next_cursor : undefined;
  } while (curseur);
  return pages;
}

async function lireRessources() {
  return (await lireBase(process.env.NOTION_DB_RESSOURCES)).map(ficheDepuisPage);
}

async function lirePorteurs() {
  return (await lireBase(process.env.NOTION_DB_PORTEURS)).map(porteurDepuisPage);
}

module.exports = { PROP, PROP_PORTEUR, ficheDepuisPage, porteurDepuisPage, lireRessources, lirePorteurs };
