/**
 * Rendu HTML d'une fiche et d'une carte de fiche, identique dans le navigateur
 * et dans la page publique servie aux moteurs de recherche.
 * Fonctions pures : elles renvoient une chaîne, sans accès à la page.
 * Tout texte venu de Notion passe par echapper() ; toute adresse par adresseSure().
 * Les classes sont celles du bottin (card-top, avatar, card-tag, card-detail, card-link…).
 */
(function (racine) {
'use strict';

const o = (typeof module !== 'undefined' && module.exports) ? require('./texte.js') : racine;

const ICONE_GRAPHE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 7.8l4 8.4M17 7.8l-4 8.4M8 6h8"/></svg>';

function lienExterne(adresse, libelle, classe) {
  const sure = o.adresseSure(adresse);
  if (!sure) return '';
  return `<a class="${classe || 'lien'}" href="${o.echapper(sure)}" target="_blank" rel="noopener noreferrer">${o.echapper(libelle)}</a>`;
}

function ligne(libelle, valeurHtml) {
  return valeurHtml ? `<div class="card-detail"><dt class="dl">${o.echapper(libelle)}</dt><dd>${valeurHtml}</dd></div>` : '';
}

function details(lignesHtml) {
  return lignesHtml ? `<dl class="card-details">${lignesHtml}</dl>` : '';
}

function section(titre, contenuHtml, classe) {
  return contenuHtml ? `<section class="fiche-section${classe ? ' ' + classe : ''}"><h3>${o.echapper(titre)}</h3>${contenuHtml}</section>` : '';
}

function puces(valeurs, classe) {
  return (valeurs || []).filter(Boolean).map((v) => `<span class="${classe || 'axe-chip'}">${o.echapper(v)}</span>`).join('');
}

// Étiquettes des modes d'accès, une teinte par mode ; avecLibelle écrit « Accès : … » (cartes de fiche).
function pucesAcces(modes, avecLibelle) {
  return (modes || []).filter(Boolean).map((m) =>
    `<span class="axe-chip acces acces-${o.cleAcces(m)}">${o.echapper(avecLibelle ? o.TEXTES.acces(m) : m)}</span>`).join('');
}

function puceSujet(m) {
  return `<a class="axe-chip mot-cle" href="/?q=${encodeURIComponent(m)}" data-mot-cle="${o.echapper(m)}">${o.echapper(m)}</a>`;
}

// Pastille du type : nom court, nom complet en infobulle.
function pastilleType(type) {
  if (!type) return '';
  const cle = o.cleType(type);
  const court = cle === 'autre' ? type : o.TEXTES.typesCourts[cle];
  return `<span class="card-tag type-${cle}" title="${o.echapper(type)}">${o.echapper(court)}</span>`;
}

// Logo de la ressource dans un cadre de taille fixe. Sans logo, ou si l'image
// ne se charge pas : une pastille ronde avec les initiales, de la couleur du type.
function htmlLogo(f, classe) {
  const logo = o.adresseLogo(f.logo);
  const image = logo
    ? `<img src="${o.echapper(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('avec-logo');this.remove()">`
    : '';
  return `<span class="avatar type-${o.cleType(f.typePrincipal)}${logo ? ' avec-logo' : ''}${classe ? ' ' + classe : ''}" aria-hidden="true">${o.echapper(o.initiales(f.nom))}${image}</span>`;
}

// Carte d'une ressource dans la liste de l'accueil.
function htmlCarteFiche(r) {
  const e = o.echapper;
  const T = o.TEXTES.liste;
  const porteurs = (r.porteurs || []).map((p) => p.nom).filter(Boolean);
  // Un seul porteur sur une ligne, les autres comptés (« +2 ») ; le texte complet est dans l'infobulle.
  const porteursHtml = porteurs.length
    ? `<span class="card-porteur">${e(porteurs[0])}</span>`
      + (porteurs.length > 1 ? `<span class="card-plus">+${porteurs.length - 1}<span class="visually-hidden"> (${e(o.TEXTES.autresPorteurs(porteurs.length - 1))})</span></span>` : '')
    : '';
  const acces = pucesAcces(r.modesAcces, true);
  // Trois sujets au plus, cliquables comme dans la fiche ; les autres sont comptés.
  const tousSujets = (r.motsCles || []).filter(Boolean);
  const sujets = tousSujets.slice(0, 3).map(puceSujet).join('')
    + (tousSujets.length > 3 ? `<span class="chip-more" title="${e(tousSujets.slice(3).join(' · '))}">+${tousSujets.length - 3}<span class="visually-hidden"> (${e(o.TEXTES.autresSujets(tousSujets.length - 3))})</span></span>` : '');
  return `<article class="member-card">
    <div class="card-top">${htmlLogo(r)}<div class="card-id"><h3 class="card-name" title="${e(r.nom)}">${e(r.nom)}</h3>${porteursHtml ? `<div class="card-institution" title="${e(porteurs.join(' · '))}">${porteursHtml}</div>` : ''}</div>${pastilleType(r.typePrincipal)}</div>
    ${r.phrase ? `<p class="card-themes">${e(r.phrase)}</p>` : ''}
    ${acces ? `<div class="card-chips-row">${acces}</div>` : ''}
    ${sujets ? `<div class="card-chips-row card-sujets">${sujets}</div>` : ''}
    <div class="card-foot">
      <a class="card-action" href="/ressource/${e(r.adresse)}" data-fiche="${e(r.adresse)}">${e(T.voirFiche)}<span class="visually-hidden"> : ${e(r.nom)}</span></a>
      <button type="button" class="card-action" data-graphe="${e(r.adresse)}">${ICONE_GRAPHE}${e(T.voirConnexions)}<span class="visually-hidden"> : ${e(r.nom)}</span></button>
    </div>
  </article>`;
}

function htmlFiche(f) {
  const T = o.TEXTES.fiche;
  const e = o.echapper;
  const types = [f.typePrincipal, f.secondType].filter(Boolean).map(pastilleType).join('');
  const etat = f.etat ? `<span class="card-tag etat-${o.cleEtat(f.etat)}">${e(f.etat)}</span>` : '';
  const porteurs = (f.porteurs || []).map((p) => e(p.nom)).join('<br>');

  const entete = `<header class="fiche-entete card-top">
    ${htmlLogo(f, 'avatar-lg')}
    <div class="card-id">
      <h2 class="fiche-nom card-name">${e(f.nom)}</h2>
      ${porteurs ? `<p class="fiche-porteurs card-institution">${porteurs}</p>` : ''}
      ${f.autresNoms ? `<p class="fiche-autres-noms">${e(T.autresNoms)} : ${e(f.autresNoms)}</p>` : ''}
    </div>
  </header>
  ${types || etat ? `<p class="fiche-pastilles">${types}${etat}</p>` : ''}`;

  const presentation = `${f.phrase ? `<p class="fiche-phrase">${e(f.phrase)}</p>` : ''}${f.description ? `<p class="fiche-description">${e(f.description)}</p>` : ''}`;

  const acces = [
    ligne(T.modeAcces, pucesAcces(f.modesAcces, false)),
    ligne(T.frais, f.frais ? e(f.frais) : ''),
    ligne(T.environnementSecurise, f.environnementSecurise ? e(T.environnementSecuriseOui) : ''),
    ligne(T.reserveA, f.reserveA ? e(f.reserveA) : ''),
  ].join('');
  const boutons = [
    lienExterne(f.commentAcceder, T.commentAcceder, 'card-link'),
    lienExterne(f.lien, T.visiter, 'card-link card-link-second'),
  ].join('');
  const contactHtml = f.contact && /^[^@\s<>"']+@[^@\s<>"']+$/.test(f.contact)
    ? `<a class="lien" href="mailto:${e(f.contact)}">${e(f.contact)}</a>` : '';
  const responsableHtml = f.responsable
    ? (o.adresseSure(f.profilResponsable) ? lienExterne(f.profilResponsable, f.responsable) : e(f.responsable)) : '';
  // Autres liens : le texte est toujours montré ; seule une adresse en http(s) devient un lien.
  const autresLiens = o.decouperAutresLiens(f.autresLiens)
    .map((l) => `<li>${l.adresse ? lienExterne(l.adresse, l.libelle) : e(l.libelle)}</li>`).join('');
  const blocAcces = section(T.acces,
    details(acces)
    + (boutons ? `<p class="card-links">${boutons}</p>` : '')
    + details(ligne(T.contact, contactHtml) + ligne(T.responsable, responsableHtml)
      + ligne(T.autresLiens, autresLiens ? `<ul class="fiche-liste">${autresLiens}</ul>` : '')),
    'fiche-acces');

  const jeu = [
    ligne(T.population, f.population ? e(f.population) : ''),
    ligne(T.periode, f.periode ? e(f.periode) : ''),
    ligne(T.typesDonnees, puces(f.typesDonnees)),
    ligne(T.collecte, f.collecte ? e(f.collecte) : ''),
    ligne(T.jumelage, f.jumelage ? e(o.TEXTES.oui) : ''),
    ligne(T.dictionnaire, lienExterne(f.dictionnaire, f.dictionnaire)),
  ].join('');
  const code = [
    ligne(T.depotCode, lienExterne(f.depotCode, f.depotCode)),
    ligne(T.licence, f.licence ? e(f.licence) : ''),
  ].join('');
  const bref = [
    ligne(T.financePar, puces(f.financePar)),
    ligne(T.portee, f.portee ? e(f.portee) : ''),
    ligne(T.langues, (f.langues || []).map(e).join(', ')),
  ].join('');

  const liens = (f.liens || []).map((l) =>
    `<li>${e(String(l.nature || '').charAt(0).toUpperCase() + String(l.nature || '').slice(1))} : <a class="lien" href="/ressource/${e(l.adresse)}" data-fiche="${e(l.adresse)}">${e(l.nom)}</a></li>`).join('');
  const motsCles = (f.motsCles || []).filter(Boolean).map(puceSujet).join('');

  const verification = f.verifieeLe && o.dateLongue(f.verifieeLe)
    ? `<p class="fiche-verification">${e(T.verifieeLe)} ${e(o.dateLongue(f.verifieeLe))}.</p>`
    : `<p class="fiche-verification">${e(T.nonConfirmee)}</p>`;

  return `<article class="fiche">${entete}${presentation}${blocAcces}`
    + section(T.detailsJeu, details(jeu))
    + section(T.detailsLogiciel, details(code))
    + section(T.enBref, details(bref))
    + section(T.liens, liens ? `<ul class="fiche-liste">${liens}</ul>` : '')
    + section(T.motsCles, motsCles ? `<p class="card-chips-row">${motsCles}</p>` : '')
    + `${verification}</article>`;
}

const api = { htmlFiche, htmlCarteFiche, htmlLogo, ICONE_GRAPHE };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
