const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../api/admin');
const { signer } = require('../lib/jetons');
const { creerRessources } = require('../lib/ressources');
const { creerVersions } = require('../lib/versions');
const { fauxNotion } = require('./aides/faux-notion');
const { fausseBase, brute } = require('./aides/fausses-fiches');
const { CHAMPS } = require('../public/js/champs.js');

const secret = 'secret-d-essai';
const ENV = { CONTRIBUTIONS: 'oui', JWT_SECRET: secret, SITE_URL: 'https://carto.exemple', NOTION_DB_VERSIONS: 'base-versions' };
const TESS = 'tess@exemple.ca';
const LEA = 'lea@exemple.ca';
const PARTIE = 'partie@exemple.ca';
const CLES = CHAMPS.map((c) => c.cle);
const LECTURES = ['ressources', 'ressource'];
const ECRITURES = ['enregistrer', 'retablir', 'verifier', 'revoir', 'ecarter', 'republier', 'creer'];
const NEUVE = { nom: 'Plateforme Z', typePrincipal: 'Logiciel ou application', phrase: 'Elle calcule.', lien: 'https://z.org' };
// Un corps valable pour chaque action d'écriture.
const CORPS = {
  enregistrer: { fiche: 'cohorte-x', valeurs: { phrase: 'Une autre phrase.' }, depart: { phrase: 'Une phrase.' } },
  retablir: { fiche: 'cohorte-x', numero: 1 },
  verifier: { fiche: 'cohorte-x' }, revoir: { fiche: 'cohorte-x', actif: true, note: 'À revoir.' }, ecarter: { fiche: 'cohorte-x' }, republier: { fiche: 'cohorte-x' },
  creer: { valeurs: NEUVE },
};

function reponse() {
  return {
    code: null, corps: null, entetes: {},
    setHeader(k, v) { this.entetes[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.corps = o; return this; },
    send(o) { this.corps = o; return this; },
  };
}
const temoin = (courriel = TESS) => `carto_session=${signer('session', { courriel }, { secret })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}

// Le vrai module des ressources et le vrai module des versions, sur de fausses bases Notion.
function banc({ env = ENV, pannes = {}, pannesVersions = {} } = {}) {
  const equipe = [
    { nom: 'Tess Berthier', courriel: TESS, role: 'approbation', resume: true },
    { nom: 'Léa Lecture', courriel: LEA, role: 'lecture', resume: true },
  ];
  const base = fausseBase({
    pannes,
    porteurs: [{ id: 'id-notion-chum', nom: 'CHUM', latitude: 45.5, longitude: -73.5 }],
    fiches: [
      brute({ logoFichier: 'logo.png', logoFichierUrl: 'https://fichiers.notion.exemple/secret?sig=abc' }),
      brute({ id: 'id-notion-ecartee', nom: 'Vieille fiche', lien: null, statutFiche: 'Écartée', porteurIds: [] }),
    ],
  });
  const faux = fauxNotion({ pannes: pannesVersions });
  const journal = [];
  const noterJournal = (...ligne) => journal.push(ligne.join(' '));
  const versions = creerVersions(faux.client, env, { journal: noterJournal });
  const propositions = {
    async equipe() { return equipe; },
    async peutDecider(courriel) { return equipe.some((x) => x.courriel === courriel && x.role !== 'lecture'); },
    async listerPropositions() { return [{ id: '423ffcaf-d90f-8181-a940-e38afc0c69ce', statut: 'attente', ficheId: 'id-notion-x', genre: 'modification', nomProposant: 'Pat', courriel: 'pat@exemple.org', lienAvecRessource: 'responsable' }]; },
  };
  const ressources = creerRessources({ notion: base.notion, versions, propositions, secret, journal: noterJournal, attendre: async () => {} });
  const deps = { env, journal: noterJournal, limites: { async consommerJeton() { return true; } }, propositions, notion: base.notion, ressources };
  const gestionnaire = admin.creerGestionnaire(deps);
  const vues = [];
  const appeler = async (req) => { const res = reponse(); await gestionnaire(req, res); vues.push(res); return res; };
  const ecritures = () => base.de('mettreAJourFiche').length + base.de('creerFiche').length + faux.de('pages.create').length;
  return { ...base, faux, versions, journal, appeler, vues, ecritures };
}
const envoyer = (b, action, corps = CORPS[action], options = {}) => b.appeler(requete('POST', action, { body: corps, ...options }));
const lire = (b, action, query = {}, options = {}) => b.appeler(requete('GET', action, { query, ...options }));

test('les actions du lot 2 : lecture en GET, écriture en POST, rien d\'autre', async () => {
  const b = banc();
  for (const action of LECTURES) assert.equal((await b.appeler(requete('POST', action, { body: {} }))).code, 405, action);
  for (const action of ECRITURES) assert.equal((await lire(b, action, { fiche: 'cohorte-x' })).code, 405, action);
  assert.equal(b.ecritures(), 0);
});

test('sans session, ou pour une personne qui n\'est plus dans l\'équipe, tout répond 401', async () => {
  for (const cookie of [null, 'carto_session=n-importe-quoi', temoin(PARTIE)]) {
    const b = banc();
    for (const action of LECTURES) assert.equal((await lire(b, action, { fiche: 'cohorte-x' }, { cookie })).code, 401, action);
    for (const action of ECRITURES) assert.equal((await envoyer(b, action, CORPS[action], { cookie })).code, 401, action);
    assert.equal(b.appels.length, 0, 'Notion n\'est pas lu');
  }
});

test('une personne en lecture seule voit les fiches, mais chaque action d\'écriture lui est refusée', async () => {
  const b = banc();
  const cookie = temoin(LEA);
  assert.equal((await lire(b, 'ressources', {}, { cookie })).code, 200);
  assert.equal((await lire(b, 'ressource', { fiche: 'cohorte-x' }, { cookie })).code, 200);
  for (const action of ECRITURES) {
    const res = await envoyer(b, action, CORPS[action], { cookie });
    assert.equal(res.code, 403, action);
    assert.equal(res.corps.code, 'role');
  }
  assert.equal(b.ecritures(), 0);
});

test('un envoi venu d\'un autre site, ou qui n\'est pas du JSON, est refusé avant tout', async () => {
  const b = banc();
  for (const action of ECRITURES) {
    assert.equal((await envoyer(b, action, CORPS[action], { headers: { origin: 'https://ailleurs.org' } })).code, 403, action);
    assert.equal((await envoyer(b, action, CORPS[action], { headers: { 'content-type': 'text/plain' } })).code, 403, action);
  }
  assert.equal(b.appels.length, 0);
});

test('le tableau : toutes les fiches, sans mémoire de navigateur, avec des noms et non des courriels', async () => {
  const b = banc();
  await envoyer(b, 'enregistrer');
  const res = await lire(b, 'ressources');
  assert.equal(res.code, 200);
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  assert.equal(res.corps.historique, true);
  const [cohorte, ecartee] = res.corps.ressources;
  assert.equal(cohorte.id, 'cohorte-x');
  assert.equal(cohorte.versions, 2);
  assert.equal(cohorte.dernier.par, 'Tess Berthier');
  assert.equal(cohorte.enAttente, 1);
  assert.equal(ecartee.statut, 'ecartee');
  assert.match(ecartee.id, /^~[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify(res.corps).includes(TESS));
});

test('une fiche : ses valeurs, son historique, les propositions qui l\'attendent, les listes de choix', async () => {
  const b = banc();
  await envoyer(b, 'enregistrer');
  const res = await lire(b, 'ressource', { fiche: 'cohorte-x' });
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['enAttente', 'existantes', 'fiche', 'historique', 'options', 'valeurs', 'versions']);
  assert.deepEqual(Object.keys(res.corps.valeurs), CLES);
  assert.deepEqual(res.corps.versions.map((v) => [v.numero, v.source, v.par]), [[1, 'depart', null], [2, 'panneau', 'Tess Berthier']]);
  assert.deepEqual(res.corps.versions[1].changements, { phrase: { avant: 'Une phrase.', apres: 'Une autre phrase.' } });
  assert.deepEqual(res.corps.enAttente, [{ id: '423ffcaf-d90f-8181-a940-e38afc0c69ce', genre: 'modification', nomProposant: 'Pat' }]);
  assert.equal(res.corps.fiche.logoDepose, true);
  assert.equal((await lire(b, 'ressource', { fiche: 'inconnue' })).code, 404);
  for (const fiche of ['', 'Avec Majuscules', '../x', 'id notion', '~court']) assert.equal((await lire(b, 'ressource', { fiche })).code, 400, fiche);
  const neuve = await lire(b, 'ressource', { neuve: '1' });
  assert.equal(neuve.code, 200);
  assert.deepEqual(Object.keys(neuve.corps).sort(), ['existantes', 'options', 'valeurs']);
});

test('enregistrer : la version porte le courriel de la session, pas celui du corps de la demande', async () => {
  const b = banc();
  const res = await envoyer(b, 'enregistrer', { ...CORPS.enregistrer, par: 'usurpe@exemple.org', approbateur: 'usurpe@exemple.org' });
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, id: 'cohorte-x', numero: 2, historique: true, champs: 1 });
  assert.equal((await b.versions.lister('id-notion-x'))[0].par, TESS);
});

test('enregistrer : conflit 409 avec les champs en cause, rien n\'est écrit', async () => {
  const b = banc();
  b.fiches[0].phrase = 'Phrase de quelqu\'un d\'autre.';
  const res = await envoyer(b, 'enregistrer');
  assert.equal(res.code, 409);
  assert.deepEqual(res.corps, { code: 'conflit', conflits: { phrase: 'Phrase de quelqu\'un d\'autre.' } });
  assert.equal(b.ecritures(), 0);
});

test('enregistrer : valeurs refusées en 400 avec le détail par champ ; demande mal formée en 400', async () => {
  const b = banc();
  const res = await envoyer(b, 'enregistrer', { fiche: 'cohorte-x', valeurs: { lien: 'non' }, depart: { lien: 'https://cohorte-x.org' } });
  assert.equal(res.code, 400);
  assert.equal(res.corps.code, 'invalide');
  assert.ok(res.corps.erreurs.lien);
  for (const corps of [{ fiche: 'cohorte-x' }, { fiche: 'cohorte-x', valeurs: [], depart: {} }, { fiche: 'cohorte-x', valeurs: 'x', depart: {} }, { valeurs: {}, depart: {} }, { fiche: 12, valeurs: {}, depart: {} }]) {
    assert.equal((await envoyer(b, 'enregistrer', corps)).code, 400, JSON.stringify(corps));
  }
  assert.equal((await envoyer(b, 'enregistrer', { ...CORPS.enregistrer, fiche: 'inconnue' })).code, 404);
  assert.equal(b.ecritures(), 0);
});

test('rétablir, marquer vérifiée, écarter, republier, ajouter : chaque geste répond 200', async () => {
  const b = banc();
  await envoyer(b, 'enregistrer');
  const retabli = await envoyer(b, 'retablir');
  assert.equal(retabli.code, 200);
  assert.equal(retabli.corps.numero, 3);
  assert.equal(b.fiches[0].phrase, 'Une phrase.');
  assert.equal((await envoyer(b, 'retablir', { fiche: 'cohorte-x', numero: '1' })).code, 400);
  assert.equal((await envoyer(b, 'retablir', { fiche: 'cohorte-x', numero: 99 })).code, 400);
  const verifiee = await envoyer(b, 'verifier');
  assert.equal(verifiee.code, 200);
  assert.match(verifiee.corps.verifieeLe, /^\d{4}-\d{2}-\d{2}$/);
  const ecartee = await envoyer(b, 'ecarter');
  assert.equal(ecartee.code, 200);
  assert.equal(b.fiches[0].statutFiche, 'Écartée');
  const republiee = await envoyer(b, 'republier', { fiche: ecartee.corps.id });
  assert.deepEqual(republiee.corps, { ok: true, id: 'cohorte-x' });
  const creee = await envoyer(b, 'creer');
  assert.equal(creee.code, 200);
  assert.deepEqual(creee.corps, { ok: true, id: 'plateforme-z', numero: 1, historique: true });
  assert.equal((await envoyer(b, 'creer')).code, 409, 'la même ressource une seconde fois est un doublon');
  assert.equal((await envoyer(b, 'creer', { valeurs: { nom: 'Seul' } })).code, 400);
  assert.equal((await envoyer(b, 'creer', {})).code, 400);
});

test('sans la base « Versions », tout marche : historique vide, écriture de version sautée, aucune erreur 5xx', async () => {
  const b = banc({ env: { ...ENV, NOTION_DB_VERSIONS: undefined } });
  const tableau = await lire(b, 'ressources');
  assert.equal(tableau.code, 200);
  assert.equal(tableau.corps.historique, false);
  const fiche = await lire(b, 'ressource', { fiche: 'cohorte-x' });
  assert.equal(fiche.code, 200);
  assert.deepEqual(fiche.corps.versions.map((v) => v.source), ['depart']);
  const enregistre = await envoyer(b, 'enregistrer');
  assert.deepEqual(enregistre.corps, { ok: true, id: 'cohorte-x', numero: null, historique: false, champs: 1 });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  for (const action of ['verifier', 'ecarter']) assert.equal((await envoyer(b, action)).code, 200, action);
  assert.equal((await envoyer(b, 'creer')).code, 200);
  const retabli = await envoyer(b, 'retablir', { fiche: 'plateforme-z', numero: 1 });
  assert.equal(retabli.code, 409);
  assert.equal(retabli.corps.code, 'sans-historique');
  assert.ok(b.vues.every((res) => res.code < 500));
  assert.equal(b.faux.appels.length, 0);
  assert.ok(b.journal.some((ligne) => /NOTION_DB_VERSIONS/.test(ligne)));
});

test('la base « Versions » en panne : les fiches se lisent et s\'enregistrent quand même', async () => {
  const b = banc({ pannesVersions: { 'databases.query': true, 'pages.create': true } });
  assert.equal((await lire(b, 'ressources')).code, 200);
  assert.equal((await lire(b, 'ressource', { fiche: 'cohorte-x' })).corps.historique, false);
  const res = await envoyer(b, 'enregistrer');
  assert.equal(res.code, 200);
  assert.equal(res.corps.historique, false);
});

test('Notion en panne : 502, sans détail technique', async () => {
  const b = banc({ pannes: { lireRessources: true } });
  for (const res of [await lire(b, 'ressources'), await lire(b, 'ressource', { fiche: 'cohorte-x' }), await envoyer(b, 'enregistrer'), await envoyer(b, 'ecarter')]) {
    assert.equal(res.code, 502);
    assert.ok(!/en panne|lireRessources|Error/.test(JSON.stringify(res.corps)));
  }
  const c = banc({ pannes: { mettreAJourFiche: true } });
  const res = await envoyer(c, 'enregistrer');
  assert.equal(res.code, 502);
  assert.equal(res.corps.code, 'notion');
});

test('aucune réponse ne laisse sortir un identifiant Notion de fiche, une adresse de fichier ou un champ interne', async () => {
  const b = banc();
  await lire(b, 'ressources');
  await lire(b, 'ressource', { fiche: 'cohorte-x' });
  await envoyer(b, 'enregistrer');
  await envoyer(b, 'enregistrer', { fiche: 'cohorte-x', valeurs: { phrase: 'Encore.' }, depart: { phrase: 'Dépassée.' } });
  await envoyer(b, 'retablir');
  await envoyer(b, 'verifier');
  const ecartee = await envoyer(b, 'ecarter');
  await lire(b, 'ressources');
  await lire(b, 'ressource', { fiche: ecartee.corps.id });
  await envoyer(b, 'republier', { fiche: ecartee.corps.id });
  await envoyer(b, 'creer');
  await lire(b, 'ressource', { fiche: 'plateforme-z' });
  await lire(b, 'ressource', { neuve: '1' });
  assert.ok(b.vues.every((res) => res.code === 200 || res.code === 409), b.vues.map((r) => r.code).join(' '));
  const tout = JSON.stringify(b.vues.map((res) => res.corps));
  for (const interdit of ['id-notion', 'notion.exemple', 'logo.png', 'porteurIds', 'logoFichier', 'modifieeLe', 'statutFiche', 'ficheId', 'propositionId', 'page-']) {
    assert.ok(!tout.includes(interdit), interdit);
  }
  // Les valeurs et les changements ne portent que des clés du catalogue.
  for (const res of b.vues) {
    const corps = res.corps || {};
    for (const cle of Object.keys(corps.valeurs || {})) assert.ok(CLES.includes(cle), cle);
    for (const v of corps.versions || []) for (const cle of Object.keys(v.changements)) assert.ok(CLES.includes(cle), cle);
    for (const cle of Object.keys(corps.conflits || {})) assert.ok(CLES.includes(cle), cle);
  }
});
