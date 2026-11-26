const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MOTS_VIDES, DICTIONNAIRE_FR_EN, EXPRESSIONS, SUJETS_ENTIERS, canoniser, cleMotCle } = require('../public/js/mots-cles.js');
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
  ['urgences', 'emergency care'],
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
  ['télésanté', 'télémédecine'],
  ['télésurveillance', 'surveillance'],
  ['CIM-10', 'CIM-O-3'],
  ['HL7', 'HL7 v2'],
  ['HL7', 'HL7 FHIR'],
  ['HL7 v2', 'HL7 FHIR'],
  ['vie privée', 'confidentialité'],
  ['protection de la vie privée', 'protection des renseignements personnels'],
  ['habitude de vie', 'mode de vie'],
  ['médecine de précision', 'médecine personnalisée'],
  ['cohorte', 'étude de cohorte'],
  ['traumatisme', 'traumatologie'],
  ['infectiologie', 'maladie infectieuse'],
  ['environnement', 'environnement bâti'],
  ['données de recherche', 'gestion des données de recherche'],
  ['gestion des données', 'gestion des données de recherche'],
  ['neuro-imagerie', 'neuro-imagerie fonctionnelle'],
  ['neuro-imagerie', 'imagerie cérébrale'],
  ['irm', 'irm fonctionnelle'],
  ['irm de diffusion', 'imagerie de diffusion'],
  ['épigénétique', 'épigénomique'],
  ['génétique', 'génomique'],
  ['dossier médical', 'dossier clinique informatisé'],
  ['dossier de santé électronique', 'dossier clinique informatisé'],
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
  ['chaîne de traitement', 'pipeline d\'analyse'],
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
  assert.equal(cleMotCle('IA'), 'ia', 'un sigle court garde sa forme');
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
  for (const [expression, remplacement] of Object.entries(EXPRESSIONS).concat(Object.entries(SUJETS_ENTIERS))) {
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
