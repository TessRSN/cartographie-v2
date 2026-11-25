/**
 * GET /api/liens : la tournée hebdomadaire des liens principaux. Chaque fiche publiée est visitée
 * (voir lib/liens.js) et sa colonne « Lien en panne depuis » n'est écrite que si l'état change.
 * Déclenchée par le planificateur de Vercel (voir « crons » dans vercel.json), qui joint
 * l'en-tête « Authorization: Bearer <CRON_SECRET> ». Sans ce secret, la route refuse.
 * La réponse ne porte que des comptes : ni nom de fiche, ni adresse.
 */
const crypto = require('node:crypto');
const { ouvertes, dependances } = require('../lib/contributions');

// Comparaison en temps constant, pour ne rien laisser deviner du secret.
function memeSecret(recu, attendu) {
  const a = Buffer.from(String(recu || '')); const b = Buffer.from(String(attendu || ''));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function creerGestionnaire(donnees) {
  return async function gestionnaire(req, res) {
    const env = (donnees && donnees.env) || process.env;
    if (!ouvertes(env)) return res.status(404).json({ erreur: 'Introuvable.' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erreur: 'Méthode non permise.' }); }
    res.setHeader('Cache-Control', 'no-store');
    const entete = String((req.headers && req.headers.authorization) || '');
    if (!env.CRON_SECRET || !entete.startsWith('Bearer ') || !memeSecret(entete.slice(7), env.CRON_SECRET)) {
      return res.status(401).json({ erreur: 'Accès refusé.' });
    }

    const d = dependances(donnees);
    try {
      return res.status(200).json({ ok: true, ...(await d.liens.verifierTous()) });
    } catch (err) {
      d.journal('[liens] échec :', err.message);
      return res.status(502).json({ erreur: 'Le service est indisponible pour le moment.' });
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
