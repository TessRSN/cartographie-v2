/**
 * Lecture des bases Notion de la cartographie (Ressources et Porteurs).
 * Seul fichier qui connaît les colonnes de ces deux bases : leurs noms sont dans PROP.
 * L'écriture ne passe que par le catalogue des champs (public/js/champs.js).
 */
const { Client } = require('@notionhq/client');
const { CHAMPS } = require('../public/js/champs.js');
const { LIBELLES_TYPE } = require('./fiches');

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
  normes: 'Normes et formats',                  // multi_select
  outils: 'Outils et environnements',           // multi_select
  doi: 'DOI',                                   // url (https://doi.org/…)
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
    normes: choixMultiples(p[PROP.normes]),
    outils: choixMultiples(p[PROP.outils]),
    collecte: choix(p[PROP.collecte]),
    jumelage: coche(p[PROP.jumelage]),
    dictionnaire: adresseWeb(p[PROP.dictionnaire]),
    depotCode: adresseWeb(p[PROP.depotCode]),
    doi: adresseWeb(p[PROP.doi]),
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

// ─── ÉCRITURE ───
// Type de colonne Notion de chaque champ du catalogue.
const TYPE_COLONNE = {
  nom: 'title',
  autresNoms: 'rich_text', phrase: 'rich_text', description: 'rich_text', autresLiens: 'rich_text', reserveA: 'rich_text',
  responsable: 'rich_text', population: 'rich_text', periode: 'rich_text', licence: 'rich_text',
  typePrincipal: 'select', secondType: 'select', etat: 'select', frais: 'select', portee: 'select', collecte: 'select',
  motsCles: 'multi_select', langues: 'multi_select', modesAcces: 'multi_select', financePar: 'multi_select',
  typesDonnees: 'multi_select', normes: 'multi_select', outils: 'multi_select',
  lien: 'url', commentAcceder: 'url', profilResponsable: 'url', dictionnaire: 'url', depotCode: 'url', doi: 'url', logo: 'url',
  contact: 'email',
  environnementSecurise: 'checkbox', jumelage: 'checkbox',
  porteurs: 'relation', faitPartieDe: 'relation', reposeSur: 'relation', donneAccesA: 'relation', remplace: 'relation',
};
const CHAMPS_TYPE = ['typePrincipal', 'secondType'];
const TYPE_NOTION = Object.fromEntries(Object.entries(LIBELLES_TYPE).map(([notionNom, publicNom]) => [publicNom, notionNom]));
const LIMITE_SEGMENT = 2000; // longueur maximale d'un segment de texte dans Notion

// Découpe un texte en segments que Notion accepte.
function segments(texte) {
  const brut = String(texte === null || texte === undefined ? '' : texte);
  const morceaux = [];
  for (let i = 0; i < brut.length;) {
    let fin = Math.min(i + LIMITE_SEGMENT, brut.length);
    // Ne pas couper entre les deux moitiés d'un caractère (émoji, caractère rare).
    const dernier = brut.charCodeAt(fin - 1);
    if (fin < brut.length && dernier >= 0xd800 && dernier <= 0xdbff) fin -= 1;
    morceaux.push({ type: 'text', text: { content: brut.slice(i, fin) } });
    i = fin;
  }
  return morceaux;
}

// Propriétés Notion à écrire pour des valeurs de formulaire. Seules les clés du catalogue passent.
// Les relations ne sont écrites que si leurs identifiants sont fournis (porteurIds, ficheIds[clé]).
function proprietesDepuisValeurs(valeurs, { porteurIds, ficheIds = {} } = {}) {
  const proprietes = {};
  for (const { cle } of CHAMPS) {
    if (!Object.hasOwn(valeurs, cle)) continue;
    const v = valeurs[cle];
    const type = TYPE_COLONNE[cle];
    if (type === 'relation') {
      const ids = cle === 'porteurs' ? porteurIds : ficheIds[cle];
      if (Array.isArray(ids)) proprietes[PROP[cle]] = { relation: ids.map((id) => ({ id })) };
    } else if (type === 'title') proprietes[PROP[cle]] = { title: segments(v) };
    else if (type === 'rich_text') proprietes[PROP[cle]] = { rich_text: segments(v) };
    else if (type === 'select') {
      const nom = v && CHAMPS_TYPE.includes(cle) ? (TYPE_NOTION[v] || v) : v;
      proprietes[PROP[cle]] = { select: nom ? { name: nom } : null };
    } else if (type === 'multi_select') proprietes[PROP[cle]] = { multi_select: (v || []).map((name) => ({ name })) };
    else if (type === 'url') proprietes[PROP[cle]] = { url: v || null };
    else if (type === 'email') proprietes[PROP[cle]] = { email: v || null };
    else if (type === 'checkbox') proprietes[PROP[cle]] = { checkbox: !!v };
  }
  return proprietes;
}

// Une fiche lue dans Notion, dans la forme du formulaire : clés du catalogue seulement,
// porteurs en noms, types en libellés publics. Les liens entre fiches sont donnés en adresses
// si la table adresseParId est fournie, et laissés de côté sinon.
function valeursDepuisFiche(fiche, porteursParId, adresseParId) {
  const valeurs = {};
  for (const { cle, saisie } of CHAMPS) {
    if (cle === 'porteurs') {
      valeurs.porteurs = (fiche.porteurIds || []).map((id) => porteursParId.get(id)).filter(Boolean).map((p) => p.nom);
    } else if (saisie === 'fiches') {
      if (adresseParId) valeurs[cle] = (fiche[cle] || []).map((id) => adresseParId.get(id)).filter(Boolean);
    } else if (CHAMPS_TYPE.includes(cle)) valeurs[cle] = fiche[cle] ? (LIBELLES_TYPE[fiche[cle]] || fiche[cle]) : null;
    else valeurs[cle] = fiche[cle] === undefined ? null : fiche[cle];
  }
  return valeurs;
}

const sansTirets = (id) => String(id || '').replace(/-/g, '');

// Lectures et écritures unitaires. Le client et les réglages sont injectables pour les essais.
function ecriture(client = notion(), env = process.env) {
  return {
    // La fiche brute, ou null si la page est archivée, introuvable ou d'une autre base.
    async lireFiche(id) {
      let page;
      try {
        page = await client.pages.retrieve({ page_id: id });
      } catch (err) {
        if (err && (err.code === 'object_not_found' || err.status === 404)) return null;
        throw err;
      }
      if (!page || page.archived || page.in_trash) return null;
      if (sansTirets(page.parent && page.parent.database_id) !== sansTirets(env.NOTION_DB_RESSOURCES)) return null;
      return ficheDepuisPage(page);
    },
    // Identifiant de la fiche qui porte exactement ce nom et ce lien principal, ou null.
    async trouverFiche({ nom, lien }) {
      const reponse = await client.databases.query({
        database_id: env.NOTION_DB_RESSOURCES,
        page_size: 5,
        filter: { and: [
          { property: PROP.nom, title: { equals: nom } },
          { property: PROP.lien, url: lien ? { equals: lien } : { is_empty: true } },
        ] },
      });
      const page = (reponse.results || []).find((r) => !r.archived && !r.in_trash);
      return page ? page.id : null;
    },
    async creerFiche(proprietes) {
      const page = await client.pages.create({ parent: { database_id: env.NOTION_DB_RESSOURCES }, properties: proprietes });
      return page.id;
    },
    async mettreAJourFiche(id, proprietes) {
      await client.pages.update({ page_id: id, properties: proprietes });
    },
    // Valeurs existantes de chaque liste du catalogue (choix fermés et listes ouvertes).
    async lireOptions() {
      const base = await client.databases.retrieve({ database_id: env.NOTION_DB_RESSOURCES });
      const options = {};
      for (const { cle } of CHAMPS) {
        const type = TYPE_COLONNE[cle];
        if (type !== 'select' && type !== 'multi_select') continue;
        const colonne = base.properties && base.properties[PROP[cle]];
        const noms = ((colonne && colonne[type] && colonne[type].options) || []).map((o) => o.name);
        options[cle] = CHAMPS_TYPE.includes(cle) ? noms.map((n) => LIBELLES_TYPE[n] || n) : noms;
      }
      return options;
    },
    async creerPorteur({ nom, adresse, latitude, longitude }) {
      const proprietes = {
        [PROP_PORTEUR.nom]: { title: segments(nom) },
        [PROP_PORTEUR.adresse]: { rich_text: segments(adresse) },
      };
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        proprietes[PROP_PORTEUR.latitude] = { number: latitude };
        proprietes[PROP_PORTEUR.longitude] = { number: longitude };
      }
      const page = await client.pages.create({ parent: { database_id: env.NOTION_DB_PORTEURS }, properties: proprietes });
      return page.id;
    },
  };
}

module.exports = {
  PROP, PROP_PORTEUR, ficheDepuisPage, porteurDepuisPage, lireRessources, lirePorteurs,
  segments, proprietesDepuisValeurs, valeursDepuisFiche, ecriture,
};
