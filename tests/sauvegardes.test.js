const test = require('node:test');
const assert = require('node:assert/strict');
const { banc, SECRETS, TESS, MAX, LEA, ODILE, T0, HOTE_FICHIERS } = require('./aides/banc-lot4c');
const { valeurSimple, FORMAT, SEMAINES_GARDEES, TAILLE_MAX } = require('../lib/sauvegardes');
const { creerFichiers } = require('../lib/fichiers-notion');

const JOUR = 86400000;
const ilYA = (jours) => new Date(T0 - jours * JOUR).toISOString();

// ─── Ce qu'une copie contient ───
test('valeurSimple : chaque sorte de colonne Notion devient une valeur simple, sans adresse de fichier', () => {
  const t = (contenu) => [{ plain_text: contenu }];
  assert.equal(valeurSimple({ type: 'title', title: t('CARTaGENE') }), 'CARTaGENE');
  assert.equal(valeurSimple({ rich_text: [{ plain_text: 'Une ' }, { text: { content: 'phrase.' } }] }), 'Une phrase.');
  assert.equal(valeurSimple({ select: { name: 'Publiée' } }), 'Publiée');
  assert.equal(valeurSimple({ select: null }), null);
  assert.equal(valeurSimple({ status: { name: 'Fait' } }), 'Fait');
  assert.deepEqual(valeurSimple({ multi_select: [{ name: 'a' }, { name: 'b' }] }), ['a', 'b']);
  assert.deepEqual(valeurSimple({ relation: [{ id: 'x' }, { id: 'y' }] }), ['x', 'y']);
  assert.deepEqual(valeurSimple({ date: { start: '2026-11-02', end: null } }), '2026-11-02');
  assert.deepEqual(valeurSimple({ date: { start: '2026-11-02', end: '2026-11-05' } }), { debut: '2026-11-02', fin: '2026-11-05' });
  assert.equal(valeurSimple({ date: null }), null);
  assert.equal(valeurSimple({ checkbox: false }), false);
  assert.equal(valeurSimple({ number: 0 }), 0);
  assert.equal(valeurSimple({ url: 'https://x.org' }), 'https://x.org');
  assert.equal(valeurSimple({ email: 'a@b.org' }), 'a@b.org');
  assert.equal(valeurSimple({ phone_number: '514' }), '514');
  assert.deepEqual(valeurSimple({ people: [{ id: 'u1', name: 'Tess' }] }), ['u1']);
  // Un fichier : son nom seulement. L'adresse de Notion est temporaire et signée.
  assert.deepEqual(valeurSimple({ files: [{ type: 'file', name: 'logo.png', file: { url: 'https://s3.exemple/x?signature=abc' } }, { type: 'external', name: 'ailleurs', external: { url: 'https://ailleurs.exemple/a.png' } }] }), [{ nom: 'logo.png' }, { nom: 'ailleurs', adresse: 'https://ailleurs.exemple/a.png' }]);
  assert.equal(valeurSimple({ formula: { type: 'number', number: 3 } }), 3);
  assert.equal(valeurSimple({ created_time: '2026-10-01T10:00:00.000Z' }), '2026-10-01T10:00:00.000Z');
  for (const inconnu of [undefined, null, {}, { type: 'mystere', mystere: { a: 1 } }, 'texte']) assert.equal(valeurSimple(inconnu), null);
});

test('faire : une copie de toutes les bases, avec le contenu des propositions, des versions et des réglages, dans un seul fichier JSON', async () => {
  const b = banc({ reglages: { conditions: 'Mes conditions.' } });
  const retour = await b.sauvegardes.faire({ origine: 'demande', par: TESS });
  assert.equal(retour.ok, true);
  const [copie] = b.copies();
  assert.deepEqual([copie.origine, copie.par, copie.id, copie.faiteLe], ['À la demande', TESS, retour.id, retour.faiteLe]);
  assert.match(copie.titre, /^Sauvegarde du 2026-11-26 /);
  assert.deepEqual([copie.depot.type, copie.depot.nom.endsWith('.json'), copie.taille, retour.taille], ['application/json', true, copie.depot.octets.length, copie.depot.octets.length]);
  const c = copie.contenu;
  assert.deepEqual([c.format, c.version, c.origine, c.incomplete], [FORMAT, 1, 'demande', false]);
  assert.deepEqual(Object.keys(c.bases), ['ressources', 'porteurs', 'propositions', 'approbateurs', 'versions', 'journal', 'reglages']);
  assert.deepEqual(Object.fromEntries(Object.entries(c.bases).map(([cle, base]) => [cle, base.pages.length])), { ressources: 2, porteurs: 1, propositions: 1, approbateurs: 4, versions: 1, journal: 1, reglages: 1 });
  assert.deepEqual(c.comptes, retour.comptes);
  const fiche = c.bases.ressources.pages.find((p) => p.id === 'fiche-1');
  assert.deepEqual(fiche, {
    id: 'fiche-1', creeLe: '2026-10-01T10:00:00.000Z', modifieLe: '2026-11-01T10:00:00.000Z',
    proprietes: { Nom: 'CARTaGENE', Phrase: 'Une cohorte.', 'Type principal': 'Jeu de données', 'Mots-clés': ['cancer', 'cohorte'], Porteurs: ['porteur-1'], Lien: 'https://cartagene.exemple', 'Vérifiée le': '2026-11-02', Gratuit: true, 'Fichier du logo': [{ nom: 'logo.png' }] },
  });
  assert.deepEqual(c.bases.propositions.pages[0].contenu, { propose: { nom: { apres: 'Outil X' } }, applique: null });
  assert.equal(c.bases.propositions.pages[0].proprietes['Proposé par'], 'pat@exemple.org');
  assert.deepEqual(c.bases.versions.pages[0].contenu, { valeurs: { nom: 'CARTaGENE' } });
  assert.equal(c.bases.reglages.pages[0].contenu, 'Mes conditions.');
  assert.ok(!Object.hasOwn(c.bases.ressources.pages[0], 'contenu'));
});

test('faire : la copie ne contient aucun secret, aucun identifiant de base, aucune adresse de fichier signée', async () => {
  const b = banc();
  await b.sauvegardes.faire({ origine: 'demande', par: TESS });
  const brut = b.copies()[0].depot.octets.toString('utf8');
  for (const interdit of [...SECRETS, 'signature-temporaire', 'X-Amz', 'base-ressources', 'base-sauvegardes', 'cle-carte']) assert.ok(!brut.includes(interdit), interdit);
});

test('faire : une base sans son réglage est notée absente, les autres sont copiées', async () => {
  const b = banc({ sans: ['NOTION_DB_VERSIONS', 'NOTION_DB_JOURNAL'] });
  assert.equal((await b.sauvegardes.faire({ origine: 'demande', par: TESS })).ok, true);
  const c = b.copies()[0].contenu;
  assert.deepEqual([c.bases.versions, c.bases.journal], [{ absente: true, pages: [] }, { absente: true, pages: [] }]);
  assert.equal(c.bases.ressources.pages.length, 2);
  assert.equal(c.incomplete, false);
});

test('faire : une base illisible fait échouer la copie entière, rien n\'est déposé ni inscrit', async () => {
  const b = banc({ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-porteurs' } });
  await assert.rejects(b.sauvegardes.faire({ origine: 'demande', par: TESS }));
  assert.equal(b.copies().length, 0);
  assert.equal(b.fichiers.depots.size, 0);
  // Le verrou est rendu : une nouvelle tentative est possible.
  await assert.rejects(b.sauvegardes.faire({ origine: 'demande', par: TESS }));
});

test('faire : un contenu illisible ou non lu à temps est compté, et la copie est marquée incomplète', async () => {
  const b = banc({ pannesNotion: { 'blocks.children.list': (id) => id === 'prop-1' } });
  const retour = await b.sauvegardes.faire({ origine: 'demande', par: TESS });
  assert.deepEqual([retour.ok, retour.incomplete], [true, true]);
  const [copie] = b.copies();
  assert.match(copie.titre, /incomplète/);
  assert.deepEqual([copie.contenu.incomplete, copie.contenu.bases.propositions.contenusNonLus, copie.contenu.bases.propositions.pages[0].contenuNonLu], [true, 1, true]);
  assert.deepEqual(copie.contenu.bases.versions.pages[0].contenu, { valeurs: { nom: 'CARTaGENE' } });
  // Le temps accordé aux contenus est dépassé : les propriétés sont là, les contenus manquent.
  const presse = banc({ budgetMs: 0 });
  const r = await presse.sauvegardes.faire({ origine: 'demande', par: TESS });
  assert.deepEqual([r.ok, r.incomplete], [true, true]);
  assert.equal(presse.copies()[0].contenu.bases.ressources.pages.length, 2);
  assert.equal(presse.faux.de('blocks.children.list').length, 0);
  // Un bloc qui n'est pas du JSON est gardé tel quel.
  const brut = banc();
  brut.poser('conditions', 'pas du json');
  await brut.sauvegardes.faire({ origine: 'demande', par: TESS });
  assert.equal(brut.copies()[0].contenu.bases.reglages.pages[0].contenuBrut, 'pas du json');
});

test('faire : un dépôt en panne remonte, et aucune ligne n\'est inscrite dans « Sauvegardes »', async () => {
  const b = banc({ pannesFichiers: { deposer: true } });
  await assert.rejects(b.sauvegardes.faire({ origine: 'demande', par: TESS }), /dépôt/);
  assert.equal(b.copies().length, 0);
});

test('faire : une copie trop grosse pour le dépôt de Notion est refusée avant l\'envoi', async () => {
  const b = banc();
  b.faux.pages.set('grosse', { id: 'grosse', parent: { database_id: 'base-journal' }, properties: { Titre: { title: [{ type: 'text', text: { content: 'x'.repeat(TAILLE_MAX + 10) } }] } } });
  await assert.rejects(b.sauvegardes.faire({ origine: 'demande', par: TESS }), /trop grosse/);
  assert.equal(b.fichiers.appels.length, 0);
});

// ─── Qui peut ───
test('une copie à la demande, la liste et le téléchargement : Administration seulement, vérifié dans le module', async () => {
  for (const par of [MAX, LEA, ODILE, 'inconnue@exemple.org', '', null, undefined]) {
    const b = banc();
    const id = b.poserCopie({ faiteLe: ilYA(1) });
    assert.deepEqual(await b.sauvegardes.faire({ origine: 'demande', par }), { ok: false, code: 'role' }, String(par));
    assert.deepEqual(await b.sauvegardes.lister({ par }), { ok: false, code: 'role' });
    assert.deepEqual(await b.sauvegardes.telecharger({ id, par }), { ok: false, code: 'role' });
    assert.equal(b.copies().length, 1);
    assert.equal(b.fichiers.appels.length, 0);
  }
  // Une origine inconnue ne contourne pas la vérification.
  const b = banc();
  assert.deepEqual(await b.sauvegardes.faire({ origine: 'automatique', par: MAX }), { ok: false, code: 'role' });
  assert.deepEqual(await b.sauvegardes.faire({ par: MAX }), { ok: false, code: 'role' });
});

test('deux copies à la demande en même temps : la seconde attend son tour', async () => {
  const b = banc();
  const [une, deux] = await Promise.all([b.sauvegardes.faire({ origine: 'demande', par: TESS }), b.sauvegardes.faire({ origine: 'demande', par: TESS })]);
  assert.deepEqual([une.ok, deux], [true, { ok: false, code: 'occupee' }]);
  assert.equal((await b.sauvegardes.faire({ origine: 'demande', par: TESS })).ok, true);
});

// ─── La liste ───
test('lister : les copies de la plus récente à la plus ancienne, sans adresse de fichier', async () => {
  const b = banc();
  b.poserCopie({ faiteLe: ilYA(14) });
  const recente = b.poserCopie({ faiteLe: ilYA(1), origine: 'À la demande', par: TESS });
  b.poserCopie({ faiteLe: ilYA(7), fichier: [] });
  const liste = await b.sauvegardes.lister({ par: TESS });
  assert.deepEqual([liste.ok, liste.actives, liste.copies.length], [true, true, 3]);
  assert.deepEqual(liste.copies.map((c) => c.faiteLe), [ilYA(1), ilYA(7), ilYA(14)]);
  assert.deepEqual(liste.copies[0], { id: recente, faiteLe: ilYA(1), origine: 'demande', par: TESS, taille: liste.copies[0].taille, fichier: true, incomplete: false });
  assert.deepEqual([liste.copies[1].origine, liste.copies[1].par, liste.copies[1].fichier], ['automatique', null, false]);
  assert.ok(!JSON.stringify(liste).includes(HOTE_FICHIERS));
});

// ─── Le téléchargement ───
test('telecharger : seulement le fichier d\'une ligne de la base « Sauvegardes », relu par le serveur', async () => {
  const b = banc();
  const retour = await b.sauvegardes.faire({ origine: 'demande', par: TESS });
  const t = await b.sauvegardes.telecharger({ id: retour.id, par: TESS });
  assert.deepEqual([t.ok, t.faiteLe], [true, retour.faiteLe]);
  assert.match(t.nom, /^sauvegarde-cartographie-2026-11-26-\d{4}\.json$/);
  assert.deepEqual(JSON.parse(t.octets.toString('utf8')).format, FORMAT);
  assert.ok(b.fichiers.appels.find((a) => a.nom === 'telecharger').args.options.max >= TAILLE_MAX);
});

test('telecharger : une page d\'une autre base, à la corbeille, inconnue, sans fichier, ou au fichier venu d\'ailleurs : rien n\'est téléchargé', async () => {
  const b = banc();
  const externe = b.poserCopie({ faiteLe: ilYA(2), fichier: [{ type: 'external', name: 'piege.json', external: { url: `${HOTE_FICHIERS}ancien-1` } }] });
  const sansFichier = b.poserCopie({ faiteLe: ilYA(3), fichier: [] });
  const http = b.poserCopie({ faiteLe: ilYA(4), fichier: [{ type: 'file', name: 'x.json', file: { url: 'http://fichiers.notion.exemple/ancien-1' } }] });
  const jetee = b.poserCopie({ faiteLe: ilYA(5) });
  b.faux.pages.get(jetee).archived = true;
  // Une page d'une autre base, avec un vrai identifiant et un fichier gardé par Notion.
  const ailleurs = (await b.faux.client.pages.create({ parent: { database_id: 'base-journal' }, properties: { Fichier: { files: [{ type: 'file_upload', file_upload: { id: 'ancien-1' }, name: 'copie.json' }] } } })).id;
  for (const id of [ailleurs, 'fiche-1', 'prop-1', 'id-notion-tess', externe, sansFichier, http, jetee, '99999999-0000-4000-8000-000000000000', '', null, undefined, 'https://ailleurs.exemple/x', { id: externe }]) {
    assert.deepEqual(await b.sauvegardes.telecharger({ id, par: TESS }), { ok: false, code: 'introuvable' }, String(id));
  }
  assert.equal(b.fichiers.appels.filter((a) => a.nom === 'telecharger').length, 0, 'aucune adresse n\'a été appelée');
});

test('telecharger : un fichier qui n\'est pas une copie de la cartographie n\'est pas servi', async () => {
  const b = banc();
  for (const contenu of ['<html>pas du json</html>', '{"format":"autre"}', '[]', 'null']) {
    const id = b.poserCopie({ faiteLe: ilYA(1), contenu });
    assert.deepEqual(await b.sauvegardes.telecharger({ id, par: TESS }), { ok: false, code: 'invalide' }, contenu);
  }
});

// ─── Sans la base « Sauvegardes » ───
test('sans NOTION_DB_SAUVEGARDES : rien n\'est activé, rien ne casse, Notion n\'est pas appelé', async () => {
  const b = banc({ sans: ['NOTION_DB_SAUVEGARDES'] });
  assert.equal(b.sauvegardes.active(), false);
  assert.deepEqual(await b.sauvegardes.lister({ par: TESS }), { ok: true, actives: false, copies: [] });
  assert.deepEqual(await b.sauvegardes.faire({ origine: 'demande', par: TESS }), { ok: false, code: 'sauvegardes-absentes' });
  assert.deepEqual(await b.sauvegardes.telecharger({ id: '10000000-0000-4000-8000-000000000001', par: TESS }), { ok: false, code: 'sauvegardes-absentes' });
  const avant = b.faux.appels.filter((a) => a.nom !== 'databases.query' || a.args.database_id !== 'base-approbateurs').length;
  assert.deepEqual(await b.sauvegardes.hebdomadaire(), { etat: 'inactive' });
  assert.equal(b.faux.appels.filter((a) => a.nom !== 'databases.query' || a.args.database_id !== 'base-approbateurs').length, avant);
  assert.equal(b.fichiers.appels.length, 0);
});

// ─── La copie de la semaine ───
test('hebdomadaire : une copie « Automatique », sans personne, puis les copies automatiques de plus de douze semaines vont à la corbeille', async () => {
  assert.equal(SEMAINES_GARDEES, 12);
  const b = banc();
  const vieille = b.poserCopie({ faiteLe: ilYA(12 * 7 + 1) });
  const limite = b.poserCopie({ faiteLe: ilYA(12 * 7 - 1) });
  const vieilleALaMain = b.poserCopie({ faiteLe: ilYA(200), origine: 'À la demande', par: TESS });
  const retour = await b.sauvegardes.hebdomadaire();
  assert.deepEqual([retour.etat, retour.retirees, retour.incomplete], ['faite', 1, false]);
  const copies = b.copies();
  assert.equal(copies.length, 3);
  assert.ok(!copies.some((c) => c.id === vieille), 'la copie automatique de plus de douze semaines est à la corbeille');
  assert.ok(copies.some((c) => c.id === limite) && copies.some((c) => c.id === vieilleALaMain), 'les copies récentes et les copies à la demande restent');
  assert.equal(b.faux.pages.get(vieille).archived, true);
  const neuve = copies.find((c) => ![limite, vieilleALaMain].includes(c.id));
  assert.deepEqual([neuve.origine, neuve.par, neuve.contenu.origine, neuve.contenu.bases.ressources.pages.length], ['Automatique', null, 'automatique', 2]);
});

test('hebdomadaire : ne lève jamais ; si la copie échoue, aucune ancienne copie n\'est retirée', async () => {
  for (const pannes of [{ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-ressources' } }, { pannesFichiers: { deposer: true } }, { pannesNotion: { 'pages.create': true } }]) {
    const b = banc(pannes);
    const vieille = b.poserCopie({ faiteLe: ilYA(200) });
    assert.deepEqual(await b.sauvegardes.hebdomadaire(), { etat: 'echec' });
    assert.ok(b.copies().some((c) => c.id === vieille));
    assert.ok(b.lignesServeur.some((l) => l.includes('[sauvegardes]')));
  }
  // La copie est faite, le ménage échoue : la copie compte quand même.
  const b = banc({ pannesNotion: { 'pages.update': true } });
  b.poserCopie({ faiteLe: ilYA(200) });
  const retour = await b.sauvegardes.hebdomadaire();
  assert.deepEqual([retour.etat, retour.retirees], ['faite', 0]);
});

// ─── Le dépôt réel, sans réseau ───
test('le dépôt d\'un fichier JSON suit les deux appels de l\'API de dépôt de Notion, et la lecture accepte une limite plus haute que celle des images', async () => {
  const appels = [];
  const requete = async (url, options = {}) => {
    appels.push({ url, options });
    if (url.endsWith('/file_uploads')) return { ok: true, json: async () => ({ id: 'depot-9' }) };
    if (url.endsWith('/send')) return { ok: true, json: async () => ({}) };
    return { ok: true, headers: { get: () => String(3 * 1024 * 1024) }, arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024) };
  };
  const fichiers = creerFichiers({ env: { NOTION_KEY: 'cle' }, requete });
  assert.equal(await fichiers.deposer({ nom: 'copie.json', type: 'application/json', octets: Buffer.from('{}') }), 'depot-9');
  assert.deepEqual(JSON.parse(appels[0].options.body), { filename: 'copie.json', content_type: 'application/json' });
  assert.equal(appels[1].url, 'https://api.notion.com/v1/file_uploads/depot-9/send');
  assert.deepEqual(fichiers.proprieteFichier('depot-9', 'copie.json'), { files: [{ type: 'file_upload', file_upload: { id: 'depot-9' }, name: 'copie.json' }] });
  // Une copie de 3 Mo dépasse la limite des images : elle se lit avec la limite des sauvegardes.
  await assert.rejects(fichiers.telecharger('https://x.exemple/a'), /trop gros/);
  assert.equal((await fichiers.telecharger('https://x.exemple/a', { max: TAILLE_MAX })).length, 3 * 1024 * 1024);
});

// ─── Corrections après relecture ───
const trop = () => { const e = new Error('trop de demandes'); e.status = 429; e.code = 'rate_limited'; return e; };
const delai = () => { const e = new Error('Request to Notion API has timed out'); e.code = 'notionhq_client_request_timeout'; return e; };

test('une reprise, une seule, après une courte attente, sur « trop de demandes » ou un délai dépassé : pour les listes comme pour les contenus', async () => {
  for (const erreur of [trop, delai]) {
    const vus = new Set(); const attentes = [];
    const unefois = (cle) => { if (vus.has(cle)) return false; vus.add(cle); throw erreur(); };
    const b = banc({ attendreSauvegarde: async () => { attentes.push(1); }, pannesNotion: { 'databases.query': (a) => a.database_id === 'base-ressources' && unefois('liste'), 'blocks.children.list': (id) => id === 'prop-1' && unefois('contenu') } });
    const r = await b.sauvegardes.faire({ par: TESS });
    assert.deepEqual([r.ok, r.incomplete, attentes.length], [true, false, 2]);
    assert.deepEqual(b.copies()[0].contenu.bases.propositions.pages[0].contenu, { propose: { nom: { apres: 'Outil X' } }, applique: null });
  }
  // Deux fois de suite : la liste fait échouer la copie, le contenu la rend incomplète.
  const b = banc({ attendreSauvegarde: async () => {}, pannesNotion: { 'blocks.children.list': (id) => { if (id === 'prop-1') throw trop(); return false; } } });
  assert.equal((await b.sauvegardes.faire({ par: TESS })).incomplete, true);
  assert.equal(b.faux.de('blocks.children.list').filter((id) => id === 'prop-1').length, 2);
  const c = banc({ attendreSauvegarde: async () => {}, pannesNotion: { 'databases.query': (a) => { if (a.database_id === 'base-porteurs') throw trop(); return false; } } });
  await assert.rejects(c.sauvegardes.faire({ par: TESS }));
  // Une autre panne n'est pas reprise.
  const d = banc({ attendreSauvegarde: async () => { throw new Error('ne doit pas attendre'); }, pannesNotion: { 'databases.query': (a) => a.database_id === 'base-porteurs' } });
  await assert.rejects(d.sauvegardes.faire({ par: TESS }), /en panne/);
  assert.equal(d.faux.de('databases.query').filter((a) => a.database_id === 'base-porteurs').length, 1);
});

test('un contenu en plusieurs pages est lu en entier ; s\'il ne peut pas l\'être, la copie est incomplète', async () => {
  const b = banc();
  const vraie = b.faux.client.blocks.children.list;
  const bloc = (t) => ({ id: `b-${t}`, type: 'code', code: { rich_text: [{ plain_text: t }] } });
  b.faux.client.blocks.children.list = async (a) => {
    if (a.block_id !== 'version-1') return vraie(a);
    return a.start_cursor === 'suite' ? { results: [bloc('"CARTaGENE"}')], has_more: false } : { results: [bloc('{"nom":')], has_more: true, next_cursor: 'suite' };
  };
  assert.equal((await b.sauvegardes.faire({ par: TESS })).incomplete, false);
  assert.deepEqual(b.copies()[0].contenu.bases.versions.pages[0].contenu, { nom: 'CARTaGENE' });
  // Une suite annoncée sans curseur : le contenu n'est pas gardé à moitié.
  b.faux.client.blocks.children.list = async (a) => (a.block_id === 'version-1' ? { results: [bloc('{"nom":')], has_more: true, next_cursor: null } : vraie(a));
  const r = await b.sauvegardes.faire({ par: TESS });
  assert.equal(r.incomplete, true);
  const page = b.copies().find((x) => x.id === r.id).contenu.bases.versions.pages[0];
  assert.deepEqual([page.contenuNonLu, Object.hasOwn(page, 'contenu'), Object.hasOwn(page, 'contenuBrut')], [true, false, false]);
});

test('hebdomadaire : pas de ménage après une copie incomplète, et la dernière copie complète est toujours gardée', async () => {
  const b = banc({ pannesNotion: { 'blocks.children.list': (id) => id === 'prop-1' } });
  const vieille = b.poserCopie({ faiteLe: ilYA(200) });
  const plusVieille = b.poserCopie({ faiteLe: ilYA(210) });
  const retour = await b.sauvegardes.hebdomadaire();
  assert.deepEqual([retour.etat, retour.incomplete, retour.retirees], ['faite', true, 0]);
  assert.ok(b.copies().some((c) => c.id === vieille) && b.copies().some((c) => c.id === plusVieille), 'aucune vieille copie ne part après une copie incomplète');
  assert.equal(b.faux.de('pages.update').length, 0);
  // Après une copie complète, les vieilles copies automatiques partent : la neuve est la dernière complète.
  const d = banc();
  const garde = d.poserCopie({ faiteLe: ilYA(150) });
  const retiree = d.poserCopie({ faiteLe: ilYA(160) });
  const r = await d.sauvegardes.hebdomadaire();
  assert.deepEqual([r.etat, r.retirees], ['faite', 2], 'la copie neuve est complète : les deux vieilles partent');
  assert.ok(!d.copies().some((x) => x.id === garde || x.id === retiree));
});

test('menage : même si la copie la plus récente et complète est vieille, elle n\'est jamais retirée', async () => {
  const b = banc();
  const complete = b.poserCopie({ faiteLe: ilYA(150) });
  const plusVieille = b.poserCopie({ faiteLe: ilYA(160) });
  const incomplete = b.poserCopie({ faiteLe: ilYA(100) });
  b.faux.pages.get(incomplete).properties.Titre.title[0].text.content += ' (incomplète)';
  b.poserCopie({ faiteLe: ilYA(95), fichier: [] });
  assert.equal(await b.sauvegardes.menage(), 3);
  assert.deepEqual(b.copies().map((x) => x.id), [complete]);
  assert.equal(b.faux.pages.get(plusVieille).archived, true);
});

test('derniereComplete : la date de la dernière copie complète, et si elle a plus de huit jours', async () => {
  const b = banc();
  assert.deepEqual(await b.sauvegardes.derniereComplete(), { faiteLe: null, ancienne: true });
  b.poserCopie({ faiteLe: ilYA(9) });
  assert.deepEqual(await b.sauvegardes.derniereComplete(), { faiteLe: ilYA(9), ancienne: true });
  const inc = b.poserCopie({ faiteLe: ilYA(1) });
  b.faux.pages.get(inc).properties.Titre.title[0].text.content += ' (incomplète)';
  assert.equal((await b.sauvegardes.derniereComplete()).faiteLe, ilYA(9));
  b.poserCopie({ faiteLe: ilYA(7), origine: 'À la demande', par: TESS });
  assert.deepEqual(await b.sauvegardes.derniereComplete(), { faiteLe: ilYA(7), ancienne: false });
});
