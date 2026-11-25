const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../api/admin');
const { signer, verifier } = require('../lib/jetons');
const { memeOrigineStricte } = require('../lib/contributions');
const { CHAMPS } = require('../public/js/champs.js');

const secret = 'secret-d-essai';
const ENV = { CONTRIBUTIONS: 'oui', JWT_SECRET: secret, SITE_URL: 'https://carto.exemple' };
const TESS = 'tess@exemple.ca';
const ID = '423ffcaf-d90f-8181-a940-e38afc0c69ce';
const OPTIONS = { typePrincipal: ['Logiciel ou application'], etat: ['Actif', 'Archivé'], motsCles: ['cancer'], normes: ['HL7 FHIR'] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function reponse() {
  return {
    code: null, corps: null, entetes: {},
    setHeader(k, v) { this.entetes[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.corps = o; return this; },
    send(o) { this.corps = o; return this; },
  };
}
const jeton = (sorte, charge) => signer(sorte, charge, { secret });
const temoin = (courriel = TESS) => `autre=1; carto_session=${jeton('session', { courriel })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}

function banc({ env = ENV, approbateurs = [TESS], resultat = { ok: true, ficheId: 'fiche-9', courriel: true }, pannes = {}, examen } = {}) {
  const appels = [];
  const noter = (nom, args) => { appels.push({ nom, args }); if (pannes[nom]) throw new Error(`${nom} en panne`); };
  const vus = new Set();
  const proposition = {
    id: ID, genre: 'modification', ficheId: 'fiche-1', courriel: 'pat@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable',
    titre: 'Modification : Cohorte X', proposeLe: '2026-11-24T10:00:00.000Z', statut: 'attente', decidePar: null, decideLe: null, commentaire: '',
    logoPropose: { nom: 'logo.png', url: 'https://notion.exemple/secret?sig=abc' },
    contenu: { propose: { phrase: { avant: 'Une phrase.', apres: 'Une autre.' }, notesDeVeille: { apres: 'intrus' } }, applique: null, porteursNouveaux: { 'Nouveau porteur': '1 rue X' }, logoFichier: 'logo.png' },
  };
  const deps = {
    env, journal: () => {},
    limites: { async consommerJeton(jti) { noter('consommerJeton', jti); if (vus.has(jti)) return false; vus.add(jti); return true; } },
    propositions: {
      async estApprobateur(c) { noter('estApprobateur', c); return approbateurs.includes(c); },
      async lireProposition(id) { noter('lireProposition', id); return proposition; },
      async listerPropositions(o) { noter('listerPropositions', o); return [{ ...proposition, contenu: undefined }]; },
    },
    notion: { async lireOptions() { return OPTIONS; } },
    source: async () => ({ ressources: [{ nom: 'Cohorte X', adresse: 'cohorte-x' }], porteurs: [{ nom: 'CHUM' }], idParAdresse: { 'cohorte-x': 'fiche-1' } }),
    fichiers: { async telecharger(url) { noter('telecharger', url); return PNG; } },
    approbation: {
      async examiner(id) { noter('examiner', id); return examen === undefined ? { proposition, actuelle: { nom: 'Cohorte X', phrase: 'Une phrase.', etat: 'Actif', notesDeVeille: 'secret', id: 'fiche-1' }, bouscules: ['phrase'], ficheDisparue: false } : examen; },
      async approuver(a) { noter('approuver', a); return resultat; },
      async refuser(a) { noter('refuser', a); return resultat; },
    },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  return { admin: admin.creerGestionnaire(deps), appels, de };
}
async function appeler(b, req) { const res = reponse(); await b.admin(req, res); return res; }

test('un envoi doit venir du site lui-même, en JSON', () => {
  const r = (headers) => ({ headers: { host: 'carto.exemple', ...headers } });
  assert.equal(memeOrigineStricte(r({ origin: 'https://carto.exemple', 'content-type': 'application/json; charset=utf-8' })), true);
  assert.equal(memeOrigineStricte(r({ 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' })), true);
  assert.equal(memeOrigineStricte(r({ origin: 'https://ailleurs.org', 'content-type': 'application/json' })), false);
  assert.equal(memeOrigineStricte(r({ origin: 'https://ailleurs.org', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' })), false);
  assert.equal(memeOrigineStricte(r({ 'content-type': 'application/json' })), false);
  assert.equal(memeOrigineStricte(r({ 'sec-fetch-site': 'same-site', 'content-type': 'application/json' })), false);
  assert.equal(memeOrigineStricte(r({ origin: 'https://carto.exemple', 'content-type': 'text/plain' })), false);
  assert.equal(memeOrigineStricte(r({ origin: 'null', 'content-type': 'application/json' })), false);
});

test('sans le réglage CONTRIBUTIONS, le panneau répond 404', async () => {
  const b = banc({ env: { ...ENV, CONTRIBUTIONS: '' } });
  assert.equal((await appeler(b, requete('GET', 'file'))).code, 404);
  assert.equal(b.appels.length, 0);
});

test('sans témoin, ou avec un témoin qui n\'est pas une session, tout répond 401', async () => {
  for (const cookie of [null, 'carto_session=n-importe-quoi', `carto_session=${jeton('panneau', { courriel: TESS })}`, `carto_session=${signer('session', { courriel: TESS }, { secret: 'autre-secret' })}`]) {
    const b = banc();
    for (const req of [requete('GET', 'file', { cookie }), requete('GET', 'detail', { cookie, query: { id: ID } }), requete('GET', 'logo', { cookie, query: { id: ID } }),
      requete('POST', 'approuver', { cookie, body: { id: ID } }), requete('POST', 'refuser', { cookie, body: { id: ID, commentaire: 'Non' } })]) {
      assert.equal((await appeler(b, req)).code, 401, `${req.query.action} ${String(cookie).slice(0, 30)}`);
    }
    assert.equal(b.de('approuver').length + b.de('refuser').length + b.de('examiner').length + b.de('listerPropositions').length, 0);
  }
});

test('une personne retirée des approbateurs perd l\'accès, même avec un témoin valide', async () => {
  const b = banc({ approbateurs: [] });
  assert.equal((await appeler(b, requete('GET', 'file'))).code, 401);
  assert.equal((await appeler(b, requete('POST', 'approuver', { body: { id: ID } }))).code, 401);
  assert.equal(b.de('approuver').length, 0);
});

test('un envoi venu d\'un autre site est refusé avant tout', async () => {
  const b = banc();
  for (const action of ['session', 'approuver', 'refuser', 'deconnexion']) {
    assert.equal((await appeler(b, requete('POST', action, { body: { id: ID, jeton: jeton('panneau', { courriel: TESS }) }, headers: { origin: 'https://ailleurs.org' } }))).code, 403, action);
  }
  assert.equal(b.appels.length, 0);
});

test('une action d\'écriture demandée en GET, ou une action inconnue, est refusée', async () => {
  const b = banc();
  assert.equal((await appeler(b, requete('GET', 'approuver', { query: { id: ID } }))).code, 405);
  assert.equal((await appeler(b, requete('POST', 'file', { body: {} }))).code, 405);
  assert.equal((await appeler(b, requete('GET', 'autre'))).code, 404);
  assert.equal(b.de('approuver').length, 0);
});

test('le lien du panneau ouvre une session : témoin protégé, valable 7 jours, une seule fois', async () => {
  const b = banc();
  const lien = jeton('panneau', { courriel: TESS });
  const res = await appeler(b, requete('POST', 'session', { cookie: null, body: { jeton: lien } }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { courriel: TESS });
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  const pose = res.entetes['Set-Cookie'];
  assert.match(pose, /^carto_session=[^;]+; HttpOnly; Secure; SameSite=Strict; Path=\/api\/admin; Max-Age=604800$/);
  assert.equal(verifier(pose.split(';')[0].split('=')[1], 'session', { secret }).courriel, TESS);
  assert.equal((await appeler(b, requete('POST', 'session', { cookie: null, body: { jeton: lien } }))).code, 401);
});

test('en local, le témoin est posé sans « Secure »', async () => {
  const b = banc({ env: { CONTRIBUTIONS: 'oui', JWT_SECRET: secret } });
  const req = requete('POST', 'session', { cookie: null, body: { jeton: jeton('panneau', { courriel: TESS }) }, headers: { host: 'localhost:3211', origin: 'http://localhost:3211' } });
  const res = await appeler(b, req);
  assert.equal(res.code, 200);
  assert.ok(!/Secure/.test(res.entetes['Set-Cookie']));
});

test('un lien pour proposer, un lien d\'un non-approbateur ou un jeton absent n\'ouvrent pas de session', async () => {
  for (const [approbateurs, corps] of [[[TESS], { jeton: jeton('proposer', { courriel: TESS }) }], [[], { jeton: jeton('panneau', { courriel: TESS }) }], [[TESS], {}], [[TESS], { jeton: jeton('session', { courriel: TESS }) }]]) {
    const res = await appeler(banc({ approbateurs }), requete('POST', 'session', { cookie: null, body: corps }));
    assert.equal(res.code, 401);
    assert.equal(res.entetes['Set-Cookie'], undefined);
  }
});

test('la file donne les résumés, sans identifiant de fiche ni adresse de fichier', async () => {
  const b = banc();
  const res = await appeler(b, requete('GET', 'file', { query: { statut: 'tranchees' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(b.de('listerPropositions'), [{ statut: 'tranchees' }]);
  assert.equal(res.corps.courriel, TESS);
  assert.deepEqual(res.corps.propositions, [{ id: ID, genre: 'modification', titre: 'Modification : Cohorte X', statut: 'attente', proposeLe: '2026-11-24T10:00:00.000Z', courriel: 'pat@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable', decidePar: null, decideLe: null, commentaire: '', aLogo: true, fiche: { adresse: 'cohorte-x', nom: 'Cohorte X' } }]);
  await appeler(b, requete('GET', 'file', { query: { statut: 'nimporte' } }));
  assert.deepEqual(b.de('listerPropositions')[1], { statut: 'attente' });
});

test('le détail ne porte que des champs du catalogue, et aucune donnée interne', async () => {
  const b = banc();
  const res = await appeler(b, requete('GET', 'detail', { query: { id: ID } }));
  assert.equal(res.code, 200);
  const cles = new Set(CHAMPS.map((c) => c.cle));
  for (const partie of [res.corps.actuelle, res.corps.proposition.propose]) for (const cle of Object.keys(partie)) assert.ok(cles.has(cle), cle);
  assert.deepEqual(res.corps.proposition.propose, { phrase: { avant: 'Une phrase.', apres: 'Une autre.' } });
  assert.deepEqual(res.corps.proposition.porteursNouveaux, { 'Nouveau porteur': '1 rue X' });
  assert.deepEqual(res.corps.bouscules, ['phrase']);
  assert.equal(res.corps.proposition.aLogo, true);
  assert.deepEqual(res.corps.options.etat, ['Actif', 'Archivé']);
  assert.deepEqual(res.corps.existantes.porteurs, ['CHUM']);
  assert.deepEqual(res.corps.existantes.fiches, [{ adresse: 'cohorte-x', nom: 'Cohorte X' }]);
  const brut = JSON.stringify(res.corps);
  for (const interdit of ['secret', 'fiche-1', 'notion.exemple', 'notesDeVeille', 'ficheId']) assert.ok(!brut.includes(interdit), interdit);
});

test('détail : identifiant mal formé ou proposition introuvable', async () => {
  assert.equal((await appeler(banc(), requete('GET', 'detail', { query: { id: '../x' } }))).code, 400);
  assert.equal((await appeler(banc({ examen: null }), requete('GET', 'detail', { query: { id: ID } }))).code, 404);
});

test('le logo proposé est relayé avec des en-têtes sûrs', async () => {
  const b = banc();
  const res = await appeler(b, requete('GET', 'logo', { query: { id: ID } }));
  assert.equal(res.code, 200);
  assert.ok(res.corps.equals(PNG));
  assert.equal(res.entetes['Content-Type'], 'image/png');
  assert.equal(res.entetes['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.entetes['Content-Security-Policy'], "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  assert.deepEqual(b.de('telecharger'), ['https://notion.exemple/secret?sig=abc']);
  assert.equal(b.de('examiner').length, 0);
});

test('approuver transmet les corrections au nom de la personne en session', async () => {
  const b = banc();
  const res = await appeler(b, requete('POST', 'approuver', { body: { id: ID, corrections: { phrase: 'Corrigée.' }, porteursNouveaux: { X: '2 rue Y' }, sansLogo: true, approbateur: 'intrus@exemple.org' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, courriel: true });
  assert.deepEqual(b.de('approuver'), [{ propositionId: ID, corrections: { phrase: 'Corrigée.' }, porteursNouveaux: { X: '2 rue Y' }, sansLogo: true, approbateur: TESS, origine: 'https://carto.exemple' }]);
});

test('refuser transmet le commentaire', async () => {
  const b = banc();
  const res = await appeler(b, requete('POST', 'refuser', { body: { id: ID, commentaire: 'Hors sujet.' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(b.de('refuser'), [{ propositionId: ID, commentaire: 'Hors sujet.', approbateur: TESS }]);
});

test('chaque issue de l\'approbation a son code de réponse', async () => {
  const cas = { occupee: 409, 'deja-tranchee': 409, doublon: 409, invalide: 400, notion: 502, introuvable: 404, 'fiche-introuvable': 410, 'non-approbateur': 401 };
  for (const [code, attendu] of Object.entries(cas)) {
    const res = await appeler(banc({ resultat: { ok: false, code, erreurs: { nom: 'x' } } }), requete('POST', 'approuver', { body: { id: ID } }));
    assert.equal(res.code, attendu, code);
    assert.equal(res.corps.code, code);
  }
  const res = await appeler(banc({ resultat: { ok: false, code: 'invalide', erreurs: { commentaire: 'Requis' } } }), requete('POST', 'refuser', { body: { id: ID } }));
  assert.deepEqual(res.corps.erreurs, { commentaire: 'Requis' });
});

test('une panne imprévue donne 502, sans détail technique', async () => {
  const res = await appeler(banc({ pannes: { listerPropositions: true } }), requete('GET', 'file'));
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.corps).includes('en panne'));
  assert.equal((await appeler(banc({ pannes: { estApprobateur: true } }), requete('GET', 'file'))).code, 502);
});

test('la déconnexion efface le témoin', async () => {
  const res = await appeler(banc(), requete('POST', 'deconnexion', { body: {} }));
  assert.equal(res.code, 200);
  assert.match(res.entetes['Set-Cookie'], /^carto_session=; .*Max-Age=0$/);
});

test('les adresses de porteurs envoyées sont bornées, et une adresse vidée reste vide', async () => {
  const b = banc();
  await appeler(b, requete('POST', 'approuver', { body: { id: ID, porteursNouveaux: { A: '', B: `  ${'x'.repeat(400)}  `, C: 42, D: ['x'] } } }));
  const recu = b.de('approuver')[0].porteursNouveaux;
  assert.deepEqual(Object.keys(recu), ['A', 'B']);
  assert.equal(recu.A, '');
  assert.equal(recu.B.length, 300);
});

test('des corps inattendus ne passent pas tels quels à l\'approbation', async () => {
  const b = banc();
  await appeler(b, requete('POST', 'approuver', { body: { id: ID, corrections: ['x'], sansLogo: 'oui' } }));
  assert.deepEqual(b.de('approuver')[0].corrections, {});
  assert.equal(b.de('approuver')[0].sansLogo, false);
  assert.equal((await appeler(b, requete('POST', 'approuver', { body: { id: [ID] } }))).code, 400);
  await appeler(b, requete('POST', 'refuser', { body: { id: ID, commentaire: { a: 1 } } }));
  assert.equal(b.de('refuser')[0].commentaire, '');
});

test('une entrée abîmée du contenu proposé est écartée du détail', async () => {
  const proposition = { id: ID, genre: 'nouvelle', ficheId: null, statut: 'attente', titre: 'X', logoPropose: null, contenu: { propose: { nom: null, phrase: 'texte nu', lien: { apres: 'https://x.org' } } } };
  const res = await appeler(banc({ examen: { proposition, actuelle: null, bouscules: [], ficheDisparue: false } }), requete('GET', 'detail', { query: { id: ID } }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.proposition.propose, { lien: { apres: 'https://x.org' } });
  assert.equal(res.corps.proposition.illisible, true);
  assert.equal(res.corps.actuelle, null);
});

test('une session échue est refusée ; un envoi sans indication d\'origine aussi', async () => {
  const echue = `carto_session=${signer('session', { courriel: TESS }, { secret, duree: -10 })}`;
  assert.equal((await appeler(banc(), requete('GET', 'file', { cookie: echue }))).code, 401);
  const sansOrigine = requete('POST', 'approuver', { body: { id: ID } });
  delete sansOrigine.headers.origin;
  assert.equal((await appeler(banc(), sansOrigine)).code, 403);
});
