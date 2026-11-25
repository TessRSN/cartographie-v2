const test = require('node:test');
const assert = require('node:assert/strict');
const { creerCourriels } = require('../lib/courriels');

function banc(env = {}, { echec = false } = {}) {
  const envois = []; const lignes = [];
  const envoyeur = async (message) => { if (echec) throw new Error('Resend en panne'); envois.push(message); };
  const courriels = creerCourriels({ envoyeur, env: { RESEND_API_KEY: 'cle', ...env }, journal: (...a) => lignes.push(a.join(' ')) });
  return { courriels, envois, lignes };
}

test("l'expéditeur et l'adresse de réponse sont ceux de la cartographie", async () => {
  const { courriels, envois } = banc();
  const retour = await courriels.lienProposer({ a: 'p@exemple.org', lien: 'https://site/proposer?jeton=abc' });
  assert.deepEqual(retour, { envoye: true });
  assert.equal(envois[0].from, 'Cartographie du RSN <ne-pas-repondre@cartographie.rsn.quebec>');
  assert.equal(envois[0].replyTo, 'rsn.gestion@rimuhc.ca');
  assert.deepEqual(envois[0].to, ['p@exemple.org']);
  assert.equal(envois[0].subject, 'Votre lien pour proposer une ressource');
  assert.ok(envois[0].html.includes('https://site/proposer?jeton=abc'));
  assert.ok(envois[0].html.includes('24 heures'));
});

test("l'expéditeur suit les réglages", async () => {
  const { courriels, envois } = banc({ RESEND_FROM_NAME: 'Essai', RESEND_FROM_EMAIL: 'x@y.quebec' });
  await courriels.lienPanneau({ a: 'p@exemple.org', lien: 'https://site/admin?jeton=abc' });
  assert.equal(envois[0].from, 'Essai <x@y.quebec>');
});

test("le lien pour modifier nomme la fiche", async () => {
  const { courriels, envois } = banc();
  await courriels.lienProposer({ a: 'p@exemple.org', lien: 'https://site/x', nomFiche: 'CARTaGENE' });
  assert.equal(envois[0].subject, 'Votre lien pour modifier la fiche CARTaGENE');
});

test("en mode d'essai, tout part vers l'adresse d'essai", async () => {
  const { courriels, envois } = banc({ EMAIL_TEST_MODE: 'true', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' });
  await courriels.resumeHebdomadaire({ a: 'a@exemple.org', propositions: [{ titre: 'Nouvelle : X' }], lienPanneau: 'https://site/admin' });
  assert.deepEqual(envois[0].to, ['essai@rsn.quebec']);
  assert.equal(envois[0].subject, '[TEST → a@exemple.org] 1 proposition à examiner dans la cartographie');
});

test("en mode d'essai sans adresse d'essai, rien ne part", async () => {
  const { courriels, envois } = banc({ EMAIL_TEST_MODE: 'true' });
  assert.deepEqual(await courriels.propositionRecue({ a: 'p@exemple.org', titre: 'Nouvelle : X' }), { envoye: false });
  assert.equal(envois.length, 0);
});

test('sans clé Resend, le courriel est simulé et le lien va au journal', async () => {
  const lignes = [];
  const courriels = creerCourriels({ env: {}, journal: (...a) => lignes.push(a.join(' ')) });
  const retour = await courriels.lienProposer({ a: 'p@exemple.org', lien: 'https://site/proposer?jeton=abc' });
  assert.deepEqual(retour, { envoye: false, simule: true });
  assert.ok(lignes.some((l) => l.includes('https://site/proposer?jeton=abc') && l.includes('p@exemple.org')));
});

test('sans destinataire, rien ne part', async () => {
  const { courriels, envois } = banc();
  assert.deepEqual(await courriels.resumeHebdomadaire({ a: '', propositions: [{ titre: 'X' }], lienPanneau: 'https://site/admin' }), { envoye: false });
  assert.equal(envois.length, 0);
});

test('une panne de Resend ne lève pas', async () => {
  const { courriels, lignes } = banc({}, { echec: true });
  assert.deepEqual(await courriels.approuvee({ a: 'p@exemple.org', nom: 'X', lienFiche: 'https://site/ressource/x' }), { envoye: false });
  assert.ok(lignes.some((l) => l.includes('Resend en panne')));
});

test('le texte saisi est échappé dans le courriel', async () => {
  const { courriels, envois } = banc();
  await courriels.refusee({ a: 'p@exemple.org', titre: 'Nouvelle : <b>X</b>', commentaire: '<script>alert(1)</script>\nDeuxième ligne' });
  assert.ok(!envois[0].html.includes('<script>'));
  assert.ok(!envois[0].html.includes('<b>X</b>'));
  assert.ok(envois[0].html.includes('&lt;script&gt;'));
  assert.ok(envois[0].html.includes('Deuxième ligne'));
});

test("un saut de ligne dans un titre ne passe pas dans l'objet", async () => {
  const { courriels, envois } = banc();
  await courriels.propositionRecue({ a: 'p@exemple.org', titre: 'Nouvelle : X\r\nBcc: z@z.zz' });
  assert.ok(!/[\r\n]/.test(envois[0].subject));
});

test('le courriel d\'approbation donne le lien et prévient du délai', async () => {
  const { courriels, envois } = banc();
  await courriels.approuvee({ a: 'p@exemple.org', nom: 'X', lienFiche: 'https://site/ressource/x' });
  assert.ok(envois[0].html.includes('https://site/ressource/x'));
  assert.ok(envois[0].html.includes('quelques minutes'));
});

test('aucun courriel ne contient de tiret cadratin', async () => {
  const { courriels, envois } = banc();
  await courriels.lienProposer({ a: 'p@e.org', lien: 'https://s/x' });
  await courriels.propositionRecue({ a: 'p@e.org', titre: 'T' });
  await courriels.resumeHebdomadaire({ a: 'p@e.org', propositions: [{ titre: 'T' }], lienPanneau: 'https://s/admin' });
  await courriels.approuvee({ a: 'p@e.org', nom: 'N', lienFiche: 'https://s/r' });
  await courriels.refusee({ a: 'p@e.org', titre: 'T', commentaire: 'C' });
  await courriels.lienPanneau({ a: 'p@e.org', lien: 'https://s/admin' });
  assert.equal(envois.length, 6);
  for (const m of envois) assert.ok(!/—/.test(m.subject + m.html), m.subject);
});

test('le résumé hebdomadaire liste les propositions en attente et mène au panneau', async () => {
  const { courriels, envois } = banc();
  const retour = await courriels.resumeHebdomadaire({
    a: 'p@exemple.org', lienPanneau: 'https://site/admin',
    propositions: [{ titre: 'Nouvelle : Outil <b>X</b>', proposeLe: '2026-11-20T15:00:00.000Z' }, { titre: 'Modification : CARTaGENE', proposeLe: '2026-11-24T15:00:00.000Z' }],
  });
  assert.deepEqual(retour, { envoye: true });
  assert.deepEqual(envois[0].to, ['p@exemple.org']);
  assert.equal(envois[0].subject, '2 propositions à examiner dans la cartographie');
  assert.ok(envois[0].html.includes('Nouvelle : Outil &lt;b&gt;X&lt;/b&gt;'));
  assert.ok(!envois[0].html.includes('<b>X</b>'));
  assert.ok(envois[0].html.includes('Modification : CARTaGENE'));
  assert.ok(envois[0].html.includes('https://site/admin'));
  assert.ok(envois[0].html.includes('20 novembre'));
});

test('sans proposition en attente, le résumé ne part pas', async () => {
  const { courriels, envois } = banc();
  assert.deepEqual(await courriels.resumeHebdomadaire({ a: 'p@exemple.org', propositions: [], lienPanneau: 'https://site/admin' }), { envoye: false });
  assert.equal(envois.length, 0);
});
