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
  'soins': 'care', 'soin': 'care',
  'numerique': 'digital', 'numeriques': 'digital', 'numerisation': 'digitalization',
  'developpement': 'development', 'developpements': 'development',
  'developper': 'develop', 'developpe': 'developed', 'developpees': 'developed',
  'amelioration': 'improvement', 'ameliorer': 'improve', 'ameliore': 'improved',
  'methode': 'method', 'methodes': 'method',
  'methodologie': 'methodology', 'methodologies': 'methodology',
  'outils': 'tool', 'outil': 'tool',
  'analyse': 'analysis', 'analyses': 'analysis', 'analyser': 'analyze',
  'modelisation': 'modeling',
  'algorithme': 'algorithm', 'algorithmes': 'algorithm',
  'apprentissage': 'learning',
  'profond': 'deep', 'profonde': 'deep',
  'artificielle': 'artificial',
  'evaluation': 'evaluation', 'evaluations': 'evaluation', 'evaluer': 'evaluate',
  'gestion': 'management', 'gerer': 'manage',
  'qualite': 'quality',
  'systeme': 'system', 'systemes': 'system',
  'service': 'service', 'services': 'service',
  'reseau': 'network', 'reseaux': 'network',
  'plateforme': 'platform', 'plateformes': 'platform',
  'application': 'application', 'applications': 'application',
  'utilisation': 'use', 'utiliser': 'use',
  'mise': 'implementation', 'oeuvre': 'implementation',
  'projet': 'project', 'projets': 'project',
  'equipe': 'team', 'equipes': 'team',
  'collaboration': 'collaboration',
  'communaute': 'community', 'communautes': 'community',
  // Domaines medicaux
  'medecine': 'medicine', 'medical': 'medical', 'medicaux': 'medical', 'medicale': 'medical',
  'clinique': 'clinical', 'cliniques': 'clinical',
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
  'reanimation': 'icu',
  'chirurgie': 'surgery',
  'chronique': 'chronic', 'chroniques': 'chronic',
  'aigu': 'acute', 'aigue': 'acute', 'aigus': 'acute',
  'cancer': 'cancer',
  'diabete': 'diabetes',
  'obesite': 'obesity',
  'douleur': 'pain', 'douleurs': 'pain',
  'mortalite': 'mortality', 'survie': 'survival',
  'prevention': 'prevention', 'prevenir': 'prevent',
  'depistage': 'screening',
  'diagnostic': 'diagnosis', 'diagnostique': 'diagnosis',
  'traitement': 'treatment',
  'therapie': 'therapy', 'therapies': 'therapy', 'therapeutique': 'therapeutic',
  'medicament': 'drug', 'medicaments': 'drug',
  'pharmacie': 'pharmacy', 'pharmaceutique': 'pharmaceutical',
  'genetique': 'genetics', 'genomique': 'genomics',
  'imagerie': 'imaging',
  'reeducation': 'rehabilitation', 'readaptation': 'rehabilitation',
  // Population
  'patient': 'patient', 'patients': 'patient',
  'enfant': 'child', 'enfants': 'child',
  'adolescent': 'adolescent', 'adolescents': 'adolescent',
  'adulte': 'adult', 'adultes': 'adult',
  'femme': 'woman', 'femmes': 'woman',
  'homme': 'man', 'hommes': 'man',
  'personne': 'person', 'personnes': 'person',
  'populaires': 'population', 'populationnel': 'population',
  // Mental health
  'mentale': 'mental', 'mental': 'mental',
  'depression': 'depression', 'depressif': 'depressive',
  'anxiete': 'anxiety', 'anxieux': 'anxious',
  'autisme': 'autism', 'autistique': 'autistic',
  'demence': 'dementia',
  'addiction': 'addiction', 'dependance': 'dependence',
  // Public health / sociology
  'inegalites': 'inequality', 'inegalite': 'inequality',
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
  'confidentialite': 'confidentiality', 'privacy': 'privacy',
  'consentement': 'consent',
  'reglementation': 'regulation', 'reglementations': 'regulation',
  'politique': 'policy', 'politiques': 'policy',
  // Education / training
  'formation': 'training', 'formations': 'training',
  'enseignement': 'education',
  'education': 'education',
  'etudiant': 'student', 'etudiants': 'student',
  'professeur': 'professor', 'professeurs': 'professor',
  'chercheur': 'researcher', 'chercheurs': 'researcher',
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
  'generative': 'generative',
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
  'decideur': 'decisionmaker', 'decideurs': 'decisionmaker',
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
  'primary': 'primary', 'primaire': 'primary', 'primaires': 'primary',
  'intelligence': 'intelligence',
  // Population / famille
  'family': 'family', 'famille': 'family', 'familles': 'family',
  'familial': 'family', 'familiale': 'family',
  'vieillissement': 'aging', 'aine': 'elderly', 'aines': 'elderly',
  // Ajouts v7 (2026-09-14) : parite FR/EN du vocabulaire scientifique, pour
  // que les profils francais et anglais se relient sur les memes concepts
  // (connexions) et se trouvent avec les memes mots (recherche).
  'telesante': 'telehealth', 'telemedecine': 'telehealth', 'telemedicine': 'telehealth',
  'teleconsultation': 'teleconsultation', 'teleconsultations': 'teleconsultation',
  'telereadaptation': 'telerehabilitation', 'telesurveillance': 'telemonitoring',
  'neuroimagerie': 'neuroimaging', 'radiologie': 'radiology', 'tomographie': 'tomography',
  'irm': 'mri', 'tep': 'pet', 'avc': 'stroke', 'asthme': 'asthma', 'epilepsie': 'epilepsy',
  'cardiovasculaires': 'cardiovascular', 'vasculaire': 'vascular', 'vasculaires': 'vascular',
  'pulmonaire': 'pulmonary', 'pulmonaires': 'pulmonary', 'intestinal': 'intestinal',
  'intestinales': 'intestinal', 'perinatalite': 'perinatal', 'perinatal': 'perinatal',
  'gerontologie': 'gerontology', 'geriatrie': 'geriatrics', 'geriatrique': 'geriatric',
  'pediatriques': 'pediatric',
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
  'trouble': 'disorder', 'troubles': 'disorder', 'symptome': 'symptoms', 'symptomes': 'symptoms',
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
  'biostatistiques': 'biostatistics',
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

// Ajouts du passage en anglais (2026-11-26) : passe sur tous les mots-clés et les normes
// de Notion, pour que l'écriture française d'un sujet et son écriture anglaise donnent la
// même clé. Trois parties : les mots français, les variantes anglaises (pluriels,
// orthographe britannique) ramenées à la même forme, puis plus bas les expressions.
Object.assign(DICTIONNAIRE_FR_EN, {
  // Soignant et aidant ne sont pas le même sujet : « patient-provider communication », « caregivers ».
  'soignant': 'provider', 'soignants': 'provider', 'soignante': 'provider', 'soignantes': 'provider',
  'providers': 'provider', 'caregiving': 'caregivers',
  // Mots français
  'activite': 'activity', 'activites': 'activity',
  'administratif': 'administrative', 'administratifs': 'administrative', 'administratives': 'administrative',
  'adversite': 'adversity', 'aimantation': 'magnetization',
  'alimentaire': 'dietary', 'alimentaires': 'dietary', 'anonymisation': 'anonymization',
  'antimicrobien': 'antimicrobial', 'antimicrobiens': 'antimicrobial', 'antimicrobienne': 'antimicrobial',
  'apprenant': 'learner', 'apprenants': 'learner', 'apprenante': 'learner', 'apprenantes': 'learner', 'learners': 'learner',
  'approvisionnement': 'procurement', 'arn': 'rna', 'adn': 'dna',
  'augmentee': 'augmented', 'autonomisation': 'empowerment', 'avancee': 'advanced', 'avancees': 'advanced',
  'axone': 'axon', 'axones': 'axon', 'bioinformatique': 'bioinformatics',
  'biomedical': 'biomedical', 'biomedicale': 'biomedical', 'biomedicales': 'biomedical', 'biomedicaux': 'biomedical',
  'biopharmaceutique': 'biopharmaceutical', 'brulure': 'burn', 'brulures': 'burn',
  'cadre': 'framework', 'cahier': 'notebook', 'cahiers': 'notebook',
  // « calcul » n'est pas « informatique » : les expressions donnent « high performance computing ».
  'calcul': 'computation', 'calculs': 'computation', 'computations': 'computation',
  'cardiometabolique': 'cardiometabolic', 'catalogue': 'catalog', 'catalogues': 'catalog',
  'cerveau': 'brain', 'champ': 'field', 'chimie': 'chemistry',
  'citoyen': 'citizen', 'citoyens': 'citizen', 'citoyenne': 'citizen', 'citoyennes': 'citizen',
  'clinico': 'clinical', 'codeveloppement': 'codevelopment',
  'commercialisation': 'commercialization', 'complexite': 'complexity',
  'computationnelle': 'computational', 'computationnel': 'computational', 'conformite': 'compliance',
  'connecte': 'connected', 'connectee': 'connected', 'connectes': 'connected', 'connectees': 'connected',
  'connectivite': 'connectivity', 'connectomique': 'connectomics', 'contacts': 'contact',
  'conteneur': 'container', 'conteneurs': 'container', 'contextuel': 'contextual', 'contextuelle': 'contextual',
  'corporelle': 'body', 'corticale': 'cortical', 'corticaux': 'cortical',
  'cybersecurite': 'cybersecurity', 'decodage': 'decoding',
  'decouverte': 'discovery', 'decouvertes': 'discovery', 'demographie': 'demography',
  'deprescription': 'deprescribing', 'determinants': 'determinant',
  'distribue': 'distributed', 'distribuee': 'distributed', 'distribues': 'distributed', 'distribuees': 'distributed',
  'echantillon': 'sample', 'echantillons': 'sample', 'echographie': 'ultrasound', 'economie': 'economics',
  'effet': 'effect', 'effets': 'effect',
  'electroencephalographie': 'electroencephalography', 'electrophysiologie': 'electrophysiology',
  'emergente': 'emerging', 'emergentes': 'emerging', 'emergent': 'emerging',
  'enquete': 'survey', 'enquetes': 'survey', 'entrepot': 'warehouse', 'entrepots': 'warehouse',
  'entrepreneuriat': 'entrepreneurship',
  'environnement': 'environment', 'environnements': 'environment',
  'environnemental': 'environmental', 'environnementale': 'environmental', 'environnementales': 'environmental',
  'epigenetique': 'epigenetics', 'epigenomique': 'epigenomics',
  'etude': 'study', 'etudes': 'study', 'exposition': 'exposure', 'expositions': 'exposure',
  'facteur': 'factor', 'facteurs': 'factor',
  'federe': 'federated', 'federee': 'federated', 'federes': 'federated', 'federees': 'federated',
  'fiabilite': 'reliability', 'financement': 'funding',
  'fonctionnel': 'functional', 'fonctionnelle': 'functional', 'fonctionnels': 'functional', 'fonctionnelles': 'functional',
  'fondateur': 'founder', 'fondation': 'foundation', 'genealogie': 'genealogy',
  'genique': 'gene', 'geniques': 'gene', 'grossesse': 'pregnancy', 'grossesses': 'pregnancy',
  'guidee': 'guided', 'guidees': 'guided', 'guides': 'guided', 'habitude': 'habit', 'habitudes': 'habit',
  'harmonisation': 'harmonization', 'haute': 'high', 'haut': 'high',
  'heterogene': 'heterogeneous', 'heterogenes': 'heterogeneous', 'hippocampe': 'hippocampus',
  'histoire': 'history', 'histologie': 'histology', 'historique': 'historical',
  'homogeneisation': 'homogenization',
  'hospitalier': 'hospital', 'hospitaliere': 'hospital', 'hospitaliers': 'hospital', 'hospitalieres': 'hospital',
  'hopital': 'hospital', 'hopitaux': 'hospital', 'hospitalisation': 'hospitalization',
  'immunite': 'immunity', 'immunologie': 'immunology', 'incertitude': 'uncertainty',
  'indicateur': 'indicator', 'indicateurs': 'indicator',
  'infectieux': 'infectious', 'infectieuse': 'infectious', 'infectieuses': 'infectious', 'infectiologie': 'infectiology',
  'informatise': 'computerized', 'informatises': 'computerized', 'infrarouge': 'infrared',
  'intellectuel': 'intellectual', 'intellectuelle': 'intellectual', 'intellectuels': 'intellectual', 'intellectuelles': 'intellectual',
  'intelligent': 'smart', 'intelligents': 'smart', 'intelligente': 'smart', 'intelligentes': 'smart',
  'interdisciplinarite': 'interdisciplinarity',
  'intersectoriel': 'intersectoral', 'intersectorielle': 'intersectoral', 'intersectorielles': 'intersectoral',
  'isolement': 'isolation', 'jeunes': 'youth', 'jumelage': 'linkage',
  'laboratoire': 'laboratory', 'laboratoires': 'laboratory', 'lac': 'lake', 'lacs': 'lake',
  'lineaire': 'linear', 'lineaires': 'linear', 'localisation': 'localization', 'longue': 'long',
  'magnetique': 'magnetic', 'magnetiques': 'magnetic', 'magnetoencephalographie': 'magnetoencephalography',
  'maternelle': 'maternal', 'maternel': 'maternal', 'medicales': 'medical',
  'mesure': 'measure', 'mesures': 'measure',
  'metabolisme': 'metabolism', 'metadonnee': 'metadata', 'metadonnees': 'metadata',
  'microbien': 'microbial', 'microbienne': 'microbial', 'microbiologie': 'microbiology',
  'microdonnee': 'microdata', 'microdonnees': 'microdata', 'microscopie': 'microscopy',
  'morphometrie': 'morphometry', 'multicentrique': 'multicenter', 'multicentriques': 'multicenter',
  'multimodale': 'multimodal', 'multiomique': 'multiomics', 'multiprovinciale': 'multiprovincial',
  'myeline': 'myelin', 'neuroanatomie': 'neuroanatomy', 'neurochirurgie': 'neurosurgery',
  'neurodegeneratif': 'neurodegenerative', 'neurodegeneratives': 'neurodegenerative',
  'neurodegenerescence': 'neurodegeneration', 'neurodeveloppement': 'neurodevelopment',
  'neuroinformatique': 'neuroinformatics', 'neuropathologie': 'neuropathology', 'neurophysiologie': 'neurophysiology',
  'normalisation': 'normalization', 'norme': 'standard', 'normes': 'standard',
  'omique': 'omics', 'omiques': 'omics', 'ontologie': 'ontology', 'ontologies': 'ontology',
  'organisation': 'organization', 'organisations': 'organization',
  'partage': 'sharing', 'pathogene': 'pathogen', 'pathogenes': 'pathogen', 'pathologie': 'pathology',
  'perinatale': 'perinatal', 'peroperatoire': 'intraoperative',
  'personnalisee': 'personalized', 'personnalise': 'personalized', 'personnalises': 'personalized', 'personnalisees': 'personalized',
  // Pas « personnel » au singulier : en anglais, le même mot désigne le personnel.
  'personnels': 'personal', 'personnelle': 'personal', 'personnelles': 'personal',
  'pharmacoepidemiologie': 'pharmacoepidemiology', 'pharmacotherapie': 'pharmacotherapy',
  'pneumologie': 'respirology', 'polypharmacie': 'polypharmacy', 'polysomnographie': 'polysomnography',
  'portail': 'portal', 'portails': 'portal', 'poumon': 'lung', 'poumons': 'lung',
  'preclinique': 'preclinical', 'precoce': 'early', 'precoces': 'early',
  'prepublication': 'preprint', 'prepublications': 'preprint', 'pretraitement': 'preprocessing',
  'principe': 'principle', 'principes': 'principle', 'propriete': 'property',
  'radiographie': 'radiography', 'radiomique': 'radiomics', 'radiopharmaceutique': 'radiopharmaceutical',
  'rapportee': 'reported', 'rapportees': 'reported', 'rares': 'rare',
  'reglementaire': 'regulatory', 'reglementaires': 'regulatory',
  'relaxometrie': 'relaxometry', 'reproductibilite': 'reproducibility',
  'responsable': 'responsible', 'responsables': 'responsible', 'retinienne': 'retinal',
  'retroaction': 'feedback', 'reutilisation': 'reuse', 'risque': 'risk', 'risques': 'risk',
  'rongeur': 'rodent', 'rongeurs': 'rodent', 'rurale': 'rural',
  'secondaire': 'secondary', 'secondaires': 'secondary',
  'sensible': 'sensitive', 'sensibles': 'sensitive', 'sequencage': 'sequencing', 'serologie': 'serology',
  'souche': 'stem', 'souches': 'stem', 'spatiale': 'spatial', 'spectroscopie': 'spectroscopy',
  'stockage': 'storage', 'synthetique': 'synthetic', 'synthetiques': 'synthetic',
  'tissu': 'tissue', 'tissus': 'tissue', 'tracabilite': 'traceability', 'tracage': 'tracing',
  'tractographie': 'tractography', 'trajectoire': 'trajectory', 'trajectoires': 'trajectory',
  'transcriptomique': 'transcriptomics', 'translationnelle': 'translational',
  'traumatisme': 'trauma', 'traumatismes': 'trauma', 'traumatologie': 'traumatology',
  'tumoral': 'tumor', 'tumorale': 'tumor', 'tumeur': 'tumor', 'tumeurs': 'tumor',
  'urologie': 'urology', 'valeur': 'value', 'valorisation': 'valorization', 'vie': 'life',
  'virtuels': 'virtual', 'virtuelles': 'virtual', 'visualisation': 'visualization',
  // Féminins et pluriels des mots ci-dessus.
  'agents': 'agent', 'antimicrobiennes': 'antimicrobial',
  'augmente': 'augmented', 'augmentes': 'augmented', 'augmentees': 'augmented',
  'avance': 'advanced', 'avances': 'advanced',
  'biopharmaceutiques': 'biopharmaceutical', 'cardiometaboliques': 'cardiometabolic',
  'computationnels': 'computational', 'computationnelles': 'computational',
  'contextuels': 'contextual', 'contextuelles': 'contextual',
  'corporel': 'body', 'corporels': 'body', 'corporelles': 'body', 'corticales': 'cortical',
  'emergents': 'emerging', 'environnementaux': 'environmental',
  'fondateurs': 'founder', 'fondations': 'foundation', 'historiques': 'historical',
  'informatisee': 'computerized', 'informatisees': 'computerized', 'intersectoriels': 'intersectoral',
  'jeune': 'youth', 'jeunesse': 'youth', 'longues': 'long',
  'maternels': 'maternal', 'maternelles': 'maternal',
  'microbiens': 'microbial', 'microbiennes': 'microbial',
  'multimodales': 'multimodal', 'multimodaux': 'multimodal', 'multiomiques': 'multiomics',
  'multiprovincial': 'multiprovincial', 'multiprovinciales': 'multiprovincial', 'multiprovinciaux': 'multiprovincial',
  'neurodegeneratifs': 'neurodegenerative',
  'perinatales': 'perinatal', 'perinataux': 'perinatal', 'peroperatoires': 'intraoperative',
  'precliniques': 'preclinical', 'radiopharmaceutiques': 'radiopharmaceutical',
  'rapporte': 'reported', 'rapportes': 'reported',
  'retinien': 'retinal', 'retiniens': 'retinal', 'retiniennes': 'retinal',
  'rurales': 'rural', 'ruraux': 'rural', 'spatiales': 'spatial', 'spatiaux': 'spatial',
  'translationnel': 'translational', 'translationnels': 'translational', 'translationnelles': 'translational',
  'tumorales': 'tumor', 'tumoraux': 'tumor', 'valeurs': 'value',
  'ville': 'city', 'villes': 'city', 'cities': 'city',
  // Variantes anglaises ramenées à la forme retenue (pluriels, orthographe britannique).
  'activities': 'activity', 'adolescents': 'adolescent', 'adults': 'adult', 'ageing': 'aging',
  'algorithms': 'algorithm', 'applications': 'application', 'assessment': 'evaluation',
  'axons': 'axon', 'biobanks': 'biobank', 'burns': 'burn', 'cells': 'cell', 'children': 'child',
  'clinics': 'clinic', 'datasets': 'dataset', 'communities': 'community', 'containers': 'container',
  'devices': 'device', 'disorders': 'disorder', 'drugs': 'drug',
  'effects': 'effect', 'factors': 'factor', 'formats': 'format', 'genes': 'gene', 'gpus': 'gpu',
  'habits': 'habit', 'hospitals': 'hospital', 'indicators': 'indicator', 'inequalities': 'inequality',
  'lifestyles': 'lifestyle', 'measurement': 'measure', 'measurements': 'measure', 'measures': 'measure',
  'medication': 'drug', 'medications': 'drug', 'men': 'man', 'methods': 'method',
  'multicentre': 'multicenter', 'networks': 'network', 'notebooks': 'notebook',
  'outcomes': 'outcome', 'paediatric': 'pediatric', 'paediatrics': 'pediatrics',
  'patients': 'patient', 'persons': 'person', 'platforms': 'platform', 'policies': 'policy',
  'pregnancies': 'pregnancy', 'preprints': 'preprint', 'principles': 'principle',
  'professional': 'professionals', 'professors': 'professor', 'projects': 'project',
  'pulmonology': 'respirology', 'record': 'records', 'registries': 'registry', 'regulations': 'regulation',
  'researchers': 'researcher', 'samples': 'sample', 'scaling': 'scale', 'senior': 'elderly', 'seniors': 'elderly',
  'settings': 'setting', 'skill': 'skills', 'sources': 'source', 'standardisation': 'standardization', 'standards': 'standard',
  'students': 'student', 'studies': 'study', 'surveys': 'survey', 'symptom': 'symptoms', 'systems': 'system',
  'teams': 'team', 'technologies': 'technology', 'therapies': 'therapy', 'tools': 'tool',
  'tumors': 'tumor', 'tumour': 'tumor', 'tumours': 'tumor', 'ultrasonography': 'ultrasound',
  'variants': 'variant', 'women': 'woman', 'workflows': 'workflow', 'pipelines': 'pipeline',
});

// Expressions de plusieurs mots : le mot à mot ne donne pas le terme anglais consacré
// (« apprentissage automatique » se dit « machine learning », pas « automatic learning »).
// Elles ne servent qu'à la clé d'un mot-clé entier (cleMotCle), pas à la recherche en texte libre.
// À gauche, l'expression pliée, sans mots de liaison ; à droite, ce qui la remplace.
// Un sigle développé rejoint aussi son sigle (« imagerie par résonance magnétique » et « IRM »).
const EXPRESSIONS = {
  // Intelligence artificielle, calcul, données
  'apprentissage automatique': 'machine learning', 'apprentissage machine': 'machine learning',
  'traitement d\'image': 'image processing', 'traitement d\'images': 'image processing',
  'traitement du signal': 'signal processing', 'traitement de signaux': 'signal processing',
  'traitement de données': 'data processing', 'traitement du langage naturel': 'natural language processing',
  'chaîne de traitement': 'processing pipeline', 'chaînes de traitement': 'processing pipeline',
  'pipeline d\'analyse': 'processing pipeline', 'pipelines d\'analyse': 'processing pipeline', 'pipeline de traitement': 'processing pipeline',
  'analysis pipeline': 'processing pipeline', 'analysis pipelines': 'processing pipeline', 'processing pipelines': 'processing pipeline',
  'traitement automatique du langage naturel': 'natural language processing', 'traitement automatique des langues': 'natural language processing',
  'traitement des langues naturelles': 'natural language processing', 'taln': 'natural language processing',
  'calcul de haute performance': 'high performance computing', 'calcul haute performance': 'high performance computing',
  'calcul intensif': 'high performance computing', 'hpc': 'high performance computing',
  'calcul scientifique': 'scientific computing', 'calcul distribué': 'distributed computing',
  'calcul informatique de pointe': 'advanced research computing',
  'jeu de données': 'dataset', 'jeux de données': 'dataset', 'data set': 'dataset', 'data sets': 'dataset',
  'collecte de données': 'data collection',
  // « time » et « first » sont des mots vides en anglais : un mot inventé garde le sujet entier.
  'temps réel': 'realtime', 'real time': 'realtime',
  'premières nations': 'firstnations', 'première nation': 'firstnations', 'first nations': 'firstnations', 'first nation': 'firstnations',
  'flux de travail': 'workflow',
  'processeur graphique': 'gpu', 'processeurs graphiques': 'gpu',
  'graphics processing unit': 'gpu', 'graphics processing units': 'gpu',
  'données massives': 'big data', 'donnée massive': 'big data', 'mégadonnées': 'big data',
  'forage de données': 'data mining', 'fouille de données': 'data mining',
  'infonuagique': 'cloud computing', 'informatique en nuage': 'cloud computing',
  'informatique de la santé': 'health informatics', 'informatique médicale': 'medical informatics',
  'informatique biomédicale': 'biomedical informatics',
  'co-conception': 'codesign',
  // « case » et « support » sont des mots vides en anglais : même procédé.
  'définition de cas': 'casedefinition', 'case definition': 'casedefinition',
  // « built » est un mot vide en anglais : un mot inventé garde le sujet distinct de « environnement ».
  'environnement bâti': 'builtenvironment', 'built environment': 'builtenvironment',
  // Vie privée et protection des renseignements personnels : un seul sujet (« confidentialité » reste à part).
  'vie privée': 'privacy', 'protection de la vie privée': 'privacy', 'privacy protection': 'privacy',
  'protection des renseignements personnels': 'privacy', 'personal information protection': 'privacy',
  'protection of personal information': 'privacy',
  // Imagerie et neurosciences
  'proche infrarouge': 'near infrared',
  'recalage d\'image': 'image registration', 'recalage d\'images': 'image registration',
  'imagerie par résonance magnétique': 'mri', 'magnetic resonance imaging': 'mri',
  'irmf': 'functional mri', 'fmri': 'functional mri',
  'eeg': 'electroencephalography', 'meg': 'magnetoencephalography',
  'fnirs': 'functional near infrared spectroscopy',
  'matière blanche': 'white matter', 'matière grise': 'gray matter', 'grey matter': 'gray matter',
  'moelle épinière': 'spinal cord', 'colonne vertébrale': 'spine',
  'radiographie pulmonaire': 'chest x ray', 'radiographie thoracique': 'chest x ray',
  'chest radiograph': 'chest x ray', 'chest radiography': 'chest x ray',
  // Soins et santé
  // Dossier médical électronique (DMÉ), dossier de santé électronique (DSÉ) et dossier clinique informatisé (DCI) :
  // un seul sujet. « Dossier médical » tout court et « Dossier santé Québec » restent à part.
  'dossier clinique informatisé': 'electronic health records', 'dossiers cliniques informatisés': 'electronic health records',
  'dossier médical informatisé': 'electronic health records', 'dossiers médicaux informatisés': 'electronic health records',
  'dossier médical électronique': 'electronic health records', 'dossiers médicaux électroniques': 'electronic health records',
  'dossier de santé électronique': 'electronic health records', 'dossiers de santé électroniques': 'electronic health records',
  'electronic medical record': 'electronic health records', 'electronic medical records': 'electronic health records',
  'electronic health record': 'electronic health records',
  'dmé': 'electronic health records', 'dsé': 'electronic health records', 'dci': 'electronic health records',
  'emr': 'electronic health records', 'ehr': 'electronic health records', 'emrs': 'electronic health records', 'ehrs': 'electronic health records',
  'état de santé': 'health status',
  'système de santé apprenant': 'learning health system', 'systèmes de santé apprenants': 'learning health system',
  'activité physique': 'physical activity', 'activités physiques': 'physical activity', 'santé physique': 'physical health',
  'maladie génétique': 'genetic disease', 'test génétique': 'genetic test', 'analyse génétique': 'genetic analysis',
  'traitement de la douleur': 'pain management',
  'soins de première ligne': 'primary care', 'première ligne': 'primary care',
  'soutien à domicile': 'home care', 'hospital at home': 'home hospitalization',
  'réanimation': 'intensive care', 'icu': 'intensive care', 'intensive care unit': 'intensive care',
  'unité de soins intensifs': 'intensive care',
  'amélioration continue': 'continuous improvement',
  'aide à la décision': 'decisionsupport', 'decision support': 'decisionsupport', 'prise de décision': 'decision making',
  'soins fondés sur la valeur': 'value based care',
  'recherche axée sur les pratiques': 'practice based research',
  'mesure rapportée par le patient': 'patient reported outcome measures',
  'mesures de résultats rapportées par le patient': 'patient reported outcome measures',
  'mesure de résultats rapportée par le patient': 'patient reported outcome measures',
  'mesures des résultats déclarés par les patients': 'patient reported outcome measures', 'proms': 'patient reported outcome measures',
  // Les mesures d'expérience (PREMs) sont un autre sujet.
  'mesures d\'expérience rapportées par le patient': 'patient reported experience measures',
  'mesure d\'expérience rapportée par le patient': 'patient reported experience measures',
  'mesures des expériences déclarées par les patients': 'patient reported experience measures', 'prems': 'patient reported experience measures',
  'patient reported experience measure': 'patient reported experience measures',
  'mesures rapportées par le patient': 'patient reported outcome measures',
  'patient reported outcome measure': 'patient reported outcome measures',
  'patient reported outcomes': 'patient reported outcome measures',
  'sécurité des médicaments': 'drug safety',
  'clinique de la douleur': 'pain clinic',
  'issue de grossesse': 'pregnancy outcome', 'issues de grossesse': 'pregnancy outcome',
  'santé mère-enfant': 'maternal child health',
  'périnatalité': 'perinatal health',
  'sclérose en plaques': 'multiple sclerosis',
  'trouble cognitif': 'cognitive impairment', 'troubles cognitifs': 'cognitive impairment',
  'cognitive disorder': 'cognitive impairment', 'cognitive disorders': 'cognitive impairment',
  'variant génétique': 'genetic variant',
  'télésurveillance': 'telemonitoring', 'remote patient monitoring': 'telemonitoring', 'remote monitoring': 'telemonitoring',
  'mhealth': 'mobile health',
  'autogestion': 'self management',
  'proche aidance': 'caregivers', 'proche aidant': 'caregivers', 'proches aidants': 'caregivers',
  'proche aidante': 'caregivers', 'proches aidantes': 'caregivers',
  // Vie, société, innovation
  'vie quotidienne': 'daily living', 'petite enfance': 'early childhood',
  'habitude de vie': 'lifestyle', 'habitudes de vie': 'lifestyle', 'mode de vie': 'lifestyle', 'modes de vie': 'lifestyle',
  'lifestyle habit': 'lifestyle', 'lifestyle habits': 'lifestyle',
  'médecine personnalisée': 'precision medicine', 'personalized medicine': 'precision medicine', 'personalised medicine': 'precision medicine',
  'imagerie de diffusion': 'diffusion mri', 'diffusion imaging': 'diffusion mri',
  'étude de cohorte': 'cohort', 'études de cohorte': 'cohort', 'études de cohortes': 'cohort', 'cohort study': 'cohort', 'cohort studies': 'cohort',
  'infectiologie': 'infectious disease',
  'réussite scolaire': 'academic achievement',
  'compétence numérique': 'digital skills', 'compétences numériques': 'digital skills',
  'milieu réel': 'real world', 'milieu clinique': 'clinical setting',
  'mise à l\'échelle': 'scale up',
  'laboratoire vivant': 'living lab', 'living laboratory': 'living lab',
  'objet connecté': 'connected device', 'objets connectés': 'connected device',
  'transfert technologique': 'technology transfer',
  'démarrage d\'étude': 'study startup', 'study start-up': 'study startup',
  // Normes et formats : chaque norme garde sa propre clé (CIM-10 n'est pas CIM-O-3),
  // et le nom français d'une classification rejoint son nom anglais.
  'cim-10': 'icd10', 'icd-10': 'icd10', 'cim-o-3': 'icdo3', 'icd-o-3': 'icdo3',
  'cim-9': 'icd9', 'icd-9': 'icd9', 'cim-11': 'icd11', 'icd-11': 'icd11',
  'cim10': 'icd10', 'cim9': 'icd9', 'cim11': 'icd11', 'cimo3': 'icdo3',
  // « HL7 FHIR » se dit aussi « FHIR » tout court.
  'hl7 fhir': 'fhir',
  'norme bids': 'bids', 'format bids': 'bids', 'bids standard': 'bids', 'bids format': 'bids',
};

// Mots-clés entiers ramenés à un autre : l'écriture anglaise consacrée d'un sujet dont la
// traduction mot à mot donnerait autre chose (« urgences » se dit « emergency department »).
const SUJETS_ENTIERS = {
  'emergency department': 'emergency', 'emergency departments': 'emergency', 'service des urgences': 'emergency',
  'trauma care': 'traumatology',
};

// Préfixes détachés et chiffres, soudés avant tout le reste : « pré-traitement d'image » doit
// devenir « prétraitement d'image » avant que l'expression « traitement d'image » ne soit cherchée.
const SOUDURES = {
  'pré-traitement': 'pretraitement', 'pre-processing': 'preprocessing',
  'neuro-imagerie': 'neuroimaging', 'neuro-imaging': 'neuroimaging',
  'neuro-informatique': 'neuroinformatics', 'neuro-informatics': 'neuroinformatics',
  'bio-informatique': 'bioinformatics', 'bio-informatics': 'bioinformatics',
  'multi-omique': 'multiomics', 'multi-omiques': 'multiomics', 'multi-omics': 'multiomics',
  'co-design': 'codesign', 'co-développement': 'codevelopment', 'co-development': 'codevelopment',
  'e-santé': 'ehealth', 'esanté': 'ehealth', 'e-health': 'ehealth',
  'm-santé': 'mhealth', 'msanté': 'mhealth', 'm-health': 'mhealth',
  'type 1': 'type1', 'type 2': 'type2',
  // « HL7 » est la famille ; ses versions sont des normes distinctes.
  'hl7 v2': 'hl7v2', 'hl7 version 2': 'hl7v2', 'hl7 v3': 'hl7v3', 'hl7 version 3': 'hl7v3',
};

// Sigles de deux lettres, trop courts pour compter comme mots : dans un mot-clé, seuls ou
// accompagnés, ils valent l'expression qu'ils abrègent (« IA » est « intelligence artificielle »,
// « IA en santé » n'est pas « santé »). Cela ne touche pas à la recherche en texte libre.
const SIGLES_DANS_UN_SUJET = { ia: 'artificial intelligence', ai: 'artificial intelligence' };

// Mots de liaison retirés avant de reconnaître une expression : « traitement de l'image »
// et « traitement d'image » sont la même expression.
const LIAISONS = new Set(['de', 'du', 'des', 'd', 'l', 'le', 'la', 'les', 'a', 'au', 'aux', 'en', 'par', 'pour', 'sur', 'et',
  'of', 'the', 'in', 'for', 'and', 'on', 'to', 's']);

// Texte plié, sans ponctuation ni mots de liaison, mots séparés par une espace.
function aplatir(texte) {
  return plier(texte).split(/[^a-z0-9]+/).filter((m) => m && !LIAISONS.has(m)).join(' ');
}

// Les deux tables, aplaties une fois ; les expressions les plus longues passent d'abord.
const aplatirTable = (table) => Object.entries(table)
  .map(([expression, remplacement]) => [` ${aplatir(expression)} `, ` ${remplacement} `])
  .sort((x, y) => y[0].length - x[0].length);
const SOUDURES_APLATIES = aplatirTable(SOUDURES);
const EXPRESSIONS_APLATIES = aplatirTable(EXPRESSIONS);
const SUJETS_ENTIERS_APLATIS = new Map(Object.entries(SUJETS_ENTIERS).map(([sujet, autre]) => [aplatir(sujet), autre]));

function remplacerExpressions(texte) {
  const plat = aplatir(texte);
  if (SUJETS_ENTIERS_APLATIS.has(plat)) return SUJETS_ENTIERS_APLATIS.get(plat);
  let t = ` ${plat.split(' ').map((m) => SIGLES_DANS_UN_SUJET[m] || m).join(' ')} `;
  for (const table of [SOUDURES_APLATIES, EXPRESSIONS_APLATIES]) {
    for (const [expression, remplacement] of table) {
      if (t.includes(expression)) t = t.split(expression).join(remplacement);
    }
  }
  return t.trim();
}

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

// Clé d'un mot-clé entier : ses mots canoniques, triés, une fois les expressions
// remplacées. « Intelligence artificielle » et « artificial intelligence » donnent la
// même clé, « apprentissage automatique » et « machine learning » aussi.
// Les sigles courts (« IA », « ATC ») sont gardés tels quels.
// Les clés déjà calculées sont gardées (le graphe et les suggestions redemandent les mêmes à chaque
// geste), sans dépasser CLES_GARDEES : la recherche y fait passer chaque saisie.
const CLES_GARDEES = 5000;
const clesConnues = new Map();
function cleMotCle(motCle) {
  const texte = String(motCle || '');
  if (clesConnues.has(texte)) return clesConnues.get(texte);
  const mots = motsCanoniques(remplacerExpressions(texte));
  let cle;
  if (mots.length === 0) {
    const brut = plier(texte).replace(/[^a-z0-9]+/g, '');
    cle = brut.length >= 2 && !MOTS_VIDES.has(brut) ? brut : null;
  } else {
    cle = [...new Set(mots)].sort().join('+');
  }
  if (clesConnues.size >= CLES_GARDEES) clesConnues.clear();
  clesConnues.set(texte, cle);
  return cle;
}

const api = { MOTS_VIDES, DICTIONNAIRE_FR_EN, EXPRESSIONS, SUJETS_ENTIERS, SOUDURES, CLES_GARDEES, clesConnues, plier, canoniser, motsCanoniques, cleMotCle };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
