/**
 * Catalogue des champs d'une fiche que le formulaire et le panneau peuvent lire ou écrire,
 * avec leur validation et le calcul des changements. Partagé par le serveur et le navigateur.
 * Tout champ absent de ce catalogue est ignoré : c'est ce qui garde les champs internes à l'abri.
 */
(function (racine) {
'use strict';

const texte = (cle, max, section = 'commun') => ({ cle, saisie: 'texte', role: 'proposant', section, max });
const long = (cle, max) => ({ cle, saisie: 'long', role: 'proposant', section: 'commun', max });
const url = (cle, section = 'commun', role = 'proposant') => ({ cle, saisie: 'url', role, section, max: 500 });
const choix = (cle, section = 'commun', role = 'proposant') => ({ cle, saisie: 'choix', role, section });
const choixMultiples = (cle, section = 'commun') => ({ cle, saisie: 'choixMultiples', role: 'proposant', section });
const listeOuverte = (cle) => ({ cle, saisie: 'listeOuverte', role: 'proposant', section: 'commun', max: 100 });
const coche = (cle, section = 'commun') => ({ cle, saisie: 'coche', role: 'proposant', section });
const fiches = (cle) => ({ cle, saisie: 'fiches', role: 'approbateur', section: 'commun' });

// L'ordre est celui du formulaire.
const CHAMPS = [
  choix('typePrincipal'), choix('secondType'),
  texte('nom', 200), texte('autresNoms', 200), texte('phrase', 300), long('description', 6000),
  url('lien'), long('autresLiens', 1000),
  // Un porteur est une ligne d'une autre base, pas une option : son nom peut contenir une virgule.
  { cle: 'porteurs', saisie: 'listeOuverte', role: 'proposant', section: 'commun', max: 200, virgule: true },
  choixMultiples('modesAcces'), url('commentAcceder'), choix('frais'), texte('reserveA', 200), coche('environnementSecurise'),
  choix('portee'), choixMultiples('langues'),
  listeOuverte('motsCles'), listeOuverte('normes'), listeOuverte('outils'), listeOuverte('financePar'),
  url('doi'), { cle: 'contact', saisie: 'courriel', role: 'proposant', section: 'commun', max: 254 }, texte('responsable', 200), url('profilResponsable'), url('logo'),
  texte('population', 200, 'donnees'), texte('periode', 200, 'donnees'), choixMultiples('typesDonnees', 'donnees'),
  choix('collecte', 'donnees'), coche('jumelage', 'donnees'), url('dictionnaire', 'donnees'),
  url('depotCode', 'logiciel'), texte('licence', 200, 'logiciel'),
  choix('etat', 'commun', 'approbateur'),
  fiches('faitPartieDe'), fiches('reposeSur'), fiches('donneAccesA'), fiches('remplace'),
];

const OBLIGATOIRES = ['nom', 'typePrincipal', 'phrase', 'lien'];
const CHAMPS_RSN = ['nom', 'lien', 'description'];
const LIENS_AVEC_RESSOURCE = ['responsable', 'jy-travaille', 'aucun'];
const MAX_VALEURS = 30;

const MESSAGES = {
  obligatoire: 'Ce champ est obligatoire.',
  texte: 'Ce champ doit contenir du texte.',
  tropLong: (max) => `Ce champ dépasse ${max} caractères.`,
  url: 'Cette adresse doit commencer par http:// ou https://.',
  doi: 'Le DOI doit commencer par https://doi.org/.',
  courriel: "Cette adresse courriel n'a pas la bonne forme.",
  choix: "Cette valeur ne fait pas partie des choix possibles.",
  liste: 'Ce champ doit être une liste de valeurs.',
  virgule: 'Une valeur ne peut pas contenir de virgule.',
  tropDeValeurs: `Ce champ accepte au plus ${MAX_VALEURS} valeurs.`,
  coche: 'Ce champ se coche ou se décoche.',
  saisie: 'La proposition est illisible.',
};

function estVide(v) {
  return v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

// Valide une valeur selon son champ. Renvoie { valeur } ou { erreur }.
function valider(champ, brut, options) {
  const { saisie, max } = champ;
  if (saisie === 'coche') return typeof brut === 'boolean' ? { valeur: brut } : { erreur: MESSAGES.coche };

  if (saisie === 'listeOuverte' || saisie === 'choixMultiples' || saisie === 'fiches') {
    if (!Array.isArray(brut) || brut.some((v) => typeof v !== 'string')) return { erreur: MESSAGES.liste };
    const vues = new Set(); const liste = [];
    for (const v of brut) {
      const propre = v.replace(/\s+/g, ' ').trim();
      if (!propre || vues.has(propre.toLowerCase())) continue;
      vues.add(propre.toLowerCase()); liste.push(propre);
    }
    if (liste.length > MAX_VALEURS) return { erreur: MESSAGES.tropDeValeurs };
    if (saisie === 'listeOuverte') {
      if (!champ.virgule && liste.some((v) => v.includes(','))) return { erreur: MESSAGES.virgule };
      if (liste.some((v) => v.length > max)) return { erreur: MESSAGES.tropLong(max) };
    } else if (saisie === 'choixMultiples') {
      const permis = (options && options[champ.cle]) || [];
      if (liste.some((v) => !permis.includes(v))) return { erreur: MESSAGES.choix };
    } else if (liste.some((v) => !/^[a-z0-9-]{1,200}$/.test(v))) return { erreur: MESSAGES.choix };
    return { valeur: liste };
  }

  if (brut === null || brut === undefined) brut = '';
  if (typeof brut !== 'string') return { erreur: MESSAGES.texte };
  const propre = saisie === 'long' ? brut.replace(/\r\n?/g, '\n').trim() : brut.replace(/\s+/g, ' ').trim();

  if (saisie === 'choix') {
    if (!propre) return { valeur: null };
    return ((options && options[champ.cle]) || []).includes(propre) ? { valeur: propre } : { erreur: MESSAGES.choix };
  }
  if (max && propre.length > max) return { erreur: MESSAGES.tropLong(max) };
  if (saisie === 'url') {
    if (!propre) return { valeur: null };
    if (!/^https?:\/\/[^\s]+$/i.test(brut.trim())) return { erreur: MESSAGES.url };
    if (champ.cle === 'doi' && !/^https:\/\/doi\.org\/\S+$/i.test(propre)) return { erreur: MESSAGES.doi };
    return { valeur: propre };
  }
  if (saisie === 'courriel') {
    if (!propre) return { valeur: null };
    const courriel = propre.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel) ? { valeur: courriel } : { erreur: MESSAGES.courriel };
  }
  return { valeur: propre };
}

// genre : 'nouvelle', 'modification' ou 'rsn' (à remplir par le RSN).
function nettoyer(saisie, { role = 'proposant', options = {}, genre = 'modification' } = {}) {
  const valeurs = {}; const erreurs = {};
  if (!saisie || typeof saisie !== 'object' || Array.isArray(saisie)) return { valeurs, erreurs: { _: MESSAGES.saisie } };
  for (const champ of CHAMPS) {
    const { cle } = champ;
    if (!Object.prototype.hasOwnProperty.call(saisie, cle)) continue;
    if (champ.role === 'approbateur' && role !== 'approbateur') continue;
    if (genre === 'rsn' && !CHAMPS_RSN.includes(cle)) continue;
    const resultat = valider(champ, saisie[cle], options);
    if (resultat.erreur) erreurs[cle] = resultat.erreur;
    else valeurs[cle] = resultat.valeur;
  }
  const exiges = genre === 'nouvelle' ? OBLIGATOIRES : genre === 'rsn' ? ['nom'] : [];
  for (const cle of OBLIGATOIRES) {
    if (erreurs[cle]) continue;
    const present = Object.prototype.hasOwnProperty.call(valeurs, cle);
    const vide = !present || estVide(valeurs[cle]);
    // Exigé à la création ; dans une modification, un champ obligatoire fourni ne peut pas être vidé.
    if ((exiges.includes(cle) && vide) || (genre === 'modification' && present && vide)) {
      delete valeurs[cle];
      erreurs[cle] = MESSAGES.obligatoire;
    }
  }
  return { valeurs, erreurs };
}

function egales(a, b) {
  if (estVide(a) && estVide(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const tri = (l) => [...l].map(String).sort();
    const [x, y] = [tri(a), tri(b)];
    return x.every((v, i) => v === y[i]);
  }
  // Deux textes qui ne diffèrent que par des espaces superflus sont le même texte ;
  // les sauts de ligne, eux, comptent (paragraphes d'une description).
  if (typeof a === 'string' && typeof b === 'string') return aplatir(a) === aplatir(b);
  return a === b;
}

function aplatir(texte) {
  return texte.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n\n').trim();
}

// Seulement les champs dont la valeur diffère de la fiche. Sans fiche (nouvelle ressource) :
// les champs remplis, sans « avant ».
function calculerChangements(avant, valeurs) {
  const changements = {};
  for (const { cle } of CHAMPS) {
    if (!Object.prototype.hasOwnProperty.call(valeurs, cle)) continue;
    const apres = valeurs[cle];
    if (!avant) { if (!estVide(apres)) changements[cle] = { apres }; continue; }
    const ancienne = Object.prototype.hasOwnProperty.call(avant, cle) ? avant[cle] : null;
    if (!egales(ancienne, apres)) changements[cle] = { avant: ancienne, apres };
  }
  return changements;
}

// Champs dont la valeur « avant » enregistrée ne correspond plus à la fiche d'aujourd'hui.
function champsBouscules(changements, actuelle) {
  return Object.keys(changements).filter((cle) => {
    const c = changements[cle];
    return c && typeof c === 'object' && Object.prototype.hasOwnProperty.call(c, 'avant') && !egales(c.avant, actuelle ? actuelle[cle] : null);
  });
}

// Valeurs à appliquer : celles de la proposition, puis les corrections de l'approbateur.
function fusionner(changements, corrections = {}) {
  const valeurs = {};
  for (const cle of Object.keys(changements)) {
    const c = changements[cle];
    if (c && typeof c === 'object' && Object.prototype.hasOwnProperty.call(c, 'apres')) valeurs[cle] = c.apres;
  }
  return { ...valeurs, ...corrections };
}

const api = { CHAMPS, OBLIGATOIRES, LIENS_AVEC_RESSOURCE, nettoyer, calculerChangements, champsBouscules, fusionner, estVide, egales };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else racine.Champs = api;
})(typeof window !== 'undefined' ? window : globalThis);
