const test = require('node:test');
const assert = require('node:assert/strict');
const lien = require('../api/lien');
const proposition = require('../api/proposition');
const exportApi = require('../api/export');
const { signer } = require('../lib/jetons');
const { creerReglages, COLONNES } = require('../lib/reglages');
const { ORIGINE } = require('../lib/reglages-site');
const { TEXTES } = require('../public/js/texte.js');
const { fauxNotion } = require('./aides/faux-notion');

const secret = 'secret-d-essai';
const ENV = { CONTRIBUTIONS: 'oui', JWT_SECRET: secret, SITE_URL: 'https://carto.exemple', NOTION_DB_REGLAGES: 'base-reglages' };
const OPTIONS = { typePrincipal: ['Logiciel ou application'], secondType: [], portee: [], motsCles: [], normes: [], outils: [], financePar: [], etat: [] };
const NOUVELLE = { nom: 'Outil X', typePrincipal: 'Logiciel ou application', phrase: 'Une phrase.', lien: 'https://x.org' };

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; }, send(o) { this.corps = o; return this; } };
}
const requete = (method, { body, query = {}, headers = {} } = {}) => ({ method, body, query, headers: { host: 'carto.exemple', 'x-real-ip': '10.0.0.1', ...headers } });
const jeton = (sorte, charge) => signer(sorte, charge, { secret });

// reglages : { clé: valeur } déjà enregistrés ; brut : { clé: texte du bloc } (pour un réglage illisible).
function banc({ env = ENV, reglages = {}, brut = {}, pannes = {}, sansSocle = false } = {}) {
  const faux = fauxNotion({ pannes });
  const poser = (cle, json) => {
    const id = `ligne-${cle}`;
    faux.pages.set(id, { id, parent: { database_id: 'base-reglages' }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: cle } }] }, [COLONNES.modifieLe]: { date: { start: '2026-11-20T10:00:00.000Z' } } } });
    faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
  };
  for (const [cle, valeur] of Object.entries(reglages)) poser(cle, JSON.stringify(valeur));
  for (const [cle, texte] of Object.entries(brut)) poser(cle, texte);
  const socle = creerReglages(faux.client, env, { journal: () => {} });
  const appels = [];
  const noter = (nom, args) => { appels.push({ nom, args }); };
  const deps = {
    env, journal: () => {},
    ...(sansSocle ? {} : { reglages: socle }),
    limites: { async autoriserLien(a) { noter('autoriserLien', a); return true; }, async consommerJeton(j) { noter('consommerJeton', j); return true; }, async libererJeton() {} },
    courriels: {
      async lienProposer(m) { noter('lienProposer', m); return { envoye: true }; },
      async lienPanneau(m) { noter('lienPanneau', m); return { envoye: true }; },
      async propositionRecue(m) { noter('propositionRecue', m); return { envoye: true }; },
    },
    propositions: {
      async estApprobateur(c) { return c === 'tess@exemple.ca'; },
      async equipe() { return [{ courriel: 'tess@exemple.ca', nom: 'Tess Berthier', role: 'administration' }]; },
      async enAttenteSur() { return false; },
      async creerProposition(p) { noter('creerProposition', p); return 'prop-1'; },
    },
    notion: {
      async lireFiche(id) { return id === 'fiche-1' ? { id: 'fiche-1', nom: 'Cohorte X', phrase: 'Une phrase.', statutFiche: 'Publiée', porteurIds: [] } : null; },
      async lireOptions() { return OPTIONS; },
      async lirePorteurs() { return []; },
    },
    source: async () => ({ ressources: [{ nom: 'Cohorte X', adresse: 'cohorte-x' }], porteurs: [], idParAdresse: { 'cohorte-x': 'fiche-1' } }),
    fichiers: { async deposer() { return 'depot-1'; } },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  const appeler = async (g, req) => { const res = reponse(); await g(req, res); return res; };
  return {
    faux, socle, de, appels,
    lien: (body) => appeler(lien.creerGestionnaire(deps), requete('POST', { body })),
    lireFormulaire: (query) => appeler(proposition.creerGestionnaire(deps), requete('GET', { query })),
    proposer: (body) => appeler(proposition.creerGestionnaire(deps), requete('POST', { body })),
    exporter: (envExport = env) => appeler(exportApi.creerGestionnaire({ source: exportApi.creerSource({ lire: async () => ({ ressources: [{ nom: 'A' }], porteurs: [] }) }), reglages: sansSocle ? undefined : socle, env: envExport }), { method: 'GET', query: {} }),
  };
}
const ENVOI = (j) => ({ jeton: j, genre: 'nouvelle', valeurs: NOUVELLE, nomProposant: 'Pat', lienAvecRessource: 'aucun', conditions: true });
const FERME = { contributionsOuvertes: false, messageFerme: 'De retour en janvier.' };

// ─── Sans réglage : exactement comme avant ───
test('sans base « Réglages », sans socle ou sans réglage : tout marche comme avant, avec le texte des conditions d\'origine', async () => {
  for (const b of [banc({ env: { ...ENV, NOTION_DB_REGLAGES: undefined } }), banc({ sansSocle: true }), banc()]) {
    const e = await b.exporter();
    assert.deepEqual([e.code, e.corps.contributions, e.corps.messageFerme], [200, true, null]);
    assert.equal(e.entetes['Cache-Control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    assert.equal((await b.lien({ courriel: 'pat@exemple.org', but: 'proposer' })).code, 200);
    assert.equal(b.de('lienProposer').length, 1);
    const f = await b.lireFormulaire({ jeton: jeton('proposer', { courriel: 'pat@exemple.org' }) });
    assert.deepEqual([f.code, f.corps.conditions], [200, ORIGINE.conditions]);
    assert.equal((await b.proposer(ENVOI(jeton('proposer', { courriel: 'pat@exemple.org' })))).code, 200);
    assert.equal(b.de('creerProposition').length, 1);
    assert.deepEqual((await b.lireFormulaire({ etat: '1' })).corps, { ouvertes: true, message: null, conditions: ORIGINE.conditions });
  }
  // Sans la base, Notion n'est jamais appelé pour les réglages.
  const sans = banc({ env: { ...ENV, NOTION_DB_REGLAGES: undefined } });
  await sans.exporter(); await sans.lien({ courriel: 'pat@exemple.org', but: 'proposer' });
  assert.equal(sans.faux.appels.length, 0);
});

test('/api/export : le verrou d\'installation gagne, même si le panneau dit « ouvert »', async () => {
  const b = banc({ reglages: { contributionsOuvertes: true } });
  for (const env of [{ ...ENV, CONTRIBUTIONS: 'non' }, { ...ENV, CONTRIBUTIONS: undefined }]) {
    const e = await b.exporter(env);
    assert.deepEqual([e.code, e.corps.contributions, e.corps.messageFerme], [200, false, null]);
  }
});

// ─── Fermé depuis le panneau ───
test('/api/export : fermé par le panneau, l\'indicateur est faux et le message suit', async () => {
  const e = await banc({ reglages: FERME }).exporter();
  assert.deepEqual([e.code, e.corps.contributions, e.corps.messageFerme], [200, false, 'De retour en janvier.']);
  assert.deepEqual(e.corps.ressources, [{ nom: 'A' }]);
  const sansMessage = await banc({ reglages: { contributionsOuvertes: false } }).exporter();
  assert.equal(sansMessage.corps.messageFerme, TEXTES.contribuer.fermees);
});

test('/api/lien : fermé, plus de lien pour proposer ni pour modifier, avec le message ; le lien du panneau part toujours', async () => {
  const b = banc({ reglages: FERME });
  for (const corps of [{ courriel: 'pat@exemple.org', but: 'proposer' }, { courriel: 'pat@exemple.org', but: 'modifier', adresse: 'cohorte-x' }]) {
    const res = await b.lien(corps);
    assert.deepEqual([res.code, res.corps], [403, { code: 'contributions-fermees', erreur: 'De retour en janvier.' }]);
    assert.equal(res.entetes['Cache-Control'], 'no-store');
  }
  assert.equal(b.de('lienProposer').length, 0);
  assert.equal(b.de('autoriserLien').length, 0, 'une demande refusée n\'entame pas la limite des liens');
  // Fermer les contributions ne ferme pas le panneau.
  assert.equal((await b.lien({ courriel: 'tess@exemple.ca', but: 'panneau' })).code, 200);
  assert.equal(b.de('lienPanneau').length, 1);
  // Le champ piège garde sa réponse muette.
  assert.deepEqual((await b.lien({ courriel: 'x@exemple.org', but: 'proposer', site: 'robot' })).corps, { ok: true });
});

test('/api/proposition : fermé, le formulaire reçoit le message, et un envoi est refusé sans brûler le lien ni rien créer', async () => {
  const b = banc({ reglages: FERME });
  const j = jeton('proposer', { courriel: 'pat@exemple.org' });
  const lu = await b.lireFormulaire({ jeton: j });
  assert.deepEqual([lu.code, lu.corps], [403, { code: 'contributions-fermees', erreur: 'De retour en janvier.' }]);
  const envoye = await b.proposer(ENVOI(j));
  assert.deepEqual([envoye.code, envoye.corps], [403, { code: 'contributions-fermees', erreur: 'De retour en janvier.' }]);
  assert.equal(b.de('creerProposition').length, 0);
  assert.equal(b.de('consommerJeton').length, 0);
  assert.equal(b.de('propositionRecue').length, 0);
  assert.deepEqual((await b.lireFormulaire({ etat: '1' })).corps, { ouvertes: false, message: 'De retour en janvier.', conditions: ORIGINE.conditions });
});

test('le formulaire lit le texte des conditions du serveur', async () => {
  const b = banc({ reglages: { conditions: 'J\'accepte les conditions <b>du RSN</b>.' } });
  const j = jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' });
  const lu = await b.lireFormulaire({ jeton: j });
  assert.deepEqual([lu.code, lu.corps.conditions, lu.corps.genre], [200, 'J\'accepte les conditions <b>du RSN</b>.', 'modification']);
  assert.equal((await b.lireFormulaire({ etat: '1' })).corps.conditions, 'J\'accepte les conditions <b>du RSN</b>.');
  // Un texte enregistré qui ne vaut rien : le texte du code.
  assert.equal((await banc({ brut: { conditions: 'pas du json' } }).lireFormulaire({ jeton: jeton('proposer', { courriel: 'p@exemple.org' }) })).corps.conditions, ORIGINE.conditions);
});

test('l\'état public ne dit rien d\'autre : ni qui a réglé, ni quand', async () => {
  const b = banc({ reglages: FERME });
  const brut = JSON.stringify([(await b.lireFormulaire({ etat: '1' })).corps, (await b.exporter()).corps]);
  assert.ok(!/modifie|tess@|2026-11-20/.test(brut));
  assert.equal((await b.lireFormulaire({ etat: '1' })).entetes['Cache-Control'], 'no-store');
});

// ─── Dans le doute ───
test('réglage illisible, ou base en panne sans rien de connu : rien ne s\'ouvre, et aucune page ne tombe', async () => {
  for (const b of [banc({ brut: { contributionsOuvertes: 'pas du json' } }), banc({ reglages: { contributionsOuvertes: 'oui' } }), banc({ reglages: { contributionsOuvertes: true }, pannes: { 'databases.query': true } }), banc({ pannes: { 'blocks.children.list': true }, reglages: { contributionsOuvertes: true } })]) {
    const e = await b.exporter();
    assert.deepEqual([e.code, e.corps.contributions, e.corps.messageFerme], [200, false, TEXTES.contribuer.indisponibles]);
    assert.deepEqual(e.corps.ressources, [{ nom: 'A' }], 'les fiches sont servies quand même');
    assert.equal(e.entetes['Cache-Control'], 'no-store', 'une réponse de précaution n\'est gardée nulle part');
    const l = await b.lien({ courriel: 'pat@exemple.org', but: 'proposer' });
    assert.deepEqual([l.code, l.corps], [503, { code: 'contributions-indisponibles', erreur: TEXTES.contribuer.indisponibles }]);
    assert.equal(b.de('lienProposer').length, 0);
    const p = await b.proposer(ENVOI(jeton('proposer', { courriel: 'pat@exemple.org' })));
    assert.equal(p.code, 503);
    assert.equal(b.de('creerProposition').length, 0);
    assert.equal((await b.lien({ courriel: 'tess@exemple.ca', but: 'panneau' })).code, 200);
    assert.equal(b.de('lienPanneau').length, 1, 'le panneau reste ouvert');
  }
});

test('base en panne après une lecture réussie : la dernière valeur connue vaut, ouvert reste ouvert et fermé reste fermé', async () => {
  for (const [reglages, ouvertes] of [[FERME, false], [{ contributionsOuvertes: true }, true], [{}, true]]) {
    let panne = false;
    const b = banc({ reglages, pannes: { 'databases.query': () => panne } });
    assert.equal((await b.exporter()).corps.contributions, ouvertes);
    panne = true; b.socle.vider();
    assert.equal((await b.exporter()).corps.contributions, ouvertes);
    assert.equal((await b.lien({ courriel: 'pat@exemple.org', but: 'proposer' })).code, ouvertes ? 200 : 403);
  }
});

test('/api/export : un socle qui lève ou qui ne peut pas être construit ne fait pas tomber la page', async () => {
  const source = exportApi.creerSource({ lire: async () => ({ ressources: [{ nom: 'A' }], porteurs: [] }) });
  for (const reglages of [() => { throw new Error('assemblage impossible'); }, { active: () => true, lireTousVite: async () => { throw new Error('cassé'); } }]) {
    const res = reponse();
    await exportApi.creerGestionnaire({ source, reglages, env: ENV, journal: () => {} })({ method: 'GET', query: {} }, res);
    assert.deepEqual([res.code, res.corps.contributions, res.corps.ressources.length], [200, false, 1]);
  }
});

test('les vraies routes partagent le socle des réglages de l\'assemblage', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const lire = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  assert.match(lire('api', 'export.js'), /reglages: \(\) => require\('\.\.\/lib\/contributions'\)\.socleReglages\(\)/);
  assert.match(lire('lib', 'contributions.js'), /const reglages = socleReglages\(\)/);
  assert.match(lire('README.md'), /`NOTION_DB_SAUVEGARDES`/);
});
