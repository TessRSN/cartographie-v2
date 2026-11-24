const test = require('node:test');
const assert = require('node:assert/strict');
const { ficheDepuisPage, porteurDepuisPage } = require('../lib/notion');
const { nomLisible, assembler } = require('../lib/fiches');
const f = require('./fixtures/pages');

const brute = (id, nom, props) => ficheDepuisPage(f.pageRessource(id, nom, props));
const porteur = (id, nom, opts) => porteurDepuisPage(f.pagePorteur(id, nom, opts));

test('nomLisible enlève accents, majuscules et ponctuation', () => {
  assert.equal(nomLisible('Biobanque institutionnelle mère-enfant'), 'biobanque-institutionnelle-mere-enfant');
  assert.equal(nomLisible('MEDTEQ+'), 'medteq');
  assert.equal(nomLisible("  Centre d'accès pour la recherche  "), 'centre-d-acces-pour-la-recherche');
  assert.equal(nomLisible('???'), '');
});

test('une fiche écartée n\'existe pas pour le site', () => {
  const { ressources } = assembler([
    brute('a', 'Gardée'),
    brute('b', 'Retirée', { 'Statut de la fiche': f.sel('Écartée') }),
  ], []);
  assert.deepEqual(ressources.map((r) => r.nom), ['Gardée']);
});

test('aucun champ interne ni identifiant Notion ne sort', () => {
  const { ressources } = assembler([ficheDepuisPage(f.ressourceComplete), ficheDepuisPage(f.ressourceMinimale)], [porteurDepuisPage(f.porteurAvecLieu)]);
  for (const r of ressources) {
    for (const cle of ['statutFiche', 'id', 'porteurIds', 'faitPartieDe', 'reposeSur', 'donneAccesA', 'remplace']) {
      assert.ok(!(cle in r), `${cle} ne doit pas sortir`);
    }
  }
  assert.ok(!JSON.stringify(ressources).includes('r-1'));
});

test('le type est affiché avec son libellé public', () => {
  const { ressources } = assembler([ficheDepuisPage(f.ressourceComplete)], []);
  assert.equal(ressources[0].typePrincipal, 'Jeu de données, cohorte ou biobanque');
  assert.equal(ressources[0].secondType, 'Catalogue ou entrepôt de données');
});

test('deux ressources de même nom sont départagées par leur porteur', () => {
  const porteurs = [porteur('p1', 'Groupe informatique de santé Opal'), porteur('p2', 'OBiBa')];
  const { ressources } = assembler([
    brute('a', 'Opal', { 'Porté par': f.rel('p1') }),
    brute('b', 'Opal', { 'Porté par': f.rel('p2') }),
    brute('c', 'LORIS'),
  ], porteurs);
  const adresses = ressources.map((r) => r.adresse).sort();
  assert.deepEqual(adresses, ['loris', 'opal-groupe-informatique-de-sante-opal', 'opal-obiba']);
});

test('deux ressources de même nom sans porteur reçoivent un numéro', () => {
  const { ressources } = assembler([brute('b', 'Jumeau'), brute('a', 'Jumeau')], []);
  assert.deepEqual(ressources.map((r) => r.adresse).sort(), ['jumeau', 'jumeau-2']);
});

test('les adresses ne dépendent pas de l\'ordre de lecture', () => {
  const fiches = [brute('b', 'Jumeau'), brute('a', 'Jumeau'), brute('c', 'Autre')];
  const versAdresses = (liste) => Object.fromEntries(assembler(liste, []).ressources.map((r) => [r.phrase + r.nom + r.adresse, r.adresse]));
  const un = assembler(fiches, []).ressources.map((r) => r.adresse);
  const deux = assembler([...fiches].reverse(), []).ressources.map((r) => r.adresse);
  assert.deepEqual(un, deux);
  assert.ok(versAdresses(fiches));
});

test('un nom sans lettre ni chiffre reçoit quand même une adresse', () => {
  const { ressources } = assembler([brute('a', '???')], []);
  assert.equal(ressources[0].adresse, 'ressource');
});

test('le lieu est celui du premier porteur qui a des coordonnées', () => {
  const porteurs = [porteur('p1', 'Sans lieu'), porteur('p2', 'Avec lieu', { latitude: 46.8, longitude: -71.2 })];
  const { ressources } = assembler([
    brute('a', 'Placée', { 'Porté par': f.rel('p1', 'p2') }),
    brute('b', 'Sans porteur'),
    brute('c', 'Porteur sans lieu', { 'Porté par': f.rel('p1') }),
  ], porteurs);
  const parNom = Object.fromEntries(ressources.map((r) => [r.nom, r]));
  assert.deepEqual(parNom['Placée'].lieu, { latitude: 46.8, longitude: -71.2, porteur: 'Avec lieu' });
  assert.equal(parNom['Sans porteur'].lieu, null);
  assert.equal(parNom['Porteur sans lieu'].lieu, null);
  assert.deepEqual(parNom['Placée'].porteurs.map((p) => p.nom), ['Sans lieu', 'Avec lieu']);
});

test('un porteur inconnu ou supprimé est ignoré sans erreur', () => {
  const { ressources } = assembler([brute('a', 'Orpheline', { 'Porté par': f.rel('disparu') })], []);
  assert.deepEqual(ressources[0].porteurs, []);
});

test('les liens entre fiches portent nature, adresse et nom, et ignorent les fiches écartées', () => {
  const { ressources } = assembler([
    brute('a', 'Guichet', { 'Donne accès à': f.rel('b', 'c'), 'Repose sur': f.rel('b') }),
    brute('b', 'Registre'),
    brute('c', 'Retirée', { 'Statut de la fiche': f.sel('Écartée') }),
  ], []);
  const guichet = ressources.find((r) => r.nom === 'Guichet');
  assert.deepEqual(guichet.liens, [
    { nature: 'repose sur', adresse: 'registre', nom: 'Registre' },
    { nature: 'donne accès à', adresse: 'registre', nom: 'Registre' },
  ]);
});

test('seuls les porteurs d\'une fiche publique sortent, sans identifiant', () => {
  const porteurs = [porteur('p1', 'Utile', { latitude: 45, longitude: -73 }), porteur('p2', 'Inutile')];
  const resultat = assembler([brute('a', 'Fiche', { 'Porté par': f.rel('p1') })], porteurs);
  assert.deepEqual(resultat.porteurs, [{ nom: 'Utile', latitude: 45, longitude: -73 }]);
});

test('nomLisible traite les ligatures et borne la longueur', () => {
  assert.equal(nomLisible('Cœur et Œil, Lætitia'), 'coeur-et-oeil-laetitia');
  const long = nomLisible('mot '.repeat(80));
  assert.ok(long.length <= 80, `longueur ${long.length}`);
  assert.ok(!long.endsWith('-'));
});

test('une adresse reste acceptable par le serveur même pour un nom très long et des homonymes', () => {
  const nom = 'Très long nom '.repeat(30);
  const { ressources } = assembler([
    brute('a', nom, { 'Porté par': f.rel('p1') }), brute('b', nom, { 'Porté par': f.rel('p1') }),
  ], [porteur('p1', 'Porteur au nom lui aussi très long '.repeat(10))]);
  for (const r of ressources) assert.match(r.adresse, /^[a-z0-9-]{1,200}$/);
  assert.notEqual(ressources[0].adresse, ressources[1].adresse);
});

test('le logo sort seulement si c\'est une adresse http(s)', () => {
  const { ressources } = assembler([
    brute('a', 'Avec', { 'Logo': f.url('https://exemple.org/logo.png') }),
    brute('b', 'Douteux', { 'Logo': f.url('javascript:alert(1)') }),
    brute('c', 'Sans'),
  ], []);
  const parNom = Object.fromEntries(ressources.map((r) => [r.nom, r.logo]));
  assert.deepEqual(parNom, { Avec: 'https://exemple.org/logo.png', Douteux: null, Sans: null });
});
