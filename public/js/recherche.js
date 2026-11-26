/**
 * Recherche, suggestions pendant la saisie et chiffres du bandeau
 * « Portrait de la cartographie ». Fonctions pures, sans accès à la page.
 * Chargé par <script> dans le navigateur et par require() dans les essais.
 */
(function (racine) {
'use strict';

const serveur = typeof module !== 'undefined' && module.exports;
const mots = serveur ? require('./mots-cles.js') : racine;
const textes = serveur ? require('./texte.js') : racine;
const libelles = serveur ? require('./libelles-sujets.js') : racine;

// Sigles courants : un sigle cherché trouve aussi les fiches qui écrivent l'expression au long.
const SIGLES = {
  ia: ['intelligence artificielle', 'artificial intelligence'],
  ai: ['intelligence artificielle', 'artificial intelligence'],
  irm: ['resonance magnetique', 'magnetic resonance'],
  mri: ['resonance magnetique', 'magnetic resonance'],
};

// En dessous de cette longueur, un mot cherché doit être un mot entier de la fiche.
const LONGUEUR_FLOUE = 4;

function decouper(texte) {
  return mots.plier(texte).split(/[^a-z0-9]+/).filter(Boolean);
}

// Ce que la recherche lit d'une fiche.
function documentDeRecherche(r) {
  const porteurs = (r.porteurs || []).map((p) => p.nom).join(' ');
  const motsCles = (r.motsCles || []).join(' ');
  // Normes, formats et outils : on peut chercher « FHIR » ou « Docker ».
  const normes = (r.normes || []).concat(r.outils || []).join(' ');
  const tout = [r.nom, r.autresNoms, motsCles, normes, porteurs, r.phrase, r.description].filter(Boolean).join(' ');
  const canoniques = mots.motsCanoniques(tout);
  // Clés des sujets de la fiche (mots-clés et normes) : un sujet cherché en entier trouve la
  // fiche quelle que soit la langue dans laquelle elle l'écrit.
  const clesSujets = new Set((r.motsCles || []).concat(r.normes || []).map((s) => mots.cleMotCle(s)).filter(Boolean));
  return {
    r, nom: r.nom, autresNoms: r.autresNoms, motsCles, normes, porteurs, phrase: r.phrase, description: r.description,
    canon: canoniques.join(' '), plie: mots.plier(tout),
    motsEntiers: new Set(decouper(tout)), motsCanoniques: new Set(canoniques), clesSujets,
  };
}

// Mots utiles d'une requête : au moins deux lettres ; les mots vides (« de »,
// « the ») sont ignorés quand il reste autre chose.
function motsDeRequete(requete) {
  const tous = decouper(requete).filter((m) => m.length >= 2);
  const utiles = tous.filter((m) => !mots.MOTS_VIDES.has(m));
  return utiles.length ? utiles : tous;
}

// Un mot court (« ia », « age ») n'est trouvé que comme mot entier, dans le
// texte ou dans sa forme canonique, ou par l'expression que le sigle abrège.
function trouveMotCourt(doc, mot) {
  if (doc.motsEntiers.has(mot) || doc.motsCanoniques.has(mot)) return true;
  const canonique = mots.canoniser(mot);
  if (canonique && doc.motsCanoniques.has(canonique)) return true;
  return (SIGLES[mot] || []).some((expression) => doc.plie.includes(expression));
}

// Fiches qui contiennent tous les mots de la requête, classées par pertinence.
// rechercheFloue(forme) renvoie [{ item: document, score }] (Fuse) ; sans elle,
// un mot long est cherché comme sous-chaîne.
// Une requête qui est un sujet entier (« machine learning », « apprentissage automatique »)
// trouve d'abord les fiches qui portent ce sujet, dans une langue ou dans l'autre.
function chercher(documents, requete, rechercheFloue) {
  const liste = documents || [];
  const demandes = motsDeRequete(requete);
  if (demandes.length === 0) return liste.map((d) => d.r);
  const cle = mots.cleMotCle(requete);
  const parSujet = cle ? liste.filter((d) => d.clesSujets && d.clesSujets.has(cle)).map((d) => d.r) : [];
  let scores = null;
  for (const mot of demandes) {
    const trouves = new Map();
    if (mot.length < LONGUEUR_FLOUE) {
      for (const d of liste) if (trouveMotCourt(d, mot)) trouves.set(d.r, 0.2);
    } else {
      const formes = [mot];
      const canonique = mots.canoniser(mot);
      if (canonique && canonique !== mot) formes.push(canonique);
      for (const forme of formes) {
        if (rechercheFloue) {
          for (const res of rechercheFloue(forme) || []) {
            const precedent = trouves.get(res.item.r);
            if (precedent === undefined || res.score < precedent) trouves.set(res.item.r, res.score);
          }
        } else {
          for (const d of liste) if ((d.plie.includes(forme) || d.canon.includes(forme)) && !trouves.has(d.r)) trouves.set(d.r, 0.5);
        }
      }
    }
    if (scores === null) scores = trouves;
    else {
      for (const [r, s] of [...scores]) {
        if (trouves.has(r)) scores.set(r, s + trouves.get(r)); else scores.delete(r);
      }
    }
    if (scores.size === 0) break;
  }
  const parMots = [...scores.entries()].sort((a, b) => a[1] - b[1]).map(([r]) => r);
  if (parSujet.length === 0) return parMots;
  const dejaLa = new Set(parSujet);
  return parSujet.concat(parMots.filter((r) => !dejaLa.has(r)));
}

// Sujets et porteurs du catalogue, avec le nombre de fiches, du plus fréquent au moins fréquent.
// Deux écritures d'un même sujet (majuscules, accents, français et anglais) sont comptées
// ensemble, par leur clé commune. Le libellé d'un sujet suit la langue du site ('fr' par
// défaut, 'en') ; « formes » garde toutes ses écritures pliées, pour les suggestions.
function denombrer(ressources, langue) {
  const sujets = new Map();
  const porteurs = new Map();
  for (const r of ressources || []) {
    const vus = new Set();
    for (const motCle of r.motsCles || []) {
      const libelle = String(motCle || '').trim();
      const cle = mots.cleMotCle(libelle) || mots.plier(libelle);
      if (!cle || vus.has(cle)) continue;
      vus.add(cle);
      const s = sujets.get(cle) || { cle, ecritures: new Map(), nombre: 0 };
      s.nombre++;
      s.ecritures.set(libelle, (s.ecritures.get(libelle) || 0) + 1);
      sujets.set(cle, s);
    }
    for (const nom of new Set((r.porteurs || []).map((p) => p.nom).filter(Boolean))) {
      const p = porteurs.get(nom) || { nom, plie: mots.plier(nom), nombre: 0 };
      p.nombre++;
      porteurs.set(nom, p);
    }
  }
  const ordre = (a, b) => b.nombre - a.nombre || a.plie.localeCompare(b.plie);
  const regroupes = [...sujets.values()].map(({ cle, ecritures, nombre }) => {
    // À égalité entre deux écritures, la première rencontrée l'emporte.
    const sujet = libelles.libelleSujet(cle, langue, [...ecritures.entries()]);
    const connu = libelles.LIBELLES_SUJETS[cle] || {};
    const formes = [...new Set([...ecritures.keys(), connu.fr, connu.en].filter(Boolean).map(mots.plier))];
    return { sujet, plie: mots.plier(sujet), nombre, cle, formes };
  });
  return { sujets: regroupes.sort(ordre), porteurs: [...porteurs.values()].sort(ordre) };
}

// Chiffres du bandeau « Portrait de la cartographie ».
function statistiquesBandeau(ressources, combien, langue) {
  const liste = ressources || [];
  const n = combien || 6;
  const { sujets, porteurs } = denombrer(liste, langue);
  // Normes et formats : une fiche compte une fois par norme, même si la norme y est écrite deux fois.
  const parNorme = new Map();
  for (const r of liste) for (const norme of new Set((r.normes || []).filter(Boolean))) parNorme.set(norme, (parNorme.get(norme) || 0) + 1);
  const normes = [...parNorme.entries()].map(([norme, nombre]) => ({ norme, nombre })).sort((a, b) => b.nombre - a.nombre || a.norme.localeCompare(b.norme, 'fr'));
  const parType = new Map();
  for (const r of liste) {
    const cle = textes.cleType(r.typePrincipal);
    parType.set(cle, (parType.get(cle) || 0) + 1);
  }
  const types = Object.entries(textes.CLES_TYPE)
    .map(([type, cle]) => ({ type, cle, nombre: parType.get(cle) || 0 }))
    .filter((t) => t.nombre > 0);
  if (parType.get('autre')) types.push({ type: null, cle: 'autre', nombre: parType.get('autre') });
  return {
    ressources: liste.length,
    porteurs: porteurs.length,
    types,
    sujets: sujets.slice(0, n).map(({ sujet, nombre }) => ({ sujet, nombre })),
    porteursPrincipaux: porteurs.slice(0, n).map(({ nom, nombre }) => ({ nom, nombre })),
    normesPrincipales: normes.slice(0, n),
  };
}

// Suggestions pendant la saisie : des sujets, des porteurs, puis des ressources
// dont un mot du nom commence par ce qui est tapé. Un sujet est proposé que l'on tape le
// début de son écriture française ou de son écriture anglaise ; il s'affiche dans la langue
// du site, et sa valeur, une fois cherchée, trouve les fiches des deux langues.
function suggestions(ressources, requete, langue) {
  const q = mots.plier(requete).trim();
  if (q.length < 2 || !(ressources || []).length) return [];
  const { sujets, porteurs } = denombrer(ressources, langue);
  const sortie = [];
  // Deux ou trois lettres : seulement en début de mot, pour ne pas proposer « sociaux » à qui tape « ia ».
  const contient = (plie) => (q.length < LONGUEUR_FLOUE ? plie.split(/[^a-z0-9]+/).some((m) => m.startsWith(q)) || plie.startsWith(q) : plie.includes(q));
  for (const s of sujets.filter((x) => x.formes.some(contient)).slice(0, 3)) sortie.push({ genre: 'sujet', valeur: s.sujet, libelle: s.sujet, nombre: s.nombre });
  for (const p of porteurs.filter((x) => contient(x.plie)).slice(0, 4)) sortie.push({ genre: 'porteur', valeur: p.nom, libelle: p.nom, nombre: p.nombre });
  const demandes = decouper(requete);
  const proposees = (ressources || []).filter((r) => {
    const motsDuNom = decouper([r.nom, r.autresNoms].filter(Boolean).join(' '));
    return demandes.every((d) => motsDuNom.some((m) => m.startsWith(d)));
  }).slice(0, 5);
  for (const r of proposees) {
    sortie.push({ genre: 'ressource', valeur: r.adresse, libelle: r.nom, detail: textes.nomCourt(((r.porteurs || [])[0] || {}).nom || '') });
  }
  return sortie;
}

const api = { SIGLES, LONGUEUR_FLOUE, documentDeRecherche, motsDeRequete, trouveMotCourt, chercher, denombrer, statistiquesBandeau, suggestions };
if (serveur) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
