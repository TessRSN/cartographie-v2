const test = require('node:test');
const assert = require('node:assert/strict');
const { creerJournal, GESTES, COLONNES } = require('../lib/journal');
const { fauxNotion } = require('./aides/faux-notion');

const ENV = { NOTION_DB_JOURNAL: 'base-journal' };
const T0 = Date.parse('2026-11-25T15:00:00.000Z');

function banc({ env = ENV, pannes = {} } = {}) {
  const faux = fauxNotion({ pannes });
  const lignes = [];
  let instant = T0;
  const journal = creerJournal(faux.client, env, { maintenant: () => instant, journal: (...l) => lignes.push(l.join(' ')) });
  return { faux, journal, lignes, avancer: (ms) => { instant += ms; } };
}

test('les gestes du journal sont ceux de la colonne « Geste » de la base', () => {
  assert.deepEqual(GESTES, ['Approbation', 'Refus', 'Second regard', 'Fiche modifiée', 'Fiche créée', 'Version rétablie', 'Fiche écartée', 'Fiche republiée', 'Fiche vérifiée', 'Fiche à revoir',
    'Porteur créé', 'Porteur modifié', 'Porteurs fusionnés', 'Valeurs fusionnées', 'Invitation', 'Rôle changé', 'Personne retirée', 'Résumé réglé', 'Modification proposée',
    'Courriel modifié', 'Courriel rétabli', "Mode d'essai changé", "Adresse d'essai changée",
    'Contributions ouvertes', 'Contributions fermées', 'Réglages modifiés', 'Sauvegarde faite', 'Sauvegarde téléchargée']);
  assert.deepEqual(COLONNES, { titre: 'Titre', faitLe: 'Fait le', faitPar: 'Fait par', geste: 'Geste', sur: 'Sur' });
});

test('noter écrit une ligne : la phrase en titre, la date, le courriel, le geste et ce sur quoi il porte', async () => {
  const b = banc();
  assert.equal(await b.journal.noter({ geste: 'Fiche modifiée', par: ' Tess@Exemple.ca ', sur: 'Cohorte X', phrase: 'a modifié la fiche de Cohorte X' }), true);
  const [ecrit] = b.faux.de('pages.create');
  assert.deepEqual(ecrit.parent, { database_id: 'base-journal' });
  assert.equal(ecrit.properties.Titre.title[0].text.content, 'a modifié la fiche de Cohorte X');
  assert.deepEqual(ecrit.properties['Fait le'], { date: { start: '2026-11-25T15:00:00.000Z' } });
  assert.deepEqual(ecrit.properties['Fait par'], { email: 'tess@exemple.ca' });
  assert.deepEqual(ecrit.properties.Geste, { select: { name: 'Fiche modifiée' } });
  assert.equal(ecrit.properties.Sur.rich_text[0].text.content, 'Cohorte X');
  assert.deepEqual(Object.keys(ecrit.properties).sort(), ['Fait le', 'Fait par', 'Geste', 'Sur', 'Titre']);
});

test('noter ne lève jamais : Notion en panne, geste inconnu ou ligne vide, tout va au journal du serveur', async () => {
  const b = banc({ pannes: { 'pages.create': true } });
  assert.equal(await b.journal.noter({ geste: 'Approbation', par: 'tess@exemple.ca', sur: 'X', phrase: 'a approuvé X' }), false);
  assert.match(b.lignes.join('\n'), /\[journal\]/);
  const c = banc();
  assert.equal(await c.journal.noter({ geste: 'Geste inventé', par: 'tess@exemple.ca', sur: 'X', phrase: 'a fait X' }), false);
  assert.equal(await c.journal.noter({ geste: 'Approbation', par: 'tess@exemple.ca', sur: 'X', phrase: '   ' }), false);
  assert.equal(await c.journal.noter(), false);
  assert.equal(await c.journal.noter(null), false);
  assert.equal(c.faux.de('pages.create').length, 0);
  assert.ok(c.lignes.length >= 3);
});

test('un texte trop long est coupé, un retour de ligne devient une espace', async () => {
  const b = banc();
  await b.journal.noter({ geste: 'Approbation', par: 'tess@exemple.ca', sur: `A\nB${'x'.repeat(500)}`, phrase: `a approuvé\n${'y'.repeat(900)}` });
  const [ecrit] = b.faux.de('pages.create');
  const titre = ecrit.properties.Titre.title.map((s) => s.text.content).join('');
  const sur = ecrit.properties.Sur.rich_text.map((s) => s.text.content).join('');
  assert.ok(titre.length <= 300 && titre.startsWith('a approuvé y'));
  assert.ok(sur.length <= 200 && sur.startsWith('A Bx'));
});

test('sans la base « Journal », rien ne s\'écrit, rien ne se lit et rien n\'échoue', async () => {
  const b = banc({ env: {} });
  assert.equal(b.journal.active(), false);
  assert.equal(await b.journal.noter({ geste: 'Approbation', par: 'tess@exemple.ca', sur: 'X', phrase: 'a approuvé X' }), false);
  assert.deepEqual(await b.journal.lire(), []);
  assert.equal(b.faux.appels.length, 0);
});

test('lire rend les lignes de la plus récente à la plus ancienne, dans la limite demandée', async () => {
  const b = banc();
  assert.equal(b.journal.active(), true);
  for (let i = 1; i <= 4; i++) {
    await b.journal.noter({ geste: 'Fiche vérifiée', par: 'tess@exemple.ca', sur: `Fiche ${i}`, phrase: `a marqué Fiche ${i} comme vérifiée` });
    b.avancer(60000);
  }
  const lues = await b.journal.lire({ limite: 3 });
  assert.deepEqual(lues.map((l) => l.sur), ['Fiche 4', 'Fiche 3', 'Fiche 2']);
  assert.deepEqual(lues[0], { le: '2026-11-25T15:03:00.000Z', par: 'tess@exemple.ca', geste: 'Fiche vérifiée', sur: 'Fiche 4', phrase: 'a marqué Fiche 4 comme vérifiée' });
  const requete = b.faux.de('databases.query').pop();
  assert.equal(requete.database_id, 'base-journal');
  assert.deepEqual(requete.sorts, [{ property: 'Fait le', direction: 'descending' }]);
  assert.equal((await b.journal.lire()).length, 4, 'cinquante par défaut');
});

test('une panne de lecture remonte : c\'est l\'écran qui décide quoi montrer', async () => {
  const b = banc({ pannes: { 'databases.query': true } });
  await assert.rejects(() => b.journal.lire());
});
