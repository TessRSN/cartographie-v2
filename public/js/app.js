/**
 * Accueil de la cartographie : chargement des fiches, recherche et suggestions,
 * filtres à choix multiples, bandeau de chiffres, cartes de fiches, fenêtre de
 * fiche et mode clair ou sombre. Interface reprise du bottin des membres.
 * La carte (carte.js) et le graphe (graphe.js) s'abonnent par surChangement().
 */
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const PAR_PAGE = 30;
const FILTRES = { type: 'filtreType', modeAcces: 'filtreModeAcces', porteur: 'filtrePorteur', etat: 'filtreEtat', portee: 'filtrePortee', langue: 'filtreLangue' };

const etat = {
  ressources: [],   // toutes les fiches
  filtrees: [],     // fiches retenues par les filtres seuls
  visibles: [],     // fiches retenues par les filtres et la recherche, dans l'ordre d'affichage
  pourCarte: [],    // les mêmes sans le filtre « En ligne ou hors Québec » : ce que la carte montre
  centree: null,    // ressource choisie par « Voir ses connexions »
  requete: '',
  carte: { cle: '' },
  pret: false,      // les données sont arrivées
  echec: false,     // l'export a échoué
  vue: vueParDefaut(), // 'carte' ou 'connexions'
  filtres: { type: [], modeAcces: [], porteur: [], etat: [], portee: [], langue: [], horsCarte: false },
  page: 1,
  tri: 'propose',
};
// Sur un écran large, la page s'ouvre sur les connexions ; sur un téléphone, sur la carte, plus légère.
function vueParDefaut() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 901px)').matches ? 'connexions' : 'carte';
}
const abonnes = [];
let index = null;          // index de recherche Fuse
let documents = [];        // ce que la recherche lit de chaque fiche
let chiffres = null;       // chiffres du bandeau
let ficheOuverte = null;
let focusAvant = null;
let fermetureEnCours = false;
let connexionsGardees = null;

// motif : 'donnees', 'filtres', 'vue' ou 'theme'.
function surChangement(fn) { abonnes.push(fn); if (etat.pret) fn(etat, 'donnees'); }
function prevenir(motif) { for (const fn of abonnes) { try { fn(etat, motif); } catch (err) { console.error(err); } } }

// ─── Textes ───
// Un élément marqué data-texte="chemin.de.la.cle" reçoit le texte de TEXTES ;
// data-texte-aria, data-texte-titre, data-texte-indice et data-texte-alt remplissent un attribut.
function texte(chemin) {
  const valeur = String(chemin || '').split('.').reduce((o, cle) => (o && o[cle] !== undefined ? o[cle] : undefined), TEXTES);
  return typeof valeur === 'string' ? valeur : null;
}
function poserTextes() {
  const attributs = { texteAria: 'aria-label', texteTitre: 'title', texteIndice: 'placeholder', texteAlt: 'alt' };
  document.querySelectorAll('[data-texte]').forEach((el) => { const t = texte(el.dataset.texte); if (t !== null) el.textContent = t; });
  for (const [donnee, attribut] of Object.entries(attributs)) {
    document.querySelectorAll(`[data-${donnee.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}]`).forEach((el) => {
      const t = texte(el.dataset[donnee]);
      if (t !== null) el.setAttribute(attribut, t);
    });
  }
}

// ─── Mode clair ou sombre ───
// L'icône montre le mode vers lequel on bascule, comme dans le bottin.
function modeSombre() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
function majBoutonTheme() {
  const sombre = modeSombre();
  $('iconeSoleil').classList.toggle('hidden', !sombre);
  $('iconeLune').classList.toggle('hidden', sombre);
  $('boutonTheme').setAttribute('aria-label', sombre ? TEXTES.theme.clair : TEXTES.theme.sombre);
  $('boutonTheme').title = sombre ? TEXTES.theme.clair : TEXTES.theme.sombre;
}
function basculerTheme() {
  const sombre = modeSombre();
  document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
  try { localStorage.setItem('rsn-theme', sombre ? 'light' : 'dark'); } catch (err) { /* stockage refusé : le choix vaut pour cette visite */ }
  majBoutonTheme();
  if (etat.pret) prevenir('theme');
}

// ─── Recherche ───
function construireIndex() {
  documents = etat.ressources.map(documentDeRecherche);
  if (typeof Fuse === 'undefined') { index = null; return; }
  index = new Fuse(documents, {
    includeScore: true, threshold: 0.25, ignoreLocation: true, minMatchCharLength: 2,
    keys: [
      { name: 'nom', weight: 3 }, { name: 'autresNoms', weight: 2 }, { name: 'motsCles', weight: 2 },
      { name: 'porteurs', weight: 1.5 }, { name: 'phrase', weight: 1 }, { name: 'canon', weight: 1 }, { name: 'description', weight: 0.5 },
    ],
  });
}

function ordonner(liste, parPertinence) {
  const nom = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { sensitivity: 'base' });
  if (etat.tri === 'nom') return [...liste].sort(nom);
  if (etat.tri === 'type') {
    const rang = (r) => { const i = Object.keys(CLES_TYPE).indexOf(r.typePrincipal); return i < 0 ? 99 : i; };
    return [...liste].sort((a, b) => rang(a) - rang(b) || nom(a, b));
  }
  return parPertinence ? liste : [...liste].sort(nom);
}

// ─── Menus déroulants à choix multiples (composant du bottin) ───
function fermerMenus() {
  document.querySelectorAll('.ms-panel.open').forEach((panneau) => {
    panneau.classList.remove('open');
    const bouton = panneau.previousElementSibling;
    bouton.classList.remove('open');
    bouton.setAttribute('aria-expanded', 'false');
  });
}

function construireMenu(cle, valeurs) {
  const id = FILTRES[cle];
  const boite = $(id);
  boite.textContent = '';
  const bouton = document.createElement('button');
  bouton.type = 'button'; bouton.className = 'ms-btn';
  bouton.dataset.name = TEXTES.filtres[cle] + ' :';
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-controls', id + 'Panneau');
  bouton.setAttribute('aria-label', TEXTES.filtres[cle]);
  const libelle = document.createElement('span'); libelle.className = 'ms-label'; libelle.textContent = TEXTES.filtres.tous;
  const fleche = document.createElement('span'); fleche.className = 'ms-arrow'; fleche.textContent = '▼'; fleche.setAttribute('aria-hidden', 'true');
  bouton.append(libelle, fleche);
  const panneau = document.createElement('div');
  panneau.className = 'ms-panel'; panneau.id = id + 'Panneau';
  panneau.setAttribute('role', 'group'); panneau.setAttribute('aria-label', TEXTES.filtres[cle]);
  valeurs.forEach(({ valeur, nombre }, i) => {
    const ligne = document.createElement('div'); ligne.className = 'ms-item';
    const case_ = document.createElement('input'); case_.type = 'checkbox'; case_.value = valeur; case_.id = `${id}Choix${i}`;
    const nom = document.createElement('label'); nom.htmlFor = case_.id; nom.textContent = valeur;
    const compte = document.createElement('span'); compte.className = 'ms-item-count'; compte.textContent = nombre;
    ligne.append(case_, nom, compte);
    case_.addEventListener('change', () => {
      etat.filtres[cle] = [...panneau.querySelectorAll('input:checked')].map((c) => c.value);
      majMenu(cle);
      rafraichir();
    });
    // Un clic ailleurs sur la ligne (marge, nombre) coche aussi la case.
    ligne.addEventListener('click', (ev) => { if (ev.target === ligne || ev.target === compte) case_.click(); });
    panneau.appendChild(ligne);
  });
  bouton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const ouvert = panneau.classList.contains('open');
    fermerMenus();
    if (!ouvert) { panneau.classList.add('open'); bouton.classList.add('open'); bouton.setAttribute('aria-expanded', 'true'); }
  });
  // Le menu reste ouvert pendant qu'on coche ; Échap le referme et rend le focus au bouton.
  panneau.addEventListener('click', (ev) => ev.stopPropagation());
  boite.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && panneau.classList.contains('open')) { ev.stopPropagation(); fermerMenus(); bouton.focus(); }
  });
  boite.append(bouton, panneau);
}

// Remet les cases et le libellé du bouton en accord avec etat.filtres.
function majMenu(cle) {
  const boite = $(FILTRES[cle]);
  const bouton = boite.querySelector('.ms-btn');
  if (!bouton) return;
  const choisies = etat.filtres[cle];
  boite.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = choisies.includes(c.value); });
  const libelle = boite.querySelector('.ms-label');
  const ancien = bouton.querySelector('.ms-count');
  if (ancien) ancien.remove();
  const couper = (t, n) => (t.length > n ? t.slice(0, n - 2) + '…' : t);
  if (choisies.length === 0) libelle.textContent = TEXTES.filtres.tous;
  else if (choisies.length === 1) libelle.textContent = couper(choisies[0], 28);
  else {
    libelle.textContent = couper(choisies[0], 20);
    const pastille = document.createElement('span'); pastille.className = 'ms-count'; pastille.textContent = '+' + (choisies.length - 1);
    bouton.insertBefore(pastille, bouton.querySelector('.ms-arrow'));
  }
  bouton.setAttribute('aria-label', choisies.length ? `${TEXTES.filtres[cle]} : ${choisies.join(', ')}` : TEXTES.filtres[cle]);
}

function remplirFiltres() {
  const comptes = comptesDeFiltre(etat.ressources);
  for (const cle of Object.keys(FILTRES)) { construireMenu(cle, comptes[cle]); majMenu(cle); }
}

function definirFiltre(cle, valeur) {
  if (!etat.pret) return;
  etat.filtres[cle] = cle === 'horsCarte' ? !!valeur : enListe(valeur);
  if (FILTRES[cle]) majMenu(cle);
  rafraichir();
}

// Coche ou décoche une valeur d'un filtre (chiffres du bandeau).
function basculerFiltre(cle, valeur) {
  const actuelles = etat.filtres[cle];
  definirFiltre(cle, actuelles.includes(valeur) ? actuelles.filter((v) => v !== valeur) : actuelles.concat([valeur]));
}

function definirRecherche(valeur) {
  $('champRecherche').value = valeur;
  cacherSuggestions();
  rafraichir();
}

function toutEffacer() {
  $('champRecherche').value = '';
  libererCentree({ silencieux: true });
  Object.assign(etat.filtres, { type: [], modeAcces: [], porteur: [], etat: [], portee: [], langue: [], horsCarte: false });
  for (const cle of Object.keys(FILTRES)) majMenu(cle);
  cacherSuggestions();
  rafraichir();
}

// ─── Affichage ───
function rafraichir({ garderPage = false } = {}) {
  const champ = $('champRecherche');
  $('effacerRecherche').classList.toggle('hidden', !champ.value);
  // Tant que les données ne sont pas là (ou si l'export a échoué), rien à filtrer :
  // le message de chargement ou de panne reste en place.
  if (!etat.pret) return;
  etat.requete = champ.value.trim();
  etat.filtrees = filtrer(etat.ressources, etat.filtres);
  // La carte garde ses ronds quand « En ligne ou hors Québec » est actif : elle ignore ce filtre-là.
  const sansHorsCarte = new Set(filtrer(etat.ressources, Object.assign({}, etat.filtres, { horsCarte: false })));
  const trouvees = chercher(documents, etat.requete, index ? (forme) => index.search(forme) : null);
  const parPertinence = motsDeRequete(etat.requete).length > 0;
  etat.pourCarte = ordonner(trouvees.filter((r) => sansHorsCarte.has(r)), parPertinence);
  etat.visibles = etat.filtres.horsCarte ? etat.pourCarte.filter((r) => !surLaCarte(r)) : etat.pourCarte;
  if (!garderPage) etat.page = 1;
  afficherListe();
  afficherCompte();
  afficherSelection();
  afficherPortrait();
  prevenir('filtres');
}

function nombrePages() { return Math.max(1, Math.ceil(etat.visibles.length / PAR_PAGE)); }

function afficherListe() {
  etat.page = Math.min(Math.max(1, etat.page), nombrePages());
  const debut = (etat.page - 1) * PAR_PAGE;
  $('cartes').innerHTML = etat.visibles.slice(debut, debut + PAR_PAGE).map(htmlCarteFiche).join('');
  $('aucunResultat').classList.toggle('hidden', etat.visibles.length > 0);
  $('compteListe').textContent = TEXTES.liste.compte(etat.visibles.length, etat.ressources.length);
  afficherPagination();
}

function afficherPagination() {
  const nav = $('pagination');
  const total = nombrePages();
  nav.textContent = '';
  if (total <= 1) return;
  const bouton = (libelle, page, { actif = false, inactif = false, nom = null } = {}) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'page-btn' + (actif ? ' active' : '');
    b.textContent = libelle; b.disabled = inactif; b.dataset.page = page;
    if (nom) b.setAttribute('aria-label', nom);
    if (actif) b.setAttribute('aria-current', 'page');
    nav.appendChild(b);
  };
  bouton(TEXTES.liste.precedent, etat.page - 1, { inactif: etat.page === 1 });
  const pages = new Set([1, total]);
  for (let i = Math.max(1, etat.page - 2); i <= Math.min(total, etat.page + 2); i++) pages.add(i);
  let precedente = 0;
  for (const p of [...pages].sort((a, b) => a - b)) {
    if (p - precedente > 1) { const s = document.createElement('span'); s.textContent = '…'; s.setAttribute('aria-hidden', 'true'); nav.appendChild(s); }
    bouton(String(p), p, { actif: p === etat.page, nom: TEXTES.liste.page(p) });
    precedente = p;
  }
  bouton(TEXTES.liste.suivant, etat.page + 1, { inactif: etat.page === total });
}

function allerPage(page) {
  if (page < 1 || page > nombrePages() || page === etat.page) return;
  etat.page = page;
  afficherListe();
  $('fiches').scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
}

function mouvementReduit() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function afficherCompte() {
  const compte = $('compte');
  compte.textContent = '';
  const n = document.createElement('strong'); n.textContent = etat.visibles.length;
  compte.append(n, ' ' + TEXTES.affichees(etat.visibles.length));
  $('effacerFiltres').classList.toggle('hidden', !(etat.requete || filtresActifs(etat.filtres)));
}

// ─── Sélection en cours ───
// Tout ce qui restreint l'affichage : la recherche (ou un sujet), chaque valeur de
// filtre (dont un porteur choisi sur la carte), « En ligne ou hors Québec », et la
// ressource centrée par « Voir ses connexions ». Chaque élément sait se retirer.
function elementsSelection() {
  const elements = [];
  if (etat.requete) elements.push({ libelle: `${TEXTES.selection.recherche} : ${etat.requete}`, retirer: () => definirRecherche('') });
  for (const cle of Object.keys(FILTRES)) {
    for (const valeur of etat.filtres[cle]) {
      const court = cle === 'porteur' ? nomCourt(valeur) : cle === 'type' ? (TEXTES.typesCourts[cleType(valeur)] || valeur) : valeur;
      elements.push({ libelle: `${TEXTES.filtres[cle]} : ${court}`, titre: valeur, retirer: () => basculerFiltre(cle, valeur) });
    }
  }
  if (etat.filtres.horsCarte) elements.push({ libelle: TEXTES.filtres.horsCarte, retirer: () => definirFiltre('horsCarte', false) });
  const centree = etat.vue === 'connexions' && etat.centree ? parAdresse(etat.centree) : null;
  if (centree) elements.push({ libelle: `${TEXTES.selection.connexions} : ${centree.nom}`, retirer: () => libererCentree() });
  return elements;
}

// Les étiquettes sont affichées à deux endroits toujours visibles : sur la carte
// ou le graphe, et au-dessus de la liste. Construites par le DOM (textContent).
function afficherSelection() {
  const elements = etat.pret ? elementsSelection() : [];
  document.querySelectorAll('.js-selection').forEach((boite) => {
    boite.textContent = '';
    boite.classList.toggle('hidden', elements.length === 0);
    for (const element of elements) {
      const etiquette = document.createElement('span'); etiquette.className = 'stat-chip';
      if (element.titre) etiquette.title = element.titre;
      const nom = document.createElement('span'); nom.textContent = element.libelle;
      const croix = document.createElement('button');
      croix.type = 'button'; croix.textContent = '×';
      croix.setAttribute('aria-label', `${TEXTES.filtres.retirer} : ${element.libelle}`);
      croix.addEventListener('click', element.retirer);
      etiquette.append(nom, croix);
      boite.appendChild(etiquette);
    }
    if (elements.length) {
      const tout = document.createElement('button');
      tout.type = 'button'; tout.className = 'reset-fort'; tout.textContent = TEXTES.filtres.effacer;
      tout.addEventListener('click', toutEffacer);
      boite.appendChild(tout);
    }
  });
}

// Oublie la ressource centrée dans le graphe et rend sa vue d'ensemble au graphe.
function libererCentree({ silencieux = false } = {}) {
  if (!etat.centree) return;
  etat.centree = null;
  if (typeof api.libererGraphe === 'function') api.libererGraphe();
  if (!silencieux) afficherSelection();
}

// ─── Bandeau « Portrait de la cartographie » ───
function jeton(genre, valeur, nombre, libelle, actif, titre) {
  return `<button type="button" class="stat-token" data-jeton="${genre}" data-valeur="${echapper(valeur)}" aria-pressed="${actif ? 'true' : 'false'}"${titre ? ` title="${echapper(titre)}"` : ''}><strong>${Number(nombre)}</strong><span>${echapper(libelle)}</span></button>`;
}

function afficherPortrait() {
  const bandeau = $('portrait');
  if (!chiffres || !etat.ressources.length) return;
  bandeau.hidden = false;
  const T = TEXTES.portrait;
  $('resumePortrait').innerHTML = `<strong>${chiffres.ressources}</strong> ${echapper(T.ressources(chiffres.ressources))} · <strong>${chiffres.porteurs}</strong> ${echapper(T.porteurs(chiffres.porteurs))}`;
  const total = chiffres.types.reduce((s, t) => s + t.nombre, 0) || 1;
  $('barreTypes').innerHTML = chiffres.types.map((t) => `<div class="seg type-${t.cle}" style="flex:${t.nombre} 1 0"></div>`).join('');
  $('legendeTypes').innerHTML = chiffres.types.map((t) => {
    const contenu = `<span class="map-legend-dot"></span><span class="nom">${echapper(TEXTES.typesCourts[t.cle])}</span> <strong>${t.nombre}</strong> · ${echapper(T.pourcent(100 * t.nombre / total))}`;
    return t.type
      ? `<button type="button" class="type-${t.cle}" data-jeton="type" data-valeur="${echapper(t.type)}" title="${echapper(t.type)}" aria-pressed="${etat.filtres.type.includes(t.type) ? 'true' : 'false'}">${contenu}</button>`
      : `<span class="type-${t.cle}">${contenu}</span>`;
  }).join('');
  // Panneau en verre : les mêmes types, en liste, avec leur couleur et leur nombre.
  const choisis = etat.filtres.type.length > 0;
  $('listeTypes').innerHTML = chiffres.types.filter((t) => t.type).map((t) => {
    const actif = etat.filtres.type.includes(t.type);
    return `<button type="button" class="type-${t.cle}${choisis && !actif ? ' estompe' : ''}" data-jeton="type" data-valeur="${echapper(t.type)}" title="${echapper(t.type)}" aria-pressed="${actif ? 'true' : 'false'}"><span class="map-legend-dot"></span><span class="nom">${echapper(TEXTES.typesCourts[t.cle])}${TEXTES.typesAides[t.cle] ? `<small>${echapper(TEXTES.typesAides[t.cle])}</small>` : ''}</span><strong>${t.nombre}</strong></button>`;
  }).join('');
  $('panneauTypes').classList.remove('hidden');
  const requetePliee = plier(etat.requete);
  $('sujetsPrincipaux').innerHTML = chiffres.sujets.map((s) => jeton('sujet', s.sujet, s.nombre, s.sujet, plier(s.sujet) === requetePliee)).join('');
  $('porteursPrincipaux').innerHTML = chiffres.porteursPrincipaux.map((p) => jeton('porteur', p.nom, p.nombre, nomCourt(p.nom), etat.filtres.porteur.includes(p.nom), p.nom)).join('');
  const ouvert = !bandeau.classList.contains('closed');
  $('libelleBascule').textContent = ouvert ? T.replier : T.deplier;
  $('basculePortrait').setAttribute('aria-expanded', ouvert ? 'true' : 'false');
}

// ─── Suggestions pendant la saisie (composant du bottin) ───
let propositions = [];
let propositionActive = -1;

function cacherSuggestions() {
  $('listeSuggestions').classList.add('hidden');
  $('champRecherche').setAttribute('aria-expanded', 'false');
  $('champRecherche').removeAttribute('aria-activedescendant');
  propositionActive = -1;
}

function afficherSuggestions() {
  const boite = $('listeSuggestions');
  propositions = etat.pret ? suggestions(etat.ressources, $('champRecherche').value) : [];
  propositionActive = -1;
  if (!propositions.length) { boite.textContent = ''; cacherSuggestions(); return; }
  const titres = { sujet: TEXTES.suggestions.sujets, porteur: TEXTES.suggestions.porteurs, ressource: TEXTES.suggestions.ressources };
  let html = '';
  let dernier = '';
  propositions.forEach((p, i) => {
    if (p.genre !== dernier) { html += `<div class="ss-group" role="presentation">${echapper(titres[p.genre])}</div>`; dernier = p.genre; }
    const droite = p.genre === 'ressource' ? echapper(p.detail || '') : echapper(TEXTES.compte(p.nombre));
    html += `<button type="button" class="ss-item" role="option" id="suggestion${i}" tabindex="-1" aria-selected="false" data-suggestion="${i}"><span>${echapper(p.libelle)}</span><small>${droite}</small></button>`;
  });
  boite.innerHTML = html;
  boite.classList.remove('hidden');
  $('champRecherche').setAttribute('aria-expanded', 'true');
}

// Un sujet lance la recherche sur ce sujet ; un porteur pose le filtre ; une ressource ouvre sa fiche.
function choisirSuggestion(i) {
  const p = propositions[i];
  if (!p) return;
  cacherSuggestions();
  if (p.genre === 'ressource') { ouvrirFiche(p.valeur); return; }
  if (p.genre === 'sujet') { definirRecherche(p.valeur); return; }
  $('champRecherche').value = '';
  if (!etat.filtres.porteur.includes(p.valeur)) etat.filtres.porteur = etat.filtres.porteur.concat([p.valeur]);
  majMenu('porteur');
  rafraichir();
}

function brancherRecherche() {
  const champ = $('champRecherche');
  const boite = $('listeSuggestions');
  let minuterie = null;
  champ.addEventListener('input', () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(rafraichir, 200);
    afficherSuggestions();
  });
  champ.addEventListener('focus', () => { if (champ.value) afficherSuggestions(); });
  champ.addEventListener('blur', () => { setTimeout(cacherSuggestions, 180); });
  champ.addEventListener('keydown', (ev) => {
    if (boite.classList.contains('hidden')) return;
    const lignes = boite.querySelectorAll('.ss-item');
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const pas = ev.key === 'ArrowDown' ? 1 : -1;
      propositionActive = propositionActive < 0 ? (pas > 0 ? 0 : lignes.length - 1) : (propositionActive + pas + lignes.length) % lignes.length;
      lignes.forEach((el, k) => { el.classList.toggle('active', k === propositionActive); el.setAttribute('aria-selected', k === propositionActive ? 'true' : 'false'); });
      if (lignes[propositionActive]) {
        lignes[propositionActive].scrollIntoView({ block: 'nearest' });
        champ.setAttribute('aria-activedescendant', lignes[propositionActive].id);
      }
    } else if (ev.key === 'Enter' && propositionActive >= 0) {
      ev.preventDefault(); choisirSuggestion(propositionActive);
    } else if (ev.key === 'Enter') {
      cacherSuggestions();
    } else if (ev.key === 'Escape') {
      cacherSuggestions();
    }
  });
  // mousedown plutôt que click : le champ perd le focus avant le clic et la liste se fermerait.
  boite.addEventListener('mousedown', (ev) => {
    const b = ev.target.closest('[data-suggestion]');
    if (b) { ev.preventDefault(); choisirSuggestion(Number(b.dataset.suggestion)); }
  });
  $('effacerRecherche').addEventListener('click', () => { definirRecherche(''); champ.focus(); });
}

// ─── Vue du haut : carte ou connexions ───
function definirVue(vue) {
  const nouvelle = vue === 'connexions' ? 'connexions' : 'carte';
  if (nouvelle === etat.vue) return;
  etat.vue = nouvelle;
  majSelecteurVue();
  afficherSelection();
  if (etat.pret) prevenir('vue');
}
function majSelecteurVue() {
  document.querySelectorAll('.view-switch [data-vue]').forEach((b) => {
    const actif = b.dataset.vue === etat.vue;
    b.classList.toggle('active', actif);
    b.setAttribute('aria-pressed', actif ? 'true' : 'false');
  });
  // La carte reste affichée (vide) tant que les données ne sont pas là ; ensuite chaque vue gère sa zone.
  $('zoneCarte').classList.toggle('hidden', etat.vue !== 'carte');
}

// Connexions calculées une fois avec les réglages par défaut (fiche, « Ressources proches »).
function connexions() {
  if (!connexionsGardees || connexionsGardees.source !== etat.ressources) {
    connexionsGardees = { source: etat.ressources, resultat: calculerConnexions(etat.ressources) };
  }
  return connexionsGardees.resultat;
}

// ─── Fiche ───
function parAdresse(adresse) { return etat.ressources.find((r) => r.adresse === adresse) || null; }
function cheminFiche(adresse) { return `/ressource/${adresse}`; }
function profondeur() { return (history.state && history.state.profondeur) || 0; }

function forceLien(poids) {
  const F = TEXTES.fiche.force;
  if (poids >= 6) return { points: '●●●', nom: F.forte };
  if (poids >= 3.5) return { points: '●●○', nom: F.moyenne };
  return { points: '●○○', nom: F.faible };
}

// Bloc « Ressources proches » : les cinq liens les plus forts, avec les sujets communs.
function blocProches(r) {
  const voisines = connexions().liens
    .filter((l) => l.a === r.adresse || l.b === r.adresse)
    .sort((x, y) => y.poids - x.poids).slice(0, 5)
    .map((l) => ({ lien: l, autre: parAdresse(l.a === r.adresse ? l.b : l.a) }))
    .filter((v) => v.autre);
  if (!voisines.length) return null;
  const T = TEXTES.fiche;
  const bloc = document.createElement('section'); bloc.className = 'proches';
  const titre = document.createElement('h3'); titre.textContent = T.proches;
  const liste = document.createElement('ul');
  for (const { lien, autre } of voisines) {
    const li = document.createElement('li'); li.className = 'proche';
    const ouvrir = document.createElement('button');
    ouvrir.type = 'button'; ouvrir.className = 'proche-ouvrir'; ouvrir.dataset.fiche = autre.adresse;
    const nom = document.createElement('strong'); nom.textContent = autre.nom;
    const detail = document.createElement('span'); detail.className = 'proche-detail';
    const porteur = document.createElement('span'); porteur.textContent = ((autre.porteurs || [])[0] || {}).nom || '';
    const force = forceLien(lien.poids);
    const mesure = document.createElement('span'); mesure.className = 'proche-force';
    mesure.textContent = `${force.points} ${T.sujetsCommuns(lien.motsCommuns.length)}`;
    mesure.title = force.nom;
    const pourLecteur = document.createElement('span'); pourLecteur.className = 'visually-hidden'; pourLecteur.textContent = ` (${force.nom})`;
    detail.append(porteur, mesure, pourLecteur);
    ouvrir.append(nom, detail);
    const sujets = document.createElement('details');
    const resume = document.createElement('summary'); resume.textContent = T.voirSujetsCommuns;
    const puces = document.createElement('div'); puces.className = 'card-chips-row';
    for (const mot of lien.motsCommuns) { const p = document.createElement('span'); p.className = 'axe-chip'; p.textContent = mot; puces.appendChild(p); }
    sujets.append(resume, puces);
    li.append(ouvrir, sujets);
    liste.appendChild(li);
  }
  bloc.append(titre, liste);
  return bloc;
}

// Actions de la fiche : voir ses connexions, copier le lien direct.
function blocActions(r) {
  const T = TEXTES.fiche;
  const rangee = document.createElement('div'); rangee.className = 'modal-actions';
  const graphe = document.createElement('button');
  graphe.type = 'button'; graphe.className = 'primary'; graphe.dataset.graphe = r.adresse;
  graphe.innerHTML = ICONE_GRAPHE + '<span></span>';
  graphe.querySelector('span').textContent = TEXTES.liste.voirConnexions;
  const copier = document.createElement('button');
  copier.type = 'button'; copier.textContent = T.copierLien;
  copier.addEventListener('click', () => {
    const adresse = location.origin + cheminFiche(r.adresse);
    const fait = () => { copier.textContent = T.lienCopie; setTimeout(() => { copier.textContent = T.copierLien; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(adresse).then(fait, () => { window.prompt(T.copierLien, adresse); });
    else window.prompt(T.copierLien, adresse);
  });
  rangee.append(graphe, copier);
  return rangee;
}

function ouvrirFiche(adresse, { historique = true } = {}) {
  const r = parAdresse(adresse);
  if (!r) return false;
  const fenetre = $('fenetreFiche');
  if (!ficheOuverte) focusAvant = document.activeElement;
  ficheOuverte = adresse;
  const contenu = $('contenuFiche');
  contenu.innerHTML = htmlFiche(r);
  const titre = contenu.querySelector('.fiche-nom');
  if (titre) titre.id = 'titreFiche';
  const article = contenu.querySelector('.fiche') || contenu;
  article.appendChild(blocActions(r));
  const proches = blocProches(r);
  if (proches) article.appendChild(proches);
  // showModal() : le reste de la page devient inerte, le focus reste dans la fenêtre.
  if (!fenetre.open) {
    if (typeof fenetre.showModal === 'function') fenetre.showModal(); else fenetre.setAttribute('open', '');
  }
  fenetre.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('fermerFiche').focus();
  document.title = TEXTES.titreOnglet(r.nom);
  // Chaque fiche ouverte depuis la page ajoute une entrée : « Précédent » revient à la fiche d'avant, puis à l'accueil.
  if (historique && location.pathname !== cheminFiche(adresse)) {
    history.pushState({ fiche: adresse, profondeur: profondeur() + 1 }, '', cheminFiche(adresse));
  }
  return true;
}

// Referme la fenêtre sans toucher à l'historique.
function masquerFiche() {
  const fenetre = $('fenetreFiche');
  const etaitOuverte = !!ficheOuverte;
  ficheOuverte = null;
  if (fenetre.open) { if (typeof fenetre.close === 'function') fenetre.close(); else fenetre.removeAttribute('open'); }
  document.body.style.overflow = '';
  document.title = `${TEXTES.titre} | RSN`;
  if (etaitOuverte && focusAvant && document.contains(focusAvant)) focusAvant.focus();
  focusAvant = null;
}

// Ferme la fiche et ramène l'adresse à l'accueil. Une fiche ouverte depuis
// l'accueil : retour en arrière, sans ajouter d'entrée. Une arrivée directe sur
// /ressource/<adresse> : l'entrée est remplacée par l'accueil.
function fermerFiche() {
  if (!ficheOuverte) return;
  const pas = profondeur();
  masquerFiche();
  if (!adresseDansUrl()) return;
  if (pas > 0) { fermetureEnCours = true; history.go(-pas); }
  else history.replaceState({}, '', '/');
}

function adresseDansUrl() {
  const m = /^\/ressource\/([a-z0-9-]+)\/?$/.exec(location.pathname);
  return m ? m[1] : null;
}

// Met la page en accord avec l'adresse (bouton Précédent ou Suivant, arrivée directe).
function suivreUrl() {
  const adresse = adresseDansUrl();
  const fermeture = fermetureEnCours;
  fermetureEnCours = false;
  if (!etat.pret) return;
  if (adresse && fermeture) {
    // On vient de fermer une fiche après une arrivée directe sur une autre : retour à l'accueil.
    history.replaceState({}, '', '/');
    masquerFiche();
  } else if (adresse) {
    if (!ouvrirFiche(adresse, { historique: false })) {
      // Adresse inconnue : l'accueil, et l'adresse est corrigée.
      history.replaceState({}, '', '/');
      masquerFiche();
    }
  } else masquerFiche();
}

// « Voir ses connexions » : ferme la fiche, passe au graphe et y centre la ressource.
function montrerConnexions(adresse) {
  if (!parAdresse(adresse)) return;
  fermerFiche();
  etat.centree = adresse;
  definirVue('connexions');
  afficherSelection();
  $('vueHaut').scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
  if (typeof api.centrerDansGraphe === 'function') api.centrerDansGraphe(adresse);
}

// ─── Événements ───
function clicSimple(ev) { return !(ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey); }

document.addEventListener('click', (ev) => {
  fermerMenus();
  if (!clicSimple(ev)) return;
  // Avant l'arrivée des données, les liens gardent leur comportement de lien ordinaire.
  if (!etat.pret) return;
  const cible = ev.target.closest('[data-vue], [data-mot-cle], [data-fiche], [data-graphe], [data-jeton], [data-porteur], [data-page]');
  if (!cible) return;
  if (cible.dataset.vue) { definirVue(cible.dataset.vue); return; }
  if (cible.dataset.motCle !== undefined) {
    ev.preventDefault();
    fermerFiche();
    definirRecherche(cible.dataset.motCle);
    $('fiches').scrollIntoView({ block: 'start' });
    return;
  }
  if (cible.dataset.graphe) { montrerConnexions(cible.dataset.graphe); return; }
  if (cible.dataset.fiche) {
    if (parAdresse(cible.dataset.fiche)) { ev.preventDefault(); ouvrirFiche(cible.dataset.fiche); }
    return;
  }
  if (cible.dataset.jeton) {
    const valeur = cible.dataset.valeur;
    if (cible.dataset.jeton === 'sujet') definirRecherche(plier(valeur) === plier(etat.requete) ? '' : valeur);
    else basculerFiltre(cible.dataset.jeton, valeur);
    return;
  }
  // « Voir les fiches de ce porteur », dans la fenêtre d'un lieu de la carte.
  if (cible.dataset.porteur) {
    definirFiltre('porteur', [cible.dataset.porteur]);
    $('fiches').scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if (cible.dataset.page) allerPage(Number(cible.dataset.page));
});
window.addEventListener('popstate', suivreUrl);

function brancherFenetres() {
  const fenetre = $('fenetreFiche');
  $('fermerFiche').addEventListener('click', fermerFiche);
  // Échap : le navigateur demande la fermeture ; on la fait nous-mêmes pour remettre l'adresse.
  fenetre.addEventListener('cancel', (ev) => { ev.preventDefault(); fermerFiche(); });
  // Si le navigateur ferme tout de même la fenêtre (Échap répété), l'adresse et le focus suivent.
  fenetre.addEventListener('close', () => { if (ficheOuverte) fermerFiche(); });
  // Un clic sur le voile, hors de la fenêtre, la ferme.
  for (const f of [fenetre, $('fenetreAide')]) {
    f.addEventListener('click', (ev) => {
      if (ev.target !== f) return;
      const cadre = f.getBoundingClientRect();
      const dedans = ev.clientX >= cadre.left && ev.clientX <= cadre.right && ev.clientY >= cadre.top && ev.clientY <= cadre.bottom;
      if (dedans) return;
      if (f === fenetre) fermerFiche(); else f.close();
    });
  }
  $('fermerAide').addEventListener('click', () => $('fenetreAide').close());
}

function brancherPortrait() {
  const bandeau = $('portrait');
  try { if (localStorage.getItem('rsn-carto-portrait-replie') === '1') bandeau.classList.add('closed'); } catch (err) { /* sans mémoire : déplié */ }
  $('basculePortrait').addEventListener('click', () => {
    bandeau.classList.toggle('closed');
    try { localStorage.setItem('rsn-carto-portrait-replie', bandeau.classList.contains('closed') ? '1' : '0'); } catch (err) { /* idem */ }
    afficherPortrait();
  });
  $('triListe').addEventListener('change', () => { etat.tri = $('triListe').value; rafraichir(); });
}

function panne() {
  etat.echec = true;
  const message = $('texteChargement');
  message.className = 'panne';
  message.textContent = TEXTES.indisponible;
  $('etatChargement').classList.remove('hidden');
}

function demarrer() {
  poserTextes();
  majBoutonTheme();
  majSelecteurVue();
  $('boutonTheme').addEventListener('click', basculerTheme);
  $('effacerFiltres').addEventListener('click', toutEffacer);
  // Logo : retour à l'accueil sans recharger. Sans les données, le lien reste un lien ordinaire.
  $('lienAccueil').addEventListener('click', (ev) => {
    if (!etat.pret || !clicSimple(ev)) return;
    ev.preventDefault();
    fermerFiche();
    etat.tri = 'propose'; $('triListe').value = 'propose';
    definirVue(vueParDefaut());
    toutEffacer();
    window.scrollTo({ top: 0, behavior: mouvementReduit() ? 'auto' : 'smooth' });
  });
  brancherRecherche();
  brancherFenetres();
  brancherPortrait();

  fetch('/api/export', { cache: 'no-cache' })
    .then((rep) => { if (!rep.ok) throw new Error(`export ${rep.status}`); return rep.json(); })
    .then((donnees) => {
      etat.ressources = donnees.ressources || [];
      etat.carte = donnees.carte || { cle: '' };
      construireIndex();
      chiffres = statistiquesBandeau(etat.ressources, 6);
      etat.pret = true;
      remplirFiltres();
      const q = new URLSearchParams(location.search).get('q');
      if (q) $('champRecherche').value = q;
      // La page d'une ressource servie par le serveur laisse la place à l'accueil complet.
      $('ficheStatique').hidden = true;
      $('accueil').hidden = false;
      $('etatChargement').classList.add('hidden');
      rafraichir();
      suivreUrl();
    })
    .catch((err) => {
      console.error(err);
      panne();
    });
}

const api = { etat, surChangement, ouvrirFiche, fermerFiche, definirFiltre, basculerFiltre, definirVue, rafraichir, connexions, modeSombre, mouvementReduit, centrerDansGraphe: null, libererGraphe: null };
window.Cartographie = api;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
