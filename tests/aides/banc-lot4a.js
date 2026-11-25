/**
 * Le banc d'essai du lot 4a : la vraie route du panneau sur les vrais modules (équipe, journal,
 * propositions, approbation, ressources, porteurs, qualité, versions), de fausses bases Notion et
 * de faux courriels. Rien ne sort du poste.
 */
const admin = require('../../api/admin');
const { signer } = require('../../lib/jetons');
const { creerPropositions } = require('../../lib/propositions');
const { creerApprobation, verrousEnMemoire } = require('../../lib/approbation');
const { creerRessources } = require('../../lib/ressources');
const { creerPorteurs } = require('../../lib/porteurs');
const { creerQualite } = require('../../lib/qualite');
const { creerVersions } = require('../../lib/versions');
const { creerEquipe } = require('../../lib/equipe');
const { creerJournal } = require('../../lib/journal');
const { assembler } = require('../../lib/fiches');
const { fauxNotion } = require('./faux-notion');
const { fausseBase, brute } = require('./fausses-fiches');
const { inscrire, lignes } = require('./fausse-equipe');

const SECRET = 'secret-d-essai';
const ENV = {
  CONTRIBUTIONS: 'oui', JWT_SECRET: SECRET, SITE_URL: 'https://carto.exemple',
  NOTION_DB_APPROBATEURS: 'base-approbateurs', NOTION_DB_PROPOSITIONS: 'base-propositions', NOTION_DB_VERSIONS: 'base-versions', NOTION_DB_JOURNAL: 'base-journal',
};
const TESS = 'tess@exemple.ca';     // Administration
const MAX = 'max@exemple.ca';       // Approbation
const LEA = 'lea@exemple.ca';       // Lecture seule
const ODILE = 'odile@exemple.ca';   // retirée de l'équipe : sa ligne reste, inactive
const PAT = 'pat@exemple.org';      // une personne du public
const T0 = Date.parse('2026-11-25T15:00:00.000Z');

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; }, send(o) { this.corps = o; return this; } };
}
const temoin = (courriel = TESS) => `carto_session=${signer('session', { courriel }, { secret: SECRET })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}

function banc({ env = ENV, pannes = {}, pannesNotion = {}, envoi = { envoye: true }, sansJournal = false } = {}) {
  const faux = fauxNotion({ pannes: pannesNotion, uuid: true });
  inscrire(faux, { id: 'id-notion-tess', nom: 'Tess Berthier', courriel: TESS, role: 'Administration' });
  inscrire(faux, { id: 'id-notion-max', nom: 'Maxime Lafrenière', courriel: MAX, role: 'Approbation' });
  inscrire(faux, { id: 'id-notion-lea', nom: 'Léa Lecture', courriel: LEA, role: 'Lecture seule' });
  inscrire(faux, { id: 'id-notion-odile', nom: 'Odile Charbonneau', courriel: ODILE, role: 'Approbation', actif: false });
  const base = fausseBase({
    pannes,
    porteurs: [
      { id: 'id-notion-chum', nom: 'CHUM', adresse: '', latitude: 45.5, longitude: -73.5, siteWeb: null, institutionBottinId: null },
      { id: 'id-notion-doublon', nom: 'C.H.U.M.', adresse: '', latitude: null, longitude: null, siteWeb: null, institutionBottinId: null },
    ],
    fiches: [
      brute({ motsCles: ['cancer', 'Cancer'] }),
      brute({ id: 'id-notion-outil', nom: 'Outil Y', typePrincipal: 'Logiciel ou application', lien: 'https://outil-y.org', porteurIds: ['id-notion-doublon'], motsCles: ['Cancer'] }),
      brute({ id: 'id-notion-ecartee', nom: 'Vieille fiche', lien: null, statutFiche: 'Écartée', porteurIds: [] }),
    ],
  });
  const lignesServeur = [];
  const journal = (...l) => lignesServeur.push(l.join(' '));
  let instant = T0;
  const maintenant = () => { instant += 1000; return instant; };
  const envois = [];
  const expedier = (sorte) => async (m) => { envois.push({ sorte, ...m }); if (envoi === 'panne') throw new Error('Resend en panne'); return envoi; };
  const courriels = { approuvee: expedier('approuvee'), refusee: expedier('refusee'), lienPanneau: expedier('lienPanneau'), propositionRecue: expedier('propositionRecue'), resumeHebdomadaire: expedier('resumeHebdomadaire') };
  const propositions = creerPropositions(faux.client, env, { maintenant });
  const versions = creerVersions(faux.client, env, { maintenant, journal });
  const verrous = verrousEnMemoire();
  const publiques = () => assembler(base.fiches, base.porteurs);
  const approbation = creerApprobation({
    notion: base.notion, propositions, courriels, versions, verrous, maintenant, journal, attendre: async () => {},
    geocoder: async () => null, fichiers: { async telecharger() { throw new Error('aucun fichier'); } },
    idParAdresse: async () => publiques().idParAdresse,
  });
  const commun = { notion: base.notion, versions, propositions, verrous, secret: SECRET, journal, maintenant, attendre: async () => {} };
  const ressources = creerRessources(commun);
  const porteurs = creerPorteurs({ ...commun, geocoder: async () => ({ latitude: 46.8, longitude: -71.2 }) });
  const qualite = creerQualite({ ...commun, liens: {} });
  const equipe = creerEquipe({ client: faux.client, env, courriels, verrous, secret: SECRET, journal, attendre: async () => {} });
  const journalEquipe = creerJournal(faux.client, env, { maintenant, journal });
  const deps = {
    env, journal, limites: { async consommerJeton() { return true; } }, propositions, notion: base.notion, source: async () => publiques(),
    fichiers: { async telecharger() { throw new Error('aucun fichier'); } }, approbation, ressources, porteurs, qualite, equipe,
    ...(sansJournal ? {} : { journalEquipe }),
  };
  const gestionnaire = admin.creerGestionnaire(deps);
  const vues = [];
  const appeler = async (req) => { const res = reponse(); await gestionnaire(req, res); vues.push({ action: req.query.action, res }); return res; };
  const pagesDe = (baseNotion) => [...faux.pages.values()].filter((p) => p.parent.database_id === baseNotion);
  const texte = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.text.content).join('');
  return {
    ...base, faux, deps, envois, lignesServeur, vues, appeler, propositions, equipe,
    envoyer: (action, corps = {}, par = TESS, options = {}) => appeler(requete('POST', action, { body: corps, cookie: temoin(par), ...options })),
    lire: (action, query = {}, par = TESS) => appeler(requete('GET', action, { query, cookie: temoin(par) })),
    // Le journal de l'équipe tel qu'il est écrit dans Notion, de la première ligne à la dernière.
    journalEcrit: () => pagesDe('base-journal').map((p) => ({ geste: p.properties.Geste.select.name, par: (p.properties['Fait par'] || {}).email, sur: texte(p.properties.Sur), phrase: texte(p.properties.Titre) })),
    versionsEcrites: () => pagesDe('base-versions').map((p) => ({
      fiche: p.properties.Fiche.relation[0].id, source: p.properties.Source.select.name, par: (p.properties['Faite par'] || {}).email,
      proposition: p.properties.Proposition ? p.properties.Proposition.relation[0].id : null,
    })),
    propositionsEcrites: () => pagesDe('base-propositions'),
    equipeEcrite: () => lignes(faux),
    ecrituresFiches: () => base.de('mettreAJourFiche').length + base.de('creerFiche').length,
    // Le repère opaque d'une personne, tel que l'écran « Équipe » le reçoit.
    async repere(courriel) { return ((await equipe.lister({ moi: TESS })).find((x) => x.courriel === courriel) || {}).id; },
    // Une proposition du public sur la fiche « Cohorte X ».
    async propositionPublique(extra = {}) {
      return propositions.creerProposition({
        genre: 'modification', ficheId: 'id-notion-x', courriel: PAT, nomProposant: 'Pat', lienAvecRessource: 'responsable', titre: 'Modification : Cohorte X',
        contenu: { propose: { phrase: { avant: 'Une phrase.', apres: 'Une phrase du public.' } }, applique: null, porteursNouveaux: {} }, ...extra,
      });
    },
  };
}

module.exports = { banc, requete, temoin, reponse, SECRET, ENV, TESS, MAX, LEA, ODILE, PAT };
