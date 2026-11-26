/**
 * Libellés des sujets regroupés, en français et en anglais.
 * Là où le site regroupe des fiches (bulles du graphe par sujets, « sujets communs »,
 * portrait, suggestions), un sujet s'affiche dans la langue du site. Sur une fiche, les
 * mots-clés restent affichés tels qu'écrits : cette table n'y touche pas.
 * La table couvre les sujets (mots-clés et normes) partagés par au moins deux fiches publiques.
 * Chargé par <script> dans le navigateur et par require() dans les essais.
 */
(function (racine) {
'use strict';

const outils = (typeof module !== 'undefined' && module.exports) ? require('./mots-cles.js') : racine;

// [écriture française en usage dans les fiches, terme anglais consacré].
// Les deux écritures d'une ligne doivent donner la même clé (cleMotCle) : un essai le vérifie.
// Si ce n'est pas le cas pour une nouvelle ligne, compléter le dictionnaire de mots-cles.js.
const PAIRES = [
  ['neuro-imagerie', 'neuroimaging'],
  ['génomique', 'genomics'],
  ['gestion des données de recherche', 'research data management'],
  ['oncologie', 'oncology'],
  ['épidémiologie', 'epidemiology'],
  ['calcul de haute performance', 'high-performance computing'],
  ['santé des populations', 'population health'],
  ['BIDS', 'BIDS'],
  ['apprentissage profond', 'deep learning'],
  ['CIM-10', 'ICD-10'],
  ['vieillissement', 'aging'],
  ['imagerie médicale', 'medical imaging'],
  ['DICOM', 'DICOM'],
  ['intelligence artificielle', 'artificial intelligence'],
  ['science ouverte', 'open science'],
  ['harmonisation de données', 'data harmonization'],
  ['données hospitalières', 'hospital data'],
  ['apprentissage automatique', 'machine learning'],
  ['NIfTI', 'NIfTI'],
  ['biomarqueur', 'biomarker'],
  ['données cliniques', 'clinical data'],
  ['médecine de précision', 'precision medicine'],
  ['reproductibilité', 'reproducibility'],
  ['neuro-informatique', 'neuroinformatics'],
  ['imagerie par résonance magnétique', 'magnetic resonance imaging'],
  ['santé mentale', 'mental health'],
  ['neurosciences', 'neuroscience'],
  ['partage de données', 'data sharing'],
  ['bio-informatique', 'bioinformatics'],
  ['biobanque', 'biobank'],
  ['segmentation d\'image', 'image segmentation'],
  ['génétique', 'genetics'],
  ['pédiatrie', 'pediatrics'],
  ['principes fair', 'FAIR principles'],
  ['connectome', 'connectome'],
  ['traitement du signal', 'signal processing'],
  ['science des données', 'data science'],
  ['GA4GH', 'GA4GH'],
  ['maladie chronique', 'chronic disease'],
  ['métadonnées', 'metadata'],
  ['accès aux données', 'data access'],
  ['lac de données', 'data lake'],
  ['biostatistique', 'biostatistics'],
  ['dossier clinique informatisé', 'electronic medical record'],
  ['santé publique', 'public health'],
  ['nutrition', 'nutrition'],
  ['traitement d\'image', 'image processing'],
  ['infonuagique', 'cloud computing'],
  ['stockage de données', 'data storage'],
  ['maladie neurodégénérative', 'neurodegenerative disease'],
  ['cardiologie', 'cardiology'],
  ['électroencéphalographie', 'electroencephalography'],
  ['neuro-imagerie fonctionnelle', 'functional neuroimaging'],
  ['protection de la vie privée', 'privacy protection'],
  ['VCF', 'VCF'],
  ['habitude de vie', 'lifestyle habits'],
  ['maladie d\'alzheimer', 'Alzheimer\'s disease'],
  ['interopérabilité', 'interoperability'],
  ['HL7 FHIR', 'HL7 FHIR'],
  ['neurologie', 'neurology'],
  ['services de santé', 'health services'],
  ['surveillance', 'surveillance'],
  ['connectivité fonctionnelle', 'functional connectivity'],
  ['étude de cohorte', 'cohort study'],
  ['irm fonctionnelle', 'functional MRI'],
  ['logiciel de recherche', 'research software'],
  ['histologie', 'histology'],
  ['psychiatrie', 'psychiatry'],
  ['données omiques', 'omics data'],
  ['pneumologie', 'respirology'],
  ['obésité', 'obesity'],
  ['maladie rare', 'rare disease'],
  ['recherche clinique', 'clinical research'],
  ['données de recherche', 'research data'],
  ['préservation des données', 'data preservation'],
  ['statistique', 'statistics'],
  ['transcriptomique', 'transcriptomics'],
  ['épigénomique', 'epigenomics'],
  ['pharmacoépidémiologie', 'pharmacoepidemiology'],
  ['grossesse', 'pregnancy'],
  ['périnatalité', 'perinatal health'],
  ['chaîne de traitement', 'processing pipeline'],
  ['radiographie pulmonaire', 'chest X-ray'],
  ['radiologie', 'radiology'],
  ['démence', 'dementia'],
  ['trouble cognitif', 'cognitive impairment'],
  ['données d\'enquête', 'survey data'],
  ['HL7', 'HL7'],
  ['analyse fédérée', 'federated analysis'],
  ['covid-19', 'COVID-19'],
  ['plan de gestion des données', 'data management plan'],
  ['données sensibles', 'sensitive data'],
  ['urgences', 'emergency department'],
  ['cognition', 'cognition'],
  ['développement de l\'enfant', 'child development'],
  ['entrepôt de données', 'data warehouse'],
  ['séquençage', 'sequencing'],
  ['processeur graphique', 'graphics processing unit'],
  ['données administratives', 'administrative data'],
  ['partenariat patient', 'patient partnership'],
  ['spectroscopie proche infrarouge fonctionnelle', 'functional near-infrared spectroscopy'],
  ['aide à la décision clinique', 'clinical decision support'],
  ['gériatrie', 'geriatrics'],
  ['MINC', 'MINC'],
  ['mesures rapportées par le patient', 'patient-reported outcome measures'],
  ['système de santé apprenant', 'learning health system'],
  ['informatique de la santé', 'health informatics'],
  ['irm quantitative', 'quantitative MRI'],
  ['traumatologie', 'trauma care'],
  ['CCI', 'CCI'],
  ['irm de diffusion', 'diffusion MRI'],
  ['tractographie', 'tractography'],
  ['matière blanche', 'white matter'],
  ['moelle épinière', 'spinal cord'],
];

// La table, indexée par la clé du sujet : { clé: { fr, en } }.
const LIBELLES_SUJETS = {};
for (const [fr, en] of PAIRES) LIBELLES_SUJETS[outils.cleMotCle(fr)] = { fr, en };

// Langue des libellés regroupés. C'est le seul endroit à brancher quand le bouton de langue
// existera : app.js et graphe.js passent tous par ici.
function langueDuSite() {
  return 'fr';
}

// Libellé d'un sujet regroupé : celui de la table dans la langue demandée ; sinon l'écriture
// la plus fréquente parmi les fiches (un sujet sans libellé anglais s'affiche donc en français).
// ecritures : liste de [écriture, nombre de fiches] ; à égalité, la première de la liste l'emporte.
function libelleSujet(cle, langue, ecritures) {
  const connu = LIBELLES_SUJETS[cle];
  if (connu && connu[langue === 'en' ? 'en' : 'fr']) return connu[langue === 'en' ? 'en' : 'fr'];
  let choisie = '';
  let maximum = 0;
  for (const [ecriture, nombre] of ecritures || []) {
    if (nombre > maximum) { choisie = ecriture; maximum = nombre; }
  }
  return choisie;
}

const api = { LIBELLES_SUJETS, langueDuSite, libelleSujet };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
