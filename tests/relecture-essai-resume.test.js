/**
 * Les corrections demandées par la relecture indépendante de « adresse d'essai dans le panneau » et
 * de « résumé des changements d'une sauvegarde » : confirmation avant de changer l'adresse d'essai,
 * dates comparées à la minute (Notion les rend ainsi, et en « +00:00 »), date de la copie de
 * comparaison gardée à la relecture, et quelques durcissements.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { banc, ADRESSE_ESSAI, TESS, MAX, LEA, ODILE } = require('./aides/banc-lot4b');
const { banc: banc4c } = require('./aides/banc-lot4c');
const { faussePage } = require('./aides/fausse-page');
const { adresseEssaiEnVigueur, adresseEssaiValide, memeInstant } = require('../lib/reglages');
const { creerCourriels } = require('../lib/courriels');
const { comparerCopies, resumeCourt, lireResume } = require('../lib/changements');
const sauvegardes = require('../lib/sauvegardes');
const { TEXTES } = require('../public/js/texte.js');

const CO = TEXTES.panneau.courriels;
const SV = TEXTES.panneau.sauvegardes;
const DU_PANNEAU = 'essais-du-panneau@exemple.net';
const VRAIE = 'vraie-personne@exemple.org';
const { COLONNES, FORMAT } = sauvegardes;

// ─── 1. Confirmation avant de changer l'adresse d'essai ───
test('adresse-essai : sans « confirme: true », le serveur refuse comme pour couper le mode d\'essai, et rien n\'est écrit', async () => {
  const b = banc({ reglages: { modeEssai: true, adresseEssai: DU_PANNEAU } });
  const vu = '2026-11-20T10:00:00.000Z';
  const coupure = await b.envoyer('mode-essai', { actif: false });
  for (const corps of [{ adresse: 'autre@exemple.org', vu }, { adresse: '', vu }, { adresse: 'autre@exemple.org', vu, confirme: false }, { adresse: 'autre@exemple.org', vu, confirme: 'true' }, { adresse: 'autre@exemple.org', vu, confirme: 1 }]) {
    const res = await b.envoyer('adresse-essai', corps);
    assert.deepEqual([res.code, res.corps], [coupure.code, coupure.corps], JSON.stringify(corps));
    assert.deepEqual([res.code, res.corps], [400, { code: 'confirmation' }]);
  }
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
  assert.equal(b.reglagesEcrits().adresseEssai, DU_PANNEAU);
  // Confirmée, l'adresse est enregistrée ; le retrait aussi.
  const oui = await b.envoyer('adresse-essai', { adresse: 'autre@exemple.org', vu, confirme: true });
  assert.deepEqual([oui.code, oui.corps.adresseEssai.adresse], [200, 'autre@exemple.org']);
  const retrait = await b.envoyer('adresse-essai', { adresse: '', vu: oui.corps.adresseEssai.vu, confirme: true });
  assert.deepEqual([retrait.code, retrait.corps.retiree], [200, true]);
});

const moi = () => ({ code: 200, donnees: { nom: 'Tess Berthier', courriel: 'tess@exemple.ca', role: 'administration', permis: { decider: true, administrer: true } } });
const PIEGE = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const VUE_ADRESSE = { adresse: DU_PANNEAU, source: 'panneau', ecartee: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier', vu: '2026-11-20T10:00:00.000Z' };
async function pageCourriels(reponseAdresse) {
  const liste = (await creerCourriels({ env: {}, journal: () => {} }).lister()).liste.map((c) => ({ ...c, quand: c.quand.replace('{jour}', 'lundi') }));
  const vue = { reglages: { actifs: true, lus: true }, essai: { actif: true, source: 'panneau', adresseDefinie: true, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' }, service: true, courriels: liste, adresseEssai: VUE_ADRESSE };
  const p = faussePage({ hash: '#courriels', reponses: { moi, courriels: () => ({ code: 200, donnees: vue }), 'adresse-essai': reponseAdresse } });
  await p.repos();
  return p;
}
const envoisAdresse = (p) => p.appels.filter((a) => a.action === 'adresse-essai');

test('le texte de la confirmation répète l\'adresse et dit que tous les courriels, liens d\'entrée compris, iront à elle', () => {
  const q = CO.adresse.question('nouvelle@exemple.org');
  assert.ok(q.includes('nouvelle@exemple.org'));
  assert.match(q, /tous les courriels/i);
  assert.match(q, /liens d’entrée dans le panneau/);
  assert.match(q, /mode d’essai est actif/);
  for (const texte of [q, CO.adresse.questionRetrait, CO.adresse.confirmer, CO.adresse.confirmerRetrait]) assert.ok(typeof texte === 'string' && texte && !texte.includes('—'));
  assert.match(CO.adresse.questionRetrait, /liens d’entrée dans le panneau/);
  assert.match(CO.adresse.questionRetrait, /Vercel/);
});

test('écran Courriels : « Enregistrer l\'adresse » pose d\'abord la question, qui répète l\'adresse saisie, échappée ; rien ne part avant le oui', async () => {
  const p = await pageCourriels((corps) => ({ code: 200, donnees: { ok: true, adresseDefinie: true, adresseEssai: { ...VUE_ADRESSE, adresse: corps.adresse.trim(), vu: '2026-11-26T15:00:00.000Z' } } }));
  // Confirmer sans que la question ait été posée ne fait rien.
  await p.cliquer('c-confirmer-adresse');
  assert.equal(envoisAdresse(p).length, 0);
  await p.saisir('essaiAdresse', ' nouvelle@exemple.org ');
  await p.cliquer('c-adresse');
  assert.equal(envoisAdresse(p).length, 0, 'un seul clic n\'enregistre plus');
  let html = p.html('#cbody');
  assert.ok(html.includes('id="confirmationAdresse"') && html.includes('data-act="c-confirmer-adresse"') && html.includes('data-act="c-annuler"'));
  assert.ok(html.includes(CO.adresse.question('nouvelle@exemple.org')), 'la question répète l\'adresse, sans les espaces autour');
  // Annuler : la question disparaît, rien n'est envoyé, la saisie reste.
  await p.cliquer('c-annuler');
  html = p.html('#cbody');
  assert.ok(!html.includes('confirmationAdresse') && html.includes('value=" nouvelle@exemple.org "'));
  assert.equal(envoisAdresse(p).length, 0);
  // Oui : la saisie part, avec la date vue et la confirmation.
  await p.cliquer('c-adresse');
  await p.cliquer('c-confirmer-adresse');
  assert.deepEqual(envoisAdresse(p).map((a) => a.corps), [{ adresse: ' nouvelle@exemple.org ', vu: '2026-11-20T10:00:00.000Z', confirme: true }]);
  assert.equal(p.toast(), CO.adresse.enregistree);
  assert.ok(!p.html('#cbody').includes('confirmationAdresse'));
  // Une saisie piégée est échappée dans la question.
  await p.saisir('essaiAdresse', PIEGE);
  await p.cliquer('c-adresse');
  html = p.html('#cbody').replace(/srcdoc="[^"]*"/g, '');
  assert.ok(html.includes('confirmationAdresse') && !/<script|<img/.test(html));
  // Changer la saisie après la question l'annule : ce qui est confirmé est ce qui a été montré.
  await p.saisir('essaiAdresse', 'autre@exemple.org');
  await p.cliquer('c-confirmer-adresse');
  assert.equal(envoisAdresse(p).length, 1);
});

test('écran Courriels : vider le champ demande aussi la confirmation, avec sa propre question', async () => {
  const p = await pageCourriels(() => ({ code: 200, donnees: { ok: true, retiree: true, adresseDefinie: true, adresseEssai: { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false, modifieLe: null, modifiePar: null, vu: null } } }));
  await p.saisir('essaiAdresse', '  ');
  await p.cliquer('c-adresse');
  assert.equal(envoisAdresse(p).length, 0);
  assert.ok(p.html('#cbody').includes(CO.adresse.questionRetrait) && p.html('#cbody').includes(CO.adresse.confirmerRetrait));
  await p.cliquer('c-confirmer-adresse');
  assert.deepEqual(envoisAdresse(p).map((a) => a.corps), [{ adresse: '  ', vu: '2026-11-20T10:00:00.000Z', confirme: true }]);
  assert.equal(p.toast(), CO.adresse.retiree);
});

// ─── 2. Les dates se comparent à la minute ───
test('memeInstant : deux dates valent la même si elles tombent dans la même minute, quelle que soit leur forme ; une valeur illisible ne vaut jamais « égal »', () => {
  assert.equal(memeInstant('2026-11-26T15:04:05.123Z', '2026-11-26T15:04:00.000+00:00'), true);
  assert.equal(memeInstant('2026-11-26T15:04:00.000+00:00', '2026-11-26T10:04:59-05:00'), true);
  assert.equal(memeInstant('2026-11-26T15:04:05.123Z', '2026-11-26T15:05:00.000+00:00'), false);
  assert.equal(memeInstant('2026-11-26T15:04:05.123Z', '2026-11-26T15:03:59.999Z'), false);
  // Rien des deux côtés : pas de ligne, et l'écran n'en avait pas vu.
  for (const [a, b] of [[null, null], [undefined, null], ['', null], [null, '']]) assert.equal(memeInstant(a, b), true);
  for (const [a, b] of [[null, '2026-11-26T15:04:00.000Z'], ['2026-11-26T15:04:00.000Z', null], ['pas une date', 'pas une date'], ['x', null], ['2026-11-26T15:04:00.000Z', 'x'], [12, 12], [{}, {}]]) {
    assert.equal(memeInstant(a, b), false, JSON.stringify([a, b]));
  }
});

test('adresse-essai : un second enregistrement sans recharger n\'est pas un conflit, avec des dates rendues comme le vrai Notion', async () => {
  const b = banc({ datesCommeNotion: true, reglages: { modeEssai: true } });
  const une = await b.envoyer('adresse-essai', { adresse: DU_PANNEAU, vu: null, confirme: true });
  assert.equal(une.code, 200);
  // Le serveur vient d'écrire une date à la seconde ; Notion la rendra à la minute, en « +00:00 ».
  assert.match(une.corps.adresseEssai.vu, /T\d\d:\d\d:\d\d/);
  const deux = await b.envoyer('adresse-essai', { adresse: 'seconde@exemple.org', vu: une.corps.adresseEssai.vu, confirme: true });
  assert.deepEqual([deux.code, deux.corps.adresseEssai && deux.corps.adresseEssai.adresse], [200, 'seconde@exemple.org']);
  // La date que rend l'écran rechargé passe aussi.
  const relu = (await b.lire('courriels')).corps.adresseEssai.vu;
  assert.equal((await b.envoyer('adresse-essai', { adresse: 'troisieme@exemple.org', vu: relu, confirme: true })).code, 200);
  // Écrite par une autre instance, à la seconde et en « Z » : la même minute que celle que Notion rend.
  const c = banc({ datesCommeNotion: true, reglages: { adresseEssai: DU_PANNEAU } });
  c.faux.pages.get('ligne-adresseEssai').properties['Modifié le'].date.start = '2026-11-20T10:00:05.123Z';
  assert.equal((await c.envoyer('adresse-essai', { adresse: 'autre@exemple.org', vu: '2026-11-20T10:00:05.123Z', confirme: true })).code, 200);
  // Un vrai changement fait par une autre personne reste un conflit.
  for (const vu of [null, '2026-11-01T10:00:00.000Z', 'pas une date']) {
    const res = await b.envoyer('adresse-essai', { adresse: 'pirate@exemple.org', vu, confirme: true });
    assert.deepEqual([res.code, res.corps], [409, { code: 'conflit' }], String(vu));
  }
  assert.equal(b.reglagesEcrits().adresseEssai, 'troisieme@exemple.org');
});

test('enregistrer-reglages : un second enregistrement sans recharger n\'est pas un conflit non plus', async () => {
  const b = banc4c({ datesCommeNotion: true });
  const une = await b.envoyer('enregistrer-reglages', { conditions: 'Premières conditions.', vu: { conditions: null } });
  assert.equal(une.code, 200);
  const deux = await b.envoyer('enregistrer-reglages', { conditions: 'Secondes conditions.', vu: { conditions: une.corps.reglages.vu.conditions } });
  assert.equal(deux.code, 200, JSON.stringify(deux.corps));
  // Une autre instance du serveur a écrit à la seconde et en « Z », et l'écran garde cette date ; celle-ci
  // relit la base, où Notion rend la même date à la minute et en « +00:00 » : ce n'est pas un conflit.
  const c = banc4c({ datesCommeNotion: true });
  c.poser('conditions', '"Conditions posées."');
  c.faux.pages.get('ligne-conditions').properties['Modifié le'].date.start = '2026-11-20T10:00:05.123Z';
  const trois = await c.envoyer('enregistrer-reglages', { conditions: 'Conditions de plus.', vu: { conditions: '2026-11-20T10:00:05.123Z' } });
  assert.equal(trois.code, 200, JSON.stringify(trois.corps));
  assert.equal(c.reglagesEcrits().conditions, 'Conditions de plus.');
  // Une date d'une autre minute reste un conflit.
  const vieux = await b.envoyer('enregistrer-reglages', { conditions: 'Troisièmes.', vu: { conditions: '2026-11-01T10:00:00.000Z' } });
  assert.deepEqual([vieux.code, vieux.corps.code, vieux.corps.champs], [409, 'conflit', ['conditions']]);
  const illisible = await b.envoyer('enregistrer-reglages', { conditions: 'Troisièmes.', vu: { conditions: 'pas une date' } });
  assert.equal(illisible.code, 409);
});

// ─── 3. La date de la copie de comparaison survit à la relecture ───
test('lireResume et comparerCopies : une date en « +00:00 » est acceptée et rendue normalisée, en « Z »', () => {
  const lu = lireResume(JSON.stringify({ etat: 'compare', depuis: '2026-11-26T15:04:00.000+00:00', partiel: false, bases: {} }));
  assert.equal(lu.depuis, '2026-11-26T15:04:00.000Z');
  assert.equal(lireResume('{"etat":"compare","depuis":"2026-11-26T10:04:00-05:00","bases":{}}').depuis, '2026-11-26T15:04:00.000Z');
  assert.equal(lireResume('{"etat":"compare","depuis":"2026-11-26T15:04:05.123Z","bases":{}}').depuis, '2026-11-26T15:04:05.123Z');
  for (const sale of ['2026-11-26', '26 novembre 2026', '2026-13-45T99:99:00.000+00:00', '<script>', 12, null]) {
    assert.equal(lireResume(JSON.stringify({ etat: 'compare', depuis: sale, bases: {} })).depuis, null, String(sale));
  }
  const vide = { format: FORMAT, version: 1, incomplete: false, bases: {} };
  assert.equal(comparerCopies(vide, vide, { depuis: '2026-11-19T13:00:00.000+00:00' }).depuis, '2026-11-19T13:00:00.000Z');
});

test('de bout en bout, avec des dates rendues comme le vrai Notion : la liste relue garde la date de la copie de comparaison', async () => {
  const b = banc4c({ datesCommeNotion: true });
  await b.sauvegardes.faire({ par: TESS });
  b.horloge.instant += 3 * 86400000;
  const deux = await b.sauvegardes.faire({ par: TESS });
  const liste = await b.sauvegardes.lister({ par: TESS });
  assert.match(liste.copies[1].faiteLe, /\+00:00$/, 'le banc rend bien les dates comme Notion');
  const attendue = new Date(liste.copies[1].faiteLe).toISOString();
  assert.equal(deux.changements.depuis, attendue);
  assert.deepEqual(liste.copies.map((c) => c.changements && c.changements.depuis), [attendue, undefined]);
  // Et par la route, telle que l'écran la reçoit.
  const vue = await b.lire('sauvegardes');
  assert.equal(vue.corps.copies[0].changements.depuis, attendue);
  assert.equal(SV.changements(vue.corps.copies[0].changements, '26 novembre').startsWith('Aucun changement depuis la copie du 26 novembre'), true);
});

// ─── 4. Mineurs ───
test('essai : le module relit le rôle lui-même, Administration exigée', async () => {
  const b = banc({ reglages: { modeEssai: false } });
  for (const a of [MAX, LEA, ODILE, 'inconnue@exemple.org']) assert.deepEqual(await b.courriels.essai({ id: 'recue', a }), { ok: false, code: 'role' }, a);
  assert.equal(b.envois.length, 0);
  assert.deepEqual(await b.courriels.essai({ id: 'recue', a: TESS }), { ok: true, envoye: true, simule: false });
  // Un module assemblé sans de quoi relire les rôles n'envoie pas d'essai.
  const sansRoles = creerCourriels({ envoyeur: async () => { throw new Error('ne doit pas partir'); }, env: b.env, journal: () => {}, reglages: b.socle });
  assert.deepEqual(await sansRoles.essai({ id: 'recue', a: TESS }), { ok: false, code: 'role' });
});

test('adresseEssaiValide refuse les caractères invisibles et de contrôle ; la variable EMAIL_TEST_RECIPIENT passe par la même validation', async () => {
  for (const cache of ['\u007f', '\u0080', '\u0085', '\u009f', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f', '\ufeff']) {
    for (const saisie of [`a${cache}@b.ca`, `a@b${cache}.ca`, `${cache}a@b.ca`, `a@b.ca${cache}`]) assert.equal(adresseEssaiValide(saisie), null, `U+${cache.charCodeAt(0).toString(16)} dans ${JSON.stringify(saisie)}`);
  }
  assert.equal(adresseEssaiValide(' Essais@Exemple.NET '), 'essais@exemple.net');
  // La variable de Vercel : normalisée si elle vaut, sinon aucune adresse.
  assert.deepEqual(adresseEssaiEnVigueur({ etat: 'absent' }, { EMAIL_TEST_RECIPIENT: ' Boite@Hebergeur.Exemple ' }), { adresse: 'boite@hebergeur.exemple', source: 'vercel', ecartee: false });
  for (const variable of ['pas une adresse', 'a@b.ca, c@d.ca', 'Tess <a@b.ca>', 'a\u200b@b.ca', 'a@b.ca\nBcc: x@y.z']) {
    assert.deepEqual(adresseEssaiEnVigueur({ etat: 'absent' }, { EMAIL_TEST_RECIPIENT: variable }), { adresse: null, source: null, ecartee: false }, variable);
    // En mode d'essai, rien ne part : ni à la variable mal formée, ni à la vraie personne.
    const b = banc({ env: { EMAIL_TEST_RECIPIENT: variable }, reglages: { modeEssai: true } });
    assert.deepEqual(await b.courriels.propositionRecue({ a: VRAIE, titre: 'Nouvelle : X' }), { envoye: false }, variable);
    assert.equal(b.envois.length, 0);
    assert.equal((await b.lire('courriels', {}, LEA)).corps.essai.adresseDefinie, false);
  }
});

test('adresse-essai : le serveur exige « vu », que la page envoie toujours', async () => {
  const b = banc({ reglages: { adresseEssai: DU_PANNEAU } });
  for (const corps of [{ adresse: 'autre@exemple.org', confirme: true }, { adresse: '', confirme: true }, { adresse: 'autre@exemple.org', vu: undefined, confirme: true }]) {
    const res = await b.envoyer('adresse-essai', corps);
    assert.equal(res.code, 400, JSON.stringify(corps));
    assert.notEqual(res.corps.code, 'confirmation');
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.reglagesEcrits().adresseEssai, DU_PANNEAU);
  // Le module, appelé sans « vu », refuse aussi : il n'écrit jamais sans savoir ce que l'écran avait lu.
  assert.deepEqual(await b.courriels.reglerAdresseEssai({ adresse: 'autre@exemple.org', par: TESS }), { ok: false, code: 'conflit' });
  assert.equal(b.ecritures(), 0);
});

test('des copies existent mais aucune n\'est complète : « aucune copie complète à comparer », pas « première copie »', async () => {
  const colonne = (b, id) => JSON.parse(b.faux.pages.get(id).properties[COLONNES.changements].rich_text.map((s) => s.text.content).join(''));
  const b = banc4c();
  const incomplete = b.poserCopie({ faiteLe: new Date(Date.parse('2026-11-20T13:00:00.000Z')).toISOString() });
  b.faux.pages.get(incomplete).properties[COLONNES.titre].title[0].text.content += ' (incomplète)';
  b.poserCopie({ faiteLe: '2026-11-13T13:00:00.000Z', fichier: [] });
  const retour = await b.sauvegardes.faire({ par: TESS });
  assert.deepEqual([retour.ok, retour.changements], [true, { etat: 'sans-reference' }]);
  assert.deepEqual(colonne(b, retour.id), { etat: 'sans-reference' });
  assert.deepEqual(b.copies().find((c) => c.id === retour.id).contenu.changements, { etat: 'sans-reference' });
  assert.equal(b.fichiers.appels.filter((a) => a.nom === 'telecharger').length, 0);
  assert.deepEqual((await b.sauvegardes.lister({ par: TESS })).copies[0].changements, { etat: 'sans-reference' });
  // Une base vraiment vide reste une première copie.
  assert.deepEqual((await banc4c().sauvegardes.faire({ par: TESS })).changements, { etat: 'premiere' });
  assert.deepEqual(lireResume('{"etat":"sans-reference","bases":{"x":1}}'), { etat: 'sans-reference' });
  assert.deepEqual(resumeCourt({ etat: 'sans-reference', noms: {} }), { etat: 'sans-reference' });
  assert.equal(SV.changements({ etat: 'sans-reference' }, ''), 'Aucune copie complète à comparer.');
  assert.match(SV.changements({ etat: 'premiere' }, ''), /Première copie/);
});

test('la comparaison n\'est plus tentée quand la copie a déjà pris trente secondes', () => {
  assert.equal(sauvegardes.DUREE_AVANT_COMPARAISON_MS, 30000);
});

test('écran Courriels : la variable se dit partout « dans les réglages de Vercel », jamais « chez l\'hébergeur »', () => {
  const textes = [CO.essai.sansAdresse(true), CO.essai.sansAdresse(false), CO.essai.deVercel, CO.adresse.aide, CO.adresse.deVercel('a@b.ca'), CO.adresse.aucune(true), CO.adresse.retiree, CO.adresse.question('a@b.ca'), CO.adresse.questionRetrait, CO.sansBase];
  for (const texte of textes) assert.ok(!/hébergeur/.test(texte), texte);
  for (const texte of [CO.essai.sansAdresse(true), CO.essai.sansAdresse(false), CO.adresse.deVercel('a@b.ca')]) assert.ok(texte.includes('dans les réglages de Vercel (variable EMAIL_TEST_RECIPIENT)'), texte);
  assert.match(CO.adresse.aide, /réglages de Vercel/);
  assert.match(CO.adresse.retiree, /réglages de Vercel/);
  assert.ok(!ADRESSE_ESSAI.includes('Vercel'));
});
