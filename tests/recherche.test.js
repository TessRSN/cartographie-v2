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
  // « génomique » est dans la table des libellés : c'est son écriture qui s'affiche.
  assert.deepEqual(sujets.map((s) => [s.sujet, s.nombre]), [['génomique', 2], ['IA', 1]]);
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
  assert.deepEqual(statistiquesBandeau([]), { ressources: 0, porteurs: 0, types: [], sujets: [], porteursPrincipaux: [], normesPrincipales: [] });
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

test('statistiquesBandeau : principales normes et formats, de la plus fréquente à la moins fréquente', () => {
  const s = statistiquesBandeau([
    fiche('A', { normes: ['BIDS', 'DICOM'] }), fiche('B', { normes: ['BIDS', 'BIDS'] }), fiche('C', { normes: ['DICOM', 'NIfTI'] }),
    fiche('D', { normes: ['BIDS'], outils: ['Docker'] }), fiche('E', {}),
  ], 2);
  assert.deepEqual(s.normesPrincipales, [{ norme: 'BIDS', nombre: 3 }, { norme: 'DICOM', nombre: 2 }]);
  assert.deepEqual(statistiquesBandeau([fiche('X')], 6).normesPrincipales, []);
});

// ─── Sujets regroupés par leur clé commune, libellés dans la langue du site ───

const bilingue = [
  fiche('Alpha', { motsCles: ['apprentissage automatique', 'neuro-imagerie'], normes: ['CIM-10'] }),
  fiche('Beta', { motsCles: ['Machine learning', 'neuroimaging'] }),
  fiche('Gamma', { motsCles: ['machine learning', 'cartographie des savoirs'] }),
  fiche('Delta', { motsCles: ['oncologie'] }),
];

test('denombrer : le français et l\'anglais d\'un même sujet comptent ensemble, libellé dans la langue demandée', () => {
  const enFrancais = denombrer(bilingue).sujets;
  assert.deepEqual(enFrancais.map((s) => [s.sujet, s.nombre]), [
    ['apprentissage automatique', 3], ['neuro-imagerie', 2], ['cartographie des savoirs', 1], ['oncologie', 1],
  ]);
  assert.deepEqual(denombrer(bilingue, 'fr').sujets, enFrancais, 'le français par défaut');
  const enAnglais = denombrer(bilingue, 'en').sujets;
  assert.deepEqual(enAnglais.map((s) => [s.sujet, s.nombre]), [
    ['machine learning', 3], ['neuroimaging', 2], ['cartographie des savoirs', 1], ['oncology', 1],
  ], 'un sujet sans libellé anglais reste en français');
  // Hors de la table des libellés : l'écriture la plus fréquente ; à égalité, la première rencontrée.
  const hors = (liste) => denombrer(liste.map((motCle, i) => fiche(`F${i}`, { motsCles: [motCle] }))).sujets.map((s) => [s.sujet, s.nombre]);
  assert.deepEqual(hors(['Savoirs locaux', 'savoirs locaux', 'savoirs locaux']), [['savoirs locaux', 3]]);
  assert.deepEqual(hors(['Savoirs locaux', 'savoirs locaux']), [['Savoirs locaux', 2]]);
});

test('statistiquesBandeau : les principaux sujets regroupés suivent la langue', () => {
  assert.deepEqual(statistiquesBandeau(bilingue, 2).sujets, [{ sujet: 'apprentissage automatique', nombre: 3 }, { sujet: 'neuro-imagerie', nombre: 2 }]);
  assert.deepEqual(statistiquesBandeau(bilingue, 2, 'en').sujets, [{ sujet: 'machine learning', nombre: 3 }, { sujet: 'neuroimaging', nombre: 2 }]);
});

test('suggestions : un sujet se propose par le début de son écriture française ou anglaise', () => {
  const sujets = (requete, langue) => suggestions(bilingue, requete, langue).filter((x) => x.genre === 'sujet').map((x) => [x.libelle, x.valeur, x.nombre]);
  assert.deepEqual(sujets('appren'), [['apprentissage automatique', 'apprentissage automatique', 3]]);
  assert.deepEqual(sujets('machi'), [['apprentissage automatique', 'apprentissage automatique', 3]]);
  assert.deepEqual(sujets('appren', 'en'), [['machine learning', 'machine learning', 3]]);
  assert.deepEqual(sujets('machi', 'en'), [['machine learning', 'machine learning', 3]]);
  // Le libellé anglais de la table déclenche aussi la suggestion, même si aucune fiche ne l'écrit.
  assert.deepEqual(sujets('onco'), [['oncologie', 'oncologie', 1]]);
  assert.deepEqual(sujets('oncology'), [['oncologie', 'oncologie', 1]]);
  assert.deepEqual(sujets('neuroim'), [['neuro-imagerie', 'neuro-imagerie', 2]]);
});

test('la valeur d\'un sujet proposé, une fois cherchée, trouve les fiches des deux langues', () => {
  const docs = documents(bilingue);
  for (const langue of ['fr', 'en']) {
    for (const requete of ['appren', 'machi', 'neuro']) {
      const [sujet] = suggestions(bilingue, requete, langue).filter((x) => x.genre === 'sujet');
      const attendues = requete === 'neuro' ? ['Alpha', 'Beta'] : ['Alpha', 'Beta', 'Gamma'];
      assert.deepEqual(noms(chercher(docs, sujet.valeur)).sort(), attendues, `${langue} : « ${sujet.valeur} »`);
    }
    // Chaque sujet du portrait, une fois cliqué, ramène exactement les fiches qu'il compte.
    for (const { sujet, nombre } of statistiquesBandeau(bilingue, 6, langue).sujets) {
      assert.equal(chercher(docs, sujet).length, nombre, `${langue} : « ${sujet} »`);
    }
  }
  // Une norme cherchée sous son nom anglais trouve la fiche qui l'écrit en français.
  assert.deepEqual(noms(chercher(docs, 'ICD-10')), ['Alpha']);
  // Les fiches qui portent le sujet entier passent devant celles qui n'en contiennent que les mots.
  const melange = documents([fiche('Texte', { description: 'On y parle de machine learning.' }), fiche('Sujet', { motsCles: ['apprentissage automatique'] })]);
  assert.deepEqual(noms(chercher(melange, 'machine learning')), ['Sujet', 'Texte']);
});
