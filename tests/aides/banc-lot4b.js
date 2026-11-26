/**
 * Le banc d'essai du lot 4b : la vraie route du panneau sur les vrais modules des réglages, des
 * courriels, de l'équipe, des propositions et du journal, de fausses bases Notion et un faux
 * service d'envoi. Rien ne sort du poste.
 */
const admin = require('../../api/admin');
const { signer } = require('../../lib/jetons');
const { creerPropositions } = require('../../lib/propositions');
const { verrousEnMemoire } = require('../../lib/approbation');
const { creerEquipe } = require('../../lib/equipe');
const { creerJournal } = require('../../lib/journal');
const { creerReglages, COLONNES } = require('../../lib/reglages');
const { creerCourriels } = require('../../lib/courriels');
const { fauxNotion } = require('./faux-notion');
const { inscrire } = require('./fausse-equipe');

const SECRET = 'secret-d-essai';
const ADRESSE_ESSAI = 'boite-d-essai@exemple.org';
const ENV = {
  CONTRIBUTIONS: 'oui', JWT_SECRET: SECRET, SITE_URL: 'https://carto.exemple',
  NOTION_DB_APPROBATEURS: 'base-approbateurs', NOTION_DB_PROPOSITIONS: 'base-propositions', NOTION_DB_JOURNAL: 'base-journal', NOTION_DB_REGLAGES: 'base-reglages',
  RESEND_API_KEY: 're_cle_secrete', EMAIL_TEST_RECIPIENT: ADRESSE_ESSAI, NOTION_KEY: 'ntn_cle_secrete', CRON_SECRET: 'cron-secret',
};
const SECRETS = [ADRESSE_ESSAI, 'boite-d-essai', 're_cle_secrete', 'ntn_cle_secrete', 'cron-secret', SECRET];
const TESS = 'tess@exemple.ca';     // Administration
const MAX = 'max@exemple.ca';       // Approbation
const LEA = 'lea@exemple.ca';       // Lecture seule
const ODILE = 'odile@exemple.ca';   // retirée de l'équipe : sa ligne reste, inactive
const T0 = Date.parse('2026-11-25T15:00:00.000Z');

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; }, send(o) { this.corps = o; return this; } };
}
const temoin = (courriel = TESS) => `carto_session=${signer('session', { courriel }, { secret: SECRET })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', 'x-real-ip': '10.0.0.7', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}

// env : les réglages de Vercel ; sansBase : sans NOTION_DB_REGLAGES ; reglages : { clé: valeur } déjà enregistrés ;
// essaisPermis : ce que répond la limite des essais de courriel ; echecEnvoi : le service d'envoi est en panne.
// sansService : sans service d'envoi, comme sur un poste local (les courriels sont simulés).
function banc({ env = {}, sansBase = false, reglages = {}, pannesNotion = {}, essaisPermis = true, echecEnvoi = false, sansJournal = false, sansService = false } = {}) {
  const complet = { ...ENV, ...env };
  if (sansService) delete complet.RESEND_API_KEY;
  if (sansBase) delete complet.NOTION_DB_REGLAGES;
  const faux = fauxNotion({ pannes: pannesNotion, uuid: true });
  inscrire(faux, { id: 'id-notion-tess', nom: 'Tess Berthier', courriel: TESS, role: 'Administration' });
  inscrire(faux, { id: 'id-notion-max', nom: 'Maxime Lafrenière', courriel: MAX, role: 'Approbation' });
  inscrire(faux, { id: 'id-notion-lea', nom: 'Léa Lecture', courriel: LEA, role: 'Lecture seule' });
  inscrire(faux, { id: 'id-notion-odile', nom: 'Odile Charbonneau', courriel: ODILE, role: 'Approbation', actif: false });
  // Pose un réglage directement dans la fausse base, comme s'il avait été enregistré plus tôt.
  const poser = (cle, json, par = TESS) => {
    const id = `ligne-${cle}`;
    faux.pages.set(id, { id, parent: { database_id: 'base-reglages' }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: cle } }] }, [COLONNES.modifieLe]: { date: { start: '2026-11-20T10:00:00.000Z' } }, [COLONNES.modifiePar]: { email: par } } });
    faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
  };
  for (const [cle, valeur] of Object.entries(reglages)) poser(cle, JSON.stringify(valeur));

  const lignesServeur = [];
  const journal = (...l) => lignesServeur.push(l.join(' '));
  let instant = T0;
  const maintenant = () => { instant += 1000; return instant; };
  const envois = [];
  const envoyeur = async (message) => { if (echecEnvoi) throw new Error('Resend en panne'); envois.push(message); };
  const socle = creerReglages(faux.client, complet, { maintenant, journal });
  const courriels = creerCourriels({ envoyeur: sansService ? undefined : envoyeur, env: complet, journal, reglages: socle });
  const propositions = creerPropositions(faux.client, complet, { maintenant });
  const verrous = verrousEnMemoire();
  const demandesDEssai = [];
  const limites = {
    async consommerJeton() { return true; }, async autoriserLien() { return true; },
    async autoriserEssai(demande) { demandesDEssai.push(demande); return typeof essaisPermis === 'function' ? essaisPermis(demandesDEssai.length) : essaisPermis; },
  };
  const equipe = creerEquipe({ client: faux.client, env: complet, courriels, limites, reglages: socle, verrous, secret: SECRET, journal, attendre: async () => {} });
  const journalEquipe = creerJournal(faux.client, complet, { maintenant, journal });
  const deps = {
    env: complet, journal, limites, propositions, courriels, reglages: socle, equipe,
    source: async () => ({ ressources: [], porteurs: [], idParAdresse: {} }),
    ...(sansJournal ? {} : { journalEquipe }),
  };
  const gestionnaire = admin.creerGestionnaire(deps);
  const vues = [];
  const appeler = async (req) => { const res = reponse(); await gestionnaire(req, res); vues.push({ action: req.query.action, res }); return res; };
  const pagesDe = (base) => [...faux.pages.values()].filter((p) => p.parent.database_id === base && !p.archived);
  const texte = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.text.content).join('');
  return {
    faux, deps, envois, lignesServeur, vues, appeler, socle, courriels, demandesDEssai, poser, env: complet,
    envoyer: (action, corps = {}, par = TESS, options = {}) => appeler(requete('POST', action, { body: corps, cookie: temoin(par), ...options })),
    lire: (action, query = {}, par = TESS) => appeler(requete('GET', action, { query, cookie: temoin(par) })),
    // Le journal de l'équipe tel qu'il est écrit dans Notion, de la première ligne à la dernière.
    journalEcrit: () => pagesDe('base-journal').map((p) => ({ geste: p.properties.Geste.select.name, par: (p.properties['Fait par'] || {}).email, sur: texte(p.properties.Sur), phrase: texte(p.properties.Titre) })),
    // Les réglages tels qu'ils sont écrits dans Notion : { clé: valeur }.
    reglagesEcrits: () => Object.fromEntries(pagesDe('base-reglages').map((p) => [texte(p.properties[COLONNES.cle]), JSON.parse(faux.blocs.get(p.id)[0].code.rich_text.map((s) => s.text.content).join(''))])),
    ecritures: () => ['pages.create', 'pages.update', 'blocks.update', 'blocks.children.append'].reduce((n, nom) => n + faux.de(nom).length, 0),
  };
}

module.exports = { banc, requete, temoin, reponse, SECRET, SECRETS, ADRESSE_ESSAI, ENV, TESS, MAX, LEA, ODILE };
