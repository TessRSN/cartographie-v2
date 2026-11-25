/**
 * Comparaison de deux versions d'une valeur, pour le panneau : ce qui est retiré, ce qui est
 * ajouté, ce qui ne change pas. Fonctions pures, partagées par le navigateur et les essais.
 */
(function (racine) {
'use strict';

// En dessous de cette part de mots communs, deux textes sont montrés comme un remplacement entier.
const PART_COMMUNE_MIN = 0.35;

const enTexte = (v) => (v === null || v === undefined ? '' : String(v));
// Les mots et les blancs qui les séparent, dans l'ordre : recollés, ils redonnent le texte exact.
const morceaux = (texte) => texte.split(/(\s+)/).filter((m) => m !== '');
const estMot = (m) => /\S/.test(m);

// Plus longue suite commune de deux listes de morceaux : [[sorte, morceau], …].
function aligner(a, b) {
  const n = a.length; const m = b.length; const largeur = m + 1;
  const table = new Uint16Array((n + 1) * largeur);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * largeur + j] = a[i] === b[j] ? table[(i + 1) * largeur + j + 1] + 1 : Math.max(table[(i + 1) * largeur + j], table[i * largeur + j + 1]);
    }
  }
  const suite = []; let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { suite.push(['egal', a[i]]); i++; j++; }
    else if (table[(i + 1) * largeur + j] >= table[i * largeur + j + 1]) suite.push(['retire', a[i++]]);
    else suite.push(['ajoute', b[j++]]);
  }
  while (i < n) suite.push(['retire', a[i++]]);
  while (j < m) suite.push(['ajoute', b[j++]]);
  return suite;
}

// Deux textes, mot à mot : la liste des segments { texte, sorte: 'egal' | 'retire' | 'ajoute' }.
// Les segments « egal » et « retire », recollés, redonnent l'ancien texte ; « egal » et « ajoute », le nouveau.
function comparerTextes(avant, apres) {
  const a = enTexte(avant); const b = enTexte(apres);
  if (a === b) return a ? [{ texte: a, sorte: 'egal' }] : [];
  if (!a) return [{ texte: b, sorte: 'ajoute' }];
  if (!b) return [{ texte: a, sorte: 'retire' }];
  const ma = morceaux(a); const mb = morceaux(b);
  // Le début et la fin identiques sont mis de côté : la comparaison ne porte que sur le milieu.
  let debut = 0;
  while (debut < ma.length && debut < mb.length && ma[debut] === mb[debut]) debut++;
  let fin = 0;
  while (fin < ma.length - debut && fin < mb.length - debut && ma[ma.length - 1 - fin] === mb[mb.length - 1 - fin]) fin++;
  const suite = [
    ...ma.slice(0, debut).map((m) => ['egal', m]),
    ...aligner(ma.slice(debut, ma.length - fin), mb.slice(debut, mb.length - fin)),
    ...ma.slice(ma.length - fin).map((m) => ['egal', m]),
  ];
  const communs = suite.filter(([sorte, m]) => sorte === 'egal' && estMot(m)).length;
  const total = Math.max(ma.filter(estMot).length, mb.filter(estMot).length);
  if (!total || communs / total < PART_COMMUNE_MIN) return [{ texte: a, sorte: 'retire' }, { texte: b, sorte: 'ajoute' }];
  // Dans un passage remplacé, tout le retrait vient avant tout l'ajout, puis les voisins de même sorte sont réunis.
  const segments = []; let retire = ''; let ajoute = '';
  const pousser = (texte, sorte) => {
    if (!texte) return;
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.sorte === sorte) dernier.texte += texte; else segments.push({ texte, sorte });
  };
  const vider = () => { pousser(retire, 'retire'); pousser(ajoute, 'ajoute'); retire = ''; ajoute = ''; };
  for (const [sorte, m] of suite) {
    if (sorte === 'retire') retire += m;
    else if (sorte === 'ajoute') ajoute += m;
    else { vider(); pousser(m, 'egal'); }
  }
  vider();
  return segments;
}

// Deux listes d'étiquettes : celles qui restent, celles qui partent, celles qui arrivent.
function comparerListes(avant, apres) {
  const propre = (liste) => [...new Set((Array.isArray(liste) ? liste : []).filter((v) => v !== null && v !== undefined && v !== '').map(String))];
  const a = propre(avant); const b = propre(apres);
  return { gardes: a.filter((v) => b.includes(v)), retires: a.filter((v) => !b.includes(v)), ajoutes: b.filter((v) => !a.includes(v)) };
}

const api = { comparerTextes, comparerListes };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else racine.Comparaison = api;
})(typeof window !== 'undefined' ? window : globalThis);
