/**
 * Rapprochement des ressources par mots-clés, sur le principe des
 * « Connexions » du bottin : un sujet compte d'autant plus qu'il est rare,
 * et un sujet trop répandu ne relie rien.
 * Différence avec le bottin : l'unité est le mot-clé entier de la fiche
 * (déjà une expression choisie), pas un mot tiré d'un texte libre.
 */
(function (racine) {
'use strict';

const outils = (typeof module !== 'undefined' && module.exports) ? require('./mots-cles.js') : racine;

const PARAMS_CONNEXIONS = {
  DF_MIN: 2,            // un sujet présent dans une seule fiche ne relie personne
  DF_MAX_RATIO: 0.20,   // un sujet présent dans plus de 20 % des fiches n'est pas distinctif
  WEIGHT_CAP: 4.0,      // plafond du poids (un sujet très rare ne domine pas)
  SCORE_MIN: 1.6,       // score minimal d'un lien
  TOP_K: 4,             // voisins les plus proches gardés par fiche
  DEGREE_CAP: 10,       // nombre maximal de liens par fiche
};

function calculerConnexions(ressources, params) {
  const P = Object.assign({}, PARAMS_CONNEXIONS, params || {});
  const liste = ressources || [];
  const noeuds = liste.map((r) => ({ adresse: r.adresse, nom: r.nom, type: r.typePrincipal || null }));
  const N = liste.length;
  if (N < 2) return { noeuds, liens: [] };

  // Sujets de chaque fiche : clé canonique → libellé d'origine (pour l'affichage).
  const sujets = liste.map((r) => {
    const m = new Map();
    for (const motCle of (r.motsCles || [])) {
      const cle = outils.cleMotCle(motCle);
      if (cle && !m.has(cle)) m.set(cle, String(motCle).toLowerCase());
    }
    return m;
  });
  const frequence = new Map();
  for (const m of sujets) for (const cle of m.keys()) frequence.set(cle, (frequence.get(cle) || 0) + 1);

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
      motsCommuns: p.cles.map((cle) => sujets[p.i].get(cle)),
    });
  }
  return { noeuds, liens };
}

const api = { PARAMS_CONNEXIONS, calculerConnexions };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
