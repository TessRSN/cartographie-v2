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
  // « IA » seul est le sujet « intelligence artificielle » (décision du 2026-11-26).
  assert.deepEqual(sujets.map((s) => [s.sujet, s.nombre]), [['génomique', 2], ['intelligence artificielle', 1]]);
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
  // Le sujet écrit « IA » est proposé sous son libellé ; « déterminants sociaux » ne l'est pas.
  assert.deepEqual(suggestions(liste, 'ia').map((x) => x.libelle), ['intelligence artificielle']);
});

test('suggestions : un sigle tapé propose son sujet, même si aucune fiche n\'écrit le sigle', () => {
  const liste = [fiche('A', { motsCles: ['intelligence artificielle'] }), fiche('B', { motsCles: ['aide à la décision'] })];
  assert.equal(suggestions(liste, 'ia')[0].libelle, 'intelligence artificielle');
  assert.equal(suggestions(liste, 'AI')[0].libelle, 'intelligence artificielle');
  assert.equal(suggestions(liste, 'ai', 'en')[0].libelle, 'artificial intelligence');
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
  }
  // Une norme cherchée sous son nom anglais trouve la fiche qui l'écrit en français.
  assert.deepEqual(noms(chercher(docs, 'ICD-10')), ['Alpha']);
  // Les fiches qui portent le sujet entier passent devant celles qui n'en contiennent que les mots.
  const melange = documents([fiche('Texte', { description: 'On y parle de machine learning.' }), fiche('Sujet', { motsCles: ['apprentissage automatique'] })]);
  assert.deepEqual(noms(chercher(melange, 'machine learning')), ['Sujet', 'Texte']);
});

test('un sujet du portrait, une fois cliqué : ses fiches sont toutes là, avant celles qui ne le portent pas', () => {
  const liste = bilingue.concat([
    fiche('Epsilon', { description: 'Un outil de machine learning pour la neuro-imagerie et l apprentissage automatique.' }),
    fiche('Oncologie pour tous', { motsCles: ['nutrition'] }),
  ]);
  const docs = documents(liste);
  for (const langue of ['fr', 'en']) {
    for (const { sujet, cle, nombre } of denombrer(liste, langue).sujets) {
      const trouvees = chercher(docs, sujet);
      const porte = (r) => documentDeRecherche(r).clesSujets.has(cle);
      const parNom = (r) => r.nom.toLowerCase().includes(sujet.toLowerCase());
      assert.equal(trouvees.filter(porte).length, nombre, `${langue} : toutes les fiches de « ${sujet} » sont trouvées`);
      const rangs = trouvees.map((r) => (parNom(r) ? 0 : porte(r) ? 1 : 2));
      assert.deepEqual(rangs, [...rangs].sort(), `${langue} : « ${sujet} », le nom, puis le sujet, puis le reste`);
    }
  }
  // Le clic peut ramener plus de fiches que le sujet n'en compte : celles qui en parlent sans le porter.
  assert.deepEqual(noms(chercher(docs, 'apprentissage automatique')), ['Alpha', 'Beta', 'Gamma', 'Epsilon']);
  assert.deepEqual(noms(chercher(docs, 'oncologie')), ['Oncologie pour tous', 'Delta']);
});

// ─── Relecture : pas de bruit par la forme canonique, classement, suggestions ───

const fige = [
  fiche('Souches', { motsCles: ['cellule souche'] }),
  fiche('Stem', { motsCles: ['stem cells'] }),
  fiche('Systeme', { description: 'A health information system for hospitals.' }),
  fiche('Rares', { motsCles: ['maladie rare'] }),
  fiche('Infrarouge', { motsCles: ['spectroscopie proche infrarouge fonctionnelle'] }),
  fiche('Aidants', { description: 'Pour les proches des patients.' }),
  fiche('Lineaire', { motsCles: ['modèle linéaire'] }),
  fiche('Longue', { motsCles: ['covid longue'] }),
  fiche('Longitudinale', { motsCles: ['étude longitudinale'] }),
  fiche('Apprenant', { motsCles: ['système de santé apprenant'] }),
  fiche('Profond', { motsCles: ['apprentissage profond'] }),
  fiche('Calcul', { motsCles: ['calcul de haute performance'] }),
  fiche('Informatique', { motsCles: ['informatique de la santé'] }),
  fiche('Automatique', { motsCles: ['apprentissage automatique'] }),
  fiche('Neuro', { motsCles: ['neuro-imagerie'], normes: ['CIM-10'] }),
  fiche('Partage', { motsCles: ['partage de données'] }),
  fiche('Fonctionnelle', { motsCles: ['irm fonctionnelle'] }),
  fiche('Graphique', { motsCles: ['processeur graphique'] }),
];

test('un mot cherché ne ramène pas les fiches où sa traduction n\'est qu\'un morceau d\'un autre mot', () => {
  const docs = documents(fige);
  const trouve = (requete) => noms(chercher(docs, requete)).sort();
  assert.deepEqual(trouve('souche'), ['Souches', 'Stem'], '« stem » ne trouve pas « system »');
  assert.deepEqual(trouve('rare'), ['Rares'], '« rare » ne trouve pas « infrared »');
  assert.deepEqual(trouve('rares'), ['Rares']);
  assert.deepEqual(trouve('proche'), ['Aidants', 'Infrarouge'], '« near » ne trouve pas « linear »');
  assert.deepEqual(trouve('longue'), ['Longue'], '« long » ne trouve pas « longitudinal »');
  assert.deepEqual(trouve('apprenant'), ['Apprenant'], '« apprenant » n\'est pas « apprentissage »');
  assert.deepEqual(trouve('calcul'), ['Calcul'], '« calcul » n\'est pas « informatique »');
  assert.deepEqual(trouve('informatique'), ['Informatique']);
});

test('les rapprochements voulus entre les deux langues restent trouvés', () => {
  const docs = documents(fige);
  const trouve = (requete) => noms(chercher(docs, requete)).sort();
  assert.deepEqual(trouve('machine learning'), ['Automatique']);
  assert.deepEqual(trouve('neuroimaging'), ['Neuro']);
  assert.deepEqual(trouve('ICD-10'), ['Neuro']);
  assert.deepEqual(trouve('high performance computing'), ['Calcul']);
  assert.deepEqual(trouve('data sharing'), ['Partage']);
  assert.deepEqual(trouve('fmri'), ['Fonctionnelle']);
  assert.deepEqual(trouve('gpu'), ['Graphique']);
  assert.deepEqual(trouve('learning'), ['Automatique', 'Profond'], 'un mot anglais trouve sa traduction en mot entier');
  assert.deepEqual(trouve('stem cells'), ['Souches', 'Stem']);
});

test('la forme canonique d\'un mot n\'est jamais passée à la recherche floue', () => {
  const docs = documents(fige);
  const appels = [];
  const floue = (forme) => { appels.push(forme); return []; };
  assert.deepEqual(noms(chercher(docs, 'souche', floue)).sort(), ['Souches', 'Stem']);
  assert.deepEqual(appels, ['souche']);
});

test('classement : le nom d\'abord, puis les fiches qui portent le sujet, puis le reste', () => {
  const liste = [
    fiche('Registre A', { motsCles: ['biobanque'] }),
    fiche('Texte', { description: 'Une biobanque y est décrite, avec sa cohorte.' }),
    fiche('Registre B', { motsCles: ['Biobank', 'étude de cohorte'] }),
    fiche('Biobanque de l\'Institut', { motsCles: ['neurologie'] }),
    fiche('Autre', { autresNoms: 'Quebec Biobank', motsCles: ['cohorte'] }),
    fiche('CARTaGENE', { autresNoms: 'cohorte populationnelle', motsCles: ['génomique'] }),
  ];
  const docs = documents(liste);
  assert.deepEqual(noms(chercher(docs, 'biobanque')), ['Biobanque de l\'Institut', 'Registre A', 'Registre B', 'Texte', 'Autre']);
  assert.deepEqual(noms(chercher(docs, 'biobank')), ['Autre', 'Registre B', 'Registre A', 'Texte', 'Biobanque de l\'Institut']);
  assert.deepEqual(noms(chercher(docs, 'cohorte')), ['CARTaGENE', 'Registre B', 'Autre', 'Texte']);
  // Avec la recherche floue : son ordre est gardé dans chaque groupe.
  const floue = (forme) => (forme === 'biobanque' ? [{ item: docs[1], score: 0.01 }, { item: docs[3], score: 0.2 }, { item: docs[0], score: 0.3 }] : []);
  assert.deepEqual(noms(chercher(docs, 'biobanque', floue)), ['Biobanque de l\'Institut', 'Registre A', 'Registre B', 'Texte', 'Autre']);
});

const pourSuggestions = [
  fiche('S1', { motsCles: ['traitement du signal', 'vieillissement', 'neuro-imagerie'], normes: ['BIDS'] }),
  fiche('S2', { motsCles: ['traitement du signal', 'neuro-imagerie', 'imagerie médicale'], normes: ['BIDS'] }),
  fiche('S3', { motsCles: ['traitement du signal', 'neuro-imagerie', 'imagerie médicale', 'norme bids'] }),
  fiche('S4', { motsCles: ['traitement d\'image', 'aide à la décision clinique', 'mesures rapportées par le patient'] }),
  fiche('S5', { motsCles: ['traitement d\'image', 'aide à la décision clinique', 'mesures rapportées par le patient'] }),
  fiche('S6', { motsCles: ['processeur graphique', 'portail patient', 'moelle épinière'] }),
];

test('suggestions : la langue du site d\'abord, l\'autre langue seulement en début de mot', () => {
  const sujets = (requete, langue) => suggestions(pourSuggestions, requete, langue).filter((x) => x.genre === 'sujet').map((x) => x.libelle);
  // « processeur graphique » n'est pas évincé par « signal processing » et « image processing ».
  assert.equal(sujets('proc')[0], 'processeur graphique');
  // « support », « cord », « ring » : des morceaux de mots anglais ne proposent rien en français.
  assert.deepEqual(sujets('port'), ['portail patient', 'mesures rapportées par le patient']);
  assert.deepEqual(sujets('pinal'), []);
  assert.deepEqual(sujets('ring'), []);
  assert.deepEqual(sujets('ning'), []);
  assert.deepEqual(sujets('ment'), ['traitement du signal', 'traitement d\'image', 'vieillissement']);
  // Le début d'un mot de l'autre langue propose toujours le sujet.
  assert.deepEqual(sujets('cord'), ['moelle épinière']);
  assert.deepEqual(sujets('spin'), ['moelle épinière']);
  assert.deepEqual(sujets('moel', 'en'), ['spinal cord']);
  // Un sujet dont un mot commence par la saisie passe avant ceux qui la contiennent seulement.
  assert.deepEqual(sujets('aging', 'en'), ['aging', 'neuroimaging', 'medical imaging']);
});

test('suggestions : le nombre d\'un sujet compte les fiches qui le portent en mot-clé ou en norme', () => {
  const [bids] = suggestions(pourSuggestions, 'bids').filter((x) => x.genre === 'sujet');
  assert.equal(bids.libelle, 'BIDS');
  assert.equal(bids.nombre, 3);
  assert.equal(chercher(documents(pourSuggestions), bids.valeur).length, 3);
  // Le portrait, lui, ne compte que les mots-clés : les normes y ont leur propre ligne.
  assert.ok(!statistiquesBandeau(pourSuggestions, 20).sujets.some((s) => s.sujet === 'BIDS' && s.nombre !== 1));
});

// ─── Une faute de frappe dans un mot anglais retrouve les fiches françaises ───

const pourFautes = fige.concat([
  fiche('Oncologie', { motsCles: ['oncologie'] }),
  fiche('Epidemiologie', { description: 'Un service d\'épidémiologie.' }),
  fiche('Genomique', { motsCles: ['génomique'] }),
]);

test('un mot d\'au moins cinq lettres est accepté à une faute près d\'un mot entier du texte canonisé', () => {
  const docs = documents(pourFautes);
  const trouve = (requete) => noms(chercher(docs, requete)).sort();
  assert.deepEqual(trouve('oncolgy'), ['Oncologie']);
  assert.deepEqual(trouve('neuroimagng'), ['Neuro']);
  assert.deepEqual(trouve('epidemiolgy'), ['Epidemiologie']);
  assert.deepEqual(trouve('genomcs'), ['Genomique']);
  assert.deepEqual(trouve('ocnology'), ['Oncologie'], 'deux lettres voisines inversées : une seule faute');
  assert.deepEqual(trouve('epidemoilgy'), ['Epidemiologie'], 'deux fautes à partir de huit lettres');
  assert.deepEqual(trouve('oncolgi'), [], 'deux fautes sur sept lettres : trop');
  assert.deepEqual(trouve('uncology'), [], 'la première lettre doit être la bonne');
  // Avec la recherche floue aussi, et sans lui passer autre chose que le mot tapé.
  const appels = [];
  assert.deepEqual(noms(chercher(docs, 'oncolgy', (forme) => { appels.push(forme); return []; })), ['Oncologie']);
  assert.deepEqual(appels, ['oncolgy']);
});

test('la tolérance aux fautes ne ramène pas le bruit, et ne joue jamais sous cinq lettres', () => {
  const docs = documents(pourFautes);
  const trouve = (requete) => noms(chercher(docs, requete)).sort();
  assert.deepEqual(trouve('rare'), ['Rares'], 'pas « infrared »');
  assert.deepEqual(trouve('souche'), ['Souches', 'Stem'], 'pas « system »');
  assert.deepEqual(trouve('proche'), ['Aidants', 'Infrarouge'], 'pas « linear »');
  assert.deepEqual(trouve('longue'), ['Longue'], 'pas « longitudinal »');
  assert.deepEqual(trouve('apprenant'), ['Apprenant'], 'pas « learning »');
  // Quatre lettres : seulement le mot tapé, en sous-chaîne du texte comme avant (« système », « system ») ; « lung » ne trouve pas « long ».
  assert.deepEqual(trouve('stem'), ['Apprenant', 'Souches', 'Stem', 'Systeme']);
  assert.deepEqual(trouve('lung'), []);
  assert.deepEqual(trouve('rars'), []);
  // Les sept gains restent.
  assert.deepEqual(trouve('machine learning'), ['Automatique']);
  assert.deepEqual(trouve('neuroimaging'), ['Neuro']);
  assert.deepEqual(trouve('ICD-10'), ['Neuro']);
  assert.deepEqual(trouve('high performance computing'), ['Calcul']);
  assert.deepEqual(trouve('data sharing'), ['Partage']);
  assert.deepEqual(trouve('fmri'), ['Fonctionnelle']);
  assert.deepEqual(trouve('gpu'), ['Graphique']);
});

test('un mot bien écrit, connu du catalogue ou du dictionnaire, n\'est pas pris pour une faute', () => {
  const docs = documents([
    fiche('Cadre', { motsCles: ['cadre légal'] }), fiche('Soins', { description: 'Primary care for all.' }),
    fiche('Intelligence', { motsCles: ['intelligence artificielle'] }), fiche('Genetique', { description: 'A text about genetics.' }),
    fiche('Genomique', { motsCles: ['génomique'] }),
  ]);
  const trouve = (requete) => noms(chercher(docs, requete)).sort();
  assert.deepEqual(trouve('cadre'), ['Cadre'], '« cadre » n\'est pas « care » mal tapé');
  assert.deepEqual(trouve('intelligent'), [], '« intelligent » est au dictionnaire : pas « intelligence » à deux fautes');
  assert.deepEqual(trouve('genomics'), ['Genomique'], '« genomics » n\'est pas « genetics » mal tapé');
  assert.deepEqual(trouve('genomcs'), ['Genomique']);
  assert.deepEqual(trouve('intelligance'), ['Intelligence']);
});

test('une fiche trouvée à une faute près passe après celles que la recherche floue a trouvées', () => {
  const docs = documents([fiche('Proche', { motsCles: ['oncologie'] }), fiche('Floue', { description: 'Texte.' })]);
  assert.deepEqual(noms(chercher(docs, 'oncolgy')), ['Proche']);
  const floue = (forme) => (forme === 'oncolgy' ? [{ item: docs[1], score: 0.6 }] : []);
  assert.deepEqual(noms(chercher(docs, 'oncolgy', floue)), ['Floue', 'Proche']);
});
