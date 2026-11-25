/**
 * L'historique des versions d'une fiche : fonctions pures, partagées par le serveur et le panneau.
 * Une version garde seulement ce qui a changé : { cle: { avant, apres } }. Pour retrouver une
 * version, on part de la fiche d'aujourd'hui et on remonte les valeurs « avant ».
 */
(function (racine) {
'use strict';

const { CHAMPS } = (typeof module !== 'undefined' && module.exports) ? require('./champs.js') : racine.Champs;
const LISTES = ['listeOuverte', 'choixMultiples', 'fiches'];
const PAR_CLE = Object.fromEntries(CHAMPS.map((c) => [c.cle, c]));
const possede = (o, cle) => Object.prototype.hasOwnProperty.call(o, cle);

// Une valeur recopiée, dans la forme de son champ : une liste reste une liste, l'absence devient null.
function copie(cle, v) {
  if (LISTES.includes(PAR_CLE[cle].saisie)) return Array.isArray(v) ? v.slice() : [];
  return v === undefined ? null : v;
}

// Les changements lisibles d'une version : clés du catalogue, chacune avec « avant » et « apres ».
function changementsLisibles(brut) {
  const lisibles = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return lisibles;
  for (const { cle } of CHAMPS) {
    const c = possede(brut, cle) ? brut[cle] : null;
    if (!c || typeof c !== 'object' || Array.isArray(c) || !possede(c, 'apres')) continue;
    lisibles[cle] = { avant: possede(c, 'avant') ? c.avant : null, apres: c.apres };
  }
  return lisibles;
}

// Les versions dans l'ordre. Une fiche d'avant l'historique reçoit en tête sa version de départ,
// « l'état au lancement de l'historique » ; une fiche née depuis commence à sa création.
function avecDepart(versions) {
  const triees = [...(versions || [])].sort((a, b) => a.numero - b.numero);
  if (!triees.length || triees[0].numero > 1) {
    triees.unshift({ numero: 1, le: null, par: null, source: 'depart', propositionId: null, changements: {}, note: '', illisible: false });
  }
  return triees;
}

// Les valeurs de la fiche telle qu'elle était à la version « numero » : toutes les clés du catalogue.
function reconstituer(actuelle, versions, numero) {
  const valeurs = {};
  for (const { cle } of CHAMPS) valeurs[cle] = copie(cle, actuelle ? actuelle[cle] : null);
  // De la plus récente à la plus ancienne ; à numéro égal (deux écritures simultanées), la date départage.
  const plusRecentes = (versions || []).filter((v) => v.numero > numero)
    .sort((a, b) => b.numero - a.numero || String(b.le || '').localeCompare(String(a.le || '')));
  for (const version of plusRecentes) {
    const changements = changementsLisibles(version.changements);
    for (const cle of Object.keys(changements)) valeurs[cle] = copie(cle, changements[cle].avant);
  }
  return valeurs;
}

// Le numéro de la prochaine version d'une fiche. Sans aucune ligne : 1 pour une création, 2 pour une
// fiche d'avant l'historique, dont la version 1 est l'état de départ.
function prochainNumero(numeros, source) {
  const dernier = Math.max(0, ...(numeros || []).filter((n) => Number.isInteger(n) && n > 0));
  if (dernier) return dernier + 1;
  return source === 'creation' ? 1 : 2;
}

const api = { changementsLisibles, avecDepart, reconstituer, prochainNumero };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else racine.Versions = api;
})(typeof window !== 'undefined' ? window : globalThis);
