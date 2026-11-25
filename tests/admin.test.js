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

// approbateurs : les personnes actives au rôle « approbation » ; equipe : pour donner d'autres rôles.
function banc({ env = ENV, approbateurs = [TESS], equipe, resultat = { ok: true, ficheId: 'fiche-9', courriel: true }, pannes = {}, examen, liste, contenus = {} } = {}) {
  const personnes = equipe || approbateurs.map((courriel) => ({ nom: courriel === TESS ? 'Tess Berthier' : '', courriel, role: 'approbation', resume: true }));
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
      async equipe() { noter('equipe'); return personnes; },
      async lireProposition(id) { noter('lireProposition', id); return proposition; },
      async listerPropositions(o) { noter('listerPropositions', o); return liste || [{ ...proposition, contenu: undefined }]; },
      async lireContenus(ids) { noter('lireContenus', ids); return new Map(ids.map((id) => [id, Object.hasOwn(contenus, id) ? contenus[id] : (id === ID ? proposition.contenu : null)])); },
    },
    notion: { async lireOptions() { return OPTIONS; } },
    source: async () => ({ ressources: [{ nom: 'Cohorte X', adresse: 'cohorte-x', lien: 'https://cohorte-x.org', typePrincipal: 'Jeu de données, cohorte ou biobanque', logo: '/logos/0123456789abcdef.png', verifieeLe: '2026-10-01' }], porteurs: [{ nom: 'CHUM' }], idParAdresse: { 'cohorte-x': 'fiche-1' } }),
    fichiers: { async telecharger(url) { noter('telecharger', url); return PNG; } },
    approbation: {
      async examiner(id) { noter('examiner', id); return examen === undefined ? { proposition, actuelle: { nom: 'Cohorte X', phrase: 'Une phrase.', etat: 'Actif', notesDeVeille: 'secret', id: 'fiche-1' }, bouscules: ['phrase'], ficheDisparue: false } : examen; },
      async approuver(a) { noter('approuver', a); return resultat; },
      async refuser(a) { noter('refuser', a); return resultat; },
      async mettreEnVerification(a) { noter('mettreEnVerification', a); return resultat; },
      async donnerAvis(a) { noter('donnerAvis', a); return resultat; },
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
  const res = await appeler(b, requete('GET', 'file'));
  assert.equal(res.code, 200);
  // Les quatre états viennent d'une seule lecture ; le paramètre « statut » de l'ancien panneau n'existe plus.
  assert.deepEqual(b.de('listerPropositions'), [{ statut: 'toutes' }]);
  assert.equal(res.corps.courriel, TESS);
  assert.deepEqual(res.corps.propositions, [{
    id: ID, genre: 'modification', nom: 'Cohorte X', statut: 'attente', proposeLe: '2026-11-24T10:00:00.000Z', verificationLe: null,
    courriel: 'pat@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable', decidePar: null, decideLe: null, commentaire: '', aLogo: true,
    fiche: { adresse: 'cohorte-x', nom: 'Cohorte X' }, type: 'Jeu de données, cohorte ou biobanque', nbChamps: 2, avis: [], ressemble: false, corrige: false,
  }]);
  const brut = JSON.stringify(res.corps);
  for (const interdit of ['fiche-1', 'notion.exemple', 'notesDeVeille', 'ficheId', 'logo.png', 'intrus']) assert.ok(!brut.includes(interdit), interdit);
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
  assert.deepEqual(res.corps, { ok: true, courriel: true, historique: true });
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
  assert.equal((await appeler(banc({ pannes: { equipe: true } }), requete('GET', 'file'))).code, 502);
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

// ─── Lot 1 du nouveau panneau : rôles, accueil, quatre états, second regard, avis ───
const MAX = 'max@exemple.ca';
const CAM = 'cam@exemple.ca';
const EQUIPE = [
  { nom: 'Tess Berthier', courriel: TESS, role: 'administration', resume: true },
  { nom: 'Max Lafrenière', courriel: MAX, role: 'approbation', resume: true },
  { nom: '', courriel: CAM, role: 'lecture', resume: false },
];
const ID2 = '423ffcaf-d90f-8181-a940-e38afc0c69c2';
const ID3 = '423ffcaf-d90f-8181-a940-e38afc0c69c3';
const ID4 = '423ffcaf-d90f-8181-a940-e38afc0c69c4';
const GESTES = ['mettreEnVerification', 'donnerAvis', 'approuver', 'refuser'];
const LECTURES = [['moi', {}], ['accueil', {}], ['file', {}], ['detail', { id: ID }], ['logo', { id: ID }]];
const ENVOIS = [['verification', { id: ID }], ['avis', { id: ID, sens: 'favorable' }], ['approuver', { id: ID }], ['refuser', { id: ID, commentaire: 'Non' }]];

test('lecture seule : tout se lit, aucun geste ne passe (403), et rien n\'est appelé', async () => {
  const b = banc({ equipe: EQUIPE });
  for (const [action, query] of LECTURES) {
    assert.equal((await appeler(b, requete('GET', action, { query, cookie: temoin(CAM) }))).code, 200, action);
  }
  for (const [action, body] of ENVOIS) {
    const res = await appeler(b, requete('POST', action, { body, cookie: temoin(CAM) }));
    assert.equal(res.code, 403, action);
    assert.equal(res.corps.code, 'role');
    assert.ok(res.corps.erreur.length > 10, 'un message clair');
  }
  assert.equal(GESTES.reduce((n, nom) => n + b.de(nom).length, 0), 0);
});

test('approbation et administration : tous les gestes du lot 1 passent', async () => {
  for (const qui of [MAX, TESS]) {
    const b = banc({ equipe: EQUIPE });
    for (const [action, query] of LECTURES) assert.equal((await appeler(b, requete('GET', action, { query, cookie: temoin(qui) }))).code, 200, `${action} ${qui}`);
    for (const [action, body] of ENVOIS) assert.equal((await appeler(b, requete('POST', action, { body, cookie: temoin(qui) }))).code, 200, `${action} ${qui}`);
    assert.deepEqual(GESTES.map((nom) => b.de(nom).length), [1, 1, 1, 1]);
  }
});

test('le rôle est relu à chaque appel : une personne retirée ou désactivée reçoit 401 partout', async () => {
  const b = banc({ equipe: EQUIPE.filter((x) => x.courriel !== MAX) });
  for (const [action, query] of LECTURES) assert.equal((await appeler(b, requete('GET', action, { query, cookie: temoin(MAX) }))).code, 401, action);
  for (const [action, body] of ENVOIS) assert.equal((await appeler(b, requete('POST', action, { body, cookie: temoin(MAX) }))).code, 401, action);
  assert.equal(GESTES.reduce((n, nom) => n + b.de(nom).length, 0) + b.de('listerPropositions').length + b.de('examiner').length, 0);
  // Chaque appel a relu l'équipe.
  assert.equal(b.de('equipe').length, LECTURES.length + ENVOIS.length);
});

test('un rôle inconnu ne donne aucun droit de geste', async () => {
  const b = banc({ equipe: [{ nom: 'X', courriel: TESS, role: 'super' }] });
  assert.equal((await appeler(b, requete('GET', 'file'))).code, 200);
  assert.equal((await appeler(b, requete('POST', 'approuver', { body: { id: ID } }))).code, 403);
  assert.equal(b.de('approuver').length, 0);
});

test('une personne en lecture seule peut ouvrir une session', async () => {
  const b = banc({ equipe: EQUIPE });
  const res = await appeler(b, requete('POST', 'session', { cookie: null, body: { jeton: jeton('panneau', { courriel: CAM }) } }));
  assert.equal(res.code, 200);
  assert.match(res.entetes['Set-Cookie'], /^carto_session=/);
});

test('moi : nom, courriel, rôle et ce que le rôle permet', async () => {
  const b = banc({ equipe: EQUIPE });
  assert.deepEqual((await appeler(b, requete('GET', 'moi'))).corps, { nom: 'Tess Berthier', courriel: TESS, role: 'administration', permis: { decider: true, administrer: true } });
  assert.deepEqual((await appeler(b, requete('GET', 'moi', { cookie: temoin(MAX) }))).corps, { nom: 'Max Lafrenière', courriel: MAX, role: 'approbation', permis: { decider: true, administrer: false } });
  assert.deepEqual((await appeler(b, requete('GET', 'moi', { cookie: temoin(CAM) }))).corps, { nom: '', courriel: CAM, role: 'lecture', permis: { decider: false, administrer: false } });
  assert.equal((await appeler(b, requete('POST', 'moi', { body: {} }))).code, 405);
});

// Quatre propositions, une par état.
function quatreEtats() {
  const commun = { courriel: 'pat@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'aucun', verificationLe: null, decidePar: null, decideLe: null, commentaire: '', logoPropose: null };
  const liste = [
    { ...commun, id: ID, genre: 'modification', ficheId: 'fiche-1', titre: 'Modification : Cohorte X', proposeLe: '2026-11-24T10:00:00.000Z', statut: 'attente' },
    { ...commun, id: ID2, genre: 'nouvelle', ficheId: null, titre: 'Nouvelle : Outil Y', proposeLe: '2026-11-20T10:00:00.000Z', statut: 'verification', verificationLe: '2026-11-21T09:00:00.000Z', nomProposant: '' },
    { ...commun, id: ID3, genre: 'modification', ficheId: 'fiche-1', titre: 'Modification : Cohorte X', proposeLe: '2026-11-10T10:00:00.000Z', statut: 'approuvee', decidePar: MAX, decideLe: '2026-11-12T10:00:00.000Z' },
    { ...commun, id: ID4, genre: 'rsn', ficheId: null, titre: 'À remplir : Fonds Z', proposeLe: '2026-11-05T10:00:00.000Z', statut: 'refusee', decidePar: 'ancienne@exemple.ca', decideLe: '2026-11-06T10:00:00.000Z', commentaire: 'Hors périmètre.' },
  ];
  const contenus = {
    [ID]: { propose: { phrase: { avant: 'Une phrase.', apres: 'Une autre.' }, notesDeVeille: { apres: 'intrus' } }, applique: null },
    [ID2]: { propose: { nom: { apres: 'Outil Y' }, typePrincipal: { apres: 'Logiciel ou application' }, lien: { apres: 'https://WWW.cohorte-x.org/' } }, applique: null,
      avis: [
        { courriel: MAX, nom: 'Ancien nom de Max', sens: 'favorable', commentaire: 'Bien.', le: '2026-11-22T09:00:00.000Z' },
        { courriel: TESS, nom: 'Tess Berthier', sens: 'defavorable', commentaire: '', le: '2026-11-23T09:00:00.000Z' },
        { courriel: 'partie@exemple.ca', nom: 'Personne partie', sens: 'favorable', commentaire: '', le: '2026-11-21T10:00:00.000Z' },
        { courriel: 'x@exemple.ca', sens: 'bof' }, 'abîmé',
      ] },
    [ID3]: { propose: { phrase: { avant: 'A', apres: 'B' }, contact: { avant: null, apres: 'a@b.org' } }, applique: { phrase: 'B corrigé', contact: 'a@b.org' } },
    [ID4]: { propose: { nom: { apres: 'Fonds Z' } }, applique: null },
  };
  return { liste, contenus };
}
const SOURCE_TYPE = 'Jeu de données, cohorte ou biobanque';

test('la file rend les quatre états, avec les avis, le type, le nombre de champs et sans donnée interne', async () => {
  const b = banc({ equipe: EQUIPE, ...quatreEtats() });
  const res = await appeler(b, requete('GET', 'file'));
  assert.equal(res.code, 200);
  const parId = Object.fromEntries(res.corps.propositions.map((p) => [p.id, p]));
  assert.deepEqual(res.corps.propositions.map((p) => p.statut), ['verification', 'attente', 'approuvee', 'refusee'], 'ouvertes de la plus ancienne à la plus récente, puis tranchées');
  assert.equal(parId[ID].nbChamps, 1, 'le champ hors catalogue ne compte pas');
  assert.equal(parId[ID].nom, 'Cohorte X');
  assert.equal(parId[ID2].nom, 'Outil Y');
  assert.equal(parId[ID2].type, 'Logiciel ou application');
  assert.equal(parId[ID2].nbChamps, 3);
  assert.equal(parId[ID2].verificationLe, '2026-11-21T09:00:00.000Z');
  assert.equal(parId[ID2].ressemble, true, 'même lien principal qu\'une fiche publique, à la casse et au www près');
  assert.equal(parId[ID].ressemble, false, 'une modification ne ressemble à rien');
  // Avis : le nom d'aujourd'hui dans l'équipe, sinon celui gardé avec l'avis ; « moi » pour le sien ; jamais le courriel.
  assert.deepEqual(parId[ID2].avis, [
    { nom: 'Max Lafrenière', sens: 'favorable', commentaire: 'Bien.', le: '2026-11-22T09:00:00.000Z', moi: false },
    { nom: 'Tess Berthier', sens: 'defavorable', commentaire: '', le: '2026-11-23T09:00:00.000Z', moi: true },
    { nom: 'Personne partie', sens: 'favorable', commentaire: '', le: '2026-11-21T10:00:00.000Z', moi: false },
  ]);
  assert.equal(parId[ID3].decidePar, 'Max Lafrenière');
  assert.equal(parId[ID3].corrige, true);
  assert.equal(parId[ID4].decidePar, 'ancienne@exemple.ca', 'une personne qui n\'est plus dans l\'équipe garde son courriel');
  assert.equal(parId[ID4].commentaire, 'Hors périmètre.');
  assert.equal(parId[ID4].nom, 'Fonds Z');
  assert.equal(parId[ID4].corrige, false);
  const brut = JSON.stringify(res.corps);
  for (const interdit of ['fiche-1', 'ficheId', 'notesDeVeille', 'intrus', MAX, 'partie@exemple.ca', 'contenu']) assert.ok(!brut.includes(interdit), interdit);
});

test('la file ne lit le contenu que des propositions ouvertes et des dernières tranchées', async () => {
  const { liste, contenus } = quatreEtats();
  const vieilles = Array.from({ length: 60 }, (_, i) => ({ ...liste[2], id: `523ffcaf-d90f-8181-a940-${String(i).padStart(12, '0')}`, decideLe: `2026-0${1 + (i % 9)}-10T10:00:00.000Z` }));
  const b = banc({ equipe: EQUIPE, liste: [...liste, ...vieilles], contenus });
  const res = await appeler(b, requete('GET', 'file'));
  assert.equal(res.corps.propositions.length, 64);
  const lus = b.de('lireContenus')[0];
  assert.ok(lus.includes(ID) && lus.includes(ID2) && lus.includes(ID3) && lus.includes(ID4));
  assert.equal(lus.length, 2 + 40);
  const nonLue = res.corps.propositions.find((p) => !lus.includes(p.id));
  assert.equal(nonLue.nbChamps, null);
  assert.deepEqual(nonLue.avis, []);
});

test('une proposition au statut inconnu ne sort dans aucune colonne', async () => {
  const { liste, contenus } = quatreEtats();
  const b = banc({ equipe: EQUIPE, liste: [...liste, { ...liste[0], id: ID.replace(/e$/, 'f'), statut: null }], contenus });
  assert.equal((await appeler(b, requete('GET', 'file'))).corps.propositions.length, 4);
});

test('accueil : compteurs, activité récente dérivée des propositions, état des envois', async () => {
  const env = { ...ENV, EMAIL_TEST_MODE: 'true', EMAIL_TEST_RECIPIENT: 'adresse-d-essai@exemple.ca', RESEND_API_KEY: 're_cle_secrete', CRON_SECRET: 'cron-secret', NOTION_KEY: 'ntn_cle' };
  const b = banc({ env, equipe: EQUIPE, ...quatreEtats() });
  const res = await appeler(b, requete('GET', 'accueil', { cookie: temoin(CAM) }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.compteurs, { nouvelles: 1, verification: 1 });
  assert.deepEqual(res.corps.envois, { resume: { jour: 'lundi', destinataires: 2 }, contributions: true, essaiCourriels: true });
  assert.deepEqual(res.corps.activite, [
    { sorte: 'recue', quand: '2026-11-24T10:00:00.000Z', qui: 'Pat', nom: 'Cohorte X', genre: 'modification' },
    { sorte: 'avis', quand: '2026-11-23T09:00:00.000Z', qui: 'Tess Berthier', nom: 'Outil Y', genre: 'nouvelle', sens: 'defavorable' },
    { sorte: 'avis', quand: '2026-11-22T09:00:00.000Z', qui: 'Max Lafrenière', nom: 'Outil Y', genre: 'nouvelle', sens: 'favorable' },
    { sorte: 'avis', quand: '2026-11-21T10:00:00.000Z', qui: 'Personne partie', nom: 'Outil Y', genre: 'nouvelle', sens: 'favorable' },
    { sorte: 'verification', quand: '2026-11-21T09:00:00.000Z', qui: null, nom: 'Outil Y', genre: 'nouvelle' },
    { sorte: 'recue', quand: '2026-11-20T10:00:00.000Z', qui: null, nom: 'Outil Y', genre: 'nouvelle' },
    { sorte: 'approuvee', quand: '2026-11-12T10:00:00.000Z', qui: 'Max Lafrenière', nom: 'Cohorte X', genre: 'modification' },
    { sorte: 'recue', quand: '2026-11-10T10:00:00.000Z', qui: 'Pat', nom: 'Cohorte X', genre: 'modification' },
    { sorte: 'refusee', quand: '2026-11-06T10:00:00.000Z', qui: 'ancienne@exemple.ca', nom: 'Fonds Z', genre: 'rsn' },
    { sorte: 'recue', quand: '2026-11-05T10:00:00.000Z', qui: 'Pat', nom: 'Fonds Z', genre: 'rsn' },
  ]);
  // Ni l'adresse d'essai, ni aucun secret, ni le courriel des proposants.
  const brut = JSON.stringify(res.corps);
  for (const interdit of ['adresse-d-essai', 're_cle', 'cron-secret', 'ntn_cle', secret, 'pat@exemple.org', 'fiche-1']) assert.ok(!brut.includes(interdit), interdit);
});

test('accueil : vingt événements au plus, les plus récents ; mode d\'essai arrêté par défaut', async () => {
  const { liste } = quatreEtats();
  const beaucoup = Array.from({ length: 30 }, (_, i) => ({ ...liste[0], id: `623ffcaf-d90f-8181-a940-${String(i).padStart(12, '0')}`, proposeLe: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00.000Z` }));
  const res = await appeler(banc({ equipe: EQUIPE, liste: beaucoup }), requete('GET', 'accueil'));
  assert.equal(res.corps.activite.length, 20);
  assert.equal(res.corps.activite[0].quand, '2026-10-30T10:00:00.000Z');
  assert.equal(res.corps.compteurs.nouvelles, 30);
  assert.equal(res.corps.envois.essaiCourriels, false);
});

test('le jour du résumé annoncé par l\'accueil est celui du planificateur', async () => {
  const cron = require('../vercel.json').crons.find((c) => c.path === '/api/resume').schedule;
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const res = await appeler(banc(), requete('GET', 'accueil'));
  assert.equal(res.corps.envois.resume.jour, jours[Number(cron.split(' ')[4])]);
});

test('demander un second regard : transmis au nom de la personne en session', async () => {
  const b = banc({ equipe: EQUIPE });
  const res = await appeler(b, requete('POST', 'verification', { cookie: temoin(MAX), body: { id: ID, par: 'intrus@exemple.org' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true });
  assert.deepEqual(b.de('mettreEnVerification'), [{ propositionId: ID, par: MAX }]);
  assert.equal((await appeler(b, requete('POST', 'verification', { body: { id: 'pas-un-id' } }))).code, 400);
  assert.equal((await appeler(b, requete('GET', 'verification', { query: { id: ID } }))).code, 405);
});

test('donner un avis : sens et commentaire transmis, bornés, au nom de la personne en session', async () => {
  const b = banc({ equipe: EQUIPE });
  await appeler(b, requete('POST', 'avis', { cookie: temoin(MAX), body: { id: ID, sens: 'defavorable', commentaire: 'Doublon.', par: TESS, courriel: TESS } }));
  await appeler(b, requete('POST', 'avis', { body: { id: ID, sens: ['favorable'], commentaire: { a: 1 } } }));
  await appeler(b, requete('POST', 'avis', { body: { id: ID, sens: 'favorable', commentaire: 'x'.repeat(5000) } }));
  const recus = b.de('donnerAvis');
  assert.deepEqual(recus[0], { propositionId: ID, par: MAX, sens: 'defavorable', commentaire: 'Doublon.' });
  assert.deepEqual(recus[1], { propositionId: ID, par: TESS, sens: '', commentaire: '' });
  assert.equal(recus[2].commentaire.length, 2000);
  assert.equal((await appeler(b, requete('POST', 'avis', { body: { sens: 'favorable' } }))).code, 400);
});

test('la réponse à un avis rend les avis à jour, sans courriel', async () => {
  const avis = [{ courriel: MAX, nom: 'Vieux nom', sens: 'favorable', commentaire: '', le: '2026-11-25T10:00:00.000Z' }];
  const b = banc({ equipe: EQUIPE, resultat: { ok: true, avis } });
  const res = await appeler(b, requete('POST', 'avis', { cookie: temoin(MAX), body: { id: ID, sens: 'favorable' } }));
  assert.deepEqual(res.corps, { ok: true, avis: [{ nom: 'Max Lafrenière', sens: 'favorable', commentaire: '', le: '2026-11-25T10:00:00.000Z', moi: true }] });
});

test('second regard et avis : chaque issue a son code de réponse', async () => {
  const cas = { occupee: 409, 'deja-tranchee': 409, invalide: 400, notion: 502, introuvable: 404, 'non-approbateur': 401 };
  for (const action of ['verification', 'avis']) {
    for (const [code, attendu] of Object.entries(cas)) {
      const res = await appeler(banc({ resultat: { ok: false, code, erreurs: { sens: 'x' } } }), requete('POST', action, { body: { id: ID, sens: 'favorable' } }));
      assert.equal(res.code, attendu, `${action} ${code}`);
      assert.equal(res.corps.code, code);
    }
  }
});

test('le détail porte les avis, la date de vérification, le type et l\'alerte de doublon', async () => {
  const { liste, contenus } = quatreEtats();
  const proposition = { ...liste[1], contenu: contenus[ID2] };
  const b = banc({ equipe: EQUIPE, examen: { proposition, actuelle: null, bouscules: [], ficheDisparue: false } });
  const res = await appeler(b, requete('GET', 'detail', { query: { id: ID2 }, cookie: temoin(MAX) }));
  assert.equal(res.code, 200);
  assert.equal(res.corps.proposition.statut, 'verification');
  assert.equal(res.corps.proposition.verificationLe, '2026-11-21T09:00:00.000Z');
  assert.equal(res.corps.proposition.type, 'Logiciel ou application');
  assert.deepEqual(res.corps.proposition.avis.map((a) => [a.nom, a.sens, a.moi]), [['Max Lafrenière', 'favorable', true], ['Tess Berthier', 'defavorable', false], ['Personne partie', 'favorable', false]]);
  assert.deepEqual(res.corps.ressemble, { adresse: 'cohorte-x', nom: 'Cohorte X' });
  const brut = JSON.stringify(res.corps);
  for (const interdit of [MAX, 'partie@exemple.ca', 'fiche-1']) assert.ok(!brut.includes(interdit), interdit);
});

test('le détail d\'une modification donne de quoi montrer l\'aperçu : logo et vérification publics de la fiche', async () => {
  const res = await appeler(banc(), requete('GET', 'detail', { query: { id: ID } }));
  assert.deepEqual(res.corps.apercu, { logo: '/logos/0123456789abcdef.png', verifieeLe: '2026-10-01' });
  assert.equal(res.corps.ressemble, null);
  assert.equal(res.corps.proposition.type, SOURCE_TYPE);
});

test('le contenu d\'une proposition tranchée n\'est lu qu\'une fois ; celui des ouvertes est relu à chaque fois', async () => {
  const { liste, contenus } = quatreEtats();
  const b = banc({ equipe: EQUIPE, liste, contenus });
  const premiere = await appeler(b, requete('GET', 'file'));
  const seconde = await appeler(b, requete('GET', 'accueil'));
  const troisieme = await appeler(b, requete('GET', 'file'));
  assert.equal(seconde.code, 200);
  const [lus1, lus2, lus3] = b.de('lireContenus');
  assert.deepEqual([...lus1].sort(), [ID, ID2, ID3, ID4].sort());
  assert.deepEqual([...lus2].sort(), [ID, ID2].sort());
  assert.deepEqual([...lus3].sort(), [ID, ID2].sort());
  assert.deepEqual(troisieme.corps, premiere.corps);
});
