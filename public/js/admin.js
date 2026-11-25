/**
 * Page /admin : le panneau d'administration de la cartographie. Lot 1 : accueil et propositions.
 * Lot 2 : ressources (tableau des fiches, modification, historique des versions, export).
 * Lot 3 : porteurs (colonnes, volet avec la carte du site, fusion) et qualité des données.
 * Lot 4a : équipe (accès, rôles, résumé hebdomadaire, journal) ; une personne en Approbation propose
 * ses modifications de fiches, que l'Administration approuve.
 * Lot 4b : courriels (mode d'essai, texte des six courriels, aperçu, essai à soi-même).
 * On y entre par un lien reçu par courriel (?jeton=…), qui ouvre une session de sept jours.
 * La structure, les classes et les fonctions de rendu viennent de la maquette validée ; les données
 * viennent de /api/admin. Le rôle est celui de la personne connectée : l'affichage masque ce qu'il
 * ne permet pas, et le serveur le vérifie de son côté à chaque geste.
 * Tout texte venu des données passe par echapper() ; aucune adresse venue des données ne va dans un lien.
 */
(function () {
'use strict';

const T = TEXTES.panneau;
const TC = TEXTES.contribuer;
const e = echapper;
const { CHAMPS, estVide, egales, departPanneau, correctionsPanneau } = window.Champs;
const { comparerTextes, comparerListes } = window.Comparaison;
const { reconstituer } = window.Versions;
const PAR_CLE = Object.fromEntries(CHAMPS.map((c) => [c.cle, c]));
const $ = (selecteur, racine) => (racine || document).querySelector(selecteur);

const ETATS = ['attente', 'verification', 'approuvee', 'refusee'];
const OUVERTS = ['attente', 'verification'];
const ROUTES = ['accueil', 'propositions', 'ressources', 'porteurs', 'qualite', 'equipe', 'courriels'];
const TYPES = ['jeu', 'catalogue', 'plateforme', 'logiciel', 'service'];
const RELATIONS = ['faitPartieDe', 'reposeSur', 'donneAccesA', 'remplace'];
// Ce qu'il faut compléter pour une fiche que la personne a laissée à l'équipe.
const A_COMPLETER_RSN = ['typePrincipal', 'phrase', 'lien', 'porteurs'];

const etat = {
  moi: null,            // { nom, courriel, role, permis: { decider, administrer } }
  accueil: null,        // dernière lecture de l'accueil
  liste: null,          // dernière lecture des propositions
  nouvelles: null,      // compte pour la pastille de la barre latérale
  filtres: { q: '', genre: '', type: '', affichage: 'colonnes', anciennes: false },
  f: null,              // la fenêtre d'une proposition, quand elle est ouverte (voir fenetreNeuve)
  fiches: null,         // dernière lecture du tableau des ressources
  historique: true,     // faux si l'historique des versions n'a pas pu être lu
  filtresR: { q: '', type: '', statut: '' },
  r: null,              // la fenêtre d'une fiche, quand elle est ouverte (voir ficheNeuve)
  csv: null,            // la fenêtre d'export, quand elle est ouverte : { toutes }
  porteurs: null,       // dernière lecture des porteurs
  cleCarte: '',         // la clé du fond de carte du site, donnée avec les porteurs
  vueP: 'colonnes',     // les porteurs en colonnes ou en liste
  rechP: '',            // la recherche dans les porteurs
  o: null,              // le volet d'un porteur, quand il est ouvert (voir voletNeuf)
  points: null,         // dernière lecture de la qualité des données
  compteurs: null,      // pastilles de la barre latérale : { points, porteursAPlacer }
  q: { confirmation: null, enCours: null, filtre: '', rech: '' }, // écran Qualité : la fusion à confirmer, le geste en cours, le filtre, la recherche
  equipe: null,         // dernière lecture de l'équipe : { personnes, resume, journal }
  eq: equipeNeuve(),    // écran Équipe : le geste en cours, la personne à retirer, l'invitation en cours d'écriture
  courriels: null,      // dernière lecture de l'écran Courriels : { reglages, essai, service, courriels }
  co: courrielsNeufs(), // écran Courriels : le courriel choisi, les textes en cours d'écriture, le geste en cours, la confirmation
};
function equipeNeuve() { return { enCours: null, confirmation: null, invitation: { courriel: '', nom: '', role: 'approbation' }, erreurs: {} }; }
// champ : le dernier champ de l'éditeur où était le curseur, pour y insérer un repère.
function courrielsNeufs() { return { choisi: 'lien', brouillons: {}, erreurs: {}, enCours: null, confirmation: null, champ: 'mBody' }; }
// Une seule fenêtre à la fois : une proposition, une fiche, l'export ou le volet d'un porteur.
const fenetreOuverte = () => !!(etat.f || etat.r || etat.csv || etat.o);

// ─── Appels au serveur ───
async function appel(action, { query = {}, corps } = {}) {
  const adresse = `/api/admin?${new URLSearchParams({ action, ...query })}`;
  try {
    const reponse = await fetch(adresse, corps === undefined
      ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const donnees = await reponse.json().catch(() => ({}));
    return { code: reponse.status, ok: reponse.ok, donnees };
  } catch (err) {
    return { code: 0, ok: false, donnees: {} };
  }
}

// ─── Outils ───
const peut = () => !!(etat.moi && etat.moi.permis && etat.moi.permis.decider);
// L'Administration : modifier une fiche directement, ajouter, écarter, republier, rétablir, tenir l'équipe.
const administre = () => !!(etat.moi && etat.moi.permis && etat.moi.permis.administrer);
// Une modification de l'équipe : faite dans le panneau par une personne en Approbation. Seule l'Administration la tranche.
const deLEquipe = (p) => p.genre === 'equipe';
const viseUneFiche = (p) => p.genre === 'modification' || deLEquipe(p);
const peutTrancher = (p) => peut() && (!deLEquipe(p) || administre());
const ouverte = (p) => OUVERTS.includes(p.statut);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const plier = (texte) => String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cloner = (v) => (Array.isArray(v) ? v.slice() : v);
const estListe = (cle) => ['listeOuverte', 'choixMultiples', 'fiches'].includes(PAR_CLE[cle].saisie);
const libelle = (cle) => ((T.champs[cle] || TC.champs[cle] || {}).libelle) || cle;
const VIDE = `<span class="muted">${e(T.vide)}</span>`;

// Le jour, au Québec, d'un moment donné par le serveur.
function jour(iso) {
  if (!iso) return '';
  if (!/T/.test(iso)) return dateLongue(iso);
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return '';
  try {
    return dateLongue(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment));
  } catch (err) { return dateLongue(iso); }
}
// Le jour et l'heure, pour l'activité récente.
function jourEtHeure(iso) {
  const j = jour(iso);
  const moment = new Date(iso);
  if (!j || !/T/.test(String(iso)) || Number.isNaN(moment.getTime())) return j;
  try {
    const parties = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(moment);
    const de = (sorte) => (parties.find((x) => x.type === sorte) || {}).value || '';
    return T.aHeure(j.replace(/ \d{4}$/, ''), Number(de('hour')), de('minute'));
  } catch (err) { return j; }
}

let minuterieMessage;
function message(texte) {
  const zone = $('#toast');
  zone.textContent = texte; zone.hidden = false;
  clearTimeout(minuterieMessage);
  minuterieMessage = setTimeout(() => { zone.hidden = true; }, 5200);
}

const ICONES = {
  accueil: '<path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  propositions: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h4.5l1 2.5h5l1-2.5H20"/>',
  ressources: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  porteurs: '<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>',
  qualite: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  equipe: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.3c2.1.8 3.5 2.9 3.5 5.7"/>',
  courriels: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7.5 8.5 6 8.5-6"/>',
  favorable: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
  defavorable: '<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z"/>',
};
const icone = (nom) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;
const classeAvis = (sens) => (sens === 'favorable' ? 'v-pour' : 'v-contre');

const option = (valeur, courante, nom) => `<option value="${e(valeur)}"${valeur === courante ? ' selected' : ''}>${e(nom || valeur)}</option>`;
const pastilleGenre = (genre) => `<span class="pill ${{ nouvelle: 'p-ok', modification: 'p-info', rsn: 'p-warn', equipe: 'p-mute' }[genre] || 'p-mute'}">${e(T.genres[genre] || '')}</span>`;
const pastilleEtat = (statut) => `<span class="pill ${{ attente: 'p-warn', verification: 'p-info', approuvee: 'p-ok', refusee: 'p-bad' }[statut] || 'p-mute'}">${e(T.etats[statut] || '')}</span>`;
function pastilleType(type) {
  if (!type) return `<span class="pill p-mute">${e(T.typeAChoisir)}</span>`;
  const cle = cleType(type);
  return `<span class="pill tp t-${cle}">${e(cle === 'autre' ? type : TEXTES.typesCourts[cle])}</span>`;
}
const route = () => { const h = location.hash.replace('#', ''); return ROUTES.includes(h) ? h : 'accueil'; };

// ─── Bandeau et barre latérale ───
function dessinerBandeau() {
  $('#marqueReseau').textContent = TEXTES.reseau;
  $('#marquePanneau').textContent = T.sousTitre;
  const moi = etat.moi;
  $('#quiNom').textContent = moi ? (moi.nom || moi.courriel) : '';
  $('#quiRole').textContent = moi ? `· ${T.roles[moi.role] || T.roles.lecture}` : '';
  $('#deconnexion').textContent = T.deconnexion;
  $('#deconnexion').hidden = !moi;
  libelleTheme();
}
function dessinerNav() {
  const ici = route();
  const c = etat.compteurs || {};
  const pastilles = { propositions: etat.nouvelles, porteurs: c.porteursAPlacer, qualite: c.points };
  $('#nav').innerHTML = ROUTES.map((r) => `<a href="#${r}"${r === ici ? ' aria-current="page"' : ''}>${icone(r)}<span>${e(T.routes[r])}</span>${pastilles[r] ? `<span class="count">${Number(pastilles[r])}</span>` : ''}</a>`).join('');
}
function montrerCoque(avecNav) {
  $('#coque').classList.toggle('seule', !avecNav);
  $('#nav').hidden = !avecNav;
}

// ─── Entrée ───
function afficherEntree(avertissement) {
  etat.moi = null; etat.accueil = null; etat.liste = null; etat.nouvelles = null; etat.f = null;
  etat.fiches = null; etat.r = null; etat.csv = null;
  etat.porteurs = null; etat.o = null; etat.points = null; etat.compteurs = null; etat.q = { confirmation: null, enCours: null, filtre: '', rech: '' };
  etat.equipe = null; etat.eq = equipeNeuve(); etat.courriels = null; etat.co = courrielsNeufs();
  dessinerBandeau(); montrerCoque(false); dessinerFenetre();
  $('#main').innerHTML = `<div class="card entree">
    <h1>${e(T.titre)}</h1>
    ${avertissement ? `<div class="note warn">${e(avertissement)}</div>` : ''}
    <p class="muted">${e(T.entreeIntro)}</p>
    <form id="demandeLien" novalidate>
      <label class="f" for="courriel">${e(T.courriel)}<input type="email" id="courriel" autocomplete="email" maxlength="254" required></label>
      <p class="err" id="erreurCourriel" role="alert"></p>
      <div class="piege" aria-hidden="true"><label>Site <input type="text" id="site" tabindex="-1" autocomplete="off"></label></div>
      <div class="row"><button type="submit" class="btn primary">${e(T.recevoir)}</button></div>
    </form></div>`;
}

async function demanderLien(formulaire) {
  const courriel = $('#courriel', formulaire).value.trim();
  const erreur = $('#erreurCourriel', formulaire);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) { erreur.textContent = T.courrielInvalide; return; }
  const bouton = $('button[type="submit"]', formulaire);
  bouton.disabled = true;
  let ok = false;
  try {
    const reponse = await fetch('/api/lien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courriel, but: 'panneau', site: $('#site', formulaire).value }) });
    ok = reponse.ok;
  } catch (err) { ok = false; }
  if (!ok) { bouton.disabled = false; erreur.textContent = T.indisponible; return; }
  $('#main').innerHTML = `<div class="card entree"><h1>${e(T.titre)}</h1><div class="note info" role="status">${e(T.lienEnvoye)}</div></div>`;
}

function afficherPanne() {
  $('#main').innerHTML = `<div class="card"><p role="alert">${e(T.indisponible)}</p><div class="row"><button type="button" class="btn primary" data-act="reessayer">${e(T.reessayer)}</button></div></div>`;
}

// ─── Accueil ───
function texteActivite(a) {
  const objet = (T.activite.objets[a.genre] || T.activite.objets.modification)(a.nom || T.sansNom);
  if (a.sorte === 'avis') return T.activite.avis(a.sens, objet);
  return (T.activite[a.sorte] || T.activite.recue)(objet);
}
function ecranAccueil() {
  const a = etat.accueil;
  const prenom = etat.moi && etat.moi.nom ? etat.moi.nom.trim().split(/\s+/)[0] : '';
  const tete = `<div class="head"><div><h1>${e(T.bonjour(prenom))}</h1><p>${e(T.accueilIntro)}</p></div></div>`;
  if (!a) return `${tete}<p class="muted" role="status">${e(T.chargement)}</p>`;
  const tuile = (n, textes) => `<button type="button" class="tile" data-act="voir-propositions"><strong>${Number(n)}</strong><span>${e(n > 1 ? textes.plusieurs : textes.une)}</span><small>${e(textes.aide)}</small></button>`;
  const activite = a.activite.length
    ? a.activite.map((x) => `<div><div class="grow">${x.sorte === 'verification' ? '' : `<b class="qui">${e(x.qui || T.activite.quelquun)}</b> `}${e(texteActivite(x))}</div><span class="muted small">${e(jourEtHeure(x.quand))}</span></div>`).join('')
    : `<div><div class="grow muted">${e(T.activite.aucune)}</div></div>`;
  const v = a.envois;
  return `${tete}
    <div class="grid g2">${tuile(a.compteurs.nouvelles, T.tuiles.nouvelles)}${tuile(a.compteurs.verification, T.tuiles.verification)}</div>
    <div class="grid g2">
      <section class="card"><h3>${e(T.activite.titre)}</h3><div class="list">${activite}</div></section>
      <section class="card"><h3>${e(T.envois.titre)}</h3><div class="list">
        <div><div class="grow">${e(T.envois.resume)}<br><span class="muted small">${e(T.envois.resumeDetail(v.resume.jour, v.resume.destinataires))}</span></div></div>
        <div><div class="grow">${e(T.envois.contributions)}</div>${v.contributions ? `<span class="pill p-ok">${e(T.envois.ouvertes)}</span>` : `<span class="pill p-warn">${e(T.envois.fermees)}</span>`}</div>
        <div><div class="grow">${e(T.envois.essai)}${v.essaiCourriels ? `<br><span class="muted small">${e(T.envois.essaiDetail)}</span>` : ''}</div>${v.essaiCourriels ? `<span class="pill p-warn">${e(T.envois.actif)}</span>` : `<span class="pill p-mute">${e(T.envois.arrete)}</span>`}</div>
      </div></section>
    </div>`;
}

// ─── Propositions ───
// Une proposition tranchée depuis plus de trente jours : gardée, mais rangée hors de la vue courante.
const JOURS_RECENTS = 30;
const ancienne = (p) => !ouverte(p) && !!p.decideLe && Date.now() - Date.parse(p.decideLe) > JOURS_RECENTS * 86400000;
// tout : vrai pour compter aussi les anciennes. Une recherche les montre toujours : on cherche pour retrouver.
function filtrees({ tout = false } = {}) {
  const { q, genre, type, anciennes } = etat.filtres;
  const cherche = plier(q.trim());
  return (etat.liste || []).filter((p) => {
    if (!tout && !anciennes && !cherche && ancienne(p)) return false;
    if (genre && p.genre !== genre) return false;
    if (type && (!p.type || cleType(p.type) !== type)) return false;
    if (cherche && !plier(`${p.nom} ${p.nomProposant} ${p.courriel || ''} ${T.genres[p.genre] || ''}`).includes(cherche)) return false;
    return true;
  });
}
function pucesAvis(avis) {
  if (!avis.length) return `<span class="muted small">${e(T.avis.aucunCarte)}</span>`;
  return `<span class="votes">${avis.map((a) => `<span class="vote ${classeAvis(a.sens)}" title="${e(T.avis.infobulle(a.nom || T.activite.quelquun, a.sens, a.commentaire))}">${icone(a.sens)}${e(initiales(a.nom))}</span>`).join('')}</span>`;
}
function carte(p) {
  let suite;
  const id = e(p.id);
  if (p.statut === 'attente') {
    suite = peut() ? `<span class="row"><button type="button" class="btn sm" data-act="second-regard" data-id="${id}">${e(T.secondRegard)}</button>${peutTrancher(p) ? `<button type="button" class="btn sm" data-act="approuver-carte" data-id="${id}">${e(T.approuver)}</button>` : ''}</span>` : '';
  } else if (p.statut === 'verification') {
    suite = `<span class="pill p-info">${e(T.enVerificationDepuis(jour(p.verificationLe)))}</span>${pucesAvis(p.avis)}`
      + (peutTrancher(p) ? `<span class="row"><button type="button" class="btn sm primary" data-act="approuver-carte" data-id="${id}">${e(T.approuver)}</button><button type="button" class="btn sm" data-act="refuser-carte" data-id="${id}">${e(T.refuser)}</button></span>` : '');
  } else {
    // Une décision ne se défait pas ici : pour revenir dessus, on passe par la fiche de la ressource.
    suite = `<span class="muted small">${e(T.decision(p.statut, p.decidePar, jour(p.decideLe), p.corrige))}</span>`
      + (p.statut === 'approuvee' && p.fiche ? `<span class="row"><button type="button" class="btn sm" data-act="ouvrir-fiche" data-id="${e(p.fiche.adresse)}">${e(T.ouvrirLaFiche)}</button></span>` : '');
  }
  const proposant = `${e(p.nomProposant || T.anonyme)}<br><span class="muted">${e(p.courriel || '')}</span>`;
  const recue = T.recueLe(jour(p.proposeLe)) + (p.nbChamps === null ? '' : ` · ${pluriel(p.nbChamps, T.champTouche, T.champsTouches)}`);
  return `<div class="mcard" role="button" tabindex="0" data-act="ouvrir" data-id="${id}"${peut() && ouverte(p) ? ' draggable="true"' : ''}>
    <span class="row" style="flex-wrap:nowrap;align-items:flex-start"><b>${e(p.nom || T.sansNom)}</b></span>
    <span class="row">${pastilleGenre(p.genre)}${pastilleType(p.type)}</span>
    <span class="small">${proposant}</span>
    ${p.genre === 'rsn' ? '' : `<span class="muted small">${e(deLEquipe(p) ? T.deLEquipe : (T.liens[p.lienAvecRessource] || T.liens.aucun))}</span>`}
    <span class="muted small num">${e(recue)}</span>
    ${p.ressemble ? `<span class="pill p-warn">${e(T.ressemble.pastille)}</span>` : ''}
    ${suite}</div>`;
}
function corpsPropositions() {
  if (!etat.liste) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const liste = filtrees();
  const rangees = filtrees({ tout: true }).length - liste.length;
  // Le lien qui montre ou range les propositions tranchées depuis plus de trente jours.
  const lienAnciennes = etat.filtres.anciennes
    ? `<p class="muted small"><button type="button" class="linkish" data-act="anciennes">${e(T.anciennes.ranger)}</button></p>`
    : rangees ? `<p class="muted small">${e(T.anciennes.rangees(rangees))} <button type="button" class="linkish" data-act="anciennes">${e(T.anciennes.voir)}</button></p>` : '';
  if (!liste.length) return `<div class="card"><p class="muted">${e(etat.liste.length ? T.aucunResultat : T.aucuneProposition)}</p></div>${lienAnciennes}`;
  if (etat.filtres.affichage === 'colonnes') {
    return `<div class="cols c4">${ETATS.map((statut) => {
      const cartes = liste.filter((p) => p.statut === statut);
      return `<section class="col" data-drop="${statut}"><header><h3>${e(T.colonnes[statut])}</h3><span class="row"><span class="pill p-mute num">${cartes.length}</span></span></header>
        ${statut === 'verification' ? `<p class="muted small" style="padding:0 .2rem">${e(T.colonneVerificationAide)}</p>` : ''}
        ${cartes.map(carte).join('') || `<p class="muted small" style="padding:.4rem .2rem">${e(T.rienIci)}</p>`}</section>`;
    }).join('')}</div>${lienAnciennes}<p class="muted small">${e(peut() ? T.aideColonnes : T.aideColonnesLecture)}</p>`;
  }
  const C = T.tableau;
  return `<div class="scroll"><table><thead><tr><th>${e(C.ressource)}</th><th>${e(C.genre)}</th><th>${e(C.type)}</th><th>${e(C.par)}</th><th>${e(C.recue)}</th><th>${e(C.champs)}</th><th>${e(C.avis)}</th><th>${e(C.etat)}</th></tr></thead><tbody>${liste.map((p) => `
    <tr data-act="ouvrir" data-id="${e(p.id)}" tabindex="0"><td><b>${e(p.nom || T.sansNom)}</b></td><td>${pastilleGenre(p.genre)}</td><td>${pastilleType(p.type)}</td>
      <td>${e(p.nomProposant || T.anonyme)}<br><span class="muted small">${deLEquipe(p) ? e(T.deLEquipe) : `${e(p.courriel || '')}${p.genre === 'rsn' ? '' : ` · ${e(T.liens[p.lienAvecRessource] || T.liens.aucun)}`}`}</span></td>
      <td class="num">${e(jour(p.proposeLe))}</td><td class="num">${p.nbChamps === null ? '' : Number(p.nbChamps)}</td>
      <td>${p.avis.length ? pucesAvis(p.avis) : `<span class="muted">${e(C.aucunAvis)}</span>`}</td><td>${pastilleEtat(p.statut)}</td></tr>`).join('')}</tbody></table></div>${lienAnciennes}`;
}
function ecranPropositions() {
  const f = etat.filtres;
  return `<div class="head"><div><h1>${e(T.routes.propositions)}</h1><p>${e(T.propositionsIntro)}</p></div></div>
    <div class="tools"><input type="search" id="q" placeholder="${e(T.chercher)}" value="${e(f.q)}" aria-label="${e(T.chercherNom)}">
      <select id="fGenre" aria-label="${e(T.tableau.genre)}">${option('', f.genre, T.tousGenres)}${Object.keys(T.genres).map((g) => option(g, f.genre, T.genres[g])).join('')}</select>
      <select id="fType" aria-label="${e(T.typeDeRessource)}">${option('', f.type, T.tousTypes)}${TYPES.map((t) => option(t, f.type, TEXTES.typesCourts[t])).join('')}</select>
      <span class="seg" role="group" aria-label="${e(T.affichage)}"><button type="button" data-act="affichage" data-v="colonnes" aria-pressed="${f.affichage === 'colonnes'}">${e(T.enColonnes)}</button><button type="button" data-act="affichage" data-v="liste" aria-pressed="${f.affichage === 'liste'}">${e(T.enListe)}</button></span></div>
    <div id="mbody">${corpsPropositions()}</div>`;
}

// ─── Lecture des écrans ───
let demande = 0; // numéro de la dernière lecture d'écran : une réponse plus ancienne est ignorée

function rendre() {
  dessinerBandeau(); montrerCoque(true); dessinerNav();
  $('#main').innerHTML = { accueil: ecranAccueil, propositions: ecranPropositions, ressources: ecranRessources, porteurs: ecranPorteurs, qualite: ecranQualite, equipe: ecranEquipe, courriels: ecranCourriels }[route()]();
}
// Redessine ce qui dépend des données sans toucher à la recherche en cours de frappe.
function rafraichir() {
  const ici = route();
  if (ici === 'equipe' && $('#ebody')) { redessinerEquipe(); return dessinerNav(); }
  if (ici === 'courriels' && $('#cbody')) { redessinerCourriels(); return dessinerNav(); }
  const corps = { propositions: $('#mbody'), ressources: $('#rbody'), porteurs: $('#pbody'), qualite: $('#qbody') }[ici];
  if (!corps) return rendre();
  corps.innerHTML = { propositions: corpsPropositions, ressources: corpsRessources, porteurs: corpsPorteurs, qualite: corpsQualite }[ici]();
  if (ici === 'ressources') $('#rintro').textContent = introRessources();
  dessinerNav();
}
const ACTION_DE_ROUTE = { accueil: 'accueil', propositions: 'file', ressources: 'ressources', porteurs: 'porteurs', qualite: 'qualite', equipe: 'equipe', courriels: 'courriels' };
async function charger() {
  const moi = ++demande;
  const ici = route();
  const r = await appel(ACTION_DE_ROUTE[ici]);
  if (moi !== demande) return;
  if (r.code === 401) {
    // Session échue pendant une saisie : la fenêtre et ce qui y est écrit restent à l'écran.
    if (saisieEnCours()) { noter('warn', T.sessionExpiree); return; }
    // Une invitation en cours d'écriture reste à l'écran elle aussi.
    if (saisieEquipe()) { message(EQ.sessionExpiree); return; }
    // Un texte de courriel en cours d'écriture aussi.
    if (saisieCourriels()) { message(CO.sessionExpiree); return; }
    return afficherEntree(null);
  }
  if (!r.ok) {
    if ({ accueil: etat.accueil, propositions: etat.liste, ressources: etat.fiches, porteurs: etat.porteurs, qualite: etat.points, equipe: etat.equipe, courriels: etat.courriels }[ici]) message(T.indisponible); else afficherPanne();
    return;
  }
  if (ici === 'accueil') { etat.accueil = r.donnees; etat.nouvelles = r.donnees.compteurs.nouvelles; }
  else if (ici === 'equipe') etat.equipe = r.donnees;
  else if (ici === 'courriels') {
    etat.courriels = r.donnees;
    // Un brouillon redevenu identique au texte en vigueur n'en est plus un.
    for (const c of etat.courriels.courriels) if (!brouillonDiffere(c)) delete etat.co.brouillons[c.id];
  }
  else if (ici === 'ressources') { etat.fiches = r.donnees.ressources || []; etat.historique = r.donnees.historique !== false; }
  else if (ici === 'porteurs') {
    etat.porteurs = r.donnees.porteurs || [];
    etat.cleCarte = (r.donnees.carte && typeof r.donnees.carte.cle === 'string') ? r.donnees.carte.cle : '';
    etat.compteurs = { ...(etat.compteurs || {}), porteursAPlacer: etat.porteurs.filter((o) => !o.place).length };
  } else if (ici === 'qualite') { etat.points = r.donnees.points || []; etat.compteurs = r.donnees.compteurs || null; }
  else { etat.liste = r.donnees.propositions || []; etat.nouvelles = etat.liste.filter((p) => p.statut === 'attente').length; }
  rafraichir();
}
async function relireMoi() {
  const r = await appel('moi');
  if (r.ok) { etat.moi = r.donnees; rendre(); dessinerFenetre(); }
}

// ─── Fenêtre d'une proposition : comparer, corriger, décider ───
function fenetreNeuve(id) {
  return {
    id, d: null, chargement: true,
    valeurs: {}, depart: {}, porteursNouveaux: {}, sansLogo: false,
    onglet: 'cmp', edition: null, brouillon: null, enPlus: [],
    confirmation: null,   // 'refus' ou 'approbation'
    commentaire: '', avisNote: '', avisOuvert: false,
    erreurs: {}, note: null, enCours: false,
  };
}
// Les valeurs déjà connues d'une liste, d'après la fenêtre ouverte (proposition ou fiche).
const existantes = (cle) => { const d = (etat.f && etat.f.d) || (etat.r && etat.r.d); return (d && d.existantes && d.existantes[cle]) || []; };
const nomDeFiche = (adresse) => { const fiche = existantes('fiches').find((x) => x.adresse === adresse); return fiche ? fiche.nom : adresse; };
const estNouveauPorteur = (nom) => !existantes('porteurs').some((p) => p.trim().toLowerCase() === String(nom).trim().toLowerCase());
// Ce qu'on choisit dans la liste des fiches : le nom, suivi de l'adresse quand deux fiches portent le même nom.
function etiquetteFiche(fiche) {
  const homonymes = existantes('fiches').filter((x) => x.nom.toLowerCase() === fiche.nom.toLowerCase()).length > 1;
  return homonymes ? `${fiche.nom} (${fiche.adresse})` : fiche.nom;
}
const nomValeur = (cle, v) => (PAR_CLE[cle].saisie === 'fiches' ? nomDeFiche(v) : v);

// Les corrections : tout champ dont la valeur diffère de son point de départ.
function corrections() { return etat.f && etat.f.d ? correctionsPanneau(etat.f.valeurs, etat.f.depart) : {}; }
// Vrai s'il y a une saisie qui serait perdue en fermant la fenêtre (proposition ou fiche).
function saisieEnCours() { return saisieProposition() || saisieFiche() || saisiePorteur(); }
function saisieProposition() {
  const f = etat.f;
  if (!f || !f.d || !ouverte(f.d.proposition) || !peut()) return false;
  const adressesChangees = JSON.stringify(f.porteursNouveaux) !== JSON.stringify({ ...f.d.proposition.porteursNouveaux });
  return Object.keys(corrections()).length > 0 || f.edition !== null || f.commentaire.trim() !== '' || f.avisNote.trim() !== '' || f.sansLogo || adressesChangees;
}
function champsProposes() {
  const propose = etat.f.d.proposition.propose;
  return CHAMPS.map((c) => c.cle).filter((cle) => propose[cle] && Object.hasOwn(propose[cle], 'apres'));
}
// Rien à appliquer : aucun champ proposé, aucune correction, et le logo écarté ou absent.
function approbationVide() {
  const f = etat.f;
  return !champsProposes().length && !Object.keys(corrections()).length && (f.sansLogo || !f.d.proposition.aLogo);
}
// Les champs montrés, dans l'ordre du catalogue.
function champsMontres() {
  const f = etat.f; const p = f.d.proposition;
  let cles = Object.keys(p.propose);
  if (ouverte(p)) {
    cles = cles.concat(f.enPlus, Object.keys(corrections()), Object.keys(f.erreurs));
    if (p.genre === 'rsn' && peut()) cles = cles.concat(A_COMPLETER_RSN);
  } else if (p.applique) cles = cles.concat(Object.keys(p.applique));
  return CHAMPS.map((c) => c.cle).filter((cle) => cles.includes(cle));
}
// La valeur qui serait appliquée (proposition ouverte) ou qui l'a été (proposition tranchée).
function valeurFinale(cle) {
  const f = etat.f; const p = f.d.proposition;
  if (ouverte(p)) return f.valeurs[cle];
  if (p.applique && Object.hasOwn(p.applique, cle)) return p.applique[cle];
  return p.propose[cle] ? p.propose[cle].apres : null;
}
// La valeur de comparaison, à gauche : la fiche d'aujourd'hui, ou la fiche au moment de la proposition.
function valeurAvant(cle) {
  const { proposition: p, actuelle } = etat.f.d;
  if (ouverte(p)) return actuelle ? actuelle[cle] : null;
  return p.propose[cle] && Object.hasOwn(p.propose[cle], 'avant') ? p.propose[cle].avant : null;
}
// Champs appliqués autrement que proposés, pour une proposition approuvée.
function corrigeALApprobation(cle) {
  const p = etat.f.d.proposition;
  if (p.statut !== 'approuvee' || !p.applique || !Object.hasOwn(p.applique, cle)) return false;
  return !p.propose[cle] || !egales(p.applique[cle], p.propose[cle].apres);
}

// Une cellule de la comparaison. cote : -1 pour l'ancienne valeur (à gauche), 1 pour la nouvelle (à droite).
function cellule(cle, avant, apres, cote) {
  const champ = PAR_CLE[cle];
  const v = cote < 0 ? avant : apres;
  if (estListe(cle)) {
    const liste = Array.isArray(v) ? v : [];
    if (!liste.length) return VIDE;
    const { retires, ajoutes } = comparerListes(avant, apres);
    const marquees = cote < 0 ? retires : ajoutes;
    return `<span class="tgs">${liste.map((x) => `<span class="tg${marquees.includes(String(x)) ? (cote < 0 ? ' del' : ' add') : ''}">${e(nomValeur(cle, x))}</span>`).join('')}</span>`;
  }
  if (champ.saisie === 'coche') {
    const texte = e(v ? T.oui : T.non);
    if (!!avant === !!apres) return texte;
    return cote < 0 ? `<del>${texte}</del>` : `<ins>${texte}</ins>`;
  }
  if (estVide(v)) return VIDE;
  if (champ.saisie === 'texte' || champ.saisie === 'long') {
    const segments = comparerTextes(estVide(avant) ? '' : avant, estVide(apres) ? '' : apres);
    return `<span class="pre">${segments.map((s) => {
      if (s.sorte === 'egal') return e(s.texte);
      if (s.sorte === 'retire') return cote < 0 ? `<del>${e(s.texte)}</del>` : '';
      return cote > 0 ? `<ins>${e(s.texte)}</ins>` : '';
    }).join('')}</span>`;
  }
  // Choix, adresse web, courriel : la valeur change d'un bloc.
  if (egales(avant, apres)) return e(v);
  return cote < 0 ? `<del>${e(v)}</del>` : `<ins>${e(v)}</ins>`;
}
const valeurSeule = (cle, v) => cellule(cle, v, v, 1);
const legende = () => `<div class="legend"><span><del>${e(T.legende.retire)}</del></span><span><ins>${e(T.legende.ajoute)}</ins></span><span>${e(T.legende.reste)}</span></div>`;

// Le contrôle de saisie du champ en cours de correction. Il travaille sur un brouillon,
// gardé seulement par « Garder ma correction ».
function etiquettesBrouillon(cle) {
  const connues = existantes(cle).map((v) => String(v).toLowerCase());
  return (etat.f.brouillon || []).map((v, i) => {
    const nom = nomValeur(cle, v);
    const nouvelle = PAR_CLE[cle].saisie !== 'fiches' && cle !== 'porteurs' && !connues.includes(String(v).toLowerCase());
    return `<span class="tagx">${e(nom)}${nouvelle ? ` <span class="small">${e(T.nouvelleValeur)}</span>` : ''}<button type="button" data-act="retirer" data-i="${i}" aria-label="${e(TC.retirer(nom))}">×</button></span>`;
  }).join('');
}
function controle(cle) {
  const f = etat.f; const champ = PAR_CLE[cle]; const v = f.brouillon;
  const options = (f.d.options && f.d.options[cle]) || [];
  const nom = e(libelle(cle));
  let saisie;
  if (champ.saisie === 'coche') {
    saisie = `<label class="switch mini"><input type="checkbox" role="switch" id="corrIn"${v ? ' checked' : ''}>${nom}</label>`;
  } else if (champ.saisie === 'choixMultiples') {
    const toutes = [...options, ...(v || []).filter((o) => !options.includes(o))];
    saisie = `<div class="opts" role="group" aria-label="${nom}">${toutes.map((o) => `<button type="button" class="opt" data-act="option" data-v="${e(o)}" aria-pressed="${(v || []).includes(o)}">${e(o)}</button>`).join('')}</div>`;
  } else if (champ.saisie === 'listeOuverte' || champ.saisie === 'fiches') {
    const choix = champ.saisie === 'fiches' ? existantes('fiches').map(etiquetteFiche) : existantes(cle);
    saisie = `<div class="chips" id="etiquettes">${etiquettesBrouillon(cle)}</div>
      <div class="ajout"><input type="text" id="ajoutIn" list="choixConnus" maxlength="${Number(champ.max) || 200}" value="${e(f.ajout || '')}" placeholder="${e(TC.indiceListe)}" autocomplete="off" aria-label="${nom}">
        <button type="button" class="btn sm" data-act="ajouter">${e(TC.ajouter)}</button></div>
      <datalist id="choixConnus">${choix.map((o) => `<option value="${e(o)}"></option>`).join('')}</datalist>`;
  } else if (champ.saisie === 'choix') {
    const choix = !v || options.includes(v) ? options : [v, ...options];
    saisie = `<select id="corrIn" aria-label="${nom}">${option('', v || '', T.aucun)}${choix.map((o) => option(o, v, o)).join('')}</select>`;
  } else if (champ.saisie === 'long' || (champ.saisie === 'texte' && champ.max >= 300)) {
    saisie = `<textarea class="notes" id="corrIn" maxlength="${Number(champ.max)}" aria-label="${nom}"${champ.saisie === 'long' ? ' style="min-height:170px"' : ''}>${e(v || '')}</textarea>`;
  } else {
    const type = champ.saisie === 'url' ? 'url' : champ.saisie === 'courriel' ? 'email' : 'text';
    saisie = `<input type="${type}" id="corrIn" maxlength="${Number(champ.max)}" value="${e(v || '')}" aria-label="${nom}"${champ.saisie === 'url' ? ' placeholder="https://" inputmode="url"' : ''} autocomplete="off">`;
  }
  return `${saisie}<span class="err" id="erreurSaisie" role="alert"></span>
    <span class="row"><button type="button" class="btn sm primary" data-act="garder">${e(T.garderCorrection)}</button><button type="button" class="btn sm" data-act="annuler-correction">${e(T.annuler)}</button></span>`;
}
// Corriger une proposition n'a de sens que pour qui peut l'approuver.
const corrigeable = () => peutTrancher(etat.f.d.proposition);
function boutonsCorrection(cle) {
  const f = etat.f;
  if (!ouverte(f.d.proposition) || !corrigeable()) return '';
  const corrige = Object.hasOwn(corrections(), cle);
  return `<span class="row">${corrige ? `<span class="pill p-info">${e(T.corrigeParVous)}</span><button type="button" class="linkish small" data-act="defaire" data-k="${cle}">${e(T.annulerCorrection)}</button>` : ''}
    <button type="button" class="btn sm" data-act="corriger" data-k="${cle}"${f.enCours ? ' disabled' : ''}>${e(estVide(valeurFinale(cle)) ? T.completer : T.corriger)}</button></span>`;
}

function comparaison() {
  const f = etat.f; const { proposition: p, bouscules, actuelle } = f.d;
  const ouvert = ouverte(p); const modification = viseUneFiche(p);
  const cles = champsMontres();
  const rangs = cles.map((cle) => {
    const finale = valeurFinale(cle);
    const avant = modification ? valeurAvant(cle) : null;
    const bouscule = ouvert && bouscules.includes(cle) && p.propose[cle];
    const corrige = corrigeALApprobation(cle) ? `<span class="pill p-info">${e(T.corrigePar(p.decidePar))}</span>` : '';
    const droite = ouvert && f.edition === cle
      ? controle(cle)
      : (modification ? cellule(cle, avant, finale, 1) : valeurSeule(cle, finale)) + corrige + boutonsCorrection(cle)
        + (f.erreurs[cle] ? `<span class="err" role="alert">${e(f.erreurs[cle])}</span>` : '');
    return `<div class="k">${e(libelle(cle))}${bouscule ? `<span class="pill p-warn">${e(T.bouscule.pastille)}</span>` : ''}${ouvert && modification && !p.propose[cle] ? `<span class="pill p-mute">${e(T.ajouteParVous)}</span>` : ''}</div>
      ${modification ? `<div class="b">${cellule(cle, avant, finale, -1)}</div>` : ''}<div class="b">${droite}</div>
      ${bouscule ? `<div class="full"><div class="note warn"><b>${e(T.bouscule.titre)}</b><dl class="kv"><dt>${e(T.bouscule.avant)}</dt><dd>${valeurSeule(cle, p.propose[cle].avant)}</dd><dt>${e(T.bouscule.maintenant)}</dt><dd>${valeurSeule(cle, actuelle[cle])}</dd><dt>${e(T.bouscule.propose)}</dt><dd>${valeurSeule(cle, p.propose[cle].apres)}</dd></dl><span>${e(T.bouscule.aide)}</span></div></div>` : ''}`;
  }).join('');
  // L'image déposée avec la proposition n'est pas un champ du catalogue : elle a son rang.
  const logo = p.aLogo ? `<div class="k">${e(T.logo.titre)}</div>${modification ? `<div class="b">${VIDE}</div>` : ''}
    <div class="b"><img class="logodepose${f.sansLogo ? ' ecarte' : ''}" src="/api/admin?action=logo&amp;id=${e(encodeURIComponent(p.id))}" alt="${e(T.logo.titre)}">
      ${ouvert && corrigeable() ? `<span class="row">${f.sansLogo ? `<span class="pill p-info">${e(T.logo.ecarte)}</span>` : ''}<button type="button" class="btn sm" data-act="logo">${e(f.sansLogo ? T.logo.reprendre : T.logo.ecarter)}</button></span>` : ''}</div>` : '';
  const entetes = ouvert
    ? [T.colonnesComparaison.actuelle, modification ? T.colonnesComparaison.proposee : T.colonnesComparaison.propose]
    : p.statut === 'approuvee' ? [T.colonnesComparaison.avant, modification ? T.colonnesComparaison.applique : T.colonnesComparaison.publie]
      : [T.colonnesComparaison.surLaFiche, T.colonnesComparaison.refuse];
  // Compléter un champ que la proposition ne porte pas est réservé à l'Administration : le serveur le refuse aux autres.
  const restants = CHAMPS.filter((c) => !cles.includes(c.cle));
  return `${modification ? legende() : ''}
    <div class="cmp${modification ? '' : ' one'}"><div class="hd">${e(T.colonnesComparaison.champ)}</div>${modification ? `<div class="hd b">${e(entetes[0])}</div>` : ''}<div class="hd b">${e(entetes[1])}</div>${rangs}${logo}</div>
    ${!rangs && !logo ? `<p class="muted small">${e(T.rienAMontrer)}</p>` : ''}
    ${ouvert && corrigeable() && administre() && restants.length ? `<div class="row"><select id="autreChamp" aria-label="${e(T.autreChamp)}" style="width:auto"${f.enCours ? ' disabled' : ''}><option value="">${e(T.autreChamp)}…</option>${restants.map((c) => option(c.cle, '', libelle(c.cle))).join('')}</select><span class="muted small">${e(T.autreChampAide)}</span></div>` : ''}`;
}

// La fiche telle qu'elle serait sur le site : les valeurs de la fiche, puis celles de la proposition.
function ficheApercue() {
  const { proposition: p, actuelle, apercu } = etat.f.d;
  const montres = champsMontres();
  const v = {};
  for (const { cle } of CHAMPS) v[cle] = montres.includes(cle) ? valeurFinale(cle) : (actuelle ? actuelle[cle] : null);
  const liens = [];
  for (const cle of RELATIONS) for (const adresse of (v[cle] || [])) liens.push({ nature: T.natures[cle], adresse, nom: nomDeFiche(adresse) });
  return {
    ...v, nom: v.nom || T.sansNom, adresse: p.fiche ? p.fiche.adresse : '',
    porteurs: (v.porteurs || []).map((nom) => ({ nom })), liens,
    // Seul le logo déjà public est montré : une image proposée n'est chargée d'aucune adresse avant l'approbation.
    logo: logoPropose() ? null : (apercu && apercu.logo) || null,
    verifieeLe: (apercu && apercu.verifieeLe) || null,
  };
}
// Vrai si la proposition apporte un logo : une image déposée, ou une adresse de logo différente de celle de la fiche.
function logoPropose() {
  const f = etat.f; const { proposition: p, actuelle } = f.d;
  if (p.aLogo && !f.sansLogo) return true;
  return champsMontres().includes('logo') && !egales(valeurFinale('logo'), actuelle ? actuelle.logo : null);
}
// Le cadre qui montre une fiche comme sur le site, avec la feuille de styles du site.
function cadreApercu(fiche) {
  const page = `<!doctype html><html lang="fr" data-theme="${theme() === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/css/styles.css"><style>:root{color-scheme:${theme() === 'dark' ? 'dark' : 'light'}}body{margin:0;padding:12px;background:var(--rsn-body-bg)}.fiche-statique{margin:0 auto}</style></head><body><main class="fiche-statique">${htmlFiche(fiche)}</main></body></html>`;
  return `<iframe class="apercu-cadre" id="cadreApercu" title="${e(T.apercu.titre)}" sandbox="allow-same-origin" srcdoc="${e(page)}"></iframe>`;
}
function apercuSurLeSite() {
  const { proposition: p } = etat.f.d;
  return `<p class="muted small">${e(viseUneFiche(p) ? T.apercu.modification : T.apercu.nouvelle)}${logoPropose() ? ` ${e(T.apercu.logoPropose)}` : ''}</p>
    ${cadreApercu(ficheApercue())}`;
}

function listeAvis(avis) {
  if (!avis.length) return `<p class="muted small">${e(T.avis.aucun)}</p>`;
  return `<div class="list">${avis.map((a) => `<div><span class="vote ${classeAvis(a.sens)}">${icone(a.sens)}${e(initiales(a.nom))}</span><div class="grow small"><b>${e(a.nom || T.activite.quelquun)}</b>${a.commentaire ? `<br>${e(a.commentaire)}` : ` <span class="muted">· ${e(T.avis.sansCommentaire)}</span>`}</div><span class="muted small">${e(jour(a.le))}</span></div>`).join('')}</div>`;
}
function blocAvis() {
  const f = etat.f; const p = f.d.proposition;
  const mien = p.avis.find((a) => a.moi);
  let geste = '';
  if (ouverte(p) && peut()) {
    geste = mien && !f.avisOuvert
      ? `<div class="row" style="margin-top:.5rem"><span class="vote ${classeAvis(mien.sens)}">${icone(mien.sens)}${e(T.avis.leVotre[mien.sens])}</span><button type="button" class="linkish small" data-act="avis-modifier">${e(T.avis.modifier)}</button></div>`
      : `<div class="row" style="margin-top:.5rem"><input type="text" id="avisNote" maxlength="1000" value="${e(f.avisNote)}" placeholder="${e(T.avis.indice)}" aria-label="${e(T.avis.commentaire)}" style="flex:1 1 260px;width:auto">
          <button type="button" class="btn" data-act="avis" data-v="favorable"${f.enCours ? ' disabled' : ''}>${icone('favorable')}${e(T.avis.favorable)}</button><button type="button" class="btn danger" data-act="avis" data-v="defavorable"${f.enCours ? ' disabled' : ''}>${icone('defavorable')}${e(T.avis.defavorable)}</button></div>`;
  }
  return `<div class="sep"><h3 style="margin-bottom:.4rem">${e(T.avis.titre)}</h3>${listeAvis(p.avis)}${geste}
    ${ouverte(p) ? `<p class="muted small" style="margin-top:.5rem">${e(T.avis.aide)}</p>` : ''}</div>`;
}
// Un nouveau porteur nommé dans la proposition : il sera créé à l'approbation, avec cette adresse.
function blocPorteursNouveaux() {
  const f = etat.f; const p = f.d.proposition;
  if (!ouverte(p) || !champsMontres().includes('porteurs')) return '';
  return (f.valeurs.porteurs || []).filter(estNouveauPorteur).map((nom) => `<div class="note info"><b>${e(T.porteurNouveau.titre(nom))}</b><span>${e(T.porteurNouveau.aide)}</span>
    <label class="f" style="color:inherit">${e(T.porteurNouveau.adresse)}<input type="text" maxlength="300" data-adresse-porteur="${e(nom)}" value="${e(f.porteursNouveaux[nom] || '')}" autocomplete="off"${corrigeable() ? '' : ' disabled'}></label></div>`).join('');
}

function contenuFenetre() {
  const f = etat.f;
  if (f.chargement) return `<p class="muted" role="status">${e(T.chargement)}</p><div class="row"><button type="button" class="btn sm x" data-act="fermer">${e(T.fermer)}</button></div>`;
  const { proposition: p, ficheDisparue, ressemble, verifieraFiche } = f.d;
  const ouvert = ouverte(p);
  const nb = Object.keys(corrections()).length;
  const occupe = f.enCours ? ' disabled' : '';
  let actions = '';
  const equipe = deLEquipe(p);
  const tranche = peutTrancher(p);
  if (ouvert && peut()) {
    actions = `${tranche ? `<button type="button" class="btn primary" data-act="demander-approbation"${f.enCours || ficheDisparue || approbationVide() ? ' disabled' : ''}>${e(f.enCours ? T.enCours : (nb ? T.approuverCorrige(nb) : T.approuver))}</button>` : ''}
      ${p.statut === 'attente' ? `<button type="button" class="btn" data-act="second-regard" data-id="${e(p.id)}"${occupe}>${e(T.demanderSecondRegard)}</button>` : ''}
      ${tranche ? `<button type="button" class="btn danger" data-act="refuser"${occupe}>${e(T.refuser)}</button>` : ''}`;
  }
  // Une modification de l'équipe ne prévient personne par courriel.
  const definitif = equipe ? T.definitifEquipe : T.definitif(p.courriel || '');
  const recue = jour(p.proposeLe) + (p.statut === 'verification' && p.verificationLe ? ` · ${T.enVerificationDepuis(jour(p.verificationLe)).toLowerCase()}` : '');
  const confirmation = !ouvert || !tranche ? ''
    : f.confirmation === 'refus' ? `<div class="confirm" style="flex-direction:column;align-items:stretch"><label class="f" for="refusTxt" style="color:inherit">${e(T.refus.libelle)} <small>${e(equipe ? T.refus.aideEquipe : T.refus.aide)}</small><textarea class="notes" id="refusTxt" maxlength="2000">${e(f.commentaire)}</textarea></label>
        <span class="err" role="alert">${e(f.erreurs.commentaire || '')}</span>
        <span><b>${e(definitif)}</b></span>
        <span class="row"><button type="button" class="btn sm" data-act="annuler-confirmation"${occupe}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="confirmer-refus"${occupe}>${e(f.enCours ? T.enCours : T.refus.confirmer)}</button></span></div>`
      : f.confirmation === 'approbation' ? `<div class="note info" id="confirmationApprobation"><b>${e(T.confirmerApprobation.titre)}</b><span>${e(equipe ? T.confirmerApprobation.aideEquipe : T.confirmerApprobation.aide)}</span><span><b>${e(definitif)}</b></span>
        <span class="row"><button type="button" class="btn sm" data-act="annuler-confirmation"${occupe}>${e(T.annuler)}</button><button type="button" class="btn sm primary" data-act="approuver"${f.enCours || ficheDisparue || approbationVide() ? ' disabled' : ''}>${e(f.enCours ? T.enCours : T.approuver)}</button></span></div>` : '';
  return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="logoimg t-${p.type ? cleType(p.type) : ''}">${e(initiales(p.nom))}</span>
      <div style="min-width:0"><h2 id="titreFenetre">${e(p.nom || T.sansNom)}</h2><span class="row" style="margin-top:.25rem">${pastilleEtat(p.statut)}${pastilleGenre(p.genre)}${pastilleType(p.type)}</span></div>
      <button type="button" class="btn sm x" style="margin-left:auto" data-act="fermer">${e(T.fermer)}</button></div>
    ${f.note ? `<div class="note ${f.note.sorte}" id="noteFenetre" role="alert" tabindex="-1">${e(f.note.texte)}</div>` : ''}
    <dl class="kv"><dt>${e(T.proposeePar)}</dt><dd><b>${e(p.nomProposant || T.anonyme)}</b> · ${e(equipe ? T.deLEquipe : (p.courriel || ''))}</dd>
      ${p.genre === 'rsn' || equipe ? '' : `<dt>${e(T.lienAvecRessource)}</dt><dd>${e(T.liens[p.lienAvecRessource] || T.liens.aucun)}${ouvert && verifieraFiche ? ` <span class="muted small">· ${e(T.marqueraVerifiee)}</span>` : ''}</dd>`}
      <dt>${e(T.recue)}</dt><dd>${e(recue)}</dd>
      ${!ouvert ? `<dt>${e(p.statut === 'approuvee' ? T.approuveePar : T.refuseePar)}</dt><dd>${e(p.decidePar || T.inconnue)}${p.decideLe ? `, ${e(T.le(jour(p.decideLe)))}` : ''}</dd>` : ''}
      ${p.fiche ? `<dt>${e(T.ficheVisee)}</dt><dd><a href="/ressource/${e(encodeURIComponent(p.fiche.adresse))}" target="_blank" rel="noopener">${e(p.fiche.nom)}</a></dd>` : ''}</dl>
    ${!ouvert && p.commentaire ? `<div class="note warn"><b>${e(equipe ? T.commentaireRefus : T.commentaireEnvoye)}</b><span>${e(p.commentaire)}</span></div>` : ''}
    ${ouvert && equipe && peut() && !tranche ? `<div class="note info">${e(T.equipeReservee)}</div>` : ''}
    ${ouvert && ficheDisparue ? `<div class="note bad">${e(T.ficheDisparue)}</div>` : ''}
    ${ouvert && p.illisible ? `<div class="note bad">${e(T.illisible)}</div>` : ''}
    ${ouvert && ressemble ? `<div class="note warn"><b>${e(T.ressemble.titre)}</b><span>${e(T.ressemble.aide(ressemble.nom))}</span><a class="btn sm" href="/ressource/${e(encodeURIComponent(ressemble.adresse))}" target="_blank" rel="noopener">${e(T.ressemble.ouvrir)}</a></div>` : ''}
    ${ouvert && p.genre === 'rsn' ? `<div class="note info"><b>${e(T.rsn.titre)}</b><span>${e(T.rsn.aide)}</span></div>` : ''}
    <div class="row"><span class="seg" role="group" aria-label="${e(T.vue)}"><button type="button" data-act="onglet" data-v="cmp" aria-pressed="${f.onglet === 'cmp'}">${e(viseUneFiche(p) ? T.ongletComparaison : T.ongletChamps)}</button><button type="button" data-act="onglet" data-v="apercu" aria-pressed="${f.onglet === 'apercu'}">${e(T.apercu.onglet)}</button></span>
      <span class="muted small">${e(pluriel(p.nbChamps || 0, T.champTouche, T.champsTouches))}</span></div>
    ${f.onglet === 'cmp' ? comparaison() : apercuSurLeSite()}
    ${blocPorteursNouveaux()}
    ${actions ? `<div class="row sep">${actions}</div>` : ''}
    ${confirmation}
    ${ouvert || p.avis.length ? blocAvis() : ''}`;
}

// Redessine la fenêtre en gardant sa hauteur de défilement.
function dessinerFenetre() {
  const calque = $('#layer');
  const ancienne = $('.modal, .drawer', calque);
  const haut = ancienne ? ancienne.scrollTop : 0;
  // La carte du volet d'un porteur est gardée d'un dessin à l'autre : seul ce qui l'entoure est refait.
  const carteGardee = carteP && carteP.pour === etat.o ? carteP.zone : null;
  if (!carteGardee) demonterCarte();
  // L'élément qui a le focus dans la fenêtre, pour le retrouver après le redessin.
  const actif = ancienne && ancienne.contains(document.activeElement) ? document.activeElement : null;
  const repere = actif ? { id: actif.id, act: actif.dataset.act, k: actif.dataset.k, v: actif.dataset.v } : null;
  $('#coque').inert = fenetreOuverte();
  if (!fenetreOuverte()) { calque.innerHTML = ''; return; }
  let titre; let contenu;
  if (etat.f) { titre = T.fenetre(etat.f.d ? etat.f.d.proposition.nom : ''); contenu = contenuFenetre(); }
  else if (etat.r) { titre = etat.r.nouvelle ? T.ressources.ajouterTitre : T.ressources.fenetre(etat.r.d ? etat.r.d.fiche.nom : ''); contenu = contenuFiche(); }
  else if (etat.o) { titre = etat.o.nouvelle ? P.ajouter : P.fenetre(etat.o.d ? etat.o.d.porteur.nom : ''); contenu = contenuPorteur(); }
  else { titre = T.ressources.csv.titre; contenu = contenuCsv(); }
  calque.innerHTML = etat.o
    ? `<div class="veil" data-act="fermer"></div><aside class="drawer" role="dialog" aria-modal="true" tabindex="-1" aria-label="${e(titre)}">${contenu}</aside>`
    : `<div class="veil" data-act="fermer"></div><div class="modal${etat.csv ? '' : ' wide'}" role="dialog" aria-modal="true" tabindex="-1" aria-label="${e(titre)}">${contenu}</div>`;
  const neuve = $('.modal, .drawer', calque);
  if (etat.o) {
    const place = $('#carteP', calque);
    if (carteGardee && place) { place.replaceWith(carteGardee); carteP.carte.invalidateSize(); }
    else { if (carteGardee) demonterCarte(); monterCarte(); }
  }
  if (ancienne) neuve.scrollTop = haut;
  if (repere) {
    const pareil = (x) => (repere.id ? x.id === repere.id : x.dataset.act === repere.act && x.dataset.k === repere.k && x.dataset.v === repere.v);
    const retrouve = [...neuve.querySelectorAll('button, input, select, textarea, a[href]')].find((x) => !x.disabled && pareil(x));
    (retrouve || neuve).focus({ preventScroll: true });
  }
  // L'aperçu prend la hauteur de la fiche qu'il contient.
  const cadre = $('#cadreApercu', calque);
  if (cadre) cadre.addEventListener('load', () => { try { cadre.style.height = `${cadre.contentDocument.documentElement.scrollHeight + 2}px`; } catch (err) { /* hauteur par défaut */ } });
}
function noter(sorte, texte) {
  const f = etat.f || etat.r || etat.o;
  if (f && !f.chargement) {
    f.note = { sorte, texte };
    dessinerFenetre();
    const zone = $('#noteFenetre');
    if (zone) { zone.scrollIntoView({ block: 'nearest' }); zone.focus(); }
  } else message(texte);
}

// Fermer la fenêtre ; avec une saisie en cours, seulement après confirmation.
function fermerFenetre({ force = false } = {}) {
  if (!fenetreOuverte()) return true;
  const f = etat.f || etat.r || etat.o;
  if (f && f.enCours) return false;
  if (!force && saisieEnCours() && !window.confirm(T.quitter)) return false;
  // Le focus revient à la carte, à la ligne ou au bouton d'où l'on venait.
  const retour = etat.f ? { act: 'ouvrir', id: etat.f.id } : etat.r ? (etat.r.nouvelle ? { act: 'nouvelle-fiche' } : { act: 'ouvrir-fiche', id: etat.r.id })
    : etat.o ? (etat.o.nouvelle ? { act: 'nouveau-porteur' } : { act: 'ouvrir-porteur', id: etat.o.id }) : { act: 'csv' };
  etat.f = null; etat.r = null; etat.csv = null; etat.o = null;
  dessinerFenetre();
  const origine = [...document.querySelectorAll(`#main [data-act="${retour.act}"]`)].find((x) => !retour.id || x.dataset.id === retour.id);
  if (origine) origine.focus({ preventScroll: true });
  return true;
}

let ouverture = 0;
async function ouvrir(id, { confirmation = null } = {}) {
  if (fenetreOuverte() && !fermerFenetre()) return;
  const moi = ++ouverture;
  etat.f = fenetreNeuve(id);
  dessinerFenetre();
  const bouton = $('#layer .x'); if (bouton) bouton.focus();
  const r = await appel('detail', { query: { id } });
  if (moi !== ouverture || !etat.f || etat.f.id !== id) return;
  if (r.code === 401) return afficherEntree(null);
  if (!r.ok) { etat.f = null; dessinerFenetre(); message(r.code === 404 ? T.introuvable : T.indisponible); return; }
  const d = r.donnees;
  const depart = departPanneau(d.proposition.propose, d.actuelle);
  Object.assign(etat.f, {
    d, chargement: false, depart, valeurs: JSON.parse(JSON.stringify(depart)), porteursNouveaux: { ...d.proposition.porteursNouveaux },
    confirmation: ouverte(d.proposition) && peutTrancher(d.proposition) ? confirmation : null,
  });
  dessinerFenetre();
  const cible = confirmation === 'refus' ? $('#refusTxt') : confirmation === 'approbation' ? $('#confirmationApprobation') : $('#layer .x');
  if (cible) { cible.scrollIntoView({ block: 'center' }); if (cible.focus) cible.focus(); }
}

// ─── Saisie d'une correction ───
function corriger(cle) {
  const f = etat.f;
  if (f.edition && f.edition !== cle && !garder()) return;
  f.edition = cle; f.ajout = '';
  f.brouillon = cloner(f.valeurs[cle]);
  if (estListe(cle) && !Array.isArray(f.brouillon)) f.brouillon = [];
  dessinerFenetre();
  const entree = $('#corrIn') || $('#ajoutIn');
  if (entree) entree.focus();
}
// Ce qu'un mot tapé devient dans une liste : { valeur } (vide si rien n'est écrit) ou { erreur }.
// Pour un lien entre fiches, c'est l'adresse de la fiche choisie, qui ne peut pas être la fiche elle-même.
function valeurAAjouter(cle, texte, adresseExclue) {
  const valeur = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!valeur) return { valeur: '' };
  if (PAR_CLE[cle].saisie === 'fiches') {
    const fiche = existantes('fiches').find((x) => etiquetteFiche(x).toLowerCase() === valeur.toLowerCase() && x.adresse !== adresseExclue);
    return fiche ? { valeur: fiche.adresse } : { erreur: T.ficheInconnue };
  }
  // Une valeur déjà connue reprend son écriture exacte (« fhir » ne crée pas un doublon de « FHIR »).
  const connue = existantes(cle).find((o) => o.toLowerCase() === valeur.toLowerCase());
  return { valeur: connue || valeur };
}
// Ajoute au brouillon ce qui est écrit dans le champ d'ajout. Renvoie false si la valeur est refusée.
function ajouterAuBrouillon({ focus = true } = {}) {
  const f = etat.f; const cle = f.edition;
  const entree = $('#ajoutIn'); const erreur = $('#erreurSaisie');
  if (erreur) erreur.textContent = '';
  const { valeur, erreur: refus } = valeurAAjouter(cle, entree.value, f.d.proposition.fiche ? f.d.proposition.fiche.adresse : null);
  if (refus) { if (erreur) erreur.textContent = refus; return false; }
  if (!valeur) return true;
  if (!f.brouillon.some((v) => String(v).toLowerCase() === valeur.toLowerCase())) f.brouillon.push(valeur);
  entree.value = ''; f.ajout = '';
  $('#etiquettes').innerHTML = etiquettesBrouillon(cle);
  if (focus) entree.focus();
  return true;
}
// Garde la correction en cours. Un mot tapé dans le champ d'ajout sans « Ajouter » compte quand même.
// Renvoie false si la saisie est refusée : elle reste alors ouverte.
function garder() {
  const f = etat.f; const cle = f.edition;
  if (!cle) return true;
  const ajout = $('#ajoutIn');
  if (ajout && ajout.value.trim() && !ajouterAuBrouillon({ focus: false })) { ajout.scrollIntoView({ block: 'center' }); ajout.focus(); return false; }
  f.valeurs[cle] = cloner(f.brouillon);
  f.edition = null; f.brouillon = null; f.ajout = '';
  delete f.erreurs[cle];
  dessinerFenetre();
  return true;
}

// ─── Gestes ───
// Ce que le serveur a répondu à un geste qui n'a pas réussi. Renvoie true si la fenêtre reste ouverte.
function echecDuGeste(r) {
  const code = r.donnees.code;
  if (code === 'deja-tranchee' || code === 'introuvable' || code === 'fiche-introuvable') {
    etat.f = null; dessinerFenetre();
    message(code === 'deja-tranchee' ? T.dejaTranchee : code === 'introuvable' ? T.introuvable : T.ficheDisparue);
    charger();
    return false;
  }
  // Dans tous les autres cas, la fenêtre et la saisie restent à l'écran.
  if (r.code === 401) noter('warn', T.sessionExpiree);
  else if (r.code === 403) { noter('warn', T.roleInsuffisant); relireMoi(); }
  else if (code === 'occupee') noter('warn', T.occupee);
  else if (code === 'invalide' && r.donnees.erreurs) {
    if (etat.f) etat.f.erreurs = { ...r.donnees.erreurs };
    noter('bad', r.donnees.erreurs._ || r.donnees.erreurs.sens || r.donnees.erreurs.commentaire || T.erreursEnHaut);
  } else noter('bad', code === 'doublon' ? T.doublon : T.indisponible);
  return true;
}

async function trancher(action) {
  const f = etat.f;
  if (!f || !f.d || f.enCours || !peutTrancher(f.d.proposition)) return;
  const equipe = deLEquipe(f.d.proposition);
  const id = f.id;
  let corps;
  if (action === 'refuser') {
    if (!f.commentaire.trim()) { f.erreurs = { ...f.erreurs, commentaire: T.refus.requis }; dessinerFenetre(); const zone = $('#refusTxt'); if (zone) zone.focus(); return; }
    corps = { id, commentaire: f.commentaire.trim() };
  } else {
    // Une correction encore ouverte est gardée d'abord, avec le mot tapé sans « Ajouter ».
    if (!garder()) return;
    // Chaque nouveau porteur part avec son adresse, même vide : une adresse retirée ici ne doit pas revenir.
    const adresses = {};
    for (const nom of (f.valeurs.porteurs || []).filter(estNouveauPorteur)) adresses[nom] = f.porteursNouveaux[nom] || '';
    corps = { id, corrections: corrections(), porteursNouveaux: adresses, sansLogo: f.sansLogo };
  }
  f.enCours = true; f.erreurs = {}; f.note = null; dessinerFenetre();
  const r = await appel(action, { corps });
  if (etat.f !== f) return;
  f.enCours = false;
  if (r.ok) {
    etat.f = null; dessinerFenetre();
    if (equipe) message(action === 'refuser' ? T.refuseeEquipe : T.approuveeEquipe(r.donnees.historique !== false));
    else message((action === 'refuser' ? T.refusee : T.approuvee)(r.donnees.courriel, r.donnees.historique !== false));
    return charger();
  }
  echecDuGeste(r);
}

const regardsEnCours = new Set(); // propositions dont le second regard est en train d'être demandé

async function demanderSecondRegard(id) {
  if (!peut() || regardsEnCours.has(id)) return;
  regardsEnCours.add(id);
  try { return await envoyerSecondRegard(id); } finally { regardsEnCours.delete(id); }
}
async function envoyerSecondRegard(id) {
  const f = etat.f;
  if (f && (f.enCours || (saisieEnCours() && !window.confirm(T.quitter)))) return;
  if (f) { f.enCours = true; dessinerFenetre(); }
  const r = await appel('verification', { corps: { id } });
  if (f) { if (etat.f !== f) return; f.enCours = false; }
  if (r.ok) {
    etat.f = null; dessinerFenetre();
    message(T.secondRegardDemande(etat.accueil ? etat.accueil.envois.resume.jour : ''));
    return charger();
  }
  if (!f) {
    const code = r.donnees.code;
    if (r.code === 401) return afficherEntree(null);
    if (r.code === 403) { message(T.roleInsuffisant); return relireMoi(); }
    message(code === 'deja-tranchee' ? T.dejaTranchee : code === 'occupee' ? T.occupeeCourt : code === 'introuvable' ? T.introuvable : T.indisponible);
    if (code === 'deja-tranchee' || code === 'introuvable') charger();
    return;
  }
  echecDuGeste(r);
}

async function donnerAvis(sens) {
  const f = etat.f;
  if (!f || !f.d || f.enCours || !peut()) return;
  const zone = $('#avisNote');
  if (zone) f.avisNote = zone.value;
  f.enCours = true; f.note = null; dessinerFenetre();
  const r = await appel('avis', { corps: { id: f.id, sens, commentaire: f.avisNote.trim() } });
  if (etat.f !== f) return;
  f.enCours = false;
  if (r.ok) {
    // Les corrections en cours restent : seule la liste des avis change.
    f.d.proposition.avis = r.donnees.avis || [];
    f.avisNote = ''; f.avisOuvert = false;
    dessinerFenetre();
    message(T.avis.enregistre);
    return charger();
  }
  echecDuGeste(r);
}

// Une carte glissée, ou les boutons d'une carte : le geste dépend de la colonne d'arrivée.
function deplacer(id, vers) {
  const p = (etat.liste || []).find((x) => x.id === id);
  if (!p || p.statut === vers || !peut()) return;
  if (!ouverte(p)) return message(T.neSeDeplacePlus);
  // Une carte lâchée par erreur ne revient pas en arrière : on demande confirmation.
  if (vers === 'verification') return window.confirm(T.confirmerSecondRegard(p.nom || T.sansNom)) ? demanderSecondRegard(id) : undefined;
  if ((vers === 'approuvee' || vers === 'refusee') && !peutTrancher(p)) return message(T.equipeReservee);
  if (vers === 'approuvee') return ouvrir(id, { confirmation: 'approbation' });
  if (vers === 'refusee') { message(deLEquipe(p) ? T.refus.ecrireEquipe : T.refus.ecrire); return ouvrir(id, { confirmation: 'refus' }); }
  return message(T.pasDeRetour);
}

// ─── Ressources : le tableau des fiches ───
const pastilleStatut = (statut) => `<span class="pill ${statut === 'publiee' ? 'p-ok' : 'p-mute'}">${e(T.ressources.statuts[statut] || '')}</span>`;
const plusDUnAn = (iso) => !!iso && Date.now() - Date.parse(iso) > 365 * 86400000;
const pastilleAncienne = (iso) => (plusDUnAn(iso) ? ` <span class="pill p-warn">${e(T.ressources.plusDUnAn)}</span>` : '');
// Les fiches que la recherche et les filtres laissent voir ; toutes : sans recherche ni filtre.
function fichesFiltrees(toutes) {
  const { q, type, statut } = etat.filtresR;
  const cherche = plier(q.trim());
  return (etat.fiches || []).filter((r) => {
    if (toutes) return true;
    if (type && cleType(r.typePrincipal) !== type && cleType(r.secondType) !== type) return false;
    if (statut && r.statut !== statut) return false;
    if (cherche && !plier(`${r.nom} ${r.autresNoms} ${r.porteurs.join(' ')} ${r.motsCles.join(' ')} ${r.contact || ''}`).includes(cherche)) return false;
    return true;
  });
}
function introRessources() {
  if (!etat.fiches) return T.ressources.introCourte;
  const publiees = etat.fiches.filter((r) => r.statut === 'publiee').length;
  return T.ressources.intro(publiees, etat.fiches.length - publiees);
}
function corpsRessources() {
  if (!etat.fiches) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const alerte = etat.historique ? '' : `<div class="note warn">${e(T.ressources.sansHistorique)}</div>`;
  const liste = fichesFiltrees();
  if (!liste.length) return `${alerte}<div class="card"><p class="muted">${e(etat.fiches.length ? T.ressources.aucunResultat : T.ressources.aucune)}</p></div>`;
  const C = T.ressources.tableau;
  return `${alerte}<div class="scroll"><table><thead><tr><th>${e(C.ressource)}</th><th>${e(C.type)}</th><th>${e(C.porteurs)}</th><th>${e(C.statut)}</th><th>${e(C.verifiee)}</th><th>${e(C.versions)}</th><th>${e(C.dernier)}</th></tr></thead><tbody>${liste.map((r) => `
    <tr data-act="ouvrir-fiche" data-id="${e(r.id)}" tabindex="0"><td><span class="row" style="flex-wrap:nowrap"><span class="avatar tp t-${cleType(r.typePrincipal)}">${e(initiales(r.nom))}</span><span><b>${e(r.nom || T.sansNom)}</b>${r.aRevoir ? ` <span class="pill p-info">${e(T.ressources.revoir.pastille)}</span>` : ''}${r.enAttente ? `<br><span class="pill p-warn">${e(T.ressources.enAttente(Number(r.enAttente)))}</span>` : ''}</span></span></td>
      <td>${pastilleType(r.typePrincipal)}</td><td>${e(r.porteurs.join(' | ')) || `<span class="muted">${e(T.ressources.aucunPorteur)}</span>`}</td><td>${pastilleStatut(r.statut)}</td>
      <td class="num">${r.verifieeLe ? e(jour(r.verifieeLe)) + pastilleAncienne(r.verifieeLe) : `<span class="muted">${e(T.ressources.jamais)}</span>`}</td>
      <td class="num">${Number(r.versions)}</td>
      <td class="num">${r.dernier ? `${e(jour(r.dernier.le))}<br><span class="muted small">${e(r.dernier.par || T.inconnue)}</span>` : `<span class="muted">${e(T.ressources.aucunChangement)}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
}
function ecranRessources() {
  const f = etat.filtresR;
  return `<div class="head"><div><h1>${e(T.routes.ressources)}</h1><p id="rintro">${e(introRessources())}</p></div>
      <div class="row"><button type="button" class="btn" data-act="csv">${e(T.ressources.exporter)}</button>${administre() ? `<button type="button" class="btn primary" data-act="nouvelle-fiche">${e(T.ressources.ajouter)}</button>` : ''}</div></div>
    <div class="tools"><input type="search" id="rq" placeholder="${e(T.ressources.chercher)}" value="${e(f.q)}" aria-label="${e(T.ressources.chercherNom)}">
      <select id="rType" aria-label="${e(T.typeDeRessource)}">${option('', f.type, T.tousTypes)}${TYPES.map((t) => option(t, f.type, TEXTES.typesCourts[t])).join('')}</select>
      <select id="rStatut" aria-label="${e(T.ressources.statut)}">${option('', f.statut, T.ressources.tousStatuts)}${Object.keys(T.ressources.statuts).map((x) => option(x, f.statut, T.ressources.statuts[x])).join('')}</select></div>
    <div id="rbody">${corpsRessources()}</div>`;
}

// ─── Fenêtre d'une fiche : modifier, voir l'historique, rétablir ───
// L'ordre des champs dans la fenêtre : celui de la maquette, complété de tout le catalogue.
const ORDRE_FICHE = ['nom', 'autresNoms', 'typePrincipal', 'secondType', 'phrase', 'description', 'lien', 'contact', 'responsable', 'profilResponsable', 'etat', 'autresLiens',
  'porteurs', 'modesAcces', 'commentAcceder', 'reserveA', 'frais', 'portee', 'environnementSecurise', 'langues', 'motsCles', 'normes', 'outils', 'financePar',
  'population', 'periode', 'typesDonnees', 'collecte', 'dictionnaire', 'jumelage', 'depotCode', 'licence', 'doi', 'logo', 'faitPartieDe', 'reposeSur', 'donneAccesA', 'remplace']
  .filter((cle) => PAR_CLE[cle]);
for (const { cle } of CHAMPS) if (!ORDRE_FICHE.includes(cle)) ORDRE_FICHE.push(cle);
const copieProfonde = (v) => JSON.parse(JSON.stringify(v));

function ficheNeuve(id) {
  return {
    id, nouvelle: id === null, d: null, chargement: true,
    valeurs: {}, depart: {}, ajouts: {},   // ajouts : ce qui est écrit dans un champ d'ajout, sans « Ajouter »
    onglet: 'fiche', vA: 1, vB: 1,
    confirmation: null,                    // 'ecarter' ou 'retablir:N'
    erreurs: {}, conflits: {}, note: null, enCours: false,
  };
}
// Pose dans la fenêtre ce que le serveur vient de donner : la saisie repart de la fiche.
function poserFiche(d) {
  const f = etat.r;
  f.d = d; f.chargement = false;
  f.depart = departPanneau(null, d.valeurs);
  f.valeurs = copieProfonde(f.depart);
  f.ajouts = {}; f.erreurs = {}; f.conflits = {}; f.confirmation = null;
  if (d.fiche) f.id = d.fiche.id;
  const numeros = (d.versions || []).map((v) => v.numero);
  f.vB = numeros.length ? numeros[numeros.length - 1] : 1;
  f.vA = numeros.length > 1 ? numeros[numeros.length - 2] : f.vB;
}
// Les champs dont la valeur n'est plus celle de la fiche.
function modificationsFiche() { return etat.r && etat.r.d ? correctionsPanneau(etat.r.valeurs, etat.r.depart) : {}; }
// Vrai s'il y a, dans la fenêtre d'une fiche, une saisie qui serait perdue.
function saisieFiche() {
  const f = etat.r;
  if (!f || !f.d || !peut()) return false;
  return Object.keys(modificationsFiche()).length > 0 || Object.values(f.ajouts).some((texte) => String(texte).trim() !== '');
}

let ouvertureFiche = 0;
// id : le repère de la fiche, ou null pour une nouvelle ressource.
async function ouvrirFiche(id) {
  if (fenetreOuverte() && !fermerFenetre()) return;
  const moi = ++ouvertureFiche;
  const f = ficheNeuve(id);
  etat.r = f;
  dessinerFenetre();
  const bouton = $('#layer .x'); if (bouton) bouton.focus();
  const r = await appel('ressource', { query: id === null ? { neuve: '1' } : { fiche: id } });
  if (moi !== ouvertureFiche || etat.r !== f) return;
  if (r.code === 401) return afficherEntree(null);
  if (!r.ok) {
    etat.r = null; dessinerFenetre();
    message(r.code === 404 ? T.ressources.introuvable : T.indisponible);
    if (r.code === 404) charger();
    return;
  }
  poserFiche(r.donnees);
  dessinerFenetre();
  const cible = id === null ? document.getElementById('f-nom') : $('#layer .x');
  if (cible) cible.focus();
}
// Relit la fiche après un changement : la fenêtre reste ouverte, sur le même onglet.
async function rechargerFiche(id) {
  const f = etat.r;
  f.id = id;
  const r = await appel('ressource', { query: { fiche: id } });
  if (etat.r !== f) return;
  f.enCours = false;
  if (r.ok) poserFiche(r.donnees);
  else {
    // Le changement est fait ; faute de relecture, la saisie devient le nouveau point de départ.
    f.depart = copieProfonde(f.valeurs); f.conflits = {}; f.confirmation = null;
    message(T.indisponible);
  }
  dessinerFenetre();
}

// Vrai si la personne peut écrire dans l'onglet « Fiche » : en Approbation, pas sur une fiche écartée,
// qui ne reçoit pas de proposition.
function saisissable() {
  const fiche = etat.r && etat.r.d ? etat.r.d.fiche : null;
  return peut() && (administre() || !fiche || fiche.statut !== 'ecartee');
}
// Les étiquettes d'une liste et son champ d'ajout.
function pucesListe(cle) {
  const f = etat.r; const champ = PAR_CLE[cle];
  const fige = f.enCours ? ' disabled' : '';
  const connues = existantes(cle).map((x) => String(x).toLowerCase());
  const puces = (f.valeurs[cle] || []).map((x, i) => {
    const nom = nomValeur(cle, x);
    const nouvelle = champ.saisie !== 'fiches' && !connues.includes(String(x).toLowerCase());
    return `<span class="tagx">${e(nom)}${nouvelle ? ` <span class="small">${e(T.nouvelleValeur)}</span>` : ''}${saisissable() ? `<button type="button" data-act="f-retirer" data-k="${cle}" data-i="${i}" data-v="${i}" aria-label="${e(TC.retirer(nom))}"${fige}>×</button>` : ''}</span>`;
  }).join('');
  const liste = `<div class="chips">${puces || `<span class="muted small">${e(T.ressources.listeVide)}</span>`}</div>`;
  if (!saisissable()) return liste;
  const soi = f.d.fiche ? f.d.fiche.adresse : null;
  const choix = champ.saisie === 'fiches' ? existantes('fiches').filter((x) => x.adresse !== soi).map(etiquetteFiche) : existantes(cle);
  return `${liste}<div class="ajout"><input type="text" id="fa-${cle}" data-ajout="${cle}" list="fc-${cle}" maxlength="${Number(champ.max) || 200}" value="${e(f.ajouts[cle] || '')}" placeholder="${e(TC.indiceListe)}" autocomplete="off" aria-label="${e(T.ressources.ajouterA(libelle(cle)))}"${fige}>
      <button type="button" class="btn sm" data-act="f-ajouter" data-k="${cle}"${fige}>${e(TC.ajouter)}</button></div>
    <datalist id="fc-${cle}">${choix.map((o) => `<option value="${e(o)}"></option>`).join('')}</datalist>
    <span class="err" id="fe-${cle}" role="alert"></span>`;
}
// Les porteurs rattachés : on choisit parmi ceux du catalogue, on n'en crée pas ici.
function pucesPorteurs() {
  const f = etat.r; const fige = f.enCours ? ' disabled' : '';
  const rattaches = f.valeurs.porteurs || [];
  const puces = rattaches.map((nom, i) => `<span class="tagx">${e(nom)}${saisissable() ? `<button type="button" data-act="f-retirer" data-k="porteurs" data-i="${i}" data-v="${i}" aria-label="${e(TC.retirer(nom))}"${fige}>×</button>` : ''}</span>`).join('');
  const liste = `<div class="chips">${puces || `<span class="muted small">${e(T.ressources.aucunPorteurRattache)}</span>`}</div>`;
  if (!saisissable()) return liste;
  const restants = existantes('porteurs').filter((nom) => !rattaches.includes(nom));
  return `${liste}<select id="fportAdd" aria-label="${e(T.ressources.rattacher)}"${fige}><option value="">${e(T.ressources.rattacher)}…</option>${restants.map((nom) => option(nom, '')).join('')}</select>`;
}
function redessinerListe(cle, { focus = true } = {}) {
  const zone = document.getElementById(`fl-${cle}`);
  if (!zone) return;
  zone.innerHTML = cle === 'porteurs' ? pucesPorteurs() : pucesListe(cle);
  const entree = document.getElementById(cle === 'porteurs' ? 'fportAdd' : `fa-${cle}`);
  if (focus && entree) entree.focus();
}
// Ajoute à une liste ce qui est écrit dans son champ d'ajout. Renvoie false si la valeur est refusée.
function ajouterALaListe(cle, { focus = true } = {}) {
  const f = etat.r;
  const { valeur, erreur } = valeurAAjouter(cle, f.ajouts[cle], f.d.fiche ? f.d.fiche.adresse : null);
  if (erreur) { const zone = document.getElementById(`fe-${cle}`); if (zone) zone.textContent = erreur; return false; }
  f.ajouts[cle] = '';
  if (valeur && !f.valeurs[cle].some((v) => String(v).toLowerCase() === valeur.toLowerCase())) f.valeurs[cle].push(valeur);
  redessinerListe(cle, { focus });
  return true;
}

// Un champ a changé sur la fiche pendant la saisie : les trois valeurs, et le choix.
function conflitFiche(cle) {
  const f = etat.r;
  if (!Object.hasOwn(f.conflits, cle)) return '';
  const c = f.conflits[cle];
  return `<div class="note warn"><b>${e(T.ressources.conflit.titre)}</b><dl class="kv"><dt>${e(T.ressources.conflit.depart)}</dt><dd>${valeurSeule(cle, f.depart[cle])}</dd><dt>${e(T.bouscule.maintenant)}</dt><dd>${valeurSeule(cle, c.fiche)}</dd><dt>${e(T.ressources.conflit.vous)}</dt><dd>${valeurSeule(cle, c.vous)}</dd></dl>
    <span class="row"><button type="button" class="btn sm" data-act="f-conflit" data-k="${cle}" data-v="saisie"${f.enCours ? ' disabled' : ''}>${e(T.ressources.conflit.garder)}</button><button type="button" class="btn sm" data-act="f-conflit" data-k="${cle}" data-v="fiche"${f.enCours ? ' disabled' : ''}>${e(T.ressources.conflit.prendre)}</button></span></div>`;
}
// Un champ du catalogue dans la fenêtre d'une fiche, avec son contrôle de saisie.
function champFiche(cle) {
  const f = etat.r; const champ = PAR_CLE[cle]; const v = f.valeurs[cle];
  const fige = !saisissable() || f.enCours ? ' disabled' : '';
  const id = `f-${cle}`; const nom = e(libelle(cle));
  const aide = T.ressources.aides[cle] ? ` <small>${e(T.ressources.aides[cle])}</small>` : '';
  const suite = `${f.erreurs[cle] ? `<span class="err" role="alert">${e(f.erreurs[cle])}</span>` : ''}${conflitFiche(cle)}`;
  const options = (f.d.options && f.d.options[cle]) || [];
  if (champ.saisie === 'coche') {
    return `<div class="f wide"><label class="switch mini"><input type="checkbox" role="switch" id="${id}" data-f="${cle}"${v ? ' checked' : ''}${fige}>${nom}</label>${suite}</div>`;
  }
  if (champ.saisie === 'choixMultiples') {
    const toutes = [...options, ...(v || []).filter((o) => !options.includes(o))];
    return `<div class="f wide"><span>${nom}</span><div class="opts" role="group" aria-label="${nom}">${toutes.map((o) => `<button type="button" class="opt" data-act="f-option" data-k="${cle}" data-v="${e(o)}" aria-pressed="${(v || []).includes(o)}"${fige}>${e(o)}</button>`).join('')}</div>${suite}</div>`;
  }
  if (champ.saisie === 'listeOuverte' || champ.saisie === 'fiches') {
    return `<div class="f wide"><span>${nom}${aide}</span><div class="liste" id="fl-${cle}">${cle === 'porteurs' ? pucesPorteurs() : pucesListe(cle)}</div>${suite}</div>`;
  }
  let saisie;
  if (champ.saisie === 'choix') {
    const choix = !v || options.includes(v) ? options : [v, ...options];
    saisie = `<select id="${id}" data-f="${cle}"${fige}>${option('', v || '', T.aucun)}${choix.map((o) => option(o, v, o)).join('')}</select>`;
  } else if (champ.saisie === 'long' || (champ.saisie === 'texte' && champ.max >= 300)) {
    saisie = `<textarea class="notes" id="${id}" data-f="${cle}" maxlength="${Number(champ.max)}"${champ.saisie === 'long' ? ' style="min-height:130px"' : ''}${fige}>${e(v || '')}</textarea>`;
  } else {
    const type = champ.saisie === 'url' ? 'url' : champ.saisie === 'courriel' ? 'email' : 'text';
    saisie = `<input type="${type}" id="${id}" data-f="${cle}" maxlength="${Number(champ.max)}" value="${e(v || '')}"${champ.saisie === 'url' ? ' placeholder="https://" inputmode="url"' : ''} autocomplete="off"${fige}>`;
  }
  const large = champ.saisie === 'long' || cle === 'phrase' || cle === 'logo';
  const depose = cle === 'logo' && f.d.fiche && f.d.fiche.logoDepose ? `<span class="muted small">${e(T.ressources.logoDepose)}</span>` : '';
  return `<div class="f${large ? ' wide' : ''}"><label for="${id}">${nom}${aide}</label>${saisie}${depose}${suite}</div>`;
}

function ongletFiche() {
  const f = etat.r; const fige = f.enCours ? ' disabled' : '';
  const champs = `<div class="fields">${ORDRE_FICHE.map(champFiche).join('')}</div>`;
  if (!saisissable()) return `<p class="muted small">${e(peut() ? T.ressources.ecarteeApprobation : T.ressources.lectureSeule)}</p>${champs}`;
  // En Approbation, la fiche ne change pas : la modification part se faire approuver par l'Administration.
  const libelleBouton = f.nouvelle ? T.ressources.creer : administre() ? T.ressources.enregistrer : T.ressources.proposer;
  const aide = f.nouvelle ? '' : `<span class="muted small">${e(administre() ? T.ressources.enregistrerAide : T.ressources.proposerAide)}</span>`;
  return `${champs}<div class="row"><button type="button" class="btn primary" data-act="f-enregistrer"${fige}>${e(f.enCours ? T.enCours : libelleBouton)}</button>${aide}</div>`;
}

// Ce qu'une version raconte : qui, et d'où vient le changement.
function titreVersion(v) {
  const H = T.ressources.historique;
  const qui = v.par || T.inconnue;
  const p = v.proposition;
  if (v.source === 'depart') return H.depart;
  if (v.source === 'creation') return p ? H.creationProposee(p.nomProposant || T.anonyme, qui) : H.creation(qui);
  if (v.source === 'proposition' && p && p.genre === 'equipe') return H.propositionEquipe(p.nomProposant || T.anonyme, qui);
  if (v.source === 'proposition') return p ? H.proposition(p.nomProposant || T.anonyme, (T.liens[p.lien] || T.liens.aucun).toLowerCase(), qui) : H.propositionSans(qui);
  if (v.source === 'retablissement') return H.retablissement(v.note || H.retour, qui);
  if (v.source === 'qualite') return H.qualite(v.note, qui);
  return H.panneau(qui);
}
function ongletHistorique() {
  const f = etat.r; const H = T.ressources.historique;
  const { versions, valeurs } = f.d;
  if (!versions.length) return `<div class="note warn">${e(T.ressources.sansHistorique)}</div>`;
  const fige = f.enCours ? ' disabled' : '';
  const derniere = versions[versions.length - 1].numero;
  const dateDe = (numero) => { const v = versions.find((x) => x.numero === numero); return v && v.le ? jour(v.le) : ''; };
  const lignes = versions.map((v, i) => {
    const actuelle = v.numero === derniere;
    const cles = CHAMPS.map((c) => c.cle).filter((cle) => Object.hasOwn(v.changements, cle));
    const n = Number(v.numero);
    const precedente = i > 0 ? Number(versions[i - 1].numero) : null;
    return `<div class="${actuelle ? 'cur' : ''}"><span class="row"><b>${e(H.version(n))}</b>${actuelle ? `<span class="pill p-ok">${e(H.actuelle)}</span>` : ''}<span class="muted small num">${e(v.le ? jourEtHeure(v.le) : '')}</span></span>
      <span class="small">${e(titreVersion(v))}</span>
      ${cles.length ? `<span class="tgs">${cles.map((cle) => `<span class="tg">${e(libelle(cle))}</span>`).join('')}</span>` : (v.illisible ? `<span class="muted small">${e(H.illisible)}</span>` : '')}
      <span class="row">${precedente !== null ? `<button type="button" class="btn sm" data-act="v-comparer" data-a="${precedente}" data-b="${n}" data-v="${precedente}-${n}">${e(H.avecPrecedente)}</button>` : ''}${actuelle ? '' : `<button type="button" class="btn sm" data-act="v-comparer" data-a="${n}" data-b="${Number(derniere)}" data-v="${n}-${Number(derniere)}">${e(H.avecActuelle)}</button>${administre() && f.d.historique ? `<button type="button" class="btn sm" data-act="v-demander" data-v="${n}"${fige}>${e(H.retablir)}</button>` : ''}`}</span>
      ${f.confirmation === `retablir:${n}` ? `<div class="confirm" id="confirmationFiche"><span>${e(H.confirmer(n, v.le ? jour(v.le) : ''))}</span><button type="button" class="btn sm" data-act="f-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="v-retablir" data-v="${n}"${fige}>${e(f.enCours ? T.enCours : H.retablirCourt)}</button></div>` : ''}</div>`;
  }).reverse().join('');
  // Deux versions côte à côte : chacune est retrouvée à partir de la fiche d'aujourd'hui.
  const a = reconstituer(valeurs, versions, f.vA); const b = reconstituer(valeurs, versions, f.vB);
  const cles = CHAMPS.map((c) => c.cle).filter((cle) => !egales(a[cle], b[cle]));
  const choix = (courante) => versions.map((v) => option(String(v.numero), String(courante), H.choix(Number(v.numero), v.le ? jour(v.le) : '', v.numero === derniere))).join('');
  return `<p class="muted small">${e(H.intro)}</p>
    ${f.d.historique ? '' : `<div class="note warn">${e(T.ressources.sansHistorique)}</div>`}
    <div class="tl">${lignes}</div>
    <div class="sep" id="comparerVersions" style="display:flex;flex-direction:column;gap:.7rem"><h3>${e(H.comparer)}</h3>
      <div class="row"><select id="vA" aria-label="${e(H.premiere)}" style="width:auto;flex:1 1 240px">${choix(f.vA)}</select><span class="muted">${e(H.avec)}</span><select id="vB" aria-label="${e(H.seconde)}" style="width:auto;flex:1 1 240px">${choix(f.vB)}</select></div>
      ${cles.length ? `${legende()}<div class="cmp"><div class="hd">${e(T.colonnesComparaison.champ)}</div><div class="hd b">${e(H.entete(Number(f.vA), dateDe(f.vA)))}</div><div class="hd b">${e(H.entete(Number(f.vB), dateDe(f.vB)))}</div>${cles.map((cle) => `<div class="k">${e(libelle(cle))}</div><div class="b">${cellule(cle, a[cle], b[cle], -1)}</div><div class="b">${cellule(cle, a[cle], b[cle], 1)}</div>`).join('')}</div>`
    : `<p class="muted">${e(f.vA === f.vB ? H.memeVersion : H.identiques)}</p>`}</div>`;
}

// La fiche telle qu'elle serait sur le site avec ce qui est écrit dans l'onglet « Fiche ».
function ongletApercu() {
  const f = etat.r; const v = f.valeurs; const fiche = f.d.fiche;
  const liens = [];
  for (const cle of RELATIONS) for (const adresse of (v[cle] || [])) liens.push({ nature: T.natures[cle], adresse, nom: nomDeFiche(adresse) });
  // Seul le logo déjà public est montré : une nouvelle adresse n'est chargée qu'une fois enregistrée.
  const logoChange = !egales(v.logo, f.depart.logo);
  const apercue = {
    ...v, nom: v.nom || T.sansNom, adresse: fiche.adresse || '', porteurs: (v.porteurs || []).map((nom) => ({ nom })), liens,
    logo: logoChange ? null : fiche.logo || null, verifieeLe: fiche.verifieeLe || null,
  };
  return `<p class="muted small">${e(T.ressources.apercu)}${logoChange ? ` ${e(T.ressources.apercuLogo)}` : ''}</p>${cadreApercu(apercue)}`;
}

// Les gestes sur la fiche entière, en haut de la fenêtre : vérifiée, à revoir, voir sur le site, écarter ou republier.
function gestesFiche() {
  const f = etat.r; const R = T.ressources; const fige = f.enCours ? ' disabled' : '';
  const fiche = f.d.fiche;
  const publique = fiche.statut === 'publiee' && fiche.adresse
    ? `<a class="btn sm" href="/ressource/${e(encodeURIComponent(fiche.adresse))}" target="_blank" rel="noopener">${e(R.voirPublique)}</a>` : '';
  const marque = fiche.aRevoir ? `<div class="note info"><b>${e(R.revoir.titre)}</b><span>${e(fiche.noteARevoir || R.revoir.sansNote)}</span></div>` : '';
  if (!peut()) return `${marque}${publique ? `<div class="row gestes">${publique}</div>` : ''}`;
  const revoir = fiche.aRevoir
    ? `<button type="button" class="btn sm" data-act="f-retirer-revoir"${fige}>${e(R.revoir.retirer)}</button>`
    : `<button type="button" class="btn sm" data-act="f-demander" data-v="revoir"${fige}>${e(R.revoir.bouton)}</button>`;
  // Écarter et republier sont réservés à l'Administration : absents pour les autres.
  const boutons = fiche.statut === 'publiee'
    ? `<button type="button" class="btn sm" data-act="f-verifier"${fige}>${e(R.verifier)}</button>${revoir}${publique}${administre() ? `<button type="button" class="btn sm danger" data-act="f-demander" data-v="ecarter"${fige}>${e(R.ecarter.bouton)}</button>` : ''}`
    : `${administre() ? `<button type="button" class="btn sm primary" data-act="f-republier"${fige}>${e(R.republier)}</button>` : ''}${revoir}`;
  const confirmation = f.confirmation === 'ecarter' && administre()
    ? `<div class="confirm" id="confirmationFiche"><span>${e(R.ecarter.question(fiche.nom || T.sansNom))}</span><button type="button" class="btn sm" data-act="f-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="f-ecarter"${fige}>${e(f.enCours ? T.enCours : R.ecarter.confirmer)}</button></div>`
    : f.confirmation === 'revoir'
      ? `<div class="confirm" id="confirmationFiche" style="flex-direction:column;align-items:stretch"><label class="f" for="noteRevoir" style="color:inherit">${e(R.revoir.question)} <small>${e(R.revoir.aide)}</small><textarea class="notes" id="noteRevoir" maxlength="500"${fige}>${e(f.noteRevoir || '')}</textarea></label>
          <span class="row"><button type="button" class="btn sm" data-act="f-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm primary" data-act="f-revoir"${fige}>${e(f.enCours ? T.enCours : R.revoir.confirmer)}</button></span></div>`
      : '';
  return `${marque}<div class="row gestes">${boutons}</div>${confirmation}`;
}

function contenuFiche() {
  const f = etat.r;
  const fermer = `<button type="button" class="btn sm x" style="margin-left:auto" data-act="fermer">${e(T.fermer)}</button>`;
  if (f.chargement) return `<p class="muted" role="status">${e(T.chargement)}</p><div class="row">${fermer}</div>`;
  const note = f.note ? `<div class="note ${f.note.sorte}" id="noteFenetre" role="alert" tabindex="-1">${e(f.note.texte)}</div>` : '';
  if (f.nouvelle) {
    return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><h2 id="titreFenetre">${e(T.ressources.ajouterTitre)}</h2>${fermer}</div>
      ${note}<p class="muted small">${e(T.ressources.ajouterAide)}</p>${ongletFiche()}`;
  }
  const { fiche, valeurs, versions, enAttente } = f.d;
  const type = valeurs.typePrincipal;
  const verifiee = fiche.verifieeLe
    ? e(T.ressources.verifieeLe(jour(fiche.verifieeLe), T.ressources.verifieePar[fiche.verifieePar] || fiche.verifieePar || '')) + pastilleAncienne(fiche.verifieeLe)
    : e(T.ressources.jamaisVerifiee);
  const attente = enAttente.length ? `<dt>${e(T.ressources.enAttenteTitre)}</dt><dd>${enAttente.map((p) => `<button type="button" class="linkish" data-act="ouvrir" data-id="${e(p.id)}">${e(p.genre === 'equipe' ? T.ressources.propositionEquipe(p.nomProposant || T.anonyme) : T.ressources.propositionDe(T.genres[p.genre] || T.genres.modification, p.nomProposant || T.anonyme))}</button>`).join(' · ')}</dd>` : '';
  const onglet = (cle, nom) => `<button type="button" data-act="f-onglet" data-v="${cle}" aria-pressed="${f.onglet === cle}">${e(nom)}</button>`;
  return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="logoimg t-${type ? cleType(type) : ''}">${e(initiales(fiche.nom))}</span>
      <div style="min-width:0"><h2 id="titreFenetre">${e(fiche.nom || T.sansNom)}</h2><span class="row" style="margin-top:.25rem">${pastilleStatut(fiche.statut)}${fiche.aRevoir ? `<span class="pill p-info">${e(T.ressources.revoir.pastille)}</span>` : ''}${pastilleType(type)}${valeurs.secondType ? pastilleType(valeurs.secondType) : ''}</span></div>${fermer}</div>
    ${note}
    <dl class="kv"><dt>${e(T.ressources.verifiee)}</dt><dd>${verifiee}</dd>${attente}</dl>
    ${gestesFiche()}
    <div class="row"><span class="seg" role="group" aria-label="${e(T.vue)}">${onglet('fiche', T.ressources.onglets.fiche)}${onglet('hist', T.ressources.onglets.hist(versions.length))}${onglet('apercu', T.ressources.onglets.apercu)}</span></div>
    ${f.onglet === 'hist' ? ongletHistorique() : f.onglet === 'apercu' ? ongletApercu() : ongletFiche()}`;
}

// ─── Gestes sur une fiche ───
// Ce que le serveur a répondu à un geste qui n'a pas réussi : la fenêtre et la saisie restent à l'écran.
function echecFiche(r) {
  const f = etat.r; const code = r.donnees.code;
  if (r.code === 401) return noter('warn', T.sessionExpiree);
  if (r.code === 403) { noter('warn', T.roleInsuffisant); return relireMoi(); }
  if (code === 'conflit' && r.donnees.conflits) {
    f.conflits = {};
    for (const cle of Object.keys(r.donnees.conflits)) if (PAR_CLE[cle]) f.conflits[cle] = { fiche: r.donnees.conflits[cle], vous: cloner(f.valeurs[cle]) };
    f.onglet = 'fiche';
    return noter('warn', T.ressources.conflit.note);
  }
  if (code === 'invalide' && r.donnees.erreurs) {
    f.erreurs = { ...r.donnees.erreurs }; f.onglet = 'fiche';
    return noter('bad', r.donnees.erreurs._ || T.erreursEnHaut);
  }
  if (code === 'introuvable') return noter('bad', T.ressources.introuvableSaisie);
  if (code === 'occupee') return noter('warn', T.ressources.occupee);
  if (code === 'sans-historique') return noter('warn', T.ressources.sansHistorique);
  return noter('bad', code === 'doublon' ? T.doublon : T.indisponible);
}

async function enregistrerFiche() {
  const f = etat.r;
  if (!f || !f.d || f.enCours || !peut() || (f.nouvelle && !administre())) return;
  // Un mot tapé dans un champ d'ajout sans « Ajouter » compte quand même.
  for (const cle of Object.keys(f.ajouts)) {
    if (String(f.ajouts[cle]).trim() && !ajouterALaListe(cle, { focus: false })) {
      const entree = document.getElementById(`fa-${cle}`);
      if (entree) { entree.scrollIntoView({ block: 'center' }); entree.focus(); }
      return;
    }
  }
  const modifs = modificationsFiche();
  if (!Object.keys(modifs).length) return message(T.ressources.rienAEnregistrer);
  const corps = f.nouvelle
    ? { valeurs: modifs, malgreRessemblance: f.ressembleA === JSON.stringify(modifs) }
    : { fiche: f.id, valeurs: modifs, depart: Object.fromEntries(Object.keys(modifs).map((cle) => [cle, f.depart[cle]])) };
  f.enCours = true; f.erreurs = {}; f.conflits = {}; f.note = null; f.confirmation = null; dessinerFenetre();
  const r = await appel(f.nouvelle ? 'creer' : 'enregistrer', { corps });
  if (etat.r !== f) return;
  if (!r.ok && f.nouvelle && r.donnees.code === 'ressemble') {
    // La même saisie envoyée une seconde fois vaut confirmation.
    f.enCours = false; f.ressembleA = JSON.stringify(modifs);
    return noter('warn', T.ressources.ressemble(String(r.donnees.nom || '')));
  }
  if (!r.ok) { f.enCours = false; return echecFiche(r); }
  if (f.nouvelle) {
    etat.r = null; dessinerFenetre();
    message(T.ressources.creee(!!r.donnees.historique));
    return charger();
  }
  if (r.donnees.inchangee) {
    f.enCours = false; f.depart = copieProfonde(f.valeurs); dessinerFenetre();
    return message(T.ressources.inchangee);
  }
  if (r.donnees.proposee) {
    // La fiche n'a pas changé : la fenêtre la relit, et montre la proposition qui l'attend.
    message(T.ressources.proposee(Number(r.donnees.champs)));
    await rechargerFiche(r.donnees.id);
    return charger();
  }
  message(T.ressources.enregistree(Number(r.donnees.champs), r.donnees.numero ? Number(r.donnees.numero) : 0));
  await rechargerFiche(r.donnees.id);
  charger();
}

// Marquer vérifiée, écarter, republier : la saisie en cours dans la fenêtre n'est pas touchée.
async function gesteFiche(action) {
  const f = etat.r;
  if ((action === 'ecarter' || action === 'republier') && !administre()) return;
  if (!f || !f.d || f.nouvelle || f.enCours || !peut()) return;
  f.enCours = true; f.note = null; f.confirmation = null; dessinerFenetre();
  const marquer = action === 'revoir' || action === 'retirer-revoir';
  const corps = marquer ? { fiche: f.id, actif: action === 'revoir', note: action === 'revoir' ? (f.noteRevoir || '') : '' } : { fiche: f.id };
  const r = await appel(marquer ? 'revoir' : action, { corps });
  if (etat.r !== f) return;
  f.enCours = false;
  if (!r.ok) return echecFiche(r);
  const fiche = f.d.fiche;
  f.id = r.donnees.id; fiche.id = r.donnees.id;
  if (marquer) { fiche.aRevoir = !!r.donnees.aRevoir; fiche.noteARevoir = r.donnees.note || ''; f.noteRevoir = ''; }
  else if (action === 'verifier') { fiche.verifieeLe = r.donnees.verifieeLe; fiche.verifieePar = r.donnees.verifieePar; }
  else {
    fiche.statut = action === 'ecarter' ? 'ecartee' : 'publiee';
    // Une fiche écartée n'a plus d'adresse publique ; republiée, elle en retrouve une.
    fiche.adresse = String(r.donnees.id).startsWith('~') ? null : r.donnees.id;
  }
  dessinerFenetre();
  message(T.ressources.messages[action]);
  charger();
}

async function retablirVersion(numero) {
  const f = etat.r; const H = T.ressources.historique;
  if (!f || !f.d || f.nouvelle || f.enCours || !administre()) return;
  // Rétablir relit la fiche : ce qui est écrit dans l'onglet « Fiche » sans être enregistré serait remplacé.
  if (saisieFiche() && !window.confirm(H.perdreSaisie)) return;
  f.enCours = true; f.note = null; dessinerFenetre();
  const r = await appel('retablir', { corps: { fiche: f.id, numero } });
  if (etat.r !== f) return;
  if (!r.ok) {
    f.enCours = false; f.confirmation = null;
    const erreurs = r.donnees.erreurs;
    if (r.donnees.code === 'invalide' && erreurs && !erreurs._) return noter('bad', H.impossible(Object.keys(erreurs).filter((cle) => PAR_CLE[cle]).map(libelle).join(', ')));
    return echecFiche(r);
  }
  if (r.donnees.inchangee) {
    f.enCours = false; f.confirmation = null; dessinerFenetre();
    return message(H.identique);
  }
  const laisses = Array.isArray(r.donnees.laisses) ? r.donnees.laisses.filter((cle) => PAR_CLE[cle]).map(libelle) : [];
  message(H.retablie(numero, r.donnees.numero ? Number(r.donnees.numero) : 0) + (laisses.length ? ` ${H.laisses(laisses.join(', '))}` : ''));
  await rechargerFiche(r.donnees.id);
  charger();
}

// Les gestes de la fenêtre d'une fiche. Pendant un envoi, rien d'autre ne bouge.
function gesteFenetreFiche(act, cible) {
  const f = etat.r; const { k, v } = cible.dataset;
  if (!f.d || f.enCours) return;
  if (act === 'f-onglet') { f.onglet = v; f.confirmation = null; return dessinerFenetre(); }
  if (act === 'v-comparer') {
    f.vA = Number(cible.dataset.a); f.vB = Number(cible.dataset.b); f.confirmation = null; dessinerFenetre();
    const zone = $('#comparerVersions'); if (zone) zone.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  if (!peut()) return;
  if (act === 'f-option' && PAR_CLE[k]) {
    const choisies = new Set(f.valeurs[k] || []);
    if (choisies.has(v)) choisies.delete(v); else choisies.add(v);
    f.valeurs[k] = [...choisies];
    return cible.setAttribute('aria-pressed', String(choisies.has(v)));
  }
  if (act === 'f-retirer' && PAR_CLE[k]) { f.valeurs[k].splice(Number(cible.dataset.i), 1); return redessinerListe(k); }
  if (act === 'f-ajouter' && PAR_CLE[k]) return ajouterALaListe(k);
  if (act === 'f-conflit' && Object.hasOwn(f.conflits, k)) {
    // Dans les deux cas, la valeur de la fiche devient le point de départ : le prochain enregistrement passe.
    const surLaFiche = f.conflits[k].fiche;
    f.depart[k] = estListe(k) ? (Array.isArray(surLaFiche) ? surLaFiche.slice() : []) : (surLaFiche === undefined ? null : surLaFiche);
    if (v === 'fiche') f.valeurs[k] = cloner(f.depart[k]);
    delete f.conflits[k];
    return dessinerFenetre();
  }
  if (act === 'f-enregistrer') return enregistrerFiche();
  if (act === 'f-verifier') return gesteFiche('verifier');
  if (act === 'f-revoir') return gesteFiche('revoir');
  if (act === 'f-retirer-revoir') return gesteFiche('retirer-revoir');
  if (act === 'f-republier') return gesteFiche('republier');
  if (act === 'f-ecarter') return gesteFiche('ecarter');
  if (act === 'v-retablir') return retablirVersion(Number(v));
  if (act === 'f-annuler') { f.confirmation = null; return dessinerFenetre(); }
  if (act === 'f-demander' || act === 'v-demander') {
    if ((act === 'v-demander' || v !== 'revoir') && !administre()) return;
    f.confirmation = act === 'f-demander' ? (v === 'revoir' ? 'revoir' : 'ecarter') : `retablir:${Number(v)}`;
    dessinerFenetre();
    const zone = $('#confirmationFiche');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const cible2 = zone.querySelector('textarea') || zone.querySelector('.danger'); if (cible2) cible2.focus(); }
  }
}

// ─── Porteurs : les colonnes et la liste ───
const P = T.porteurs;
const Q = T.qualite;
function cartePorteur(o) {
  const id = e(o.id);
  return `<div class="mcard" role="button" tabindex="0" data-act="ouvrir-porteur" data-id="${id}"><b>${e(o.nom || T.sansNom)}</b>
    <span class="muted small">${e(o.adresse || P.sansAdresse)}</span>
    <span class="muted small num">${e(P.portees(Number(o.ressources), Number(o.ecartees)))}</span>
    ${o.bottin ? `<span class="pill p-info">${e(P.lieBottin)}</span>` : ''}
    ${o.place || !peut() ? '' : `<span class="row"><button type="button" class="btn sm primary" data-act="ouvrir-porteur" data-id="${id}">${e(P.placer)}</button></span>`}</div>`;
}
function corpsPorteurs() {
  if (!etat.porteurs) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  if (!etat.porteurs.length) return `<div class="card"><p class="muted">${e(P.aucun)}</p></div>`;
  const rech = plier((etat.rechP || '').trim());
  const visibles = rech ? etat.porteurs.filter((o) => plier(`${o.nom} ${o.adresse || ''}`).includes(rech)) : etat.porteurs;
  if (!visibles.length) return `<div class="card"><p class="muted">${e(P.aucunTrouve)}</p></div>`;
  if (etat.vueP === 'colonnes') {
    return `<div class="cols c2">${[[false, P.colonnes.aPlacer], [true, P.colonnes.places]].map(([place, titre]) => {
      const cartes = visibles.filter((o) => !!o.place === place);
      return `<section class="col"><header><h3>${e(titre)}</h3><span class="pill p-mute num">${cartes.length}</span></header>${cartes.map(cartePorteur).join('') || `<p class="muted small" style="padding:.4rem .2rem">${e(T.rienIci)}</p>`}</section>`;
    }).join('')}</div><p class="muted small">${e(peut() ? P.aideColonnes : P.aideColonnesLecture)}</p>`;
  }
  const C = P.tableau;
  return `<div class="scroll"><table><thead><tr><th>${e(C.porteur)}</th><th>${e(C.adresse)}</th><th>${e(C.carte)}</th><th>${e(C.bottin)}</th><th>${e(C.ressources)}</th></tr></thead><tbody>${visibles.map((o) => `
    <tr data-act="ouvrir-porteur" data-id="${e(o.id)}" tabindex="0"><td><b>${e(o.nom || T.sansNom)}</b></td><td>${e(o.adresse) || `<span class="muted">${e(P.aucune)}</span>`}</td>
      <td>${o.place ? `<span class="pill p-ok">${e(P.place)}</span>` : `<span class="pill p-warn">${e(P.aPlacer)}</span>`}</td>
      <td>${o.bottin ? `<span class="pill p-info">${e(P.lie)}</span>` : ''}</td><td class="num">${Number(o.ressources)}</td></tr>`).join('')}</tbody></table></div>`;
}
function ecranPorteurs() {
  const vue = (cle, nom) => `<button type="button" data-act="vue-porteurs" data-v="${cle}" aria-pressed="${etat.vueP === cle}">${e(nom)}</button>`;
  return `<div class="head"><div><h1>${e(T.routes.porteurs)}</h1><p>${e(P.intro)}</p></div>
      <div class="row"><span class="seg" role="group" aria-label="${e(T.affichage)}">${vue('colonnes', T.enColonnes)}${vue('liste', T.enListe)}</span>${peut() ? `<button type="button" class="btn primary" data-act="nouveau-porteur">${e(P.ajouter)}</button>` : ''}</div></div>
    <div class="tools"><input type="search" id="pq" placeholder="${e(P.chercher)}" value="${e(etat.rechP || '')}" aria-label="${e(P.chercher)}"></div>
    <div id="pbody">${corpsPorteurs()}</div>`;
}

// ─── Volet d'un porteur : nom, adresse, place sur la carte, ressources, fusion ───
const CHAMPS_PORTEUR = ['nom', 'adresse', 'latitude', 'longitude'];
function voletNeuf(id) {
  return {
    id, nouvelle: id === null, d: null, chargement: true,
    valeurs: {}, depart: {},      // ce qui est écrit dans les quatre champs, en texte
    fusionVers: '', confirmation: false, erreurs: {}, note: null, enCours: false,
    carte: 'attente',             // 'attente', 'prete' ou 'absente' (la bibliothèque ne s'est pas chargée)
  };
}
const texteCoordonnee = (n) => (typeof n === 'number' ? String(Math.round(n * 1e6) / 1e6) : '');
function poserPorteur(d) {
  const o = etat.o; const p = d.porteur;
  o.d = d; o.chargement = false;
  if (p.id) o.id = p.id;
  o.depart = { nom: p.nom || '', adresse: p.adresse || '', latitude: texteCoordonnee(p.latitude), longitude: texteCoordonnee(p.longitude) };
  o.valeurs = { ...o.depart };
  o.erreurs = {}; o.confirmation = false;
  if (d.carte && typeof d.carte.cle === 'string') etat.cleCarte = d.carte.cle;
}
// Une coordonnée écrite en chiffres : un nombre, null si le champ est vide, NaN si ce n'est pas un nombre.
function coordonnee(texte) {
  const propre = String(texte || '').trim().replace(',', '.');
  if (!propre) return null;
  return /^-?\d+(\.\d+)?$/.test(propre) ? Number(propre) : NaN;
}
// Le lieu écrit dans le volet : [latitude, longitude], ou null s'il n'y en a pas (ou pas de valable).
function lieuSaisi(o) {
  const latitude = coordonnee(o.valeurs.latitude); const longitude = coordonnee(o.valeurs.longitude);
  const valable = typeof latitude === 'number' && typeof longitude === 'number' && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return valable ? [latitude, longitude] : null;
}
function saisiePorteur() {
  const o = etat.o;
  if (!o || !o.d || !peut()) return false;
  return CHAMPS_PORTEUR.some((cle) => String(o.valeurs[cle]).trim() !== String(o.depart[cle]).trim());
}

// La carte du site : même bibliothèque, même version et même fond, chargés seulement à l'ouverture du volet.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
const MAUVE = '#a855f7';
let chargementLeaflet = null;
let carteP = null; // la carte montée : { pour : le volet, carte, zone, repere }
function chargerLeaflet() {
  if (window.L && window.L.map) return Promise.resolve();
  if (!chargementLeaflet) {
    chargementLeaflet = new Promise((reussir, echouer) => {
      const feuille = document.createElement('link');
      // Empreintes de Leaflet 1.9.4 : un fichier altéré en route n'est ni appliqué ni exécuté.
      feuille.rel = 'stylesheet'; feuille.href = `${LEAFLET}leaflet.css`;
      feuille.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; feuille.crossOrigin = 'anonymous';
      const script = document.createElement('script');
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; script.crossOrigin = 'anonymous';
      script.src = `${LEAFLET}leaflet.js`;
      script.onload = () => (window.L && window.L.map ? reussir() : echouer(new Error('Leaflet absent')));
      script.onerror = () => echouer(new Error('Leaflet non chargé'));
      setTimeout(() => echouer(new Error('Leaflet trop lent')), 10000);
      document.head.appendChild(feuille); document.head.appendChild(script);
    });
    // Un échec n'est pas gardé : le prochain volet réessaie.
    chargementLeaflet.catch(() => { chargementLeaflet = null; });
  }
  return chargementLeaflet;
}
function coucheDuSite(cle) {
  // CARTO Voyager avec la clé du site, sinon OpenStreetMap : comme la carte publique.
  if (cle) {
    return window.L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cle)}`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 19,
    });
  }
  return window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
  });
}
function demonterCarte() {
  if (!carteP) return;
  try { carteP.carte.remove(); } catch (err) { /* déjà retirée */ }
  carteP = null;
}
// Met le repère là où le volet le dit ; sans lieu valable, pas de repère.
function placerRepere({ centrer = false } = {}) {
  const o = etat.o;
  if (!carteP || carteP.pour !== o) return;
  const lieu = lieuSaisi(o);
  if (!lieu) { if (carteP.repere) { carteP.repere.remove(); carteP.repere = null; } return; }
  if (carteP.repere) carteP.repere.setLatLng(lieu);
  else carteP.repere = window.L.circleMarker(lieu, { radius: 9, color: '#ffffff', weight: 2, fillColor: MAUVE, fillOpacity: 0.9, interactive: false }).addTo(carteP.carte);
  if (centrer) carteP.carte.setView(lieu, Math.max(carteP.carte.getZoom(), 14));
}
// Écrit des coordonnées dans le volet (clic sur la carte, adresse retrouvée), sans redessiner.
function poserCoordonnees(latitude, longitude, options) {
  const o = etat.o;
  o.valeurs.latitude = texteCoordonnee(latitude); o.valeurs.longitude = texteCoordonnee(longitude);
  for (const cle of ['latitude', 'longitude']) { const champ = document.getElementById(`o-${cle}`); if (champ) champ.value = o.valeurs[cle]; }
  placerRepere(options);
}
async function monterCarte() {
  const o = etat.o;
  if (!o || o.chargement || o.carte === 'absente' || (carteP && carteP.pour === o)) return;
  try { await chargerLeaflet(); } catch (err) {
    // Sans carte, le volet reste utilisable : coordonnées en chiffres et adresse retrouvée.
    if (etat.o === o) { o.carte = 'absente'; dessinerFenetre(); }
    return;
  }
  const zone = document.getElementById('carteP');
  if (etat.o !== o || !zone || (carteP && carteP.pour === o)) return;
  demonterCarte();
  try {
    zone.textContent = '';
    const lieu = lieuSaisi(o);
    // Dans un volet qui défile, la molette ne zoome pas : les boutons de zoom suffisent.
    const carte = window.L.map(zone, { scrollWheelZoom: false }).setView(lieu || [47.0, -71.5], lieu ? 13 : 6);
    coucheDuSite(etat.cleCarte).addTo(carte);
    carteP = { pour: o, carte, zone, repere: null };
    carte.on('click', (evenement) => {
      if (etat.o !== o || o.enCours || !peut()) return;
      poserCoordonnees(evenement.latlng.lat, evenement.latlng.lng);
    });
    o.carte = 'prete';
    placerRepere();
  } catch (err) {
    demonterCarte(); o.carte = 'absente'; dessinerFenetre();
  }
}

function blocFusion() {
  const o = etat.o; const F = P.fusion;
  const fige = o.enCours ? ' disabled' : '';
  const autres = o.d.autres || [];
  const vers = autres.find((x) => x.id === o.fusionVers);
  const total = o.d.ressources.length; const ecartees = o.d.ressources.filter((r) => r.statut === 'ecartee').length;
  return `<div class="sep"><h3 style="margin-bottom:.4rem">${e(F.titre)}</h3>
    <div class="row"><select id="fusionVers" aria-label="${e(F.garder)}" style="flex:1 1 220px;width:auto"${fige}><option value="">${e(F.choisir)}</option>${autres.map((x) => option(x.id, o.fusionVers, x.nom)).join('')}</select>
      <button type="button" class="btn sm" data-act="o-fusion-demander"${fige}>${e(F.bouton)}</button></div>
    ${o.confirmation && vers ? `<div class="confirm" id="confirmationFusion" style="margin-top:.6rem"><span>${e(F.confirmer(o.d.porteur.nom, vers.nom, total, ecartees))}</span><button type="button" class="btn sm" data-act="o-fusion-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="o-fusionner"${fige}>${e(o.enCours ? T.enCours : F.bouton)}</button></div>` : ''}
    <p class="muted small" style="margin-top:.5rem">${e(F.aide)}</p></div>`;
}
function contenuPorteur() {
  const o = etat.o;
  const fermer = `<button type="button" class="btn sm x" data-act="fermer">${e(T.fermer)}</button>`;
  if (o.chargement) return `<div class="row"><p class="muted" role="status">${e(T.chargement)}</p>${fermer}</div>`;
  const p = o.d.porteur;
  const fige = !peut() || o.enCours ? ' disabled' : '';
  const note = o.note ? `<div class="note ${o.note.sorte}" id="noteFenetre" role="alert" tabindex="-1">${e(o.note.texte)}</div>` : '';
  const erreur = (cle) => (o.erreurs[cle] ? `<span class="err" role="alert">${e(o.erreurs[cle])}</span>` : '');
  const champ = (cle, nom, large, extra) => `<label class="f${large ? ' wide' : ''}" for="o-${cle}">${e(nom)}<input type="text" id="o-${cle}" data-o="${cle}" value="${e(o.valeurs[cle])}" autocomplete="off"${extra || ''}${fige}>${erreur(cle)}</label>`;
  const bottin = p.bottin ? `<div class="f wide"><span>${e(p.bottin.nom ? P.bottin(p.bottin.nom) : P.lieBottin)}</span><span class="muted small" style="font-weight:400">${e(P.bottinAide)}</span></div>` : '';
  const liste = o.d.ressources;
  const ressources = o.nouvelle ? '' : `<div class="sep"><h3 style="margin-bottom:.4rem">${e(P.ressourcesPortees(liste.length))}</h3>${liste.length
    ? `<div class="list">${liste.map((r) => `<div><button type="button" class="linkish grow" data-act="ouvrir-fiche" data-id="${e(r.id)}">${e(r.nom || T.sansNom)}</button>${r.statut === 'ecartee' ? `<span class="pill p-mute">${e(P.ecartee)}</span>` : ''}${pastilleType(r.typePrincipal)}</div>`).join('')}</div><p class="muted small" style="margin-top:.5rem">${e(P.renommerAide)}</p>`
    : `<p class="muted small">${e(P.aucuneRessource)}</p>`}</div>`;
  return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><h2 id="titreFenetre">${e(o.nouvelle ? P.ajouter : p.nom || T.sansNom)}</h2>
      ${o.nouvelle ? '' : `<span class="row" style="margin-top:.2rem">${p.place ? `<span class="pill p-ok">${e(P.placeSurLaCarte)}</span>` : `<span class="pill p-warn">${e(P.aPlacerSurLaCarte)}</span>`}</span>`}</div>${fermer}</div>
    ${note}
    <div class="fields">${champ('nom', P.nom, true, ' maxlength="200"')}${champ('adresse', P.adresse, true, ' maxlength="300"')}
      ${peut() ? `<div class="f wide" style="margin-top:-.2rem"><span class="row"><button type="button" class="btn primary" data-act="o-retrouver"${fige}>${e(P.retrouver)}</button><span class="muted small" style="font-weight:400">${e(P.retrouverSous)}</span></span></div>` : ''}${bottin}
      ${champ('latitude', P.latitude, false, ' inputmode="decimal" maxlength="24"')}${champ('longitude', P.longitude, false, ' inputmode="decimal" maxlength="24"')}
      ${o.erreurs.coordonnees ? `<span class="err wide" role="alert">${e(o.erreurs.coordonnees)}</span>` : ''}</div>
    ${o.carte === 'absente' ? `<div class="note warn">${e(P.carteAbsente)}</div>` : `<div class="map"><div class="carte-porteur" id="carteP" role="application" aria-label="${e(P.carteTitre)}">${e(P.carteChargement)}</div></div>`}
    ${peut() ? `${o.carte === 'absente' ? '' : `<p class="muted small">${e(P.carteAide)}</p>`}
    <div class="row"><button type="button" class="btn primary" data-act="o-enregistrer"${fige}>${e(o.enCours ? T.enCours : o.nouvelle ? P.creer : P.enregistrer)}</button></div>` : ''}
    ${ressources}${o.nouvelle || !peut() ? '' : blocFusion()}`;
}

let ouverturePorteur = 0;
// id : le repère du porteur, ou null pour en ajouter un.
async function ouvrirPorteur(id) {
  if (fenetreOuverte() && !fermerFenetre()) return;
  const moi = ++ouverturePorteur;
  const o = voletNeuf(id);
  etat.o = o;
  if (id === null) {
    poserPorteur({ porteur: { id: null, nom: '', adresse: '', latitude: null, longitude: null, place: false, bottin: null }, ressources: [], autres: [] });
    dessinerFenetre();
    const nom = document.getElementById('o-nom'); if (nom) nom.focus();
    return;
  }
  dessinerFenetre();
  const bouton = $('#layer .x'); if (bouton) bouton.focus();
  const r = await appel('porteur', { query: { porteur: id } });
  if (moi !== ouverturePorteur || etat.o !== o) return;
  if (r.code === 401) return afficherEntree(null);
  if (!r.ok) {
    etat.o = null; dessinerFenetre();
    message(r.code === 404 ? P.messages.introuvable : T.indisponible);
    if (r.code === 404) charger();
    return;
  }
  poserPorteur(r.donnees);
  dessinerFenetre();
  const fermer = $('#layer .x'); if (fermer) fermer.focus();
}
// Ce que le serveur a répondu à un geste qui n'a pas réussi : le volet et la saisie restent à l'écran.
function echecPorteur(r) {
  const o = etat.o; const code = r.donnees.code;
  if (r.code === 401) return noter('warn', T.sessionExpiree);
  if (r.code === 403) { noter('warn', T.roleInsuffisant); return relireMoi(); }
  if ((code === 'invalide' || code === 'doublon') && r.donnees.erreurs) {
    o.erreurs = { ...r.donnees.erreurs };
    const E = o.erreurs;
    return noter('bad', E._ || E.nom || E.adresse || E.coordonnees || T.erreursEnHaut);
  }
  if (code === 'introuvable') {
    etat.o = null; dessinerFenetre();
    message(P.messages.introuvable);
    return charger();
  }
  if (code === 'occupee') return noter('warn', P.messages.occupee);
  return noter('bad', T.indisponible);
}
async function enregistrerPorteur() {
  const o = etat.o;
  if (!o || !o.d || o.enCours || !peut()) return;
  const nom = o.valeurs.nom.replace(/\s+/g, ' ').trim();
  const latitude = coordonnee(o.valeurs.latitude); const longitude = coordonnee(o.valeurs.longitude);
  const erreurs = {};
  if (!nom) erreurs.nom = P.messages.nomRequis;
  if ((latitude === null) !== (longitude === null) || Number.isNaN(latitude) || Number.isNaN(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) erreurs.coordonnees = P.messages.coordonnees;
  if (Object.keys(erreurs).length) {
    o.erreurs = erreurs; o.note = null; dessinerFenetre();
    const fautif = document.getElementById(erreurs.nom ? 'o-nom' : 'o-latitude'); if (fautif) fautif.focus();
    return;
  }
  if (!o.nouvelle && !saisiePorteur()) return message(P.messages.rien);
  const valeurs = { nom, adresse: o.valeurs.adresse.replace(/\s+/g, ' ').trim(), latitude, longitude };
  o.enCours = true; o.erreurs = {}; o.note = null; o.confirmation = false; dessinerFenetre();
  const r = await appel(o.nouvelle ? 'creer-porteur' : 'enregistrer-porteur', { corps: o.nouvelle ? { valeurs } : { porteur: o.id, valeurs } });
  if (etat.o !== o) return;
  o.enCours = false;
  if (!r.ok) return echecPorteur(r);
  if (o.nouvelle) {
    etat.o = null; dessinerFenetre();
    message(P.messages.cree);
    return charger();
  }
  // Enregistré : le volet se ferme, le message dit où en est le porteur, et la liste se relit.
  etat.o = null; dessinerFenetre();
  message(r.donnees.inchange ? P.messages.inchange : latitude !== null ? P.messages.enregistrePlace : P.messages.enregistreAPlacer);
  charger();
}
async function retrouverAdresse() {
  const o = etat.o;
  if (!o || !o.d || o.enCours || !peut()) return;
  const adresse = o.valeurs.adresse.replace(/\s+/g, ' ').trim();
  if (!adresse) { message(P.messages.adresseDabord); const champ = document.getElementById('o-adresse'); if (champ) champ.focus(); return; }
  o.enCours = true; o.note = null; dessinerFenetre();
  const r = await appel('geocoder', { corps: { adresse } });
  if (etat.o !== o) return;
  o.enCours = false;
  if (r.ok) {
    o.erreurs = {};
    dessinerFenetre();
    poserCoordonnees(Number(r.donnees.latitude), Number(r.donnees.longitude), { centrer: true });
    return message(P.messages.adresseRetrouvee);
  }
  if (r.donnees.code === 'adresse-introuvable') return noter('warn', P.messages.adresseIntrouvable);
  return echecPorteur(r);
}
// Un geste de masse : le serveur s'arrête quand son temps est compté, et la suite s'enchaîne ici.
// Renvoie la dernière réponse et le nombre de fiches faites en tout.
async function enchainer(action, corps, encore) {
  let faites = 0; let r;
  for (let tour = 0; tour < 15; tour++) {
    r = await appel(action, { corps });
    faites += Number(r.donnees.faites) || 0;
    if (r.ok || r.donnees.code !== 'a-poursuivre' || !encore()) break;
  }
  return { r, faites };
}
const ARRETS = ['interrompue', 'occupee', 'a-poursuivre'];
async function fusionnerPorteur() {
  const o = etat.o;
  if (!o || !o.d || o.nouvelle || o.enCours || !peut() || !o.fusionVers) return;
  const vers = (o.d.autres.find((x) => x.id === o.fusionVers) || {}).nom || '';
  o.enCours = true; o.note = null; dessinerFenetre();
  const { r, faites } = await enchainer('fusionner-porteurs', { doublon: o.id, garde: o.fusionVers }, () => etat.o === o);
  if (etat.o !== o) { charger(); return; }
  o.enCours = false;
  if (r.ok) {
    etat.o = null; dessinerFenetre();
    message(P.fusion.faite(faites, vers, r.donnees.historique !== false));
    chargerCompteurs();
    return charger();
  }
  if (ARRETS.includes(r.donnees.code)) {
    // La confirmation reste ouverte : relancer reprend là où la fusion s'est arrêtée.
    noter('warn', P.fusion.arretee(faites, Number(r.donnees.restantes) || 0) + (r.donnees.sansVersion ? P.fusion.sansVersion : ''));
    charger();
    // Les ressources encore rattachées sont relues, pour que la confirmation dise ce qui reste ; la saisie n'est pas touchée.
    const relu = await appel('porteur', { query: { porteur: o.id } });
    if (etat.o === o && relu.ok && !o.enCours) { o.d = relu.donnees; dessinerFenetre(); }
    return undefined;
  }
  o.confirmation = false;
  return echecPorteur(r);
}
// Les gestes du volet d'un porteur. Pendant un envoi, rien d'autre ne bouge.
function gesteVolet(act) {
  const o = etat.o;
  if (!o.d || o.enCours || !peut()) return;
  if (act === 'o-enregistrer') return enregistrerPorteur();
  if (act === 'o-retrouver') return retrouverAdresse();
  if (act === 'o-fusion-annuler') { o.confirmation = false; return dessinerFenetre(); }
  if (act === 'o-fusionner') return fusionnerPorteur();
  if (act === 'o-fusion-demander') {
    if (!o.fusionVers) { message(P.fusion.choisirDabord); const choix = $('#fusionVers'); if (choix) choix.focus(); return; }
    o.confirmation = true; dessinerFenetre();
    const zone = $('#confirmationFusion');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const oui = zone.querySelector('.danger'); if (oui) oui.focus(); }
  }
}

// ─── Qualité des données ───
// La ligne d'un point : son texte et ses boutons. Chaque ligne mène à sa correction.
function ligneQualite(p) {
  const fige = !peut() || etat.q.enCours ? ' disabled' : '';
  const ouvrirFiche = (fiche) => `<button type="button" class="btn sm" data-act="ouvrir-fiche" data-id="${e(fiche.id)}">${e(Q.ouvrirFiche)}</button>`;
  const voir = (id) => `<button type="button" class="btn sm primary" data-act="ouvrir" data-id="${e(id)}">${e(Q.voirProposition)}</button>`;
  const nom = (fiche) => fiche.nom || T.sansNom;
  if (p.sujet === 'sansContact') return { texte: Q.sansContact(nom(p.fiche)), boutons: ouvrirFiche(p.fiche) };
  if (p.sujet === 'sansPorteur') return { texte: Q.sansPorteur(nom(p.fiche)), boutons: ouvrirFiche(p.fiche) };
  if (p.sujet === 'sansLogo') return { texte: Q.sansLogo(nom(p.fiche), !!p.proposition), boutons: (p.proposition ? voir(p.proposition) : '') + ouvrirFiche(p.fiche) };
  if (p.sujet === 'liens') {
    return { texte: Q.lien(nom(p.fiche), p.lien, jour(p.depuis)), boutons: `<button type="button" class="btn sm" data-act="q-revisiter" data-id="${e(p.fiche.id)}"${fige}>${e(etat.q.enCours === `lien:${p.fiche.id}` ? T.enCours : Q.revisiter)}</button>${ouvrirFiche(p.fiche)}` };
  }
  if (p.sujet === 'aVerifier') {
    return { texte: p.verifieeLe ? Q.ancienne(nom(p.fiche), jour(p.verifieeLe)) : Q.jamais(nom(p.fiche)), boutons: `<button type="button" class="btn sm primary" data-act="q-verifier" data-id="${e(p.fiche.id)}"${fige}>${e(Q.verifier)}</button>${ouvrirFiche(p.fiche)}` };
  }
  if (p.sujet === 'doublons') {
    const garder = (de, vers, principal) => `<button type="button" class="btn sm${principal ? ' primary' : ''}" data-act="q-garder" data-k="${e(p.cle)}" data-de="${e(de)}" data-vers="${e(vers)}"${fige}>${e(Q.garder(vers))}</button>`;
    const c = etat.q.confirmation;
    const demandee = c && c.cle === p.cle && [p.garder, p.retirer].includes(c.de) && [p.garder, p.retirer].includes(c.vers);
    return {
      // Deux écritures seulement proches (l'une contient l'autre) peuvent être deux normes : aucun bouton n'est mis en avant.
      texte: (p.sur === false ? Q.proche : Q.doublon)(libelle(p.cle), Q.ecriture(p.retirer, Number(p.fiches.retirer)), Q.ecriture(p.garder, Number(p.fiches.garder))),
      boutons: garder(p.retirer, p.garder, p.sur !== false) + garder(p.garder, p.retirer, false),
      suite: demandee ? `<div class="confirm" id="confirmationQualite"><span>${e(Q.confirmer(c.de, c.vers, Number(p.toutes[c.de === p.garder ? 'garder' : 'retirer'])))}</span><button type="button" class="btn sm" data-act="q-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="q-remplacer"${fige}>${e(etat.q.enCours ? T.enCours : Q.remplacer)}</button></div>` : '',
    };
  }
  if (p.sujet === 'porteursDoubles') return { texte: Q.porteurs(p.porteur.nom, p.autre.nom), boutons: `<button type="button" class="btn sm" data-act="ouvrir-porteur" data-id="${e(p.porteur.id)}">${e(Q.ouvrirPorteur)}</button>` };
  if (p.sujet === 'valeursNouvelles') return { texte: Q.valeur(p.valeur, libelle(p.cle), p.proposition.nom || T.sansNom), boutons: `<button type="button" class="btn sm" data-act="ouvrir" data-id="${e(p.proposition.id)}">${e(Q.voirProposition)}</button>` };
  return null;
}
// Les sujets qui portent sur une fiche : ils se lisent fiche par fiche, « ce qui lui manque ».
const SUJETS_FICHE = ['aRevoir', 'sansContact', 'sansPorteur', 'sansLogo', 'liens', 'aVerifier'];
// Ceux qui comptent dans la pastille ; « à vérifier » est un état de fond, vu seulement par son filtre.
const SUJETS_COMPTES = ['aRevoir', 'sansContact', 'sansPorteur', 'sansLogo', 'liens'];
const AUTRES_SUJETS = ['doublons', 'porteursDoubles', 'valeursNouvelles'];

// Les fiches et ce qui leur manque : { fiche, points : { sujet : le point } }, les plus incomplètes d'abord.
function fichesQualite() {
  const parFiche = new Map();
  for (const p of etat.points || []) {
    if (!SUJETS_FICHE.includes(p.sujet) || !p.fiche) continue;
    if (!parFiche.has(p.fiche.id)) parFiche.set(p.fiche.id, { fiche: p.fiche, points: {} });
    parFiche.get(p.fiche.id).points[p.sujet] = p;
  }
  const poids = (x) => SUJETS_COMPTES.filter((sujet) => x.points[sujet]).length;
  return [...parFiche.values()].sort((a, b) => poids(b) - poids(a) || String(a.fiche.nom).localeCompare(String(b.fiche.nom), 'fr'));
}
function pastillesManque(x, filtre) {
  const P2 = Q.manque;
  const sortes = { aRevoir: 'p-info', sansContact: 'p-warn', sansPorteur: 'p-warn', sansLogo: 'p-warn', liens: 'p-bad', aVerifier: 'p-mute' };
  return SUJETS_FICHE.filter((sujet) => x.points[sujet] && (sujet !== 'aVerifier' || filtre === 'aVerifier')).map((sujet) => {
    const p = x.points[sujet];
    const texte = sujet === 'aRevoir' ? P2.aRevoir(p.note || '') : sujet === 'liens' ? P2.liens(jour(p.depuis)) : sujet === 'aVerifier' ? (p.verifieeLe ? P2.ancienne(jour(p.verifieeLe)) : P2.jamais) : sujet === 'sansLogo' && p.proposition ? P2.logoPropose : P2[sujet];
    return `<span class="pill ${sortes[sujet]}">${e(texte)}</span>`;
  }).join(' ');
}
function tableQualite(filtre) {
  const fige = !peut() || etat.q.enCours ? ' disabled' : '';
  const rech = plier((etat.q.rech || '').trim());
  const lignes = fichesQualite().filter((x) => (filtre ? x.points[filtre] : SUJETS_COMPTES.some((sujet) => x.points[sujet])) && (!rech || plier(x.fiche.nom).includes(rech)));
  if (!lignes.length) return `<section class="card"><p class="muted">${e(rech ? Q.aucuneFiche : Q.rienIci)}</p></section>`;
  return `${filtre === 'liens' ? `<p class="muted small">${e(Q.liensAide)}</p>` : ''}${filtre === 'aVerifier' ? `<p class="muted small">${e(Q.aVerifierAide)}</p>` : ''}
    <div class="scroll"><table class="qtable"><thead><tr><th>${e(Q.colonnes.fiche)}</th><th>${e(Q.colonnes.manque)}</th><th></th></tr></thead><tbody>${lignes.map((x) => {
    const id = e(x.fiche.id);
    const lien = x.points.liens && filtre === 'liens' ? `<button type="button" class="btn sm" data-act="q-revisiter" data-id="${id}"${fige}>${e(etat.q.enCours === `lien:${x.fiche.id}` ? T.enCours : Q.revisiter)}</button>` : '';
    const verifier = x.points.aVerifier && filtre === 'aVerifier' ? `<button type="button" class="btn sm primary" data-act="q-verifier" data-id="${id}"${fige}>${e(Q.verifier)}</button>` : '';
    const proposition = x.points.sansLogo && x.points.sansLogo.proposition ? `<button type="button" class="btn sm" data-act="ouvrir" data-id="${e(x.points.sansLogo.proposition)}">${e(Q.voirProposition)}</button>` : '';
    return `<tr><td><b>${e(x.fiche.nom || T.sansNom)}</b></td><td><span class="row" style="gap:.3rem">${pastillesManque(x, filtre)}</span></td>
      <td><span class="row" style="justify-content:flex-end;flex-wrap:nowrap">${lien}${verifier}${proposition}<button type="button" class="btn sm" data-act="ouvrir-fiche" data-id="${id}">${e(Q.ouvrirFiche)}</button></span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function corpsQualite() {
  if (!etat.points) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const compte = (sujet) => etat.points.filter((p) => p.sujet === sujet).length;
  const fiches = fichesQualite();
  const total = fiches.filter((x) => SUJETS_COMPTES.some((sujet) => x.points[sujet])).length;
  const filtre = Object.keys(Q.sujets).includes(etat.q.filtre) && compte(etat.q.filtre) ? etat.q.filtre : '';
  const bouton = (cle, nom, n) => `<button type="button" class="chipf" data-act="q-filtre" data-v="${e(cle)}" aria-pressed="${filtre === cle}">${e(nom)} <span class="num">${Number(n)}</span></button>`;
  const filtres = `<div class="chipsf" role="group" aria-label="${e(Q.filtrer)}">${bouton('', Q.tout, total)}${Object.keys(Q.sujets).filter((sujet) => compte(sujet)).map((sujet) => bouton(sujet, Q.filtres[sujet], compte(sujet))).join('')}</div>`;
  if (!etat.points.length) return `<section class="card"><p class="muted">${e(Q.rien)}</p></section>`;
  const cartes = AUTRES_SUJETS.filter((sujet) => compte(sujet) && (!filtre || filtre === sujet)).map((sujet) => {
    const lignes = etat.points.filter((p) => p.sujet === sujet).map(ligneQualite).filter(Boolean);
    return `<section class="card"><div class="row" style="justify-content:space-between"><h2 class="qtitre">${e(Q.sujets[sujet])}</h2><span class="pill p-mute num">${lignes.length}</span></div>
      <div class="list">${lignes.map((l) => `<div><div class="grow">${e(l.texte)}</div><span class="row">${l.boutons}</span>${l.suite || ''}</div>`).join('')}</div></section>`;
  }).join('');
  const table = !filtre || SUJETS_FICHE.includes(filtre) ? `<h2 class="qtitre">${e(filtre ? Q.sujets[filtre] : Q.titreTout)}</h2>${tableQualite(filtre)}` : '';
  return `${filtres}${table}${cartes}`;
}
function ecranQualite() {
  return `<div class="head"><div><h1>${e(T.routes.qualite)}</h1><p>${e(Q.intro)}</p></div></div>
    <div class="tools"><input type="search" id="qq" placeholder="${e(Q.chercher)}" value="${e(etat.q.rech || '')}" aria-label="${e(Q.chercher)}"></div>
    <div id="qbody">${corpsQualite()}</div>`;
}
// Les compteurs de la barre latérale, lus sans rien bloquer : points de qualité et porteurs à placer.
async function chargerCompteurs() {
  const r = await appel('qualite');
  if (!r.ok || !etat.moi) return;
  etat.points = r.donnees.points || []; etat.compteurs = r.donnees.compteurs || null;
  if (route() === 'qualite' && !etat.q.enCours) rafraichir(); else dessinerNav();
}
// Un geste de l'écran Qualité : un seul à la fois, les boutons sont figés pendant l'envoi.
async function gesteQualite(cle, envoyer, reussite) {
  if (!peut() || etat.q.enCours) return;
  etat.q.enCours = cle; rafraichir();
  const retour = await envoyer();
  const r = retour.r || retour;
  etat.q.enCours = null;
  if (r.code === 401) return afficherEntree(null);
  if (r.ok) { etat.q.confirmation = null; message(reussite(r.donnees, retour.faites)); return charger(); }
  const code = r.donnees.code;
  if (r.code === 403) { message(T.roleInsuffisant); rafraichir(); return relireMoi(); }
  if (ARRETS.includes(code) && retour.r) message(Q.arretee(retour.faites, Number(r.donnees.restantes) || 0) + (r.donnees.sansVersion ? Q.sansVersion : ''));
  else if (code === 'occupee') message(Q.occupee);
  else if (code === 'introuvable') message(Q.introuvable);
  else message((code === 'invalide' && r.donnees.erreurs && r.donnees.erreurs._) || T.indisponible);
  return charger();
}
function gesteEcranQualite(act, cible) {
  const { id } = cible.dataset;
  if (act === 'q-filtre') { etat.q.filtre = cible.dataset.v || ''; etat.q.confirmation = null; return rafraichir(); }
  if (!peut() || etat.q.enCours) return undefined;
  if (act === 'q-verifier') return gesteQualite(`verifier:${id}`, () => appel('verifier', { corps: { fiche: id } }), () => Q.verifiee);
  if (act === 'q-revisiter') {
    return gesteQualite(`lien:${id}`, () => appel('revisiter-lien', { corps: { fiche: id } }), (d) => (d.etat === 'ignore' ? Q.lienIgnore : d.enPanne ? Q.lienToujours : Q.lienRevenu));
  }
  if (act === 'q-annuler') { etat.q.confirmation = null; return rafraichir(); }
  if (act === 'q-garder') {
    etat.q.confirmation = { cle: cible.dataset.k, de: cible.dataset.de, vers: cible.dataset.vers };
    rafraichir();
    const zone = $('#confirmationQualite');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const oui = zone.querySelector('.danger'); if (oui) oui.focus(); }
    return undefined;
  }
  if (act === 'q-remplacer' && etat.q.confirmation) {
    const { cle, de, vers } = etat.q.confirmation;
    return gesteQualite(`valeurs:${cle}`, () => enchainer('fusionner-valeurs', { cle, de, vers }, () => route() === 'qualite'), (d, faites) => Q.fusionnee(de, vers, faites, d.historique !== false));
  }
  return undefined;
}

// ─── Équipe : qui a accès, avec quel rôle, et le journal de ce que chacun a fait ───
const EQ = T.equipe;
// Vrai si une invitation est en cours d'écriture.
function saisieEquipe() { const i = etat.eq.invitation; return !!(i.courriel.trim() || i.nom.trim()); }
// Une personne de l'équipe : son résumé hebdomadaire, son rôle, et le retrait de son accès.
// Chacun règle son propre résumé ; le reste est réservé à l'Administration, jamais sur sa propre ligne.
function lignePersonne(x) {
  const q = etat.eq; const fige = q.enCours ? ' disabled' : '';
  const nom = x.nom || EQ.sansNom; const id = e(x.id);
  const autre = administre() && !x.moi;
  const resume = `<label class="switch mini"><input type="checkbox" role="switch" data-resume="${id}"${x.resume ? ' checked' : ''}${(administre() || x.moi) && !q.enCours ? '' : ' disabled'}><span>${e(EQ.recoitResume)}</span></label>`;
  const role = `<select data-role="${id}" aria-label="${e(EQ.roleDe(nom))}" style="width:auto"${autre && !q.enCours ? '' : ' disabled'}>${Object.keys(T.roles).map((r) => option(r, x.role, T.roles[r])).join('')}</select>`;
  const retirer = autre ? `<button type="button" class="btn sm danger" data-act="e-demander-retrait" data-id="${id}"${fige}>${e(EQ.retirer.bouton)}</button>` : '';
  const confirmation = autre && q.confirmation === x.id
    ? `<div class="confirm" id="confirmationEquipe"><span>${e(EQ.retirer.question(nom))}</span><button type="button" class="btn sm" data-act="e-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="e-retirer" data-id="${id}"${fige}>${e(q.enCours ? T.enCours : EQ.retirer.confirmer)}</button></div>` : '';
  return `<div><span class="avatar">${e(initiales(nom))}</span><div class="grow"><b>${e(nom)}</b>${x.moi ? ` <span class="pill p-mute">${e(EQ.vous)}</span>` : ''}<br><span class="muted small">${e(x.courriel)}</span></div>${resume}${role}${retirer}${confirmation}</div>`;
}
// Le formulaire d'invitation, pour l'Administration seulement.
function formulaireInvitation() {
  if (!administre()) return '';
  const q = etat.eq; const i = q.invitation; const I = EQ.inviter; const fige = q.enCours ? ' disabled' : '';
  const erreurs = ['courriel', 'nom', 'role'].filter((cle) => q.erreurs[cle]).map((cle) => `<span class="err" role="alert">${e(q.erreurs[cle])}</span>`).join('');
  return `<form id="invitation" class="sep invite" novalidate><h3>${e(I.titre)}</h3>
    <div class="row"><input type="email" id="invCourriel" maxlength="254" value="${e(i.courriel)}" placeholder="${e(I.indiceCourriel)}" aria-label="${e(I.courriel)}" autocomplete="off"${q.erreurs.courriel ? ' aria-invalid="true"' : ''}${fige}>
      <input type="text" id="invNom" maxlength="200" value="${e(i.nom)}" placeholder="${e(I.indiceNom)}" aria-label="${e(I.nom)}" autocomplete="off"${q.erreurs.nom ? ' aria-invalid="true"' : ''}${fige}>
      <select id="invRole" aria-label="${e(I.role)}"${fige}>${['approbation', 'lecture', 'administration'].map((r) => option(r, i.role, T.roles[r])).join('')}</select>
      <button type="submit" class="btn primary"${fige}>${e(q.enCours === 'inviter' ? T.enCours : I.bouton)}</button></div>
    ${erreurs}<p class="muted small">${e(I.aide)}</p></form>`;
}
// La couleur du point devant chaque ligne du journal, selon la famille du geste.
const TEINTES_GESTE = {
  'Approbation': 'ok', 'Fiche republiée': 'ok', 'Fiche vérifiée': 'ok', 'Invitation': 'ok', 'Fiche créée': 'ok', 'Porteur créé': 'ok',
  'Refus': 'bad', 'Fiche écartée': 'bad', 'Personne retirée': 'bad',
  'Second regard': 'warn', 'Fiche à revoir': 'warn', 'Modification proposée': 'warn', 'Rôle changé': 'warn',
  'Mode d\'essai changé': 'warn',
};
const pointGeste = (geste) => `<span class="pt pt-${TEINTES_GESTE[geste] || 'info'}" aria-hidden="true"></span>`;
function journalDeLEquipe() {
  const j = etat.equipe.journal; const J = EQ.journal;
  if (!j.actif) return `<p class="muted">${e(J.absent)}</p>`;
  if (!j.lu) return `<div class="note warn">${e(J.illisible)}</div>`;
  if (!j.lignes.length) return `<p class="muted">${e(J.vide)}</p>`;
  return `<p class="muted small">${e(J.intro)}</p><div class="list">${j.lignes.map((l) => `<div>${pointGeste(l.geste)}<div class="grow"><b class="qui">${e(l.qui || J.ancienMembre)}</b> ${e(l.phrase)}</div><span class="muted small">${e(jourEtHeure(l.le))}</span></div>`).join('')}</div>`;
}
function corpsEquipe() {
  if (!etat.equipe) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const { personnes, resume } = etat.equipe;
  const recoivent = personnes.filter((x) => x.resume).length;
  return `<section class="card"><div class="row" style="justify-content:space-between"><h3>${e(EQ.acces)}</h3><span class="muted small">${e(EQ.resumeCompte(recoivent, personnes.length, resume.jour))}</span></div>
      <div class="list">${personnes.map(lignePersonne).join('')}</div>
      ${formulaireInvitation()}
      <p class="muted small">${Object.keys(T.roles).map((r) => `<b>${e(T.roles[r])}</b> : ${e(EQ.permis[r])}`).join(' ')}</p></section>
    <section class="card"><h3>${e(EQ.journal.titre)}</h3>${journalDeLEquipe()}</section>`;
}
function ecranEquipe() {
  return `<div class="head"><div><h1>${e(T.routes.equipe)}</h1><p>${e(EQ.intro)}</p></div></div><div id="ebody">${corpsEquipe()}</div>`;
}
// Redessine l'écran en gardant le focus là où il était : ce qui est écrit dans l'invitation est dans l'état.
function redessinerEquipe() {
  const zone = $('#ebody');
  if (!zone) return;
  const actif = zone.contains(document.activeElement) ? document.activeElement : null;
  const repere = actif ? { id: actif.id, role: actif.dataset.role, resume: actif.dataset.resume, act: actif.dataset.act, pour: actif.dataset.id } : null;
  let curseur = null;
  try { if (actif && actif.type === 'text') curseur = [actif.selectionStart, actif.selectionEnd]; } catch (err) { /* sans position */ }
  zone.innerHTML = corpsEquipe();
  if (!repere) return;
  const pareil = (x) => (repere.id ? x.id === repere.id : repere.role ? x.dataset.role === repere.role : repere.resume ? x.dataset.resume === repere.resume : x.dataset.act === repere.act && x.dataset.id === repere.pour);
  const retrouve = [...zone.querySelectorAll('button, input, select')].find((x) => !x.disabled && pareil(x));
  if (!retrouve) return;
  retrouve.focus({ preventScroll: true });
  try { if (curseur) retrouve.setSelectionRange(curseur[0], curseur[1]); } catch (err) { /* sans position */ }
}
// Un geste sur l'équipe : un seul à la fois, tout est figé pendant l'envoi. Le serveur vérifie tout.
async function gesteEquipe(cle, action, corps, reussite) {
  const q = etat.eq;
  if (q.enCours) return undefined;
  q.enCours = cle; q.erreurs = {}; redessinerEquipe();
  const r = await appel(action, { corps });
  q.enCours = null;
  if (r.ok) {
    q.confirmation = null;
    if (action === 'inviter') q.invitation = equipeNeuve().invitation;
    message(reussite(r.donnees));
    redessinerEquipe();
    return charger();
  }
  const code = r.donnees.code;
  if (r.code === 401) {
    // Session échue : l'invitation en cours d'écriture reste à l'écran.
    if (!saisieEquipe()) return afficherEntree(null);
    message(EQ.sessionExpiree);
    return redessinerEquipe();
  }
  q.confirmation = null;
  if (r.code === 403) { message(T.reserveAdministration); redessinerEquipe(); await relireMoi(); return charger(); }
  if (action === 'inviter' && r.donnees.erreurs && (code === 'invalide' || code === 'deja-inscrite')) {
    q.erreurs = { ...r.donnees.erreurs };
    redessinerEquipe();
    const fautif = $(q.erreurs.courriel ? '#invCourriel' : q.erreurs.nom ? '#invNom' : '#invRole');
    if (fautif) fautif.focus();
    return undefined;
  }
  message(code === 'soi-meme' ? EQ.soiMeme : code === 'derniere-administration' ? EQ.derniereAdministration : code === 'introuvable' ? EQ.introuvable : code === 'occupee' ? EQ.occupee : T.indisponible);
  // Les réglages reprennent ce que le serveur a vraiment gardé.
  redessinerEquipe();
  return charger();
}
const personneDe = (id) => ((etat.equipe && etat.equipe.personnes) || []).find((x) => x.id === id) || null;
function inviter() {
  const q = etat.eq; const i = q.invitation;
  if (!administre() || q.enCours) return undefined;
  const courriel = i.courriel.trim(); const nom = i.nom.replace(/\s+/g, ' ').trim();
  const erreurs = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) erreurs.courriel = T.courrielInvalide;
  if (!nom) erreurs.nom = EQ.inviter.nomRequis;
  if (Object.keys(erreurs).length) {
    q.erreurs = erreurs; redessinerEquipe();
    const fautif = $(erreurs.courriel ? '#invCourriel' : '#invNom');
    if (fautif) fautif.focus();
    return undefined;
  }
  return gesteEquipe('inviter', 'inviter', { courriel, nom, role: i.role }, (d) => (d.reactivee ? EQ.reactivee : EQ.invitee)(nom, !!d.courriel, d.essai === true));
}
function gesteEcranEquipe(act, cible) {
  const q = etat.eq; const x = personneDe(cible.dataset.id);
  if (q.enCours) return undefined;
  if (act === 'e-annuler') { q.confirmation = null; return redessinerEquipe(); }
  if (!administre() || !x || x.moi) return undefined;
  // Retirer une personne passe toujours par une confirmation.
  if (act === 'e-demander-retrait') {
    q.confirmation = x.id; redessinerEquipe();
    const zone = $('#confirmationEquipe');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const oui = zone.querySelector('.danger'); if (oui) oui.focus(); }
    return undefined;
  }
  if (act === 'e-retirer' && q.confirmation === x.id) return gesteEquipe(`retirer:${x.id}`, 'retirer', { personne: x.id }, () => EQ.retiree(x.nom || EQ.sansNom));
  return undefined;
}
// Un rôle choisi dans la liste, ou l'interrupteur du résumé hebdomadaire.
function reglageEquipe(cible) {
  const role = cible.dataset.role !== undefined;
  const x = personneDe(role ? cible.dataset.role : cible.dataset.resume);
  if (!x || etat.eq.enCours) return redessinerEquipe();
  const nom = x.nom || EQ.sansNom;
  if (role) {
    if (!administre() || x.moi || !T.roles[cible.value] || cible.value === x.role) return redessinerEquipe();
    const choisi = cible.value;
    return gesteEquipe(`role:${x.id}`, 'changer-role', { personne: x.id, role: choisi }, () => EQ.roleChange(nom, T.roles[choisi]));
  }
  if (!administre() && !x.moi) return redessinerEquipe();
  const actif = cible.checked;
  return gesteEquipe(`resume:${x.id}`, 'regler-resume', { personne: x.id, actif }, () => (actif ? EQ.resumeActive : EQ.resumeArrete)(nom, x.moi));
}

// ─── Courriels : le mode d'essai, et le texte des six courriels automatiques ───
const CO = T.courriels;
const Gabarits = window.Gabarits;
const courrielChoisi = () => { const liste = (etat.courriels && etat.courriels.courriels) || []; return liste.find((c) => c.id === etat.co.choisi) || liste[0] || null; };
// Modifier demande le rôle Administration et la base « Réglages ».
const modifiable = () => administre() && !!etat.courriels && etat.courriels.reglages.actifs;
// Ce qui est écrit dans l'éditeur d'un courriel : le brouillon s'il y en a un, sinon le texte en vigueur.
const saisieDe = (c) => etat.co.brouillons[c.id] || { objet: c.objet, texte: c.texte };
const brouillonDiffere = (c) => { const b = etat.co.brouillons[c.id]; return !!b && (b.objet !== c.objet || b.texte !== c.texte); };
// Vrai si un texte de courriel est en cours d'écriture, sans être enregistré.
function saisieCourriels() { return !!etat.courriels && etat.courriels.courriels.some(brouillonDiffere); }

function blocEssai() {
  const d = etat.courriels; const x = d.essai; const co = etat.co; const fige = co.enCours ? ' disabled' : '';
  const origine = x.source === 'panneau' ? CO.essai.duPanneau(x.modifiePar, jour(x.modifieLe)) : x.source === 'vercel' ? CO.essai.deVercel : CO.essai.parPrecaution;
  const pastille = x.actif ? `<span class="pill p-warn">${e(T.envois.actif)}</span>` : `<span class="pill p-mute">${e(T.envois.arrete)}</span>`;
  const confirmation = co.confirmation === 'essai'
    ? `<div class="confirm" id="confirmationEssai"><span>${e(CO.essai.question)}</span><button type="button" class="btn sm" data-act="c-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="c-couper-essai"${fige}>${e(co.enCours ? T.enCours : CO.essai.couper)}</button></div>` : '';
  return `<section class="card"><div class="switch"><div><b>${e(CO.essai.titre)}</b><span class="muted small">${e(CO.essai.aide)}</span></div><input type="checkbox" role="switch" id="essaiMode" aria-label="${e(CO.essai.titre)}"${x.actif ? ' checked' : ''}${modifiable() && !co.enCours ? '' : ' disabled'}></div>
    <p class="small">${pastille} ${e(origine)}</p>
    <p class="muted small">${e(x.adresseDefinie ? CO.essai.adresseDefinie : CO.essai.sansAdresse(x.actif))}${d.service ? '' : ` ${e(CO.essai.sansService)}`}</p>${confirmation}</section>`;
}
function listeCourriels() {
  const choisi = courrielChoisi();
  return etat.courriels.courriels.map((c) => {
    const marque = brouillonDiffere(c) ? CO.nonEnregistre : c.ignore ? CO.ecarteCourt : c.modifie ? CO.modifieLe(jour(c.modifieLe), c.modifiePar) : '';
    return `<button type="button" data-act="c-choisir" data-id="${e(c.id)}" aria-pressed="${c.id === choisi.id}"><b>${e(c.nom)}</b><small>${e(c.quand)}</small>${marque ? `<small class="modif">${e(marque)}</small>` : ''}</button>`;
  }).join('');
}
// L'aperçu : le courriel rempli de valeurs d'exemple par la fonction qui sert aussi à l'envoi, montré
// dans un cadre sans scripts. Tout y est déjà échappé par cette fonction.
function apercuCourriel() {
  const c = courrielChoisi(); const s = saisieDe(c);
  const ex = Gabarits.exemple(c.id, location.origin);
  let rendu;
  try { rendu = Gabarits.rendre(c.id, s, ex.valeurs, ex); } catch (err) { return `<div class="pb muted">${e(CO.apercu.impossible)}</div>`; }
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;background:#ffffff}a{pointer-events:none}</style></head><body>${Gabarits.enveloppe(rendu.corps)}</body></html>`;
  const aQui = etat.courriels.essai.actif ? CO.apercu.versEssai : c.aQui.charAt(0).toLowerCase() + c.aQui.slice(1);
  return `<div class="subj"><b>${e(CO.apercu.a)}</b> ${e(aQui)}<br><b>${e(CO.apercu.objet)}</b> ${e(rendu.objet)}</div><iframe class="apercu-courriel" title="${e(CO.apercu.cadre)}" sandbox="" srcdoc="${e(page)}"></iframe>`;
}
function editeurCourriel() {
  const c = courrielChoisi(); const s = saisieDe(c); const co = etat.co; const m = modifiable();
  const fige = co.enCours ? ' disabled' : ''; const lecture = m ? '' : ' readonly';
  const erreur = (cle) => (co.erreurs[cle] ? `<span class="err" role="alert">${e(co.erreurs[cle])}</span>` : '');
  const puces = c.reperes.map((r) => `<button type="button" class="chip" data-act="c-repere" data-r="${e(r.repere)}" title="${e(r.aide)}"${m && !co.enCours ? '' : ' disabled'}>${e(r.repere)}</button>`).join('');
  const aides = c.reperes.map((r) => `<li><code>${e(r.repere)}</code> : ${e(r.aide)}${r.requis ? ` <b>(${e(CO.indispensable)})</b>` : ''}</li>`).join('');
  const stocke = c.modifie || !!c.ignore;
  const confirmation = co.confirmation === 'retablir'
    ? `<div class="confirm" id="confirmationCourriel"><span>${e(CO.retablir.question(c.nom))}</span><button type="button" class="btn sm" data-act="c-annuler"${fige}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="c-retablir"${fige}>${e(co.enCours ? T.enCours : CO.retablir.confirmer)}</button></div>` : '';
  const boutons = [
    m ? `<button type="button" class="btn primary" data-act="c-enregistrer"${fige}>${e(co.enCours === 'enregistrer' ? T.enCours : CO.enregistrer)}</button>` : '',
    administre() ? `<button type="button" class="btn" data-act="c-essayer"${fige}>${e(co.enCours === 'essayer' ? T.enCours : CO.essayer)}</button>` : '',
    m ? `<button type="button" class="btn" id="cAbandon" data-act="c-abandonner"${fige}${brouillonDiffere(c) ? '' : ' hidden'}>${e(CO.abandonner)}</button>` : '',
    m && stocke ? `<button type="button" class="btn" data-act="c-demander-retablir"${fige}>${e(CO.retablir.bouton)}</button>` : '',
  ].join('');
  return `<section class="card"><h2 class="qtitre">${e(c.nom)}</h2>
      <p class="muted small">${e(CO.envoye(c.aQui, c.quand))}${c.modifie ? ` ${e(CO.modifieLe(jour(c.modifieLe), c.modifiePar))}.` : ''}</p>
      ${c.ignore ? `<div class="note warn">${e(CO.ecarte)}</div>` : ''}
      <label class="f" for="mSubj">${e(CO.objet)}<input type="text" id="mSubj" maxlength="${Number(Gabarits.OBJET_MAX)}" value="${e(s.objet)}" autocomplete="off"${co.erreurs.objet ? ' aria-invalid="true"' : ''}${lecture}></label>${erreur('objet')}
      <label class="f" for="mBody">${e(CO.texte)}<textarea id="mBody" maxlength="${Number(Gabarits.TEXTE_MAX)}"${co.erreurs.texte ? ' aria-invalid="true"' : ''}${lecture}>${e(s.texte)}</textarea></label>${erreur('texte')}
      <div><h3 style="margin-bottom:.4rem">${e(CO.reperes)}</h3><div class="chips">${puces}</div>
        <ul class="muted small reperes">${aides}</ul><p class="muted small">${e(CO.reperesAide)}</p></div>
      ${boutons ? `<div class="row">${boutons}</div>` : ''}${confirmation}</section>
    <section><h3 style="margin-bottom:.5rem">${e(CO.apercu.titre)}</h3><p class="muted small" style="margin-bottom:.5rem">${e(CO.apercu.aide)}</p><div class="preview" id="mPrev">${apercuCourriel()}</div></section>`;
}
function corpsCourriels() {
  const d = etat.courriels;
  if (!d) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const avis = !d.reglages.actifs ? `<div class="note warn">${e(CO.sansBase)}</div>`
    : !d.reglages.lus ? `<div class="note warn">${e(CO.illisible)}</div>`
      : !administre() ? `<div class="note info">${e(CO.lectureSeule)}</div>` : '';
  return `${avis}${blocEssai()}
    <div class="mail"><div class="mlist" id="mList" role="group" aria-label="${e(CO.liste)}">${listeCourriels()}</div><div class="grid" style="gap:1rem">${editeurCourriel()}</div></div>`;
}
function ecranCourriels() {
  return `<div class="head"><div><h1>${e(T.routes.courriels)}</h1><p>${e(CO.intro)}</p></div></div><div id="cbody">${corpsCourriels()}</div>`;
}
// Redessine l'écran en gardant le focus et le curseur là où ils étaient : ce qui est écrit est dans l'état.
function redessinerCourriels() {
  const zone = $('#cbody');
  if (!zone) return;
  const actif = zone.contains(document.activeElement) ? document.activeElement : null;
  const repere = actif ? { id: actif.id, act: actif.dataset.act, pour: actif.dataset.id, r: actif.dataset.r } : null;
  let curseur = null; let defilement = 0;
  try { if (actif && (actif.id === 'mSubj' || actif.id === 'mBody')) { curseur = [actif.selectionStart, actif.selectionEnd]; defilement = actif.scrollTop; } } catch (err) { /* sans position */ }
  zone.innerHTML = corpsCourriels();
  if (!repere) return;
  const pareil = (x) => (repere.id ? x.id === repere.id : x.dataset.act === repere.act && x.dataset.id === repere.pour && x.dataset.r === repere.r);
  const retrouve = [...zone.querySelectorAll('button, input, textarea')].find((x) => !x.disabled && !x.hidden && pareil(x));
  if (!retrouve) return;
  retrouve.focus({ preventScroll: true });
  try { if (curseur) { retrouve.setSelectionRange(curseur[0], curseur[1]); retrouve.scrollTop = defilement; } } catch (err) { /* sans position */ }
}
// Chaque frappe est gardée dans l'état, sans redessiner l'éditeur : seuls l'aperçu et la liste suivent.
let minuterieApercu;
function saisirCourriel(cible) {
  const c = courrielChoisi();
  if (!c || !modifiable()) return;
  const s = { ...saisieDe(c), [cible.id === 'mSubj' ? 'objet' : 'texte']: cible.value };
  if (s.objet === c.objet && s.texte === c.texte) delete etat.co.brouillons[c.id]; else etat.co.brouillons[c.id] = s;
  const liste = $('#mList'); if (liste) liste.innerHTML = listeCourriels();
  const abandon = $('#cAbandon'); if (abandon) abandon.hidden = !brouillonDiffere(c);
  clearTimeout(minuterieApercu);
  minuterieApercu = setTimeout(() => { const zone = $('#mPrev'); if (zone && route() === 'courriels' && etat.courriels) zone.innerHTML = apercuCourriel(); }, 150);
}
function poserCourriel(vue) {
  if (!vue || !etat.courriels) return;
  const liste = etat.courriels.courriels; const i = liste.findIndex((x) => x.id === vue.id);
  if (i >= 0) liste[i] = vue;
}
// Un geste sur les courriels : un seul à la fois, les boutons sont figés pendant l'envoi. Le serveur vérifie tout.
async function gesteCourriels(cle, action, corps, reussite) {
  const co = etat.co;
  if (co.enCours) return undefined;
  co.enCours = cle; co.erreurs = {}; redessinerCourriels();
  const r = await appel(action, { corps });
  co.enCours = null;
  if (r.ok) { co.confirmation = null; reussite(r.donnees); return redessinerCourriels(); }
  if (r.code === 401) {
    // Session échue : le texte en cours d'écriture reste à l'écran.
    if (!saisieCourriels()) return afficherEntree(null);
    message(CO.sessionExpiree);
    return redessinerCourriels();
  }
  co.confirmation = null;
  if (r.code === 403) { message(T.reserveAdministration); redessinerCourriels(); await relireMoi(); return charger(); }
  const code = r.donnees.code;
  if (code === 'invalide' && r.donnees.erreurs) {
    co.erreurs = { ...r.donnees.erreurs }; message(CO.aCorriger); redessinerCourriels();
    const fautif = $(co.erreurs.objet ? '#mSubj' : '#mBody'); if (fautif) fautif.focus();
    return undefined;
  }
  message(code === 'reglages-absents' ? CO.sansBaseCourt : code === 'limite' ? CO.essaiLimite : code === 'sans-adresse' ? CO.essaiSansAdresse : code === 'envoi' ? CO.essaiEchec : code === 'introuvable' ? CO.introuvable : T.indisponible);
  redessinerCourriels();
  // L'écran reprend ce que le serveur dit vraiment.
  return code === 'reglages-absents' || code === 'introuvable' ? charger() : undefined;
}
// Le texte de l'éditeur, vérifié ici par la fonction que le serveur applique aussi. null s'il est à corriger.
function brouillonValide(c) {
  const v = Gabarits.valider(c.id, saisieDe(c));
  if (v.ok) return v.gabarit;
  etat.co.erreurs = { ...v.erreurs }; etat.co.confirmation = null; message(CO.aCorriger); redessinerCourriels();
  const fautif = $(v.erreurs.objet ? '#mSubj' : '#mBody'); if (fautif) fautif.focus();
  return null;
}
function gesteEcranCourriels(act, cible) {
  const co = etat.co; const c = courrielChoisi();
  if (co.enCours) return undefined;
  if (!etat.courriels || !c) return undefined;
  if (act === 'c-choisir') { co.choisi = cible.dataset.id; co.erreurs = {}; co.confirmation = null; return redessinerCourriels(); }
  if (act === 'c-annuler') { co.confirmation = null; return redessinerCourriels(); }
  if (!administre()) return undefined;
  if (act === 'c-essayer') {
    // Un brouillon s'essaie avant d'être enregistré ; sinon c'est le texte en vigueur qui part.
    const gabarit = brouillonDiffere(c) ? brouillonValide(c) : undefined;
    if (gabarit === null) return undefined;
    return gesteCourriels('essayer', 'essai-courriel', gabarit ? { id: c.id, objet: gabarit.objet, texte: gabarit.texte } : { id: c.id },
      (d) => message(d.simule ? CO.essaiSimule : d.essai ? CO.essaiVersEssai : CO.essaiEnvoye(etat.moi.courriel)));
  }
  if (!modifiable()) return undefined;
  // Couper le mode d'essai ne part que d'ici, après la confirmation affichée.
  if (act === 'c-couper-essai' && co.confirmation === 'essai') return gesteCourriels('essai-mode', 'mode-essai', { actif: false, confirme: true }, (d) => { poserEssai(d); message(d.inchange ? CO.essai.inchange : CO.essai.coupe); });
  if (act === 'c-repere') {
    const zone = $(co.champ === 'mSubj' ? '#mSubj' : '#mBody');
    if (!zone || zone.readOnly) return undefined;
    const r = cible.dataset.r;
    const debut = typeof zone.selectionStart === 'number' ? zone.selectionStart : zone.value.length;
    const fin = typeof zone.selectionEnd === 'number' ? zone.selectionEnd : debut;
    zone.value = zone.value.slice(0, debut) + r + zone.value.slice(fin);
    zone.focus(); zone.selectionStart = zone.selectionEnd = debut + r.length;
    return saisirCourriel(zone);
  }
  if (act === 'c-abandonner') { delete co.brouillons[c.id]; co.erreurs = {}; co.confirmation = null; return redessinerCourriels(); }
  if (act === 'c-enregistrer') {
    const gabarit = brouillonValide(c);
    if (!gabarit) return undefined;
    return gesteCourriels('enregistrer', 'enregistrer-courriel', { id: c.id, objet: gabarit.objet, texte: gabarit.texte }, (d) => {
      poserCourriel(d.courriel); delete co.brouillons[c.id];
      message(d.inchange ? CO.inchange : d.retabli ? CO.retabli(c.nom) : CO.enregistre(c.nom));
    });
  }
  // Rétablir le texte d'origine passe toujours par une confirmation.
  if (act === 'c-demander-retablir') {
    co.confirmation = 'retablir'; redessinerCourriels();
    const zone = $('#confirmationCourriel');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const oui = zone.querySelector('.danger'); if (oui) oui.focus(); }
    return undefined;
  }
  if (act === 'c-retablir' && co.confirmation === 'retablir') {
    return gesteCourriels('retablir', 'retablir-courriel', { id: c.id }, (d) => { poserCourriel(d.courriel); delete co.brouillons[c.id]; message(CO.retabli(c.nom)); });
  }
  return undefined;
}
function poserEssai(d) {
  if (!etat.courriels || d.inchange) return;
  etat.courriels.essai = { ...etat.courriels.essai, actif: d.actif, source: d.source, modifieLe: new Date().toISOString(), modifiePar: (etat.moi && etat.moi.nom) || null };
  // L'accueil sera relu : son bloc « Envois » ne garde pas l'ancien état.
  etat.accueil = null;
}
// L'interrupteur du mode d'essai. L'activer part tout de suite ; le couper ouvre d'abord la confirmation,
// et l'interrupteur reste où il était tant qu'elle n'est pas donnée.
function reglerEssai(cible) {
  const co = etat.co;
  if (!modifiable() || co.enCours) return redessinerCourriels();
  if (cible.checked) return gesteCourriels('essai-mode', 'mode-essai', { actif: true }, (d) => { poserEssai(d); message(d.inchange ? CO.essai.inchange : CO.essai.active); });
  co.confirmation = 'essai'; redessinerCourriels();
  const zone = $('#confirmationEssai');
  // Le focus va sur « Annuler » : un geste qui écrit au public ne doit pas partir d'une touche Entrée de trop.
  if (zone) { zone.scrollIntoView({ block: 'center' }); const non = zone.querySelector('[data-act="c-annuler"]'); if (non) non.focus(); }
  return undefined;
}

// ─── Export en CSV, à partir des fiches lues par le tableau ───
function lignesCsv(liste) {
  // Une cellule qui commencerait par un signe de formule est neutralisée pour les tableurs.
  const enCsv = (v) => {
    let texte = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
    return /[",\n\r;]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  return [T.ressources.csv.colonnes, ...liste.map((r) => [r.nom, r.typePrincipal || '', r.porteurs.join(' ; '), T.ressources.statuts[r.statut] || '', r.lien || '', r.contact || '', r.verifieeLe || '', r.versions])]
    .map((ligne) => ligne.map(enCsv).join(';'));
}
const fichesAExporter = () => fichesFiltrees(etat.csv.toutes);
function contenuCsv() {
  const C = T.ressources.csv;
  const lignes = lignesCsv(fichesAExporter());
  const portee = (cle, nom) => `<button type="button" data-act="csv-portee" data-v="${cle}" aria-pressed="${etat.csv.toutes === (cle === 'toutes')}">${e(nom)}</button>`;
  return `<div class="row"><h2 id="titreFenetre">${e(C.titre)}</h2><button type="button" class="btn sm x" style="margin-left:auto" data-act="fermer">${e(T.fermer)}</button></div>
    <div class="row"><span class="seg" role="group" aria-label="${e(C.portee)}">${portee('affichees', C.affichees(fichesFiltrees().length))}${portee('toutes', C.toutes((etat.fiches || []).length))}</span></div>
    <pre class="csv" id="csvApercu" tabindex="0">${e(lignes.slice(0, 7).join('\n'))}${lignes.length > 7 ? `\n${e(C.autres(lignes.length - 7))}` : ''}</pre>
    <p class="muted small">${e(C.resume(lignes.length - 1, C.colonnes.length))}</p>
    <div class="row"><button type="button" class="btn primary" data-act="csv-telecharger">${e(C.telecharger)}</button><button type="button" class="btn" data-act="csv-copier">${e(C.copier)}</button></div>`;
}
async function gesteCsv(act, v) {
  const C = T.ressources.csv;
  if (act === 'csv-portee') { etat.csv.toutes = v === 'toutes'; return dessinerFenetre(); }
  if (act !== 'csv-telecharger' && act !== 'csv-copier') return;
  const texte = lignesCsv(fichesAExporter()).join('\r\n');
  if (act === 'csv-copier') {
    try { await navigator.clipboard.writeText(texte); message(C.copie); } catch (err) { message(C.copieImpossible); }
    return;
  }
  // Le fichier est fabriqué dans le navigateur ; la marque d'ordre des octets fait lire les accents aux tableurs.
  const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([`﻿${texte}`], { type: 'text/csv;charset=utf-8' }));
  lien.download = C.fichier(aujourdhui);
  document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

// ─── Événements ───
document.addEventListener('click', async (evenement) => {
  const cible = evenement.target.closest('[data-act], #deconnexion, #boutonTheme');
  if (!cible) return;
  if (cible.id === 'boutonTheme') return changerTheme();
  if (cible.id === 'deconnexion') {
    if (fenetreOuverte() && !fermerFenetre()) return;
    await appel('deconnexion', { corps: {} });
    return afficherEntree(null);
  }
  const { act, id, k, v } = cible.dataset;
  const f = etat.f;
  if (act === 'reessayer') return demarrer();
  if (act === 'voir-propositions') { Object.assign(etat.filtres, { q: '', genre: '', type: '', affichage: 'colonnes' }); location.hash = 'propositions'; return; }
  if (act === 'affichage') { etat.filtres.affichage = v; return rendre(); }
  if (act === 'anciennes') { etat.filtres.anciennes = !etat.filtres.anciennes; return rafraichir(); }
  if (act === 'fermer') return fermerFenetre();

  // Cartes
  if (act === 'second-regard') { evenement.stopPropagation(); return demanderSecondRegard(id); }
  if (act === 'approuver-carte') { evenement.stopPropagation(); return deplacer(id, 'approuvee'); }
  if (act === 'refuser-carte') { evenement.stopPropagation(); return deplacer(id, 'refusee'); }
  if (act === 'ouvrir') return ouvrir(id);

  // Ressources : le tableau, puis les fenêtres de l'export et d'une fiche.
  if (act === 'ouvrir-fiche') return ouvrirFiche(id);
  if (act === 'nouvelle-fiche') return administre() ? ouvrirFiche(null) : undefined;
  if (act === 'csv') {
    if (fenetreOuverte() && !fermerFenetre()) return;
    etat.csv = { toutes: false }; dessinerFenetre();
    const bouton = $('#layer .x'); if (bouton) bouton.focus();
    return;
  }
  // Porteurs et qualité des données.
  if (act === 'ouvrir-porteur') { evenement.stopPropagation(); return ouvrirPorteur(id); }
  if (act === 'nouveau-porteur') return peut() ? ouvrirPorteur(null) : undefined;
  if (act === 'vue-porteurs') { etat.vueP = v === 'liste' ? 'liste' : 'colonnes'; return rendre(); }
  if (act && act.startsWith('q-')) return gesteEcranQualite(act, cible);
  if (act && act.startsWith('e-')) return gesteEcranEquipe(act, cible);
  if (act && act.startsWith('c-')) return gesteEcranCourriels(act, cible);
  if (etat.csv) return gesteCsv(act, v);
  if (etat.r) return gesteFenetreFiche(act, cible);
  if (etat.o) return gesteVolet(act);

  // Fenêtre : pendant un envoi, rien d'autre ne bouge.
  if (!f || !f.d || f.enCours) return;
  if (act === 'onglet') { if (f.edition && !garder()) return; f.onglet = v; return dessinerFenetre(); }
  if (act === 'corriger') return corriger(k);
  if (act === 'annuler-correction') { f.edition = null; f.brouillon = null; return dessinerFenetre(); }
  if (act === 'defaire') { f.valeurs[k] = cloner(f.depart[k]); delete f.erreurs[k]; return dessinerFenetre(); }
  if (act === 'garder') return garder();
  if (act === 'ajouter') return ajouterAuBrouillon();
  if (act === 'retirer') { f.brouillon.splice(Number(cible.dataset.i), 1); $('#etiquettes').innerHTML = etiquettesBrouillon(f.edition); const entree = $('#ajoutIn'); if (entree) entree.focus(); return; }
  if (act === 'option') {
    const choisies = new Set(f.brouillon || []);
    if (choisies.has(v)) choisies.delete(v); else choisies.add(v);
    f.brouillon = [...choisies];
    return cible.setAttribute('aria-pressed', String(choisies.has(v)));
  }
  if (act === 'logo') { f.sansLogo = !f.sansLogo; return dessinerFenetre(); }
  // « Approuver » ouvre la confirmation ; l'approbation ne part que du bouton de la confirmation.
  if (act === 'demander-approbation') {
    if (f.edition && !garder()) return;
    f.confirmation = 'approbation'; dessinerFenetre();
    const zone = $('#confirmationApprobation');
    if (zone) { zone.scrollIntoView({ block: 'center' }); const oui = zone.querySelector('[data-act="approuver"]'); if (oui) oui.focus(); }
    return;
  }
  if (act === 'approuver') return trancher('approuver');
  if (act === 'refuser') { f.confirmation = 'refus'; dessinerFenetre(); const zone = $('#refusTxt'); if (zone) { zone.focus(); zone.scrollIntoView({ block: 'center' }); } return; }
  if (act === 'annuler-confirmation') { f.confirmation = null; f.commentaire = ''; delete f.erreurs.commentaire; return dessinerFenetre(); }
  if (act === 'confirmer-refus') return trancher('refuser');
  if (act === 'avis') return donnerAvis(v);
  if (act === 'avis-modifier') { f.avisOuvert = true; dessinerFenetre(); const zone = $('#avisNote'); if (zone) zone.focus(); }
});

document.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter' && evenement.target && evenement.target.id === 'o-adresse' && etat.o && peut()) { evenement.preventDefault(); return void retrouverAdresse(); }
  const cible = evenement.target;
  if (evenement.key === 'Escape' && fenetreOuverte()) return void fermerFenetre();
  // Tab tourne dans la fenêtre ouverte, sans sortir vers la page derrière.
  if (evenement.key === 'Tab' && fenetreOuverte()) {
    const fenetre = $('#layer .modal, #layer .drawer');
    const atteignables = fenetre ? [...fenetre.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null) : [];
    if (!atteignables.length) return;
    const premier = atteignables[0]; const dernier = atteignables[atteignables.length - 1];
    const dedans = fenetre.contains(document.activeElement);
    if (evenement.shiftKey && (!dedans || document.activeElement === premier || document.activeElement === fenetre)) { evenement.preventDefault(); dernier.focus(); }
    else if (!evenement.shiftKey && (!dedans || document.activeElement === dernier)) { evenement.preventDefault(); premier.focus(); }
    return;
  }
  if (evenement.key === 'Enter' && cible.id === 'ajoutIn') { evenement.preventDefault(); return void ajouterAuBrouillon(); }
  if (evenement.key === 'Enter' && cible.dataset && cible.dataset.ajout && etat.r && etat.r.d && !etat.r.enCours) { evenement.preventDefault(); return void ajouterALaListe(cible.dataset.ajout); }
  if ((evenement.key === 'Enter' || evenement.key === ' ') && cible.matches && cible.matches('.mcard, tbody tr')) { evenement.preventDefault(); cible.click(); }
});

document.addEventListener('input', (evenement) => {
  const cible = evenement.target; const f = etat.f;
  if (cible.id === 'q') { etat.filtres.q = cible.value; return rafraichir(); }
  if (cible.id === 'qq') { etat.q.rech = cible.value; return rafraichir(); }
  if (cible.id === 'rq') { etat.filtresR.q = cible.value; return rafraichir(); }
  if (cible.id === 'pq') { etat.rechP = cible.value; return rafraichir(); }
  if (cible.id === 'noteRevoir' && etat.r) { etat.r.noteRevoir = cible.value; return; }
  // Écran Équipe : chaque frappe de l'invitation est gardée, sans redessiner.
  if (cible.id === 'invCourriel') { etat.eq.invitation.courriel = cible.value; return; }
  if (cible.id === 'invNom') { etat.eq.invitation.nom = cible.value; return; }
  // Écran Courriels : chaque frappe de l'objet ou du texte est gardée, et l'aperçu suit.
  if (cible.id === 'mSubj' || cible.id === 'mBody') return saisirCourriel(cible);
  // Volet d'un porteur : chaque frappe est gardée, et le repère suit les coordonnées écrites.
  const o = etat.o;
  if (o && o.d) {
    const cle = cible.dataset.o;
    if (CHAMPS_PORTEUR.includes(cle)) { o.valeurs[cle] = cible.value; if (cle === 'latitude' || cle === 'longitude') placerRepere(); }
    return;
  }
  // Fenêtre d'une fiche : chaque frappe est gardée, sans redessiner.
  const r = etat.r;
  if (r && r.d) {
    if (cible.dataset.ajout && PAR_CLE[cible.dataset.ajout]) { r.ajouts[cible.dataset.ajout] = cible.value; return; }
    if (PAR_CLE[cible.dataset.f] && cible.type !== 'checkbox' && cible.tagName !== 'SELECT') r.valeurs[cible.dataset.f] = cible.value;
    return;
  }
  if (!f) return;
  if (cible.id === 'refusTxt') { f.commentaire = cible.value; return; }
  if (cible.id === 'avisNote') { f.avisNote = cible.value; return; }
  if (cible.id === 'ajoutIn') { f.ajout = cible.value; return; }
  if (cible.dataset.adressePorteur !== undefined) { f.porteursNouveaux[cible.dataset.adressePorteur] = cible.value; return; }
  if (cible.id === 'corrIn' && cible.type !== 'checkbox') f.brouillon = cible.value;
});

document.addEventListener('change', (evenement) => {
  const cible = evenement.target; const f = etat.f;
  if (cible.id === 'fGenre') { etat.filtres.genre = cible.value; return rafraichir(); }
  if (cible.id === 'fType') { etat.filtres.type = cible.value; return rafraichir(); }
  if (cible.id === 'rType') { etat.filtresR.type = cible.value; return rafraichir(); }
  if (cible.id === 'rStatut') { etat.filtresR.statut = cible.value; return rafraichir(); }
  if (cible.id === 'essaiMode') return void reglerEssai(cible);
  if (cible.id === 'invRole') { if (T.roles[cible.value]) etat.eq.invitation.role = cible.value; return; }
  if (cible.dataset.role !== undefined || cible.dataset.resume !== undefined) return void reglageEquipe(cible);
  if (cible.id === 'fusionVers' && etat.o && etat.o.d && !etat.o.enCours) { etat.o.fusionVers = cible.value; etat.o.confirmation = false; return dessinerFenetre(); }
  const r = etat.r;
  if (r && r.d) {
    if (r.enCours) return;
    if (cible.id === 'vA' || cible.id === 'vB') { r[cible.id] = Number(cible.value); return dessinerFenetre(); }
    if (!peut()) return;
    if (cible.id === 'fportAdd' && cible.value) {
      if (!r.valeurs.porteurs.includes(cible.value)) r.valeurs.porteurs.push(cible.value);
      return redessinerListe('porteurs');
    }
    if (PAR_CLE[cible.dataset.f]) {
      if (cible.type === 'checkbox') r.valeurs[cible.dataset.f] = cible.checked;
      else if (cible.tagName === 'SELECT') r.valeurs[cible.dataset.f] = cible.value || null;
    }
    return;
  }
  if (!f || !f.d) return;
  if (cible.id === 'corrIn') { f.brouillon = cible.type === 'checkbox' ? cible.checked : cible.value; return; }
  if (cible.id === 'autreChamp' && cible.value && administre()) {
    const cle = cible.value;
    if (!PAR_CLE[cle]) return;
    if (f.edition && !garder()) return;
    if (!f.enPlus.includes(cle)) f.enPlus.push(cle);
    corriger(cle);
  }
});

document.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  if (evenement.target.id === 'demandeLien') demanderLien(evenement.target);
  if (evenement.target.id === 'invitation') inviter();
});

// Le dernier champ de l'éditeur de courriel où était le curseur : un repère s'y insère.
document.addEventListener('focusin', (evenement) => { const id = evenement.target && evenement.target.id; if (id === 'mSubj' || id === 'mBody') etat.co.champ = id; });

// Glisser une carte d'une colonne à l'autre.
document.addEventListener('dragstart', (evenement) => {
  const c = evenement.target.closest && evenement.target.closest('.mcard[draggable="true"]');
  if (c) evenement.dataTransfer.setData('text/plain', c.dataset.id);
});
document.addEventListener('dragover', (evenement) => {
  const c = evenement.target.closest && evenement.target.closest('[data-drop]');
  if (c && peut()) { evenement.preventDefault(); c.classList.add('over'); }
});
document.addEventListener('dragleave', (evenement) => {
  const c = evenement.target.closest && evenement.target.closest('[data-drop]');
  if (c && !c.contains(evenement.relatedTarget)) c.classList.remove('over');
});
document.addEventListener('drop', (evenement) => {
  const c = evenement.target.closest && evenement.target.closest('[data-drop]');
  if (!c) return;
  evenement.preventDefault(); c.classList.remove('over');
  deplacer(evenement.dataTransfer.getData('text/plain'), c.dataset.drop);
});

// Fermer l'onglet ou recharger la page avec une saisie en cours : le navigateur demande confirmation.
window.addEventListener('beforeunload', (evenement) => { if (saisieEnCours() || saisieEquipe() || saisieCourriels()) { evenement.preventDefault(); evenement.returnValue = ''; } });

// Changer d'écran. Une fenêtre avec une saisie en cours reste ouverte.
window.addEventListener('hashchange', () => {
  if (!etat.moi) return;
  if (fenetreOuverte() && !saisieEnCours()) { etat.f = null; etat.r = null; etat.csv = null; etat.o = null; dessinerFenetre(); }
  etat.q.confirmation = null; etat.eq.confirmation = null; etat.co.confirmation = null;
  rendre(); window.scrollTo(0, 0);
  charger();
});

// ─── Mode clair ou sombre ───
function theme() {
  return document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
// Le bouton montre seulement une icône : le soleil en mode sombre (pour passer au clair), la lune en mode clair.
const ICONE_SOLEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICONE_LUNE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
function libelleTheme() {
  const bouton = $('#boutonTheme'); const sombre = theme() === 'dark';
  bouton.classList.add('icone');
  bouton.innerHTML = sombre ? ICONE_SOLEIL : ICONE_LUNE;
  bouton.setAttribute('aria-label', sombre ? T.modeClair : T.modeSombre);
  bouton.title = sombre ? T.modeClair : T.modeSombre;
}
function changerTheme() {
  const nouveau = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nouveau);
  try { localStorage.setItem('rsn-theme', nouveau); } catch (err) { /* sans mémoire */ }
  libelleTheme();
  // L'aperçu de la fiche suit le mode choisi.
  if ((etat.f && etat.f.d && etat.f.onglet === 'apercu') || (etat.r && etat.r.d && etat.r.onglet === 'apercu')) dessinerFenetre();
}

// ─── Départ ───
async function demarrer() {
  dessinerBandeau();
  const jeton = new URLSearchParams(location.search).get('jeton');
  let lienRefuse = null;
  if (jeton) {
    // Le jeton quitte l'adresse tout de suite : il ne doit rester ni dans l'historique ni dans un signet.
    history.replaceState(null, '', location.pathname + location.hash);
    const r = await appel('session', { corps: { jeton } });
    // Le lien a déjà servi : une session ouverte plus tôt reste valable, d'où la lecture qui suit.
    if (r.code !== 200) lienRefuse = r.code === 401 ? T.lienExpire : T.indisponible;
  }
  const r = await appel('moi');
  if (r.code === 401 || (lienRefuse && !r.ok)) return afficherEntree(lienRefuse);
  if (!r.ok) { montrerCoque(false); return afficherPanne(); }
  etat.moi = r.donnees;
  rendre();
  charger();
  // Les pastilles « Porteurs » et « Qualité des données » de la barre latérale.
  if (route() !== 'qualite') chargerCompteurs();
}
demarrer();
})();
