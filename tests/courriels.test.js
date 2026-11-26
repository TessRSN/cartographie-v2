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
  assert.equal(envois[0].from, 'Cartographie du RSN <cartographie@cartographie.rsn.quebec>');
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

// ─── Lot 4b : gabarits modifiables, mode d'essai réglé dans le panneau ───
const { creerReglages, CLES, COLONNES } = require('../lib/reglages');
const { fauxNotion } = require('./aides/faux-notion');
const G = require('../public/js/gabarits.js');

const BASE = 'base-reglages';
// Un banc avec une fausse base « Réglages ». reglages : { clé: valeur } déjà enregistrés ; brut : { clé: texte du bloc }.
function bancReglages({ env = {}, reglages = {}, brut = {}, pannes = {}, echec = false, sansBase = false } = {}) {
  const faux = fauxNotion({ pannes });
  const complet = { RESEND_API_KEY: 'cle', ...(sansBase ? {} : { NOTION_DB_REGLAGES: BASE }), ...env };
  const envois = []; const lignes = [];
  const journal = (...a) => lignes.push(a.join(' '));
  const poser = (cle, json) => {
    const id = `ligne-${cle}`;
    faux.pages.set(id, { id, parent: { database_id: BASE }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: cle } }] }, [COLONNES.modifieLe]: { date: { start: '2026-11-20T10:00:00.000Z' } }, [COLONNES.modifiePar]: { email: 'tess@exemple.ca' } } });
    faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
  };
  for (const [cle, valeur] of Object.entries(reglages)) poser(cle, JSON.stringify(valeur));
  for (const [cle, json] of Object.entries(brut)) poser(cle, json);
  const socle = creerReglages(faux.client, complet, { journal });
  const envoyeur = async (message) => { if (echec) throw new Error('Resend en panne'); envois.push(message); };
  const courriels = creerCourriels({ envoyeur, env: complet, journal, reglages: socle });
  return { courriels, envois, lignes, faux, socle };
}
// Les six courriels, chacun avec de quoi le remplir.
const LES_SIX = {
  lien: (c, a) => c.lienProposer({ a, lien: 'https://site/proposer?jeton=abc', nomFiche: 'CARTaGENE' }),
  recue: (c, a) => c.propositionRecue({ a, titre: 'Nouvelle : Outil X', destinataire: 'Pat' }),
  approuvee: (c, a) => c.approuvee({ a, nom: 'Outil X', lienFiche: 'https://site/ressource/outil-x', destinataire: 'Pat' }),
  refusee: (c, a) => c.refusee({ a, titre: 'Nouvelle : Outil X', commentaire: 'Le lien ne mène nulle part.', destinataire: 'Pat' }),
  panneau: (c, a) => c.lienPanneau({ a, lien: 'https://site/admin?jeton=abc', destinataire: 'Maxime' }),
  resume: (c, a) => c.resumeHebdomadaire({ a, propositions: [{ titre: 'Nouvelle : Outil X', proposeLe: '2026-11-20T15:00:00.000Z' }], lienPanneau: 'https://site/admin', destinataire: 'Maxime' }),
};
const ATTENDUS = {
  lien: { objet: 'Votre lien pour modifier la fiche CARTaGENE', contient: ['https://site/proposer?jeton=abc', 'modifier la fiche CARTaGENE', 'Ouvrir le formulaire', '24 heures'] },
  recue: { objet: 'Proposition reçue', contient: ['<strong>Nouvelle : Outil X</strong>', 'sera examinée'] },
  approuvee: { objet: 'Proposition approuvée : Outil X', contient: ['<strong>Outil X</strong>', 'https://site/ressource/outil-x', 'Voir la fiche', 'quelques minutes'] },
  refusee: { objet: 'Proposition non retenue : Nouvelle : Outil X', contient: ['<strong>Nouvelle : Outil X</strong>', '<em>Le lien ne mène nulle part.</em>', 'répondre à ce courriel'] },
  panneau: { objet: "Votre lien vers le panneau d'approbation", contient: ['https://site/admin?jeton=abc', 'Entrer dans le panneau', '1 heure'] },
  resume: { objet: '1 proposition à examiner dans la cartographie', contient: ['Nouvelle : Outil X', '20 novembre', 'https://site/admin', 'Ouvrir le panneau', 'une fois par semaine'] },
};

test('sans la base « Réglages », les six courriels d\'origine partent, avec les mêmes informations qu\'avant', async () => {
  for (const cas of [bancReglages({ sansBase: true }), (() => { const b = banc(); return { ...b, faux: null }; })()]) {
    for (const [id, envoyer] of Object.entries(LES_SIX)) {
      assert.deepEqual(await envoyer(cas.courriels, 'p@exemple.org'), { envoye: true }, id);
      const m = cas.envois.at(-1);
      assert.deepEqual(m.to, ['p@exemple.org'], id);
      assert.equal(m.subject, ATTENDUS[id].objet, id);
      for (const morceau of ATTENDUS[id].contient) assert.ok(m.html.replace(/&#39;/g, "'").includes(morceau), `${id} : ${morceau}`);
      assert.ok(m.html.includes('Cartographie du Réseau santé numérique') && m.html.includes('rsn.gestion@rimuhc.ca'), `${id} : l'enveloppe`);
      // Le courriel est exactement le gabarit d'origine, rempli.
      assert.ok(!/\{[^{}]*\}/.test(m.subject + m.html), `${id} : aucun repère ne reste`);
    }
    assert.equal(cas.envois.length, 6);
    if (cas.faux) assert.equal(cas.faux.appels.length, 0, 'Notion n\'est pas appelé');
  }
});

test('avec la base « Réglages » vide, rien ne change non plus', async () => {
  const b = bancReglages();
  for (const [id, envoyer] of Object.entries(LES_SIX)) {
    await envoyer(b.courriels, 'p@exemple.org');
    assert.equal(b.envois.at(-1).subject, ATTENDUS[id].objet, id);
  }
  // Une lecture des réglages pour la minute, et, le mode d'essai n'étant pas actif, une relecture de la base à chaque envoi.
  assert.equal(b.faux.de('databases.query').length, 1 + Object.keys(LES_SIX).length);
});

test('mode d\'essai réglé dans le panneau : il passe devant la variable de Vercel, dans les deux sens', async () => {
  // Panneau : actif. Vercel : arrêté. Tout va à l'adresse d'essai, et à elle seule.
  const actif = bancReglages({ env: { EMAIL_TEST_MODE: 'false', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, reglages: { [CLES.modeEssai]: true } });
  for (const envoyer of Object.values(LES_SIX)) assert.deepEqual(await envoyer(actif.courriels, 'vraie.personne@exemple.org'), { envoye: true, essai: true });
  assert.equal(actif.envois.length, 6);
  for (const m of actif.envois) {
    assert.deepEqual(m.to, ['essai@rsn.quebec']);
    assert.ok(m.subject.startsWith('[TEST → vraie.personne@exemple.org] '));
    assert.ok(!JSON.stringify([m.to, m.cc, m.bcc]).includes('vraie.personne'));
  }
  // Panneau : arrêté. Vercel : actif. Les courriels partent aux vraies personnes.
  const arrete = bancReglages({ env: { EMAIL_TEST_MODE: 'true', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, reglages: { [CLES.modeEssai]: false } });
  for (const envoyer of Object.values(LES_SIX)) assert.deepEqual(await envoyer(arrete.courriels, 'vraie.personne@exemple.org'), { envoye: true });
  for (const m of arrete.envois) {
    assert.deepEqual(m.to, ['vraie.personne@exemple.org']);
    assert.ok(!m.subject.includes('[TEST'));
    assert.ok(!JSON.stringify(m).includes('essai@rsn.quebec'));
  }
});

test('mode d\'essai : la décision est prise à chaque envoi', async () => {
  const b = bancReglages({ env: { EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' } });
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.deepEqual(b.envois[0].to, ['p@exemple.org']);
  await b.socle.ecrire(CLES.modeEssai, true, 'tess@exemple.ca');
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.deepEqual(b.envois[1].to, ['essai@rsn.quebec']);
  await b.socle.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.deepEqual(b.envois[2].to, ['p@exemple.org']);
});

test('mode d\'essai : une base illisible ne le lève pas', async () => {
  const panne = { 'databases.query': true };
  // Vercel dit « actif » : actif.
  const b = bancReglages({ env: { EMAIL_TEST_MODE: 'true', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, pannes: panne });
  await LES_SIX.approuvee(b.courriels, 'p@exemple.org');
  assert.deepEqual(b.envois[0].to, ['essai@rsn.quebec']);
  // Vercel ne dit rien : actif par précaution ; avec une adresse d'essai le courriel y va, sans elle rien ne part.
  const c = bancReglages({ env: { EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, pannes: panne });
  await LES_SIX.approuvee(c.courriels, 'p@exemple.org');
  assert.deepEqual(c.envois[0].to, ['essai@rsn.quebec']);
  const d = bancReglages({ pannes: panne });
  assert.deepEqual(await LES_SIX.approuvee(d.courriels, 'p@exemple.org'), { envoye: false });
  assert.equal(d.envois.length, 0);
  assert.ok(d.lignes.some((l) => l.includes("mode d'essai sans adresse d'essai")));
  // Vercel dit « arrêté », mais la base existe et ne se lit pas : le panneau a pu dire « actif », rien ne part au public.
  const f = bancReglages({ env: { EMAIL_TEST_MODE: 'false', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, pannes: panne });
  await LES_SIX.approuvee(f.courriels, 'p@exemple.org');
  assert.deepEqual(f.envois[0].to, ['essai@rsn.quebec']);
  assert.ok(f.envois[0].subject.endsWith(ATTENDUS.approuvee.objet), "avec le texte d'origine");
  // Un socle qui lèverait malgré tout ne fait pas échouer l'envoi, et ne lève pas le mode d'essai.
  const envois = [];
  const casse = creerCourriels({ envoyeur: async (m) => envois.push(m), env: { RESEND_API_KEY: 'cle', EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, journal: () => {}, reglages: { active: () => true, async lire() { throw new Error('cassé'); } } });
  assert.deepEqual(await LES_SIX.approuvee(casse, 'p@exemple.org'), { envoye: true, essai: true });
  assert.deepEqual(envois[0].to, ['essai@rsn.quebec']);
  assert.equal(envois[0].subject, `[TEST → p@exemple.org] ${ATTENDUS.approuvee.objet}`);
});

test('un gabarit modifié dans le panneau est utilisé', async () => {
  const b = bancReglages({ reglages: {
    'courriel.approuvee': { objet: 'En ligne : {ressource}', texte: 'Bonjour {nom},\n\nLa fiche {ressource} est en ligne.\n\n{lien}\n\nMerci.' },
    'courriel.refusee': { objet: 'Refus', texte: 'Bonjour {nom},\n\nMotif :\n{commentaire}' },
    'courriel.resume': { objet: 'Cette semaine : {nombre de propositions}', texte: 'Bonjour {nom},\n\n{lien}' },
  } });
  await LES_SIX.approuvee(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[0].subject, 'En ligne : Outil X');
  assert.ok(b.envois[0].html.includes('<p>Bonjour Pat,</p><p>La fiche <strong>Outil X</strong> est en ligne.</p>'));
  assert.ok(b.envois[0].html.includes('href="https://site/ressource/outil-x"'));
  assert.ok(!b.envois[0].html.includes('quelques minutes'), 'le texte d\'origine n\'est plus là');
  await LES_SIX.refusee(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[1].subject, 'Refus');
  assert.ok(b.envois[1].html.includes('<p>Motif :<br><em>Le lien ne mène nulle part.</em></p>'));
  await LES_SIX.resume(b.courriels, 'm@exemple.org');
  assert.equal(b.envois[2].subject, 'Cette semaine : 1 proposition');
  assert.ok(b.envois[2].html.includes('<p>Bonjour Maxime,</p><ul'), 'la liste reste ajoutée par le code');
  // Les autres courriels gardent leur texte d'origine.
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[3].subject, ATTENDUS.recue.objet);
});

test('un gabarit enregistré mais invalide ou illisible est ignoré : le texte d\'origine part, avec son lien', async () => {
  const b = bancReglages({
    reglages: {
      'courriel.approuvee': { objet: 'Sans lien', texte: 'Bravo, c\'est en ligne.' },
      'courriel.lien': { objet: 'O', texte: '{lien} {repère inventé}' },
      'courriel.refusee': { objet: 'O', texte: 'Refusé, sans dire pourquoi.' },
      'courriel.resume': 'pas un gabarit',
    },
    brut: { 'courriel.panneau': '{ ceci n\'est pas du JSON' },
  });
  for (const id of ['approuvee', 'lien', 'refusee', 'resume', 'panneau']) {
    await LES_SIX[id](b.courriels, 'p@exemple.org');
    const m = b.envois.at(-1);
    assert.equal(m.subject, ATTENDUS[id].objet, id);
    for (const morceau of ATTENDUS[id].contient) assert.ok(m.html.replace(/&#39;/g, "'").includes(morceau), `${id} : ${morceau}`);
    assert.ok(b.lignes.some((l) => l.includes('[courriel]') && l.includes(`« ${id} »`) && l.includes("texte d'origine")), `${id} : noté au journal du serveur`);
  }
  assert.equal(b.envois.length, 5);
});

test('échappement de bout en bout : nom de fiche, commentaire et texte de gabarit', async () => {
  const mechant = '<script>alert(1)</script>"><a href="https://piege.exemple">x</a>{lien}{nom}';
  const b = bancReglages({ reglages: {
    'courriel.refusee': { objet: 'Refus : {proposition}', texte: 'Bonjour <b>{nom}</b> <script>alert(2)</script> "><a href="https://piege.exemple">ici</a>,\n\n{proposition}\n\n{commentaire}' },
  } });
  await b.courriels.refusee({ a: 'p@exemple.org', titre: `Nouvelle : ${mechant}\r\nBcc: z@z.zz`, commentaire: `${mechant}\nDeuxième ligne`, destinataire: mechant });
  await b.courriels.approuvee({ a: 'p@exemple.org', nom: mechant, lienFiche: 'https://site/ressource/x', destinataire: mechant });
  await b.courriels.lienProposer({ a: 'p@exemple.org', lien: 'https://site/proposer?jeton=abc', nomFiche: mechant });
  await b.courriels.resumeHebdomadaire({ a: 'p@exemple.org', propositions: [{ titre: mechant }], lienPanneau: 'https://site/admin', destinataire: mechant });
  assert.equal(b.envois.length, 4);
  for (const m of b.envois) {
    assert.ok(!/<script|<b>|piege\.exemple"|href="https:\/\/piege/.test(m.html), m.subject);
    assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), m.subject);
    assert.ok(!/[\r\n]/.test(m.subject));
    // Les seuls liens : le bouton du courriel s'il en a un, et l'adresse de réponse.
    const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
    assert.ok(hrefs.every((h) => h.startsWith('https://site/') || h === 'mailto:rsn.gestion@rimuhc.ca'), hrefs.join(' '));
  }
  assert.ok(b.envois[0].html.includes('Deuxième ligne'));
  assert.ok(b.envois[0].html.includes('{lien}{nom}'), 'les accolades d\'une valeur restent des accolades');
});

test('le nom de la personne remplit {nom} quand il est connu, et ne laisse pas de trou sinon', async () => {
  const gabarit = { objet: 'Bonjour {nom}', texte: 'Bonjour {nom},\n\n{lien}' };
  const b = bancReglages({ reglages: { 'courriel.panneau': gabarit } });
  await b.courriels.lienPanneau({ a: 'p@exemple.org', lien: 'https://site/admin?jeton=abc', destinataire: 'Maxime Lafrenière' });
  await b.courriels.lienPanneau({ a: 'p@exemple.org', lien: 'https://site/admin?jeton=abc' });
  assert.equal(b.envois[0].subject, 'Bonjour Maxime Lafrenière');
  assert.ok(b.envois[0].html.includes('<p>Bonjour Maxime Lafrenière,</p>'));
  assert.equal(b.envois[1].subject, 'Bonjour');
  assert.ok(b.envois[1].html.includes('<p>Bonjour,</p>'));
});

test('« M\'envoyer un essai » : valeurs d\'exemple, « [ESSAI] » dans l\'objet, à l\'adresse donnée par le serveur', async () => {
  const b = bancReglages({ reglages: { 'courriel.approuvee': { objet: 'En ligne : {ressource}', texte: '{lien}' } } });
  for (const { id } of G.COURRIELS) {
    assert.deepEqual(await b.courriels.essai({ id, a: 'tess@exemple.ca', site: 'https://carto.exemple' }), { ok: true, envoye: true, simule: false }, id);
    const m = b.envois.at(-1);
    assert.deepEqual(m.to, ['tess@exemple.ca']);
    assert.ok(m.subject.startsWith('[ESSAI] '), id);
    assert.ok(!/\{[^{}]*\}/.test(m.subject + m.html), `${id} : rempli`);
  }
  assert.equal(b.envois[2].subject, '[ESSAI] En ligne : CARTaGENE', 'le texte en vigueur');
  assert.ok(b.envois[0].html.includes('href="https://carto.exemple/proposer?'));
  // Un brouillon pas encore enregistré peut être essayé ; invalide, il ne part pas.
  await b.courriels.essai({ id: 'recue', a: 'tess@exemple.ca', objet: 'Brouillon {nom}', texte: 'Texte du brouillon' });
  assert.equal(b.envois.at(-1).subject, '[ESSAI] Brouillon Sandrine');
  const avant = b.envois.length;
  const refus = await b.courriels.essai({ id: 'panneau', a: 'tess@exemple.ca', objet: 'O', texte: 'Sans lien' });
  assert.equal(refus.ok, false);
  assert.equal(refus.code, 'invalide');
  assert.match(refus.erreurs.texte, /\{lien\}/);
  assert.deepEqual(await b.courriels.essai({ id: 'inconnu', a: 'tess@exemple.ca' }), { ok: false, code: 'introuvable' });
  assert.deepEqual(await b.courriels.essai({ id: 'recue', a: '' }), { ok: false, code: 'envoi' });
  assert.equal(b.envois.length, avant);
});

test('« M\'envoyer un essai » ne suit pas le mode d\'essai : il part à la personne qui essaie, et dit ce qui s\'est passé', async () => {
  const essai = bancReglages({ env: { EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec' }, reglages: { [CLES.modeEssai]: true } });
  assert.deepEqual(await essai.courriels.essai({ id: 'recue', a: 'tess@exemple.ca' }), { ok: true, envoye: true, simule: false });
  assert.deepEqual(essai.envois[0].to, ['tess@exemple.ca']);
  assert.equal(essai.envois[0].subject, '[ESSAI] Proposition reçue');
  // Sans adresse d'essai non plus, l'essai n'est pas retenu : il ne passe pas par elle.
  const sansAdresse = bancReglages({ reglages: { [CLES.modeEssai]: true } });
  assert.deepEqual(await sansAdresse.courriels.essai({ id: 'recue', a: 'tess@exemple.ca' }), { ok: true, envoye: true, simule: false });
  assert.deepEqual(sansAdresse.envois[0].to, ['tess@exemple.ca']);
  const panne = bancReglages({ echec: true });
  assert.deepEqual(await panne.courriels.essai({ id: 'recue', a: 'tess@exemple.ca' }), { ok: false, code: 'envoi' });
  // Sans service d'envoi : simulé, comme tous les courriels.
  const lignes = [];
  const local = creerCourriels({ env: {}, journal: (...a) => lignes.push(a.join(' ')) });
  assert.deepEqual(await local.essai({ id: 'recue', a: 'tess@exemple.ca' }), { ok: true, envoye: false, simule: true });
  assert.ok(lignes.some((l) => l.includes('[courriel simulé]') && l.includes('[ESSAI]')));
});

test('la liste des six courriels pour le panneau : texte en vigueur, texte d\'origine, modifié ou non, par qui et quand', async () => {
  const modifie = { objet: 'Refus', texte: 'Motif :\n{commentaire}' };
  const b = bancReglages({ reglages: { 'courriel.refusee': modifie, 'courriel.approuvee': { objet: 'O', texte: 'Sans lien' } }, brut: { 'courriel.recue': 'illisible {' } });
  const vue = await b.courriels.lister();
  assert.equal(vue.base, true);
  assert.equal(vue.lus, true);
  assert.deepEqual(vue.liste.map((c) => c.id), ['lien', 'recue', 'approuvee', 'refusee', 'panneau', 'resume']);
  const de = (id) => vue.liste.find((c) => c.id === id);
  assert.deepEqual({ ...de('refusee'), reperes: null }, {
    id: 'refusee', nom: 'Proposition refusée', quand: 'Au refus, avec le commentaire', aQui: 'À la personne qui propose', bouton: null, reperes: null,
    objet: 'Refus', texte: 'Motif :\n{commentaire}', origine: G.origine('refusee'), modifie: true, ignore: null, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'tess@exemple.ca',
  });
  assert.deepEqual(de('refusee').reperes.map((r) => [r.repere, r.requis]), [['{nom}', false], ['{proposition}', false], ['{ressource}', false], ['{commentaire}', true]]);
  assert.ok(de('refusee').reperes.every((r) => r.aide));
  // Un texte enregistré mais écarté : l'écran montre le texte d'origine, et dit pourquoi.
  assert.deepEqual([de('approuvee').objet, de('approuvee').modifie, de('approuvee').ignore], [G.origine('approuvee').objet, false, 'invalide']);
  assert.deepEqual([de('recue').texte, de('recue').modifie, de('recue').ignore], [G.origine('recue').texte, false, 'illisible']);
  assert.deepEqual([de('lien').modifie, de('lien').ignore, de('lien').modifieLe, de('lien').modifiePar], [false, null, null, null]);
  // Sans base, ou base illisible : les textes d'origine, et l'écran sait pourquoi.
  const sans = await bancReglages({ sansBase: true }).courriels.lister();
  assert.deepEqual([sans.base, sans.lus, sans.liste.length, sans.liste.every((c) => !c.modifie && c.objet === c.origine.objet)], [false, true, 6, true]);
  const panne = await bancReglages({ pannes: { 'databases.query': true } }).courriels.lister();
  assert.deepEqual([panne.base, panne.lus, panne.liste.length], [true, false, 6]);
  const sansSocle = await creerCourriels({ env: {}, journal: () => {} }).lister();
  assert.deepEqual([sansSocle.base, sansSocle.lus, sansSocle.liste.length], [false, true, 6]);
});

test('enregistrer un gabarit : validé, rangé, écrit ; identique au texte d\'origine, il est retiré', async () => {
  const b = bancReglages();
  // Invalide : rien n'est écrit.
  const refus = await b.courriels.enregistrer({ id: 'approuvee', objet: 'O', texte: 'Sans lien', par: 'tess@exemple.ca' });
  assert.deepEqual([refus.ok, refus.code, Object.keys(refus.erreurs)], [false, 'invalide', ['texte']]);
  assert.deepEqual(await b.courriels.enregistrer({ id: 'inconnu', objet: 'O', texte: 'T', par: 'tess@exemple.ca' }), { ok: false, code: 'introuvable' });
  assert.equal(b.faux.de('pages.create').length, 0);
  // Valide : écrit, rangé, et utilisé au prochain envoi.
  assert.deepEqual(await b.courriels.enregistrer({ id: 'approuvee', objet: '  En ligne : {ressource} ', texte: 'Bravo.\r\n\r\n{lien}\r\n', par: 'tess@exemple.ca' }), { ok: true, nom: 'Proposition approuvée' });
  assert.deepEqual((await b.socle.lire('courriel.approuvee')).valeur, { objet: 'En ligne : {ressource}', texte: 'Bravo.\n\n{lien}' });
  assert.equal((await b.socle.lire('courriel.approuvee')).modifiePar, 'tess@exemple.ca');
  await LES_SIX.approuvee(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[0].subject, 'En ligne : Outil X');
  // Le même texte de nouveau : rien à écrire.
  const ecritures = () => b.faux.de('pages.create').length + b.faux.de('pages.update').length + b.faux.de('blocks.update').length;
  const avant = ecritures();
  assert.deepEqual(await b.courriels.enregistrer({ id: 'approuvee', objet: 'En ligne : {ressource}', texte: 'Bravo.\n\n{lien}', par: 'max@exemple.ca' }), { ok: true, nom: 'Proposition approuvée', inchange: true });
  assert.equal(ecritures(), avant);
  // Le texte d'origine, enregistré tel quel : le réglage est retiré plutôt que recopié.
  assert.deepEqual(await b.courriels.enregistrer({ ...G.origine('approuvee'), id: 'approuvee', par: 'tess@exemple.ca' }), { ok: true, nom: 'Proposition approuvée', retabli: true });
  assert.equal((await b.socle.lire('courriel.approuvee')).etat, 'absent');
  assert.deepEqual(await b.courriels.enregistrer({ ...G.origine('approuvee'), id: 'approuvee', par: 'tess@exemple.ca' }), { ok: true, nom: 'Proposition approuvée', retabli: true, inchange: true });
  // Sans la base : refusé, sans rien inventer.
  assert.deepEqual(await bancReglages({ sansBase: true }).courriels.enregistrer({ id: 'recue', objet: 'O', texte: 'T', par: 'tess@exemple.ca' }), { ok: false, code: 'reglages-absents' });
  assert.deepEqual(await creerCourriels({ env: {}, journal: () => {} }).enregistrer({ id: 'recue', objet: 'O', texte: 'T', par: 'tess@exemple.ca' }), { ok: false, code: 'reglages-absents' });
});

test('rétablir le texte d\'origine retire le réglage ; une panne d\'écriture remonte', async () => {
  const b = bancReglages({ reglages: { 'courriel.recue': { objet: 'Reçu', texte: 'Merci {nom}.' } } });
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[0].subject, 'Reçu');
  assert.deepEqual(await b.courriels.retablir({ id: 'recue', par: 'tess@exemple.ca' }), { ok: true, nom: 'Proposition reçue', retabli: true });
  await LES_SIX.recue(b.courriels, 'p@exemple.org');
  assert.equal(b.envois[1].subject, 'Proposition reçue');
  assert.deepEqual(await b.courriels.retablir({ id: 'recue', par: 'tess@exemple.ca' }), { ok: true, nom: 'Proposition reçue', retabli: true, inchange: true });
  assert.deepEqual(await b.courriels.retablir({ id: 'inconnu', par: 'tess@exemple.ca' }), { ok: false, code: 'introuvable' });
  assert.deepEqual(await bancReglages({ sansBase: true }).courriels.retablir({ id: 'recue', par: 'tess@exemple.ca' }), { ok: false, code: 'reglages-absents' });
  const panne = bancReglages({ pannes: { 'pages.create': true } });
  await assert.rejects(() => panne.courriels.enregistrer({ id: 'recue', objet: 'O', texte: 'T', par: 'tess@exemple.ca' }));
});

test('l\'état des envois, sans aucune valeur : service défini ou non, adresse d\'essai définie ou non', async () => {
  const b = bancReglages({ env: { EMAIL_TEST_RECIPIENT: 'essai@rsn.quebec', EMAIL_TEST_MODE: 'true' } });
  assert.deepEqual(await b.courriels.etat(), { service: true, essai: { actif: true, source: 'vercel' }, adresseEssai: true });
  assert.ok(!JSON.stringify(await b.courriels.etat()).includes('rsn.quebec'));
  assert.deepEqual(await creerCourriels({ env: {}, journal: () => {} }).etat(), { service: false, essai: { actif: false, source: 'vercel' }, adresseEssai: false });
});
