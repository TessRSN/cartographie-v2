/**
 * GET /api/resume : le résumé hebdomadaire des propositions en attente, envoyé aux approbateurs.
 * Déclenché par le planificateur de Vercel (voir « crons » dans vercel.json), qui joint
 * l'en-tête « Authorization: Bearer <CRON_SECRET> ». Sans ce secret, la route refuse.
 * Rien ne part s'il n'y a aucune proposition en attente, ni quand les contributions sont fermées.
 * Une « Modification de l'équipe » n'est annoncée qu'aux personnes en Administration, les seules à
 * pouvoir la trancher ; les autres ne reçoivent que les propositions du public, et rien s'il n'y en a pas.
 * La même tâche fait la copie de sauvegarde de la semaine (lib/sauvegardes.js), pour ne pas ajouter
 * une tâche planifiée. Le résumé part d'abord, la copie ensuite, et aucun ne dépend de l'autre : une
 * copie qui échoue n'empêche pas le résumé, un résumé qui échoue n'empêche pas la copie.
 * La réponse dit où en est la copie : « faite », « inactive » (pas de base « Sauvegardes ») ou « echec ».
 */
const crypto = require('node:crypto');
const { ouvertes, origineSure, dependances } = require('../lib/contributions');

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
    // Le résumé : ce qu'il faut répondre, sans jamais lever.
    const resume = async () => {
      try {
        // Tout ce qui attend encore une décision : les nouvelles et celles en vérification.
        const enAttente = await d.propositions.listerPropositions({ statut: 'ouvertes' });
        if (!enAttente.length) return { statut: 200, corps: { ok: true, enAttente: 0, envoyes: 0 } };
        const ligne = (x) => ({ titre: x.titre, proposeLe: x.proposeLe });
        const toutes = enAttente.map(ligne);
        const duPublic = enAttente.filter((x) => x.genre !== 'equipe').map(ligne);
        const lienPanneau = `${origineSure(req, env)}/admin`;
        let envoyes = 0;
        // Un courriel par personne : les adresses des approbateurs ne circulent pas entre eux.
        for (const personne of (await d.propositions.equipe()).filter((x) => x.resume)) {
          const propositions = personne.role === 'administration' ? toutes : duPublic;
          if (!propositions.length) continue;
          try {
            const retour = await d.courriels.resumeHebdomadaire({ a: personne.courriel, propositions, lienPanneau, destinataire: personne.nom || '' });
            if (retour && retour.envoye) envoyes += 1;
          } catch (err) {
            d.journal('[résumé] envoi impossible :', err.message);
          }
        }
        return { statut: 200, corps: { ok: true, enAttente: enAttente.length, envoyes } };
      } catch (err) {
        d.journal('[résumé] échec :', err.message);
        return { statut: 502, corps: { erreur: 'Le service est indisponible pour le moment.' } };
      }
    };
    // La copie de la semaine : son état seulement, sans jamais lever. null sans module de sauvegarde.
    const copie = async () => {
      if (!d.sauvegardes) return null;
      try {
        const retour = await d.sauvegardes.hebdomadaire();
        return retour && ['faite', 'inactive'].includes(retour.etat) ? retour.etat : 'echec';
      } catch (err) {
        d.journal('[résumé] copie de sauvegarde impossible :', err.message);
        return 'echec';
      }
    };
    // Le résumé d'abord, puis la copie : les courriels sont partis avant que la copie, plus longue,
    // ne commence, et les deux ne se disputent pas Notion.
    const { statut, corps } = await resume();
    const sauvegarde = await copie();
    return res.status(statut).json(sauvegarde ? { ...corps, sauvegarde } : corps);
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
