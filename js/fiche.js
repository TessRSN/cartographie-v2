/**
 * Rendu HTML d'une fiche, identique dans la fenêtre de l'accueil et dans la
 * page publique servie aux moteurs de recherche.
 * Tout texte venu de Notion passe par echapper() ; toute adresse par adresseSure().
 */
(function (racine) {
'use strict';

const o = (typeof module !== 'undefined' && module.exports) ? require('./texte.js') : racine;

function lienExterne(adresse, libelle, classe) {
  const sure = o.adresseSure(adresse);
  if (!sure) return '';
  return `<a class="${classe || 'lien'}" href="${o.echapper(sure)}" target="_blank" rel="noopener noreferrer">${o.echapper(libelle)}</a>`;
}

function ligne(libelle, valeurHtml) {
  return valeurHtml ? `<div class="fiche-ligne"><dt>${o.echapper(libelle)}</dt><dd>${valeurHtml}</dd></div>` : '';
}

function section(titre, contenuHtml, classe) {
  return contenuHtml ? `<section class="fiche-section ${classe || ''}"><h3>${o.echapper(titre)}</h3>${contenuHtml}</section>` : '';
}

function pastilles(valeurs, classe) {
  return (valeurs || []).filter(Boolean).map((v) => `<span class="pastille ${classe || ''}">${o.echapper(v)}</span>`).join('');
}

function htmlFiche(f) {
  const T = o.TEXTES.fiche;
  const e = o.echapper;
  const types = [f.typePrincipal, f.secondType].filter(Boolean)
    .map((t) => `<span class="pastille type type-${o.cleType(t)}">${e(t)}</span>`).join('');
  const etat = f.etat ? `<span class="pastille etat etat-${o.cleEtat(f.etat)}">${e(f.etat)}</span>` : '';
  const porteurs = (f.porteurs || []).map((p) => e(p.nom)).join(' · ');

  const entete = `<header class="fiche-entete">
    <h2 class="fiche-nom">${e(f.nom)}</h2>
    ${porteurs ? `<p class="fiche-porteurs">${porteurs}</p>` : ''}
    ${f.autresNoms ? `<p class="fiche-autres-noms">${e(T.autresNoms)} : ${e(f.autresNoms)}</p>` : ''}
    <p class="fiche-pastilles">${types}${etat}</p>
  </header>`;

  const presentation = `${f.phrase ? `<p class="fiche-phrase">${e(f.phrase)}</p>` : ''}${f.description ? `<p class="fiche-description">${e(f.description)}</p>` : ''}`;

  const acces = [
    ligne(T.modeAcces, pastilles(f.modesAcces, 'acces')),
    ligne(T.frais, f.frais ? e(f.frais) : ''),
    ligne(T.environnementSecurise, f.environnementSecurise ? e(T.environnementSecuriseOui) : ''),
    ligne(T.reserveA, f.reserveA ? e(f.reserveA) : ''),
  ].join('');
  const boutons = [
    lienExterne(f.commentAcceder, T.commentAcceder, 'bouton bouton-principal'),
    lienExterne(f.lien, T.visiter, 'bouton'),
  ].join('');
  const contactHtml = f.contact && /^[^@\s<>"']+@[^@\s<>"']+$/.test(f.contact)
    ? `<a class="lien" href="mailto:${e(f.contact)}">${e(f.contact)}</a>` : '';
  const responsableHtml = f.responsable
    ? (o.adresseSure(f.profilResponsable) ? lienExterne(f.profilResponsable, f.responsable) : e(f.responsable)) : '';
  const blocAcces = section(T.acces,
    `${acces ? `<dl>${acces}</dl>` : ''}${boutons ? `<p class="fiche-boutons">${boutons}</p>` : ''}`
    + ((contactHtml || responsableHtml) ? `<dl>${ligne(T.contact, contactHtml)}${ligne(T.responsable, responsableHtml)}</dl>` : ''),
    'fiche-acces');

  const jeu = [
    ligne(T.population, f.population ? e(f.population) : ''),
    ligne(T.periode, f.periode ? e(f.periode) : ''),
    ligne(T.typesDonnees, pastilles(f.typesDonnees)),
    ligne(T.collecte, f.collecte ? e(f.collecte) : ''),
    ligne(T.jumelage, f.jumelage ? 'Oui' : ''),
    ligne(T.dictionnaire, lienExterne(f.dictionnaire, f.dictionnaire)),
  ].join('');
  const code = [
    ligne(T.depotCode, lienExterne(f.depotCode, f.depotCode)),
    ligne(T.licence, f.licence ? e(f.licence) : ''),
  ].join('');
  const bref = [
    ligne(T.financePar, pastilles(f.financePar)),
    ligne(T.portee, f.portee ? e(f.portee) : ''),
    ligne(T.langues, (f.langues || []).map(e).join(', ')),
  ].join('');

  const liens = (f.liens || []).map((l) =>
    `<li>${e(l.nature.charAt(0).toUpperCase() + l.nature.slice(1))} : <a class="lien" href="/ressource/${e(l.adresse)}" data-fiche="${e(l.adresse)}">${e(l.nom)}</a></li>`).join('');
  const motsCles = (f.motsCles || []).map((m) =>
    `<a class="pastille mot-cle" href="/?q=${encodeURIComponent(m)}" data-mot-cle="${e(m)}">${e(m)}</a>`).join('');

  const verification = f.verifieeLe && o.dateLongue(f.verifieeLe)
    ? `<p class="fiche-verification">${e(T.verifieeLe)} ${e(o.dateLongue(f.verifieeLe))}.</p>`
    : `<p class="fiche-verification">${e(T.nonConfirmee)}</p>`;

  return `<article class="fiche">${entete}${presentation}${blocAcces}`
    + section(T.detailsJeu, jeu ? `<dl>${jeu}</dl>` : '')
    + section(T.detailsLogiciel, code ? `<dl>${code}</dl>` : '')
    + section(T.enBref, bref ? `<dl>${bref}</dl>` : '')
    + section(T.liens, liens ? `<ul class="fiche-liens">${liens}</ul>` : '')
    + section(T.motsCles, motsCles ? `<p class="fiche-mots-cles">${motsCles}</p>` : '')
    + `${verification}</article>`;
}

const api = { htmlFiche };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(racine, api);
})(typeof window !== 'undefined' ? window : globalThis);
