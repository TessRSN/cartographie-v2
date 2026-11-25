/**
 * Contrôle d'une image de logo déposée par un visiteur. Le format est reconnu à son contenu,
 * jamais à son nom ni au type annoncé. Formats acceptés : PNG, JPEG, WebP, SVG ; 2 Mo au plus.
 */
const TAILLE_MAX = 2 * 1024 * 1024;
const MESSAGES = {
  absente: "L'image n'a pas pu être lue. Choisissez un autre fichier.",
  tropGrosse: "L'image dépasse 2 Mo. Choisissez un fichier plus léger.",
  format: 'Ce fichier n\'est pas une image PNG, JPEG, WebP ou SVG.',
  svgActif: 'Ce fichier SVG contient du code, des liens externes ou des éléments que nous n\'acceptons pas. Exportez-le en SVG simple ou en PNG.',
  svgTropGros: 'Un logo en SVG ne peut pas dépasser 500 ko. Exportez-le en PNG.',
};

// Un SVG ne doit rien exécuter ni rien charger d'ailleurs. Plutôt que de chercher ce qui est
// dangereux, on n'accepte que ce qui est connu : des éléments de dessin, sans préfixe, sans DTD,
// sans instruction de traitement, sans encodage exotique.
const TAILLE_MAX_SVG = 500 * 1024;
const ELEMENTS_SVG = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'symbol', 'use', 'title', 'desc', 'style',
  'marker', 'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feFlood', 'feGaussianBlur', 'feMerge',
  'feMergeNode', 'feOffset', 'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'feMorphology', 'feDropShadow']);

// Retire les commentaires par un parcours simple (temps proportionnel à la taille). null s'il en reste un ouvert.
function sansCommentaires(texte) {
  let sortie = ''; let i = 0;
  for (;;) {
    const debut = texte.indexOf('<!--', i);
    if (debut === -1) return sortie + texte.slice(i);
    const fin = texte.indexOf('-->', debut + 4);
    if (fin === -1) return null;
    sortie += texte.slice(i, debut);
    i = fin + 3;
  }
}

function svgSur(texte) {
  // Caractères de contrôle (dont ceux qu'un autre encodage ferait disparaître), échappements CSS, entités numériques.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texte) || texte.includes('\\') || texte.includes('&#')) return false;
  let corps = texte;
  if (corps.startsWith('<?xml')) {
    const fin = corps.indexOf('?>');
    if (fin === -1) return false;
    const encodage = /\sencoding\s*=\s*["']([^"']*)["']/i.exec(corps.slice(0, fin));
    if (encodage && encodage[1].toLowerCase() !== 'utf-8') return false;
    corps = corps.slice(fin + 2);
  }
  corps = sansCommentaires(corps);
  if (corps === null || !/^\s*<svg[\s>/]/.test(corps)) return false;
  // Chaque balise doit être un élément connu : cela écarte aussi <!DOCTYPE, <![CDATA[, <?…?> et les préfixes.
  for (const balise of corps.matchAll(/<\/?([^\s>/]*)/g)) if (!ELEMENTS_SVG.has(balise[1])) return false;
  if (/[^a-z]on[a-z]+\s*=/i.test(texte) || /\ssrc\s*=/i.test(texte) || /@import/i.test(texte)) return false;
  if (/["'(=\s](javascript|data|vbscript):/i.test(texte)) return false;
  // Les références internes (#forme) sont permises ; tout lien vers l'extérieur est refusé.
  const liens = texte.match(/href\s*=\s*("[^"]*"|'[^']*')/gi) || [];
  if (liens.some((l) => !/=\s*["']#/.test(l))) return false;
  for (const appel of texte.matchAll(/url\(/gi)) {
    if (!texte.slice(appel.index + 4, appel.index + 24).replace(/^[\s"']+/, '').startsWith('#')) return false;
  }
  return true;
}

// Reconnaît le format d'un tampon d'octets. Renvoie { ok, type, nom, octets } ou { ok: false, erreur }.
function verifierOctets(octets) {
  if (!Buffer.isBuffer(octets) || octets.length < 8) return { ok: false, erreur: MESSAGES.absente };
  if (octets.length > TAILLE_MAX) return { ok: false, erreur: MESSAGES.tropGrosse };
  const debut = octets.subarray(0, 12);
  let type = null; let extension = null;
  if (debut.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) [type, extension] = ['image/png', 'png'];
  else if (debut[0] === 0xff && debut[1] === 0xd8 && debut[2] === 0xff) [type, extension] = ['image/jpeg', 'jpg'];
  else if (debut.subarray(0, 4).toString('latin1') === 'RIFF' && debut.subarray(8, 12).toString('latin1') === 'WEBP') [type, extension] = ['image/webp', 'webp'];
  else {
    const texte = octets.subarray(0, TAILLE_MAX_SVG + 1).toString('utf8').replace(/^﻿/, '');
    if (!/^\s*<(svg[\s>/]|\?xml\s|!--|!DOCTYPE)/i.test(texte.slice(0, 200))) return { ok: false, erreur: MESSAGES.format };
    if (octets.length > TAILLE_MAX_SVG) return { ok: false, erreur: MESSAGES.svgTropGros };
    if (!svgSur(texte.trimStart())) return { ok: false, erreur: MESSAGES.svgActif };
    [type, extension] = ['image/svg+xml', 'svg'];
  }
  return { ok: true, type, nom: `logo.${extension}`, octets };
}

// Même contrôle pour une image reçue du formulaire : { nom, donnees } où donnees est en base64.
function verifierImage(fichier) {
  if (!fichier || typeof fichier !== 'object' || typeof fichier.donnees !== 'string' || !fichier.donnees) return { ok: false, erreur: MESSAGES.absente };
  // 4 caractères de base64 portent 3 octets : inutile de décoder un envoi manifestement trop gros.
  if (fichier.donnees.length > Math.ceil(TAILLE_MAX / 3) * 4 + 4) return { ok: false, erreur: MESSAGES.tropGrosse };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fichier.donnees)) return { ok: false, erreur: MESSAGES.absente };
  return verifierOctets(Buffer.from(fichier.donnees, 'base64'));
}

module.exports = { verifierImage, verifierOctets, TAILLE_MAX };
