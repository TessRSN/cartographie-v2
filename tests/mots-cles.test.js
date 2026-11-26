const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MOTS_VIDES, DICTIONNAIRE_FR_EN, EXPRESSIONS, SUJETS_ENTIERS, SOUDURES, canoniser, cleMotCle } = require('../public/js/mots-cles.js');
const { LIBELLES_SUJETS, libelleSujet, langueDuSite } = require('../public/js/libelles-sujets.js');

// Mots-clés et normes réels de la cartographie, avec l'écriture anglaise naturelle du même sujet.
const MEMES_SUJETS = [
  ['neuro-imagerie', 'neuroimaging'],
  ['génomique', 'genomics'],
  ['gestion des données de recherche', 'research data management'],
  ['oncologie', 'oncology'],
  ['épidémiologie', 'epidemiology'],
  ['calcul de haute performance', 'high-performance computing'],
  ['santé des populations', 'population health'],
  ['apprentissage profond', 'deep learning'],
  ['CIM-10', 'ICD-10'],
  ['CIM-O-3', 'ICD-O-3'],
  ['vieillissement', 'aging'],
  ['imagerie médicale', 'medical imaging'],
  ['intelligence artificielle', 'artificial intelligence'],
  ['science ouverte', 'open science'],
  ['harmonisation de données', 'data harmonization'],
  ['données hospitalières', 'hospital data'],
  ['apprentissage automatique', 'machine learning'],
  ['biomarqueur', 'biomarkers'],
  ['données cliniques', 'clinical data'],
  ['médecine de précision', 'precision medicine'],
  ['reproductibilité', 'reproducibility'],
  ['neuro-informatique', 'neuroinformatics'],
  ['imagerie par résonance magnétique', 'magnetic resonance imaging'],
  ['imagerie par résonance magnétique', 'MRI'],
  ['santé mentale', 'mental health'],
  ['neurosciences', 'neuroscience'],
  ['partage de données', 'data sharing'],
  ['bio-informatique', 'bioinformatics'],
  ['biobanque', 'biobank'],
  ['segmentation d\'image', 'image segmentation'],
  ['génétique', 'genetics'],
  ['pédiatrie', 'pediatrics'],
  ['principes fair', 'FAIR principles'],
  ['traitement du signal', 'signal processing'],
  ['science des données', 'data science'],
  ['maladie chronique', 'chronic diseases'],
  ['métadonnées', 'metadata'],
  ['accès aux données', 'data access'],
  ['lac de données', 'data lake'],
  ['biostatistique', 'biostatistics'],
  ['dossier clinique informatisé', 'electronic medical record'],
  ['dossier de santé électronique', 'electronic health records'],
  ['santé publique', 'public health'],
  ['traitement d\'image', 'image processing'],
  ['infonuagique', 'cloud computing'],
  ['stockage de données', 'data storage'],
  ['maladie neurodégénérative', 'neurodegenerative diseases'],
  ['cardiologie', 'cardiology'],
  ['électroencéphalographie', 'electroencephalography'],
  ['électroencéphalographie', 'EEG'],
  ['neuro-imagerie fonctionnelle', 'functional neuroimaging'],
  ['protection de la vie privée', 'privacy protection'],
  ['habitude de vie', 'lifestyle habits'],
  ['maladie d\'alzheimer', 'Alzheimer\'s disease'],
  ['interopérabilité', 'interoperability'],
  ['services de santé', 'health services'],
  ['connectivité fonctionnelle', 'functional connectivity'],
  ['étude de cohorte', 'cohort study'],
  ['irm fonctionnelle', 'functional MRI'],
  ['irm fonctionnelle', 'fMRI'],
  ['logiciel de recherche', 'research software'],
  ['histologie', 'histology'],
  ['données omiques', 'omics data'],
  ['pneumologie', 'respirology'],
  ['obésité', 'obesity'],
  ['maladie rare', 'rare diseases'],
  ['recherche clinique', 'clinical research'],
  ['préservation des données', 'data preservation'],
  ['transcriptomique', 'transcriptomics'],
  ['épigénomique', 'epigenomics'],
  ['pharmacoépidémiologie', 'pharmacoepidemiology'],
  ['grossesse', 'pregnancy'],
  ['périnatalité', 'perinatal health'],
  ['chaîne de traitement', 'processing pipeline'],
  ['radiographie pulmonaire', 'chest X-ray'],
  ['démence', 'dementia'],
  ['trouble cognitif', 'cognitive impairment'],
  ['données d\'enquête', 'survey data'],
  ['analyse fédérée', 'federated analysis'],
  ['plan de gestion des données', 'data management plan'],
  ['données sensibles', 'sensitive data'],
  ['urgences', 'emergency department'],
  ['développement de l\'enfant', 'child development'],
  ['entrepôt de données', 'data warehouse'],
  ['séquençage', 'sequencing'],
  ['processeur graphique', 'graphics processing unit'],
  ['processeur graphique', 'GPU'],
  ['données administratives', 'administrative data'],
  ['partenariat patient', 'patient partnership'],
  ['spectroscopie proche infrarouge fonctionnelle', 'functional near-infrared spectroscopy'],
  ['aide à la décision clinique', 'clinical decision support'],
  ['gériatrie', 'geriatrics'],
  ['mesures rapportées par le patient', 'patient-reported outcome measures'],
  ['système de santé apprenant', 'learning health system'],
  ['informatique de la santé', 'health informatics'],
  ['irm quantitative', 'quantitative MRI'],
  ['irm de diffusion', 'diffusion MRI'],
  ['tractographie', 'tractography'],
  ['matière blanche', 'white matter'],
  ['moelle épinière', 'spinal cord'],
  // Sujets portés par une seule fiche aujourd'hui.
  ['modélisation prédictive', 'predictive modelling'],
  ['médecine personnalisée', 'personalized medicine'],
  ['sclérose en plaques', 'multiple sclerosis'],
  ['soins de première ligne', 'primary care'],
  ['télésurveillance', 'remote patient monitoring'],
  ['santé numérique', 'digital health'],
  ['essai clinique', 'clinical trials'],
  ['données massives', 'big data'],
  ['flux de travail', 'workflows'],
  ['santé des femmes', 'women\'s health'],
  ['amélioration continue de la qualité', 'continuous quality improvement'],
  ['résistance aux antimicrobiens', 'antimicrobial resistance'],
  ['santé mère-enfant', 'maternal and child health'],
  ['recherche axée sur les pratiques', 'practice-based research'],
  ['soins fondés sur la valeur', 'value-based care'],
  ['ia responsable', 'responsible AI'],
  ['apprentissage fédéré', 'federated learning'],
  ['jumelage de données', 'data linkage'],
  ['cellule souche', 'stem cells'],
  ['qualité de vie', 'quality of life'],
  ['activités de la vie quotidienne', 'activities of daily living'],
  ['facteur de risque', 'risk factors'],
  ['déterminant de la santé', 'determinants of health'],
  ['protection des renseignements personnels', 'personal information protection'],
  ['environnement bâti', 'built environment'],
  ['communication patient-soignant', 'patient-provider communication'],
  ['proche aidance', 'caregiving'],
  ['réalité augmentée', 'augmented reality'],
  ['chirurgie guidée par l\'image', 'image-guided surgery'],
  ['expression génique', 'gene expression'],
  ['visualisation de données', 'data visualization'],
  ['évaluation des technologies', 'technology assessment'],
  ['transfert technologique', 'technology transfer'],
  ['cancer du poumon', 'lung cancer'],
  ['diabète de type 2', 'type 2 diabetes'],
  ['maladie de parkinson', 'Parkinson\'s disease'],
];

// Deux écritures françaises du même sujet parmi les mots-clés et les normes réels :
// elles se regroupent, et c'est voulu.
const MEMES_SUJETS_EN_FRANCAIS = [
  ['neuro-imagerie', 'neuroimagerie'],
  ['imagerie par résonance magnétique', 'irm'],
  ['gestion de données de recherche', 'gestion des données de recherche'],
  ['harmonisation de données', 'harmonisation des données'],
  ['mesures rapportées par le patient', 'mesure rapportée par le patient'],
  ['découverte du médicament', 'découverte de médicaments'],
  ['urgence', 'urgences'],
  ['données cliniques', 'donnée clinique'],
  ['données massives', 'donnée massive'],
  ['données hospitalières', 'donnée hospitalière'],
  ['données administratives', 'donnée administrative'],
  ['données d\'enquête', 'donnée d\'enquête'],
  ['données distribuées', 'donnée distribuée'],
  ['données omiques', 'donnée omique'],
  ['données sensibles', 'donnée sensible'],
  ['norme bids', 'BIDS'],
  ['fhir', 'HL7 FHIR'],
];

// Mots-clés et normes réels qui se ressemblent sans être le même sujet.
const SUJETS_DIFFERENTS = [
  ['télésanté', 'téléconsultation'],
  ['télésurveillance', 'surveillance'],
  ['CIM-10', 'CIM-O-3'],
  ['HL7', 'HL7 v2'],
  ['HL7', 'HL7 FHIR'],
  ['HL7 v2', 'HL7 FHIR'],
  ['HL7 v2', 'HL7 v3'],
  ['vie privée', 'confidentialité'],
  ['traumatisme', 'traumatologie'],
  ['environnement', 'environnement bâti'],
  ['données de recherche', 'gestion des données de recherche'],
  ['gestion des données', 'gestion des données de recherche'],
  ['neuro-imagerie', 'neuro-imagerie fonctionnelle'],
  ['neuro-imagerie', 'imagerie cérébrale'],
  ['irm', 'irm fonctionnelle'],
  ['épigénétique', 'épigénomique'],
  ['génétique', 'génomique'],
  ['dossier médical', 'dossier clinique informatisé'],
  ['soins de première ligne', 'médecine de famille'],
  ['urgence', 'médecine d\'urgence'],
  ['urgence', 'urgence psychiatrique'],
  ['aide à la décision', 'aide à la décision clinique'],
  ['santé publique', 'santé des populations'],
  ['apprentissage automatique', 'apprentissage profond'],
  ['apprentissage automatique', 'apprentissage fédéré'],
  ['mesures rapportées par le patient', 'données rapportées par le patient'],
  ['traitement d\'image', 'segmentation d\'image'],
  ['traitement d\'image', 'prétraitement d\'image'],
  ['traitement de la douleur', 'clinique de la douleur'],
  ['santé mentale', 'santé mentale périnatale'],
  ['maladie neurodégénérative', 'neurodégénérescence'],
  ['démence', 'maladie d\'alzheimer'],
  ['chaîne de traitement', 'flux de travail'],
  ['proche aidance', 'communication patient-soignant'],
  ['science des données', 'science ouverte'],
  ['données ouvertes', 'science ouverte'],
  ['analyse fédérée', 'analyse distribuée'],
  ['calcul scientifique', 'calcul de haute performance'],
];

test('mots-clés : l\'écriture française et l\'écriture anglaise d\'un sujet donnent la même clé', () => {
  assert.ok(MEMES_SUJETS.length >= 60);
  for (const [fr, en] of MEMES_SUJETS) {
    assert.ok(cleMotCle(fr), `« ${fr} » a une clé`);
    assert.equal(cleMotCle(fr), cleMotCle(en), `« ${fr} » et « ${en} »`);
  }
});

test('mots-clés : deux écritures françaises du même sujet se regroupent', () => {
  for (const [a, b] of MEMES_SUJETS_EN_FRANCAIS) assert.equal(cleMotCle(a), cleMotCle(b), `« ${a} » et « ${b} »`);
});

test('mots-clés : deux sujets différents ne fusionnent pas', () => {
  for (const [a, b] of SUJETS_DIFFERENTS) {
    assert.ok(cleMotCle(a) && cleMotCle(b), `« ${a} » et « ${b} » ont une clé`);
    assert.notEqual(cleMotCle(a), cleMotCle(b), `« ${a} » et « ${b} »`);
  }
});

test('mots-clés : la clé ne dépend ni des majuscules, ni des accents, ni des mots de liaison', () => {
  assert.equal(cleMotCle('Traitement de l\'image'), cleMotCle('traitement d\'image'));
  assert.equal(cleMotCle('NEURO-IMAGERIE'), cleMotCle('neuro imagerie'));
  assert.equal(cleMotCle('Sante Publique'), cleMotCle('santé publique'));
  assert.equal(cleMotCle('de'), null);
  assert.equal(cleMotCle(''), null);
  assert.equal(cleMotCle('ATC'), 'atc', 'un sigle court garde sa forme');
  assert.equal(cleMotCle('CT'), 'ct');
});

test('dictionnaire : aucune clé écrite deux fois dans une même table', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/mots-cles.js'), 'utf8');
  const tables = source.split(/const DICTIONNAIRE_FR_EN = \{|Object\.assign\(DICTIONNAIRE_FR_EN, \{|const EXPRESSIONS = \{|const SUJETS_ENTIERS = \{/).slice(1);
  assert.equal(tables.length, 5);
  for (const table of tables) {
    const corps = table.slice(0, table.indexOf('\n}'));
    const vues = new Set();
    for (const [, cle] of corps.matchAll(/'((?:[^'\\]|\\.)+)':\s*'/g)) {
      assert.ok(!vues.has(cle), `« ${cle} » est écrit deux fois`);
      vues.add(cle);
    }
    assert.ok(vues.size > 0);
  }
});

test('dictionnaire : chaque mot est atteignable et chaque traduction est une forme stable', () => {
  for (const [mot, traduction] of Object.entries(DICTIONNAIRE_FR_EN)) {
    assert.match(mot, /^[a-z0-9]{3,}$/, `« ${mot} » : un seul mot plié, d'au moins trois lettres`);
    assert.ok(!MOTS_VIDES.has(mot), `« ${mot} » est un mot vide, sa traduction ne servirait jamais`);
    assert.equal(canoniser(traduction), traduction, `« ${mot} » → « ${traduction} » : la traduction change quand on la canonise`);
  }
});

test('expressions : chaque expression et ce qui la remplace donnent la même clé', () => {
  for (const [expression, remplacement] of Object.entries(EXPRESSIONS).concat(Object.entries(SUJETS_ENTIERS), Object.entries(SOUDURES))) {
    assert.ok(cleMotCle(expression), `« ${expression} » a une clé`);
    assert.equal(cleMotCle(expression), cleMotCle(remplacement), `« ${expression} » et « ${remplacement} »`);
  }
});

test('aucun tiret cadratin dans les libellés ni dans les expressions', () => {
  const textes = Object.values(LIBELLES_SUJETS).flatMap((l) => [l.fr, l.en]).concat(Object.keys(EXPRESSIONS), Object.values(EXPRESSIONS));
  for (const texte of textes) assert.ok(!/[—–]/.test(texte), texte);
});

// ─── Table des libellés bilingues ───

test('libellés : chaque clé de la table est la clé de son libellé français et de son libellé anglais', () => {
  const cles = Object.keys(LIBELLES_SUJETS);
  assert.ok(cles.length >= 100, `${cles.length} sujets`);
  for (const cle of cles) {
    const { fr, en } = LIBELLES_SUJETS[cle];
    assert.ok(fr && en, `« ${cle} » a ses deux libellés`);
    assert.equal(cleMotCle(fr), cle, `français : « ${fr} »`);
    assert.equal(cleMotCle(en), cle, `anglais : « ${en} »`);
  }
  // Deux lignes de la table ne tombent jamais sur la même clé.
  const source = fs.readFileSync(path.join(__dirname, '../public/js/libelles-sujets.js'), 'utf8');
  const lignes = source.slice(source.indexOf('const PAIRES = ['), source.indexOf('\n];')).split('\n').filter((l) => /^\s+\['/.test(l));
  assert.equal(lignes.length, cles.length, 'autant de lignes que de sujets');
});

// Écritures, dans les fiches publiques du 2026-11-26, des sujets partagés par au moins cinq fiches
// (les bulles du graphe par sujets). Liste figée : l'essai ne lit aucun fichier hors du dépôt.
const SUJETS_DE_CINQ_FICHES = [
  'neuro-imagerie', 'génomique', 'gestion des données de recherche', 'oncologie', 'épidémiologie',
  'calcul de haute performance', 'santé des populations', 'BIDS', 'norme bids', 'apprentissage profond', 'CIM-10',
  'vieillissement', 'imagerie médicale', 'DICOM', 'intelligence artificielle', 'science ouverte',
  'harmonisation de données', 'données hospitalières', 'apprentissage automatique', 'NIfTI', 'biomarqueur',
  'données cliniques', 'médecine de précision', 'reproductibilité', 'neuro-informatique',
  'imagerie par résonance magnétique', 'santé mentale', 'neurosciences', 'partage de données',
  'bio-informatique', 'biobanque',
];

test('libellés : tout sujet partagé par au moins cinq fiches a un libellé anglais', () => {
  const cles = new Set(SUJETS_DE_CINQ_FICHES.map(cleMotCle));
  assert.equal(cles.size, 30);
  for (const ecriture of SUJETS_DE_CINQ_FICHES) {
    const libelle = LIBELLES_SUJETS[cleMotCle(ecriture)];
    assert.ok(libelle && libelle.en, `« ${ecriture} » a un libellé anglais`);
    assert.equal(libelleSujet(cleMotCle(ecriture), 'en', [[ecriture, 5]]), libelle.en);
  }
});

test('libelleSujet : la table dans la langue demandée, sinon l\'écriture la plus fréquente', () => {
  const cle = cleMotCle('apprentissage automatique');
  assert.equal(libelleSujet(cle, 'fr', [['Machine learning', 3], ['apprentissage automatique', 1]]), 'apprentissage automatique');
  assert.equal(libelleSujet(cle, 'en', [['apprentissage automatique', 4]]), 'machine learning');
  assert.equal(libelleSujet(cle, undefined, []), 'apprentissage automatique', 'le français par défaut');
  // Une norme garde sa forme propre ; une classification prend son nom anglais.
  assert.equal(libelleSujet(cleMotCle('CIM-10'), 'fr', []), 'CIM-10');
  assert.equal(libelleSujet(cleMotCle('CIM-10'), 'en', []), 'ICD-10');
  assert.equal(libelleSujet(cleMotCle('bids'), 'en', []), 'BIDS');
  // Hors de la table : l'écriture la plus fréquente, dans les deux langues ; à égalité, la première.
  const inconnu = cleMotCle('cartographie des savoirs');
  assert.equal(LIBELLES_SUJETS[inconnu], undefined);
  assert.equal(libelleSujet(inconnu, 'en', [['Cartographie des savoirs', 1], ['cartographie des savoirs', 2]]), 'cartographie des savoirs');
  assert.equal(libelleSujet(inconnu, 'fr', [['Cartographie des savoirs', 1], ['cartographie des savoirs', 1]]), 'Cartographie des savoirs');
  assert.equal(libelleSujet(inconnu, 'fr', []), '');
});

test('langueDuSite : le français tant que le bouton de langue n\'existe pas', () => {
  assert.equal(langueDuSite(), 'fr');
});

test('le gabarit charge la table des libellés avant les scripts qui s\'en servent', () => {
  const gabarit = fs.readFileSync(path.join(__dirname, '../public/gabarit.html'), 'utf8');
  const rang = (nom) => gabarit.indexOf(`<script src="/js/${nom}.js" defer></script>`);
  assert.ok(rang('mots-cles') > 0 && rang('mots-cles') < rang('libelles-sujets'));
  for (const nom of ['recherche', 'connexions', 'app', 'graphe']) assert.ok(rang('libelles-sujets') < rang(nom), nom);
});

// ─── Relecture : fusions rétablies, fusions manquées, clés dégénérées, chevauchements ───

test('fusions de main rétablies : déficience cognitive, soins d\'urgence', () => {
  assert.equal(cleMotCle('déficience cognitive'), cleMotCle('cognitive impairment'));
  assert.equal(cleMotCle('trouble cognitif'), cleMotCle('cognitive impairment'));
  assert.equal(cleMotCle('soins d\'urgence'), cleMotCle('emergency care'));
  assert.notEqual(cleMotCle('soins d\'urgence'), cleMotCle('urgences'));
  assert.notEqual(cleMotCle('HL7'), cleMotCle('HL7 FHIR'));
  assert.equal(cleMotCle('fhir'), cleMotCle('HL7 FHIR'));
});

test('autres paires français/anglais relevées à la relecture', () => {
  const groupes = [
    ['dossier clinique informatisé', 'dossiers cliniques informatisés', 'electronic medical records'],
    ['données personnelles', 'personal data'],
    ['villes intelligentes', 'ville intelligente', 'smart cities', 'smart city'],
    ['soins personnalisés', 'personalized care'],
    ['agent infectieux', 'agents infectieux', 'infectious agent'],
    ['soins primaires', 'primary care', 'soins de première ligne'],
    ['activité physique', 'physical activity'],
    ['maladie génétique', 'maladies génétiques', 'genetic disease'],
    ['jeu de données', 'jeux de données', 'dataset', 'data set', 'datasets'],
    ['temps réel', 'real-time', 'real time'],
    ['Premières Nations', 'First Nations'],
    ['traitement automatique du langage naturel', 'traitement automatique des langues', 'traitement du langage naturel', 'natural language processing'],
    ['traitement de la douleur', 'pain management', 'gestion de la douleur'],
    ['CIM10', 'CIM-10', 'ICD10', 'ICD-10', 'cim 10'],
    ['IA en santé', 'AI in health', 'intelligence artificielle en santé'],
    ['IA générative', 'generative AI', 'intelligence artificielle générative'],
    ['ia responsable', 'responsible AI'],
    ['calcul de haute performance', 'high performance computing', 'HPC'],
    ['calcul scientifique', 'scientific computing'],
    ['calcul distribué', 'distributed computing'],
    ['système de santé apprenant', 'systèmes de santé apprenants', 'learning health system'],
    ['surveillance de l\'état de santé', 'health status surveillance'],
    ['recalage d\'image', 'image registration'],
    ['collecte de données', 'data collection'],
    ['cadre légal', 'legal framework'],
    ['spectroscopie proche infrarouge fonctionnelle', 'functional near-infrared spectroscopy', 'fNIRS'],
    ['imagerie par résonance magnétique fonctionnelle', 'functional magnetic resonance imaging', 'IRMf', 'fMRI', 'IRM fonctionnelle'],
    ['unité de soins intensifs pédiatriques', 'pediatric intensive care unit', 'pediatric ICU'],
    ['traumatologie', 'trauma care'],
  ];
  for (const [premier, ...autres] of groupes) {
    assert.ok(cleMotCle(premier), `« ${premier} » a une clé`);
    for (const autre of autres) assert.equal(cleMotCle(autre), cleMotCle(premier), `« ${autre} » et « ${premier} »`);
  }
});

test('« IA », « AI », « intelligence artificielle » et « artificial intelligence » sont un seul sujet, même le sigle seul', () => {
  for (const ecriture of ['IA', 'ia', 'AI', 'artificial intelligence']) assert.equal(cleMotCle(ecriture), cleMotCle('intelligence artificielle'), ecriture);
  assert.equal(canoniser('ia'), null, 'canoniser ne change pas');
  assert.notEqual(cleMotCle('IA en santé'), cleMotCle('santé'));
  assert.notEqual(cleMotCle('IA générative'), cleMotCle('IA responsable'));
});

test('un mot-clé de plusieurs mots ne se réduit pas à un mot générique', () => {
  const differents = [
    ['e-santé', 'santé'], ['m-santé', 'santé'], ['eHealth', 'health'], ['mHealth', 'health'], ['e-santé', 'm-santé'],
    ['aide à la décision', 'prise de décision'], ['aide à la décision', 'décision'], ['decision support', 'decision making'],
    ['définition de cas', 'définition'], ['case definition', 'definition'],
    ['diabète de type 1', 'diabète de type 2'], ['type 1 diabetes', 'type 2 diabetes'], ['diabète de type 2', 'diabète'],
    ['temps réel', 'milieu réel'], ['Premières Nations', 'nations'],
    ['environnement bâti', 'environnement'], ['calcul', 'informatique'], ['apprenant', 'apprentissage'],
  ];
  for (const [a, b] of differents) {
    assert.ok(cleMotCle(a) && cleMotCle(b), `« ${a} » et « ${b} » ont une clé`);
    assert.notEqual(cleMotCle(a), cleMotCle(b), `« ${a} » et « ${b} »`);
  }
  const memes = [
    ['e-santé', 'eHealth', 'e-health', 'esanté'], ['m-santé', 'mHealth', 'm-health', 'santé mobile', 'mobile health'],
    ['aide à la décision', 'decision support'], ['aide à la décision clinique', 'clinical decision support'],
    ['prise de décision', 'decision making', 'decision-making'],
    ['définition de cas', 'case definition'], ['algorithme de définition de cas', 'case definition algorithm'],
    ['diabète de type 1', 'type 1 diabetes'], ['diabète de type 2', 'type 2 diabetes'],
  ];
  for (const [premier, ...autres] of memes) for (const autre of autres) assert.equal(cleMotCle(autre), cleMotCle(premier), `« ${autre} » et « ${premier} »`);
});

test('chevauchement d\'expressions : un préfixe détaché est soudé avant le reste', () => {
  // « pré-traitement d'image » contient « traitement d'image » : si cette expression passait la
  // première, il resterait « pré » + « image processing ». Les soudures passent donc d'abord.
  const groupes = [
    ['pré-traitement d\'image', 'prétraitement d\'image', 'image pre-processing', 'image preprocessing'],
    ['pré-traitement de données', 'prétraitement de données', 'data pre-processing', 'data preprocessing'],
    ['neuro-imagerie fonctionnelle', 'neuroimagerie fonctionnelle', 'functional neuro-imaging'],
    ['bio-informatique', 'bioinformatique', 'bio-informatics', 'bioinformatics'],
  ];
  for (const [premier, ...autres] of groupes) for (const autre of autres) assert.equal(cleMotCle(autre), cleMotCle(premier), `« ${autre} » et « ${premier} »`);
  assert.notEqual(cleMotCle('pré-traitement d\'image'), cleMotCle('traitement d\'image'));
  assert.notEqual(cleMotCle('pré-traitement de données'), cleMotCle('traitement de données'));
});

test('dictionnaire : les féminins et les pluriels des mots ajoutés donnent la même forme', () => {
  const familles = [
    ['intelligent', 'intelligente', 'intelligents', 'intelligentes'],
    ['personnalisé', 'personnalisée', 'personnalisés', 'personnalisées'],
    ['personnelle', 'personnels', 'personnelles'],
    ['infectieux', 'infectieuse', 'infectieuses'],
    ['primaire', 'primaires'],
    ['fédéré', 'fédérée', 'fédérés', 'fédérées'],
    ['distribué', 'distribuée', 'distribués', 'distribuées'],
    ['informatisé', 'informatisée', 'informatisés', 'informatisées'],
    ['connecté', 'connectée', 'connectés', 'connectées'],
    ['augmenté', 'augmentée', 'augmentés', 'augmentées'],
    ['périnatal', 'périnatale', 'périnatales', 'périnataux'],
    ['rural', 'rurale', 'rurales', 'ruraux'],
    ['spatial', 'spatiale', 'spatiales', 'spatiaux'],
    ['multimodal', 'multimodale', 'multimodales', 'multimodaux'],
    ['tumoral', 'tumorale', 'tumorales', 'tumoraux'],
    ['cortical', 'corticale', 'corticales', 'corticaux'],
    ['rétinien', 'rétinienne', 'rétiniens', 'rétiniennes'],
    ['microbien', 'microbienne', 'microbiens', 'microbiennes'],
    ['émergent', 'émergente', 'émergents', 'émergentes'],
    ['maternel', 'maternelle', 'maternels', 'maternelles'],
    ['translationnel', 'translationnelle', 'translationnels', 'translationnelles'],
    ['hospitalier', 'hospitalière', 'hospitaliers', 'hospitalières'],
    ['ville', 'villes'], ['agent', 'agents'], ['mesure', 'mesures'], ['trajectoire', 'trajectoires'], ['échantillon', 'échantillons'],
  ];
  for (const [premier, ...autres] of familles) for (const autre of autres) assert.equal(canoniser(autre), canoniser(premier), `« ${autre} » et « ${premier} »`);
  // Homographes anglais laissés tels quels : « personnel » (le personnel), « guide », « issue ».
  for (const mot of ['personnel', 'guide', 'issue', 'mere', 'forage']) assert.equal(canoniser(mot), mot, mot);
});

// Tous les mots-clés et toutes les normes de la base (liste figée), et les seuls groupes
// d'écritures différentes qui ont le droit de partager une clé.
const REELS = require('./fixtures/mots-cles-reels.json');
const FUSIONS_VOULUES = [
  ['neuro-imagerie', 'neuroimagerie'],
  ['imagerie par résonance magnétique', 'irm'],
  ['gestion de données de recherche', 'gestion des données de recherche'],
  ['harmonisation de données', 'harmonisation des données'],
  ['mesures rapportées par le patient', 'mesure rapportée par le patient'],
  ['découverte du médicament', 'découverte de médicaments'],
  ['urgence', 'urgences'],
  ['données cliniques', 'donnée clinique'],
  ['données massives', 'donnée massive'],
  ['données hospitalières', 'donnée hospitalière'],
  ['donnée administrative', 'données administratives'],
  ['donnée d\'enquête', 'données d\'enquête'],
  ['donnée distribuée', 'données distribuées'],
  ['donnée omique', 'données omiques'],
  ['donnée sensible', 'données sensibles'],
  ['norme bids', 'BIDS'],
  ['fhir', 'HL7 FHIR'],
  // Regroupements décidés par la responsable du projet, après recherche terminologique.
  ['médecine de précision', 'médecine personnalisée'],
  ['habitude de vie', 'mode de vie'],
  ['chaîne de traitement', 'pipeline d\'analyse'],
  ['irm de diffusion', 'imagerie de diffusion'],
  ['cohorte', 'étude de cohorte'],
  ['infectiologie', 'maladie infectieuse'],
  ['télésanté', 'télémédecine'],
  ['vie privée', 'protection de la vie privée', 'protection des renseignements personnels'],
  ['dossier de santé électronique', 'dossier clinique informatisé'],
];

test('mots-clés réels : aucune clé vide, et seules les fusions voulues partagent une clé', () => {
  const tous = REELS.motsCles.concat(REELS.normes);
  assert.equal(REELS.motsCles.length, 437);
  assert.equal(REELS.normes.length, 28);
  const parCle = new Map();
  for (const ecriture of tous) {
    const cle = cleMotCle(ecriture);
    assert.ok(cle, `« ${ecriture} » a une clé`);
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(ecriture);
  }
  const voulues = new Set(FUSIONS_VOULUES.map((groupe) => [...groupe].sort().join(' | ')));
  const trouvees = [...parCle.values()].filter((groupe) => groupe.length > 1).map((groupe) => [...groupe].sort().join(' | '));
  assert.deepEqual(trouvees.filter((g) => !voulues.has(g)), [], 'fusions qui ne sont pas dans la liste');
  assert.deepEqual([...voulues].filter((g) => !trouvees.includes(g)), [], 'fusions de la liste qui ne se font plus');
});

test('mots-clés réels : un mot-clé de plusieurs mots ne tombe pas sur la clé d\'un mot-clé d\'un seul mot', () => {
  const unMot = (ecriture) => !/[^a-z0-9]/.test(require('../public/js/mots-cles.js').plier(ecriture).trim());
  const tous = REELS.motsCles.concat(REELS.normes);
  const clesSimples = new Map(tous.filter(unMot).map((e) => [cleMotCle(e), e]));
  const permis = new Set(['imagerie par résonance magnétique', 'neuro-imagerie', 'norme bids', 'HL7 FHIR', 'étude de cohorte', 'maladie infectieuse', 'protection de la vie privée', 'protection des renseignements personnels', 'vie privée']);
  for (const ecriture of tous.filter((e) => !unMot(e) && !permis.has(e))) {
    assert.ok(!clesSimples.has(cleMotCle(ecriture)), `« ${ecriture} » se réduit à « ${clesSimples.get(cleMotCle(ecriture))} »`);
  }
});

test('libellés revus : « trauma care », « biomarker » au singulier', () => {
  assert.equal(LIBELLES_SUJETS[cleMotCle('traumatologie')].en, 'trauma care');
  assert.equal(LIBELLES_SUJETS[cleMotCle('biomarqueur')].en, 'biomarker');
  assert.equal(LIBELLES_SUJETS[cleMotCle('HL7')], undefined, '« HL7 » et « HL7 v2 » : une fiche chacun, hors de la table');
  assert.equal(LIBELLES_SUJETS[cleMotCle('urgences')].en, 'emergency department');
});

test('la recherche floue du site ne porte pas sur le texte canonisé', () => {
  // Fuse chercherait « rare » dans « infrared » : le texte canonisé n'est comparé que par mots (recherche.js).
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  assert.ok(!/name: 'canon'/.test(source));
});

test('le cache des clés est borné : chaque saisie de la recherche y passe', () => {
  const { clesConnues, CLES_GARDEES } = require('../public/js/mots-cles.js');
  assert.ok(CLES_GARDEES >= 1000);
  for (let i = 0; i < CLES_GARDEES * 2 + 10; i++) cleMotCle(`saisie numéro ${i}`);
  assert.ok(clesConnues.size <= CLES_GARDEES, `${clesConnues.size} clés gardées`);
  assert.equal(cleMotCle('apprentissage automatique'), cleMotCle('machine learning'), 'les clés restent justes une fois le cache vidé');
});

// ─── Regroupements décidés par la responsable du projet (recherche terminologique du 2026-11-26) ───

const GROUPES_DECIDES = [
  ['médecine de précision', 'médecine personnalisée', 'precision medicine', 'personalized medicine', 'personalised medicine'],
  ['habitude de vie', 'habitudes de vie', 'mode de vie', 'lifestyle', 'lifestyle habits'],
  ['chaîne de traitement', 'pipeline d\'analyse', 'pipeline de traitement', 'processing pipeline', 'analysis pipeline'],
  ['irm de diffusion', 'imagerie de diffusion', 'diffusion MRI', 'diffusion imaging'],
  ['apprentissage automatique', 'apprentissage machine', 'machine learning'],
  ['cohorte', 'étude de cohorte', 'cohort', 'cohort study', 'cohortes', 'cohort studies'],
  ['données massives', 'mégadonnées', 'big data'],
  ['infectiologie', 'maladie infectieuse', 'maladies infectieuses', 'infectious diseases', 'infectious disease'],
  ['télésanté', 'télémédecine', 'telehealth', 'telemedicine'],
  ['vie privée', 'protection de la vie privée', 'protection des renseignements personnels', 'privacy', 'privacy protection', 'personal information protection'],
  ['dossier clinique informatisé', 'dossiers cliniques informatisés', 'dossier médical électronique', 'dossiers médicaux électroniques',
    'dossier de santé électronique', 'dossiers de santé électroniques', 'DMÉ', 'DSÉ', 'DCI',
    'electronic medical record', 'electronic medical records', 'electronic health record', 'electronic health records', 'EMR', 'EHR'],
  ['urgence', 'urgences', 'emergency department'],
  ['mesures rapportées par le patient', 'mesures de résultats rapportées par le patient', 'patient-reported outcome measures', 'PROMs'],
  ['mesures d\'expérience rapportées par le patient', 'patient-reported experience measures', 'PREMs'],
];

test('regroupements décidés : chaque groupe a une seule clé, en français et en anglais', () => {
  for (const [premier, ...autres] of GROUPES_DECIDES) {
    assert.ok(cleMotCle(premier), premier);
    for (const autre of autres) assert.equal(cleMotCle(autre), cleMotCle(premier), `« ${autre} » et « ${premier} »`);
  }
  assert.equal(new Set(GROUPES_DECIDES.map(([premier]) => cleMotCle(premier))).size, GROUPES_DECIDES.length, 'deux groupes ne se confondent pas');
});

test('regroupements décidés : ce qui reste à part', () => {
  const differents = [
    ['télésanté', 'téléconsultation'], ['vie privée', 'confidentialité'], ['protection de la vie privée', 'confidentialité'],
    ['irm de diffusion', 'tenseur de diffusion'], ['irm de diffusion', 'imagerie du tenseur de diffusion'], ['irm de diffusion', 'tractographie'],
    ['dossier clinique informatisé', 'dossier médical'], ['dossier clinique informatisé', 'Dossier santé Québec'], ['dossier de santé électronique', 'DSQ'],
    ['urgences', 'soins d\'urgence'], ['urgences', 'médecine d\'urgence'], ['soins d\'urgence', 'médecine d\'urgence'],
    ['santé publique', 'santé des populations'], ['biobanque', 'biobanque populationnelle'],
    ['mesures rapportées par le patient', 'mesures d\'expérience rapportées par le patient'], ['PROMs', 'PREMs'],
    ['HL7', 'HL7 v2'], ['HL7 v2', 'HL7 FHIR'], ['cohorte', 'découverte de cohortes'], ['vie privée', 'données personnelles'],
    ['habitude de vie', 'habitude alimentaire'], ['médecine de précision', 'médecine'],
  ];
  for (const [a, b] of differents) {
    assert.ok(cleMotCle(a) && cleMotCle(b), `« ${a} » et « ${b} » ont une clé`);
    assert.notEqual(cleMotCle(a), cleMotCle(b), `« ${a} » et « ${b} »`);
  }
});

test('regroupements décidés : libellés de la table', () => {
  const libelle = (ecriture) => LIBELLES_SUJETS[cleMotCle(ecriture)];
  assert.equal(libelle('mode de vie').en, 'lifestyle habits');
  assert.equal(libelle('pipeline d\'analyse').en, 'processing pipeline');
  assert.equal(libelle('vie privée').en, 'privacy');
  assert.equal(libelle('dossier médical électronique').en, 'electronic health record');
  assert.equal(libelle('urgence').en, 'emergency department');
  assert.equal(libelle('IA').fr, 'intelligence artificielle');
  for (const [ecriture, en] of [['pneumologie', 'respirology'], ['périnatalité', 'perinatal health'], ['mesures rapportées par le patient', 'patient-reported outcome measures'],
    ['processeur graphique', 'graphics processing unit'], ['partenariat patient', 'patient partnership'], ['CCI', 'CCI'], ['données hospitalières', 'hospital data'],
    ['traumatologie', 'trauma care'], ['vieillissement', 'aging'], ['neuro-imagerie', 'neuroimaging']]) assert.equal(libelle(ecriture).en, en);
  assert.equal(cleMotCle('pulmonology'), cleMotCle('pneumologie'));
});
