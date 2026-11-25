/**
 * Contrôle d'une image de logo déposée par un visiteur. Le format est reconnu à son contenu,
 * jamais à son nom ni au type annoncé. Formats acceptés : PNG, JPEG, WebP, SVG ; 2 Mo au plus.
 */
const TAILLE_MAX = 2 * 1024 * 1024;
const MESSAGES = {
  absente: "L'image n'a pas pu être lue. Choisissez un autre fichier.",
  tropGrosse: "L'image dépasse 2 Mo. Choisissez un fichier plus léger.",
  format: 'Ce fichier n\'est pas une image PNG, JPEG, WebP ou SVG.',
  svgActif: 'Ce fichier SVG contient du code ou des liens externes. Exportez-le en SVG simple ou en PNG.',
};

// Un SVG ne doit rien exécuter ni rien charger d'ailleurs.
function svgSur(texte) {
  if (/<\s*(script|foreignObject|iframe|embed|object|audio|video|animate|set)\b/i.test(texte)) return false;
  if (/\son[a-z]+\s*=/i.test(texte)) return false;
  if (/(javascript|data|vbscript)\s*:/i.test(texte.replace(/\s+/g, ''))) return false;
  // Les références internes (#forme) sont permises ; tout lien vers l'extérieur est refusé.
  const liens = texte.match(/(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi) || [];
  if (liens.some((l) => !/=\s*["']#/.test(l))) return false;
  return !/url\(\s*["']?(?!#)/i.test(texte);
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
    const texte = octets.toString('utf8').replace(/^﻿/, '');
    const sansEntete = texte.replace(/<\?xml[\s\S]*?\?>/i, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '').trimStart();
    if (!/^<svg[\s>]/i.test(sansEntete) || texte.includes('\u0000')) return { ok: false, erreur: MESSAGES.format };
    if (/<!ENTITY/i.test(texte) || !svgSur(texte)) return { ok: false, erreur: MESSAGES.svgActif };
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
