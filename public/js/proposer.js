/**
 * Page /proposer : formulaire de proposition d'une ressource ou d'une modification.
 * Ouverte par un lien reçu par courriel (?jeton=…). La saisie est gardée dans le navigateur
 * jusqu'à l'envoi, pour survivre à un rechargement ou à un lien expiré.
 */
(function () {
'use strict';

const T = TEXTES.contribuer;
const e = echapper;
const { CHAMPS, OBLIGATOIRES, nettoyer, estVide, egales } = window.Champs;
const PAR_CLE = Object.fromEntries(CHAMPS.map((c) => [c.cle, c]));
const racine = document.getElementById('proposer');
const parametres = new URLSearchParams(location.search);
const jeton = parametres.get('jeton');
// Adresse publique de la fiche visée, portée par le lien : elle sert même si le lien a expiré.
const ficheDuLien = /^[a-z0-9-]{1,200}$/.test(parametres.get('fiche') || '') ? parametres.get('fiche') : null;
const DUREE_MEMOIRE_MS = 7 * 24 * 3600 * 1000;

// Champs communs, regroupés comme sur la fiche.
const GROUPES = [
  ['identite', ['nom', 'autresNoms', 'typePrincipal', 'secondType', 'phrase', 'description', 'logo']],
  ['liens', ['lien', 'autresLiens', 'doi']],
  ['porteur', ['porteurs', 'financePar']],
  ['acces', ['modesAcces', 'commentAcceder', 'frais', 'reserveA', 'environnementSecurise']],
  ['portee', ['portee', 'langues']],
  ['sujets', ['motsCles', 'normes', 'outils']],
  ['contact', ['contact', 'responsable']],
];
const PROPRES = {
  donnees: ['population', 'periode', 'typesDonnees', 'collecte', 'jumelage', 'dictionnaire'],
  logiciel: ['depotCode', 'licence'],
};
// Les types qui ouvrent chaque groupe de détails.
const TYPES_PROPRES = { donnees: ['jeu', 'catalogue'], logiciel: ['logiciel'] };
const CHAMPS_RSN = ['nom', 'lien', 'description'];

const etat = {
  donnees: null, genre: null, etape: 0, valeurs: {}, porteursNouveaux: {},
  nomProposant: '', lienAvecRessource: 'aucun', conditions: false,
  erreurs: {}, avis: null, envoi: false,
};

// ─── Mémoire de la saisie ───
// La saisie est gardée dans localStorage : elle doit survivre à un nouveau lien, qui s'ouvre
// dans un autre onglet. Elle est effacée à l'envoi, ou oubliée au bout de sept jours.
function adresseVisee() {
  const fiche = etat.donnees && etat.donnees.fiche;
  return (fiche && fiche.adresse) || ficheDuLien;
}
function cleMemoire() { return `rsn-carto-proposition:${adresseVisee() || 'nouvelle'}`; }
function garder() {
  try {
    const { genre, etape, valeurs, porteursNouveaux, nomProposant, lienAvecRessource } = etat;
    localStorage.setItem(cleMemoire(), JSON.stringify({ t: Date.now(), genre, etape, valeurs, porteursNouveaux, nomProposant, lienAvecRessource }));
  } catch (err) { /* sans mémoire : la saisie vit le temps de la page */ }
}
function reprendre() {
  try {
    const garde = JSON.parse(localStorage.getItem(cleMemoire()) || 'null');
    if (!garde || typeof garde !== 'object') return;
    if (!(Date.now() - Number(garde.t) < DUREE_MEMOIRE_MS)) return oublier();
    const modification = etat.genre === 'modification';
    if (modification !== (garde.genre === 'modification')) return;
    Object.assign(etat, {
      genre: garde.genre, etape: Number(garde.etape) || 0, valeurs: { ...etat.valeurs, ...garde.valeurs },
      porteursNouveaux: garde.porteursNouveaux || {}, nomProposant: garde.nomProposant || '', lienAvecRessource: garde.lienAvecRessource || 'aucun',
    });
  } catch (err) { /* saisie gardée illisible : on repart de zéro */ }
}
function oublier() { try { localStorage.removeItem(cleMemoire()); } catch (err) { /* rien à oublier */ } }

// ─── Étapes ───
function sectionsPropres() {
  const types = [etat.valeurs.typePrincipal, etat.valeurs.secondType].map((t) => cleType(t));
  return Object.keys(PROPRES).filter((section) => TYPES_PROPRES[section].some((t) => types.includes(t))
    || (etat.genre === 'modification' && PROPRES[section].some((cle) => !estVide(etat.donnees.fiche.valeurs[cle]))));
}
function etapes() {
  if (etat.genre === 'rsn') return ['type', 'rsn'];
  const suite = sectionsPropres().length ? ['commun', 'propre'] : ['commun'];
  return etat.genre === 'modification' ? suite : ['type', ...suite];
}
function champsDeLEtape(nom) {
  if (nom === 'type') return ['typePrincipal'];
  if (nom === 'rsn') return CHAMPS_RSN;
  if (nom === 'commun') return GROUPES.flatMap(([, cles]) => cles).filter((cle) => etat.genre === 'modification' || cle !== 'typePrincipal');
  return sectionsPropres().flatMap((section) => PROPRES[section]);
}

// ─── Rendu des champs ───
function texteDuChamp(cle) {
  if (etat.genre === 'rsn' && cle === 'description') return T.rsnDescription;
  return T.champs[cle] || { libelle: cle };
}
function estObligatoire(cle) {
  if (etat.genre === 'rsn') return cle === 'nom';
  return OBLIGATOIRES.includes(cle);
}
function existantes(cle) { return (etat.donnees.existantes && etat.donnees.existantes[cle]) || []; }
function estNouveauPorteur(nom) { return !existantes('porteurs').some((p) => p.trim().toLowerCase() === nom.trim().toLowerCase()); }

function htmlPuces(cle) {
  const valeurs = etat.valeurs[cle] || [];
  const connues = existantes(cle).map((v) => v.toLowerCase());
  return valeurs.map((v, i) => `<span class="f-puce${connues.includes(v.toLowerCase()) ? '' : ' nouvelle'}">${e(v)}<button type="button" data-retirer="${e(cle)}" data-index="${i}" aria-label="${e(T.retirer(v))}">×</button></span>`).join('');
}
function htmlPorteursNeufs() {
  return (etat.valeurs.porteurs || []).filter(estNouveauPorteur).map((nom) => `
    <div class="f-porteur-neuf"><label>${e(T.nouveauPorteur(nom))}
      <input type="text" maxlength="300" data-adresse-porteur="${e(nom)}" value="${e(etat.porteursNouveaux[nom] || '')}" autocomplete="off"></label></div>`).join('');
}

function htmlChamp(cle) {
  const champ = PAR_CLE[cle];
  const t = texteDuChamp(cle);
  const v = etat.valeurs[cle];
  const erreur = etat.erreurs[cle] || '';
  const id = `c-${cle}`;
  const oblig = estObligatoire(cle) ? `<span class="oblig">${e(T.obligatoire)}</span>` : '';
  const aide = t.aide ? `<p class="aide" id="a-${cle}">${e(t.aide)}</p>` : '';
  const descriptions = [t.aide ? `a-${cle}` : '', erreur ? `e-${cle}` : ''].filter(Boolean).join(' ');
  const decrit = `${descriptions ? `aria-describedby="${descriptions}"` : ''} ${erreur ? 'aria-invalid="true"' : ''}`;
  const pied = `<p class="erreur" id="e-${cle}" role="alert">${e(erreur)}</p>`;
  const classe = `champ${erreur ? ' en-erreur' : ''}`;
  const options = (etat.donnees.options && etat.donnees.options[cle]) || [];

  if (champ.saisie === 'coche') {
    return `<div class="${classe} coche" data-champ="${cle}"><label class="f-case"><input type="checkbox" id="${id}" data-cle="${cle}" ${v ? 'checked' : ''}>${e(t.libelle)}</label>${pied}</div>`;
  }
  if (champ.saisie === 'choixMultiples') {
    const cases = options.map((o) => `<label class="f-case"><input type="checkbox" data-cle="${cle}" data-option="${e(o)}" ${(v || []).includes(o) ? 'checked' : ''}>${e(o)}</label>`).join('');
    return `<fieldset class="${classe}" data-champ="${cle}"><legend>${e(t.libelle)}${oblig}</legend>${aide}<div class="f-cases">${cases}</div>${pied}</fieldset>`;
  }
  if (champ.saisie === 'listeOuverte') {
    const liste = existantes(cle).map((o) => `<option value="${e(o)}"></option>`).join('');
    return `<div class="${classe}" data-champ="${cle}"><label for="${id}">${e(t.libelle)}${oblig}</label>${aide}
      <div class="f-puces" id="p-${cle}">${htmlPuces(cle)}</div>
      <div class="f-ajout"><input type="text" id="${id}" list="l-${cle}" maxlength="${champ.max}" data-ajout="${cle}" placeholder="${e(T.indiceListe)}" autocomplete="off" ${decrit}>
        <button type="button" class="f-bouton" data-ajouter="${cle}">${e(T.ajouter)}</button></div>
      <datalist id="l-${cle}">${liste}</datalist>
      ${cle === 'porteurs' ? `<div id="porteursNeufs">${htmlPorteursNeufs()}</div>` : ''}${pied}</div>`;
  }
  let controle;
  if (champ.saisie === 'choix') {
    const choix = options.includes(v) || !v ? options : [v, ...options];
    controle = `<select id="${id}" data-cle="${cle}" ${decrit}><option value="">${e(T.choisir)}</option>${choix.map((o) => `<option value="${e(o)}" ${o === v ? 'selected' : ''}>${e(o)}</option>`).join('')}</select>`;
  } else if (champ.saisie === 'long' || (champ.saisie === 'texte' && champ.max >= 300)) {
    controle = `<textarea id="${id}" data-cle="${cle}" maxlength="${champ.max}" class="${cle === 'description' ? '' : 'court'}" ${decrit}>${e(v || '')}</textarea>`;
  } else {
    const type = champ.saisie === 'url' ? 'url' : champ.saisie === 'courriel' ? 'email' : 'text';
    controle = `<input type="${type}" id="${id}" data-cle="${cle}" maxlength="${champ.max}" value="${e(v || '')}" ${champ.saisie === 'url' ? 'placeholder="https://" inputmode="url"' : ''} autocomplete="off" ${decrit}>`;
  }
  return `<div class="${classe}" data-champ="${cle}"><label for="${id}">${e(t.libelle)}${oblig}</label>${aide}${controle}${pied}</div>`;
}

function htmlGroupe(titre, cles) {
  return `<section class="f-groupe"><h3>${e(titre)}</h3>${cles.map(htmlChamp).join('')}</section>`;
}

// Ligne de contact, au bas de chaque écran.
function htmlQuestion() {
  return `<p class="f-question-contact">${e(T.question)} <a href="mailto:${e(T.adresseQuestions)}">${e(T.adresseQuestions)}</a>.</p>`;
}

// ─── Rendu des étapes ───
function htmlType() {
  const cartes = Object.entries(CLES_TYPE).map(([libelle, cle]) => {
    const t = T.types[cle];
    const choisi = etat.genre !== 'rsn' && etat.valeurs.typePrincipal === libelle;
    return `<button type="button" class="f-type" role="radio" aria-checked="${choisi}" data-type="${e(libelle)}" style="--type: var(--type-${cle}); --type-sur: var(--type-${cle}-sur)">
      ${puceType(cle)}<span><strong>${e(libelle)}</strong><span class="def">${e(t.definition)}</span><span class="ex">${e(T.exemples)} : ${e(t.exemples.join(', '))}.</span></span></button>`;
  }).join('');
  return `<p class="f-avis">${e(T.regle)}</p>
    <p class="f-question" id="questionType">${e(T.questionType)}</p>
    <div class="f-types" role="radiogroup" aria-labelledby="questionType">${cartes}
      <button type="button" class="f-type rsn" role="radio" aria-checked="${etat.genre === 'rsn'}" data-type="rsn"><span><strong>${e(T.rsnTitre)}</strong><span class="def">${e(T.rsnAide)}</span></span></button>
    </div>
    <p class="champ"><span class="erreur" role="alert">${e(etat.erreurs.typePrincipal || '')}</span></p>`;
}

function htmlVous() {
  const liens = Object.entries(T.liens).map(([cle, libelle]) => `<label class="f-case"><input type="radio" name="lienAvecRessource" value="${cle}" ${etat.lienAvecRessource === cle ? 'checked' : ''}>${e(libelle)}</label>`).join('');
  return `<section class="f-groupe"><h3>${e(T.vousTitre)}</h3>
    <div class="champ"><label for="nomProposant">${e(T.nomProposant.libelle)}</label><p class="aide">${e(T.nomProposant.aide)}</p>
      <input type="text" id="nomProposant" maxlength="200" value="${e(etat.nomProposant)}" autocomplete="name"></div>
    ${etat.genre === 'rsn' ? '' : `<fieldset class="champ"><legend>${e(T.lienQuestion)}</legend><div class="f-cases">${liens}</div></fieldset>`}
    <div class="champ coche${etat.erreurs.conditions ? ' en-erreur' : ''}"><label class="f-case"><input type="checkbox" id="conditions" ${etat.conditions ? 'checked' : ''}>${e(T.conditions)}</label>
      <p class="erreur" role="alert">${e(etat.erreurs.conditions || '')}</p></div>
  </section>`;
}

function afficher({ haut = false } = {}) {
  const liste = etapes();
  etat.etape = Math.min(etat.etape, liste.length - 1);
  const nom = liste[etat.etape];
  const derniere = etat.etape === liste.length - 1;
  const fiche = etat.donnees.fiche;
  let corps;
  if (nom === 'type') corps = htmlType();
  else if (nom === 'rsn') corps = `<button type="button" class="f-bouton lien" id="quitterRsn">${e(T.rsnRetour)}</button>${htmlGroupe(T.etapes.rsn, CHAMPS_RSN)}`;
  else if (nom === 'commun') corps = GROUPES.map(([groupe, cles]) => htmlGroupe(T.groupes[groupe], cles.filter((cle) => etat.genre === 'modification' || cle !== 'typePrincipal'))).join('');
  else corps = sectionsPropres().map((section) => htmlGroupe(T.groupes[section], PROPRES[section])).join('');

  const avis = etat.avis ? `<p class="f-avis ${etat.avis.sorte}" role="alert">${e(etat.avis.texte)}</p>` : '';
  racine.innerHTML = `<form class="f-carte" id="formulaire" novalidate>
    <h2 class="f-titre">${e(fiche ? T.titreModification(fiche.nom) : T.titreNouvelle)}</h2>
    <p class="f-intro">${e(T.intro)}</p>
    ${etat.donnees.dejaEnAttente ? `<p class="f-avis alerte">${e(T.dejaEnAttente)}</p>` : ''}
    <ol class="f-etapes" aria-hidden="true">${liste.map((_, i) => `<li class="${i < etat.etape ? 'faite' : i === etat.etape ? 'ici' : ''}"></li>`).join('')}</ol>
    <p class="f-etape-nom" id="titreEtape" tabindex="-1">${e(T.etape(etat.etape + 1, liste.length))} · <strong>${e(T.etapes[nom])}</strong></p>
    ${avis}${corps}${derniere && nom !== 'type' ? htmlVous() : ''}
    <div class="f-actions">
      ${etat.etape > 0 ? `<button type="button" class="f-bouton" id="precedent">${e(T.precedent)}</button>` : ''}
      <button type="submit" class="f-bouton principal droite" ${etat.envoi ? 'disabled' : ''}>${e(etat.envoi ? T.envoiEnCours : derniere && nom !== 'type' ? T.envoyer : T.suivant)}</button>
    </div>${htmlQuestion()}</form>`;
  // Le formulaire vient d'être redessiné : le focus va au premier champ à corriger, sinon au titre de l'étape.
  const fautif = racine.querySelector('.en-erreur input, .en-erreur select, .en-erreur textarea');
  if (fautif) { fautif.focus({ preventScroll: true }); fautif.scrollIntoView({ block: 'center' }); }
  else if (haut) { window.scrollTo({ top: 0 }); document.getElementById('titreEtape').focus({ preventScroll: true }); }
}

// ─── Saisie ───
function lireSaisie(cible) {
  const cle = cible.dataset.cle;
  if (!cle) return;
  const champ = PAR_CLE[cle];
  if (champ.saisie === 'coche') etat.valeurs[cle] = cible.checked;
  else if (champ.saisie === 'choixMultiples') {
    const actuelles = new Set(etat.valeurs[cle] || []);
    if (cible.checked) actuelles.add(cible.dataset.option); else actuelles.delete(cible.dataset.option);
    etat.valeurs[cle] = [...actuelles];
  } else etat.valeurs[cle] = cible.value;
  garder();
}

function ajouterValeur(cle) {
  const entree = document.getElementById(`c-${cle}`);
  const brut = entree.value.replace(/\s+/g, ' ').trim();
  if (!brut) return;
  // Une valeur déjà connue garde son écriture d'origine (« fhir » devient « HL7 FHIR » s'il existe tel quel).
  const connue = existantes(cle).find((o) => o.toLowerCase() === brut.toLowerCase());
  const valeur = connue || brut;
  const liste = etat.valeurs[cle] || [];
  if (!liste.some((v) => v.toLowerCase() === valeur.toLowerCase())) etat.valeurs[cle] = [...liste, valeur];
  entree.value = '';
  rafraichirListe(cle);
  entree.focus();
}
function rafraichirListe(cle) {
  document.getElementById(`p-${cle}`).innerHTML = htmlPuces(cle);
  if (cle === 'porteurs') document.getElementById('porteursNeufs').innerHTML = htmlPorteursNeufs();
  garder();
}

// Valide les champs de l'étape en cours ; renvoie vrai si elle peut être quittée.
function validerEtape(nom) {
  const cles = champsDeLEtape(nom);
  const fiche = etat.donnees.fiche;
  // En modification, seuls les champs touchés sont validés, comme le fera le serveur : une valeur
  // d'origine hors norme ne doit pas empêcher de corriger autre chose.
  const saisie = Object.fromEntries(cles
    .filter((cle) => etat.valeurs[cle] !== undefined && (!fiche || !egales(fiche.valeurs[cle], etat.valeurs[cle])))
    .map((cle) => [cle, etat.valeurs[cle]]));
  const options = { ...etat.donnees.options };
  const { erreurs } = nettoyer(saisie, { role: 'proposant', options, genre: etat.genre });
  etat.erreurs = Object.fromEntries(Object.entries(erreurs).filter(([cle]) => cles.includes(cle)));
  return Object.keys(etat.erreurs).length === 0;
}

function valeursAEnvoyer() {
  const fiche = etat.donnees.fiche;
  // Seulement les champs des étapes affichées : ce qui a été saisi pour un autre type ne part pas.
  const cles = etapes().flatMap(champsDeLEtape);
  const valeurs = {};
  for (const cle of cles) {
    const v = etat.valeurs[cle];
    if (v === undefined) continue;
    // Modification : seulement ce qui a changé. Nouvelle ressource : seulement ce qui est rempli.
    if (fiche ? !egales(fiche.valeurs[cle], v) : !estVide(v)) valeurs[cle] = v;
  }
  return valeurs;
}

async function envoyer() {
  etat.erreurs = {};
  if (!etat.conditions) { etat.erreurs.conditions = TEXTES.contribuer.obligatoire.replace(/^./, (c) => c.toUpperCase()) + '.'; return afficher(); }
  const valeurs = valeursAEnvoyer();
  if (etat.donnees.fiche && !Object.keys(valeurs).length) { etat.avis = { sorte: 'alerte', texte: T.aucunChangement }; return afficher({ haut: true }); }
  etat.envoi = true; etat.avis = null; afficher();
  let reponse; let corps = {};
  try {
    reponse = await fetch('/api/proposition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton, genre: etat.genre, valeurs, porteursNouveaux: etat.porteursNouveaux, nomProposant: etat.nomProposant, lienAvecRessource: etat.genre === 'rsn' ? 'aucun' : etat.lienAvecRessource, conditions: true }),
    });
    corps = await reponse.json().catch(() => ({}));
  } catch (err) { reponse = null; }
  etat.envoi = false;
  if (reponse && reponse.ok) { oublier(); return afficherMerci(corps.approuvee); }
  if (reponse && reponse.status === 401) return afficherDemandeDeLien(T.lienExpire);
  if (reponse && reponse.status === 410) return afficherMessage(T.ficheIntrouvable);
  if (reponse && reponse.status === 400 && corps.erreurs) {
    etat.erreurs = corps.erreurs;
    const liste = etapes();
    const fautive = liste.findIndex((nom) => champsDeLEtape(nom).some((cle) => corps.erreurs[cle]));
    if (fautive >= 0) etat.etape = fautive;
    etat.avis = { sorte: 'erreur', texte: T.erreursEnHaut };
  } else if (reponse && reponse.status === 400 && corps.code === 'aucun-changement') etat.avis = { sorte: 'alerte', texte: T.aucunChangement };
  else etat.avis = { sorte: 'erreur', texte: T.indisponible };
  afficher({ haut: true });
}

// ─── Écrans annexes ───
function afficherMerci(approuvee) {
  racine.innerHTML = `<div class="f-carte f-merci">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/></svg>
    <h2 class="f-titre">${e(T.merciTitre)}</h2><p>${e(approuvee ? T.merciApprouvee : T.merci)}</p>
    <a class="f-bouton principal" href="/">${e(T.retourCarte)}</a></div>`;
  window.scrollTo({ top: 0 });
}

function afficherMessage(texte) {
  racine.innerHTML = `<div class="f-carte"><p class="f-avis alerte" role="alert">${e(texte)}</p>
    <div class="f-actions"><a class="f-bouton principal" href="/">${e(T.retourCarte)}</a></div>${htmlQuestion()}</div>`;
}

function afficherDemandeDeLien(message) {
  const adresse = adresseVisee();
  racine.innerHTML = `<form class="f-carte" id="demandeLien" novalidate>
    <h2 class="f-titre">${e(T.lienTitre)}</h2>
    ${message ? `<p class="f-avis alerte">${e(message)}</p>` : `<p class="f-intro">${e(T.lienIntro)}</p>`}
    <div class="champ"><label for="courrielLien">${e(T.courriel)}</label><input type="email" id="courrielLien" maxlength="254" autocomplete="email" required>
      <p class="erreur" id="erreurLien" role="alert"></p></div>
    <div class="f-piege" aria-hidden="true"><label>Laisser ce champ vide<input type="text" id="siteLien" name="rsn-verification" tabindex="-1" autocomplete="off"></label></div>
    <div class="f-actions"><a class="f-bouton" href="/">${e(T.retourCarte)}</a><button type="submit" class="f-bouton principal droite">${e(T.recevoir)}</button></div>${htmlQuestion()}</form>`;
  document.getElementById('demandeLien').addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const courriel = document.getElementById('courrielLien').value.trim();
    const erreur = document.getElementById('erreurLien');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) { erreur.textContent = T.courrielInvalide; return; }
    const bouton = evenement.target.querySelector('button[type="submit"]');
    bouton.disabled = true;
    let ok = false;
    try {
      const reponse = await fetch('/api/lien', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courriel, but: adresse ? 'modifier' : 'proposer', adresse: adresse || undefined, site: document.getElementById('siteLien').value }),
      });
      ok = reponse.ok;
    } catch (err) { ok = false; }
    if (ok) racine.innerHTML = `<div class="f-carte f-merci"><h2 class="f-titre">${e(T.lienTitre)}</h2><p>${e(T.lienEnvoye)}</p><a class="f-bouton" href="/">${e(T.retourCarte)}</a></div>`;
    else { bouton.disabled = false; erreur.textContent = T.indisponible; }
  });
}

// ─── Événements du formulaire (délégués : le formulaire est redessiné à chaque étape) ───
racine.addEventListener('input', (evenement) => {
  const cible = evenement.target;
  if (cible.dataset.cle) lireSaisie(cible);
  else if (cible.dataset.adressePorteur) { etat.porteursNouveaux[cible.dataset.adressePorteur] = cible.value; garder(); }
  else if (cible.id === 'nomProposant') { etat.nomProposant = cible.value; garder(); }
  else if (cible.name === 'lienAvecRessource') { etat.lienAvecRessource = cible.value; garder(); }
  else if (cible.id === 'conditions') etat.conditions = cible.checked;
});
racine.addEventListener('keydown', (evenement) => {
  // Entrée dans une liste ouverte ajoute la valeur au lieu d'envoyer le formulaire.
  if (evenement.key === 'Enter' && evenement.target.dataset.ajout) { evenement.preventDefault(); ajouterValeur(evenement.target.dataset.ajout); }
});
racine.addEventListener('click', (evenement) => {
  const cible = evenement.target.closest('button');
  if (!cible || cible.type === 'submit') return;
  if (cible.dataset.ajouter) return ajouterValeur(cible.dataset.ajouter);
  if (cible.dataset.retirer) {
    const cle = cible.dataset.retirer;
    etat.valeurs[cle] = (etat.valeurs[cle] || []).filter((_, i) => i !== Number(cible.dataset.index));
    return rafraichirListe(cle);
  }
  if (cible.dataset.type) {
    if (cible.dataset.type === 'rsn') etat.genre = 'rsn';
    else { etat.genre = 'nouvelle'; etat.valeurs.typePrincipal = cible.dataset.type; }
    etat.erreurs = {}; etat.etape = 1; garder();
    return afficher({ haut: true });
  }
  if (cible.id === 'quitterRsn') { etat.genre = 'nouvelle'; etat.etape = 0; garder(); return afficher({ haut: true }); }
  if (cible.id === 'precedent') { etat.etape -= 1; etat.erreurs = {}; etat.avis = null; garder(); return afficher({ haut: true }); }
});
racine.addEventListener('submit', (evenement) => {
  if (evenement.target.id !== 'formulaire') return;
  evenement.preventDefault();
  if (etat.envoi) return;
  const liste = etapes();
  const nom = liste[etat.etape];
  // Une valeur tapée dans une liste ouverte mais pas encore ajoutée est prise en compte.
  for (const entree of racine.querySelectorAll('[data-ajout]')) if (entree.value.trim()) ajouterValeur(entree.dataset.ajout);
  if (nom === 'type' && etat.genre !== 'rsn' && !etat.valeurs.typePrincipal) { etat.erreurs = { typePrincipal: T.questionType }; return afficher(); }
  if (!validerEtape(nom)) {
    etat.avis = { sorte: 'erreur', texte: T.erreursEnHaut };
    return afficher();
  }
  etat.avis = null;
  if (etat.etape < liste.length - 1) { etat.etape += 1; garder(); return afficher({ haut: true }); }
  envoyer();
});

// ─── Mode clair ou sombre ───
document.getElementById('boutonTheme').addEventListener('click', () => {
  const sombre = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
  try { localStorage.setItem('rsn-theme', sombre ? 'light' : 'dark'); } catch (err) { /* sans mémoire */ }
});

// ─── Départ ───
(async function demarrer() {
  if (!jeton) return afficherDemandeDeLien(null);
  let reponse; let corps = {};
  try {
    reponse = await fetch(`/api/proposition?jeton=${encodeURIComponent(jeton)}`);
    corps = await reponse.json().catch(() => ({}));
  } catch (err) { reponse = null; }
  if (!reponse || (!reponse.ok && reponse.status !== 401 && reponse.status !== 410)) {
    racine.innerHTML = `<div class="f-carte"><p class="f-avis erreur">${e(T.indisponible)}</p></div>`;
    return;
  }
  if (reponse.status === 401) return afficherDemandeDeLien(T.lienExpire);
  if (reponse.status === 410) return afficherMessage(T.ficheIntrouvable);
  etat.donnees = corps;
  etat.genre = corps.genre;
  if (corps.fiche) {
    etat.valeurs = JSON.parse(JSON.stringify(corps.fiche.valeurs));
    document.title = `${T.titreModification(corps.fiche.nom)} | Cartographie du RSN`;
  }
  reprendre();
  afficher();
})();
})();
