/**
 * Accueil de la cartographie : chargement des fiches, recherche, filtres,
 * cartes de fiches et fenêtre de fiche. La carte (carte.js) et le graphe
 * (graphe.js) s'abonnent aux fiches visibles par surChangement().
 */
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const etat = { ressources: [], visibles: [], carte: { cle: '' }, pret: false, filtres: { type: '', modeAcces: '', porteur: '', etat: '', horsCarte: false } };
const abonnes = [];
let index = null;          // index de recherche Fuse
let documents = [];        // repli si Fuse n'est pas chargé
let ficheOuverte = null;
let focusAvant = null;

function surChangement(fn) { abonnes.push(fn); if (etat.pret) fn(etat); }
function prevenir() { for (const fn of abonnes) { try { fn(etat); } catch (err) { console.error(err); } } }

// ─── Recherche ───
function construireIndex() {
  documents = etat.ressources.map((r) => {
    const porteurs = (r.porteurs || []).map((p) => p.nom).join(' ');
    const motsCles = (r.motsCles || []).join(' ');
    const tout = [r.nom, r.autresNoms, motsCles, porteurs, r.phrase, r.description].join(' ');
    return { r, nom: r.nom, autresNoms: r.autresNoms, motsCles, porteurs, phrase: r.phrase, description: r.description,
      canon: motsCanoniques(tout).join(' '), plie: plier(tout) };
  });
  if (typeof Fuse === 'undefined') { index = null; return; }
  index = new Fuse(documents, {
    includeScore: true, threshold: 0.25, ignoreLocation: true, minMatchCharLength: 2,
    keys: [
      { name: 'nom', weight: 3 }, { name: 'autresNoms', weight: 2 }, { name: 'motsCles', weight: 2 },
      { name: 'porteurs', weight: 1.5 }, { name: 'phrase', weight: 1 }, { name: 'canon', weight: 1 }, { name: 'description', weight: 0.5 },
    ],
  });
}

// Chaque mot de la requête doit être trouvé (lui ou sa forme canonique) ;
// les fiches sont classées par pertinence.
function chercher(requete) {
  const mots = plier(requete).split(/[^a-z0-9]+/).filter((m) => m.length >= 2);
  if (mots.length === 0) return etat.ressources;
  let scores = null;
  for (const mot of mots) {
    const trouves = new Map();
    const formes = [mot];
    const c = canoniser(mot);
    if (c && c !== mot) formes.push(c);
    for (const forme of formes) {
      if (index) {
        for (const res of index.search(forme)) {
          const precedent = trouves.get(res.item.r);
          if (precedent === undefined || res.score < precedent) trouves.set(res.item.r, res.score);
        }
      } else {
        for (const d of documents) if (d.plie.includes(forme) || d.canon.includes(forme)) trouves.set(d.r, 0.5);
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
  return [...scores.entries()].sort((a, b) => a[1] - b[1]).map(([r]) => r);
}

// ─── Affichage ───
function htmlCarte(r) {
  const e = echapper;
  const porteurs = (r.porteurs || []).map((p) => p.nom).join(' · ');
  const acces = (r.modesAcces || []).map((m) => `<span class="pastille acces">${e(m)}</span>`).join('');
  return `<a class="carte-fiche type-${cleType(r.typePrincipal)}" href="/ressource/${e(r.adresse)}" data-fiche="${e(r.adresse)}">
    <h3>${e(r.nom)}</h3>
    ${porteurs ? `<p class="carte-porteur">${e(porteurs)}</p>` : ''}
    <p class="carte-pastilles">${r.typePrincipal ? `<span class="pastille type type-${cleType(r.typePrincipal)}">${e(r.typePrincipal)}</span>` : ''}${acces}</p>
    ${r.phrase ? `<p class="carte-phrase">${e(r.phrase)}</p>` : ''}
  </a>`;
}

function rafraichir() {
  const requete = $('champRecherche').value.trim();
  etat.visibles = filtrer(chercher(requete), etat.filtres);
  $('cartes').innerHTML = etat.visibles.map(htmlCarte).join('');
  $('compte').textContent = TEXTES.compte(etat.visibles.length);
  const message = $('message');
  message.hidden = etat.visibles.length > 0;
  message.textContent = TEXTES.aucunResultat;
  const f = etat.filtres;
  $('effacerFiltres').hidden = !(requete || f.type || f.modeAcces || f.porteur || f.etat || f.horsCarte);
  prevenir();
}

function remplirFiltres() {
  const valeurs = valeursDeFiltre(etat.ressources);
  const champs = { filtreType: 'type', filtreModeAcces: 'modeAcces', filtrePorteur: 'porteur', filtreEtat: 'etat' };
  for (const [id, cle] of Object.entries(champs)) {
    const select = $(id);
    for (const v of valeurs[cle]) {
      const option = document.createElement('option');
      option.value = v; option.textContent = v;
      select.appendChild(option);
    }
    select.addEventListener('change', () => { etat.filtres[cle] = select.value; rafraichir(); });
  }
}

function definirFiltre(cle, valeur) {
  etat.filtres[cle] = valeur;
  rafraichir();
}

function toutEffacer() {
  $('champRecherche').value = '';
  for (const id of ['filtreType', 'filtreModeAcces', 'filtrePorteur', 'filtreEtat']) $(id).value = '';
  Object.assign(etat.filtres, { type: '', modeAcces: '', porteur: '', etat: '', horsCarte: false });
  rafraichir();
}

// ─── Fiche ───
function parAdresse(adresse) { return etat.ressources.find((r) => r.adresse === adresse) || null; }

function ouvrirFiche(adresse, { historique = true } = {}) {
  const r = parAdresse(adresse);
  if (!r) return false;
  if (!ficheOuverte) focusAvant = document.activeElement;
  ficheOuverte = adresse;
  $('contenuFiche').innerHTML = htmlFiche(r);
  const titre = $('contenuFiche').querySelector('.fiche-nom');
  if (titre) titre.id = 'titreFiche';
  $('voile').hidden = false;
  $('voile').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('fenetre').focus();
  document.title = `${r.nom} | Cartographie du RSN`;
  if (historique && location.pathname !== `/ressource/${adresse}`) history.pushState({ fiche: adresse }, '', `/ressource/${adresse}`);
  return true;
}

function fermerFiche({ historique = true } = {}) {
  if (!ficheOuverte) return;
  ficheOuverte = null;
  $('voile').hidden = true;
  document.body.style.overflow = '';
  document.title = `${TEXTES.titre} | RSN`;
  if (historique && location.pathname !== '/') history.pushState({}, '', '/');
  if (focusAvant && document.contains(focusAvant)) focusAvant.focus();
}

function adresseDansUrl() {
  const m = /^\/ressource\/([a-z0-9-]+)\/?$/.exec(location.pathname);
  return m ? m[1] : null;
}

function suivreUrl() {
  const adresse = adresseDansUrl();
  if (adresse) {
    if (!ouvrirFiche(adresse, { historique: false })) fermerFiche({ historique: false });
  } else fermerFiche({ historique: false });
}

// ─── Événements ───
document.addEventListener('click', (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  const motCle = ev.target.closest('[data-mot-cle]');
  if (motCle) {
    ev.preventDefault();
    fermerFiche();
    $('champRecherche').value = motCle.dataset.motCle;
    rafraichir();
    $('filtres').scrollIntoView({ block: 'start' });
    return;
  }
  const lien = ev.target.closest('[data-fiche]');
  if (lien && parAdresse(lien.dataset.fiche)) { ev.preventDefault(); ouvrirFiche(lien.dataset.fiche); return; }
  if (ev.target === $('voile')) fermerFiche();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ficheOuverte) fermerFiche(); });
window.addEventListener('popstate', suivreUrl);

function demarrer() {
  $('fermerFiche').addEventListener('click', () => fermerFiche());
  $('effacerFiltres').addEventListener('click', toutEffacer);
  $('lienAccueil').addEventListener('click', (ev) => { ev.preventDefault(); fermerFiche(); toutEffacer(); window.scrollTo(0, 0); });
  let minuterie = null;
  $('champRecherche').addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(rafraichir, 120); });

  fetch('/api/export', { cache: 'no-cache' })
    .then((rep) => { if (!rep.ok) throw new Error(`export ${rep.status}`); return rep.json(); })
    .then((donnees) => {
      etat.ressources = donnees.ressources || [];
      etat.carte = donnees.carte || { cle: '' };
      etat.pret = true;
      construireIndex();
      remplirFiltres();
      const q = new URLSearchParams(location.search).get('q');
      if (q) $('champRecherche').value = q;
      // La page d'une ressource servie par le serveur laisse la place à l'accueil complet.
      $('ficheStatique').hidden = true;
      $('accueil').hidden = false;
      rafraichir();
      suivreUrl();
    })
    .catch((err) => {
      console.error(err);
      $('message').hidden = false;
      $('message').textContent = TEXTES.indisponible;
    });
}

window.Cartographie = { etat, surChangement, ouvrirFiche, fermerFiche, definirFiltre, rafraichir };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
