const test = require('node:test');
const assert = require('node:assert/strict');
const { comparerTextes, comparerListes } = require('../public/js/comparaison.js');

const cote = (segments, sortes) => segments.filter((s) => sortes.includes(s.sorte)).map((s) => s.texte).join('');

test('deux textes identiques : un seul segment égal ; deux textes vides : rien', () => {
  assert.deepEqual(comparerTextes('Une phrase.', 'Une phrase.'), [{ texte: 'Une phrase.', sorte: 'egal' }]);
  assert.deepEqual(comparerTextes('', ''), []);
  assert.deepEqual(comparerTextes(null, undefined), []);
});

test('un texte ajouté ou retiré en entier', () => {
  assert.deepEqual(comparerTextes('', 'Nouveau texte'), [{ texte: 'Nouveau texte', sorte: 'ajoute' }]);
  assert.deepEqual(comparerTextes('Ancien texte', null), [{ texte: 'Ancien texte', sorte: 'retire' }]);
});

test('un mot ajouté au milieu d\'une phrase : seul ce mot est marqué', () => {
  const avant = 'Le lac de données cliniques du CHUM, avec une équipe pour accompagner les projets.';
  const apres = 'Le lac de données cliniques du CHUM, avec une équipe de science des données pour accompagner les projets.';
  const segments = comparerTextes(avant, apres);
  assert.deepEqual(segments.map((s) => s.sorte), ['egal', 'ajoute', 'egal']);
  assert.equal(segments[1].texte.trim(), 'de science des données');
  assert.equal(cote(segments, ['egal', 'retire']), avant);
  assert.equal(cote(segments, ['egal', 'ajoute']), apres);
});

test('un mot remplacé : le retrait puis l\'ajout, le reste égal', () => {
  const segments = comparerTextes('Couvre 1996 à 2021 au Québec.', 'Couvre 1996 à aujourd’hui au Québec.');
  assert.deepEqual(segments, [
    { texte: 'Couvre 1996 à ', sorte: 'egal' }, { texte: '2021', sorte: 'retire' }, { texte: 'aujourd’hui', sorte: 'ajoute' }, { texte: ' au Québec.', sorte: 'egal' },
  ]);
});

test('chaque côté se reconstruit à l\'identique, sauts de ligne compris', () => {
  const avant = 'Premier paragraphe.\n\nSecond paragraphe, plus long, avec des détails.\nFin.';
  const apres = 'Premier paragraphe revu.\n\nSecond paragraphe, avec des détails et un ajout.\n\nFin.';
  const segments = comparerTextes(avant, apres);
  assert.equal(cote(segments, ['egal', 'retire']), avant);
  assert.equal(cote(segments, ['egal', 'ajoute']), apres);
  assert.ok(segments.every((s) => s.texte !== '' && ['egal', 'retire', 'ajoute'].includes(s.sorte)));
  // Deux segments voisins n'ont jamais la même sorte.
  assert.ok(segments.every((s, i) => i === 0 || s.sorte !== segments[i - 1].sorte));
});

test('deux textes qui n\'ont presque rien en commun : tout est remplacé, sans découpage mot à mot', () => {
  const avant = 'Les grappes de calcul et le stockage offerts aux équipes de recherche du Québec.';
  const apres = 'La meilleure infrastructure au pays, à essayer dès maintenant avec notre partenaire.';
  assert.deepEqual(comparerTextes(avant, apres), [{ texte: avant, sorte: 'retire' }, { texte: apres, sorte: 'ajoute' }]);
});

test('un texte long se compare sans peine, et reste exact', () => {
  const mots = Array.from({ length: 1200 }, (_, i) => `mot${i % 97}`);
  const avant = mots.join(' ');
  const apres = [...mots.slice(0, 600), 'ajout', ...mots.slice(600)].join(' ');
  const segments = comparerTextes(avant, apres);
  assert.equal(cote(segments, ['egal', 'retire']), avant);
  assert.equal(cote(segments, ['egal', 'ajoute']), apres);
  assert.equal(segments.filter((s) => s.sorte === 'ajoute').length, 1);
});

test('des valeurs qui ne sont pas du texte sont lues comme du texte', () => {
  assert.deepEqual(comparerTextes(2021, 2022), [{ texte: '2021', sorte: 'retire' }, { texte: '2022', sorte: 'ajoute' }]);
});

test('deux listes d\'étiquettes : gardées, retirées, ajoutées, dans leur ordre', () => {
  assert.deepEqual(comparerListes(['BIDS', 'MINC', 'fhir'], ['BIDS', 'MINC', 'HL7 FHIR', 'NIfTI']), { gardes: ['BIDS', 'MINC'], retires: ['fhir'], ajoutes: ['HL7 FHIR', 'NIfTI'] });
  assert.deepEqual(comparerListes(['a', 'b'], ['b', 'a']), { gardes: ['a', 'b'], retires: [], ajoutes: [] });
  assert.deepEqual(comparerListes([], ['x']), { gardes: [], retires: [], ajoutes: ['x'] });
  assert.deepEqual(comparerListes(['x'], null), { gardes: [], retires: ['x'], ajoutes: [] });
  assert.deepEqual(comparerListes(undefined, undefined), { gardes: [], retires: [], ajoutes: [] });
});

test('listes : un doublon ne compte qu\'une fois, une valeur vide est ignorée', () => {
  assert.deepEqual(comparerListes(['a', 'a', ''], ['a', 'b', 'b', null]), { gardes: ['a'], retires: [], ajoutes: ['b'] });
});

test('deux écritures du même accent (composée ou décomposée) ne sont pas un changement', () => {
  const { comparerTextes: cmp, comparerListes: listes } = require('../public/js/comparaison.js');
  const compose = 'Un café serré'; const decompose = 'Un café serré';
  assert.deepEqual(cmp(decompose, compose).map((x) => x.sorte), ['egal']);
  assert.deepEqual(cmp(decompose, `${compose} noir`).map((x) => x.sorte), ['egal', 'ajoute']);
  const l = listes(['santé'], ['santé', 'cancer']);
  assert.deepEqual(l, { gardes: ['sant\u00e9'], retires: [], ajoutes: ['cancer'] });
});
