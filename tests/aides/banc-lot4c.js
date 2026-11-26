/**
 * Le banc d'essai du lot 4c : la vraie route du panneau sur les vrais modules des réglages du site,
 * des sauvegardes, de l'équipe, des propositions et du journal, de fausses bases Notion et un faux
 * dépôt de fichiers. Rien ne sort du poste.
 */
const admin = require('../../api/admin');
const { signer } = require('../../lib/jetons');
const { creerPropositions } = require('../../lib/propositions');
const { verrousEnMemoire } = require('../../lib/approbation');
const { creerEquipe } = require('../../lib/equipe');
const { creerJournal } = require('../../lib/journal');
const { creerReglages, COLONNES } = require('../../lib/reglages');
const { creerReglagesSite } = require('../../lib/reglages-site');
const { creerSauvegardes, COLONNES: COLONNES_SAUVEGARDE } = require('../../lib/sauvegardes');
const { creerCourriels } = require('../../lib/courriels');
const { fauxNotion } = require('./faux-notion');
const { inscrire } = require('./fausse-equipe');

const SECRET = 'secret-d-essai';
const ADRESSE_ESSAI = 'boite-d-essai@exemple.org';
const ENV = {
  CONTRIBUTIONS: 'oui', JWT_SECRET: SECRET, SITE_URL: 'https://carto.exemple',
  NOTION_DB_RESSOURCES: 'base-ressources', NOTION_DB_PORTEURS: 'base-porteurs', NOTION_DB_VERSIONS: 'base-versions',
  NOTION_DB_APPROBATEURS: 'base-approbateurs', NOTION_DB_PROPOSITIONS: 'base-propositions', NOTION_DB_JOURNAL: 'base-journal',
  NOTION_DB_REGLAGES: 'base-reglages', NOTION_DB_SAUVEGARDES: 'base-sauvegardes',
  RESEND_API_KEY: 're_cle_secrete', EMAIL_TEST_RECIPIENT: ADRESSE_ESSAI, NOTION_KEY: 'ntn_cle_secrete', CRON_SECRET: 'cron-secret',
  KV_REST_API_URL: 'https://kv.exemple', KV_REST_API_TOKEN: 'kv-jeton-secret', CARTO_BASEMAP_KEY: 'cle-carte',
};
const SECRETS = [ADRESSE_ESSAI, 'boite-d-essai', 're_cle_secrete', 'ntn_cle_secrete', 'cron-secret', SECRET, 'kv-jeton-secret', 'kv.exemple'];
const TESS = 'tess@exemple.ca';     // Administration
const MAX = 'max@exemple.ca';       // Approbation
const LEA = 'lea@exemple.ca';       // Lecture seule
const ODILE = 'odile@exemple.ca';   // retirée de l'équipe
const T0 = Date.parse('2026-11-26T15:00:00.000Z');
const HOTE_FICHIERS = 'https://fichiers.notion.exemple/';

const texte = (contenu) => [{ type: 'text', text: { content: contenu } }];
function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; }, send(o) { this.corps = o; return this; } };
}
const temoin = (courriel = TESS) => `carto_session=${signer('session', { courriel }, { secret: SECRET })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', 'x-real-ip': '10.0.0.7', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}

// Un faux dépôt de fichiers : ce qui est déposé se relit par l'adresse que le faux Notion donne.
function fauxFichiers({ pannes = {} } = {}) {
  const depots = new Map(); const appels = []; let n = 0;
  return {
    depots, appels,
    async deposer({ nom, type, octets }) {
      appels.push({ nom: 'deposer', args: { nom, type, taille: octets.length } });
      if (pannes.deposer) throw new Error('Notion a refusé le dépôt (500)');
      n += 1; const id = `depot-${n}`;
      depots.set(id, { nom, type, octets: Buffer.from(octets) });
      return id;
    },
    proprieteFichier(id, nom) { return { files: [{ type: 'file_upload', file_upload: { id }, name: nom }] }; },
    async telecharger(url, options) {
      appels.push({ nom: 'telecharger', args: { url, options } });
      if (pannes.telecharger) throw new Error('Fichier illisible (500)');
      const depot = String(url).startsWith(HOTE_FICHIERS) ? depots.get(String(url).slice(HOTE_FICHIERS.length)) : null;
      if (!depot) throw new Error('Fichier illisible (404)');
      return depot.octets;
    },
  };
}
// Notion rend un fichier déposé sous la forme « file », avec une adresse temporaire : le faux Notion
// garde ce qu'on lui a écrit (« file_upload »), cette enveloppe fait la conversion à la lecture.
function commeNotion(faux) {
  const convertir = (page) => {
    const properties = {};
    for (const [nom, p] of Object.entries(page.properties || {})) {
      properties[nom] = p && Array.isArray(p.files)
        ? { files: p.files.map((f) => (f.type === 'file_upload' ? { type: 'file', name: f.name, file: { url: `${HOTE_FICHIERS}${f.file_upload.id}`, expiry_time: '2026-11-26T16:00:00.000Z' } } : f)) }
        : p;
    }
    return { ...page, properties };
  };
  const { retrieve } = faux.client.pages; const { query } = faux.client.databases;
  faux.client.pages.retrieve = async (a) => convertir(await retrieve(a));
  faux.client.databases.query = async (a) => { const r = await query(a); return { ...r, results: r.results.map(convertir) }; };
  return faux;
}

// Quelques lignes dans chaque base, comme en vrai : des fiches, un porteur, une proposition et une
// version avec leur contenu, une ligne de journal.
function peupler(faux) {
  const page = (id, base, properties, contenu) => {
    faux.pages.set(id, { id, parent: { database_id: base }, created_time: '2026-10-01T10:00:00.000Z', last_edited_time: '2026-11-01T10:00:00.000Z', properties });
    if (contenu !== undefined) faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: texte(typeof contenu === 'string' ? contenu : JSON.stringify(contenu)), language: 'json' } }]);
  };
  page('fiche-1', 'base-ressources', {
    Nom: { title: texte('CARTaGENE') }, 'Phrase': { rich_text: texte('Une cohorte.') }, 'Type principal': { select: { name: 'Jeu de données' } },
    'Mots-clés': { multi_select: [{ name: 'cancer' }, { name: 'cohorte' }] }, Porteurs: { relation: [{ id: 'porteur-1' }] }, Lien: { url: 'https://cartagene.exemple' },
    'Vérifiée le': { date: { start: '2026-11-02', end: null } }, 'Gratuit': { checkbox: true }, 'Fichier du logo': { files: [{ type: 'file', name: 'logo.png', file: { url: 'https://s3.exemple/logo.png?X-Amz-Signature=signature-temporaire' } }] },
  });
  page('fiche-2', 'base-ressources', { Nom: { title: texte('CBRAIN') }, Contact: { email: 'contact@cbrain.exemple' }, 'Année': { number: 2012 } });
  page('porteur-1', 'base-porteurs', { Nom: { title: texte('CHU Sainte-Justine') }, Latitude: { number: 45.5 } });
  page('prop-1', 'base-propositions', { Titre: { title: texte('Nouvelle : Outil X') }, 'Proposé par': { email: 'pat@exemple.org' }, Statut: { select: { name: 'En attente' } } }, { propose: { nom: { apres: 'Outil X' } }, applique: null });
  page('version-1', 'base-versions', { Titre: { title: texte('CARTaGENE, version 1') } }, { valeurs: { nom: 'CARTaGENE' } });
  page('journal-1', 'base-journal', { Titre: { title: texte('a approuvé la nouvelle ressource Outil X') }, 'Fait par': { email: TESS }, Geste: { select: { name: 'Approbation' } } });
}

// env : les réglages de Vercel ; sans : les variables à retirer ; reglages : { clé: valeur } déjà enregistrés ;
// budgetComparaisonMs : le temps accordé à la comparaison d'une copie avec la précédente.
function banc({ env = {}, sans = [], reglages = {}, pannesNotion = {}, pannesFichiers = {}, sansJournal = false, budgetMs, budgetComparaisonMs, attendreSauvegarde = async () => {} } = {}) {
  const complet = { ...ENV, ...env };
  for (const variable of sans) delete complet[variable];
  const faux = commeNotion(fauxNotion({ pannes: pannesNotion, uuid: true }));
  inscrire(faux, { id: 'id-notion-tess', nom: 'Tess Berthier', courriel: TESS, role: 'Administration' });
  inscrire(faux, { id: 'id-notion-max', nom: 'Maxime Lafrenière', courriel: MAX, role: 'Approbation' });
  inscrire(faux, { id: 'id-notion-lea', nom: 'Léa Lecture', courriel: LEA, role: 'Lecture seule' });
  inscrire(faux, { id: 'id-notion-odile', nom: 'Odile Charbonneau', courriel: ODILE, role: 'Approbation', actif: false });
  peupler(faux);
  const poser = (cle, json, par = TESS) => {
    const id = `ligne-${cle}`;
    faux.pages.set(id, { id, parent: { database_id: 'base-reglages' }, properties: { [COLONNES.cle]: { title: texte(cle) }, [COLONNES.modifieLe]: { date: { start: '2026-11-20T10:00:00.000Z' } }, [COLONNES.modifiePar]: { email: par } } });
    faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: texte(json), language: 'json' } }]);
  };
  for (const [cle, valeur] of Object.entries(reglages)) poser(cle, JSON.stringify(valeur));

  const lignesServeur = [];
  const journal = (...l) => lignesServeur.push(l.join(' '));
  const horloge = { instant: T0 };
  const maintenant = () => { horloge.instant += 1000; return horloge.instant; };
  const envois = [];
  const socle = creerReglages(faux.client, complet, { maintenant, journal });
  const propositions = creerPropositions(faux.client, complet, { maintenant });
  const roleDe = async (courriel) => ((await propositions.equipe()).find((x) => x.courriel === courriel) || {}).role || null;
  const courriels = creerCourriels({ envoyeur: async (m) => { envois.push(m); }, env: complet, journal, reglages: socle, roleDe });
  const verrous = verrousEnMemoire();
  const limites = { async consommerJeton() { return true; }, async autoriserLien() { return true; }, async autoriserEssai() { return true; }, ...verrous };
  const equipe = creerEquipe({ client: faux.client, env: complet, courriels, limites, reglages: socle, verrous, secret: SECRET, journal, attendre: async () => {} });
  const journalEquipe = creerJournal(faux.client, complet, { maintenant, journal });
  const reglagesSite = creerReglagesSite({ reglages: socle, env: complet, roleDe });
  const fichiers = fauxFichiers({ pannes: pannesFichiers });
  const sauvegardes = creerSauvegardes({ client: faux.client, env: complet, fichiers, roleDe, verrous, maintenant, journal, attendre: attendreSauvegarde, ...(budgetMs === undefined ? {} : { budgetMs }), ...(budgetComparaisonMs === undefined ? {} : { budgetComparaisonMs }) });
  const deps = {
    env: complet, journal, limites, propositions, courriels, reglages: socle, equipe, reglagesSite, sauvegardes, fichiers,
    source: async () => ({ ressources: [], porteurs: [], idParAdresse: {} }),
    ...(sansJournal ? {} : { journalEquipe }),
  };
  const gestionnaire = admin.creerGestionnaire(deps);
  const vues = [];
  const appeler = async (req) => { const res = reponse(); await gestionnaire(req, res); vues.push({ action: req.query.action, res }); return res; };
  const pagesDe = (base) => [...faux.pages.values()].filter((p) => p.parent.database_id === base && !p.archived);
  const lu = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.text.content).join('');
  // Pose une copie déjà faite dans la base « Sauvegardes » ; renvoie son identifiant.
  let nCopies = 0;
  const poserCopie = ({ faiteLe, origine = 'Automatique', par = null, contenu = { format: 'cartographie-rsn/sauvegarde', version: 1, bases: {} }, fichier } = {}) => {
    nCopies += 1;
    const id = `10000000-0000-4000-8000-${String(nCopies).padStart(12, '0')}`;
    const octets = Buffer.from(typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
    fichiers.depots.set(`ancien-${nCopies}`, { nom: 'copie.json', type: 'application/json', octets });
    const C = COLONNES_SAUVEGARDE;
    faux.pages.set(id, {
      id, parent: { database_id: 'base-sauvegardes' },
      properties: {
        [C.titre]: { title: texte(`Sauvegarde du ${faiteLe}`) }, [C.faiteLe]: { date: { start: faiteLe } }, [C.origine]: { select: { name: origine } }, [C.taille]: { number: octets.length },
        ...(par ? { [C.par]: { email: par } } : {}),
        [C.fichier]: { files: fichier === undefined ? [{ type: 'file_upload', file_upload: { id: `ancien-${nCopies}` }, name: 'copie.json' }] : fichier },
      },
    });
    return id;
  };
  return {
    faux, deps, envois, lignesServeur, vues, appeler, socle, sauvegardes, reglagesSite, fichiers, poser, poserCopie, horloge, env: complet, pagesDe,
    envoyer: (action, corps = {}, par = TESS, options = {}) => appeler(requete('POST', action, { body: corps, cookie: temoin(par), ...options })),
    lire: (action, query = {}, par = TESS, options = {}) => appeler(requete('GET', action, { query, cookie: temoin(par), ...options })),
    journalEcrit: () => pagesDe('base-journal').filter((p) => p.id !== 'journal-1').map((p) => ({ geste: p.properties.Geste.select.name, par: (p.properties['Fait par'] || {}).email, sur: lu(p.properties.Sur), phrase: lu(p.properties.Titre) })),
    reglagesEcrits: () => Object.fromEntries(pagesDe('base-reglages').map((p) => [lu(p.properties[COLONNES.cle]), JSON.parse(faux.blocs.get(p.id)[0].code.rich_text.map((s) => s.text.content).join(''))])),
    // Les copies telles qu'elles sont dans la base « Sauvegardes », corbeille exclue. contenu : null
    // si le fichier manque ou n'est pas du JSON.
    copies: () => pagesDe('base-sauvegardes').map((p) => {
      const lire = (octets) => { try { return JSON.parse(octets.toString('utf8')); } catch (err) { return null; } };
      const C = COLONNES_SAUVEGARDE; const f = (p.properties[C.fichier].files || [])[0];
      const depot = f && f.file_upload ? fichiers.depots.get(f.file_upload.id) : null;
      return { id: p.id, titre: lu(p.properties[C.titre]), faiteLe: p.properties[C.faiteLe].date.start, origine: p.properties[C.origine].select.name, par: (p.properties[C.par] || {}).email || null, taille: p.properties[C.taille].number, depot, contenu: depot ? lire(depot.octets) : null };
    }),
    ecritures: () => ['pages.create', 'pages.update', 'blocks.update', 'blocks.children.append'].reduce((n, nom) => n + faux.de(nom).length, 0),
  };
}

module.exports = { banc, requete, temoin, reponse, fauxFichiers, commeNotion, SECRET, SECRETS, ADRESSE_ESSAI, ENV, TESS, MAX, LEA, ODILE, T0, HOTE_FICHIERS };
