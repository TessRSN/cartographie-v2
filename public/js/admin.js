/**
 * Page /admin : le panneau d'administration de la cartographie. Lot 1 : accueil et propositions.
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
const PAR_CLE = Object.fromEntries(CHAMPS.map((c) => [c.cle, c]));
const $ = (selecteur, racine) => (racine || document).querySelector(selecteur);

const ETATS = ['attente', 'verification', 'approuvee', 'refusee'];
const OUVERTS = ['attente', 'verification'];
const ROUTES = ['accueil', 'propositions'];
const TYPES = ['jeu', 'catalogue', 'plateforme', 'logiciel', 'service'];
const RELATIONS = ['faitPartieDe', 'reposeSur', 'donneAccesA', 'remplace'];
// Ce qu'il faut compléter pour une fiche que la personne a laissée à l'équipe.
const A_COMPLETER_RSN = ['typePrincipal', 'phrase', 'lien', 'porteurs'];

const etat = {
  moi: null,            // { nom, courriel, role, permis: { decider, administrer } }
  accueil: null,        // dernière lecture de l'accueil
  liste: null,          // dernière lecture des propositions
  nouvelles: null,      // compte pour la pastille de la barre latérale
  filtres: { q: '', genre: '', type: '', affichage: 'colonnes' },
  f: null,              // la fenêtre d'une proposition, quand elle est ouverte (voir fenetreNeuve)
};

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
  favorable: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>',
  defavorable: '<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z"/>',
};
const icone = (nom) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;
const classeAvis = (sens) => (sens === 'favorable' ? 'v-pour' : 'v-contre');

const option = (valeur, courante, nom) => `<option value="${e(valeur)}"${valeur === courante ? ' selected' : ''}>${e(nom || valeur)}</option>`;
const pastilleGenre = (genre) => `<span class="pill ${{ nouvelle: 'p-ok', modification: 'p-info', rsn: 'p-warn' }[genre] || 'p-mute'}">${e(T.genres[genre] || '')}</span>`;
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
  $('#nav').innerHTML = ROUTES.map((r) => `<a href="#${r}"${r === ici ? ' aria-current="page"' : ''}>${icone(r)}<span>${e(T.routes[r])}</span>${r === 'propositions' && etat.nouvelles ? `<span class="count">${Number(etat.nouvelles)}</span>` : ''}</a>`).join('');
}
function montrerCoque(avecNav) {
  $('#coque').classList.toggle('seule', !avecNav);
  $('#nav').hidden = !avecNav;
}

// ─── Entrée ───
function afficherEntree(avertissement) {
  etat.moi = null; etat.accueil = null; etat.liste = null; etat.nouvelles = null; etat.f = null;
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
    ? a.activite.map((x) => `<div><div class="grow">${x.sorte === 'verification' ? '' : `<b>${e(x.qui || T.activite.quelquun)}</b> `}${e(texteActivite(x))}</div><span class="muted small">${e(jourEtHeure(x.quand))}</span></div>`).join('')
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
function filtrees() {
  const { q, genre, type } = etat.filtres;
  const cherche = plier(q.trim());
  return (etat.liste || []).filter((p) => {
    if (genre && p.genre !== genre) return false;
    if (type && (!p.type || cleType(p.type) !== type)) return false;
    if (cherche && !plier(`${p.nom} ${p.nomProposant} ${p.courriel} ${T.genres[p.genre] || ''}`).includes(cherche)) return false;
    return true;
  });
}
function pucesAvis(avis) {
  if (!avis.length) return `<span class="muted small">${e(T.avis.aucunCarte)}</span>`;
  return `<span class="votes">${avis.map((a) => `<span class="vote ${classeAvis(a.sens)}" title="${e(T.avis.infobulle(a.nom, a.sens, a.commentaire))}">${icone(a.sens)}${e(initiales(a.nom))}</span>`).join('')}</span>`;
}
function carte(p) {
  let suite;
  const id = e(p.id);
  if (p.statut === 'attente') {
    suite = peut() ? `<span class="row"><button type="button" class="btn sm" data-act="second-regard" data-id="${id}">${e(T.secondRegard)}</button><button type="button" class="btn sm" data-act="approuver-carte" data-id="${id}">${e(T.approuver)}</button></span>` : '';
  } else if (p.statut === 'verification') {
    suite = `<span class="pill p-info">${e(T.enVerificationDepuis(jour(p.verificationLe)))}</span>${pucesAvis(p.avis)}`
      + (peut() ? `<span class="row"><button type="button" class="btn sm primary" data-act="approuver-carte" data-id="${id}">${e(T.approuver)}</button><button type="button" class="btn sm" data-act="refuser-carte" data-id="${id}">${e(T.refuser)}</button></span>` : '');
  } else {
    suite = `<span class="muted small">${e(T.decision(p.statut, p.decidePar, jour(p.decideLe), p.corrige))}</span>`;
  }
  const proposant = `${e(p.nomProposant || T.anonyme)}<br><span class="muted">${e(p.courriel || '')}</span>`;
  const recue = T.recueLe(jour(p.proposeLe)) + (p.nbChamps === null ? '' : ` · ${pluriel(p.nbChamps, T.champTouche, T.champsTouches)}`);
  return `<div class="mcard" role="button" tabindex="0" data-act="ouvrir" data-id="${id}"${peut() && ouverte(p) ? ' draggable="true"' : ''}>
    <span class="row" style="flex-wrap:nowrap;align-items:flex-start"><b>${e(p.nom || T.sansNom)}</b></span>
    <span class="row">${pastilleGenre(p.genre)}${pastilleType(p.type)}</span>
    <span class="small">${proposant}</span>
    ${p.genre === 'rsn' ? '' : `<span class="muted small">${e(T.liens[p.lienAvecRessource] || T.liens.aucun)}</span>`}
    <span class="muted small num">${e(recue)}</span>
    ${p.ressemble ? `<span class="pill p-warn">${e(T.ressemble.pastille)}</span>` : ''}
    ${suite}</div>`;
}
function corpsPropositions() {
  if (!etat.liste) return `<p class="muted" role="status">${e(T.chargement)}</p>`;
  const liste = filtrees();
  if (!liste.length) return `<div class="card"><p class="muted">${e(etat.liste.length ? T.aucunResultat : T.aucuneProposition)}</p></div>`;
  if (etat.filtres.affichage === 'colonnes') {
    return `<div class="cols c4">${ETATS.map((statut) => {
      const cartes = liste.filter((p) => p.statut === statut);
      return `<section class="col" data-drop="${statut}"><header><h3>${e(T.colonnes[statut])}</h3><span class="row"><span class="pill p-mute num">${cartes.length}</span></span></header>
        ${statut === 'verification' ? `<p class="muted small" style="padding:0 .2rem">${e(T.colonneVerificationAide)}</p>` : ''}
        ${cartes.map(carte).join('') || `<p class="muted small" style="padding:.4rem .2rem">${e(T.rienIci)}</p>`}</section>`;
    }).join('')}</div><p class="muted small">${e(peut() ? T.aideColonnes : T.aideColonnesLecture)}</p>`;
  }
  const C = T.tableau;
  return `<div class="scroll"><table><thead><tr><th>${e(C.ressource)}</th><th>${e(C.genre)}</th><th>${e(C.type)}</th><th>${e(C.par)}</th><th>${e(C.recue)}</th><th>${e(C.champs)}</th><th>${e(C.avis)}</th><th>${e(C.etat)}</th></tr></thead><tbody>${liste.map((p) => `
    <tr data-act="ouvrir" data-id="${e(p.id)}" tabindex="0"><td><b>${e(p.nom || T.sansNom)}</b></td><td>${pastilleGenre(p.genre)}</td><td>${pastilleType(p.type)}</td>
      <td>${e(p.nomProposant || T.anonyme)}<br><span class="muted small">${e(p.courriel || '')}${p.genre === 'rsn' ? '' : ` · ${e(T.liens[p.lienAvecRessource] || T.liens.aucun)}`}</span></td>
      <td class="num">${e(jour(p.proposeLe))}</td><td class="num">${p.nbChamps === null ? '' : Number(p.nbChamps)}</td>
      <td>${p.avis.length ? pucesAvis(p.avis) : `<span class="muted">${e(C.aucunAvis)}</span>`}</td><td>${pastilleEtat(p.statut)}</td></tr>`).join('')}</tbody></table></div>`;
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
  $('#main').innerHTML = route() === 'accueil' ? ecranAccueil() : ecranPropositions();
}
// Redessine ce qui dépend des données sans toucher à la recherche en cours de frappe.
function rafraichir() {
  const corps = $('#mbody');
  if (route() === 'propositions' && corps) { corps.innerHTML = corpsPropositions(); dessinerNav(); } else rendre();
}
async function charger() {
  const moi = ++demande;
  const ici = route();
  const r = await appel(ici === 'accueil' ? 'accueil' : 'file');
  if (moi !== demande) return;
  if (r.code === 401) {
    // Session échue pendant une saisie : la fenêtre et ce qui y est écrit restent à l'écran.
    if (saisieEnCours()) { noter('warn', T.sessionExpiree); return; }
    return afficherEntree(null);
  }
  if (!r.ok) {
    if (ici === 'accueil' ? etat.accueil : etat.liste) message(T.indisponible); else afficherPanne();
    return;
  }
  if (ici === 'accueil') { etat.accueil = r.donnees; etat.nouvelles = r.donnees.compteurs.nouvelles; }
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
const existantes = (cle) => (etat.f && etat.f.d && etat.f.d.existantes && etat.f.d.existantes[cle]) || [];
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
// Vrai s'il y a une saisie qui serait perdue en fermant la fenêtre.
function saisieEnCours() {
  const f = etat.f;
  if (!f || !f.d || !ouverte(f.d.proposition) || !peut()) return false;
  return Object.keys(corrections()).length > 0 || f.edition !== null || f.commentaire.trim() !== '' || f.avisNote.trim() !== '';
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
      <div class="ajout"><input type="text" id="ajoutIn" list="choixConnus" maxlength="${Number(champ.max) || 200}" placeholder="${e(TC.indiceListe)}" autocomplete="off" aria-label="${nom}">
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
function boutonsCorrection(cle) {
  const f = etat.f;
  if (!ouverte(f.d.proposition) || !peut()) return '';
  const corrige = Object.hasOwn(corrections(), cle);
  return `<span class="row">${corrige ? `<span class="pill p-info">${e(T.corrigeParVous)}</span><button type="button" class="linkish small" data-act="defaire" data-k="${cle}">${e(T.annulerCorrection)}</button>` : ''}
    <button type="button" class="btn sm" data-act="corriger" data-k="${cle}"${f.enCours ? ' disabled' : ''}>${e(estVide(valeurFinale(cle)) ? T.completer : T.corriger)}</button></span>`;
}

function comparaison() {
  const f = etat.f; const { proposition: p, bouscules, actuelle } = f.d;
  const ouvert = ouverte(p); const modification = p.genre === 'modification';
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
      ${ouvert && peut() ? `<span class="row">${f.sansLogo ? `<span class="pill p-info">${e(T.logo.ecarte)}</span>` : ''}<button type="button" class="btn sm" data-act="logo">${e(f.sansLogo ? T.logo.reprendre : T.logo.ecarter)}</button></span>` : ''}</div>` : '';
  const entetes = ouvert
    ? [T.colonnesComparaison.actuelle, modification ? T.colonnesComparaison.proposee : T.colonnesComparaison.propose]
    : p.statut === 'approuvee' ? [T.colonnesComparaison.avant, modification ? T.colonnesComparaison.applique : T.colonnesComparaison.publie]
      : [T.colonnesComparaison.surLaFiche, T.colonnesComparaison.refuse];
  const restants = CHAMPS.filter((c) => !cles.includes(c.cle));
  return `${modification ? legende() : ''}
    <div class="cmp${modification ? '' : ' one'}"><div class="hd">${e(T.colonnesComparaison.champ)}</div>${modification ? `<div class="hd b">${e(entetes[0])}</div>` : ''}<div class="hd b">${e(entetes[1])}</div>${rangs}${logo}</div>
    ${!rangs && !logo ? `<p class="muted small">${e(T.rienAMontrer)}</p>` : ''}
    ${ouvert && peut() && restants.length ? `<div class="row"><select id="autreChamp" aria-label="${e(T.autreChamp)}" style="width:auto"${f.enCours ? ' disabled' : ''}><option value="">${e(T.autreChamp)}…</option>${restants.map((c) => option(c.cle, '', libelle(c.cle))).join('')}</select><span class="muted small">${e(T.autreChampAide)}</span></div>` : ''}`;
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
function apercuSurLeSite() {
  const { proposition: p } = etat.f.d;
  const page = `<!doctype html><html lang="fr" data-theme="${theme() === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/css/styles.css"><style>body{margin:0;padding:12px;background:transparent}.fiche-statique{margin:0 auto}</style></head><body><main class="fiche-statique">${htmlFiche(ficheApercue())}</main></body></html>`;
  return `<p class="muted small">${e(p.genre === 'modification' ? T.apercu.modification : T.apercu.nouvelle)}${logoPropose() ? ` ${e(T.apercu.logoPropose)}` : ''}</p>
    <iframe class="apercu-cadre" id="cadreApercu" title="${e(T.apercu.titre)}" sandbox="allow-same-origin" srcdoc="${e(page)}"></iframe>`;
}

function listeAvis(avis) {
  if (!avis.length) return `<p class="muted small">${e(T.avis.aucun)}</p>`;
  return `<div class="list">${avis.map((a) => `<div><span class="vote ${classeAvis(a.sens)}">${icone(a.sens)}${e(initiales(a.nom))}</span><div class="grow small"><b>${e(a.nom)}</b>${a.commentaire ? `<br>${e(a.commentaire)}` : ` <span class="muted">· ${e(T.avis.sansCommentaire)}</span>`}</div><span class="muted small">${e(jour(a.le))}</span></div>`).join('')}</div>`;
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
    <label class="f" style="color:inherit">${e(T.porteurNouveau.adresse)}<input type="text" maxlength="300" data-adresse-porteur="${e(nom)}" value="${e(f.porteursNouveaux[nom] || '')}" autocomplete="off"${peut() ? '' : ' disabled'}></label></div>`).join('');
}

function contenuFenetre() {
  const f = etat.f;
  if (f.chargement) return `<p class="muted" role="status">${e(T.chargement)}</p><div class="row"><button type="button" class="btn sm x" data-act="fermer">${e(T.fermer)}</button></div>`;
  const { proposition: p, ficheDisparue, ressemble, verifieraFiche } = f.d;
  const ouvert = ouverte(p);
  const nb = Object.keys(corrections()).length;
  const occupe = f.enCours ? ' disabled' : '';
  let actions = '';
  if (ouvert && peut()) {
    actions = `<button type="button" class="btn primary" data-act="approuver"${f.enCours || ficheDisparue || approbationVide() ? ' disabled' : ''}>${e(f.enCours ? T.enCours : (nb ? T.approuverCorrige(nb) : T.approuver))}</button>
      ${p.statut === 'attente' ? `<button type="button" class="btn" data-act="second-regard" data-id="${e(p.id)}"${occupe}>${e(T.demanderSecondRegard)}</button>` : ''}
      <button type="button" class="btn danger" data-act="refuser"${occupe}>${e(T.refuser)}</button>`;
  }
  const recue = jour(p.proposeLe) + (p.statut === 'verification' && p.verificationLe ? ` · ${T.enVerificationDepuis(jour(p.verificationLe)).toLowerCase()}` : '');
  const confirmation = !ouvert || !peut() ? ''
    : f.confirmation === 'refus' ? `<div class="confirm" style="flex-direction:column;align-items:stretch"><label class="f" for="refusTxt" style="color:inherit">${e(T.refus.libelle)} <small>${e(T.refus.aide)}</small><textarea class="notes" id="refusTxt" maxlength="2000">${e(f.commentaire)}</textarea></label>
        <span class="err" role="alert">${e(f.erreurs.commentaire || '')}</span>
        <span class="row"><button type="button" class="btn sm" data-act="annuler-confirmation"${occupe}>${e(T.annuler)}</button><button type="button" class="btn sm danger" data-act="confirmer-refus"${occupe}>${e(f.enCours ? T.enCours : T.refus.confirmer)}</button></span></div>`
      : f.confirmation === 'approbation' ? `<div class="note info" id="confirmationApprobation"><b>${e(T.confirmerApprobation.titre)}</b><span>${e(T.confirmerApprobation.aide)}</span>
        <span class="row"><button type="button" class="btn sm" data-act="annuler-confirmation"${occupe}>${e(T.annuler)}</button><button type="button" class="btn sm primary" data-act="approuver"${f.enCours || ficheDisparue || approbationVide() ? ' disabled' : ''}>${e(f.enCours ? T.enCours : T.approuver)}</button></span></div>` : '';
  return `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="logoimg t-${p.type ? cleType(p.type) : ''}">${e(initiales(p.nom))}</span>
      <div style="min-width:0"><h2 id="titreFenetre">${e(p.nom || T.sansNom)}</h2><span class="row" style="margin-top:.25rem">${pastilleEtat(p.statut)}${pastilleGenre(p.genre)}${pastilleType(p.type)}</span></div>
      <button type="button" class="btn sm x" style="margin-left:auto" data-act="fermer">${e(T.fermer)}</button></div>
    ${f.note ? `<div class="note ${f.note.sorte}" id="noteFenetre" role="alert" tabindex="-1">${e(f.note.texte)}</div>` : ''}
    <dl class="kv"><dt>${e(T.proposeePar)}</dt><dd><b>${e(p.nomProposant || T.anonyme)}</b> · ${e(p.courriel || '')}</dd>
      ${p.genre === 'rsn' ? '' : `<dt>${e(T.lienAvecRessource)}</dt><dd>${e(T.liens[p.lienAvecRessource] || T.liens.aucun)}${ouvert && verifieraFiche ? ` <span class="muted small">· ${e(T.marqueraVerifiee)}</span>` : ''}</dd>`}
      <dt>${e(T.recue)}</dt><dd>${e(recue)}</dd>
      ${!ouvert ? `<dt>${e(p.statut === 'approuvee' ? T.approuveePar : T.refuseePar)}</dt><dd>${e(p.decidePar || T.inconnue)}${p.decideLe ? `, ${e(T.le(jour(p.decideLe)))}` : ''}</dd>` : ''}
      ${p.fiche ? `<dt>${e(T.ficheVisee)}</dt><dd><a href="/ressource/${e(encodeURIComponent(p.fiche.adresse))}" target="_blank" rel="noopener">${e(p.fiche.nom)}</a></dd>` : ''}</dl>
    ${!ouvert && p.commentaire ? `<div class="note warn"><b>${e(T.commentaireEnvoye)}</b><span>${e(p.commentaire)}</span></div>` : ''}
    ${ouvert && ficheDisparue ? `<div class="note bad">${e(T.ficheDisparue)}</div>` : ''}
    ${ouvert && p.illisible ? `<div class="note bad">${e(T.illisible)}</div>` : ''}
    ${ouvert && ressemble ? `<div class="note warn"><b>${e(T.ressemble.titre)}</b><span>${e(T.ressemble.aide(ressemble.nom))}</span><a class="btn sm" href="/ressource/${e(encodeURIComponent(ressemble.adresse))}" target="_blank" rel="noopener">${e(T.ressemble.ouvrir)}</a></div>` : ''}
    ${ouvert && p.genre === 'rsn' ? `<div class="note info"><b>${e(T.rsn.titre)}</b><span>${e(T.rsn.aide)}</span></div>` : ''}
    <div class="row"><span class="seg" role="group" aria-label="${e(T.vue)}"><button type="button" data-act="onglet" data-v="cmp" aria-pressed="${f.onglet === 'cmp'}">${e(p.genre === 'modification' ? T.ongletComparaison : T.ongletChamps)}</button><button type="button" data-act="onglet" data-v="apercu" aria-pressed="${f.onglet === 'apercu'}">${e(T.apercu.onglet)}</button></span>
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
  const ancienne = $('.modal', calque);
  const haut = ancienne ? ancienne.scrollTop : 0;
  if (!etat.f) { calque.innerHTML = ''; return; }
  const nom = etat.f.d ? etat.f.d.proposition.nom : '';
  calque.innerHTML = `<div class="veil" data-act="fermer"></div><div class="modal wide" role="dialog" aria-modal="true" aria-label="${e(T.fenetre(nom))}">${contenuFenetre()}</div>`;
  const neuve = $('.modal', calque);
  if (ancienne) neuve.scrollTop = haut;
  // L'aperçu prend la hauteur de la fiche qu'il contient.
  const cadre = $('#cadreApercu', calque);
  if (cadre) cadre.addEventListener('load', () => { try { cadre.style.height = `${cadre.contentDocument.documentElement.scrollHeight + 2}px`; } catch (err) { /* hauteur par défaut */ } });
}
function noter(sorte, texte) {
  if (etat.f && !etat.f.chargement) {
    etat.f.note = { sorte, texte };
    dessinerFenetre();
    const zone = $('#noteFenetre');
    if (zone) { zone.scrollIntoView({ block: 'nearest' }); zone.focus(); }
  } else message(texte);
}

// Fermer la fenêtre ; avec une saisie en cours, seulement après confirmation.
function fermerFenetre({ force = false } = {}) {
  if (!etat.f) return true;
  if (etat.f.enCours) return false;
  if (!force && saisieEnCours() && !window.confirm(T.quitter)) return false;
  etat.f = null;
  dessinerFenetre();
  return true;
}

let ouverture = 0;
async function ouvrir(id, { confirmation = null } = {}) {
  if (etat.f && !fermerFenetre()) return;
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
    confirmation: ouverte(d.proposition) && peut() ? confirmation : null,
  });
  dessinerFenetre();
  const cible = confirmation === 'refus' ? $('#refusTxt') : confirmation === 'approbation' ? $('#confirmationApprobation') : $('#layer .x');
  if (cible) { cible.scrollIntoView({ block: 'center' }); if (cible.focus) cible.focus(); }
}

// ─── Saisie d'une correction ───
function corriger(cle) {
  const f = etat.f;
  if (f.edition && f.edition !== cle && !garder()) return;
  f.edition = cle;
  f.brouillon = cloner(f.valeurs[cle]);
  if (estListe(cle) && !Array.isArray(f.brouillon)) f.brouillon = [];
  dessinerFenetre();
  const entree = $('#corrIn') || $('#ajoutIn');
  if (entree) entree.focus();
}
// Ajoute au brouillon ce qui est écrit dans le champ d'ajout. Renvoie false si la valeur est refusée.
function ajouterAuBrouillon({ focus = true } = {}) {
  const f = etat.f; const cle = f.edition; const champ = PAR_CLE[cle];
  const entree = $('#ajoutIn'); const erreur = $('#erreurSaisie');
  let valeur = entree.value.replace(/\s+/g, ' ').trim();
  if (erreur) erreur.textContent = '';
  if (!valeur) return true;
  if (champ.saisie === 'fiches') {
    const visee = f.d.proposition.fiche ? f.d.proposition.fiche.adresse : null;
    const fiche = existantes('fiches').find((x) => etiquetteFiche(x).toLowerCase() === valeur.toLowerCase() && x.adresse !== visee);
    if (!fiche) { if (erreur) erreur.textContent = T.ficheInconnue; return false; }
    valeur = fiche.adresse;
  } else {
    // Une valeur déjà connue reprend son écriture exacte (« fhir » ne crée pas un doublon de « FHIR »).
    const connue = existantes(cle).find((o) => o.toLowerCase() === valeur.toLowerCase());
    if (connue) valeur = connue;
  }
  if (!f.brouillon.some((v) => String(v).toLowerCase() === valeur.toLowerCase())) f.brouillon.push(valeur);
  entree.value = '';
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
  f.edition = null; f.brouillon = null;
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
  if (!f || !f.d || f.enCours || !peut()) return;
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
    message((action === 'refuser' ? T.refusee : T.approuvee)(r.donnees.courriel));
    return charger();
  }
  echecDuGeste(r);
}

async function demanderSecondRegard(id) {
  if (!peut()) return;
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
  if (vers === 'verification') return demanderSecondRegard(id);
  if (vers === 'approuvee') return ouvrir(id, { confirmation: 'approbation' });
  if (vers === 'refusee') { message(T.refus.ecrire); return ouvrir(id, { confirmation: 'refus' }); }
  return message(T.pasDeRetour);
}

// ─── Événements ───
document.addEventListener('click', async (evenement) => {
  const cible = evenement.target.closest('[data-act], #deconnexion, #boutonTheme');
  if (!cible) return;
  if (cible.id === 'boutonTheme') return changerTheme();
  if (cible.id === 'deconnexion') {
    if (etat.f && !fermerFenetre()) return;
    await appel('deconnexion', { corps: {} });
    return afficherEntree(null);
  }
  const { act, id, k, v } = cible.dataset;
  const f = etat.f;
  if (act === 'reessayer') return demarrer();
  if (act === 'voir-propositions') { Object.assign(etat.filtres, { q: '', genre: '', type: '', affichage: 'colonnes' }); location.hash = 'propositions'; return; }
  if (act === 'affichage') { etat.filtres.affichage = v; return rendre(); }
  if (act === 'fermer') return fermerFenetre();

  // Cartes
  if (act === 'second-regard') { evenement.stopPropagation(); return demanderSecondRegard(id); }
  if (act === 'approuver-carte') { evenement.stopPropagation(); return deplacer(id, 'approuvee'); }
  if (act === 'refuser-carte') { evenement.stopPropagation(); return deplacer(id, 'refusee'); }
  if (act === 'ouvrir') return ouvrir(id);

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
  if (act === 'approuver') return trancher('approuver');
  if (act === 'refuser') { f.confirmation = 'refus'; dessinerFenetre(); const zone = $('#refusTxt'); if (zone) { zone.focus(); zone.scrollIntoView({ block: 'center' }); } return; }
  if (act === 'annuler-confirmation') { f.confirmation = null; f.commentaire = ''; delete f.erreurs.commentaire; return dessinerFenetre(); }
  if (act === 'confirmer-refus') return trancher('refuser');
  if (act === 'avis') return donnerAvis(v);
  if (act === 'avis-modifier') { f.avisOuvert = true; dessinerFenetre(); const zone = $('#avisNote'); if (zone) zone.focus(); }
});

document.addEventListener('keydown', (evenement) => {
  const cible = evenement.target;
  if (evenement.key === 'Escape' && etat.f) return void fermerFenetre();
  if (evenement.key === 'Enter' && cible.id === 'ajoutIn') { evenement.preventDefault(); return void ajouterAuBrouillon(); }
  if ((evenement.key === 'Enter' || evenement.key === ' ') && cible.matches && cible.matches('.mcard, tbody tr')) { evenement.preventDefault(); cible.click(); }
});

document.addEventListener('input', (evenement) => {
  const cible = evenement.target; const f = etat.f;
  if (cible.id === 'q') { etat.filtres.q = cible.value; return rafraichir(); }
  if (!f) return;
  if (cible.id === 'refusTxt') { f.commentaire = cible.value; return; }
  if (cible.id === 'avisNote') { f.avisNote = cible.value; return; }
  if (cible.dataset.adressePorteur !== undefined) { f.porteursNouveaux[cible.dataset.adressePorteur] = cible.value; return; }
  if (cible.id === 'corrIn' && cible.type !== 'checkbox') f.brouillon = cible.value;
});

document.addEventListener('change', (evenement) => {
  const cible = evenement.target; const f = etat.f;
  if (cible.id === 'fGenre') { etat.filtres.genre = cible.value; return rafraichir(); }
  if (cible.id === 'fType') { etat.filtres.type = cible.value; return rafraichir(); }
  if (!f || !f.d) return;
  if (cible.id === 'corrIn') { f.brouillon = cible.type === 'checkbox' ? cible.checked : cible.value; return; }
  if (cible.id === 'autreChamp' && cible.value) {
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
});

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
window.addEventListener('beforeunload', (evenement) => { if (saisieEnCours()) { evenement.preventDefault(); evenement.returnValue = ''; } });

// Changer d'écran. Une fenêtre avec une saisie en cours reste ouverte.
window.addEventListener('hashchange', () => {
  if (!etat.moi) return;
  if (etat.f && !saisieEnCours()) { etat.f = null; dessinerFenetre(); }
  rendre(); window.scrollTo(0, 0);
  charger();
});

// ─── Mode clair ou sombre ───
function theme() {
  return document.documentElement.getAttribute('data-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function libelleTheme() { $('#boutonTheme').textContent = theme() === 'dark' ? T.modeClair : T.modeSombre; }
function changerTheme() {
  const nouveau = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nouveau);
  try { localStorage.setItem('rsn-theme', nouveau); } catch (err) { /* sans mémoire */ }
  libelleTheme();
  // L'aperçu de la fiche suit le mode choisi.
  if (etat.f && etat.f.d && etat.f.onglet === 'apercu') dessinerFenetre();
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
}
demarrer();
})();
