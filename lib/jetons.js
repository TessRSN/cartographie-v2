/**
 * Jetons signés des liens envoyés par courriel. Quatre sortes :
 *   proposer → proposer une ressource             (24 heures)
 *   modifier → proposer une modification de fiche (24 heures)
 *   panneau  → entrer dans le panneau             (1 heure)
 *   session  → session du panneau                 (7 jours)
 * Un jeton n'est valable que pour la sorte demandée à la vérification.
 */
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const DUREES = { proposer: '24h', modifier: '24h', panneau: '1h', session: '7d' };

function secretOuErreur(secret) {
  if (!secret) throw new Error('JWT_SECRET manquant');
  return secret;
}

function signer(sorte, charge, { secret = process.env.JWT_SECRET, duree } = {}) {
  secretOuErreur(secret);
  if (!Object.hasOwn(DUREES, sorte)) throw new Error(`Sorte de jeton inconnue : ${sorte}`);
  return jwt.sign({ ...charge, sorte }, secret, {
    algorithm: 'HS256', expiresIn: duree === undefined ? DUREES[sorte] : duree, jwtid: crypto.randomUUID(),
  });
}

// Renvoie la charge du jeton, ou null s'il est échu, falsifié ou d'une autre sorte.
function verifier(jeton, sorte, { secret = process.env.JWT_SECRET } = {}) {
  secretOuErreur(secret);
  if (typeof jeton !== 'string' || !jeton) return null;
  try {
    const charge = jwt.verify(jeton, secret, { algorithms: ['HS256'] });
    return charge && charge.sorte === sorte ? charge : null;
  } catch (err) {
    return null;
  }
}

// Adresse en minuscules, sans espaces autour ; null si elle n'a pas la forme x@y.z.
function normaliserCourriel(texte) {
  if (typeof texte !== 'string') return null;
  const courriel = texte.trim().toLowerCase();
  if (courriel.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) return null;
  return courriel;
}

module.exports = { signer, verifier, normaliserCourriel, DUREES };
