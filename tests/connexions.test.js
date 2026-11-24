const test = require('node:test');
const assert = require('node:assert/strict');
const { canoniser, cleMotCle } = require('../public/js/mots-cles.js');
const { calculerConnexions } = require('../public/js/connexions.js');

const r = (adresse, motsCles, type = 'Logiciel ou application') => ({ adresse, nom: adresse.toUpperCase(), typePrincipal: type, motsCles });
// Vingt fiches de remplissage, chacune avec son propre sujet, pour que les
// sujets des essais restent rares (moins de 20 % des fiches).
const remplissage = Array.from({ length: 20 }, (_, i) => r(`f${i}`, [`sujet${i}`]));

test('le pont français-anglais donne la même forme', () => {
  assert.equal(canoniser('Oncologie'), canoniser('oncology'));
  assert.equal(cleMotCle('Intelligence artificielle'), cleMotCle('artificial intelligence'));
  assert.equal(cleMotCle('santé publique'), cleMotCle('public health'));
  assert.equal(canoniser('de'), null);
});

test('deux ressources qui partagent un sujet rare sont reliées', () => {
  const { noeuds, liens } = calculerConnexions([r('a', ['Tractographie', 'neuro-imagerie']), r('b', ['tractographie']), ...remplissage]);
  assert.equal(noeuds.length, 22);
  assert.equal(liens.length, 1);
  assert.deepEqual([liens[0].a, liens[0].b].sort(), ['a', 'b']);
  assert.deepEqual(liens[0].motsCommuns, ['tractographie']);
  assert.ok(liens[0].poids > 0);
});

test('un sujet présent dans plus de 20 % des ressources ne relie rien', () => {
  const communes = Array.from({ length: 10 }, (_, i) => r(`c${i}`, ['génomique']));
  const { liens } = calculerConnexions([...communes, ...remplissage]);
  assert.equal(liens.length, 0);
});

test('le même sujet écrit en français et en anglais relie deux ressources', () => {
  const { liens } = calculerConnexions([r('a', ['oncologie']), r('b', ['Oncology']), ...remplissage]);
  assert.equal(liens.length, 1);
});

test('une ressource sans mot-clé est un nœud sans lien', () => {
  const { noeuds, liens } = calculerConnexions([r('a', []), r('b', undefined), ...remplissage]);
  assert.equal(noeuds.length, 22);
  assert.equal(liens.length, 0);
});

test('aucune ressource : graphe vide', () => {
  assert.deepEqual(calculerConnexions([]), { noeuds: [], liens: [] });
});

test('le nombre de liens par ressource est plafonné', () => {
  const groupe = Array.from({ length: 30 }, (_, i) => r(`g${i}`, ['sujetrare', `propre${i}`]));
  const autres = Array.from({ length: 200 }, (_, i) => r(`x${i}`, [`autre${i}`]));
  const { liens } = calculerConnexions([...groupe, ...autres]);
  const degre = {};
  for (const l of liens) { degre[l.a] = (degre[l.a] || 0) + 1; degre[l.b] = (degre[l.b] || 0) + 1; }
  assert.ok(Math.max(...Object.values(degre)) <= 10);
});

test('chaque nœud porte adresse, nom et type', () => {
  const { noeuds } = calculerConnexions([r('a', ['x'], 'Plateforme ou infrastructure')]);
  assert.deepEqual(noeuds[0], { adresse: 'a', nom: 'A', type: 'Plateforme ou infrastructure' });
});

// ─── Graphe par sujets ───

test('calculerSujets : les sujets fréquents deviennent des points, reliés à leurs ressources', () => {
  const { calculerSujets } = require('../public/js/connexions.js');
  const liste = [
    r('a', ['Génomique', 'cohorte']), r('b', ['génomique', 'cohorte']), r('c', ['Génomique']),
    r('d', ['oncologie', 'cohorte']), r('e', ['sujet rare']), r('f', []),
  ];
  const s = calculerSujets(liste, { FICHES_MIN: 3 });
  // Deux sujets atteignent trois fiches ; le plus fréquent d'abord, à égalité par ordre alphabétique.
  assert.deepEqual(s.sujets.map((x) => [x.nom, x.nombre]), [['cohorte', 3], ['génomique', 3]]);
  assert.ok(s.sujets.every((x) => x.id.startsWith('sujet:')));
  // Chaque lien va d'une ressource à un sujet retenu.
  const idCohorte = s.sujets[0].id, idGenomique = s.sujets[1].id;
  assert.deepEqual(s.liens.filter((l) => l.b === idGenomique).map((l) => l.a).sort(), ['a', 'b', 'c']);
  assert.deepEqual(s.liens.filter((l) => l.b === idCohorte).map((l) => l.a).sort(), ['a', 'b', 'd']);
  // Les ressources sans sujet fréquent sont comptées à part.
  assert.deepEqual(s.sansSujet.sort(), ['e', 'f']);
  assert.deepEqual(s.noeuds.map((n) => n.adresse).sort(), ['a', 'b', 'c', 'd']);
});

test('calculerSujets : le français et l\'anglais se rejoignent, liste vide sans erreur', () => {
  const { calculerSujets } = require('../public/js/connexions.js');
  const s = calculerSujets([r('a', ['Oncologie']), r('b', ['oncology']), r('c', ['oncologie'])], { FICHES_MIN: 3 });
  assert.equal(s.sujets.length, 1);
  assert.equal(s.sujets[0].nom, 'oncologie');
  assert.equal(s.sujets[0].nombre, 3);
  assert.deepEqual(calculerSujets([], {}), { noeuds: [], sujets: [], liens: [], sansSujet: [] });
});
