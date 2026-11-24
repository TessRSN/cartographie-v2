/**
 * Textes de l'interface, échappement et filtres.
 * Chargé par <script> dans le navigateur et par require() côté serveur et dans les essais.
 */
(function (racine) {
'use strict';

// Tous les textes de l'interface, pour l'ajout ultérieur de l'anglais.
const TEXTES = {
  titre: 'Cartographie des ressources en santé numérique',
  sousTitre: 'Jeux de données, catalogues, plateformes, logiciels, services et initiatives ouverts aux équipes du Québec.',
  recherche: 'Rechercher une ressource, un sujet, un porteur…',
  filtres: { type: 'Type', modeAcces: "Mode d'accès", porteur: 'Porteur', etat: 'État', tous: 'Tous', effacer: 'Tout effacer' },
  compte: (n) => (n === 0 ? 'Aucune fiche' : n === 1 ? '1 fiche' : `${n} fiches`),
  aucunResultat: 'Aucune ressource ne correspond à cette recherche.',
  indisponible: 'Les données ne sont pas disponibles pour le moment.',
  chargement: 'Chargement des ressources…',
  carte: {
    titre: 'Carte',
    horsCarte: (n) => `En ligne ou hors Québec : ${n}`,
    horsCarteActif: 'Voir toutes les ressources',
    aide: 'Chaque ressource est placée chez son porteur.',
  },
  graphe: {
    titre: 'Ressources proches',
    aide: 'Deux ressources sont reliées quand elles partagent des sujets distinctifs.',
    sujetsCommuns: 'Sujets communs',
    vide: 'Aucun lien entre les ressources affichées.',
    indisponible: "Le graphe n'a pas pu être chargé.",
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
  },
  pied: 'Une initiative du Réseau santé numérique (RSN).',
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

// Cadre approximatif du Québec : une ressource placée en dehors rejoint le
// groupe « En ligne ou hors Québec ».
const CADRE_QUEBEC = { latMin: 44, latMax: 63, lonMin: -80, lonMax: -57 };
function surLaCarte(fiche) {
  const l = fiche && fiche.lieu;
  if (!l || typeof l.latitude !== 'number' || typeof l.longitude !== 'number') return false;
  return l.latitude >= CADRE_QUEBEC.latMin && l.latitude <= CADRE_QUEBEC.latMax
    && l.longitude >= CADRE_QUEBEC.lonMin && l.longitude <= CADRE_QUEBEC.lonMax;
}

// Filtres seuls (la recherche floue est faite à part) ; ils se combinent.
function filtrer(ressources, filtres) {
  const f = filtres || {};
  return (ressources || []).filter((r) => {
    if (f.type && r.typePrincipal !== f.type && r.secondType !== f.type) return false;
    if (f.modeAcces && !(r.modesAcces || []).includes(f.modeAcces)) return false;
    if (f.porteur && !(r.porteurs || []).some((p) => p.nom === f.porteur)) return false;
    if (f.etat && r.etat !== f.etat) return false;
    if (f.horsCarte && surLaCarte(r)) return false;
    return true;
  });
}

function valeursDeFiltre(ressources) {
  const ensembles = { type: new Set(), modeAcces: new Set(), porteur: new Set(), etat: new Set() };
  for (const r of ressources || []) {
    if (r.typePrincipal) ensembles.type.add(r.typePrincipal);
    if (r.secondType) ensembles.type.add(r.secondType);
    for (const m of r.modesAcces || []) ensembles.modeAcces.add(m);
    for (const p of r.porteurs || []) ensembles.porteur.add(p.nom);
    if (r.etat) ensembles.etat.add(r.etat);
  }
  const trier = (s) => [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  return { type: trier(ensembles.type), modeAcces: trier(ensembles.modeAcces), porteur: trier(ensembles.porteur), etat: trier(ensembles.etat) };
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

// Classe de couleur d'un état.
const CLES_ETAT = { 'Actif': 'actif', 'En développement': 'developpement', 'Non confirmé': 'non-confirme', 'Archivé': 'archive' };
function cleEtat(etat) { return CLES_ETAT[etat] || 'autre'; }

const api = { cleEtat, TEXTES, echapper, adresseSure, surLaCarte, filtrer, valeursDeFiltre, dateLongue, cleType, CLES_TYPE, CADRE_QUEBEC };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
