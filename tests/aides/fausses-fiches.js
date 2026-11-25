/**
 * Fausse base « Ressources » pour les essais : des fiches dans la forme où lib/notion.js les lit,
 * et les écritures appliquées en mémoire à partir des propriétés Notion reçues.
 */
const { PROP } = require('../../lib/notion');

const TYPE_JEU_NOTION = 'Jeu de données ou cohorte ou biobanque';
const TYPE_JEU = 'Jeu de données, cohorte ou biobanque';
const OPTIONS = {
  typePrincipal: [TYPE_JEU, 'Logiciel ou application'], secondType: [TYPE_JEU, 'Logiciel ou application'],
  etat: ['Actif', 'Archivé'], frais: ['Gratuit'], portee: ['Le Québec'], collecte: [],
  langues: ['Français', 'Anglais'], modesAcces: ['Ouvert', 'Sur demande'], typesDonnees: [],
  motsCles: ['cancer', 'génomique'], normes: ['HL7 FHIR'], outils: [], financePar: [],
};

function brute(o = {}) {
  return {
    id: 'id-notion-x', nom: 'Cohorte X', autresNoms: '', typePrincipal: TYPE_JEU_NOTION, secondType: null,
    phrase: 'Une phrase.', description: '', motsCles: ['cancer'], lien: 'https://cohorte-x.org', autresLiens: '', etat: 'Actif',
    verifieeLe: null, verifieePar: null, langues: [], modesAcces: [], commentAcceder: null, frais: null, environnementSecurise: false,
    reserveA: '', responsable: '', profilResponsable: null, contact: 'a@b.org', porteurIds: ['id-notion-chum'], portee: null, financePar: [],
    population: '', periode: '', typesDonnees: [], normes: [], outils: [], collecte: null, jumelage: false, dictionnaire: null,
    depotCode: null, doi: null, licence: '', logo: null, logoFichier: null, logoFichierUrl: null, modifieeLe: '2026-11-01T00:00:00.000Z',
    statutFiche: 'Publiée', faitPartieDe: [], reposeSur: [], donneAccesA: [], remplace: [], ...o,
  };
}

const texteDe = (segments) => (segments || []).map((s) => s.text.content).join('');
// Applique des propriétés Notion à une fiche brute, comme le ferait une relecture de la page.
function appliquer(fiche, proprietes) {
  const cleDe = Object.fromEntries(Object.entries(PROP).map(([cle, colonne]) => [colonne, cle]));
  for (const [colonne, p] of Object.entries(proprietes)) {
    const cle = cleDe[colonne];
    if (!cle) throw new Error(`colonne inconnue : ${colonne}`);
    if (p.title) fiche[cle] = texteDe(p.title);
    else if (p.rich_text) fiche[cle] = texteDe(p.rich_text);
    else if (Object.hasOwn(p, 'select')) fiche[cle] = p.select ? p.select.name : null;
    else if (p.multi_select) fiche[cle] = p.multi_select.map((o) => o.name);
    else if (Object.hasOwn(p, 'url')) fiche[cle] = p.url;
    else if (Object.hasOwn(p, 'email')) fiche[cle] = p.email;
    else if (Object.hasOwn(p, 'checkbox')) fiche[cle] = p.checkbox;
    else if (p.relation) fiche[cle === 'porteurs' ? 'porteurIds' : cle] = p.relation.map((r) => r.id);
    else if (Object.hasOwn(p, 'date')) fiche[cle] = p.date ? p.date.start : null;
    else if (p.files) { fiche.logoFichier = null; fiche.logoFichierUrl = null; }
    else throw new Error(`propriété inattendue : ${colonne}`);
  }
}

// notion : ce que lib/ressources.js attend de lib/notion.js, sur des fiches en mémoire.
function fausseBase({ fiches = [], porteurs = [], pannes = {}, options = OPTIONS, titres = {} } = {}) {
  const appels = []; let n = 0;
  // Une panne est permanente (true) ou décidée appel par appel (fonction des arguments).
  const noter = (nom, args) => {
    appels.push({ nom, args });
    const panne = pannes[nom];
    if (typeof panne === 'function' ? panne(args, appels.filter((a) => a.nom === nom).length) : panne) throw new Error(`${nom} en panne`);
  };
  const copie = (v) => JSON.parse(JSON.stringify(v));
  const notion = {
    async lireRessources() { noter('lireRessources'); return copie(fiches); },
    async lirePorteurs() { noter('lirePorteurs'); return copie(porteurs); },
    async lireFiche(id) { noter('lireFiche', id); const f = fiches.find((x) => x.id === id); return f ? copie(f) : null; },
    async lireOptions() { return options; },
    async trouverFiche({ nom, lien }) { noter('trouverFiche', { nom, lien }); const f = fiches.find((x) => x.nom === nom && (x.lien || null) === (lien || null)); return f ? f.id : null; },
    async mettreAJourFiche(id, proprietes) { noter('mettreAJourFiche', { id, proprietes }); appliquer(fiches.find((x) => x.id === id), proprietes); },
    async creerFiche(proprietes) {
      noter('creerFiche', proprietes);
      const fiche = brute({ id: `id-notion-neuve-${++n}`, nom: '', phrase: '', lien: null, contact: null, motsCles: [], porteurIds: [], typePrincipal: null, etat: null, statutFiche: null });
      appliquer(fiche, proprietes); fiches.push(fiche);
      return fiche.id;
    },
    // Les porteurs : lecture d'un seul, écriture, mise à la corbeille, et le titre d'une page liée.
    async lirePorteur(id) { noter('lirePorteur', id); const o = porteurs.find((x) => x.id === id); return o ? copie(o) : null; },
    async mettreAJourPorteur(id, valeurs) { noter('mettreAJourPorteur', { id, valeurs }); Object.assign(porteurs.find((x) => x.id === id), copie(valeurs)); },
    async creerPorteur(valeurs) {
      noter('creerPorteur', valeurs);
      const o = { id: `id-notion-porteur-${++n}`, nom: '', adresse: '', latitude: null, longitude: null, siteWeb: null, institutionBottinId: null, ...copie(valeurs) };
      porteurs.push(o);
      return o.id;
    },
    async archiverPorteur(id) { noter('archiverPorteur', id); const i = porteurs.findIndex((x) => x.id === id); if (i >= 0) porteurs.splice(i, 1); },
    async lireTitrePage(id) { noter('lireTitrePage', id); return titres[id] || ''; },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  return { notion, fiches, porteurs, appels, de };
}

module.exports = { fausseBase, brute, OPTIONS, TYPE_JEU, TYPE_JEU_NOTION };
