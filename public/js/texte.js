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
  sousTitre: 'Jeux de données, catalogues, plateformes, logiciels, services et initiatives ouverts aux équipes du Québec.',
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
    type: 'Type', modeAcces: "Mode d'accès", porteur: 'Porteur', etat: 'État', portee: 'Portée', langue: 'Langue',
    tous: 'Tous', effacer: 'Tout réinitialiser', retirer: 'Retirer', horsCarte: 'En ligne ou hors Québec',
  },
  // Étiquettes de la sélection en cours, affichées sur la carte ou le graphe et au-dessus de la liste.
  selection: { titre: 'Sélection en cours', recherche: 'Recherche', connexions: 'Connexions de' },
  // Étiquette d'accès d'une carte de fiche : « Accès : Ouvert », « Accès : non précisé par la ressource ».
  acces: (mode) => `Accès : ${/^non précisé/i.test(mode) ? mode.charAt(0).toLowerCase() + mode.slice(1) : mode}`,
  autresSujets: (n) => (n > 1 ? `${n} autres sujets` : '1 autre sujet'),
  autresPorteurs: (n) => (n > 1 ? `${n} autres porteurs` : '1 autre porteur'),
  // Nom court de chaque type, pour les pastilles, la légende et le bandeau.
  typesCourts: { jeu: 'Jeu de données', catalogue: 'Catalogue', plateforme: 'Plateforme', logiciel: 'Logiciel', service: 'Service', initiative: 'Initiative', autre: 'Autre' },
  // Ce qu'on trouve sous chaque type, en quelques mots (panneau des types).
  typesAides: { jeu: 'Cohortes, biobanques', catalogue: 'Portails, entrepôts', plateforme: 'Calcul, analyse, stockage', logiciel: 'Outils, applications', service: 'Équipes, guichets', initiative: 'Regroupements, consortiums' },
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
    vide: 'Aucun lien entre les ressources affichées.',
    indisponible: "Le graphe n'a pas pu être chargé. Vérifiez votre connexion et rechargez la page.",
    aide: 'Deux ressources sont reliées quand elles partagent des sujets distinctifs.',
  },
  aide: {
    titre: 'Comment sont calculées les connexions ?',
    chapeau: 'Aucune intelligence artificielle : un calcul déterministe, refait dans votre navigateur à partir des sujets inscrits dans les fiches.',
    sections: [
      ["D'où viennent les sujets", "Des sujets (mots-clés) de chaque fiche. Un sujet est pris en entier : « imagerie par résonance magnétique » compte comme une seule expression. Un dictionnaire rapproche le français et l'anglais, pour qu'« intelligence artificielle » et « artificial intelligence » comptent comme un même sujet."],
      ['Quels sujets comptent', "Un sujet présent dans plus de 20 % des fiches ne distingue aucune ressource ; un sujet présent dans une seule fiche ne peut relier personne. Ces sujets sont ignorés."],
      ['Comment se calcule la proximité', "Chaque sujet partagé pèse selon sa rareté dans le catalogue : un sujet rare vaut plus qu'un sujet courant. Le score d'une paire de ressources est la somme de ces poids."],
      ['Quels liens sont affichés', "Les liens au-dessus du seuil du curseur, puis les 4 voisines les plus proches de chaque ressource, avec un maximum de 10 liens par ressource pour éviter les étoiles illisibles. L'épaisseur du trait suit le score."],
      ['Les ●●● dans « Ressources proches »', '●●● proximité forte, plusieurs sujets rares en commun. ●●○ moyenne. ●○○ faible. Le classement suit le score, pas le nombre de sujets.'],
      ['Limites', "Une fiche qui porte peu de sujets, ou des sujets très généraux, aura peu de liens : la qualité du graphe dépend de la précision des sujets inscrits dans les fiches."],
    ],
  },
  portrait: {
    titre: 'Portrait de la cartographie',
    ressources: (n) => (n > 1 ? 'ressources' : 'ressource'),
    porteurs: (n) => (n > 1 ? 'porteurs' : 'porteur'),
    deplier: 'Déplier', replier: 'Replier',
    types: 'Types de ressources', typesAide: 'Type principal de chaque fiche',
    sujets: 'Principaux sujets', sujetsAide: 'Nombre de fiches',
    porteursTitre: 'Principaux porteurs', porteursAide: 'Nombre de fiches',
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
    portee: 'Portée',
    langues: 'Langues',
    liens: 'Ressources liées',
    motsCles: 'Sujets',
    etat: 'État',
    verifieeLe: 'Fiche vérifiée le',
    nonConfirmee: "Fiche préparée par l'équipe du RSN à partir de sources publiques, pas encore confirmée par la ressource.",
    introuvable: "Cette ressource n'existe pas ou n'est plus dans la cartographie.",
    retour: 'Voir toutes les ressources',
    copierLien: 'Copier le lien', lienCopie: 'Lien copié',
    proches: 'Ressources proches',
    sujetsCommuns: (n) => (n > 1 ? `${n} sujets communs` : '1 sujet commun'),
    voirSujetsCommuns: 'Voir les sujets communs',
    force: { forte: 'Proximité forte', moyenne: 'Proximité moyenne', faible: 'Proximité faible' },
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
  return /^\/logos\/[a-f0-9]{16}\.[a-z]{3,4}$/.test(v) ? v : adresseSure(v);
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
  const portees = enListe(f.portee), langues = enListe(f.langue);
  return (ressources || []).filter((r) => {
    if (types.length && !types.includes(r.typePrincipal) && !types.includes(r.secondType)) return false;
    if (modes.length && !(r.modesAcces || []).some((m) => modes.includes(m))) return false;
    if (porteurs.length && !(r.porteurs || []).some((p) => porteurs.includes(p.nom))) return false;
    if (etats.length && !etats.includes(r.etat)) return false;
    if (portees.length && !portees.includes(r.portee)) return false;
    if (langues.length && !(r.langues || []).some((l) => langues.includes(l))) return false;
    if (f.horsCarte && surLaCarte(r)) return false;
    return true;
  });
}

// Les filtres à choix multiples, dans l'ordre de la barre.
const CLES_FILTRE = ['type', 'modeAcces', 'porteur', 'etat', 'portee', 'langue'];

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

// Classe de couleur d'un type (six types).
const CLES_TYPE = {
  'Jeu de données, cohorte ou biobanque': 'jeu',
  'Catalogue ou entrepôt de données': 'catalogue',
  'Plateforme ou infrastructure': 'plateforme',
  'Logiciel ou application': 'logiciel',
  'Service ou accompagnement': 'service',
  'Initiative ou regroupement': 'initiative',
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
  // Trois points reliés : un groupe qu'on peut rejoindre.
  initiative: [rond(12, 5.5, 2.5), rond(5.5, 17.5, 2.5), rond(18.5, 17.5, 2.5), 'M10.8 7.7L6.7 15.3M13.2 7.7l4.1 7.6M8 17.5h8'],
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
