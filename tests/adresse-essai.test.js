const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { banc, requete, temoin, SECRETS, ADRESSE_ESSAI, TESS, MAX, LEA, ODILE } = require('./aides/banc-lot4b');
const { banc: banc4c } = require('./aides/banc-lot4c');
const { faussePage } = require('./aides/fausse-page');
const { adresseEssaiEnVigueur, adresseEssaiValide, CLES } = require('../lib/reglages');
const { creerCourriels } = require('../lib/courriels');
const { GESTES } = require('../lib/journal');
const { TEXTES } = require('../public/js/texte.js');

const DU_PANNEAU = 'essais-du-panneau@exemple.net';
const CO = TEXTES.panneau.courriels;
// Les six courriels normaux, chacun avec de quoi le remplir, et « plus » pour y glisser n'importe quoi.
const LES_SIX = {
  lien: (c, a, plus) => c.lienProposer({ a, lien: 'https://site/proposer?jeton=abc', nomFiche: 'CARTaGENE', ...plus }),
  recue: (c, a, plus) => c.propositionRecue({ a, titre: 'Nouvelle : Outil X', destinataire: 'Pat', ...plus }),
  approuvee: (c, a, plus) => c.approuvee({ a, nom: 'Outil X', lienFiche: 'https://site/ressource/outil-x', destinataire: 'Pat', ...plus }),
  refusee: (c, a, plus) => c.refusee({ a, titre: 'Nouvelle : Outil X', commentaire: 'Le lien ne mène nulle part.', destinataire: 'Pat', ...plus }),
  panneau: (c, a, plus) => c.lienPanneau({ a, lien: 'https://site/admin?jeton=abc', destinataire: 'Pat', ...plus }),
  resume: (c, a, plus) => c.resumeHebdomadaire({ a, propositions: [{ titre: 'Nouvelle : X' }], lienPanneau: 'https://site/admin', destinataire: 'Pat', ...plus }),
};
const VRAIE = 'vraie-personne@exemple.org';

// ─── 1. L'adresse en vigueur ───
test('adresseEssaiValide : une seule adresse, en forme de courriel, normalisée, de longueur bornée', () => {
  assert.equal(adresseEssaiValide('  Essais@Exemple.NET '), 'essais@exemple.net');
  for (const refuse of ['', '   ', 'pas une adresse', 'a@b', 'a@b.c, d@e.f', 'a@b.c;d@e.f', 'a@b.c d@e.f', 'Tess <a@b.c>', 'a@b.c\nBcc: x@y.z', `${'a'.repeat(250)}@b.ca`, 12, null, undefined, ['a@b.c'], { adresse: 'a@b.c' }, true]) {
    assert.equal(adresseEssaiValide(refuse), null, String(refuse).slice(0, 30));
  }
});

test('adresseEssaiEnVigueur : le panneau passe devant la variable ; absent, illisible ou invalide, la variable ; sinon rien', () => {
  const env = { EMAIL_TEST_RECIPIENT: ' boite@hebergeur.exemple ' };
  assert.deepEqual(adresseEssaiEnVigueur({ etat: 'present', valeur: ' Essais@Exemple.NET ' }, env), { adresse: 'essais@exemple.net', source: 'panneau', ecartee: false });
  assert.deepEqual(adresseEssaiEnVigueur({ etat: 'absent' }, env), { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false });
  assert.deepEqual(adresseEssaiEnVigueur({ etat: 'inconnu' }, env), { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false });
  assert.deepEqual(adresseEssaiEnVigueur(undefined, env), { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false });
  // Un réglage qui ne vaut rien est écarté : la variable si elle existe, sinon aucune adresse.
  for (const lecture of [{ etat: 'illisible' }, { etat: 'present', valeur: 'pas une adresse' }, { etat: 'present', valeur: 'a@b.c, d@e.f' }, { etat: 'present', valeur: 12 }, { etat: 'present', valeur: null }, { etat: 'present', valeur: ['a@b.c'] }]) {
    assert.deepEqual(adresseEssaiEnVigueur(lecture, env), { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: true }, JSON.stringify(lecture));
    for (const sans of [{}, { EMAIL_TEST_RECIPIENT: '' }, { EMAIL_TEST_RECIPIENT: '   ' }, undefined, null]) {
      assert.deepEqual(adresseEssaiEnVigueur(lecture, sans), { adresse: null, source: null, ecartee: true }, JSON.stringify(lecture));
    }
  }
  assert.deepEqual(adresseEssaiEnVigueur({ etat: 'absent' }, {}), { adresse: null, source: null, ecartee: false });
});

test('en mode d\'essai, les courriels vont à l\'adresse du panneau ; sans elle, à celle de l\'hébergeur', async () => {
  const b = banc({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU } });
  for (const [id, envoyer] of Object.entries(LES_SIX)) {
    assert.deepEqual(await envoyer(b.courriels, VRAIE), { envoye: true, essai: true }, id);
    assert.deepEqual(b.envois.at(-1).to, [DU_PANNEAU], id);
    assert.ok(b.envois.at(-1).subject.startsWith(`[TEST → ${VRAIE}] `), id);
  }
  const sans = banc({ reglages: { modeEssai: true } });
  await sans.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' });
  assert.deepEqual(sans.envois[0].to, [ADRESSE_ESSAI]);
  // Sans base « Réglages » : la variable, comme avant.
  const sansBase = banc({ sansBase: true, env: { EMAIL_TEST_MODE: 'true' } });
  await sansBase.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' });
  assert.deepEqual(sansBase.envois[0].to, [ADRESSE_ESSAI]);
});

test('jamais un courriel à la vraie personne faute d\'adresse d\'essai : réglage invalide ou illisible, avec ou sans variable', async () => {
  for (const pose of [(b) => b.poser('adresseEssai', '"pas une adresse"'), (b) => b.poser('adresseEssai', '{pas du json'), (b) => b.poser('adresseEssai', '["a@b.ca","c@d.ca"]'), (b) => b.poser('adresseEssai', '"a@b.ca, c@d.ca"')]) {
    const avec = banc({ reglages: { modeEssai: true } });
    pose(avec);
    const sans = banc({ reglages: { modeEssai: true }, env: { EMAIL_TEST_RECIPIENT: '' } });
    pose(sans);
    for (const [id, envoyer] of Object.entries(LES_SIX)) {
      await envoyer(avec.courriels, VRAIE);
      assert.deepEqual(avec.envois.at(-1).to, [ADRESSE_ESSAI], `${id} : la variable de l'hébergeur`);
      assert.deepEqual(await envoyer(sans.courriels, VRAIE), { envoye: false }, id);
    }
    assert.equal(sans.envois.length, 0, 'sans aucune adresse d\'essai, rien ne part');
    assert.ok(!JSON.stringify(avec.envois.map((m) => m.to)).includes(VRAIE));
  }
  // La base « Réglages » en panne pendant le mode d'essai : la variable, jamais la vraie personne.
  const panne = banc({ env: { EMAIL_TEST_MODE: 'true' }, pannesNotion: { 'databases.query': (a) => a.database_id === 'base-reglages' } });
  await panne.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' });
  assert.deepEqual(panne.envois.map((m) => m.to), [[ADRESSE_ESSAI]]);
});

// ─── 1. L'écran et la route ───
test('courriels : l\'Administration voit l\'adresse en vigueur et d\'où elle vient ; les autres rôles ne la reçoivent pas', async () => {
  const b = banc({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU } });
  const admin = await b.lire('courriels', {}, TESS);
  assert.deepEqual(Object.keys(admin.corps).sort(), ['adresseEssai', 'courriels', 'essai', 'reglages', 'service']);
  assert.deepEqual(admin.corps.adresseEssai, { adresse: DU_PANNEAU, source: 'panneau', ecartee: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier', vu: '2026-11-20T10:00:00.000Z' });
  assert.equal(admin.corps.essai.adresseDefinie, true);
  for (const qui of [MAX, LEA]) {
    const res = await b.lire('courriels', {}, qui);
    assert.equal(res.code, 200);
    assert.deepEqual(Object.keys(res.corps).sort(), ['courriels', 'essai', 'reglages', 'service'], qui);
    assert.deepEqual(res.corps.essai, { actif: true, source: 'panneau', adresseDefinie: true, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' });
    const brut = JSON.stringify(res.corps) + JSON.stringify(res.entetes);
    for (const interdit of [DU_PANNEAU, 'essais-du-panneau', ADRESSE_ESSAI, 'boite-d-essai']) assert.ok(!brut.includes(interdit), `${qui} : ${interdit}`);
  }
  // Sans réglage dans le panneau : l'Administration voit celle de l'hébergeur, les autres toujours rien.
  const c = banc();
  assert.deepEqual((await c.lire('courriels', {}, TESS)).corps.adresseEssai, { adresse: ADRESSE_ESSAI, source: 'vercel', ecartee: false, modifieLe: null, modifiePar: null, vu: null });
  for (const qui of [MAX, LEA]) assert.ok(!JSON.stringify((await c.lire('courriels', {}, qui)).corps).includes('boite-d-essai'), qui);
  // Aucune adresse nulle part.
  const rien = banc({ env: { EMAIL_TEST_RECIPIENT: '' } });
  assert.deepEqual((await rien.lire('courriels', {}, TESS)).corps.adresseEssai, { adresse: null, source: null, ecartee: false, modifieLe: null, modifiePar: null, vu: null });
  assert.equal((await rien.lire('courriels', {}, LEA)).corps.essai.adresseDefinie, false);
  // Un réglage écarté se voit, sans que sa valeur sorte.
  const ecarte = banc();
  ecarte.poser('adresseEssai', '"pas une adresse"', MAX);
  assert.deepEqual((await ecarte.lire('courriels', {}, TESS)).corps.adresseEssai, { adresse: ADRESSE_ESSAI, source: 'vercel', ecartee: true, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Maxime Lafrenière', vu: '2026-11-20T10:00:00.000Z' });
});

test('aucune autre réponse du panneau ne porte l\'adresse d\'essai, pour aucun rôle : accueil, réglages, invitation, mode d\'essai', async () => {
  const b = banc4c({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU } });
  for (const qui of [TESS, MAX, LEA]) { await b.lire('accueil', {}, qui); await b.lire('reglages', {}, qui); await b.lire('equipe', {}, qui); }
  await b.envoyer('mode-essai', { actif: true });
  await b.envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia', role: 'lecture' });
  await b.envoyer('essai-courriel', { id: 'recue' });
  assert.ok(b.vues.length >= 12);
  for (const { action, res } of b.vues) {
    const brut = JSON.stringify(res.corps) + JSON.stringify(res.entetes);
    for (const interdit of [DU_PANNEAU, 'essais-du-panneau', ADRESSE_ESSAI, 'boite-d-essai']) assert.ok(!brut.includes(interdit), `${action} : ${interdit}`);
  }
  // Le bloc « Fixé à l'installation » dit toujours seulement si la variable de l'hébergeur est définie.
  assert.equal((await b.lire('reglages', {}, LEA)).corps.installation.adresseEssai, true);
  assert.equal((await banc4c({ sans: ['EMAIL_TEST_RECIPIENT'], reglages: { adresseEssai: DU_PANNEAU } }).lire('reglages')).corps.installation.adresseEssai, false);
});

test('adresse-essai : l\'Administration l\'enregistre, normalisée ; le journal le note sans l\'adresse ; les envois suivent', async () => {
  const b = banc({ reglages: { modeEssai: true } });
  const res = await b.envoyer('adresse-essai', { adresse: `  ${DU_PANNEAU.toUpperCase()} `, vu: null });
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['adresseDefinie', 'adresseEssai', 'ok']);
  assert.deepEqual([res.corps.ok, res.corps.adresseDefinie, res.corps.adresseEssai.adresse, res.corps.adresseEssai.source, res.corps.adresseEssai.modifiePar], [true, true, DU_PANNEAU, 'panneau', 'Tess Berthier']);
  assert.ok(res.corps.adresseEssai.vu && res.corps.adresseEssai.vu === res.corps.adresseEssai.modifieLe);
  assert.equal(b.reglagesEcrits().adresseEssai, DU_PANNEAU);
  assert.deepEqual(b.journalEcrit(), [{ geste: "Adresse d'essai changée", par: TESS, sur: 'Courriels', phrase: "a changé l'adresse qui reçoit les courriels en mode d'essai" }]);
  assert.ok(!JSON.stringify(b.journalEcrit()).includes('essais-du-panneau'), 'l\'adresse n\'est pas recopiée au journal');
  await b.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' });
  assert.deepEqual(b.envois.at(-1).to, [DU_PANNEAU]);
  // La même adresse de nouveau : rien n'est écrit, rien n'est noté.
  const avant = b.ecritures();
  const encore = await b.envoyer('adresse-essai', { adresse: DU_PANNEAU, vu: res.corps.adresseEssai.vu });
  assert.deepEqual([encore.code, encore.corps.ok, encore.corps.inchange], [200, true, true]);
  assert.equal(b.ecritures(), avant);
  assert.equal(b.journalEcrit().length, 1);
  // Les autres rôles ne voient toujours rien de la nouvelle adresse.
  assert.ok(!JSON.stringify((await b.lire('courriels', {}, LEA)).corps).includes('essais-du-panneau'));
});

test('adresse-essai : vider le champ retire le réglage et rend la main à la variable de l\'hébergeur', async () => {
  const b = banc({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU } });
  const res = await b.envoyer('adresse-essai', { adresse: '   ', vu: '2026-11-20T10:00:00.000Z' });
  assert.deepEqual([res.code, res.corps.ok, res.corps.retiree, res.corps.adresseDefinie], [200, true, true, true]);
  assert.deepEqual(res.corps.adresseEssai, { adresse: ADRESSE_ESSAI, source: 'vercel', ecartee: false, modifieLe: null, modifiePar: null, vu: null });
  assert.ok(!Object.hasOwn(b.reglagesEcrits(), 'adresseEssai'));
  assert.deepEqual(b.journalEcrit(), [{ geste: "Adresse d'essai changée", par: TESS, sur: 'Courriels', phrase: "a retiré l'adresse d'essai réglée dans le panneau : celle de l'hébergeur reprend" }]);
  await b.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' });
  assert.deepEqual(b.envois.at(-1).to, [ADRESSE_ESSAI]);
  // Rien à retirer : rien n'est noté.
  const encore = await b.envoyer('adresse-essai', { adresse: '' });
  assert.deepEqual([encore.code, encore.corps.inchange], [200, true]);
  assert.equal(b.journalEcrit().length, 1);
  // Retirée sans variable chez l'hébergeur : plus aucune adresse, et en mode d'essai rien ne part.
  const sans = banc({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU }, env: { EMAIL_TEST_RECIPIENT: '' } });
  const retrait = await sans.envoyer('adresse-essai', { adresse: '' });
  assert.deepEqual([retrait.corps.adresseDefinie, retrait.corps.adresseEssai.adresse], [false, null]);
  assert.deepEqual(await sans.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' }), { envoye: false });
  assert.equal(sans.envois.length, 0);
});

test('adresse-essai : une adresse invalide est refusée avec son erreur, un corps mal formé est illisible, et rien n\'est écrit', async () => {
  const b = banc({ reglages: { adresseEssai: DU_PANNEAU } });
  for (const adresse of ['pas une adresse', 'a@b', 'a@b.ca, c@d.ca', 'Tess <a@b.ca>', `${'a'.repeat(250)}@b.ca`]) {
    const res = await b.envoyer('adresse-essai', { adresse });
    assert.deepEqual([res.code, res.corps.code], [400, 'invalide'], adresse.slice(0, 30));
    assert.match(res.corps.erreurs.adresse, /adresse/);
  }
  for (const corps of [{}, { adresse: 12 }, { adresse: null }, { adresse: ['a@b.ca'] }, { adresse: 'a'.repeat(401) }, { adresse: 'a@b.ca', vu: 12 }, { adresse: 'a@b.ca', vu: 'x'.repeat(41) }, { adresse: 'a@b.ca', vu: {} }]) {
    assert.deepEqual([(await b.envoyer('adresse-essai', corps)).code], [400], JSON.stringify(corps).slice(0, 40));
  }
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
  assert.deepEqual(b.reglagesEcrits(), { adresseEssai: DU_PANNEAU });
});

test('adresse-essai : réservée à l\'Administration, dans la table de la route ET dans le module', async () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  assert.ok(route.includes("'adresse-essai': { methode: 'POST', role: 'administration' }"));
  assert.match(route, /\* +POST +adresse-essai\b/);
  for (const qui of [MAX, LEA]) {
    const b = banc({ reglages: { adresseEssai: DU_PANNEAU } });
    const res = await b.envoyer('adresse-essai', { adresse: 'pirate@exemple.org' }, qui);
    assert.deepEqual([res.code, res.corps.code], [403, 'role'], qui);
    assert.equal(b.ecritures(), 0);
    assert.deepEqual(b.journalEcrit(), []);
  }
  // Le module relit le rôle lui-même : la route n'est pas la seule garde.
  const b = banc({ reglages: { adresseEssai: DU_PANNEAU } });
  for (const par of [MAX, LEA, ODILE, 'inconnue@exemple.org', '', null, undefined]) {
    assert.deepEqual(await b.courriels.reglerAdresseEssai({ adresse: 'pirate@exemple.org', par }), { ok: false, code: 'role' }, String(par));
    assert.deepEqual(await b.courriels.reglerAdresseEssai({ adresse: '', par }), { ok: false, code: 'role' }, String(par));
    assert.deepEqual(await b.courriels.adresseEssaiPour({ par }), { ok: false, code: 'role' }, String(par));
  }
  assert.equal(b.ecritures(), 0);
  // Un module assemblé sans de quoi relire les rôles refuse tout.
  const sansRoles = creerCourriels({ env: b.env, journal: () => {}, reglages: b.socle });
  assert.deepEqual(await sansRoles.reglerAdresseEssai({ adresse: 'a@b.ca', par: TESS }), { ok: false, code: 'role' });
  assert.deepEqual(await sansRoles.adresseEssaiPour({ par: TESS }), { ok: false, code: 'role' });
  assert.equal(b.ecritures(), 0);
  const assemblage = fs.readFileSync(path.join(__dirname, '..', 'lib', 'contributions.js'), 'utf8');
  assert.match(assemblage, /creerCourriels\(\{ env, reglages, roleDe \}\)/);
});

test('adresse-essai : session, origine et méthode vérifiées comme pour les autres écritures', async () => {
  const b = banc();
  const corps = { adresse: 'pirate@exemple.org' };
  for (const cookie of [temoin(ODILE), temoin('intrus@exemple.org'), null]) {
    const res = await b.appeler(requete('POST', 'adresse-essai', { body: corps, cookie }));
    assert.deepEqual([res.code, res.corps.code], [401, 'session']);
  }
  assert.equal((await b.appeler(requete('GET', 'adresse-essai'))).code, 405);
  for (const headers of [{ origin: 'https://attaquant.exemple' }, { origin: undefined }, { 'content-type': 'application/x-www-form-urlencoded' }]) {
    assert.equal((await b.appeler(requete('POST', 'adresse-essai', { body: corps, headers }))).code, 403, JSON.stringify(headers));
  }
  assert.equal(b.ecritures(), 0);
});

test('adresse-essai : un écran resté ouvert n\'écrase pas le changement d\'une autre personne (409), et sans la base rien ne s\'enregistre', async () => {
  const b = banc({ reglages: { adresseEssai: DU_PANNEAU } });
  // L'écran avait lu « aucun réglage » ; entre-temps une autre personne en a enregistré un.
  for (const vu of [null, '2026-11-01T10:00:00.000Z']) {
    const res = await b.envoyer('adresse-essai', { adresse: 'autre@exemple.org', vu });
    assert.deepEqual([res.code, res.corps], [409, { code: 'conflit' }], String(vu));
    const retrait = await b.envoyer('adresse-essai', { adresse: '', vu });
    assert.deepEqual([retrait.code, retrait.corps], [409, { code: 'conflit' }], String(vu));
  }
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
  assert.equal((await b.envoyer('adresse-essai', { adresse: 'autre@exemple.org', vu: '2026-11-20T10:00:00.000Z' })).code, 200);
  assert.equal(b.reglagesEcrits().adresseEssai, 'autre@exemple.org');
  const sansBase = banc({ sansBase: true });
  for (const adresse of ['a@b.ca', '']) {
    const res = await sansBase.envoyer('adresse-essai', { adresse });
    assert.deepEqual([res.code, res.corps.code], [409, 'reglages-absents']);
  }
  // La base ne répond pas : on n'écrit pas par-dessus ce qu'on ne peut pas lire.
  const panne = banc({ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-reglages' } });
  const res = await panne.envoyer('adresse-essai', { adresse: 'a@b.ca' });
  assert.deepEqual([res.code, res.corps.code], [502, 'notion']);
  assert.equal(panne.ecritures(), 0);
});

test('le geste « Adresse d\'essai changée » existe dans le journal, et la page lui donne une couleur', () => {
  assert.ok(GESTES.includes("Adresse d'essai changée"));
  assert.match(fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8'), /'Adresse d\\'essai changée': 'warn'/);
  assert.equal(CLES.adresseEssai, 'adresseEssai');
});

// ─── 2. « M'envoyer un essai » ───
test('essai-courriel : mode d\'essai actif ou non, l\'essai part à la personne connectée, « [ESSAI] » dans l\'objet, sans redirection', async () => {
  for (const reglages of [{ modeEssai: true }, { modeEssai: true, adresseEssai: DU_PANNEAU }, { modeEssai: false }, {}]) {
    const b = banc({ reglages });
    for (const id of Object.keys(LES_SIX)) {
      const res = await b.envoyer('essai-courriel', { id, a: 'victime@exemple.org', to: ['victime@exemple.org'], par: 'victime@exemple.org' });
      assert.deepEqual([res.code, res.corps], [200, { ok: true, envoye: true, simule: false }], id);
      const m = b.envois.at(-1);
      assert.deepEqual(m.to, [TESS], id);
      assert.ok(m.subject.startsWith('[ESSAI] ') && !m.subject.includes('[TEST'), `${id} : ${m.subject}`);
      assert.ok(!JSON.stringify(m).includes('victime'));
    }
    assert.equal(b.envois.length, 6);
  }
  // Même sans aucune adresse d'essai : l'essai part quand même, à la personne qui essaie.
  const sans = banc({ env: { EMAIL_TEST_RECIPIENT: '' }, reglages: { modeEssai: true } });
  const res = await sans.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([res.code, res.corps], [200, { ok: true, envoye: true, simule: false }]);
  assert.deepEqual(sans.envois[0].to, [TESS]);
  // La base « Réglages » en panne (mode d'essai par précaution) : pareil.
  const panne = banc({ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-reglages' } });
  await panne.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual(panne.envois.map((m) => m.to), [[TESS]]);
  const route = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  assert.ok(!route.includes('sans-adresse'), 'le code « sans-adresse » ne vaut plus pour l\'essai');
});

test('l\'essai est le seul envoi qui contourne le mode d\'essai : les six courriels normaux restent redirigés, quoi qu\'on leur passe', async () => {
  const pieges = { aLaPersonne: true, directe: true, sansRedirection: true, essai: true, contourner: true, prefixe: '[ESSAI] ', gabarit: { objet: 'x', texte: 'x {lien}' }, options: { aLaPersonne: true } };
  const b = banc({ reglages: { modeEssai: true } });
  for (const [id, envoyer] of Object.entries(LES_SIX)) {
    assert.deepEqual(await envoyer(b.courriels, VRAIE, pieges), { envoye: true, essai: true }, id);
    assert.deepEqual(b.envois.at(-1).to, [ADRESSE_ESSAI], id);
    assert.ok(b.envois.at(-1).subject.startsWith(`[TEST → ${VRAIE}] `) && !b.envois.at(-1).subject.includes('[ESSAI]'), id);
  }
  assert.equal(b.envois.length, 6);
  // Rien d'autre que les six courriels, l'essai et les lectures de l'écran ne sort du module : ni l'envoi brut, ni le gabarit libre.
  const publics = Object.keys(b.courriels).sort();
  assert.deepEqual(publics, ['adresseEssaiPour', 'approuvee', 'enregistrer', 'essai', 'etat', 'lienPanneau', 'lienProposer', 'lister', 'modeEssai', 'propositionRecue', 'refusee', 'reglerAdresseEssai', 'resumeHebdomadaire', 'retablir']);
  // Dans le code, le contournement n'est demandé qu'à un seul endroit : dans « essai ».
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'courriels.js'), 'utf8');
  assert.equal((source.match(/aLaPersonne: true/g) || []).length, 1);
  const debutEssai = source.indexOf('async essai(');
  assert.ok(debutEssai > 0 && source.indexOf('aLaPersonne: true') > debutEssai);
  // Le reste de la route et des modules n'appelle l'essai que depuis « essai-courriel ».
  for (const fichier of ['api/admin.js', 'api/resume.js', 'api/lien.js', 'api/proposition.js', 'lib/equipe.js', 'lib/approbation.js']) {
    const texte = fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8');
    assert.equal((texte.match(/courriels\.essai\(/g) || []).length, fichier === 'api/admin.js' ? 1 : 0, fichier);
    assert.ok(!texte.includes('aLaPersonne'), fichier);
  }
});

test('essai : une seule adresse, donnée par le serveur ; une liste ou rien ne part pas', async () => {
  const b = banc({ reglages: { modeEssai: true } });
  for (const a of ['', null, undefined, ['a@exemple.org', 'b@exemple.org'], { a: 'x@exemple.org' }, 'a@exemple.org, b@exemple.org', 'pas une adresse']) {
    assert.deepEqual(await b.courriels.essai({ id: 'recue', a }), { ok: false, code: 'envoi' }, String(a));
  }
  assert.equal(b.envois.length, 0);
  // La limite de vingt essais par heure reste comptée au nom de la personne connectée.
  const limite = banc({ essaisPermis: (n) => n <= 1, reglages: { modeEssai: true } });
  assert.equal((await limite.envoyer('essai-courriel', { id: 'recue' })).code, 200);
  assert.deepEqual([(await limite.envoyer('essai-courriel', { id: 'recue' })).code], [429]);
  assert.deepEqual(limite.demandesDEssai, [{ courriel: TESS }, { courriel: TESS }]);
  assert.equal(require('../lib/limites').PLAFONDS.essaisParHeure, 20);
});

// ─── La page ───
const moi = (role) => () => ({ code: 200, donnees: { nom: 'Tess Berthier', courriel: 'tess@exemple.ca', role, permis: { decider: role !== 'lecture', administrer: role === 'administration' } } });
const PIEGE = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'';
async function vueCourriels(extra = {}) {
  const liste = (await creerCourriels({ env: {}, journal: () => {} }).lister()).liste.map((c) => ({ ...c, quand: c.quand.replace('{jour}', 'lundi') }));
  return { reglages: { actifs: true, lus: true }, essai: { actif: true, source: 'panneau', adresseDefinie: true, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' }, service: true, courriels: liste, ...extra };
}
const VUE_ADRESSE = { adresse: DU_PANNEAU, source: 'panneau', ecartee: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier', vu: '2026-11-20T10:00:00.000Z' };
async function page({ role = 'administration', reponses = {} } = {}) {
  const p = faussePage({ hash: '#courriels', reponses: { moi: moi(role), ...reponses } });
  await p.repos();
  return p;
}

test('écran Courriels, Administration : l\'adresse d\'essai se voit dans la carte du mode d\'essai, avec sa provenance, échappée', async () => {
  const vue = await vueCourriels({ adresseEssai: { ...VUE_ADRESSE, adresse: `x${PIEGE}@exemple.org`, modifiePar: PIEGE } });
  const p = await page({ reponses: { courriels: () => ({ code: 200, donnees: vue }) } });
  const html = p.html('#cbody');
  assert.ok(!/<script|<img/.test(html.replace(/srcdoc="[^"]*"/g, '')), 'rien de ce qui vient des données ne devient du HTML');
  assert.match(html, /<input type="email" id="essaiAdresse"[^>]*value="x&lt;script&gt;/);
  assert.ok(html.includes('data-act="c-adresse"') && html.includes(CO.adresse.enregistrer) && html.includes(CO.adresse.libelle));
  assert.ok(html.includes('id="essaiMode"'), 'à côté de l\'interrupteur');
  assert.ok(html.indexOf('id="essaiMode"') < html.indexOf('id="essaiAdresse"') && html.indexOf('id="essaiAdresse"') < html.indexOf('class="mail"'), 'dans la carte du mode d\'essai');
  // Celle de l'hébergeur : montrée, et le champ reste vide pour en écrire une autre.
  const heberge = await page({ reponses: { courriels: () => ({ code: 200, donnees: { ...vue, adresseEssai: { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false, modifieLe: null, modifiePar: null, vu: null } } }) } });
  const h = heberge.html('#cbody');
  assert.ok(h.includes('boite@hebergeur.exemple') && h.includes('EMAIL_TEST_RECIPIENT'));
  assert.match(h, /id="essaiAdresse"[^>]*value=""/);
  const rien = await page({ reponses: { courriels: () => ({ code: 200, donnees: { ...vue, essai: { ...vue.essai, adresseDefinie: false }, adresseEssai: { adresse: null, source: null, ecartee: true, modifieLe: null, modifiePar: null, vu: null } } }) } });
  assert.ok(rien.html('#cbody').includes(CO.adresse.aucune(true)) && rien.html('#cbody').includes(CO.adresse.ecartee));
});

test('écran Courriels, Lecture seule ou Approbation : pas de champ, pas d\'adresse, seulement « définie » ou non', async () => {
  for (const role of ['lecture', 'approbation']) {
    const vue = await vueCourriels();
    const p = await page({ role, reponses: { courriels: () => ({ code: 200, donnees: vue }) } });
    const html = p.html('#cbody');
    assert.ok(!html.includes('essaiAdresse') && !html.includes('c-adresse'), role);
    assert.ok(html.includes(CO.essai.adresseDefinie), role);
    await p.saisir('essaiAdresse', 'pirate@exemple.org');
    await p.cliquer('c-adresse');
    assert.ok(!p.appels.some((a) => a.action === 'adresse-essai'), role);
    const sans = await page({ role, reponses: { courriels: () => ({ code: 200, donnees: { ...vue, essai: { ...vue.essai, adresseDefinie: false } } }) } });
    assert.ok(sans.html('#cbody').includes(CO.essai.sansAdresse(true)), role);
  }
});

test('écran Courriels : enregistrer l\'adresse envoie la saisie et la date vue ; l\'écran montre ce que le serveur a gardé ; refus et conflit sont dits', async () => {
  const vue = await vueCourriels({ adresseEssai: VUE_ADRESSE });
  let lectures = 0;
  let reponse = (corps) => ({ code: 200, donnees: { ok: true, adresseDefinie: true, adresseEssai: { ...VUE_ADRESSE, adresse: corps.adresse.trim(), modifieLe: '2026-11-26T15:00:00.000Z', vu: '2026-11-26T15:00:00.000Z' } } });
  const p = await page({ reponses: { courriels: () => { lectures += 1; return { code: 200, donnees: vue }; }, 'adresse-essai': (corps) => reponse(corps) } });
  await p.saisir('essaiAdresse', ' nouvelle@exemple.org ');
  await p.cliquer('c-adresse');
  assert.deepEqual(p.appels.find((a) => a.action === 'adresse-essai').corps, { adresse: ' nouvelle@exemple.org ', vu: '2026-11-20T10:00:00.000Z' });
  assert.equal(p.toast(), CO.adresse.enregistree);
  assert.match(p.html('#cbody'), /id="essaiAdresse"[^>]*value="nouvelle@exemple.org"/);
  // L'envoi suivant porte la date que le serveur vient de rendre.
  reponse = () => ({ code: 400, donnees: { code: 'invalide', erreurs: { adresse: 'Écrivez une seule adresse courriel.' } } });
  await p.saisir('essaiAdresse', 'pas une adresse');
  await p.cliquer('c-adresse');
  assert.equal(p.appels.filter((a) => a.action === 'adresse-essai')[1].corps.vu, '2026-11-26T15:00:00.000Z');
  assert.ok(p.html('#cbody').includes('Écrivez une seule adresse courriel.') && p.html('#cbody').includes('value="pas une adresse"'), 'la saisie et son erreur restent à l\'écran');
  // Une autre personne a changé l'adresse entre-temps : l'écran le dit et se recharge.
  reponse = () => ({ code: 409, donnees: { code: 'conflit' } });
  const avant = lectures;
  await p.cliquer('c-adresse');
  assert.equal(p.toast(), CO.adresse.conflit);
  assert.equal(lectures, avant + 1);
  reponse = () => ({ code: 403, donnees: { code: 'role' } });
  await p.saisir('essaiAdresse', 'a@b.ca');
  await p.cliquer('c-adresse');
  assert.equal(p.toast(), TEXTES.panneau.reserveAdministration);
  // Vider le champ : le serveur retire le réglage, l'écran le dit.
  const q = await page({ reponses: { courriels: () => ({ code: 200, donnees: vue }), 'adresse-essai': () => ({ code: 200, donnees: { ok: true, retiree: true, adresseDefinie: true, adresseEssai: { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false, modifieLe: null, modifiePar: null, vu: null } } }) } });
  await q.saisir('essaiAdresse', '');
  await q.cliquer('c-adresse');
  assert.deepEqual(q.appels.find((a) => a.action === 'adresse-essai').corps, { adresse: '', vu: '2026-11-20T10:00:00.000Z' });
  assert.equal(q.toast(), CO.adresse.retiree);
  assert.ok(q.html('#cbody').includes('boite@hebergeur.exemple'));
});

test('écran Courriels : les textes disent que l\'essai va à la personne qui essaie, même en mode d\'essai', async () => {
  assert.match(CO.essaiAide, /votre adresse/);
  assert.match(CO.essaiAide, /mode d’essai/);
  assert.match(CO.essai.aide, /M’envoyer un essai/);
  assert.ok(!Object.hasOwn(CO, 'essaiVersEssai') && !Object.hasOwn(CO, 'essaiSansAdresse'));
  const vue = await vueCourriels({ adresseEssai: VUE_ADRESSE });
  const p = await page({ reponses: { courriels: () => ({ code: 200, donnees: vue }), 'essai-courriel': () => ({ code: 200, donnees: { ok: true, envoye: true, simule: false } }) } });
  assert.ok(p.html('#cbody').includes(CO.essaiAide));
  await p.cliquer('c-essayer');
  assert.equal(p.toast(), CO.essaiEnvoye('tess@exemple.ca'));
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
  assert.ok(!source.includes('sans-adresse') && !source.includes('essaiVersEssai'));
  // Le bloc « Fixé à l'installation » renvoie à l'écran Courriels.
  assert.match(TEXTES.panneau.reglages.installation.adresseEssaiAide, /Courriels/);
  assert.ok(!SECRETS.some((s) => JSON.stringify(TEXTES.panneau).includes(s)));
});
