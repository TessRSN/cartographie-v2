/**
 * Textes de l'interface, échappement et filtres.
 * Chargé par <script> dans le navigateur et par require() côté serveur et dans les essais.
 */
(function (racine) {
'use strict';

// Tous les textes de l'interface, pour l'ajout ultérieur de l'anglais.
// Dans gabarit.html, un élément marqué data-texte="chemin.de.la.cle" reçoit le texte correspondant.
const TEXTES = {
  nomSite: 'Cartographie du RSN',
  titre: 'Cartographie des ressources en santé numérique',
  titreOnglet: (nom) => `${nom} | Cartographie du RSN`,
  reseau: 'Réseau santé numérique',
  sousTitre: 'Jeux de données, catalogues, plateformes, logiciels, et services ouverts aux équipes du Québec.',
  recherche: 'Rechercher une ressource, un sujet, un porteur…',
  rechercheNom: 'Rechercher une ressource',
  effacerRecherche: 'Effacer la recherche',
  accueil: "Retour à l'accueil de la cartographie",
  logo: 'Logo du RSN',
  siteReseau: 'Ouvrir le site du Réseau santé numérique',
  siteBottin: 'Ouvrir le bottin des membres du réseau',
  theme: { sombre: 'Passer au mode sombre', clair: 'Passer au mode clair' },
  oui: 'Oui',
  filtres: {
    type: 'Type', modeAcces: "Mode d'accès", porteur: 'Porteur', etat: 'État', portee: 'Portée', langue: 'Langue', norme: 'Normes et formats',
    tous: 'Tous', effacer: 'Tout réinitialiser', retirer: 'Retirer', horsCarte: 'En ligne ou hors Québec',
  },
  // Étiquettes de la sélection en cours, affichées sur la carte ou le graphe et au-dessus de la liste.
  selection: { titre: 'Sélection en cours', recherche: 'Recherche', connexions: 'Connexions de' },
  // Étiquette d'accès d'une carte de fiche : « Accès : Ouvert », « Accès : non précisé par la ressource ».
  acces: (mode) => `Accès : ${/^non précisé/i.test(mode) ? mode.charAt(0).toLowerCase() + mode.slice(1) : mode}`,
  autresSujets: (n) => (n > 1 ? `${n} autres sujets` : '1 autre sujet'),
  autresPorteurs: (n) => (n > 1 ? `${n} autres porteurs` : '1 autre porteur'),
  // Nom court de chaque type, pour les pastilles, la légende et le bandeau.
  typesCourts: { jeu: 'Jeu de données', catalogue: 'Catalogue', plateforme: 'Plateforme', logiciel: 'Logiciel', service: 'Service', autre: 'Autre' },
  // Ce qu'on trouve sous chaque type, en quelques mots (panneau des types).
  typesAides: { jeu: 'Cohortes, biobanques', catalogue: 'Portails, entrepôts', plateforme: 'Calcul, analyse, stockage', logiciel: 'Outils, applications', service: 'Équipes, guichets' },
  compte: (n) => (n === 0 ? 'Aucune fiche' : n === 1 ? '1 fiche' : `${n} fiches`),
  affichees: (n) => (n > 1 ? 'ressources affichées' : 'ressource affichée'),
  aucunResultat: 'Aucune ressource ne correspond à cette recherche.',
  aucunResultatAide: 'Essayez de modifier la recherche ou les filtres.',
  indisponible: 'Les données ne sont pas disponibles pour le moment.',
  chargement: 'Chargement des ressources…',
  vues: { choisir: 'Choisir la vue', carte: 'Carte', connexions: 'Connexions', recentrer: 'Recentrer' },
  carte: {
    titre: 'Carte',
    surLaCarte: (n) => (n === 0 ? 'Aucune ressource sur la carte' : n === 1 ? '1 ressource sur la carte' : `${n} ressources sur la carte`),
    horsCarte: (n) => `En ligne ou hors Québec : ${n}`,
    horsCarteTitre: 'En ligne ou hors Québec',
    horsCarteAide: 'Ces ressources ne sont pas placées sur la carte du Québec.',
    horsCarteFermer: 'Fermer et revenir à la carte',
    ressources: (n) => (n > 1 ? 'ressources' : 'ressource'),
    voirFiches: 'Voir les fiches de ce porteur',
    indisponible: "La carte n'a pas pu être chargée. Vérifiez votre connexion et rechargez la page.",
    aide: 'Chaque ressource est placée chez son porteur.',
  },
  graphe: {
    titre: 'Connexions',
    intro: 'Chaque point est une ressource. Un trait relie deux ressources qui partagent des sujets distinctifs ; plus il est épais, plus la proximité est forte. Cliquez sur un point pour voir ce qui le relie aux autres.',
    aideBouton: 'Comment sont calculées les connexions ?',
    calcul: 'Calcul des connexions…',
    densite: 'Liens : tous ↔ les plus forts',
    masquerIsoles: 'Masquer les ressources sans lien',
    compte: (n, l) => `${n} ${n > 1 ? 'ressources' : 'ressource'}, ${l} ${l > 1 ? 'connexions affichées' : 'connexion affichée'}`,
    sujetsCommuns: 'Sujets communs',
    // Panneau des liens d'une ressource, ouvert au clic sur un point.
    relieeA: (n) => (n > 1 ? `Reliée à ${n} ressources par leurs sujets communs` : 'Reliée à une ressource par leurs sujets communs'),
    sansLien: "Cette ressource n'a de sujet distinctif en commun avec aucune autre.",
    fermerLiens: 'Fermer et revenir à la vue d’ensemble',
    // Deux façons de relier : des traits entre ressources, ou chaque ressource rattachée à ses sujets.
    relier: 'Relier',
    modeRessources: 'Entre ressources',
    modeSujets: 'Par sujets',
    introSujets: "Chaque étiquette est un sujet partagé par au moins cinq ressources ; chaque point est une ressource, rattachée à ses sujets. Cliquez sur un sujet ou sur un point pour voir ce qui s'y rattache.",
    compteSujets: (n, s, k) => `${n} ${n > 1 ? 'ressources' : 'ressource'}, ${s} ${s > 1 ? 'sujets' : 'sujet'}${k ? ` ; ${k} sans sujet fréquent` : ''}`,
    ressourcesDuSujet: (n) => (n > 1 ? `${n} ressources portent sur ce sujet` : 'Une ressource porte sur ce sujet'),
    porteSur: (n) => (n > 1 ? `Porte sur ${n} sujets fréquents` : 'Porte sur un sujet fréquent'),
    vide: 'Aucun lien entre les ressources affichées.',
    indisponible: "Le graphe n'a pas pu être chargé. Vérifiez votre connexion et rechargez la page.",
    aide: 'Deux ressources sont reliées quand elles partagent des sujets distinctifs.',
  },
  aide: {
    titre: 'Comment sont calculées les connexions ?',
    chapeau: 'Aucune intelligence artificielle : un calcul déterministe, refait dans votre navigateur à partir des sujets inscrits dans les fiches.',
    sections: [
      ["D'où viennent les sujets", "Des sujets (mots-clés) de chaque fiche, auxquels s'ajoutent ses normes et formats. Un sujet est pris en entier : « imagerie par résonance magnétique » compte comme une seule expression. Un dictionnaire rapproche le français et l'anglais, pour qu'« intelligence artificielle » et « artificial intelligence » comptent comme un même sujet."],
      ['Quels sujets comptent', "Un sujet présent dans plus de 20 % des fiches ne distingue aucune ressource ; un sujet présent dans une seule fiche ne peut relier personne. Ces sujets sont ignorés. Parmi les autres, un sujet rare pèse plus qu'un sujet courant."],
      ['Quels liens sont affichés', "Les liens au-dessus du seuil du curseur, puis les 4 voisines les plus proches de chaque ressource, avec un maximum de 10 liens par ressource pour éviter les étoiles illisibles. L'épaisseur du trait suit le score."],
      ['Lire le graphe', "Cliquez sur un point pour voir ce qui le relie aux autres. « Par sujets » montre les sujets partagés par au moins cinq ressources."],
      ['Les ●●● dans « Ressources proches »', '●●● proximité forte, plusieurs sujets rares en commun. ●●○ moyenne. ●○○ faible. Le classement suit le score, pas le nombre de sujets.'],
      ['Limites', "Une fiche qui porte peu de sujets, ou des sujets très généraux, aura peu de liens : la qualité du graphe dépend de la précision des sujets inscrits dans les fiches."],
    ],
  },
  // Formulaire « proposer une ressource ou une modification » (page /proposer).
  contribuer: {
    titreNouvelle: 'Proposer une ressource',
    titreModification: (nom) => `Modifier la fiche ${nom}`,
    intro: "Votre proposition sera examinée par une personne de l'équipe avant d'être publiée.",
    regle: 'La cartographie recense des ressources numériques en santé : jeux de données, catalogues, plateformes, logiciels et services. Elle ne recense pas les organismes de financement ou de concertation.',
    dejaEnAttente: 'Une autre proposition est déjà en attente pour cette fiche. Vous pouvez quand même envoyer la vôtre : la personne qui examine verra les deux.',
    etapes: { type: 'Le type', commun: "L'essentiel", propre: 'Les détails', rsn: 'La ressource' },
    etape: (n, total) => `Étape ${n} sur ${total}`,
    questionType: 'De quel type de ressource s’agit-il ?',
    exemples: 'Par exemple',
    types: {
      jeu: { definition: "Une collection précise de données ou d'échantillons.", exemples: ['CARTaGENE', 'une cohorte de naissance'] },
      catalogue: { definition: 'Plusieurs jeux de données recensés ou détenus au même endroit.', exemples: ['un portail de données', "un lac de données d'hôpital"] },
      plateforme: { definition: "Un environnement où l'on calcule, stocke ou analyse.", exemples: ["un environnement d'analyse sécurisé", 'une grappe de calcul'] },
      logiciel: { definition: "Quelque chose qu'on installe ou qu'on utilise.", exemples: ["un outil d'analyse d'images", 'une application pour patients'] },
      service: { definition: "Une équipe à qui l'on fait une demande.", exemples: ["un guichet d'accès aux données", 'une équipe de biostatistique'] },
    },
    rsnTitre: "Je préfère que l'équipe du RSN remplisse la fiche",
    rsnAide: 'Donnez le nom de la ressource, son site et quelques mots : nous nous occupons du reste.',
    rsnRetour: 'Finalement, je remplis la fiche moi-même',
    groupes: {
      identite: 'La ressource', liens: 'Où la trouver', porteur: 'Qui la porte', acces: 'Comment y accéder',
      portee: 'Portée et langues', sujets: 'Sujets, normes et outils', contact: 'À qui écrire',
      donnees: 'Les données', logiciel: 'Le logiciel',
    },
    champs: {
      typePrincipal: { libelle: 'Type principal' },
      secondType: { libelle: 'Second type', aide: 'Seulement si la ressource est aussi autre chose.' },
      nom: { libelle: 'Nom de la ressource' },
      autresNoms: { libelle: 'Sigle et autres noms', aide: 'Sigle, ancien nom, nom en anglais.' },
      phrase: { libelle: 'En une phrase', aide: 'Ce que la ressource permet de faire, en 300 caractères au plus.' },
      description: { libelle: 'Description', aide: 'Quelques paragraphes, en langage simple.' },
      lien: { libelle: 'Lien principal', aide: 'Le site de la ressource, avec https://' },
      autresLiens: { libelle: 'Autres liens', aide: 'Un lien par ligne : documentation, publication, tutoriel.' },
      porteurs: { libelle: 'Porté par', aide: "L'établissement ou l'organisme responsable. Choisissez dans la liste ou ajoutez-en un." },
      modesAcces: { libelle: "Mode d'accès" },
      commentAcceder: { libelle: 'Comment y accéder', aide: "Le lien vers la page qui explique l'accès ou la demande." },
      frais: { libelle: 'Frais' },
      reserveA: { libelle: 'Réservé à', aide: "Si l'accès est limité à certaines personnes." },
      environnementSecurise: { libelle: 'Les données se consultent dans un environnement sécurisé' },
      portee: { libelle: 'Portée' },
      langues: { libelle: 'Langues' },
      motsCles: { libelle: 'Mots-clés', aide: 'Les sujets couverts. Choisissez dans la liste ou ajoutez-en.' },
      normes: { libelle: 'Normes et formats', aide: 'Par exemple HL7 FHIR, OMOP CDM, DICOM, BIDS.' },
      outils: { libelle: 'Outils et environnements', aide: 'Par exemple REDCap, Docker, R.' },
      financePar: { libelle: 'Financé par' },
      doi: { libelle: 'DOI', aide: 'Sous la forme https://doi.org/…' },
      contact: { libelle: 'Courriel de contact', aide: 'Une adresse publique, affichée sur la fiche.' },
      responsable: { libelle: 'Responsable', aide: 'Le nom de la personne responsable, affiché sur la fiche.' },
      profilResponsable: { libelle: 'Profil du responsable', aide: 'Un lien vers son profil universitaire ou sa page du bottin. Le nom du responsable y mènera.' },
      logo: { libelle: 'Logo', aide: 'Déposez une image, ou donnez son adresse sur le Web.' },
      population: { libelle: 'Population', aide: 'Qui est décrit par les données.' },
      periode: { libelle: 'Période couverte', aide: 'Par exemple 2009 à aujourd’hui.' },
      typesDonnees: { libelle: 'Types de données' },
      collecte: { libelle: 'Collecte' },
      jumelage: { libelle: "Les données peuvent être jumelées à d'autres sources" },
      dictionnaire: { libelle: 'Dictionnaire ou catalogue détaillé', aide: 'Le lien vers la liste des variables.' },
      depotCode: { libelle: 'Dépôt de code', aide: 'Par exemple une adresse GitHub.' },
      licence: { libelle: 'Licence', aide: 'Par exemple MIT, GPL-3.0.' },
    },
    rsnDescription: { libelle: 'Quelques mots sur la ressource', aide: 'Ce que c’est, à qui ça sert.' },
    logoChoisir: 'Choisir une image', logoChanger: 'Changer d’image', logoRetirer: 'Retirer',
    logoFormats: 'PNG, JPEG, WebP ou SVG, 2 Mo au plus.',
    logoOu: 'ou son adresse :',
    logoTropGros: "L'image dépasse 2 Mo. Choisissez un fichier plus léger.",
    logoIllisible: "L'image n'a pas pu être lue. Choisissez un autre fichier.",
    logoPerdu: "Après un rechargement de la page, l'image est à choisir de nouveau.",
    choisir: 'Choisir…',
    ajouter: 'Ajouter',
    indiceListe: 'Écrivez puis appuyez sur Entrée',
    retirer: (valeur) => `Retirer ${valeur}`,
    nouveauPorteur: (nom) => `« ${nom} » n'est pas encore dans la cartographie. Son adresse postale, pour le placer sur la carte :`,
    obligatoire: 'obligatoire',
    vousTitre: 'Et vous ?',
    nomProposant: { libelle: 'Votre nom', aide: "Facultatif. Vu seulement par l'équipe, jamais affiché sur le site." },
    lienQuestion: 'Quel est votre lien avec cette ressource ?',
    liens: { responsable: "J'en suis responsable", 'jy-travaille': "J'y travaille", aucun: 'Aucun' },
    conditions: "Je confirme que ces renseignements sont publics et exacts à ma connaissance, et j'accepte qu'ils soient publiés dans la cartographie du RSN après examen.",
    precedent: 'Retour', suivant: 'Continuer', envoyer: 'Envoyer la proposition', envoiEnCours: 'Envoi en cours…',
    erreursEnHaut: 'Certains champs sont à corriger avant de continuer.',
    aucunChangement: "Vous n'avez rien modifié pour l'instant.",
    indisponible: 'Le service est indisponible pour le moment. Votre saisie est gardée : réessayez dans quelques minutes.',
    merciTitre: 'Merci, votre proposition est envoyée',
    merci: "Une personne de l'équipe va l'examiner. Vous recevrez un courriel dès qu'une décision sera prise.",
    merciApprouvee: 'Votre proposition est approuvée. Le changement apparaît sur le site en quelques minutes.',
    retourCarte: 'Retour à la cartographie',
    lienTitre: 'Recevoir un lien par courriel',
    lienIntro: 'Pour proposer une ressource, donnez votre adresse courriel : nous vous envoyons un lien vers le formulaire.',
    lienExpire: "Ce lien n'est plus valable : il dure 24 heures et sert une seule fois. Demandez-en un nouveau : votre saisie est gardée dans ce navigateur.",
    ficheIntrouvable: "Cette fiche n'est plus dans la cartographie.",
    courriel: 'Votre adresse courriel',
    recevoir: 'Recevoir le lien',
    lienEnvoye: 'Si cette adresse est valide, un lien vient de vous être envoyé. Il est valable 24 heures.',
    chargement: 'Chargement…',
    courrielInvalide: "Cette adresse courriel n'a pas la bonne forme.",
    question: 'Une question ? Écrivez-nous à',
    adresseQuestions: 'rsn.gestion@rimuhc.ca',
  },
  panneau: {
    titre: 'Panneau de la cartographie',
    sousTitre: 'Administration de la cartographie',
    entreeIntro: 'Cette page est réservée à l’équipe de la cartographie. Donnez votre adresse courriel pour recevoir un lien d’entrée.',
    courriel: 'Votre adresse courriel',
    recevoir: 'Recevoir un lien',
    lienEnvoye: "Si cette adresse est celle d'une personne de l'équipe, un lien vient de lui être envoyé. Il est valable une heure.",
    lienExpire: "Ce lien n'est plus valable : il dure une heure et sert une seule fois. Demandez-en un nouveau.",
    courrielInvalide: "Cette adresse courriel n'a pas la bonne forme.",
    indisponible: 'Le service ne répond pas pour le moment. Réessayez dans un instant.',
    chargement: 'Chargement…',
    reessayer: 'Réessayer',
    deconnexion: 'Fermer la session',
    modeClair: 'Mode clair', modeSombre: 'Mode sombre',
    roles: { administration: 'Administration', approbation: 'Approbation', lecture: 'Lecture seule' },
    routes: { accueil: 'Accueil', propositions: 'Propositions', ressources: 'Ressources' },
    vide: 'vide', sansNom: 'Sans nom', anonyme: 'Nom non donné', inconnue: 'une personne inconnue', typeAChoisir: 'Type à choisir', aucun: 'Aucun',
    oui: 'Oui', non: 'Non',
    genres: { nouvelle: 'Nouvelle ressource', modification: 'Modification', rsn: 'À remplir par le RSN' },
    etats: { attente: 'Nouvelle', verification: 'En vérification', approuvee: 'Approuvée', refusee: 'Refusée' },
    colonnes: { attente: 'Nouvelles', verification: 'En vérification', approuvee: 'Approuvées', refusee: 'Refusées' },
    liens: { responsable: 'En est responsable', 'jy-travaille': 'Y travaille', aucun: 'Aucun lien avec la ressource' },
    aHeure: (jour, heure, minutes) => `${jour}, ${heure} h ${minutes}`,
    le: (jour) => `le ${jour}`,

    // Accueil
    bonjour: (prenom) => (prenom ? `Bonjour ${prenom}` : 'Bonjour'),
    accueilIntro: 'Ce qui attend une décision de l’équipe, et ce qui s’est passé récemment.',
    tuiles: {
      nouvelles: { une: 'nouvelle proposition', plusieurs: 'nouvelles propositions', aide: 'à approuver, à corriger ou à refuser' },
      verification: { une: 'proposition en vérification', plusieurs: 'propositions en vérification', aide: 'un second regard est demandé' },
    },
    activite: {
      titre: 'Activité récente', aucune: 'Rien pour le moment.', quelquun: 'Une personne',
      objets: { modification: (nom) => `une modification de ${nom}`, nouvelle: (nom) => `la nouvelle ressource ${nom}`, rsn: (nom) => `la fiche à remplir ${nom}` },
      recue: (objet) => `a proposé ${objet}`,
      verification: (objet) => `Second regard demandé sur ${objet}`,
      avis: (sens, objet) => `a donné un avis ${sens === 'favorable' ? 'favorable' : 'défavorable'} sur ${objet}`,
      approuvee: (objet) => `a approuvé ${objet}`,
      refusee: (objet) => `a refusé ${objet}`,
    },
    envois: {
      titre: 'Envois',
      resume: 'Résumé hebdomadaire à l’équipe',
      resumeDetail: (jour, n) => `Chaque ${jour}, à ${n} ${n > 1 ? 'personnes' : 'personne'}. Rien ne part s’il n’y a aucune proposition en attente.`,
      contributions: 'Contributions du public', ouvertes: 'Ouvertes', fermees: 'Fermées',
      essai: 'Mode d’essai des courriels', essaiDetail: 'Tous les courriels vont à une adresse d’essai, pas aux personnes.', actif: 'Actif', arrete: 'Arrêté',
    },

    // Propositions
    propositionsIntro: 'Tout ce que le public propose arrive ici : une nouvelle ressource, une modification, ou une fiche à remplir par l’équipe. Rien ne change sur le site avant une approbation.',
    chercher: 'Chercher une ressource, une personne, un courriel', chercherNom: 'Chercher une proposition',
    tousGenres: 'Tous les genres', tousTypes: 'Tous les types', typeDeRessource: 'Type de ressource',
    affichage: 'Affichage', enColonnes: 'Colonnes', enListe: 'Liste',
    aucunResultat: 'Aucune proposition ne correspond. Effacez la recherche ou les filtres pour tout revoir.',
    aucuneProposition: 'Aucune proposition pour le moment.',
    colonneVerificationAide: 'Un second regard est demandé au reste de l’équipe.',
    rienIci: 'Rien ici.',
    aideColonnes: 'Glissez une carte d’une colonne à l’autre, ou utilisez les boutons. Cliquez une carte pour comparer la version actuelle et la version proposée.',
    aideColonnesLecture: 'Cliquez une carte pour comparer la version actuelle et la version proposée. Votre rôle est en lecture seule.',
    tableau: { ressource: 'Ressource', genre: 'Genre', type: 'Type', par: 'Proposée par', recue: 'Reçue le', champs: 'Champs', avis: 'Avis', etat: 'État', aucunAvis: 'aucun' },
    recueLe: (jour) => `Reçue le ${jour}`,
    champTouche: 'champ touché', champsTouches: 'champs touchés',
    enVerificationDepuis: (jour) => `En vérification depuis le ${jour}`,
    decision: (statut, par, quand, corrige) => `${statut === 'approuvee' ? 'Approuvée' : 'Refusée'} par ${par || 'une personne inconnue'}${quand ? `, le ${quand}` : ''}${corrige ? ', avec corrections' : ''}`,
    secondRegard: 'Second regard', demanderSecondRegard: 'Demander un second regard',
    secondRegardDemande: (jour) => `Second regard demandé. Le reste de l’équipe le verra ici${jour ? ` et dans le résumé du ${jour}` : ''}.`,
    approuver: 'Approuver',
    approuverCorrige: (n) => `Approuver avec mes corrections (${n})`,
    refuser: 'Refuser', annuler: 'Annuler', fermer: 'Fermer', enCours: 'Un instant…',
    neSeDeplacePlus: 'Une proposition approuvée ou refusée ne se déplace plus.',
    pasDeRetour: 'Une proposition en vérification ne revient pas dans les nouvelles : approuvez-la ou refusez-la.',
    confirmerSecondRegard: (nom) => `Demander un second regard sur « ${nom} » ? Elle ne pourra plus revenir dans les nouvelles.`,

    // Fenêtre d'une proposition
    fenetre: (nom) => `Proposition : ${nom}`,
    proposeePar: 'Proposée par', lienAvecRessource: 'Lien avec la ressource', recue: 'Reçue le',
    marqueraVerifiee: 'l’approbation marquera la fiche « vérifiée »',
    approuveePar: 'Approuvée par', refuseePar: 'Refusée par', ficheVisee: 'Fiche visée',
    commentaireEnvoye: 'Commentaire envoyé à la personne',
    ficheDisparue: "La fiche visée n'est plus dans la cartographie : cette proposition ne peut plus être approuvée.",
    illisible: "Une partie de cette proposition n'a pas pu être lue. Vérifiez les champs avant d'approuver, ou refusez-la.",
    rsn: { titre: 'La personne a demandé que l’équipe remplisse la fiche.', aide: 'Complétez au moins le type, la phrase et le lien avant d’approuver. La fiche portera la mention « préparée par l’équipe du RSN ».' },
    ressemble: {
      pastille: 'Ressemble à une fiche existante', titre: 'Ressemble à une fiche existante.',
      aide: (nom) => `« ${nom} » a le même nom ou le même lien principal. Si c’est la même ressource, refusez en invitant la personne à proposer une modification.`,
      ouvrir: 'Ouvrir la fiche existante',
    },
    vue: 'Vue', ongletComparaison: 'Comparaison', ongletChamps: 'Champs proposés',
    legende: { retire: 'retiré', ajoute: 'ajouté', reste: 'Le reste ne change pas.' },
    colonnesComparaison: { champ: 'Champ', actuelle: 'Version actuelle', proposee: 'Version proposée', propose: 'Proposé', avant: 'Avant', applique: 'Appliqué', publie: 'Publié', surLaFiche: 'Sur la fiche', refuse: 'Proposé, puis refusé' },
    rienAMontrer: 'Cette proposition ne touche aucun champ lisible.',
    bouscule: {
      pastille: 'A changé depuis', titre: 'Ce champ a changé depuis cette proposition.',
      avant: 'Quand la proposition a été faite', maintenant: 'Sur la fiche maintenant', propose: 'Proposé',
      aide: 'Approuver remplace la valeur d’aujourd’hui par la valeur proposée. Corrigez-la si elle n’est plus juste.',
    },
    corriger: 'Corriger', completer: 'Compléter', garderCorrection: 'Garder ma correction',
    corrigeParVous: 'Corrigé par vous', annulerCorrection: 'Annuler la correction', ajouteParVous: 'Ajouté par vous',
    corrigePar: (nom) => `Corrigé par ${nom || 'une personne inconnue'}`,
    nouvelleValeur: '(nouveau)',
    autreChamp: 'Compléter un autre champ', autreChampAide: 'Ce que vous ajoutez ici est appliqué en même temps que la proposition.',
    ficheInconnue: 'Choisissez une fiche de la liste.',
    champs: { etat: { libelle: 'État' }, faitPartieDe: { libelle: 'Fait partie de' }, reposeSur: { libelle: 'Repose sur' }, donneAccesA: { libelle: 'Donne accès à' }, remplace: { libelle: 'Remplace' } },
    natures: { faitPartieDe: 'fait partie de', reposeSur: 'repose sur', donneAccesA: 'donne accès à', remplace: 'remplace' },
    logo: { titre: 'Logo déposé', ecarter: 'Ne pas reprendre cette image', reprendre: 'Reprendre cette image', ecarte: 'Écarté par vous' },
    porteurNouveau: {
      titre: (nom) => `Nouveau porteur : ${nom}`,
      aide: 'Il n’existe pas encore dans le catalogue. Il sera créé à l’approbation et placé sur la carte d’après son adresse.',
      adresse: 'Adresse du porteur',
    },
    apercu: {
      onglet: 'Aperçu sur le site', titre: 'Aperçu de la fiche sur le site',
      modification: 'La fiche telle qu’elle apparaîtra sur le site si la proposition est approuvée. Le reste de la fiche ne bouge pas.',
      nouvelle: 'La fiche telle qu’elle apparaîtra sur le site si la proposition est approuvée.',
      logoPropose: 'Le logo proposé n’est pas montré ici : il le sera après l’approbation.',
    },
    refus: {
      libelle: 'Pourquoi cette proposition est refusée', aide: 'obligatoire, envoyé à la personne par courriel',
      confirmer: 'Confirmer le refus', requis: 'Un commentaire est nécessaire pour refuser.',
      ecrire: 'Écrivez un commentaire pour refuser : il est envoyé à la personne.',
    },
    confirmerApprobation: { titre: 'Approuver cette proposition ?', aide: 'Vérifiez ce qui est proposé ci-dessus. La fiche change sur le site dès l’approbation, et la personne est prévenue par courriel.' },
    avis: {
      titre: 'Avis de l’équipe', aucun: 'Aucun avis pour l’instant.', aucunCarte: 'Aucun avis pour l’instant', sansCommentaire: 'sans commentaire',
      infobulle: (nom, sens, commentaire) => `${nom} : ${sens === 'favorable' ? 'favorable' : 'défavorable'}${commentaire ? `. ${commentaire}` : ''}`,
      leVotre: { favorable: 'Votre avis : favorable', defavorable: 'Votre avis : défavorable' },
      modifier: 'Modifier', indice: 'Commentaire pour l’équipe, facultatif', commentaire: 'Commentaire de votre avis',
      favorable: 'Favorable', defavorable: 'Défavorable',
      aide: 'Un avis ne décide rien : la proposition attend jusqu’à ce qu’une personne approuve ou refuse. Les avis restent visibles par toute l’équipe.',
      enregistre: 'Avis enregistré. La proposition attend toujours une décision.',
    },

    // Messages
    quitter: 'Ce que vous avez écrit n’est pas enregistré. Quitter quand même ?',
    erreursEnHaut: 'Certains champs sont à corriger.',
    dejaTranchee: "Cette proposition vient d'être tranchée par quelqu'un d'autre.",
    occupee: 'Un autre geste est en cours sur cette proposition. Réessayez dans une minute : votre saisie est toujours là.',
    occupeeCourt: 'Un autre geste est en cours sur cette proposition. Réessayez dans une minute.',
    sessionExpiree: 'Votre session a expiré. Demandez un nouveau lien et ouvrez-le dans un autre onglet, puis revenez ici et réessayez : votre saisie est toujours là.',
    roleInsuffisant: 'Votre rôle ne permet pas ce geste : il demande le rôle Approbation ou Administration.',
    doublon: 'Une fiche du même nom avec le même lien existe déjà dans la cartographie.',
    introuvable: 'Cette proposition est introuvable.',
    approuvee: (courriel) => `Proposition approuvée. Le changement apparaît sur le site en quelques minutes.${courriel ? '' : " Le courriel d'avis n'a pas pu partir."}`,
    refusee: (courriel) => `Proposition refusée.${courriel ? '' : " Le courriel d'avis n'a pas pu partir."}`,

    // Ressources : le tableau des fiches, la fenêtre d'une fiche, l'historique des versions
    ressources: {
      intro: (publiees, ecartees) => `Toutes les fiches du catalogue : ${publiees} ${publiees > 1 ? 'publiées' : 'publiée'} et ${ecartees} ${ecartees > 1 ? 'écartées' : 'écartée'}. Ouvrez une fiche pour la modifier et voir l’historique de ses versions.`,
      introCourte: 'Toutes les fiches du catalogue. Ouvrez une fiche pour la modifier et voir l’historique de ses versions.',
      exporter: 'Exporter en CSV', ajouter: 'Ajouter une ressource',
      chercher: 'Chercher un nom, un porteur, un mot-clé, un courriel', chercherNom: 'Chercher une ressource',
      statut: 'Statut', tousStatuts: 'Tous les statuts',
      statuts: { publiee: 'Publiée', ecartee: 'Écartée' },
      tableau: { ressource: 'Ressource', type: 'Type', porteurs: 'Porté par', statut: 'Statut', verifiee: 'Vérifiée le', versions: 'Versions', dernier: 'Dernier changement' },
      aucunPorteur: 'aucun porteur', jamais: 'jamais', plusDUnAn: 'plus d’un an', aucunChangement: 'aucun',
      enAttente: (n) => `${n} ${n > 1 ? 'propositions en attente' : 'proposition en attente'}`,
      aucunResultat: 'Aucune fiche ne correspond. Effacez la recherche ou les filtres pour tout revoir.',
      aucune: 'Aucune fiche pour le moment.',
      sansHistorique: 'L’historique des versions n’est pas disponible pour le moment. Les fiches se lisent et se modifient, mais les changements ne sont pas gardés dans l’historique.',

      // Fenêtre d'une fiche
      fenetre: (nom) => `Fiche : ${nom}`,
      verifiee: 'Vérifiée',
      verifieeLe: (jour, par) => `le ${jour}${par ? `, par ${par}` : ''}`,
      verifieePar: { Responsable: 'la personne responsable', Contact: 'une personne qui y travaille', 'Équipe du RSN': 'l’équipe du RSN' },
      jamaisVerifiee: 'Jamais : la fiche affiche « préparée par l’équipe du RSN à partir de sources publiques »',
      enAttenteTitre: 'En attente',
      propositionDe: (genre, nom) => `${genre} de ${nom}`,
      onglets: { fiche: 'Fiche', hist: (n) => `Historique des versions (${n})`, apercu: 'Aperçu sur le site' },
      lectureSeule: 'Votre rôle est en lecture seule : vous voyez la fiche et son historique, sans pouvoir la modifier.',
      aides: { phrase: '300 caractères au plus', porteurs: 'rattaché au catalogue des porteurs', logo: 'l’adresse de l’image sur le Web' },
      listeVide: 'Aucune valeur.', aucunPorteurRattache: 'Aucun porteur rattaché.',
      rattacher: 'Rattacher un porteur du catalogue',
      ajouterA: (champ) => `Ajouter à « ${champ} »`,
      logoDepose: 'Une image déposée par la ressource est affichée sur le site. Écrire ici une adresse la remplace.',
      enregistrer: 'Enregistrer les modifications', creer: 'Créer la fiche',
      enregistrerAide: 'Chaque enregistrement crée une nouvelle version dans l’historique.',
      verifier: 'Marquer vérifiée aujourd’hui', voirPublique: 'Voir la fiche publique',
      republier: 'Republier la fiche',
      ecarter: {
        bouton: 'Écarter du catalogue', confirmer: 'Écarter',
        question: (nom) => `Écarter « ${nom} » ? Elle disparaît du site, mais reste ici avec tout son historique.`,
      },
      conflit: {
        note: 'Quelqu’un d’autre a changé cette fiche pendant votre saisie. Rien n’est enregistré : regardez les champs signalés, choisissez, puis enregistrez de nouveau.',
        titre: 'Ce champ a changé pendant votre saisie.',
        depart: 'Quand vous avez ouvert la fiche', vous: 'Votre saisie',
        garder: 'Garder ma saisie', prendre: 'Prendre la valeur de la fiche',
      },
      ajouterTitre: 'Ajouter une ressource',
      ajouterAide: 'Pour ajouter une fiche sans passer par le formulaire public. Elle est publiée tout de suite, avec la mention « préparée par l’équipe du RSN ».',
      apercu: 'La fiche telle qu’elle apparaîtra sur le site avec ce qui est écrit dans l’onglet « Fiche », enregistré ou non.',
      apercuLogo: 'Le nouveau logo n’est pas montré ici : il le sera une fois la fiche enregistrée.',

      // Historique des versions
      historique: {
        intro: 'Chaque proposition approuvée et chaque changement fait dans le panneau est gardé. On peut comparer deux versions et revenir à une version précédente.',
        version: (n) => `Version ${n}`, actuelle: 'Actuelle',
        depart: 'État de la fiche au lancement de l’historique',
        creation: (qui) => `Fiche ajoutée dans le panneau par ${qui}`,
        creationProposee: (par, qui) => `Fiche créée à partir de la proposition de ${par}, approuvée par ${qui}`,
        proposition: (par, lien, qui) => `Proposition de ${par} (${lien}), approuvée par ${qui}`,
        propositionSans: (qui) => `Proposition approuvée par ${qui}`,
        retablissement: (note, qui) => `${note} par ${qui}`, retour: 'Retour à une version précédente',
        panneau: (qui) => `Modifiée dans le panneau par ${qui}`,
        illisible: 'Le détail de cette version n’a pas pu être lu.',
        avecPrecedente: 'Comparer avec la précédente', avecActuelle: 'Comparer avec l’actuelle',
        retablir: 'Rétablir cette version', retablirCourt: 'Rétablir',
        confirmer: (n, jour) => `Rétablir la version ${n}${jour ? ` du ${jour}` : ''} ? La fiche reprend ses valeurs de ce moment-là. Rien n’est effacé : une nouvelle version s’ajoute à l’historique.`,
        perdreSaisie: 'Ce que vous avez écrit dans l’onglet « Fiche » n’est pas enregistré et sera remplacé. Rétablir quand même ?',
        comparer: 'Comparer deux versions', avec: 'avec', premiere: 'Première version', seconde: 'Seconde version',
        choix: (n, jour, actuelle) => `Version ${n}${jour ? ` · ${jour}` : ''}${actuelle ? ' (actuelle)' : ''}`,
        entete: (n, jour) => `Version ${n}${jour ? ` · ${jour}` : ''}`,
        memeVersion: 'Choisissez deux versions différentes.', identiques: 'Ces deux versions sont identiques.',
        identique: 'Cette version est identique à la version actuelle.',
        retablie: (n, nouvelle) => `Version ${n} rétablie.${nouvelle ? ` C’est maintenant la version ${nouvelle}.` : ' L’historique n’a pas pu être écrit.'}`,
        impossible: (champs) => `Cette version ne peut pas être rétablie telle quelle. Champs en cause : ${champs}.`,
      },

      // Export
      csv: {
        titre: 'Exporter les ressources en CSV', portee: 'Fiches à exporter',
        affichees: (n) => `Fiches affichées (${n})`, toutes: (n) => `Toutes (${n})`,
        colonnes: ['Nom', 'Type', 'Porté par', 'Statut', 'Lien principal', 'Courriel de contact', 'Vérifiée le', 'Versions'],
        autres: (n) => `… ${n} ${n > 1 ? 'autres lignes' : 'autre ligne'}`,
        resume: (n, colonnes) => `${n} ${n > 1 ? 'fiches' : 'fiche'}, ${colonnes} colonnes. Ce fichier ne contient que ce qui est déjà public sur le site, plus le statut et le nombre de versions.`,
        telecharger: 'Télécharger le fichier', copier: 'Copier', copie: 'Contenu CSV copié.', copieImpossible: 'La copie n’a pas fonctionné. Sélectionnez le texte et copiez-le à la main.',
        fichier: (jour) => `ressources_cartographie_${jour}.csv`,
      },

      // Messages
      introuvable: 'Cette fiche est introuvable. Elle a peut-être changé de nom ou de statut : rechargez la liste.',
      introuvableSaisie: 'Cette fiche est introuvable sous cette adresse : elle a peut-être changé de nom ou de statut. Votre saisie est toujours là : copiez ce dont vous avez besoin, fermez la fenêtre et rouvrez la fiche.',
      occupee: 'Un autre changement est en cours sur cette fiche. Réessayez dans une minute : votre saisie est toujours là.',
      rienAEnregistrer: 'Vous n’avez rien modifié pour l’instant.',
      inchangee: 'La fiche porte déjà ces valeurs : rien n’a été enregistré.',
      enregistree: (n, version) => `Fiche enregistrée : ${n} ${n > 1 ? 'champs modifiés' : 'champ modifié'}${version ? `, version ${version} créée` : ''}. Le changement apparaît sur le site en quelques minutes.${version ? '' : ' L’historique n’a pas pu être écrit.'}`,
      creee: (historique) => `Fiche créée et publiée. Elle apparaît sur le site en quelques minutes.${historique ? '' : ' L’historique n’a pas pu être écrit.'}`,
      messages: {
        verifier: 'Fiche marquée vérifiée aujourd’hui.',
        ecarter: 'Fiche écartée : elle disparaît du site en quelques minutes.',
        republier: 'Fiche republiée : elle revient sur le site en quelques minutes.',
      },
    },
  },
  portrait: {
    titre: 'Portrait de la cartographie',
    ressources: (n) => (n > 1 ? 'ressources' : 'ressource'),
    porteurs: (n) => (n > 1 ? 'porteurs' : 'porteur'),
    voir: 'Voir le portrait de la cartographie',
    deplier: 'Déplier les statistiques', replier: 'Replier',
    types: 'Types de ressources', typesAide: 'Type principal de chaque fiche',
    sujets: 'Principaux sujets', sujetsAide: 'Nombre de fiches',
    porteursTitre: 'Principaux porteurs', porteursAide: 'Nombre de fiches',
    normesTitre: 'Principales normes', normesAide: 'Nombre de fiches',
    pourcent: (x) => `${Math.round(x)} %`,
  },
  suggestions: { sujets: 'Sujets', porteurs: 'Porteurs', ressources: 'Ressources' },
  liste: {
    titre: 'Ressources',
    compte: (n, total) => (n === total ? (n > 1 ? `${n} ressources` : `${n} ressource`) : `${n} sur ${total}`),
    trier: 'Trier', triPropose: 'Ordre proposé', triNom: 'Nom (A à Z)', triType: 'Type',
    precedent: 'Précédent', suivant: 'Suivant', pages: 'Pages de la liste', page: (n) => `Page ${n}`,
    voirFiche: 'Voir la fiche', voirConnexions: 'Voir ses connexions',
  },
  fiche: {
    fermer: 'Fermer',
    acces: 'Y accéder',
    modeAcces: "Mode d'accès",
    commentAcceder: 'Comment y accéder',
    frais: 'Frais',
    environnementSecurise: 'Environnement sécurisé',
    environnementSecuriseOui: 'Les données se consultent dans un environnement sécurisé, sans téléchargement.',
    reserveA: 'Réservé à',
    visiter: 'Visiter le site',
    autresLiens: 'Autres liens',
    contact: 'Contact',
    responsable: 'Responsable',
    portePar: 'Porté par',
    autresNoms: 'Aussi appelé',
    detailsJeu: 'Le jeu de données',
    population: 'Population',
    periode: 'Période couverte',
    typesDonnees: 'Types de données',
    collecte: 'Collecte',
    jumelage: 'Jumelage possible avec d\'autres données',
    dictionnaire: 'Dictionnaire ou catalogue détaillé',
    detailsLogiciel: 'Le code',
    depotCode: 'Dépôt de code',
    licence: 'Licence',
    enBref: 'En bref',
    financePar: 'Financé par',
    doi: 'DOI',
    normes: 'Normes et formats',
    outils: 'Outils et environnements',
    portee: 'Portée',
    langues: 'Langues',
    liens: 'Ressources liées',
    motsCles: 'Sujets',
    etat: 'État',
    verifieeLe: 'Fiche vérifiée le',
    nonConfirmee: "Fiche préparée par l'équipe du RSN à partir de sources publiques.",
    introuvable: "Cette ressource n'existe pas ou n'est plus dans la cartographie.",
    retour: 'Voir toutes les ressources',
    copierLien: 'Copier le lien', lienCopie: 'Lien copié',
    proches: 'Ressources proches',
    sujetsCommuns: (n) => (n > 1 ? `${n} sujets communs` : '1 sujet commun'),
    force: { forte: 'Proximité forte', moyenne: 'Proximité moyenne', faible: 'Proximité faible' },
  },
  proposer: {
    ressource: 'Proposer une ressource',
    court: 'Proposer',
    ressourceTitre: 'Proposer une ressource à ajouter à la cartographie',
    modification: 'Proposer une modification',
    modifier: 'Modifier',
    titreModification: (nom) => `Proposer une modification : ${nom}`,
    explicationRessource: 'Entrez votre courriel pour recevoir le lien vers le formulaire. Une personne de l\'équipe relit chaque proposition avant sa publication.',
    explicationModification: 'Entrez votre courriel pour recevoir le lien vers le formulaire, prérempli avec cette fiche. Une personne de l\'équipe relit chaque proposition avant sa publication.',
    courriel: 'Votre adresse courriel',
    exemple: 'votre.courriel@institution.ca',
    envoyer: 'Recevoir le lien',
    envoi: 'Envoi…',
    envoye: 'Si l\'adresse est valide, un lien vient de vous être envoyé. Il est valable 24 heures.',
    adresseInvalide: 'Cette adresse courriel n\'a pas la bonne forme.',
    echec: 'L\'envoi n\'a pas fonctionné. Réessayez dans un moment.',
    aide: 'Une question ? Écrivez-nous à ',
    contact: 'rsn.gestion@rimuhc.ca',
    fermer: 'Fermer',
  },
  pied: {
    financement: 'Financé par le Fonds de recherche du Québec, secteur Santé',
    liens: 'Liens du réseau',
    bottin: 'Bottin des membres',
    confidentialite: 'Politique de confidentialité',
    code: 'Code source',
    codeTitre: 'Voir le code source de la cartographie sur GitHub',
  },
};

function echapper(texte) {
  return String(texte === null || texte === undefined ? '' : texte)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Une adresse web n'est utilisée que si elle commence par http:// ou https://.
function adresseSure(valeur) {
  const v = String(valeur || '').trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

// Adresse d'un logo : une copie servie par le site (/logos/…) ou une adresse http(s).
function adresseLogo(valeur) {
  const v = String(valeur || '').trim();
  if (/^\/logos\/[a-f0-9]{16}\.[a-z]{3,4}$/.test(v) || /^\/api\/logo\?adresse=[a-z0-9-]{1,200}&v=[a-f0-9]{10}$/.test(v)) return v;
  return adresseSure(v);
}

// Cadre approximatif du Québec : une ressource placée en dehors rejoint le
// groupe « En ligne ou hors Québec ».
const CADRE_QUEBEC = { latMin: 44, latMax: 63, lonMin: -80, lonMax: -57 };
function surLaCarte(fiche) {
  const l = fiche && fiche.lieu;
  if (!l || typeof l.latitude !== 'number' || typeof l.longitude !== 'number') return false;
  return l.latitude >= CADRE_QUEBEC.latMin && l.latitude <= CADRE_QUEBEC.latMax
    && l.longitude >= CADRE_QUEBEC.lonMin && l.longitude <= CADRE_QUEBEC.lonMax;
}

// Un filtre accepte une valeur seule ou une liste de valeurs (choix multiples).
function enListe(v) { return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); }

// Filtres seuls (la recherche floue est faite à part). Dans un même filtre,
// une valeur cochée suffit ; les filtres se combinent entre eux.
function filtrer(ressources, filtres) {
  const f = filtres || {};
  const types = enListe(f.type), modes = enListe(f.modeAcces), porteurs = enListe(f.porteur), etats = enListe(f.etat);
  const portees = enListe(f.portee), langues = enListe(f.langue), normes = enListe(f.norme);
  return (ressources || []).filter((r) => {
    if (types.length && !types.includes(r.typePrincipal) && !types.includes(r.secondType)) return false;
    if (modes.length && !(r.modesAcces || []).some((m) => modes.includes(m))) return false;
    if (porteurs.length && !(r.porteurs || []).some((p) => porteurs.includes(p.nom))) return false;
    if (etats.length && !etats.includes(r.etat)) return false;
    if (portees.length && !portees.includes(r.portee)) return false;
    if (langues.length && !(r.langues || []).some((l) => langues.includes(l))) return false;
    if (normes.length && !(r.normes || []).some((n) => normes.includes(n))) return false;
    if (f.horsCarte && surLaCarte(r)) return false;
    return true;
  });
}

// Les filtres à choix multiples, dans l'ordre de la barre.
const CLES_FILTRE = ['type', 'modeAcces', 'porteur', 'etat', 'portee', 'langue', 'norme'];

function filtresActifs(filtres) {
  const f = filtres || {};
  return !!(CLES_FILTRE.some((cle) => enListe(f[cle]).length) || f.horsCarte);
}

// Valeurs de chaque filtre avec le nombre de fiches, de la plus fréquente à la moins fréquente.
function comptesDeFiltre(ressources) {
  const comptes = {};
  for (const cle of CLES_FILTRE) comptes[cle] = new Map();
  const ajouter = (m, v) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
  for (const r of ressources || []) {
    for (const t of new Set([r.typePrincipal, r.secondType])) ajouter(comptes.type, t);
    for (const m of new Set(r.modesAcces || [])) ajouter(comptes.modeAcces, m);
    for (const p of new Set((r.porteurs || []).map((x) => x.nom))) ajouter(comptes.porteur, p);
    ajouter(comptes.etat, r.etat);
    ajouter(comptes.portee, r.portee);
    for (const l of new Set(r.langues || [])) ajouter(comptes.langue, l);
    for (const n of new Set(r.normes || [])) ajouter(comptes.norme, n);
  }
  const trier = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([valeur, nombre]) => ({ valeur, nombre }));
  return Object.fromEntries(CLES_FILTRE.map((cle) => [cle, trier(comptes[cle])]));
}

function valeursDeFiltre(ressources) {
  const c = comptesDeFiltre(ressources);
  const trier = (liste) => liste.map((x) => x.valeur).sort((a, b) => a.localeCompare(b, 'fr'));
  return Object.fromEntries(CLES_FILTRE.map((cle) => [cle, trier(c[cle])]));
}

// Initiales d'un nom, pour la pastille affichée quand la ressource n'a pas de logo.
// Plusieurs mots : l'initiale des deux premiers mots porteurs de sens.
// Un seul mot : ses deux premières majuscules, sinon ses deux premières lettres.
const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'sur', 'pour', 'au', 'aux', 'a', 'à', 'of', 'the', 'for', 'and', 'in', 'on']);
function initiales(nom) {
  const mots = String(nom || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const pleins = mots.filter((m) => !PETITS_MOTS.has(m.toLowerCase()));
  const retenus = pleins.length ? pleins : mots;
  if (retenus.length === 0) return '?';
  if (retenus.length === 1) {
    const mot = retenus[0];
    const majuscules = mot.match(/\p{Lu}/gu) || [];
    return (majuscules.length >= 2 ? majuscules.slice(0, 2).join('') : mot.slice(0, 2)).toUpperCase();
  }
  return (retenus[0].charAt(0) + retenus[1].charAt(0)).toUpperCase();
}

// Nom court d'un porteur : le sigle entre parenthèses à la fin, s'il y en a un.
function nomCourt(porteur) {
  const nom = String(porteur || '').trim();
  const m = /\(([^()\s]{2,12})\)\s*$/.exec(nom);
  return m && /^[\p{Lu}\p{N}][\p{L}\p{N}-]*$/u.test(m[1]) && /\p{Lu}.*\p{Lu}/u.test(m[1]) ? m[1] : nom;
}

// « libellé : adresse ; libellé : adresse » → [{ libelle, adresse }].
// L'adresse vaut null quand elle n'est pas en http(s) : le texte reste affiché, sans lien.
function decouperAutresLiens(texte) {
  return String(texte || '').split(/\s+;\s*|;\s+|\n+/).map((morceau) => morceau.trim().replace(/;$/, '').trim()).filter(Boolean).map((morceau) => {
    const m = /^(.*?)\s*:\s*(https?:\/\/\S+)$/i.exec(morceau);
    if (m && m[1]) return { libelle: m[1], adresse: adresseSure(m[2]) };
    if (adresseSure(morceau) && !/\s/.test(morceau)) return { libelle: morceau, adresse: morceau };
    return { libelle: morceau, adresse: null };
  });
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// « 2026-11-24 » → « 24 novembre 2026 », sans passer par un fuseau horaire.
function dateLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const jour = Number(m[3]);
  return `${jour === 1 ? '1er' : jour} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

// Classe de couleur d'un type (cinq types).
const CLES_TYPE = {
  'Jeu de données, cohorte ou biobanque': 'jeu',
  'Catalogue ou entrepôt de données': 'catalogue',
  'Plateforme ou infrastructure': 'plateforme',
  'Logiciel ou application': 'logiciel',
  'Service ou accompagnement': 'service',
};
function cleType(type) { return CLES_TYPE[type] || 'autre'; }

// Icônes des types : tracés au trait dans une grille de 24, les mêmes pour la page (SVG) et pour le graphe (dessin).
const rond = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const cadre = (x, y, l, h, r) => `M${x + r} ${y}h${l - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(l - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const TRACES_ICONES = {
  // Un cylindre : une collection de données.
  jeu: ['M5 6a7 3 0 1 0 14 0a7 3 0 1 0-14 0', 'M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6', 'M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6'],
  // Quatre cases : plusieurs jeux recensés au même endroit.
  catalogue: [cadre(4, 4, 6.5, 6.5, 1.5), cadre(13.5, 4, 6.5, 6.5, 1.5), cadre(4, 13.5, 6.5, 6.5, 1.5), cadre(13.5, 13.5, 6.5, 6.5, 1.5)],
  // Deux serveurs : un environnement où l'on calcule et stocke.
  plateforme: [cadre(4, 4, 16, 6.5, 1.5), cadre(4, 13.5, 16, 6.5, 1.5), 'M8 7.25h.01M8 16.75h.01M12 7.25h4M12 16.75h4'],
  // Des chevrons de code : quelque chose qu'on installe ou qu'on utilise.
  logiciel: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M13.5 5l-3 14'],
  // Une bouée : une équipe à qui l'on fait une demande.
  service: [rond(12, 12, 9), rond(12, 12, 3.5), 'M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9'],
  autre: [rond(12, 12, 4)],
};
function iconeType(cle) {
  const traces = TRACES_ICONES[cle] || TRACES_ICONES.autre;
  return `<svg class="icone-type" viewBox="0 0 24 24" aria-hidden="true">${traces.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}
// L'icône dans un rond de la couleur du type (la classe type-… est portée par un parent).
function puceType(cle) { return `<span class="puce-type">${iconeType(cle)}</span>`; }

// Classe de couleur d'un mode d'accès : une teinte par mode, la même sur les cartes et dans la fiche.
const CLES_ACCES = { 'Ouvert': 'ouvert', 'Sur inscription': 'inscription', 'Sur demande évaluée': 'demande', 'Réservé ou interne': 'reserve' };
function cleAcces(mode) { return CLES_ACCES[mode] || 'neutre'; }

// Classe de couleur d'un état.
const CLES_ETAT = { 'Actif': 'actif', 'En développement': 'developpement', 'Non confirmé': 'non-confirme', 'Archivé': 'archive' };
function cleEtat(etat) { return CLES_ETAT[etat] || 'autre'; }

const api = { CLES_FILTRE, adresseLogo, cleAcces, CLES_ACCES, cleEtat, TEXTES, echapper, adresseSure, surLaCarte, filtrer, filtresActifs, enListe, comptesDeFiltre, valeursDeFiltre, initiales, nomCourt, decouperAutresLiens, dateLongue, cleType, CLES_TYPE, CADRE_QUEBEC, TRACES_ICONES, iconeType, puceType };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
