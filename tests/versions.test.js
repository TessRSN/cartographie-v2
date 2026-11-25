const test = require('node:test');
const assert = require('node:assert/strict');
const { fauxNotion } = require('./aides/faux-notion');
const { creerVersions, reconstituer, avecDepart, prochainNumero, changementsLisibles, COLONNES, SOURCES, cleVerrouFiche } = require('../lib/versions');
const { CHAMPS } = require('../public/js/champs.js');

const env = { NOTION_DB_VERSIONS: 'base-versions' };
const T0 = Date.UTC(2026, 10, 25, 19, 0);
const TESS = 'tess@exemple.ca';
const banc = (o = {}) => {
  const faux = fauxNotion(o);
  const journal = [];
  const versions = creerVersions(faux.client, o.env || env, { maintenant: () => T0, journal: (...ligne) => journal.push(ligne.join(' ')) });
  return { ...faux, versions, journal };
};

// ─── Reconstitution ───
const ACTUELLE = { nom: 'Cohorte X', phrase: 'Troisième phrase.', motsCles: ['cancer', 'génomique'], contact: 'c@d.org', jumelage: true };
const HISTOIRE = [
  { numero: 2, source: 'panneau', changements: { phrase: { avant: 'Première phrase.', apres: 'Deuxième phrase.' }, motsCles: { avant: ['cancer'], apres: ['cancer', 'génomique'] } } },
  { numero: 3, source: 'proposition', changements: { phrase: { avant: 'Deuxième phrase.', apres: 'Troisième phrase.' }, contact: { avant: null, apres: 'c@d.org' }, jumelage: { avant: false, apres: true } } },
];

test('la dernière version est la fiche d\'aujourd\'hui, avec toutes les clés du catalogue', () => {
  const v = reconstituer(ACTUELLE, HISTOIRE, 3);
  assert.deepEqual(Object.keys(v), CHAMPS.map((c) => c.cle));
  assert.equal(v.phrase, 'Troisième phrase.');
  assert.deepEqual(v.motsCles, ['cancer', 'génomique']);
  assert.deepEqual(v.langues, [], 'une liste absente est une liste vide');
  assert.equal(v.lien, null);
});

test('une version plus ancienne se retrouve en remontant les valeurs « avant »', () => {
  const v2 = reconstituer(ACTUELLE, HISTOIRE, 2);
  assert.equal(v2.phrase, 'Deuxième phrase.');
  assert.equal(v2.contact, null);
  assert.equal(v2.jumelage, false);
  assert.deepEqual(v2.motsCles, ['cancer', 'génomique']);
  const v1 = reconstituer(ACTUELLE, HISTOIRE, 1);
  assert.equal(v1.phrase, 'Première phrase.');
  assert.deepEqual(v1.motsCles, ['cancer']);
  assert.equal(v1.nom, 'Cohorte X', 'un champ jamais touché garde sa valeur');
});

test('la reconstitution ne dépend pas de l\'ordre des lignes et ne touche ni à la fiche ni à l\'historique', () => {
  const copieFiche = JSON.parse(JSON.stringify(ACTUELLE)); const copieHistoire = JSON.parse(JSON.stringify(HISTOIRE));
  const v1 = reconstituer(ACTUELLE, [...HISTOIRE].reverse(), 1);
  assert.equal(v1.phrase, 'Première phrase.');
  v1.motsCles.push('intrus');
  assert.deepEqual(ACTUELLE, copieFiche);
  assert.deepEqual(HISTOIRE, copieHistoire);
});

test('une clé hors du catalogue dans une version est ignorée', () => {
  const v = reconstituer(ACTUELLE, [{ numero: 2, changements: { notesDeVeille: { avant: 'secret', apres: 'x' }, phrase: { avant: 'Avant.', apres: 'Troisième phrase.' } } }], 1);
  assert.ok(!Object.hasOwn(v, 'notesDeVeille'));
  assert.equal(v.phrase, 'Avant.');
  assert.deepEqual(changementsLisibles({ notesDeVeille: { avant: 'a', apres: 'b' }, phrase: { avant: 'a', apres: 'b' }, nom: 'abîmé', lien: { apres: 'https://x.org' } }),
    { phrase: { avant: 'a', apres: 'b' }, lien: { avant: null, apres: 'https://x.org' } });
  assert.deepEqual(changementsLisibles(null), {});
});

test('une fiche sans aucune ligne a une seule version : l\'état au lancement de l\'historique', () => {
  const liste = avecDepart([]);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].numero, 1);
  assert.equal(liste[0].source, 'depart');
  assert.deepEqual(reconstituer(ACTUELLE, liste, 1).phrase, 'Troisième phrase.');
  // Une fiche d'avant l'historique : la version de départ s'ajoute devant la première ligne.
  assert.deepEqual(avecDepart(HISTOIRE).map((v) => v.numero), [1, 2, 3]);
  // Une fiche née avec l'historique commence à sa création : rien n'est ajouté.
  assert.deepEqual(avecDepart([{ numero: 1, source: 'creation', changements: {} }]).map((v) => v.source), ['creation']);
});

test('le numéro suivant : 1 pour une création, 2 pour le premier changement d\'une fiche d\'avant, puis la suite', () => {
  assert.equal(prochainNumero([], 'creation'), 1);
  assert.equal(prochainNumero([], 'panneau'), 2);
  assert.equal(prochainNumero([2, 3], 'retablissement'), 4);
  assert.equal(prochainNumero([1], 'proposition'), 2);
});

// ─── Écriture et lecture dans Notion ───
const CHANGEMENTS = { phrase: { avant: 'Une phrase.', apres: 'Une autre.' } };

test('une version écrite porte les colonnes de la base et se relit telle quelle', async () => {
  const b = banc();
  const retour = await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'Cohorte X', source: 'proposition', par: TESS, changements: CHANGEMENTS, propositionId: 'prop-7' });
  assert.deepEqual(retour, { ecrite: true, numero: 2 });
  const [page] = [...b.pages.values()];
  assert.equal(page.parent.database_id, 'base-versions');
  const p = page.properties;
  assert.equal(p[COLONNES.titre].title[0].text.content, 'Cohorte X, version 2');
  assert.deepEqual(p[COLONNES.fiche], { relation: [{ id: 'fiche-1' }] });
  assert.deepEqual(p[COLONNES.numero], { number: 2 });
  assert.deepEqual(p[COLONNES.faiteLe], { date: { start: '2026-11-25T19:00:00.000Z' } });
  assert.deepEqual(p[COLONNES.faitePar], { email: TESS });
  assert.deepEqual(p[COLONNES.source], { select: { name: SOURCES.proposition } });
  assert.deepEqual(p[COLONNES.proposition], { relation: [{ id: 'prop-7' }] });
  const [bloc] = b.blocs.get(page.id);
  assert.equal(bloc.code.language, 'json');
  assert.deepEqual(JSON.parse(bloc.code.rich_text.map((s) => s.text.content).join('')), { changements: CHANGEMENTS, note: '' });
  assert.deepEqual(await b.versions.lister('fiche-1'), [
    { numero: 2, le: '2026-11-25T19:00:00.000Z', par: TESS, source: 'proposition', propositionId: 'prop-7', changements: CHANGEMENTS, note: '', illisible: false },
  ]);
});

test('une version par source, numérotées à la suite, chacune avec son libellé', async () => {
  const b = banc();
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'Outil X', source: 'creation', par: TESS, changements: { nom: { apres: 'Outil X' } } });
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'Outil X', source: 'proposition', par: TESS, changements: CHANGEMENTS });
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'Outil X', source: 'panneau', par: TESS, changements: CHANGEMENTS });
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'Outil X', source: 'retablissement', par: TESS, changements: CHANGEMENTS, note: 'Retour à la version 2' });
  const liste = await b.versions.lister('fiche-1');
  assert.deepEqual(liste.map((v) => [v.numero, v.source]), [[1, 'creation'], [2, 'proposition'], [3, 'panneau'], [4, 'retablissement']]);
  assert.equal(liste[3].note, 'Retour à la version 2');
  assert.equal(liste[0].propositionId, null);
  assert.deepEqual([...b.pages.values()].map((p) => p.properties[COLONNES.source].select.name), ['Création', 'Proposition', 'Panneau', 'Rétablissement']);
});

test('les versions d\'une fiche ne se mêlent pas à celles d\'une autre', async () => {
  const b = banc();
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: TESS, changements: CHANGEMENTS });
  await b.versions.ecrire({ ficheId: 'fiche-2', nom: 'B', source: 'panneau', par: TESS, changements: CHANGEMENTS });
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: 'max@exemple.ca', changements: CHANGEMENTS });
  assert.deepEqual((await b.versions.lister('fiche-1')).map((v) => v.numero), [2, 3]);
  assert.deepEqual((await b.versions.lister('fiche-2')).map((v) => v.numero), [2]);
  const lectures = b.de('blocks.children.list').length;
  const comptes = await b.versions.compter();
  assert.deepEqual(comptes.get('fiche-1'), { nombre: 3, dernier: { le: '2026-11-25T19:00:00.000Z', par: 'max@exemple.ca', source: 'panneau' } });
  assert.equal(comptes.get('fiche-2').nombre, 2);
  assert.equal(comptes.has('fiche-3'), false);
  assert.equal(b.de('blocks.children.list').length, lectures, 'compter ne lit aucun corps de page');
});

test('rien ne s\'écrit quand rien n\'a changé', async () => {
  const b = banc();
  assert.deepEqual(await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: TESS, changements: {} }), { ecrite: false, raison: 'vide' });
  assert.equal(b.pages.size, 0);
  assert.equal(b.appels.length, 0);
});

test('une source inconnue ou une fiche absente est refusée', async () => {
  const b = banc();
  await assert.rejects(b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'autre', par: TESS, changements: CHANGEMENTS }));
  await assert.rejects(b.versions.ecrire({ ficheId: '', nom: 'A', source: 'panneau', par: TESS, changements: CHANGEMENTS }));
  assert.equal(b.pages.size, 0);
});

test('sans la base « Versions », rien ne casse : historique vide, écriture sautée avec une ligne au journal', async () => {
  const b = banc({ env: {} });
  assert.equal(b.versions.active(), false);
  assert.deepEqual(await b.versions.lister('fiche-1'), []);
  assert.equal((await b.versions.compter()).size, 0);
  assert.deepEqual(await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: TESS, changements: CHANGEMENTS }), { ecrite: false, raison: 'absente' });
  assert.equal(b.appels.length, 0, 'Notion n\'est pas appelé');
  assert.equal(b.journal.length, 1);
  assert.match(b.journal[0], /NOTION_DB_VERSIONS/);
  assert.equal(banc().versions.active(), true);
});

test('un corps de version illisible donne une version sans changements, signalée', async () => {
  const b = banc();
  await b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: TESS, changements: CHANGEMENTS });
  const [id] = [...b.pages.keys()];
  b.blocs.get(id)[0].code.rich_text = [{ type: 'text', text: { content: '{ abîmé' } }];
  const [version] = await b.versions.lister('fiche-1');
  assert.deepEqual(version.changements, {});
  assert.equal(version.illisible, true);
});

test('une panne de Notion pendant l\'écriture remonte à qui appelle', async () => {
  const b = banc({ pannes: { 'pages.create': true } });
  await assert.rejects(b.versions.ecrire({ ficheId: 'fiche-1', nom: 'A', source: 'panneau', par: TESS, changements: CHANGEMENTS }));
});

test('le verrou d\'une fiche porte un nom à part de celui des propositions', () => {
  assert.equal(cleVerrouFiche('abc'), 'fiche:abc');
});
