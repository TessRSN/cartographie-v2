/**
 * Mots-clés : mots vides, pont français-anglais et forme canonique.
 * Repris du bottin du RSN (index.html, section « pont linguistique »), pour
 * que les deux outils rapprochent les sujets de la même façon.
 * Chargé par <script> dans le navigateur et par require() dans les essais.
 */
(function (racine) {
'use strict';

// Minuscules, sans accents.
function plier(texte) {
  return String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Mots sans valeur pour rapprocher deux sujets (français et anglais), formes pliées.
const MOTS_VIDES = new Set([
  // FR — articles, prepositions, conjonctions, pronoms, adverbes courants
  'le','la','les','de','des','du','et','ou','au','aux','pour','sur','dans','avec','par',
  'un','une','en','est','sont','que','qui','ce','cette','ces','sa','son','ses','leur',
  'leurs','notre','nos','votre','vos','plus','moins','tres','non','oui','tout','tous',
  'aussi','meme','etre','avoir','faire','etc','ainsi','car','mais','donc','toutes',
  'mon','ma','mes','ton','ta','tes','cet','mien','tien','sien','miens','tiens','siens',
  'miennes','tiennes','siennes','notres','votres','leurs','quelques','quelque',
  'prise','aucun','aucune','vraiment','simplement','seulement','particulierement','single',
  'notamment','parmi','entre','sous','vers','chez','sans','depuis','pendant','durant',
  'contre','selon','malgre','puis','ensuite','alors','encore','toujours','jamais',
  'comme','toutefois','cependant','neanmoins','autres','autre','propre','propres',
  'premier','premiere','dernier','derniere','ans','fois','via','celui','celle','ceux',
  'lui','elle','elles','ils','nous','vous','je','tu','moi','toi','soi','dont','quoi',
  'celle','cela','beaucoup','peu','plusieurs','certains','certaines','divers','diverses',
  'fait','faits','jour','jours','annee','annees','mois','semaine','heure','heures',
  // EN — articles, prepositions, conjonctions, modaux
  'the','an','and','or','in','on','at','for','with','by','of','to','is','are','was',
  'were','be','been','being','have','has','had','do','does','did','will','would',
  'should','could','may','might','this','that','these','those','from','as','it','its',
  'we','you','they','them','their','our','your','my','also','than','then','there',
  'such','any','some','more','most','very','can','not','no',
  'into','onto','upon','through','throughout','between','among','within','without',
  'against','around','across','after','before','during','beyond','despite','toward',
  'towards','behind','above','below','over','under','except','until','since','while',
  'although','though','however','therefore','thus','hence','whereas','moreover',
  'furthermore','nevertheless','otherwise','instead','rather','perhaps',
  // EN — verbes generiques qui ne portent pas de sens distinctif
  'based','designed','focused','focuses','focus','using','used','uses',
  'including','included','includes','involve','involves','involved',
  'provide','provides','provided','become','becomes','became',
  'make','makes','made','take','takes','took','give','gives','gave',
  'show','shows','showed','find','finds','found','look','looks','looked',
  'work','works','worked','help','helps','helped',
  'want','wants','wanted','need','needs','needed','seek','seeks','sought',
  'create','creates','created','build','builds','built','start','starts','started',
  'addresses','addressed','address','aim','aims','aimed','allow','allows','allowed',
  'continue','continues','continued','remain','remains','remained',
  'consider','considers','considered','support','supports','supported',
  'identify','identifies','identified','define','defines','defined',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'first','second','third','last','next','many','much','few','several',
  'years','year','days','day','time','times','people','example','examples',
  'way','ways','part','parts','case','cases','set','sets'
]);

// Correspondances français → anglais (et pluriels → singulier), formes pliées.
const DICTIONNAIRE_FR_EN = {
  // Concepts generaux
  'sante': 'health', 'recherche': 'research', 'recherches': 'research',
  'donnees': 'data', 'donnee': 'data',
  'soins': 'care', 'soin': 'care', 'soignant': 'caregiver', 'soignants': 'caregivers',
  'numerique': 'digital', 'numeriques': 'digital', 'numerisation': 'digitalization',
  'developpement': 'development', 'developpements': 'development',
  'developper': 'develop', 'developpe': 'developed', 'developpees': 'developed',
  'amelioration': 'improvement', 'ameliorer': 'improve', 'ameliore': 'improved',
  'methode': 'method', 'methodes': 'methods',
  'methodologie': 'methodology', 'methodologies': 'methodology',
  'outils': 'tools', 'outil': 'tool',
  'analyse': 'analysis', 'analyses': 'analysis', 'analyser': 'analyze',
  'modele': 'model', 'modeles': 'models', 'modelisation': 'modeling',
  'algorithme': 'algorithm', 'algorithmes': 'algorithms',
  'apprentissage': 'learning',
  'profond': 'deep', 'profonde': 'deep',
  'artificielle': 'artificial',
  'evaluation': 'evaluation', 'evaluations': 'evaluation', 'evaluer': 'evaluate',
  'gestion': 'management', 'gerer': 'manage',
  'qualite': 'quality',
  'systeme': 'system', 'systemes': 'systems',
  'service': 'service', 'services': 'services',
  'reseau': 'network', 'reseaux': 'networks',
  'plateforme': 'platform', 'plateformes': 'platforms',
  'application': 'application', 'applications': 'applications',
  'utilisation': 'use', 'utiliser': 'use', 'utilise': 'used',
  'mise': 'implementation', 'oeuvre': 'implementation',
  'projet': 'project', 'projets': 'projects',
  'equipe': 'team', 'equipes': 'teams',
  'collaboration': 'collaboration',
  'communaute': 'community', 'communautes': 'communities',
  // Domaines medicaux
  'medecine': 'medicine', 'medical': 'medical', 'medicaux': 'medical', 'medicale': 'medical',
  'clinique': 'clinical', 'cliniques': 'clinical', 'clinicien': 'clinician',
  'epidemiologie': 'epidemiology', 'epidemiologique': 'epidemiologic',
  'biostatistique': 'biostatistics', 'statistique': 'statistics', 'statistiques': 'statistics',
  'cardiologie': 'cardiology', 'cardiaque': 'cardiac', 'cardiaques': 'cardiac',
  'cardiovasculaire': 'cardiovascular',
  'pediatrie': 'pediatrics', 'pediatrique': 'pediatric',
  'neurologie': 'neurology', 'neurologique': 'neurologic',
  'psychiatrie': 'psychiatry', 'psychiatrique': 'psychiatric',
  'oncologie': 'oncology', 'oncologique': 'oncologic',
  'gynecologie': 'gynecology', 'obstetrique': 'obstetrics',
  'urgence': 'emergency', 'urgences': 'emergency',
  'reanimation': 'icu', 'soins intensifs': 'intensive care',
  'chirurgie': 'surgery', 'chirurgical': 'surgical',
  'maladie': 'disease', 'maladies': 'diseases',
  'chronique': 'chronic', 'chroniques': 'chronic',
  'aigu': 'acute', 'aigue': 'acute', 'aigus': 'acute',
  'cancer': 'cancer',
  'diabete': 'diabetes',
  'obesite': 'obesity',
  'douleur': 'pain', 'douleurs': 'pain',
  'mortalite': 'mortality', 'survie': 'survival',
  'prevention': 'prevention', 'prevenir': 'prevent',
  'depistage': 'screening',
  'diagnostic': 'diagnosis', 'diagnostique': 'diagnostic',
  'traitement': 'treatment', 'traitements': 'treatments',
  'therapie': 'therapy', 'therapies': 'therapy', 'therapeutique': 'therapeutic',
  'medicament': 'drug', 'medicaments': 'drugs',
  'pharmacie': 'pharmacy', 'pharmaceutique': 'pharmaceutical',
  'genetique': 'genetics', 'genomique': 'genomics',
  'imagerie': 'imaging',
  'reeducation': 'rehabilitation', 'readaptation': 'rehabilitation',
  // Population
  'patient': 'patient', 'patients': 'patients',
  'enfant': 'child', 'enfants': 'children',
  'adolescent': 'adolescent', 'adolescents': 'adolescents',
  'adulte': 'adult', 'adultes': 'adults',
  'femme': 'woman', 'femmes': 'women',
  'homme': 'man', 'hommes': 'men',
  'personne': 'person', 'personnes': 'persons', 'gens': 'people',
  'populaires': 'population', 'populationnel': 'population',
  // Mental health
  'mentale': 'mental', 'mental': 'mental',
  'depression': 'depression', 'depressif': 'depressive',
  'anxiete': 'anxiety', 'anxieux': 'anxious',
  'autisme': 'autism', 'autistique': 'autistic',
  'demence': 'dementia',
  'addiction': 'addiction', 'dependance': 'dependence',
  // Public health / sociology
  'inegalites': 'inequalities', 'inegalite': 'inequality',
  'equite': 'equity',
  'inclusion': 'inclusion',
  'diversite': 'diversity',
  'autochtone': 'indigenous', 'autochtones': 'indigenous',
  'partenariat': 'partnership',
  'engagement': 'engagement',
  'participation': 'participation',
  'mobilisation': 'mobilization',
  'connaissances': 'knowledge', 'connaissance': 'knowledge',
  'savoir': 'knowledge', 'savoirs': 'knowledge',
  'transfert': 'transfer',
  // Ethics / governance
  'ethique': 'ethics', 'ethiques': 'ethical',
  'bioethique': 'bioethics',
  'gouvernance': 'governance',
  'protection': 'protection',
  'securite': 'security',
  'confidentialite': 'privacy', 'privacy': 'privacy',
  'consentement': 'consent',
  'reglementation': 'regulation', 'reglementations': 'regulations',
  'politique': 'policy', 'politiques': 'policies',
  // Education / training
  'formation': 'training', 'formations': 'training',
  'enseignement': 'education',
  'education': 'education',
  'etudiant': 'student', 'etudiants': 'students',
  'professeur': 'professor', 'professeurs': 'professors',
  'chercheur': 'researcher', 'chercheurs': 'researchers',
  // Sciences / methodes
  'science': 'science', 'sciences': 'science',
  'scientifique': 'scientific', 'scientifiques': 'scientific',
  'centre': 'center', 'centres': 'center',
  'machine': 'machine', 'machines': 'machine',
  'vision': 'vision', 'inference': 'inference',
  'sommeil': 'sleep', 'computer': 'computer',
  'cell': 'cell', 'cellule': 'cell', 'cellules': 'cell', 'cellulaire': 'cellular',
  'biology': 'biology', 'biologie': 'biology',
  'biologique': 'biological', 'biologiques': 'biological',
  'physics': 'physics', 'physique': 'physics',
  'processing': 'processing', 'computational': 'computational', 'design': 'design',
  // Sante / clinique
  'intensifs': 'intensive', 'intensive': 'intensive', 'intensives': 'intensive',
  'respiratoire': 'respiratory', 'respiratoires': 'respiratory',
  'healthcare': 'healthcare',
  'causale': 'causal', 'causal': 'causal', 'causales': 'causal', 'causaux': 'causal',
  // IA / numerique
  'generative': 'generative', 'generatif': 'generative',
  'neuro': 'neuro',
  'neuroscience': 'neuroscience', 'neurosciences': 'neuroscience',
  'neuroimaging': 'neuroimaging',
  'virtual': 'virtual', 'virtuel': 'virtual', 'virtuelle': 'virtual',
  'automatique': 'automatic', 'realite': 'reality',
  // Concepts methode
  'precision': 'precision', 'precis': 'precise',
  'adaptation': 'adaptation', 'adaptations': 'adaptation',
  'adapter': 'adapt', 'adapte': 'adapted', 'adaptee': 'adapted',
  'interaction': 'interaction', 'interactions': 'interaction',
  'interactif': 'interactive', 'interactive': 'interactive',
  'suivi': 'monitoring', 'monitoring': 'monitoring',
  'experience': 'experience', 'experiences': 'experience',
  'approches': 'approach', 'approche': 'approach',
  'changement': 'change', 'changements': 'change', 'change': 'change',
  'integration': 'integration', 'integrer': 'integrate',
  'transformation': 'transformation', 'transformations': 'transformation',
  'innovation': 'innovation', 'innovations': 'innovation',
  'innovant': 'innovative', 'innovantes': 'innovative',
  // Sciences sociales / humanites
  'sociale': 'social', 'sociaux': 'social', 'sociales': 'social',
  'humaine': 'human', 'humain': 'human', 'humains': 'human', 'humaines': 'human',
  'comportement': 'behavior', 'comportements': 'behavior',
  'comportemental': 'behavioral', 'comportementale': 'behavioral',
  'behaviour': 'behavior', 'behavior': 'behavior',
  'pedagogie': 'pedagogy', 'pedagogique': 'pedagogical', 'pedagogiques': 'pedagogical',
  'droit': 'law', 'droits': 'rights',
  'litteratie': 'literacy',
  'crise': 'crisis', 'crises': 'crisis',
  // Concepts QC / FR
  'quebec': 'quebec', 'quebecois': 'quebec', 'quebecoise': 'quebec',
  'ligne': 'online', 'online': 'online',
  'ouvert': 'open', 'ouverte': 'open', 'ouverts': 'open', 'ouvertes': 'open',
  // Technologie / pratique
  'technologie': 'technology', 'technologies': 'technology',
  'technologique': 'technological', 'technologiques': 'technological',
  'durable': 'sustainable', 'durables': 'sustainable', 'durabilite': 'sustainability',
  'decision': 'decision', 'decisions': 'decision',
  'decideur': 'decision-maker', 'decideurs': 'decision-maker',
  'pratique': 'practice', 'pratiques': 'practice',
  'informatique': 'computing', 'informatiques': 'computing',
  'informatisation': 'computerization',
  'communication': 'communication', 'communications': 'communication',
  'promotion': 'promotion',
  'access': 'access', 'acces': 'access', 'accessible': 'accessible',
  'accessibilite': 'accessibility',
  // Info / data
  'information': 'information', 'informations': 'information',
  'renseignement': 'information', 'renseignements': 'information',
  'aide': 'help', 'aider': 'help',
  'primary': 'primary', 'primaire': 'primary',
  'intelligence': 'intelligence',
  // Population / famille
  'family': 'family', 'famille': 'family', 'familles': 'family',
  'familial': 'family', 'familiale': 'family',
  'vieillissement': 'aging', 'aine': 'elderly', 'aines': 'elderly',
  // Ajouts v7 (2026-09-14) : parite FR/EN du vocabulaire scientifique, pour
  // que les profils francais et anglais se relient sur les memes concepts
  // (connexions) et se trouvent avec les memes mots (recherche).
  'telesante': 'telehealth', 'telemedecine': 'telemedicine',
  'teleconsultation': 'telehealth', 'teleconsultations': 'telehealth',
  'telereadaptation': 'telerehabilitation', 'telesurveillance': 'monitoring',
  'neuroimagerie': 'neuroimaging', 'radiologie': 'radiology', 'tomographie': 'tomography',
  'irm': 'mri', 'tep': 'pet', 'avc': 'stroke', 'asthme': 'asthma', 'epilepsie': 'epilepsy',
  'cardiovasculaires': 'cardiovascular', 'vasculaire': 'vascular', 'vasculaires': 'vascular',
  'pulmonaire': 'pulmonary', 'pulmonaires': 'pulmonary', 'intestinal': 'intestinal',
  'intestinales': 'intestinal', 'perinatalite': 'perinatal', 'perinatal': 'perinatal',
  'gerontologie': 'gerontology', 'geriatrie': 'geriatrics', 'geriatrique': 'geriatric',
  'pediatriques': 'pediatric', 'pediatriques': 'pediatric',
  'radiotherapie': 'radiotherapy', 'chimiotherapie': 'chemotherapy',
  'infirmier': 'nursing', 'infirmiers': 'nursing', 'infirmiere': 'nursing', 'infirmieres': 'nursing',
  'nurse': 'nursing', 'nurses': 'nursing',
  'medecin': 'physicians', 'medecins': 'physicians', 'physician': 'physicians',
  'clinicien': 'clinicians', 'cliniciens': 'clinicians', 'clinician': 'clinicians',
  'professionnel': 'professionals', 'professionnels': 'professionals',
  'professionnelle': 'professionals', 'professionnelles': 'professionals',
  'genetiques': 'genetic', 'cerebral': 'brain', 'cerebrale': 'brain', 'cerebrales': 'brain',
  'cognitif': 'cognitive', 'cognitifs': 'cognitive', 'cognitives': 'cognitive',
  'chirurgical': 'surgical', 'chirurgicale': 'surgical', 'chirurgicaux': 'surgical',
  'neurologiques': 'neurologic', 'physiologique': 'physiological', 'physiologiques': 'physiological',
  'trouble': 'disorder', 'troubles': 'disorders', 'symptome': 'symptoms', 'symptomes': 'symptoms',
  'biomarqueur': 'biomarkers', 'biomarqueurs': 'biomarkers', 'biomarker': 'biomarkers',
  'agee': 'elderly', 'agees': 'elderly', 'ainee': 'elderly', 'ainees': 'elderly', 'older': 'elderly',
  'domicile': 'home', 'physiotherapie': 'physiotherapy', 'ergotherapie': 'occupational',
  'handicap': 'disability', 'handicaps': 'disability', 'autonomie': 'autonomy',
  'mobilite': 'mobility', 'mouvement': 'movement', 'mouvements': 'movement',
  'visuel': 'visual', 'visuelle': 'visual', 'visuels': 'visual', 'visuelles': 'visual',
  'deficience': 'impairment', 'deficiences': 'impairment', 'parole': 'speech',
  'capteur': 'sensors', 'capteurs': 'sensors', 'sensor': 'sensors',
  'logiciel': 'software', 'logiciels': 'software', 'ordinateur': 'computer',
  'graphe': 'graph', 'graphes': 'graph', 'graphs': 'graph', 'langage': 'language',
  'serieux': 'serious', 'jeu': 'games', 'jeux': 'games', 'game': 'games',
  'apprentissages': 'learning', 'renforcement': 'reinforcement',
  'supervise': 'supervised', 'supervisee': 'supervised', 'neurone': 'neural', 'neurones': 'neural',
  'generatif': 'generative', 'generatifs': 'generative', 'generatives': 'generative',
  'conversationnel': 'conversational', 'conversationnels': 'conversational',
  'conversationnelle': 'conversational', 'signaux': 'signal', 'signals': 'signal',
  'prediction': 'prediction', 'predire': 'prediction', 'predictions': 'prediction',
  'predictif': 'predictive', 'predictifs': 'predictive', 'predictives': 'predictive',
  'cohorte': 'cohort', 'cohortes': 'cohort', 'cohorts': 'cohort',
  'essai': 'trials', 'essais': 'trials', 'trial': 'trials',
  'longitudinale': 'longitudinal', 'longitudinales': 'longitudinal',
  'observationnelle': 'observational', 'observationnel': 'observational',
  'registre': 'registry', 'registres': 'registry', 'biobanque': 'biobank',
  'populationnelle': 'population', 'populations': 'population',
  'communautaire': 'community', 'communautaires': 'community',
  'participative': 'participatory', 'participatif': 'participatory', 'participatifs': 'participatory',
  'aidance': 'caregivers', 'aidant': 'caregivers', 'aidants': 'caregivers',
  'aidante': 'caregivers', 'aidantes': 'caregivers', 'caregiver': 'caregivers',
  'lois': 'law', 'juridique': 'legal', 'juridiques': 'legal',
  'biostatistique': 'biostatistics', 'biostatistiques': 'biostatistics',
  'mathematique': 'mathematical', 'mathematiques': 'mathematical', 'mathematics': 'mathematical',
  'proteomique': 'proteomics', 'pharmacogenomique': 'pharmacogenomics',
  'psychologie': 'psychology', 'psychologique': 'psychological', 'psychologiques': 'psychological',
  'psychosocial': 'psychosocial', 'psychosociale': 'psychosocial', 'psychosociaux': 'psychosocial',
  'musculosquelettique': 'musculoskeletal', 'musculosquelettiques': 'musculoskeletal',
  'dossier': 'records', 'dossiers': 'records', 'electronique': 'electronic', 'electroniques': 'electronic',
  'interoperabilite': 'interoperability', 'nuage': 'cloud', 'infonuagique': 'cloud',
  'segmentation': 'segmentation', 'classification': 'classification', 'simulation': 'simulation',
  'simulations': 'simulation', 'diseases': 'disease', 'maladies': 'disease', 'maladie': 'disease',
  'models': 'model', 'modeles': 'model', 'modele': 'model', 'modelling': 'modeling',
  'interventions': 'intervention', 'treatments': 'treatment', 'traitements': 'treatment',
  'images': 'imaging', 'image': 'imaging',
};

// Ajouts propres à la cartographie, à enrichir au fil des fiches.
Object.assign(DICTIONNAIRE_FR_EN, {
  'publique': 'public', 'publiques': 'public', 'publics': 'public',
});

// Forme canonique d'un mot : null s'il est vide ou trop court.
function canoniser(mot) {
  const plie = plier(mot).replace(/[^a-z0-9]+/g, '');
  if (plie.length < 3 || MOTS_VIDES.has(plie)) return null;
  return DICTIONNAIRE_FR_EN[plie] || plie;
}

// Mots canoniques d'un texte, dans l'ordre, sans les mots vides.
function motsCanoniques(texte) {
  return plier(texte).split(/[^a-z0-9]+/).map(canoniser).filter(Boolean);
}

// Clé d'un mot-clé entier : ses mots canoniques, triés. « Intelligence
// artificielle » et « artificial intelligence » donnent la même clé.
// Les sigles courts (« IRM », « EEG ») sont gardés tels quels.
function cleMotCle(motCle) {
  const mots = motsCanoniques(motCle);
  if (mots.length === 0) {
    const brut = plier(motCle).replace(/[^a-z0-9]+/g, '');
    return brut.length >= 2 && !MOTS_VIDES.has(brut) ? brut : null;
  }
  return [...new Set(mots)].sort().join('+');
}

const api = { MOTS_VIDES, DICTIONNAIRE_FR_EN, plier, canoniser, motsCanoniques, cleMotCle };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
