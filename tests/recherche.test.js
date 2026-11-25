const test = require('node:test');
const assert = require('node:assert/strict');
const { documentDeRecherche, motsDeRequete, trouveMotCourt, chercher, denombrer, statistiquesBandeau, suggestions } = require('../public/js/recherche.js');

const fiche = (nom, props = {}) => ({
  nom, adresse: nom.toLowerCase().replace(/[^a-z0-9]+/g, '-'), autresNoms: '', typePrincipal: 'Logiciel ou application', secondType: null,
  phrase: '', description: '', motsCles: [], porteurs: [], ...props,
});
const noms = (liste) => liste.map((r) => r.nom);
const documents = (liste) => liste.map(documentDeRecherche);

const catalogue = [
  fiche('Sigle', { motsCles: ['IA'] }),
  fiche('Au long', { motsCles: ['intelligence artificielle'] }),
  fiche('Anglais', { phrase: 'An artificial intelligence toolkit.' }),
  fiche('Sociaux', { description: 'Déterminants sociaux de la santé, partage de données, diagnostic familial.' }),
  fiche('Vieillir', { motsCles: ['vieillissement'], description: 'Cohorte sur l\'âge et le partage.' }),
  fiche('Imagerie', { motsCles: ['imagerie par résonance magnétique'], porteurs: [{ nom: 'Centre de recherche du CHUM (CRCHUM)' }] }),
];

test('un mot de deux lettres est cherché comme mot entier : « ia » ne ramène pas « sociaux »', () => {
  const trouvees = noms(chercher(documents(catalogue), 'ia'));
  assert.ok(trouvees.includes('Sigle'));
  assert.ok(!trouvees.includes('Sociaux'), '« sociaux », « partage » et « familial » contiennent « ia » sans être le mot');
  assert.ok(!trouvees.includes('Vieillir'));
  assert.ok(!trouvees.includes('Imagerie'));
});

test('« ia » trouve aussi l\'expression écrite au long, en français et en anglais', () => {
  const trouvees = noms(chercher(documents(catalogue), 'IA'));
  assert.deepEqual(trouvees.sort(), ['Anglais', 'Au long', 'Sigle']);
  assert.deepEqual(noms(chercher(documents(catalogue), 'irm')), ['Imagerie']);
});

test('un mot de trois lettres est cherché comme mot entier : « age » trouve « âge », pas « partage »', () => {
  assert.deepEqual(noms(chercher(documents(catalogue), 'age')), ['Vieillir']);
  const doc = documentDeRecherche(fiche('X', { description: 'partage, image, stage' }));
  assert.equal(trouveMotCourt(doc, 'age'), false);
});

test('la recherche courte ne dépend pas de la recherche floue, même si elle est fournie', () => {
  const docs = documents(catalogue);
  const floueTropLarge = () => docs.map((item) => ({ item, score: 0.1 }));
  assert.deepEqual(noms(chercher(docs, 'ia', floueTropLarge)).sort(), ['Anglais', 'Au long', 'Sigle']);
});

test('à partir de quatre lettres, la recherche floue est utilisée, avec la forme canonique', () => {
  const docs = documents(catalogue);
  const appels = [];
  const floue = (forme) => { appels.push(forme); return forme === 'imagerie' ? [{ item: docs[5], score: 0.01 }] : []; };
  assert.deepEqual(noms(chercher(docs, 'imagerie', floue)), ['Imagerie']);
  assert.ok(appels.includes('imagerie'));
  // Sans recherche floue (Fuse non chargé) : sous-chaîne.
  assert.deepEqual(noms(chercher(docs, 'vieilliss')), ['Vieillir']);
  assert.deepEqual(noms(chercher(docs, 'sociaux')), ['Sociaux']);
});

test('tous les mots de la requête doivent être trouvés ; une requête vide rend tout, dans l\'ordre', () => {
  const docs = documents(catalogue);
  assert.deepEqual(noms(chercher(docs, 'partage sociaux')), ['Sociaux']);
  assert.deepEqual(noms(chercher(docs, 'partage vieillissement')), ['Vieillir']);
  assert.deepEqual(noms(chercher(docs, 'partage introuvable')), []);
  assert.deepEqual(noms(chercher(docs, '   ')), noms(catalogue));
  assert.deepEqual(noms(chercher(docs, 'a')), noms(catalogue), 'une seule lettre ne filtre pas');
});

test('les mots vides de la requête sont ignorés quand il reste autre chose', () => {
  assert.deepEqual(motsDeRequete('partage de données'), ['partage', 'donnees']);
  assert.deepEqual(motsDeRequete('de'), ['de']);
  assert.deepEqual(noms(chercher(documents(catalogue), 'déterminants de la santé')), ['Sociaux']);
});

test('denombrer regroupe les écritures d\'un même sujet et compte une fiche une seule fois', () => {
  const { sujets, porteurs } = denombrer([
    fiche('A', { motsCles: ['Génomique', 'génomique', 'IA'], porteurs: [{ nom: 'Mila' }, { nom: 'Mila' }] }),
    fiche('B', { motsCles: ['genomique'], porteurs: [{ nom: 'Mila' }, { nom: 'ISQ' }] }),
  ]);
  assert.deepEqual(sujets.map((s) => [s.sujet, s.nombre]), [['Génomique', 2], ['IA', 1]]);
  assert.deepEqual(porteurs.map((p) => [p.nom, p.nombre]), [['Mila', 2], ['ISQ', 1]]);
});

test('statistiquesBandeau : ressources, porteurs, types dans l\'ordre de la légende, principaux sujets et porteurs', () => {
  const s = statistiquesBandeau([
    fiche('A', { typePrincipal: 'Logiciel ou application', motsCles: ['oncologie', 'IA'], porteurs: [{ nom: 'Mila' }] }),
    fiche('B', { typePrincipal: 'Jeu de données, cohorte ou biobanque', motsCles: ['oncologie'], porteurs: [{ nom: 'Mila' }, { nom: 'ISQ' }] }),
    fiche('C', { typePrincipal: 'Logiciel ou application', secondType: 'Service ou accompagnement', motsCles: ['oncologie', 'génomique'], porteurs: [] }),
    fiche('D', { typePrincipal: 'Type inconnu' }),
  ], 2);
  assert.equal(s.ressources, 4);
  assert.equal(s.porteurs, 2);
  assert.deepEqual(s.types, [
    { type: 'Jeu de données, cohorte ou biobanque', cle: 'jeu', nombre: 1 },
    { type: 'Logiciel ou application', cle: 'logiciel', nombre: 2 },
    { type: null, cle: 'autre', nombre: 1 },
  ]);
  assert.equal(s.types.reduce((n, t) => n + t.nombre, 0), 4, 'chaque fiche compte une fois, par son type principal');
  assert.deepEqual(s.sujets[0], { sujet: 'oncologie', nombre: 3 });
  assert.equal(s.sujets.length, 2);
  assert.deepEqual(s.porteursPrincipaux, [{ nom: 'Mila', nombre: 2 }, { nom: 'ISQ', nombre: 1 }]);
  assert.deepEqual(statistiquesBandeau([]), { ressources: 0, porteurs: 0, types: [], sujets: [], porteursPrincipaux: [] });
});

test('suggestions : sujets, porteurs, puis ressources dont un mot du nom commence par la saisie', () => {
  const liste = [
    fiche('CARTaGENE', { motsCles: ['génomique', 'cohorte'], porteurs: [{ nom: 'CHU Sainte-Justine' }] }),
    fiche('Carnet de santé', { adresse: 'carnet-de-sante', motsCles: ['cartographie'], porteurs: [{ nom: 'Centre de recherche du CHUM (CRCHUM)' }] }),
    fiche('Génome Québec', { motsCles: ['génomique'], porteurs: [{ nom: 'Génome Québec' }] }),
  ];
  const s = suggestions(liste, 'géno');
  assert.deepEqual(s.map((x) => [x.genre, x.libelle]), [
    ['sujet', 'génomique'], ['porteur', 'Génome Québec'], ['ressource', 'Génome Québec'],
  ]);
  assert.equal(s[0].nombre, 2);
  const car = suggestions(liste, 'car');
  assert.deepEqual(car.filter((x) => x.genre === 'ressource').map((x) => [x.valeur, x.detail]), [['cartagene', 'CHU Sainte-Justine'], ['carnet-de-sante', 'CRCHUM']]);
  assert.deepEqual(car.filter((x) => x.genre === 'sujet').map((x) => x.libelle), ['cartographie']);
  assert.deepEqual(suggestions(liste, 'g'), [], 'pas de suggestion avant deux lettres');
  assert.deepEqual(suggestions([], 'géno'), []);
});

test('suggestions : deux ou trois lettres ne proposent que des débuts de mot', () => {
  const liste = [fiche('A', { motsCles: ['IA', 'déterminants sociaux'], porteurs: [{ nom: 'Institut familial' }] })];
  assert.deepEqual(suggestions(liste, 'ia').map((x) => x.libelle), ['IA']);
});

test('la recherche lit aussi les normes et les outils d\'une fiche', () => {
  const liste = [fiche('Avec', { normes: ['HL7 FHIR', 'DICOM'], outils: ['Docker'] }), fiche('Sans')];
  const docs = documents(liste);
  assert.ok(docs[0].plie.includes('fhir') && docs[0].plie.includes('docker'));
  assert.equal(docs[0].normes, 'HL7 FHIR DICOM Docker');
  assert.equal(docs[1].normes, '');
  assert.deepEqual(noms(chercher(docs, 'fhir')), ['Avec']);
});
