/**
 * GET /api/export : les fiches publiques de la cartographie, en JSON.
 * La lecture de Notion est gardée quelques minutes en mémoire par instance ;
 * si Notion ne répond plus, la dernière lecture réussie est servie.
 */
const { lireRessources, lirePorteurs } = require('../lib/notion');
const { assembler } = require('../lib/fiches');

const DUREE_MEMOIRE_MS = 5 * 60 * 1000;
const MESSAGE_INDISPONIBLE = 'Les données ne sont pas disponibles pour le moment.';

async function lireNotion() {
  const [ressources, porteurs] = await Promise.all([lireRessources(), lirePorteurs()]);
  return assembler(ressources, porteurs);
}

// Fabrique une source de données avec mémoire. Séparée du gestionnaire pour
// que les pages publiques (api/ressource.js) partagent la même lecture.
function creerSource({ lire = lireNotion, maintenant = Date.now, dureeMs = DUREE_MEMOIRE_MS, journal = console.error } = {}) {
  let garde = null;      // { a, donnees }
  let enCours = null;    // lecture en vol, partagée entre appels simultanés
  return async function source() {
    if (garde && maintenant() - garde.a < dureeMs) return garde.donnees;
    if (!enCours) {
      enCours = (async () => {
        try {
          const donnees = await lire();
          garde = { a: maintenant(), donnees: { ...donnees, genereLe: new Date(maintenant()).toISOString() } };
          return garde.donnees;
        } finally {
          enCours = null;
        }
      })();
    }
    try {
      return await enCours;
    } catch (err) {
      if (garde) {
        journal('[export] Notion indisponible, données gardées servies :', err.message);
        return garde.donnees;
      }
      throw err;
    }
  };
}

function creerGestionnaire({ source, journal = console.error } = {}) {
  return async function gestionnaire(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ erreur: 'Méthode non permise.' });
    }
    try {
      const donnees = await source();
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({
        genereLe: donnees.genereLe,
        ressources: donnees.ressources,
        porteurs: donnees.porteurs,
        carte: { cle: process.env.CARTO_BASEMAP_KEY || '' },
      });
    } catch (err) {
      // Le détail reste dans les journaux du serveur, jamais dans la réponse.
      journal('[export] Lecture de Notion impossible :', err.message);
      return res.status(502).json({ erreur: MESSAGE_INDISPONIBLE });
    }
  };
}

const donneesPubliques = creerSource();

module.exports = creerGestionnaire({ source: donneesPubliques });
module.exports.config = { maxDuration: 30 };
module.exports.creerGestionnaire = creerGestionnaire;
module.exports.creerSource = creerSource;
module.exports.donneesPubliques = donneesPubliques;
module.exports.MESSAGE_INDISPONIBLE = MESSAGE_INDISPONIBLE;
