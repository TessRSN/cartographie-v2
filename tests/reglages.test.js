const test = require('node:test');
const assert = require('node:assert/strict');
const { creerReglages, modeEssaiEnVigueur, cleCourriel, CLES, COLONNES } = require('../lib/reglages');
const { fauxNotion } = require('./aides/faux-notion');

const BASE = 'base-reglages';
const ENV = { NOTION_DB_REGLAGES: BASE };
const T0 = Date.parse('2026-11-25T15:00:00.000Z');

function banc({ env = ENV, pannes = {} } = {}) {
  const faux = fauxNotion({ pannes });
  const lignes = [];
  const horloge = { t: T0 };
  const reglages = creerReglages(faux.client, env, { maintenant: () => horloge.t, journal: (...a) => lignes.push(a.join(' ')) });
  const pages = () => [...faux.pages.values()].filter((p) => p.parent.database_id === BASE);
  const lectures = () => faux.de('databases.query').length;
  return { faux, reglages, lignes, horloge, pages, lectures, avancer: (ms) => { horloge.t += ms; } };
}
const texte = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.text.content).join('');
const bloc = (b, pageId) => b.faux.blocs.get(pageId).map((x) => x.code.rich_text.map((s) => s.text.content).join(''));
// Pose une ligne directement dans la fausse base, comme si une autre instance l'avait écrite.
function poser(b, cle, json, { le = '2026-11-20T10:00:00.000Z', par = 'tess@exemple.ca', id = `posee-${cle}-${le}` } = {}) {
  b.faux.pages.set(id, { id, parent: { database_id: BASE }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: cle } }] }, [COLONNES.modifieLe]: { date: { start: le } }, [COLONNES.modifiePar]: { email: par } } });
  b.faux.blocs.set(id, json === null ? [] : [{ id: `${id}-bloc`, type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
  return id;
}

// ─── Le mode d'essai : la table de vérité ───
test("mode d'essai, table de vérité : le panneau d'abord, puis Vercel, et actif quand rien n'est connu", () => {
  const cas = [
    // [lecture du réglage, EMAIL_TEST_MODE, actif attendu, d'où vient la décision]
    [{ etat: 'present', valeur: true }, 'true', true, 'panneau'],
    [{ etat: 'present', valeur: true }, 'false', true, 'panneau'],
    [{ etat: 'present', valeur: true }, undefined, true, 'panneau'],
    [{ etat: 'present', valeur: false }, 'true', false, 'panneau'],
    [{ etat: 'present', valeur: false }, 'false', false, 'panneau'],
    [{ etat: 'present', valeur: false }, undefined, false, 'panneau'],
    // Rien dans le panneau (ou pas de base « Réglages ») : la variable de Vercel, comme avant ce lot.
    [{ etat: 'absent' }, 'true', true, 'vercel'],
    [{ etat: 'absent' }, 'false', false, 'vercel'],
    [{ etat: 'absent' }, undefined, false, 'vercel'],
    [{ etat: 'absent' }, '', false, 'vercel'],
    [{ etat: 'absent' }, 'TRUE', false, 'vercel'],
    // Base illisible et aucune valeur connue : Vercel si la variable est posée, sinon actif.
    [{ etat: 'inconnu' }, 'true', true, 'vercel'],
    [{ etat: 'inconnu' }, 'false', false, 'vercel'],
    [{ etat: 'inconnu' }, undefined, true, 'precaution'],
    [{ etat: 'inconnu' }, '', true, 'precaution'],
    // Une variable qui ne dit ni vrai ni faux ne lève pas le mode d'essai quand rien n'est connu.
    [{ etat: 'inconnu' }, 'oui', true, 'precaution'],
    // Une valeur enregistrée mais illisible, ou qui n'est ni vrai ni faux : actif, quoi que dise Vercel.
    [{ etat: 'illisible' }, 'false', true, 'precaution'],
    [{ etat: 'illisible' }, undefined, true, 'precaution'],
    [{ etat: 'present', valeur: 'non' }, undefined, true, 'precaution'],
    [{ etat: 'present', valeur: null }, 'true', true, 'precaution'],
    [{ etat: 'present', valeur: 0 }, 'false', true, 'precaution'],
    [undefined, undefined, true, 'precaution'],
    [null, 'false', false, 'vercel'],
  ];
  for (const [lecture, variable, actif, source] of cas) {
    const env = variable === undefined ? {} : { EMAIL_TEST_MODE: variable };
    assert.deepEqual(modeEssaiEnVigueur(lecture, env), { actif, source }, `${JSON.stringify(lecture)} avec EMAIL_TEST_MODE=${variable}`);
  }
});

test("mode d'essai, de bout en bout : panneau présent ou non, Vercel vrai, faux ou absent, base illisible avec ou sans valeur connue", async () => {
  const vercel = { vrai: { ...ENV, EMAIL_TEST_MODE: 'true' }, faux: { ...ENV, EMAIL_TEST_MODE: 'false' }, absent: ENV };
  // Rien dans le panneau : Vercel décide.
  assert.deepEqual(await banc({ env: vercel.vrai }).reglages.modeEssai(), { actif: true, source: 'vercel' });
  assert.deepEqual(await banc({ env: vercel.faux }).reglages.modeEssai(), { actif: false, source: 'vercel' });
  assert.deepEqual(await banc({ env: vercel.absent }).reglages.modeEssai(), { actif: false, source: 'vercel' });
  // Pas de base « Réglages » du tout : exactement comme avant ce lot.
  assert.deepEqual(await banc({ env: { EMAIL_TEST_MODE: 'true' } }).reglages.modeEssai(), { actif: true, source: 'vercel' });
  assert.deepEqual(await banc({ env: {} }).reglages.modeEssai(), { actif: false, source: 'vercel' });
  // Le panneau décide, quoi que dise Vercel.
  for (const env of Object.values(vercel)) {
    for (const valeur of [true, false]) {
      const b = banc({ env });
      poser(b, CLES.modeEssai, JSON.stringify(valeur));
      assert.deepEqual(await b.reglages.modeEssai(), { actif: valeur, source: 'panneau' });
    }
  }
  // Base illisible, aucune valeur connue : Vercel, et actif si Vercel ne dit rien.
  const panne = { 'databases.query': true };
  assert.deepEqual(await banc({ env: vercel.vrai, pannes: panne }).reglages.modeEssai(), { actif: true, source: 'vercel' });
  assert.deepEqual(await banc({ env: vercel.faux, pannes: panne }).reglages.modeEssai(), { actif: true, source: 'precaution' }, 'la base existe : « arrêté » ne vaut que relu');
  assert.deepEqual(await banc({ env: vercel.absent, pannes: panne }).reglages.modeEssai(), { actif: true, source: 'precaution' });
  // Base illisible, mais une valeur connue de l'instance : « actif » tient ; « arrêté » ne tient pas, il ne vaut que relu.
  for (const valeur of [true, false]) {
    let enPanne = false;
    const b = banc({ env: valeur ? vercel.faux : vercel.vrai, pannes: { 'databases.query': () => enPanne } });
    poser(b, CLES.modeEssai, JSON.stringify(valeur));
    assert.deepEqual(await b.reglages.modeEssai(), { actif: valeur, source: 'panneau' });
    enPanne = true; b.avancer(5 * 60000);
    assert.deepEqual(await b.reglages.modeEssai(), valeur ? { actif: true, source: 'panneau' } : { actif: true, source: 'precaution' });
  }
  // Base lue sans réglage du mode d'essai, puis panne : le panneau a pu l'activer depuis, actif par précaution.
  let enPanne = false;
  const b = banc({ env: vercel.absent, pannes: { 'databases.query': () => enPanne } });
  assert.deepEqual(await b.reglages.modeEssai(), { actif: false, source: 'vercel' });
  enPanne = true; b.avancer(5 * 60000);
  assert.deepEqual(await b.reglages.modeEssai(), { actif: true, source: 'precaution' });
});

// ─── Le socle ───
test('sans la base « Réglages », rien ne se lit ni ne s\'écrit, et Notion n\'est pas appelé', async () => {
  const b = banc({ env: {} });
  assert.equal(b.reglages.active(), false);
  assert.deepEqual(await b.reglages.lire(CLES.modeEssai), { etat: 'absent', valeur: undefined, modifieLe: null, modifiePar: null });
  assert.deepEqual(await b.reglages.lireTous(), { etat: 'absente', perime: false, reglages: {} });
  assert.deepEqual(await b.reglages.ecrire(CLES.modeEssai, true, 'tess@exemple.ca'), { ok: false, code: 'absente' });
  assert.deepEqual(await b.reglages.retirer(CLES.modeEssai, 'tess@exemple.ca'), { ok: false, code: 'absente' });
  assert.equal(b.faux.appels.length, 0);
});

test('écrire un réglage crée sa ligne : la clé, la date, la personne, et la valeur en JSON dans un bloc de code', async () => {
  const b = banc();
  assert.deepEqual(await b.reglages.ecrire(cleCourriel('refusee'), { objet: 'Objet', texte: 'Texte\n\n{commentaire}' }, ' Tess@Exemple.ca '), { ok: true });
  const [page] = b.pages();
  assert.equal(texte(page.properties[COLONNES.cle]), 'courriel.refusee');
  assert.deepEqual(page.properties[COLONNES.modifieLe], { date: { start: '2026-11-25T15:00:00.000Z' } });
  assert.deepEqual(page.properties[COLONNES.modifiePar], { email: 'tess@exemple.ca' });
  assert.deepEqual(bloc(b, page.id), ['{"objet":"Objet","texte":"Texte\\n\\n{commentaire}"}']);
  assert.deepEqual(await b.reglages.lire('courriel.refusee'), {
    etat: 'present', valeur: { objet: 'Objet', texte: 'Texte\n\n{commentaire}' }, modifieLe: '2026-11-25T15:00:00.000Z', modifiePar: 'tess@exemple.ca',
  });
});

test('écrire de nouveau met la même ligne à jour, sans en créer une seconde', async () => {
  const b = banc();
  await b.reglages.ecrire(CLES.modeEssai, true, 'tess@exemple.ca');
  b.avancer(5000);
  await b.reglages.ecrire(CLES.modeEssai, false, 'max@exemple.ca');
  assert.equal(b.pages().length, 1);
  assert.equal(b.faux.de('pages.create').length, 1);
  assert.deepEqual(bloc(b, b.pages()[0].id), ['false']);
  assert.deepEqual(await b.reglages.lire(CLES.modeEssai), { etat: 'present', valeur: false, modifieLe: '2026-11-25T15:00:05.000Z', modifiePar: 'max@exemple.ca' });
});

test('une ligne sans bloc de code en reçoit un à l\'écriture', async () => {
  const b = banc();
  const id = poser(b, CLES.conditions, null);
  assert.equal((await b.reglages.lire(CLES.conditions)).etat, 'illisible');
  await b.reglages.ecrire(CLES.conditions, 'Texte des conditions', 'tess@exemple.ca');
  assert.deepEqual(bloc(b, id), ['"Texte des conditions"']);
  assert.equal((await b.reglages.lire(CLES.conditions)).valeur, 'Texte des conditions');
});

test('retirer un réglage met sa ligne à la corbeille : la valeur d\'origine revient', async () => {
  const b = banc();
  await b.reglages.ecrire(CLES.messageFerme, 'Fermé pour le moment.', 'tess@exemple.ca');
  assert.deepEqual(await b.reglages.retirer(CLES.messageFerme, 'tess@exemple.ca'), { ok: true });
  assert.equal(b.pages()[0].archived, true);
  assert.equal((await b.reglages.lire(CLES.messageFerme)).etat, 'absent');
  b.avancer(2 * 60000);
  assert.equal((await b.reglages.lire(CLES.messageFerme)).etat, 'absent', 'toujours absent une fois la mémoire passée');
  // Rien à retirer : rien n'est écrit.
  const avant = b.faux.de('pages.update').length;
  assert.deepEqual(await b.reglages.retirer(CLES.messageFerme, 'tess@exemple.ca'), { ok: true, inchange: true });
  assert.equal(b.faux.de('pages.update').length, avant);
});

test('tous les réglages se lisent d\'un coup', async () => {
  const b = banc();
  poser(b, CLES.modeEssai, 'true');
  poser(b, CLES.contributionsOuvertes, 'false', { par: 'max@exemple.ca' });
  poser(b, 'courriel.recue', '{"objet":"O","texte":"T"}');
  poser(b, 'cle avec espace', '1');
  const tous = await b.reglages.lireTous();
  assert.equal(tous.etat, 'lus');
  assert.equal(tous.perime, false);
  assert.deepEqual(Object.keys(tous.reglages).sort(), ['contributionsOuvertes', 'courriel.recue', 'modeEssai']);
  assert.deepEqual(tous.reglages.contributionsOuvertes, { valeur: false, illisible: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'max@exemple.ca' });
  assert.equal(b.lectures(), 1);
});

test('la mémoire dure une minute par instance', async () => {
  const b = banc();
  poser(b, CLES.modeEssai, 'true');
  await b.reglages.lire(CLES.modeEssai);
  await b.reglages.lire(CLES.conditions);
  await b.reglages.lireTous();
  assert.equal(b.lectures(), 1, 'une seule lecture de la base');
  // Une autre instance change la valeur : celle-ci ne le voit qu'une fois la minute passée.
  b.faux.blocs.get(b.pages()[0].id)[0].code.rich_text[0].text.content = 'false';
  b.avancer(59000);
  assert.equal((await b.reglages.lire(CLES.modeEssai)).valeur, true);
  assert.equal(b.lectures(), 1);
  b.avancer(2000);
  assert.equal((await b.reglages.lire(CLES.modeEssai)).valeur, false);
  assert.equal(b.lectures(), 2);
});

test('une écriture vide la mémoire : la lecture suivante relit la base', async () => {
  const b = banc();
  poser(b, CLES.conditions, '"Ancien texte"');
  assert.equal((await b.reglages.lire(CLES.conditions)).valeur, 'Ancien texte');
  const avant = b.lectures();
  await b.reglages.ecrire(CLES.messageFerme, 'Fermé.', 'tess@exemple.ca');
  const apresEcriture = b.lectures();
  assert.equal((await b.reglages.lire(CLES.messageFerme)).valeur, 'Fermé.');
  assert.equal(b.lectures(), apresEcriture + 1, 'la base est relue juste après une écriture');
  assert.ok(apresEcriture >= avant);
  // Le retrait aussi.
  await b.reglages.retirer(CLES.conditions, 'tess@exemple.ca');
  const apresRetrait = b.lectures();
  await b.reglages.lireTous();
  assert.equal(b.lectures(), apresRetrait + 1);
  // « vider » fait de même, pour les essais et pour un geste extérieur.
  b.reglages.vider();
  await b.reglages.lireTous();
  assert.equal(b.lectures(), apresRetrait + 2);
});

test('des lectures simultanées ne lisent la base qu\'une fois', async () => {
  const b = banc();
  poser(b, CLES.modeEssai, 'true');
  const lues = await Promise.all([b.reglages.lire(CLES.modeEssai), b.reglages.lire(CLES.modeEssai), b.reglages.lireTous()]);
  assert.equal(lues[0].valeur, true);
  assert.equal(b.lectures(), 1);
});

test('une panne de lecture ne lève jamais : la dernière valeur connue, sinon « inconnu »', async () => {
  // Rien de connu.
  const b = banc({ pannes: { 'databases.query': true } });
  assert.deepEqual(await b.reglages.lire(CLES.conditions), { etat: 'inconnu', valeur: undefined, modifieLe: null, modifiePar: null });
  assert.deepEqual(await b.reglages.lireTous(), { etat: 'inconnu', perime: false, reglages: {} });
  assert.ok(b.lignes.some((l) => l.includes('[réglages]')), 'la panne va au journal du serveur');
  // Une valeur connue de l'instance.
  let enPanne = false;
  const c = banc({ pannes: { 'databases.query': () => enPanne, 'blocks.children.list': () => enPanne } });
  poser(c, CLES.conditions, '"Texte connu"');
  assert.equal((await c.reglages.lire(CLES.conditions)).valeur, 'Texte connu');
  enPanne = true; c.avancer(10 * 60000);
  assert.deepEqual(await c.reglages.lire(CLES.conditions), { etat: 'present', valeur: 'Texte connu', modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'tess@exemple.ca' });
  const tous = await c.reglages.lireTous();
  assert.equal(tous.etat, 'lus');
  assert.equal(tous.perime, true);
  // La panne finie, la base est relue.
  enPanne = false; c.avancer(60000);
  c.faux.blocs.get(c.pages()[0].id)[0].code.rich_text[0].text.content = '"Texte neuf"';
  assert.equal((await c.reglages.lire(CLES.conditions)).valeur, 'Texte neuf');
});

test('une panne à la lecture d\'un corps de page vaut une panne de lecture', async () => {
  const b = banc({ pannes: { 'blocks.children.list': true } });
  poser(b, CLES.modeEssai, 'false');
  assert.equal((await b.reglages.lire(CLES.modeEssai)).etat, 'inconnu');
});

test('pendant une panne, la base n\'est pas rappelée à chaque demande', async () => {
  const b = banc({ pannes: { 'databases.query': true } });
  await b.reglages.lire(CLES.modeEssai);
  await b.reglages.lire(CLES.modeEssai);
  await b.reglages.lireTous();
  assert.equal(b.lectures(), 1);
  b.avancer(16000);
  await b.reglages.lire(CLES.modeEssai);
  assert.equal(b.lectures(), 2);
});

test('une valeur qui n\'est pas du JSON est dite illisible, sans faire tomber les autres', async () => {
  const b = banc();
  poser(b, CLES.modeEssai, 'vrai {');
  poser(b, CLES.conditions, '"Lisible"');
  assert.deepEqual(await b.reglages.lire(CLES.modeEssai), { etat: 'illisible', valeur: undefined, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'tess@exemple.ca' });
  assert.equal((await b.reglages.lire(CLES.conditions)).valeur, 'Lisible');
  assert.equal((await b.reglages.lireTous()).reglages.modeEssai.illisible, true);
});

test('deux lignes pour une même clé : la plus récente compte, et l\'écriture suivante range l\'autre', async () => {
  const b = banc();
  poser(b, CLES.modeEssai, 'false', { le: '2026-11-20T10:00:00.000Z' });
  const recente = poser(b, CLES.modeEssai, 'true', { le: '2026-11-22T10:00:00.000Z' });
  poser(b, CLES.modeEssai, 'false', { le: '2026-11-21T10:00:00.000Z' });
  assert.equal((await b.reglages.lire(CLES.modeEssai)).valeur, true);
  await b.reglages.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  assert.deepEqual(bloc(b, recente), ['false']);
  assert.equal(b.pages().filter((p) => !p.archived).length, 1);
  // Retirer met toutes les lignes de la clé à la corbeille.
  const c = banc();
  poser(c, CLES.conditions, '"a"', { le: '2026-11-20T10:00:00.000Z' });
  poser(c, CLES.conditions, '"b"', { le: '2026-11-21T10:00:00.000Z' });
  await c.reglages.retirer(CLES.conditions, 'tess@exemple.ca');
  assert.equal(c.pages().filter((p) => !p.archived).length, 0);
});

test('une ligne à la corbeille ne compte pas', async () => {
  const b = banc();
  const id = poser(b, CLES.modeEssai, 'true');
  b.faux.pages.get(id).archived = true;
  assert.equal((await b.reglages.lire(CLES.modeEssai)).etat, 'absent');
});

test('juste après une écriture, l\'instance garde ce qu\'elle vient d\'écrire même si la liste de Notion retarde', async () => {
  const b = banc({ env: { ...ENV, EMAIL_TEST_MODE: 'false' } });
  await b.reglages.lire(CLES.modeEssai);
  b.faux.figerListes(); // la liste de la base ne voit pas encore la ligne qui va être créée
  await b.reglages.ecrire(CLES.modeEssai, true, 'tess@exemple.ca');
  assert.deepEqual(await b.reglages.modeEssai(), { actif: true, source: 'panneau' });
  assert.equal((await b.reglages.lireTous()).reglages.modeEssai.valeur, true);
  b.avancer(30000);
  assert.equal((await b.reglages.lire(CLES.modeEssai)).valeur, true);
  // De même pour un retrait que la liste ne montre pas encore.
  const c = banc();
  poser(c, CLES.conditions, '"Texte"');
  await c.reglages.lire(CLES.conditions);
  c.faux.figerListes();
  await c.reglages.retirer(CLES.conditions, 'tess@exemple.ca');
  assert.equal((await c.reglages.lire(CLES.conditions)).etat, 'absent');
  assert.ok(!Object.hasOwn((await c.reglages.lireTous()).reglages, 'conditions'));
});

test('une panne d\'écriture remonte, et la mémoire n\'invente rien', async () => {
  const b = banc({ pannes: { 'pages.create': true } });
  await assert.rejects(() => b.reglages.ecrire(CLES.modeEssai, true, 'tess@exemple.ca'));
  assert.equal((await b.reglages.lire(CLES.modeEssai)).etat, 'absent');
});

test('une clé mal formée ou une valeur sans JSON est refusée avant tout appel', async () => {
  const b = banc();
  for (const cle of ['', 'a b', 'é', 'x'.repeat(80), null, 12, '../x']) await assert.rejects(() => b.reglages.ecrire(cle, true, 'tess@exemple.ca'), /réglage/);
  await assert.rejects(() => b.reglages.ecrire(CLES.modeEssai, undefined, 'tess@exemple.ca'), /réglage/);
  await assert.rejects(() => b.reglages.retirer('a b', 'tess@exemple.ca'), /réglage/);
  assert.equal(b.faux.appels.length, 0);
  assert.equal((await b.reglages.lire('a b')).etat, 'absent');
});

test('les clés que la suite du panneau utilisera existent, et chaque courriel a la sienne', () => {
  assert.deepEqual(CLES, { modeEssai: 'modeEssai', contributionsOuvertes: 'contributionsOuvertes', messageFerme: 'messageFerme', conditions: 'conditions' });
  assert.equal(cleCourriel('refusee'), 'courriel.refusee');
  assert.deepEqual(COLONNES, { cle: 'Clé', modifieLe: 'Modifié le', modifiePar: 'Modifié par' });
});

// ─── Le mode d'essai à plusieurs instances : « coupé » ne vaut que lu à l'instant ───
function deuxInstances({ env = { ...ENV, EMAIL_TEST_MODE: 'true' }, pannes = {} } = {}) {
  const faux = fauxNotion({ pannes });
  const horloge = { t: T0 };
  const creer = () => creerReglages(faux.client, env, { maintenant: () => horloge.t, journal: () => {} });
  return { faux, a: creer(), b: creer(), avancer: (ms) => { horloge.t += ms; } };
}

test("mode d'essai réactivé par une autre instance : il vaut tout de suite, sans attendre la mémoire d'une minute", async () => {
  const d = deuxInstances();
  await d.b.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  assert.deepEqual(await d.a.modeEssai(), { actif: false, source: 'panneau' });
  await d.b.ecrire(CLES.modeEssai, true, 'tess@exemple.ca');
  d.avancer(1000);
  assert.deepEqual(await d.a.modeEssai(), { actif: true, source: 'panneau' });
});

test("mode d'essai réactivé ailleurs juste après l'avoir coupé ici : ce que l'instance vient d'écrire ne passe pas devant la base", async () => {
  const d = deuxInstances();
  await d.a.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  d.avancer(5000);
  await d.b.ecrire(CLES.modeEssai, true, 'tess@exemple.ca');
  d.avancer(1000);
  assert.deepEqual(await d.a.modeEssai(), { actif: true, source: 'panneau' });
});

test("mode d'essai lu « coupé », puis Notion en panne : le mode d'essai est actif, aussi longtemps que dure la panne", async () => {
  let enPanne = false;
  const d = deuxInstances({ pannes: { 'databases.query': () => enPanne } });
  await d.b.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  assert.equal((await d.a.modeEssai()).actif, false);
  enPanne = true;
  for (const minutes of [2, 30, 240]) {
    d.avancer(minutes * 60000);
    assert.deepEqual(await d.a.modeEssai(), { actif: true, source: 'precaution' }, `après ${minutes} minutes de plus`);
  }
  // Une seule lecture de bloc en panne suffit aussi.
  enPanne = false;
  const e = deuxInstances({ pannes: { 'blocks.children.list': () => enPanne } });
  await e.b.ecrire(CLES.modeEssai, false, 'tess@exemple.ca');
  assert.equal((await e.a.modeEssai()).actif, false);
  enPanne = true; e.avancer(61000);
  assert.deepEqual(await e.a.modeEssai(), { actif: true, source: 'precaution' });
});

test("mode d'essai, deux lignes contraires : la plus sûre gagne, quelles que soient les dates", async () => {
  for (const [dateVrai, dateFaux] of [['2026-11-20T10:00:00.000Z', '2026-11-20T10:00:00.000Z'], [null, '2020-01-01T10:00:00.000Z'], ['2026-11-01T10:00:00.000Z', '2026-11-20T10:00:00.000Z']]) {
    for (const ordre of [['true', 'false'], ['false', 'true']]) {
      const b = banc({ env: { ...ENV, EMAIL_TEST_MODE: 'false' } });
      for (const json of ordre) {
        const le = json === 'true' ? dateVrai : dateFaux;
        const id = poser(b, CLES.modeEssai, json, { le: le || '2000-01-01T00:00:00.000Z', id: `ligne-${json}` });
        if (!le) delete b.faux.pages.get(id).properties[COLONNES.modifieLe];
      }
      assert.equal((await b.reglages.modeEssai()).actif, true, `${ordre.join(' puis ')}, ${dateVrai} et ${dateFaux}`);
    }
  }
  // Une ligne en double illisible vaut « actif » aussi.
  const b = banc({ env: { ...ENV, EMAIL_TEST_MODE: 'false' } });
  poser(b, CLES.modeEssai, 'false', { id: 'ligne-faux' });
  poser(b, CLES.modeEssai, '{abîmé', { le: '2020-01-01T10:00:00.000Z', id: 'ligne-abimee' });
  assert.deepEqual(await b.reglages.modeEssai(), { actif: true, source: 'precaution' });
});

test("mode d'essai, une ligne qui existe sans être vrai ou faux : actif, même si Vercel dit « false »", async () => {
  for (const json of ['"false"', '0', 'null', '{}', '{abîmé', null]) {
    const b = banc({ env: { ...ENV, EMAIL_TEST_MODE: 'false' } });
    poser(b, CLES.modeEssai, json);
    assert.deepEqual(await b.reglages.modeEssai(), { actif: true, source: 'precaution' }, String(json));
  }
});
