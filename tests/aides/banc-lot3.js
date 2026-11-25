/**
 * Le banc d'essai du lot 3 : les vrais modules des porteurs, de la qualité, des liens, des
 * ressources et des versions, sur de fausses bases Notion et un faux réseau.
 */
const { creerPorteurs } = require('../../lib/porteurs');
const { creerQualite } = require('../../lib/qualite');
const { creerLiens } = require('../../lib/liens');
const { creerRessources } = require('../../lib/ressources');
const { creerVersions } = require('../../lib/versions');
const { verrousEnMemoire } = require('../../lib/approbation');
const { fauxNotion } = require('./faux-notion');
const { fausseBase, brute } = require('./fausses-fiches');

const SECRET = 'secret-d-essai';
const ENV = { CONTRIBUTIONS: 'oui', JWT_SECRET: SECRET, SITE_URL: 'https://carto.exemple', NOTION_DB_VERSIONS: 'base-versions', CARTO_BASEMAP_KEY: 'cle-du-fond' };
const TESS = 'tess@exemple.ca';
const LEA = 'lea@exemple.ca';
const MAINTENANT = Date.parse('2026-11-25T15:00:00.000Z');

const porteur = (id, nom, o = {}) => ({ id: `id-notion-${id}`, nom, adresse: '', latitude: null, longitude: null, siteWeb: null, institutionBottinId: null, ...o });
const PORTEURS = () => [
  porteur('chum', 'CHUM', { adresse: '1051 rue Sanguinet, Montréal', latitude: 45.51, longitude: -73.56, institutionBottinId: 'id-notion-institution' }),
  porteur('doublon', 'C.H.U.M.'),
  porteur('justine', 'Hôpital Ste-Justine', { institutionBottinId: 'id-notion-fermee' }),
  porteur('vide', 'Porteur sans fiche'),
];
// Trois fiches rattachées au doublon : deux publiées (dont une qui porte déjà le porteur gardé) et une écartée.
const FICHES = () => [
  brute({ id: 'id-notion-a', nom: 'Alpha', lien: 'https://alpha.exemple.org', porteurIds: ['id-notion-doublon'], motsCles: ['fhir', 'cancer'], verifieeLe: '2026-06-01', logo: 'https://alpha.exemple.org/l.png' }),
  brute({ id: 'id-notion-b', nom: 'Bêta', lien: 'https://beta.exemple.org', porteurIds: ['id-notion-chum', 'id-notion-doublon'], motsCles: ['FHIR', 'fhir'], verifieeLe: '2026-06-01', logo: 'https://beta.exemple.org/l.png' }),
  brute({ id: 'id-notion-c', nom: 'Gamma', lien: 'https://gamma.exemple.org', porteurIds: ['id-notion-doublon', 'id-notion-justine'], motsCles: ['fhir'], statutFiche: 'Écartée' }),
  brute({ id: 'id-notion-d', nom: 'Delta', lien: 'https://delta.exemple.org', porteurIds: ['id-notion-chum'], motsCles: ['FHIR'], verifieeLe: '2026-06-01', logo: 'https://delta.exemple.org/l.png', lienEnPanneDepuis: '2026-11-18' }),
];

function banc({ env = ENV, pannes = {}, pannesVersions = {}, fiches = FICHES(), porteurs = PORTEURS(), ouvertes = [], contenus = {}, reponses = {}, coordonnees = { latitude: 46.8, longitude: -71.2 }, horloge = () => MAINTENANT, budgetMs, avant = null } = {}) {
  const equipe = [
    { nom: 'Tess Berthier', courriel: TESS, role: 'approbation', resume: true },
    { nom: 'Léa Lecture', courriel: LEA, role: 'lecture', resume: true },
  ];
  const base = fausseBase({ fiches, porteurs, pannes, titres: { 'id-notion-institution': 'Centre hospitalier de l\'Université de Montréal' } });
  // « avant » : de quoi changer la base au milieu d'un geste, juste avant un appel donné.
  const notion = avant ? Object.fromEntries(Object.entries(base.notion).map(([nom, f]) => [nom, async (...args) => { await avant(nom, args, base); return f(...args); }])) : base.notion;
  const lireTitre = notion.lireTitrePage;
  notion.lireTitrePage = async (id) => { if (id === 'id-notion-fermee') { base.appels.push({ nom: 'lireTitrePage', args: id }); throw new Error('accès refusé'); } return lireTitre(id); };
  const faux = fauxNotion({ pannes: pannesVersions });
  const journal = [];
  const noterJournal = (...ligne) => journal.push(ligne.join(' '));
  const versions = creerVersions(faux.client, env, { journal: noterJournal, maintenant: horloge });
  const propositions = {
    async equipe() { return equipe; },
    async peutDecider(courriel) { return equipe.some((x) => x.courriel === courriel && x.role !== 'lecture'); },
    async listerPropositions() { return ouvertes; },
    async lireContenus(ids) { return new Map(ids.map((id) => [id, contenus[id] || null])); },
  };
  const verrous = verrousEnMemoire();
  const demandes = [];
  const liens = creerLiens({
    notion, maintenant: horloge, journal: noterJournal,
    resoudre: async () => [{ address: '93.184.216.34', family: 4 }],
    requete: async (d) => { demandes.push(d); const r = Object.hasOwn(reponses, d.url) ? reponses[d.url] : 200; if (r === 'reseau') throw new Error('ECONNREFUSED'); return { statut: r, location: null }; },
  });
  const geocodees = [];
  const geocoder = async (adresse) => { geocodees.push(adresse); if (coordonnees === 'panne') throw new Error('Nominatim a répondu 503'); return coordonnees; };
  let vidages = 0;
  const commun = { notion, versions, propositions, verrous, secret: SECRET, journal: noterJournal, attendre: async () => {}, maintenant: horloge, viderMemoire: () => { vidages += 1; }, budgetMs };
  const lesPorteurs = creerPorteurs({ ...commun, geocoder });
  const qualite = creerQualite({ ...commun, liens });
  const ressources = creerRessources(commun);
  const ecritures = () => ['mettreAJourFiche', 'creerFiche', 'mettreAJourPorteur', 'creerPorteur', 'archiverPorteur'].reduce((n, nom) => n + base.de(nom).length, 0) + faux.de('pages.create').length;
  // Les versions écrites, dans l'ordre : la fiche, la source, la note et les changements.
  const versionsEcrites = () => faux.de('pages.create').map((a) => ({
    fiche: a.properties.Fiche.relation[0].id, source: a.properties.Source.select.name, par: (a.properties['Faite par'] || {}).email,
    ...JSON.parse(a.children[0].code.rich_text.map((s) => s.text.content).join('')),
  }));
  return { ...base, notion, faux, versions, propositions, verrous, liens, porteursService: lesPorteurs, qualite, ressources, journal, demandes, geocodees, ecritures, versionsEcrites, vidages: () => vidages, equipe, env };
}

// Le repère opaque d'un porteur, tel que l'écran le reçoit.
async function repereDe(b, nom) {
  const trouve = (await b.porteursService.lister()).porteurs.find((p) => p.nom === nom);
  return trouve ? trouve.id : null;
}

module.exports = { banc, repereDe, porteur, PORTEURS, FICHES, SECRET, ENV, TESS, LEA, MAINTENANT };
