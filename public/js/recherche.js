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

// Un mot tapé est-il le début d'un mot canonique de la fiche ? « oncol » trouve « oncology »,
// donc « oncologie » ; « rare » ne trouve pas « infrared ».
function debuteUnMotCanonique(doc, mot) {
  for (const canonique of doc.motsCanoniques) if (canonique.startsWith(mot)) return true;
  return false;
}

// Fiches qui contiennent tous les mots de la requête, classées par pertinence.
// rechercheFloue(forme) renvoie [{ item: document, score }] (Fuse) ; sans elle,
// un mot long est cherché comme sous-chaîne du texte.
// Seul le mot tapé est cherché de façon souple. Sa traduction par le dictionnaire ne compte
// qu'en mot entier : « souche » donne « stem », qui ne doit pas trouver « system ».
// Une requête qui est un sujet entier (« machine learning », « apprentissage automatique »)
// trouve aussi les fiches qui portent ce sujet, dans une langue ou dans l'autre.
// Ordre : les fiches dont le nom contient la requête, puis celles qui portent le sujet,
// puis les autres ; dans chaque groupe, l'ordre de la recherche par mots.
const SCORE_MOT_CANONIQUE = 0.3;
function chercher(documents, requete, rechercheFloue) {
  const liste = documents || [];
  const demandes = motsDeRequete(requete);
  if (demandes.length === 0) return liste.map((d) => d.r);
  let scores = null;
  for (const mot of demandes) {
    const trouves = new Map();
    const noter = (r, score) => { if (!trouves.has(r) || score < trouves.get(r)) trouves.set(r, score); };
    if (mot.length < LONGUEUR_FLOUE) {
      for (const d of liste) if (trouveMotCourt(d, mot)) trouves.set(d.r, 0.2);
    } else {
      if (rechercheFloue) for (const res of rechercheFloue(mot) || []) noter(res.item.r, res.score);
      else for (const d of liste) if (d.plie.includes(mot)) noter(d.r, 0.5);
      const canonique = mots.canoniser(mot);
      for (const d of liste) {
        if (debuteUnMotCanonique(d, mot)) noter(d.r, rechercheFloue ? SCORE_MOT_CANONIQUE : 0.5);
        else if (canonique && canonique !== mot && d.motsCanoniques.has(canonique)) noter(d.r, rechercheFloue ? SCORE_MOT_CANONIQUE : 0.5);
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
  const cle = mots.cleMotCle(requete);
  const duSujet = cle ? liste.filter((d) => d.clesSujets && d.clesSujets.has(cle)).map((d) => d.r) : [];
  if (duSujet.length === 0) return parMots;
  const demande = decouper(requete).join(' ');
  const parNom = new Set(liste.filter((d) => decouper([d.nom, d.autresNoms].filter(Boolean).join(' ')).join(' ').includes(demande)).map((d) => d.r));
  const porteSujet = new Set(duSujet);
  const trouvees = new Set(parMots);
  const rang = (r) => (parNom.has(r) ? 0 : porteSujet.has(r) ? 1 : 2);
  // Les fiches du sujet que la recherche par mots n'a pas vues (écrites dans l'autre langue) viennent à la suite des autres.
  const toutes = parMots.concat(duSujet.filter((r) => !trouvees.has(r)));
  return [0, 1, 2].flatMap((groupe) => toutes.filter((r) => rang(r) === groupe));
}

// Sujets et porteurs du catalogue, avec le nombre de fiches, du plus fréquent au moins fréquent.
// Deux écritures d'un même sujet (majuscules, accents, français et anglais) sont comptées
// ensemble, par leur clé commune. Le libellé d'un sujet suit la langue du site ('fr' par
// défaut, 'en'). Seuls les mots-clés font un sujet ; « nombre » compte les fiches qui le
// portent en mot-clé, « avecNormes » celles qui le portent en mot-clé ou en norme (ce que
// ramène un clic). « autresFormes » garde ses autres écritures pliées, pour les suggestions.
function denombrer(ressources, langue) {
  const sujets = new Map();
  const porteurs = new Map();
  const parNorme = new Map();
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
    for (const cle of new Set((r.normes || []).map((n) => mots.cleMotCle(n)).filter(Boolean))) {
      if (!vus.has(cle)) parNorme.set(cle, (parNorme.get(cle) || 0) + 1);
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
    const plie = mots.plier(sujet);
    const connu = libelles.LIBELLES_SUJETS[cle] || {};
    const autresFormes = [...new Set([...ecritures.keys(), connu.fr, connu.en].filter(Boolean).map(mots.plier))].filter((forme) => forme !== plie);
    return { sujet, plie, nombre, avecNormes: nombre + (parNorme.get(cle) || 0), cle, autresFormes };
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
// dont un mot du nom commence par ce qui est tapé.
// Un sujet s'affiche dans la langue du site. Il est proposé, dans cet ordre :
// 1. si un mot de son libellé commence par la saisie ;
// 2. si son libellé contient la saisie (à partir de quatre lettres) ;
// 3. si un mot d'une autre de ses écritures (l'autre langue) commence par la saisie.
// Sa valeur, une fois cherchée, trouve les fiches des deux langues ; son nombre est celui
// des fiches que ce clic ramène par le sujet (mot-clé ou norme).
function suggestions(ressources, requete, langue) {
  const q = mots.plier(requete).trim();
  if (q.length < 2 || !(ressources || []).length) return [];
  const { sujets, porteurs } = denombrer(ressources, langue);
  const sortie = [];
  const debuteUnMot = (plie) => plie.split(/[^a-z0-9]+/).some((m) => m.startsWith(q)) || plie.startsWith(q);
  // Deux ou trois lettres : seulement en début de mot, pour ne pas proposer « sociaux » à qui tape « ia ».
  const contient = (plie) => (q.length < LONGUEUR_FLOUE ? debuteUnMot(plie) : plie.includes(q));
  const rangSujet = (s) => {
    if (debuteUnMot(s.plie)) return 1;
    if (contient(s.plie)) return 2;
    return s.autresFormes.some(debuteUnMot) ? 3 : 0;
  };
  const proposes = sujets.map((s) => ({ s, rang: rangSujet(s) })).filter((x) => x.rang > 0)
    .sort((x, y) => x.rang - y.rang || y.s.avecNormes - x.s.avecNormes || x.s.plie.localeCompare(y.s.plie));
  for (const { s } of proposes.slice(0, 3)) sortie.push({ genre: 'sujet', valeur: s.sujet, libelle: s.sujet, nombre: s.avecNormes });
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
