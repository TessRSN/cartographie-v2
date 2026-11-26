/**
 * Rapprochement des ressources par mots-clés, sur le principe des
 * « Connexions » du bottin : un sujet compte d'autant plus qu'il est rare,
 * et un sujet trop répandu ne relie rien.
 * Différence avec le bottin : l'unité est le mot-clé entier de la fiche
 * (déjà une expression choisie), pas un mot tiré d'un texte libre.
 */
(function (racine) {
'use strict';

const serveur = typeof module !== 'undefined' && module.exports;
const outils = serveur ? require('./mots-cles.js') : racine;
const libelles = serveur ? require('./libelles-sujets.js') : racine;

const PARAMS_CONNEXIONS = {
  DF_MIN: 2,            // un sujet présent dans une seule fiche ne relie personne
  DF_MAX_RATIO: 0.20,   // un sujet présent dans plus de 20 % des fiches n'est pas distinctif
  WEIGHT_CAP: 4.0,      // plafond du poids (un sujet très rare ne domine pas)
  SCORE_MIN: 1.6,       // score minimal d'un lien
  TOP_K: 4,             // voisins les plus proches gardés par fiche
  DEGREE_CAP: 10,       // nombre maximal de liens par fiche
};

// Ce qui rapproche deux ressources : leurs mots-clés et leurs normes et formats (BIDS, DICOM, CIM-10…).
// Les outils et environnements (Docker, REDCap…) n'en font pas partie : ils disent comment une
// ressource est distribuée, pas de quoi elle traite, et relieraient tous les logiciels entre eux.
function sujetsDe(r) { return (r.motsCles || []).concat(r.normes || []); }

// Libellé d'un sujet regroupé, dans la langue du site ('fr' par défaut, 'en').
// ecritures : écriture en minuscules → nombre de fiches. En français le graphe écrit tout en
// minuscules, comme il l'a toujours fait ; en anglais la table donne la forme propre (« ICD-10 »).
function libelleRegroupe(cle, langue, ecritures) {
  const triees = [...ecritures.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'fr'));
  const libelle = libelles.libelleSujet(cle, langue, triees);
  return langue === 'en' ? libelle : libelle.toLowerCase();
}

function calculerConnexions(ressources, params, langue) {
  const P = Object.assign({}, PARAMS_CONNEXIONS, params || {});
  const liste = ressources || [];
  const noeuds = liste.map((r) => ({ adresse: r.adresse, nom: r.nom, type: r.typePrincipal || null }));
  const N = liste.length;
  if (N < 2) return { noeuds, liens: [] };

  // Sujets de chaque fiche : clé canonique → écriture de la fiche, en minuscules.
  const sujets = liste.map((r) => {
    const m = new Map();
    for (const motCle of sujetsDe(r)) {
      const cle = outils.cleMotCle(motCle);
      if (cle && !m.has(cle)) m.set(cle, String(motCle).toLowerCase());
    }
    return m;
  });
  // Par sujet : le nombre de fiches et les écritures rencontrées (pour le libellé affiché).
  const frequence = new Map();
  const ecritures = new Map();
  for (const m of sujets) {
    for (const [cle, ecriture] of m) {
      frequence.set(cle, (frequence.get(cle) || 0) + 1);
      if (!ecritures.has(cle)) ecritures.set(cle, new Map());
      ecritures.get(cle).set(ecriture, (ecritures.get(cle).get(ecriture) || 0) + 1);
    }
  }

  const dfMax = Math.max(P.DF_MIN, Math.floor(N * P.DF_MAX_RATIO));
  const poids = new Map();
  const fichesParSujet = new Map();
  sujets.forEach((m, i) => {
    for (const cle of m.keys()) {
      const df = frequence.get(cle);
      if (df < P.DF_MIN || df > dfMax) continue;
      if (!poids.has(cle)) poids.set(cle, Math.min(Math.log(N / df), P.WEIGHT_CAP));
      if (!fichesParSujet.has(cle)) fichesParSujet.set(cle, []);
      fichesParSujet.get(cle).push(i);
    }
  });

  // Score de chaque paire qui partage au moins un sujet distinctif.
  const paires = new Map();
  for (const [cle, indices] of fichesParSujet) {
    for (let x = 0; x < indices.length; x++) {
      for (let y = x + 1; y < indices.length; y++) {
        const i = indices[x], j = indices[y];
        const id = i * N + j;
        let p = paires.get(id);
        if (!p) { p = { i, j, poids: 0, cles: [] }; paires.set(id, p); }
        p.poids += poids.get(cle);
        p.cles.push(cle);
      }
    }
  }
  const candidates = [...paires.values()]
    .filter((p) => p.poids >= P.SCORE_MIN)
    .sort((a, b) => b.poids - a.poids || a.i - b.i || a.j - b.j);

  // Chaque fiche garde ses TOP_K meilleurs voisins ; un lien existe s'il est
  // retenu par l'une des deux, sans dépasser DEGREE_CAP liens par fiche.
  const rang = new Array(N).fill(0);
  const degre = new Array(N).fill(0);
  const liens = [];
  for (const p of candidates) {
    const voulu = rang[p.i] < P.TOP_K || rang[p.j] < P.TOP_K;
    rang[p.i]++; rang[p.j]++;
    if (!voulu || degre[p.i] >= P.DEGREE_CAP || degre[p.j] >= P.DEGREE_CAP) continue;
    degre[p.i]++; degre[p.j]++;
    liens.push({
      a: liste[p.i].adresse,
      b: liste[p.j].adresse,
      poids: Math.round(p.poids * 100) / 100,
      motsCommuns: p.cles.map((cle) => libelleRegroupe(cle, langue, ecritures.get(cle))),
      clesCommunes: p.cles,
    });
  }
  return { noeuds, liens };
}

// Graphe par sujets : les sujets partagés par assez de fiches deviennent eux-mêmes des
// points, et chaque ressource est reliée à ses sujets. On voit ainsi ce qui rapproche
// deux ressources sans survoler un trait. Une ressource sans sujet fréquent n'y figure pas.
const PARAMS_SUJETS = { FICHES_MIN: 5 };   // un sujet est retenu à partir de cinq fiches

function calculerSujets(ressources, params, langue) {
  const P = Object.assign({}, PARAMS_SUJETS, params || {});
  const liste = ressources || [];
  // Par sujet (clé canonique) : les ressources qui le portent et les libellés rencontrés.
  const parSujet = new Map();
  for (const r of liste) {
    const vus = new Set();
    const sesNormes = new Set((r.normes || []).map((n) => outils.cleMotCle(n)));
    for (const motCle of sujetsDe(r)) {
      const cle = outils.cleMotCle(motCle);
      if (!cle || vus.has(cle)) continue;
      vus.add(cle);
      if (!parSujet.has(cle)) parSujet.set(cle, { adresses: [], libelles: new Map(), norme: false });
      const s = parSujet.get(cle);
      s.adresses.push(r.adresse);
      if (sesNormes.has(cle)) s.norme = true;
      const libelle = String(motCle).toLowerCase();
      s.libelles.set(libelle, (s.libelles.get(libelle) || 0) + 1);
    }
  }
  // Le libellé affiché vient de la table des libellés, dans la langue du site ; sinon c'est
  // l'écriture la plus fréquente et, à égalité, la première par ordre alphabétique.
  const sujets = [...parSujet.entries()]
    .filter(([, s]) => s.adresses.length >= P.FICHES_MIN)
    .map(([cle, s]) => ({
      id: `sujet:${cle}`,
      nom: libelleRegroupe(cle, langue, s.libelles),
      nombre: s.adresses.length,
      norme: s.norme,
      adresses: s.adresses,
    }))
    .sort((x, y) => y.nombre - x.nombre || x.nom.localeCompare(y.nom, 'fr'));
  const liens = [];
  const reliees = new Set();
  for (const s of sujets) for (const adresse of s.adresses) { liens.push({ a: adresse, b: s.id, poids: 1, motsCommuns: [s.nom] }); reliees.add(adresse); }
  return {
    noeuds: liste.filter((r) => reliees.has(r.adresse)).map((r) => ({ adresse: r.adresse, nom: r.nom, type: r.typePrincipal || null })),
    sujets: sujets.map(({ id, nom, nombre, norme }) => ({ id, nom, nombre, norme })),
    liens,
    sansSujet: liste.filter((r) => !reliees.has(r.adresse)).map((r) => r.adresse),
  };
}

const api = { PARAMS_CONNEXIONS, PARAMS_SUJETS, calculerConnexions, calculerSujets };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
