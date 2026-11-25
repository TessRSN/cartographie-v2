/**
 * Page /admin : le panneau où les propositions sont approuvées ou refusées.
 * On y entre par un lien reçu par courriel (?jeton=…), qui ouvre une session de sept jours.
 * Le nom et le courriel des proposants ne sont montrés qu'ici.
 */
(function () {
'use strict';

const T = TEXTES.panneau;
const TC = TEXTES.contribuer;
const e = echapper;
const { CHAMPS, estVide, departPanneau, correctionsPanneau } = window.Champs;
const PAR_CLE = Object.fromEntries(CHAMPS.map((c) => [c.cle, c]));
const racine = document.getElementById('panneau');

const etat = {
  courriel: null, vue: 'chargement', onglet: 'attente', liste: [], avis: null,
  // Détail ouvert
  d: null, valeurs: {}, depart: {}, porteursNouveaux: {}, sansLogo: false, erreurs: {}, refus: false, commentaire: '', enCours: false,
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

// ─── Petits outils d'affichage ───
const libelle = (cle) => ((T.champs[cle] || TC.champs[cle] || {}).libelle) || cle;
const aideDe = (cle) => (TC.champs[cle] || {}).aide || '';
const existantes = (cle) => (etat.d && etat.d.existantes && etat.d.existantes[cle]) || [];
const nomDeFiche = (adresse) => { const f = existantes('fiches').find((x) => x.adresse === adresse); return f ? f.nom : adresse; };
const estNouveauPorteur = (nom) => !existantes('porteurs').some((p) => p.trim().toLowerCase() === nom.trim().toLowerCase());
const jour = (iso) => dateLongue(iso);
// Ce qu'on choisit dans la liste des fiches : le nom, suivi de l'adresse quand deux fiches portent le même nom.
function etiquetteFiche(f) {
  const homonymes = existantes('fiches').filter((x) => x.nom.toLowerCase() === f.nom.toLowerCase()).length > 1;
  return homonymes ? `${f.nom} (${f.adresse})` : f.nom;
}

// Une valeur en lecture seule.
function lisible(cle, v) {
  if (estVide(v) && v !== false) return `<span class="p-vide">${e(T.vide_)}</span>`;
  const champ = PAR_CLE[cle];
  if (champ.saisie === 'coche') return e(v ? T.oui : T.non);
  if (champ.saisie === 'fiches') return e(v.map(nomDeFiche).join(', '));
  if (Array.isArray(v)) return e(v.join(', '));
  return e(String(v)).replace(/\n/g, '<br>');
}

function htmlAvis() {
  return etat.avis ? `<p class="f-avis ${e(etat.avis.sorte || '')}" role="status" tabindex="-1" id="avis">${e(etat.avis.texte)}</p>` : '';
}

// ─── Entrée ───
function afficherEntree(message) {
  etat.vue = 'entree';
  racine.innerHTML = `<div class="f-carte p-entree">
    <h2 class="f-titre">${e(T.titre)}</h2>
    ${message ? `<p class="f-avis alerte">${e(message)}</p>` : ''}
    <p class="f-intro">${e(T.entreeIntro)}</p>
    <form id="demandeLien" novalidate>
      <div class="champ"><label for="courriel">${e(T.courriel)}</label>
        <input type="email" id="courriel" autocomplete="email" maxlength="254" required>
        <p class="erreur" id="erreurCourriel" role="alert"></p></div>
      <div class="f-piege" aria-hidden="true"><label>Site <input type="text" id="site" tabindex="-1" autocomplete="off"></label></div>
      <div class="f-actions"><button type="submit" class="f-bouton principal droite">${e(T.recevoir)}</button></div>
    </form></div>`;
}

async function demanderLien(formulaire) {
  const courriel = formulaire.querySelector('#courriel').value.trim();
  const erreur = formulaire.querySelector('#erreurCourriel');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) { erreur.textContent = T.courrielInvalide; return; }
  const bouton = formulaire.querySelector('button[type="submit"]');
  bouton.disabled = true;
  let ok = false;
  try {
    const reponse = await fetch('/api/lien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courriel, but: 'panneau', site: formulaire.querySelector('#site').value }) });
    ok = reponse.ok;
  } catch (err) { ok = false; }
  if (!ok) { bouton.disabled = false; erreur.textContent = T.indisponible; return; }
  racine.innerHTML = `<div class="f-carte p-entree"><h2 class="f-titre">${e(T.titre)}</h2><p class="f-avis" role="status">${e(T.lienEnvoye)}</p></div>`;
}

// ─── File ───
function htmlEntete() {
  return `<div class="p-session"><span>${e(T.connecte(etat.courriel))}</span><button type="button" class="f-bouton lien" id="deconnexion">${e(T.deconnexion)}</button></div>`;
}

function htmlLigne(p) {
  const qui = p.nomProposant ? `${p.nomProposant} (${p.courriel})` : p.courriel;
  const quand = jour(p.proposeLe);
  return `<li><button type="button" class="p-ligne" data-ouvrir="${e(p.id)}">
    <span class="p-etiquette ${e(p.genre || '')}">${e(T.genres[p.genre] || '')}</span>
    <strong>${e(p.titre)}</strong>
    <span class="p-meta">${e(T.proposePar)} ${e(qui || '')}${quand ? `, ${e(T.proposeLe)} ${e(quand)}` : ''}</span>
    ${p.statut !== 'attente' ? `<span class="p-etiquette ${e(p.statut)}">${e(T.statuts[p.statut] || '')}</span>` : ''}
  </button></li>`;
}

function afficherFile() {
  etat.vue = 'file';
  const onglets = Object.entries(T.onglets).map(([cle, nom]) => `<button type="button" aria-pressed="${etat.onglet === cle}" data-onglet="${cle}">${e(nom)}${cle === 'attente' && etat.onglet === 'attente' ? ` (${etat.liste.length})` : ''}</button>`).join('');
  racine.innerHTML = `<div class="f-carte">
    ${htmlEntete()}
    <h2 class="f-titre" id="titreVue" tabindex="-1">${e(T.titre)}</h2>
    ${htmlAvis()}
    <div class="p-onglets">${onglets}</div>
    ${etat.liste.length ? `<ul class="p-file">${etat.liste.map(htmlLigne).join('')}</ul>` : `<p class="formulaire-attente">${e(T.vide[etat.onglet])}</p>`}
  </div>`;
  (document.getElementById('avis') || document.getElementById('titreVue')).focus();
}

async function chargerFile({ garderAvis = false } = {}) {
  const moi = ++demande;
  if (!garderAvis) etat.avis = null;
  const r = await appel('file', { query: { statut: etat.onglet } });
  if (moi !== demande) return;
  if (r.code === 401) return afficherEntree(null);
  if (!r.ok) {
    etat.vue = 'panne';
    racine.innerHTML = `<div class="f-carte"><p class="f-avis erreur" role="alert">${e(T.indisponible)}</p><div class="f-actions"><button type="button" class="f-bouton principal droite" id="reessayer">${e(T.reessayer)}</button></div></div>`;
    return;
  }
  etat.courriel = r.donnees.courriel;
  etat.liste = r.donnees.propositions || [];
  afficherFile();
}

// ─── Détail ───
// Champs qu'on peut compléter en plus de ceux de la proposition.
function champsEnPlus() {
  const proposes = champsProposes();
  return CHAMPS.map((c) => c.cle).filter((cle) => !proposes.includes(cle));
}

// Les corrections : tout champ dont la valeur diffère de son point de départ.
function corrections() { return correctionsPanneau(etat.valeurs, etat.depart); }
// Vrai s'il y a une saisie qui serait perdue en quittant le détail.
function saisieEnCours() {
  return etat.vue === 'detail' && etat.d && etat.d.proposition.statut === 'attente'
    && (Object.keys(corrections()).length > 0 || (etat.refus && etat.commentaire.trim() !== ''));
}
// Champs proposés lisibles, dans l'ordre du catalogue.
function champsProposes() {
  const propose = etat.d.proposition.propose;
  return CHAMPS.map((c) => c.cle).filter((cle) => propose[cle] && Object.hasOwn(propose[cle], 'apres'));
}
// Rien à appliquer : aucun champ proposé, aucune correction, et le logo écarté ou absent.
function approbationVide() {
  return !champsProposes().length && !Object.keys(corrections()).length && (etat.sansLogo || !etat.d.proposition.aLogo);
}

function htmlPuces(cle) {
  const champ = PAR_CLE[cle];
  const connues = existantes(cle).map((v) => String(v).toLowerCase());
  return (etat.valeurs[cle] || []).map((v, i) => {
    const nom = champ.saisie === 'fiches' ? nomDeFiche(v) : v;
    const nouvelle = champ.saisie !== 'fiches' && !connues.includes(String(v).toLowerCase());
    return `<span class="f-puce${nouvelle ? ' nouvelle' : ''}">${e(nom)}<button type="button" data-retirer="${e(cle)}" data-index="${i}" aria-label="${e(TC.retirer(nom))}">×</button></span>`;
  }).join('');
}
function htmlPorteursNeufs() {
  return (etat.valeurs.porteurs || []).filter(estNouveauPorteur).map((nom) => `
    <div class="f-porteur-neuf"><label>${e(TC.nouveauPorteur(nom))}
      <input type="text" maxlength="300" data-adresse-porteur="${e(nom)}" value="${e(etat.porteursNouveaux[nom] || '')}" autocomplete="off"></label></div>`).join('');
}

// Le contrôle de saisie d'un champ, sans son libellé.
function htmlControle(cle) {
  const champ = PAR_CLE[cle];
  const v = etat.valeurs[cle];
  const id = `c-${cle}`;
  const options = (etat.d.options && etat.d.options[cle]) || [];
  if (champ.saisie === 'coche') {
    return `<label class="f-case"><input type="checkbox" id="${id}" data-cle="${cle}" ${v ? 'checked' : ''}>${e(T.oui)}</label>`;
  }
  if (champ.saisie === 'choixMultiples') {
    const toutes = [...options, ...(v || []).filter((o) => !options.includes(o))];
    return `<div class="f-cases" role="group" aria-label="${e(libelle(cle))}">${toutes.map((o) => `<label class="f-case"><input type="checkbox" data-cle="${cle}" data-option="${e(o)}" ${(v || []).includes(o) ? 'checked' : ''}>${e(o)}</label>`).join('')}</div>`;
  }
  if (champ.saisie === 'listeOuverte' || champ.saisie === 'fiches') {
    const liste = champ.saisie === 'fiches' ? existantes('fiches').map(etiquetteFiche) : existantes(cle);
    return `<div class="f-puces" id="p-${cle}">${htmlPuces(cle)}</div>
      <div class="f-ajout"><input type="text" id="${id}" list="l-${cle}" maxlength="${champ.max || 200}" data-ajout="${cle}" placeholder="${e(TC.indiceListe)}" autocomplete="off" aria-label="${e(libelle(cle))}">
        <button type="button" class="f-bouton" data-ajouter="${cle}">${e(TC.ajouter)}</button></div>
      <datalist id="l-${cle}">${liste.map((o) => `<option value="${e(o)}"></option>`).join('')}</datalist>
      ${cle === 'porteurs' ? `<div id="porteursNeufs">${htmlPorteursNeufs()}</div>` : ''}`;
  }
  if (champ.saisie === 'choix') {
    const choix = options.includes(v) || !v ? options : [v, ...options];
    return `<select id="${id}" data-cle="${cle}"><option value="">${e(TC.choisir)}</option>${choix.map((o) => `<option value="${e(o)}" ${o === v ? 'selected' : ''}>${e(o)}</option>`).join('')}</select>`;
  }
  if (champ.saisie === 'long' || (champ.saisie === 'texte' && champ.max >= 300)) {
    return `<textarea id="${id}" data-cle="${cle}" maxlength="${champ.max}" class="${cle === 'description' ? '' : 'court'}">${e(v || '')}</textarea>`;
  }
  const type = champ.saisie === 'url' ? 'url' : champ.saisie === 'courriel' ? 'email' : 'text';
  return `<input type="${type}" id="${id}" data-cle="${cle}" maxlength="${champ.max}" value="${e(v || '')}" ${champ.saisie === 'url' ? 'placeholder="https://" inputmode="url"' : ''} autocomplete="off">`;
}

// Un rang : la valeur actuelle à gauche, la valeur proposée (modifiable) à droite.
function htmlRang(cle) {
  const { proposition, actuelle, bouscules } = etat.d;
  const c = proposition.propose[cle];
  const avecActuelle = !!actuelle;
  const bandeau = bouscules.includes(cle) ? `<div class="f-avis alerte p-bouscule"><strong>${e(T.bouscule)}</strong>
      <dl><dt>${e(T.bousculeAvant)}</dt><dd>${lisible(cle, c.avant)}</dd><dt>${e(T.bousculeMaintenant)}</dt><dd>${lisible(cle, actuelle[cle])}</dd><dt>${e(T.bousculePropose)}</dt><dd>${lisible(cle, c.apres)}</dd></dl></div>` : '';
  return `<div class="p-rang champ${etat.erreurs[cle] ? ' en-erreur' : ''}" data-champ="${cle}">
    <h4><label for="c-${cle}">${e(libelle(cle))}</label></h4>${bandeau}
    <div class="p-cote${avecActuelle ? '' : ' seul'}">
      ${avecActuelle ? `<div class="p-actuel"><span class="p-tete">${e(T.actuel)}</span><div>${lisible(cle, actuelle[cle])}</div></div>` : ''}
      <div class="p-propose"><span class="p-tete">${e(T.propose)}</span>${htmlControle(cle)}</div>
    </div>
    <p class="erreur" role="alert">${e(etat.erreurs[cle] || '')}</p></div>`;
}

function htmlChampEnPlus(cle) {
  const aide = aideDe(cle);
  return `<div class="champ${etat.erreurs[cle] ? ' en-erreur' : ''}" data-champ="${cle}"><label for="c-${cle}">${e(libelle(cle))}</label>${aide ? `<p class="aide">${e(aide)}</p>` : ''}${htmlControle(cle)}<p class="erreur" role="alert">${e(etat.erreurs[cle] || '')}</p></div>`;
}

function htmlProposant(p) {
  const nom = p.nomProposant || T.anonyme;
  const lien = p.genre === 'rsn' || !T.liens[p.lienAvecRessource] ? '' : `, ${T.liens[p.lienAvecRessource]}`;
  return `<p class="p-proposant">${e(T.proposePar)} <strong>${e(nom)}</strong> (<a href="mailto:${e(encodeURIComponent(p.courriel || ''))}">${e(p.courriel || '')}</a>)${e(lien)}, ${e(T.proposeLe)} ${e(jour(p.proposeLe))}.</p>`;
}

function htmlLogo(p, lectureSeule) {
  if (!p.aLogo) return '';
  return `<div class="p-rang"><h4>${e(T.logoPropose)}</h4>
    <div class="p-logo"><img src="/api/admin?action=logo&amp;id=${e(encodeURIComponent(p.id))}" alt="${e(T.logoPropose)}">
    ${lectureSeule ? '' : `<label class="f-case"><input type="checkbox" id="sansLogo" ${etat.sansLogo ? 'checked' : ''}>${e(T.sansLogo)}</label>`}</div></div>`;
}

function libelleApprouver() { return Object.keys(corrections()).length ? T.approuverCorrige : T.approuver; }

function htmlActions() {
  if (etat.refus) {
    return `<div class="champ${etat.erreurs.commentaire ? ' en-erreur' : ''}"><label for="commentaire">${e(T.commentaire.libelle)}</label><p class="aide">${e(T.commentaire.aide)}</p>
      <textarea id="commentaire" maxlength="2000" class="court">${e(etat.commentaire)}</textarea><p class="erreur" role="alert">${e(etat.erreurs.commentaire || '')}</p></div>
      <div class="f-actions"><button type="button" class="f-bouton" id="annulerRefus" ${etat.enCours ? 'disabled' : ''}>${e(T.annuler)}</button>
      <button type="button" class="f-bouton principal p-danger droite" id="confirmerRefus" ${etat.enCours ? 'disabled' : ''}>${e(etat.enCours ? T.enCours : T.confirmerRefus)}</button></div>`;
  }
  const bloque = etat.enCours || etat.d.ficheDisparue || approbationVide();
  return `<div class="f-actions"><button type="button" class="f-bouton" id="refuser" ${etat.enCours ? 'disabled' : ''}>${e(T.refuser)}</button>
    <button type="button" class="f-bouton principal droite" id="approuver" ${bloque ? 'disabled' : ''}>${e(etat.enCours ? T.enCours : libelleApprouver())}</button></div>`;
}

function htmlTranchee(p) {
  const cles = CHAMPS.map((c) => c.cle).filter((cle) => Object.hasOwn(p.propose, cle) || (p.applique && Object.hasOwn(p.applique, cle)));
  const rangs = cles.map((cle) => `<div class="p-rang"><h4>${e(libelle(cle))}</h4><div class="p-cote">
      <div class="p-actuel"><span class="p-tete">${e(T.propose)}</span><div>${p.propose[cle] ? lisible(cle, p.propose[cle].apres) : `<span class="p-vide">${e(T.vide_)}</span>`}</div></div>
      ${p.applique ? `<div class="p-propose"><span class="p-tete">${e(T.applique)}</span><div>${Object.hasOwn(p.applique, cle) ? lisible(cle, p.applique[cle]) : `<span class="p-vide">${e(T.vide_)}</span>`}</div></div>` : ''}
    </div></div>`).join('');
  return `<p class="f-avis ${p.statut === 'refusee' ? 'erreur' : ''}">${e(T.decision(T.statuts[p.statut] || '', p.decidePar, jour(p.decideLe)))}${p.commentaire ? `<br><strong>${e(T.motif)} :</strong> ${e(p.commentaire)}` : ''}</p>${rangs}${htmlLogo(p, true)}`;
}

function afficherDetail({ haut = false } = {}) {
  etat.vue = 'detail';
  const { proposition: p, ficheDisparue } = etat.d;
  const enAttente = p.statut === 'attente';
  const proposes = champsProposes();
  let corps;
  if (!enAttente) corps = htmlTranchee(p);
  else {
    corps = `${ficheDisparue ? `<p class="f-avis erreur">${e(T.ficheDisparue)}</p>` : ''}
      ${p.illisible ? `<p class="f-avis erreur">${e(T.illisible)}</p>` : ''}
      ${p.genre === 'rsn' ? `<p class="f-avis">${e(T.rsnAvis)}</p>` : ''}
      <section class="f-groupe"><h3>${e(T.changements)}</h3>
        ${proposes.length ? proposes.map(htmlRang).join('') : (p.aLogo && !p.illisible ? `<p class="f-intro">${e(T.aucunChangement)}</p>` : '')}
        ${htmlLogo(p, false)}
      </section>
      <details class="p-autres" ${p.genre === 'rsn' || champsEnPlus().some((cle) => etat.erreurs[cle] || Object.hasOwn(corrections(), cle)) ? 'open' : ''}><summary>${e(T.autres)}</summary>
        <p class="aide">${e(T.autresAide)}</p>${champsEnPlus().map(htmlChampEnPlus).join('')}</details>
      <div id="actions">${htmlActions()}</div>`;
  }
  racine.innerHTML = `<div class="f-carte">
    ${htmlEntete()}
    <p><button type="button" class="f-bouton lien" id="retour">← ${e(T.retourFile)}</button></p>
    <p class="p-sur"><span class="p-etiquette ${e(p.genre || '')}">${e(T.genres[p.genre] || '')}</span>
      ${p.fiche ? `<a href="/ressource/${e(encodeURIComponent(p.fiche.adresse))}" target="_blank" rel="noopener">${e(T.voirFiche)}</a>` : ''}</p>
    <h2 class="f-titre" id="titreVue" tabindex="-1">${e(p.titre)}</h2>
    ${htmlProposant(p)}
    ${htmlAvis()}
    ${corps}
  </div>`;
  if (haut) window.scrollTo(0, 0);
  const cible = document.getElementById('avis') || (haut ? document.getElementById('titreVue') : null);
  if (cible) cible.focus();
}

let demande = 0; // numéro de la dernière demande de vue : une réponse plus ancienne est ignorée

async function ouvrir(id) {
  const moi = ++demande;
  racine.innerHTML = `<p class="formulaire-attente" role="status">${e(T.chargement)}</p>`;
  const r = await appel('detail', { query: { id } });
  if (moi !== demande) return;
  if (r.code === 401) return afficherEntree(null);
  if (!r.ok) { etat.avis = { sorte: 'erreur', texte: r.code === 404 ? T.introuvable : T.indisponible }; return afficherFile(); }
  const d = r.donnees;
  const depart = departPanneau(d.proposition.propose, d.actuelle);
  Object.assign(etat, { d, depart, valeurs: JSON.parse(JSON.stringify(depart)), porteursNouveaux: { ...d.proposition.porteursNouveaux }, sansLogo: false, erreurs: {}, refus: false, commentaire: '', enCours: false, avis: null });
  afficherDetail({ haut: true });
}

function rafraichirActions() {
  const zone = document.getElementById('actions');
  if (zone) zone.innerHTML = htmlActions();
}

async function trancher(action) {
  if (etat.enCours) return;
  const id = etat.d.proposition.id;
  let corps;
  if (action === 'refuser') {
    if (!etat.commentaire.trim()) { etat.erreurs = { commentaire: T.commentaireRequis }; rafraichirActions(); document.getElementById('commentaire').focus(); return; }
    corps = { id, commentaire: etat.commentaire.trim() };
  } else {
    // Un mot tapé dans un champ d'ajout sans appuyer sur « Ajouter » compte quand même.
    for (const entree of racine.querySelectorAll('input[data-ajout]')) {
      if (entree.value.trim() && !ajouter(entree.dataset.ajout, { focus: false })) { entree.scrollIntoView({ block: 'center' }); entree.focus(); return; }
    }
    // Chaque nouveau porteur part avec son adresse, même vide : une adresse retirée ici ne doit pas revenir.
    const adresses = {};
    for (const nom of (etat.valeurs.porteurs || []).filter(estNouveauPorteur)) adresses[nom] = etat.porteursNouveaux[nom] || '';
    corps = { id, corrections: corrections(), porteursNouveaux: adresses, sansLogo: etat.sansLogo };
  }
  etat.enCours = true; etat.erreurs = {}; rafraichirActions();
  const r = await appel(action, { corps });
  etat.enCours = false;
  if (r.ok) {
    etat.avis = { sorte: '', texte: (action === 'refuser' ? T.refusee : T.approuvee)(r.donnees.courriel) };
    etat.onglet = 'attente'; etat.vue = 'file';
    return chargerFile({ garderAvis: true });
  }
  const code = r.donnees.code;
  if (code === 'deja-tranchee' || code === 'introuvable' || code === 'fiche-introuvable') {
    etat.avis = { sorte: 'alerte', texte: code === 'deja-tranchee' ? T.dejaTranchee : code === 'introuvable' ? T.introuvable : T.ficheDisparue };
    etat.vue = 'file';
    return chargerFile({ garderAvis: true });
  }
  // Dans tous les autres cas la saisie reste à l'écran.
  if (r.code === 401) etat.avis = { sorte: 'alerte', texte: T.sessionExpiree };
  else if (code === 'occupee') etat.avis = { sorte: 'alerte', texte: T.occupee };
  else if (code === 'invalide' && r.donnees.erreurs) {
    etat.erreurs = r.donnees.erreurs;
    etat.avis = { sorte: 'erreur', texte: r.donnees.erreurs._ || T.erreursEnHaut };
  } else etat.avis = { sorte: 'erreur', texte: code === 'doublon' ? T.doublon : T.indisponible };
  afficherDetail({ haut: true });
}

// ─── Saisie ───
// Ajoute à une liste ce qui est écrit dans son champ d'ajout. Renvoie false si la valeur est refusée.
function ajouter(cle, { focus = true } = {}) {
  const champ = PAR_CLE[cle];
  const entree = document.getElementById(`c-${cle}`);
  const zoneErreur = racine.querySelector(`[data-champ="${cle}"] .erreur`);
  let valeur = entree.value.replace(/\s+/g, ' ').trim();
  if (zoneErreur) zoneErreur.textContent = '';
  if (!valeur) return true;
  if (champ.saisie === 'fiches') {
    const visee = etat.d.proposition.fiche ? etat.d.proposition.fiche.adresse : null;
    const fiche = existantes('fiches').find((f) => etiquetteFiche(f).toLowerCase() === valeur.toLowerCase() && f.adresse !== visee);
    if (!fiche) { if (zoneErreur) zoneErreur.textContent = T.ficheInconnue; return false; }
    valeur = fiche.adresse;
  } else {
    // Une valeur déjà connue reprend son écriture exacte (« fhir » ne crée pas un doublon de « FHIR »).
    const connue = existantes(cle).find((o) => o.toLowerCase() === valeur.toLowerCase());
    if (connue) valeur = connue;
  }
  const liste = etat.valeurs[cle] || (etat.valeurs[cle] = []);
  if (!liste.some((v) => String(v).toLowerCase() === valeur.toLowerCase())) liste.push(valeur);
  entree.value = '';
  redessinerListe(cle);
  if (focus) entree.focus();
  return true;
}
function redessinerListe(cle) {
  document.getElementById(`p-${cle}`).innerHTML = htmlPuces(cle);
  if (cle === 'porteurs') document.getElementById('porteursNeufs').innerHTML = htmlPorteursNeufs();
  rafraichirActions();
}

racine.addEventListener('input', (evenement) => {
  const cible = evenement.target;
  if (cible.id === 'commentaire') { etat.commentaire = cible.value; return; }
  if (cible.dataset.adressePorteur !== undefined) { etat.porteursNouveaux[cible.dataset.adressePorteur] = cible.value; return; }
  const cle = cible.dataset.cle;
  if (!cle || !PAR_CLE[cle] || cible.type === 'checkbox') return;
  etat.valeurs[cle] = cible.value;
  const bouton = document.getElementById('approuver');
  if (bouton && !etat.enCours) { bouton.textContent = libelleApprouver(); bouton.disabled = !!etat.d.ficheDisparue || approbationVide(); }
});

racine.addEventListener('change', (evenement) => {
  const cible = evenement.target;
  if (cible.id === 'sansLogo') { etat.sansLogo = cible.checked; return rafraichirActions(); }
  const cle = cible.dataset.cle;
  if (!cle || !PAR_CLE[cle]) return;
  if (cible.type === 'checkbox') {
    if (cible.dataset.option !== undefined) {
      const liste = new Set(etat.valeurs[cle] || []);
      if (cible.checked) liste.add(cible.dataset.option); else liste.delete(cible.dataset.option);
      etat.valeurs[cle] = [...liste];
    } else etat.valeurs[cle] = cible.checked;
  } else etat.valeurs[cle] = cible.value;
  rafraichirActions();
});

racine.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Enter' && evenement.target.dataset.ajout) { evenement.preventDefault(); ajouter(evenement.target.dataset.ajout); }
});

racine.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  if (evenement.target.id === 'demandeLien') demanderLien(evenement.target);
});

racine.addEventListener('click', async (evenement) => {
  const cible = evenement.target.closest('button');
  if (!cible) return;
  // Pendant un envoi, rien d'autre ne bouge ; quitter une saisie en cours demande confirmation.
  if (etat.enCours) return;
  const quitte = cible.id === 'retour' || cible.id === 'deconnexion';
  if (quitte && saisieEnCours() && !window.confirm(T.quitter)) return;
  if (cible.id === 'reessayer') return chargerFile();
  if (cible.dataset.onglet) { etat.onglet = cible.dataset.onglet; return chargerFile(); }
  if (cible.dataset.ouvrir) return ouvrir(cible.dataset.ouvrir);
  if (cible.dataset.ajouter) return ajouter(cible.dataset.ajouter);
  if (cible.dataset.retirer) {
    const cle = cible.dataset.retirer;
    (etat.valeurs[cle] || []).splice(Number(cible.dataset.index), 1);
    redessinerListe(cle);
    return document.getElementById(`c-${cle}`).focus();
  }
  if (cible.id === 'retour') return chargerFile();
  if (cible.id === 'deconnexion') { await appel('deconnexion', { corps: {} }); etat.courriel = null; return afficherEntree(null); }
  if (cible.id === 'refuser') { etat.refus = true; rafraichirActions(); return document.getElementById('commentaire').focus(); }
  if (cible.id === 'annulerRefus') { etat.refus = false; etat.erreurs = {}; rafraichirActions(); return document.getElementById('refuser').focus(); }
  if (cible.id === 'confirmerRefus') return trancher('refuser');
  if (cible.id === 'approuver') return trancher('approuver');
});

// Fermer l'onglet ou recharger la page avec une saisie en cours : le navigateur demande confirmation.
window.addEventListener('beforeunload', (evenement) => { if (saisieEnCours()) { evenement.preventDefault(); evenement.returnValue = ''; } });

// ─── Mode clair ou sombre ───
document.getElementById('boutonTheme').addEventListener('click', () => {
  const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
  try { localStorage.setItem('rsn-theme', sombre ? 'light' : 'dark'); } catch (err) { /* sans mémoire */ }
});

// ─── Départ ───
(async function demarrer() {
  const parametres = new URLSearchParams(location.search);
  const jeton = parametres.get('jeton');
  if (jeton) {
    // Le jeton quitte l'adresse tout de suite : il ne doit rester ni dans l'historique ni dans un signet.
    history.replaceState(null, '', location.pathname);
    const r = await appel('session', { corps: { jeton } });
    if (r.code !== 200) {
      // Le lien a déjà servi : une session ouverte plus tôt reste valable.
      const file = await appel('file', { query: { statut: 'attente' } });
      if (!file.ok) return afficherEntree(r.code === 401 ? T.lienExpire : T.indisponible);
      etat.courriel = file.donnees.courriel; etat.liste = file.donnees.propositions || [];
      return afficherFile();
    }
  }
  chargerFile();
})();
})();
