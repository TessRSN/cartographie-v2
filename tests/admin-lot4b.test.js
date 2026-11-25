const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { banc, requete, temoin, SECRETS, ADRESSE_ESSAI, TESS, MAX, LEA, ODILE } = require('./aides/banc-lot4b');
const G = require('../public/js/gabarits.js');
const { GESTES } = require('../lib/journal');

const IDS = ['lien', 'recue', 'approuvee', 'refusee', 'panneau', 'resume'];
const BON = { id: 'approuvee', objet: 'En ligne : {ressource}', texte: 'Bravo {nom} !\n\n{lien}\n\nMerci.' };
// Les quatre écritures du lot, chacune avec un corps valide.
const ECRITURES = {
  'enregistrer-courriel': BON,
  'retablir-courriel': { id: 'approuvee' },
  'essai-courriel': { id: 'approuvee' },
  'mode-essai': { actif: false, confirme: true },
};
const sansSecret = (b) => {
  for (const { action, res } of b.vues) {
    const brut = JSON.stringify(res.corps) + JSON.stringify(res.entetes);
    for (const interdit of SECRETS) assert.ok(!brut.includes(interdit), `${action} : ${interdit}`);
  }
};

// ─── Lire l'écran ───
test('courriels : les six courriels, l\'état du mode d\'essai et d\'où il vient, pour tous les rôles', async () => {
  const b = banc({ env: { EMAIL_TEST_MODE: 'true' }, reglages: { 'courriel.refusee': { objet: 'Refus', texte: 'Motif :\n{commentaire}' } } });
  for (const qui of [TESS, MAX, LEA]) {
    const res = await b.lire('courriels', {}, qui);
    assert.equal(res.code, 200, qui);
    assert.equal(res.entetes['Cache-Control'], 'no-store');
    assert.deepEqual(Object.keys(res.corps).sort(), ['courriels', 'essai', 'reglages', 'service']);
    assert.deepEqual(res.corps.reglages, { actifs: true, lus: true });
    assert.deepEqual(res.corps.essai, { actif: true, source: 'vercel', adresseDefinie: true, modifieLe: null, modifiePar: null });
    assert.equal(res.corps.service, true);
    assert.deepEqual(res.corps.courriels.map((c) => c.id), IDS);
    for (const c of res.corps.courriels) {
      assert.deepEqual(Object.keys(c).sort(), ['aQui', 'bouton', 'id', 'ignore', 'modifie', 'modifieLe', 'modifiePar', 'nom', 'objet', 'origine', 'quand', 'reperes', 'texte']);
      assert.deepEqual(c.origine, G.origine(c.id));
      assert.ok(c.reperes.length && c.reperes.every((r) => r.repere && r.aide && typeof r.requis === 'boolean'), c.id);
      assert.ok(!c.quand.includes('{'), c.id);
    }
    const refusee = res.corps.courriels.find((c) => c.id === 'refusee');
    // « Modifié par » : le nom de la personne, jamais son courriel.
    assert.deepEqual([refusee.objet, refusee.texte, refusee.modifie, refusee.modifieLe, refusee.modifiePar], ['Refus', 'Motif :\n{commentaire}', true, '2026-11-20T10:00:00.000Z', 'Tess Berthier']);
    assert.ok(!JSON.stringify(res.corps).includes('@exemple.ca'), 'aucun courriel de l\'équipe');
    assert.equal(res.corps.courriels.find((c) => c.id === 'resume').quand, 'Chaque lundi, s’il y a des propositions en attente');
  }
  sansSecret(b);
});

test('courriels : l\'écran relit la base à chaque ouverture, sans attendre la minute de mémoire', async () => {
  const b = banc();
  assert.equal((await b.lire('courriels')).corps.courriels.find((c) => c.id === 'recue').modifie, false);
  b.poser('courriel.recue', JSON.stringify({ objet: 'Reçu', texte: 'Merci.' }), MAX);
  const recue = (await b.lire('courriels')).corps.courriels.find((c) => c.id === 'recue');
  assert.deepEqual([recue.objet, recue.modifie, recue.modifiePar], ['Reçu', true, 'Maxime Lafrenière']);
});

test('courriels : le mode d\'essai réglé dans le panneau dit par qui et quand ; une personne partie reste un nom ou rien', async () => {
  const b = banc({ env: { EMAIL_TEST_MODE: 'true' }, reglages: { modeEssai: false } });
  assert.deepEqual((await b.lire('courriels', {}, LEA)).corps.essai, { actif: false, source: 'panneau', adresseDefinie: true, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' });
  const c = banc();
  c.poser('modeEssai', 'true', ODILE);
  c.poser('courriel.recue', JSON.stringify({ objet: 'Reçu', texte: 'Merci.' }), 'inconnue@exemple.org');
  const res = await c.lire('courriels');
  assert.equal(res.corps.essai.modifiePar, 'Odile Charbonneau', 'une personne retirée garde son nom');
  assert.equal(res.corps.courriels.find((x) => x.id === 'recue').modifiePar, null);
  assert.ok(!JSON.stringify(res.corps).includes('inconnue@'));
});

test('courriels sans la base « Réglages » : les textes d\'origine, le mode d\'essai selon Vercel, et l\'écran le sait', async () => {
  for (const [variable, actif] of [['true', true], ['false', false], [undefined, false]]) {
    const b = banc({ sansBase: true, env: variable === undefined ? {} : { EMAIL_TEST_MODE: variable } });
    const res = await b.lire('courriels');
    assert.equal(res.code, 200);
    assert.deepEqual(res.corps.reglages, { actifs: false, lus: true });
    assert.deepEqual(res.corps.essai, { actif, source: 'vercel', adresseDefinie: true, modifieLe: null, modifiePar: null });
    assert.ok(res.corps.courriels.every((c) => !c.modifie && !c.ignore && c.objet === c.origine.objet && c.texte === c.origine.texte));
    assert.equal(b.faux.de('databases.query').filter((a) => a.database_id === 'base-reglages').length, 0);
    assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, actif);
    // Aucune écriture possible : la page le dit, le serveur le refuse.
    for (const [action, corps] of [['enregistrer-courriel', BON], ['retablir-courriel', { id: 'approuvee' }], ['mode-essai', { actif: true }], ['mode-essai', { actif: false, confirme: true }]]) {
      const refus = await b.envoyer(action, corps);
      assert.deepEqual([refus.code, refus.corps.code], [409, 'reglages-absents'], action);
    }
    assert.equal(b.ecritures(), 0);
    assert.deepEqual(b.journalEcrit(), []);
  }
});

test('courriels avec une base « Réglages » illisible : l\'écran s\'affiche, et le mode d\'essai ne se lève pas tout seul', async () => {
  const panne = { 'databases.query': (a) => a.database_id === 'base-reglages' };
  const b = banc({ pannesNotion: panne });
  const res = await b.lire('courriels');
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.reglages, { actifs: true, lus: false });
  assert.deepEqual(res.corps.essai, { actif: true, source: 'precaution', adresseDefinie: true, modifieLe: null, modifiePar: null });
  assert.equal(res.corps.courriels.length, 6);
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, true);
  assert.deepEqual((await banc({ pannesNotion: panne, env: { EMAIL_TEST_MODE: 'false' } }).lire('courriels')).corps.essai.actif, false);
  sansSecret(b);
});

test('courriels : un texte enregistré mais invalide est montré comme écarté, avec le texte d\'origine', async () => {
  const b = banc({ reglages: { 'courriel.panneau': { objet: 'O', texte: 'Sans lien' } } });
  const panneau = (await b.lire('courriels')).corps.courriels.find((c) => c.id === 'panneau');
  assert.deepEqual([panneau.modifie, panneau.ignore, panneau.texte, panneau.modifiePar], [false, 'invalide', G.origine('panneau').texte, 'Tess Berthier']);
});

// ─── Enregistrer et rétablir ───
test('enregistrer-courriel : validé, écrit dans « Réglages », noté au journal sans le texte, utilisé au prochain envoi', async () => {
  const b = banc();
  const res = await b.envoyer('enregistrer-courriel', { ...BON, objet: `  ${BON.objet} `, texte: `${BON.texte}\r\n` });
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['courriel', 'ok']);
  assert.deepEqual([res.corps.courriel.id, res.corps.courriel.objet, res.corps.courriel.texte, res.corps.courriel.modifie, res.corps.courriel.modifiePar], ['approuvee', BON.objet, BON.texte, true, 'Tess Berthier']);
  assert.ok(res.corps.courriel.modifieLe);
  assert.deepEqual(b.reglagesEcrits(), { 'courriel.approuvee': { objet: BON.objet, texte: BON.texte } });
  assert.deepEqual(b.journalEcrit(), [{ geste: 'Courriel modifié', par: TESS, sur: 'Proposition approuvée', phrase: 'a modifié le courriel « Proposition approuvée »' }]);
  assert.ok(!JSON.stringify(b.journalEcrit()).includes('Bravo'), 'le texte n\'est pas recopié au journal');
  await b.courriels.approuvee({ a: 'pat@exemple.org', nom: 'Outil X', lienFiche: 'https://carto.exemple/ressource/outil-x', destinataire: 'Pat' });
  assert.equal(b.envois[0].subject, 'En ligne : Outil X');
  assert.ok(b.envois[0].html.includes('<p>Bravo Pat !</p>'));
  // L'écran relu montre le texte enregistré.
  const relu = (await b.lire('courriels', {}, LEA)).corps.courriels.find((c) => c.id === 'approuvee');
  assert.deepEqual([relu.objet, relu.modifie, relu.modifiePar], [BON.objet, true, 'Tess Berthier']);
  // Le même texte de nouveau : rien n'est écrit, rien n'est noté.
  const avant = b.ecritures();
  const encore = await b.envoyer('enregistrer-courriel', BON);
  assert.deepEqual([encore.code, encore.corps.ok, encore.corps.inchange], [200, true, true]);
  assert.equal(b.ecritures(), avant);
  assert.equal(b.journalEcrit().length, 1);
  sansSecret(b);
});

test('enregistrer-courriel : un texte invalide est refusé avec ses erreurs, et rien n\'est écrit ni noté', async () => {
  const b = banc();
  const cas = [
    [{ id: 'approuvee', objet: 'O', texte: 'Sans lien' }, 'texte', /\{lien\}/],
    [{ id: 'refusee', objet: 'O', texte: 'Sans raison' }, 'texte', /\{commentaire\}/],
    [{ id: 'recue', objet: 'O {inconnu}', texte: 'T' }, 'objet', /\{inconnu\}/],
    [{ id: 'recue', objet: 'O', texte: 'T {commentaire}' }, 'texte', /\{commentaire\}/],
    [{ id: 'recue', objet: 'o'.repeat(201), texte: 'T' }, 'objet', /200/],
    [{ id: 'recue', objet: 'O', texte: 't'.repeat(5001) }, 'texte', /5/],
    [{ id: 'recue', objet: '  ', texte: 'T' }, 'objet', /objet/],
    [{ id: 'panneau', objet: 'Voici {lien}', texte: '{lien}' }, 'objet', /\{lien\}/],
  ];
  for (const [corps, champ, attendu] of cas) {
    const res = await b.envoyer('enregistrer-courriel', corps);
    assert.deepEqual([res.code, res.corps.code], [400, 'invalide'], JSON.stringify(corps).slice(0, 60));
    assert.match(res.corps.erreurs[champ], attendu);
  }
  // Un corps qui n'a pas la forme attendue, ou démesuré : illisible.
  for (const corps of [{}, { id: 'recue' }, { id: 'recue', objet: 'O' }, { id: 'recue', objet: 1, texte: 'T' }, { id: ['recue'], objet: 'O', texte: 'T' }, { id: 'recue', objet: 'O', texte: 't'.repeat(20001) }, { id: 'recue', objet: 'o'.repeat(1001), texte: 'T' }]) {
    assert.equal((await b.envoyer('enregistrer-courriel', corps)).code, 400);
  }
  const inconnu = await b.envoyer('enregistrer-courriel', { id: 'inconnu', objet: 'O', texte: 'T' });
  assert.deepEqual([inconnu.code, inconnu.corps.code], [404, 'introuvable']);
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
});

test('retablir-courriel : le réglage est retiré, le texte d\'origine repart, et le geste est noté', async () => {
  const b = banc({ reglages: { 'courriel.recue': { objet: 'Reçu', texte: 'Merci.' } } });
  const res = await b.envoyer('retablir-courriel', { id: 'recue' });
  assert.equal(res.code, 200);
  assert.deepEqual([res.corps.ok, res.corps.retabli, res.corps.courriel.objet, res.corps.courriel.modifie, res.corps.courriel.modifiePar], [true, true, 'Proposition reçue', false, null]);
  assert.deepEqual(b.reglagesEcrits(), {});
  assert.deepEqual(b.journalEcrit(), [{ geste: 'Courriel rétabli', par: TESS, sur: 'Proposition reçue', phrase: 'a rétabli le texte d\'origine du courriel « Proposition reçue »' }]);
  await b.courriels.propositionRecue({ a: 'pat@exemple.org', titre: 'Nouvelle : X' });
  assert.equal(b.envois[0].subject, 'Proposition reçue');
  // Rien à rétablir : rien n'est noté.
  const encore = await b.envoyer('retablir-courriel', { id: 'recue' });
  assert.deepEqual([encore.code, encore.corps.inchange], [200, true]);
  assert.equal(b.journalEcrit().length, 1);
  assert.equal((await b.envoyer('retablir-courriel', { id: 'inconnu' })).code, 404);
  assert.equal((await b.envoyer('retablir-courriel', {})).code, 400);
  // Enregistrer le texte d'origine tel quel revient à rétablir.
  const c = banc({ reglages: { 'courriel.recue': { objet: 'Reçu', texte: 'Merci.' } } });
  const origine = await c.envoyer('enregistrer-courriel', { id: 'recue', ...G.origine('recue') });
  assert.deepEqual([origine.code, origine.corps.retabli, origine.corps.courriel.modifie], [200, true, false]);
  assert.deepEqual(c.reglagesEcrits(), {});
  assert.deepEqual(c.journalEcrit().map((l) => l.geste), ['Courriel rétabli']);
});

// ─── M'envoyer un essai ───
test('essai-courriel : le courriel ne part qu\'à la personne connectée, même si le corps donne une autre adresse', async () => {
  const b = banc();
  const piege = { a: 'victime@exemple.org', courriel: 'victime@exemple.org', to: ['victime@exemple.org'], destinataire: 'victime@exemple.org', par: 'victime@exemple.org' };
  for (const id of IDS) {
    const res = await b.envoyer('essai-courriel', { id, ...piege });
    assert.deepEqual([res.code, res.corps], [200, { ok: true, envoye: true, simule: false, essai: false }], id);
    const m = b.envois.at(-1);
    assert.deepEqual(m.to, [TESS], id);
    assert.ok(m.subject.startsWith('[ESSAI] '), id);
    assert.ok(!JSON.stringify(m).includes('victime'), id);
  }
  assert.equal(b.envois.length, 6);
  assert.ok(b.envois[0].html.includes('href="https://carto.exemple/proposer?'), 'les liens d\'exemple sont ceux du site');
  // La limite est comptée au nom de la personne connectée.
  assert.deepEqual(b.demandesDEssai, Array.from({ length: 6 }, () => ({ courriel: TESS })));
  // Un essai n'est pas un changement : rien au journal, rien dans les réglages.
  assert.deepEqual(b.journalEcrit(), []);
  assert.equal(b.ecritures(), 0);
  sansSecret(b);
});

test('essai-courriel : un brouillon pas encore enregistré peut être essayé, et un brouillon invalide ne part pas', async () => {
  const b = banc({ reglages: { 'courriel.approuvee': { objet: 'Enregistré : {ressource}', texte: '{lien}' } } });
  await b.envoyer('essai-courriel', { id: 'approuvee' });
  assert.equal(b.envois[0].subject, '[ESSAI] Enregistré : CARTaGENE', 'sans brouillon : le texte en vigueur');
  await b.envoyer('essai-courriel', BON);
  assert.equal(b.envois[1].subject, '[ESSAI] En ligne : CARTaGENE');
  assert.ok(b.envois[1].html.includes('<p>Bravo Sandrine !</p>'));
  assert.deepEqual(b.reglagesEcrits()['courriel.approuvee'].objet, 'Enregistré : {ressource}', 'essayer n\'enregistre rien');
  const refus = await b.envoyer('essai-courriel', { id: 'approuvee', objet: 'O', texte: 'Sans lien <script>' });
  assert.deepEqual([refus.code, refus.corps.code], [400, 'invalide']);
  assert.match(refus.corps.erreurs.texte, /\{lien\}/);
  assert.equal((await b.envoyer('essai-courriel', { id: 'inconnu' })).code, 404);
  for (const corps of [{}, { id: 12 }, { id: 'recue', objet: 4 }, { id: 'recue', objet: 'O', texte: 't'.repeat(20001) }]) assert.equal((await b.envoyer('essai-courriel', corps)).code, 400);
  assert.equal(b.envois.length, 2);
});

test('essai-courriel : au-delà de la limite, rien ne part', async () => {
  const b = banc({ essaisPermis: (n) => n <= 2 });
  assert.equal((await b.envoyer('essai-courriel', { id: 'recue' })).code, 200);
  assert.equal((await b.envoyer('essai-courriel', { id: 'recue' })).code, 200);
  const res = await b.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([res.code, res.corps.code], [429, 'limite']);
  assert.equal(b.envois.length, 2);
  // Un courriel inconnu ou un corps illisible n'entame pas la limite.
  await b.envoyer('essai-courriel', { id: 'inconnu' });
  await b.envoyer('essai-courriel', {});
  assert.equal(b.demandesDEssai.length, 3);
});

test('essai-courriel en mode d\'essai : il va à l\'adresse d\'essai, et la réponse le dit sans la donner', async () => {
  const b = banc({ reglages: { modeEssai: true } });
  const res = await b.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([res.code, res.corps], [200, { ok: true, envoye: true, simule: false, essai: true }]);
  assert.deepEqual(b.envois[0].to, [ADRESSE_ESSAI]);
  assert.equal(b.envois[0].subject, `[TEST → ${TESS}] [ESSAI] Proposition reçue`);
  sansSecret(b);
  // Mode d'essai sans adresse d'essai : rien ne peut partir, et la réponse dit pourquoi.
  const sans = banc({ env: { EMAIL_TEST_RECIPIENT: '' }, reglages: { modeEssai: true } });
  const refus = await sans.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([refus.code, refus.corps.code, sans.envois.length], [409, 'sans-adresse', 0]);
  // Service d'envoi en panne : 502, sans détail technique.
  const panne = banc({ echecEnvoi: true });
  const echec = await panne.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([echec.code, echec.corps.code], [502, 'envoi']);
  assert.ok(!JSON.stringify(echec.corps).includes('Resend'));
  // Sans service d'envoi (poste local) : simulé.
  const local = banc({ sansService: true });
  const simule = await local.envoyer('essai-courriel', { id: 'recue' });
  assert.deepEqual([simule.code, simule.corps], [200, { ok: true, envoye: false, simule: true, essai: false }]);
  assert.equal((await local.lire('courriels')).corps.service, false);
});

// ─── Le mode d'essai ───
test('mode-essai : le couper demande une confirmation explicite dans le corps', async () => {
  const b = banc({ env: { EMAIL_TEST_MODE: 'true' } });
  for (const corps of [{ actif: false }, { actif: false, confirme: false }, { actif: false, confirme: 'oui' }, { actif: false, confirme: 1 }]) {
    const res = await b.envoyer('mode-essai', corps);
    assert.deepEqual([res.code, res.corps.code], [400, 'confirmation'], JSON.stringify(corps));
  }
  for (const corps of [{}, { actif: 'false', confirme: true }, { actif: null }, { actif: 0, confirme: true }]) assert.equal((await b.envoyer('mode-essai', corps)).code, 400, JSON.stringify(corps));
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, true, 'toujours actif');
  await b.courriels.propositionRecue({ a: 'pat@exemple.org', titre: 'Nouvelle : X' });
  assert.deepEqual(b.envois[0].to, [ADRESSE_ESSAI]);
});

test('mode-essai : coupé avec confirmation, les courriels partent aux vraies personnes ; réactivé, ils retournent à l\'adresse d\'essai', async () => {
  const b = banc({ env: { EMAIL_TEST_MODE: 'true' } });
  const coupe = await b.envoyer('mode-essai', { actif: false, confirme: true });
  assert.deepEqual([coupe.code, coupe.corps], [200, { ok: true, actif: false, source: 'panneau' }]);
  assert.deepEqual(b.reglagesEcrits(), { modeEssai: false });
  assert.deepEqual(b.journalEcrit(), [{ geste: "Mode d'essai changé", par: TESS, sur: 'Courriels', phrase: "a coupé le mode d'essai des courriels : ils partent aux vraies personnes" }]);
  await b.courriels.propositionRecue({ a: 'pat@exemple.org', titre: 'Nouvelle : X' });
  assert.deepEqual(b.envois[0].to, ['pat@exemple.org']);
  // L'accueil, l'écran « Courriels » et l'invitation disent la valeur en vigueur.
  assert.equal((await b.lire('accueil', {}, LEA)).corps.envois.essaiCourriels, false);
  const etat = (await b.lire('courriels', {}, LEA)).corps.essai;
  assert.deepEqual([etat.actif, etat.source, etat.modifiePar], [false, 'panneau', 'Tess Berthier']);
  const invitation = await b.envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia', role: 'lecture' });
  assert.equal(invitation.code, 200);
  assert.ok(!Object.hasOwn(invitation.corps, 'essai'));
  assert.deepEqual(b.envois[1].to, ['nadia@exemple.org']);
  // Le même réglage de nouveau : rien n'est écrit, rien n'est noté.
  const avant = b.ecritures();
  const encore = await b.envoyer('mode-essai', { actif: false, confirme: true });
  assert.deepEqual([encore.code, encore.corps], [200, { ok: true, actif: false, source: 'panneau', inchange: true }]);
  assert.equal(b.ecritures(), avant);
  // Réactivé : sans confirmation, et tout retourne à l'adresse d'essai.
  const reactive = await b.envoyer('mode-essai', { actif: true });
  assert.deepEqual([reactive.code, reactive.corps], [200, { ok: true, actif: true, source: 'panneau' }]);
  assert.deepEqual(b.reglagesEcrits(), { modeEssai: true });
  assert.deepEqual(b.journalEcrit().filter((l) => l.geste === "Mode d'essai changé").map((l) => l.phrase), [
    "a coupé le mode d'essai des courriels : ils partent aux vraies personnes",
    "a activé le mode d'essai des courriels : ils vont tous à l'adresse d'essai",
  ]);
  await b.courriels.propositionRecue({ a: 'pat@exemple.org', titre: 'Nouvelle : X' });
  assert.deepEqual(b.envois.at(-1).to, [ADRESSE_ESSAI]);
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, true);
  const seconde = await b.envoyer('inviter', { courriel: 'omar@exemple.org', nom: 'Omar', role: 'lecture' });
  assert.equal(seconde.corps.essai, true);
  assert.deepEqual(b.envois.at(-1).to, [ADRESSE_ESSAI]);
  sansSecret(b);
});

test('mode-essai : activé dans le panneau alors que Vercel ne dit rien', async () => {
  const b = banc();
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, false);
  assert.equal((await b.envoyer('mode-essai', { actif: true })).code, 200);
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, true);
  assert.deepEqual((await b.lire('courriels')).corps.essai.source, 'panneau');
});

// ─── Rôles, session, origine ───
test('chaque écriture du lot est réservée à l\'Administration : Approbation et Lecture seule sont refusées', async () => {
  for (const qui of [MAX, LEA]) {
    const b = banc({ env: { EMAIL_TEST_MODE: 'true' }, reglages: { 'courriel.approuvee': { objet: 'Avant', texte: '{lien}' } } });
    for (const [action, corps] of Object.entries(ECRITURES)) {
      const res = await b.envoyer(action, corps, qui);
      assert.deepEqual([res.code, res.corps.code], [403, 'role'], `${qui} ${action}`);
    }
    assert.equal(b.ecritures(), 0, qui);
    assert.equal(b.envois.length, 0, qui);
    assert.equal(b.demandesDEssai.length, 0, qui);
    assert.deepEqual(b.journalEcrit(), []);
    assert.deepEqual(b.reglagesEcrits(), { 'courriel.approuvee': { objet: 'Avant', texte: '{lien}' } });
    assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, true);
  }
});

test('une personne retirée de l\'équipe, ou sans session, n\'a accès à rien du lot', async () => {
  const b = banc();
  assert.equal((await b.lire('courriels', {}, ODILE)).code, 401);
  assert.equal((await b.appeler(requete('GET', 'courriels', { cookie: null }))).code, 401);
  assert.equal((await b.lire('courriels', {}, 'intrus@exemple.org')).code, 401);
  for (const [action, corps] of Object.entries(ECRITURES)) {
    for (const cookie of [temoin(ODILE), temoin('intrus@exemple.org'), null]) {
      const res = await b.appeler(requete('POST', action, { body: corps, cookie }));
      assert.deepEqual([res.code, res.corps.code], [401, 'session'], action);
    }
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.envois.length, 0);
});

test('les actions du lot : la bonne méthode, et tout envoi doit venir du site lui-même, en JSON', async () => {
  const b = banc();
  assert.equal((await b.appeler(requete('POST', 'courriels', { body: {} }))).code, 405);
  for (const [action, corps] of Object.entries(ECRITURES)) {
    assert.equal((await b.appeler(requete('GET', action))).code, 405, action);
    const ailleurs = await b.appeler(requete('POST', action, { body: corps, headers: { origin: 'https://attaquant.exemple' } }));
    assert.equal(ailleurs.code, 403, action);
    const formulaire = await b.appeler(requete('POST', action, { body: corps, headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
    assert.equal(formulaire.code, 403, action);
    const sansOrigine = await b.appeler(requete('POST', action, { body: corps, headers: { origin: undefined } }));
    assert.equal(sansOrigine.code, 403, action);
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.envois.length, 0);
  for (const { res } of b.vues.filter((v) => v.res.code !== 405 && v.res.code !== 403)) assert.equal(res.entetes['Cache-Control'], 'no-store');
});

test('une panne de Notion à l\'écriture : 502 sans détail technique, rien de noté', async () => {
  const b = banc({ pannesNotion: { 'pages.create': (a) => a.parent.database_id === 'base-reglages' } });
  for (const [action, corps] of [['enregistrer-courriel', BON], ['mode-essai', { actif: true }]]) {
    const res = await b.envoyer(action, corps);
    assert.deepEqual([res.code, res.corps.code], [502, 'notion'], action);
    assert.ok(!/pages\.create|en panne|Notion/.test(JSON.stringify(res.corps)), action);
  }
  assert.deepEqual(b.journalEcrit(), []);
  assert.equal((await b.lire('accueil')).corps.envois.essaiCourriels, false, 'le mode d\'essai n\'a pas changé');
});

test('sans le journal de l\'équipe, les gestes du lot se font quand même', async () => {
  const b = banc({ sansJournal: true });
  assert.equal((await b.envoyer('enregistrer-courriel', BON)).code, 200);
  assert.equal((await b.envoyer('mode-essai', { actif: true })).code, 200);
  assert.deepEqual(b.reglagesEcrits(), { 'courriel.approuvee': { objet: BON.objet, texte: BON.texte }, modeEssai: true });
});

test('aucune réponse du lot ne porte l\'adresse d\'essai ni un secret, quel que soit le chemin', async () => {
  const b = banc({ env: { EMAIL_TEST_MODE: 'true' }, reglages: { 'courriel.recue': { objet: 'Reçu', texte: 'Merci.' } } });
  await b.lire('courriels'); await b.lire('accueil');
  await b.envoyer('enregistrer-courriel', BON); await b.envoyer('enregistrer-courriel', { id: 'approuvee', objet: 'O', texte: 'x' });
  await b.envoyer('retablir-courriel', { id: 'recue' });
  await b.envoyer('essai-courriel', { id: 'panneau' });
  await b.envoyer('mode-essai', { actif: false }); await b.envoyer('mode-essai', { actif: false, confirme: true }); await b.envoyer('mode-essai', { actif: true });
  await b.envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia', role: 'lecture' });
  await b.envoyer('mode-essai', { actif: true }, MAX);
  assert.ok(b.vues.length >= 11);
  sansSecret(b);
});

// ─── Le journal et l'assemblage ───
test('les gestes du lot existent dans le journal, et la page leur donne une couleur', () => {
  for (const geste of ['Courriel modifié', 'Courriel rétabli', "Mode d'essai changé"]) assert.ok(GESTES.includes(geste), geste);
  const page = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
  assert.match(page, /'Mode d\\'essai changé': 'warn'/);
});

test('les réglages sont branchés sur les vrais modules, et leur base est un réglage documenté', () => {
  const assemblage = fs.readFileSync(path.join(__dirname, '..', 'lib', 'contributions.js'), 'utf8');
  assert.match(assemblage, /creerReglages\(client, env\)/);
  assert.match(assemblage, /creerCourriels\(\{ env, reglages \}\)/);
  assert.match(assemblage, /creerEquipe\(\{[^}]*\breglages\b/);
  assert.match(assemblage, /assemblage = \{[^}]*\breglages\b/);
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.match(readme, /`NOTION_DB_REGLAGES`/);
  // /api/export ne gagne aucun champ : il ne connaît pas les réglages.
  assert.ok(!/reglages|Réglages/.test(fs.readFileSync(path.join(__dirname, '..', 'api', 'export.js'), 'utf8')));
});

// ─── La page ───
const lirePublic = (...morceaux) => fs.readFileSync(path.join(__dirname, '..', 'public', ...morceaux), 'utf8');

test('la page : l\'écran « Courriels » est dans la barre latérale, et ses actions sont appelées', () => {
  const source = lirePublic('js', 'admin.js');
  const { TEXTES } = require('../public/js/texte.js');
  assert.match(source, /const ROUTES = \[[^\]]*'courriels'/);
  assert.equal(TEXTES.panneau.routes.courriels, 'Courriels');
  assert.match(source, /courriels: 'courriels'/, 'la route lit l\'action « courriels »');
  for (const action of ['enregistrer-courriel', 'retablir-courriel', 'essai-courriel', 'mode-essai']) assert.ok(source.includes(`'${action}'`), action);
  // Les fonctions partagées sont chargées avant le script de la page.
  const html = lirePublic('admin.html');
  assert.ok(html.indexOf('/js/gabarits.js') > html.indexOf('/js/texte.js') && html.indexOf('/js/gabarits.js') < html.indexOf('/js/admin.js'));
  assert.match(source, /window\.Gabarits/);
});

test('la page : chaque texte de l\'écran « Courriels » que le script demande existe, sans tiret cadratin', () => {
  const source = lirePublic('js', 'admin.js');
  const { TEXTES } = require('../public/js/texte.js');
  const demandes = [...source.matchAll(/\bCO\.([A-Za-z]+(?:\.[A-Za-z]+)*)/g)].map((m) => m[1]);
  assert.ok(demandes.length > 25);
  for (const chemin of new Set(demandes)) {
    let v = TEXTES.panneau.courriels;
    for (const cle of chemin.split('.')) {
      if (typeof v === 'function' || typeof v === 'string') break;
      assert.ok(v && Object.hasOwn(v, cle), `TEXTES.panneau.courriels.${chemin}`);
      v = v[cle];
    }
  }
  const textes = JSON.stringify(TEXTES.panneau.courriels, (cle, v) => (typeof v === 'function' ? v('a', 'b', 'c') : v));
  assert.ok(!/—/.test(textes));
});

test('la page : couper le mode d\'essai passe par une confirmation qui dit que les courriels iront aux vraies personnes', () => {
  const source = lirePublic('js', 'admin.js');
  const CO = require('../public/js/texte.js').TEXTES.panneau.courriels;
  assert.match(CO.essai.question, /vraies personnes/);
  assert.match(source, /CO\.essai\.question/);
  // « confirme: true » ne part que du bouton de la confirmation.
  assert.equal((source.match(/confirme: true/g) || []).length, 1);
  assert.match(source, /act === 'c-couper-essai'[^\n]*confirme: true/);
  // Sans la base « Réglages », l'écran dit pourquoi rien ne se modifie.
  assert.match(CO.sansBase, /Réglages/);
  assert.match(source, /CO\.sansBase/);
});

test('la page : l\'aperçu est fait par la fonction partagée, dans un cadre sans scripts', () => {
  const source = lirePublic('js', 'admin.js');
  assert.match(source, /Gabarits\.rendre\(/);
  assert.match(source, /Gabarits\.enveloppe\(/);
  const cadre = /<iframe class="apercu-courriel"[^>]*>/.exec(source);
  assert.ok(cadre, 'le cadre de l\'aperçu');
  assert.match(cadre[0], /sandbox=""/);
  assert.ok(!/allow-scripts|allow-same-origin/.test(cadre[0]));
  assert.match(cadre[0], /srcdoc="\$\{e\(/, 'le contenu du cadre est échappé dans son attribut');
  // La page ne recopie pas le rendu : ni bouton ni paragraphe de courriel fabriqués ici.
  assert.ok(!/Si le bouton ne fonctionne pas/.test(source));
});

test('la page : la saisie d\'un courriel est protégée (départ de la page, session expirée, envoi en cours)', () => {
  const source = lirePublic('js', 'admin.js');
  assert.match(source, /function saisieCourriels\(\)/);
  assert.match(source, /beforeunload[^\n]*saisieCourriels\(\)/);
  assert.match(source, /if \(saisieCourriels\(\)\) \{ message\(CO\.sessionExpiree\); return; \}/);
  assert.match(source, /if \(co\.enCours\) return/);
});
