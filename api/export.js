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

const ATTENTE_AVEC_GARDE_MS = 4000;    // au-delà, la lecture gardée est servie
const ATTENTE_SANS_GARDE_MS = 20000;   // au-delà, sans lecture gardée, la demande échoue
const REPRISE_APRES_ECHEC_MS = 45000;  // pause avant de réinterroger Notion après un échec

function delai(ms, message) {
  let minuterie;
  const promesse = new Promise((_, rejeter) => { minuterie = setTimeout(() => rejeter(new Error(message)), ms); });
  return { promesse, annuler: () => clearTimeout(minuterie) };
}

// Fabrique une source de données avec mémoire. Séparée du gestionnaire pour
// que les pages publiques (api/ressource.js) utilisent le même mécanisme.
// Notion lent ou en panne : la dernière lecture réussie est servie sans attendre,
// et Notion n'est pas réinterrogé à chaque visite.
function creerSource({
  lire = lireNotion, maintenant = Date.now, dureeMs = DUREE_MEMOIRE_MS, journal = console.error,
  attenteMs = ATTENTE_AVEC_GARDE_MS, attenteSansGardeMs = ATTENTE_SANS_GARDE_MS, repriseMs = REPRISE_APRES_ECHEC_MS,
  intervalleRafraichirMs = 15000,
} = {}) {
  let garde = null;        // { a, donnees }
  let enCours = null;      // lecture en vol, partagée entre appels simultanés
  let dernierEchec = null; // moment du dernier échec

  function lancer() {
    if (!enCours) {
      enCours = (async () => {
        try {
          const donnees = await lire();
          garde = { a: maintenant(), donnees: { ...donnees, genereLe: new Date(maintenant()).toISOString() } };
          dernierEchec = null;
          return garde.donnees;
        } catch (err) {
          dernierEchec = maintenant();
          throw err;
        } finally {
          enCours = null;
        }
      })();
      enCours.catch(() => {}); // l'échec est traité par ceux qui attendent
    }
    return enCours;
  }

  async function source() {
    if (garde && maintenant() - garde.a < dureeMs) return garde.donnees;
    const enPause = dernierEchec !== null && maintenant() - dernierEchec < repriseMs;
    if (garde && enPause) return garde.donnees;
    if (!garde && enPause) throw new Error('Notion indisponible, nouvel essai différé');
    const limite = delai(garde ? attenteMs : attenteSansGardeMs, 'Notion ne répond pas');
    try {
      return await Promise.race([lancer(), limite.promesse]);
    } catch (err) {
      if (dernierEchec === null) dernierEchec = maintenant();
      if (garde) {
        journal('[export] Notion indisponible, données gardées servies :', err.message);
        return garde.donnees;
      }
      throw err;
    } finally {
      limite.annuler();
    }
  }
  // Oublie la lecture gardée : la prochaine demande relit Notion (après une approbation).
  source.vider = () => { garde = null; dernierEchec = null; };
  // Relit Notion sans attendre la fin de la mémoire : sert quand on demande une fiche que la lecture
  // gardée ne connaît pas (elle vient peut-être d'être approuvée). Au plus une relecture par
  // intervalle, pour qu'une série d'adresses inconnues ne fasse pas relire Notion à chaque fois.
  let dernierRafraichissement = null;
  source.rafraichir = async () => {
    const trop = dernierRafraichissement !== null && maintenant() - dernierRafraichissement < intervalleRafraichirMs;
    if (trop || (garde && maintenant() - garde.a < intervalleRafraichirMs)) return garde ? garde.donnees : source();
    dernierRafraichissement = maintenant();
    try {
      return await lancer();
    } catch (err) {
      if (garde) { journal('[export] relecture impossible, données gardées servies :', err.message); return garde.donnees; }
      throw err;
    }
  };
  return source;
}

function creerGestionnaire({ source, journal = console.error } = {}) {
  return async function gestionnaire(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ erreur: 'Méthode non permise.' });
    }
    try {
      // « ?frais=… » : la page demande une lecture à jour (fiche tout juste approuvée, pas encore dans
      // la copie gardée par le CDN). La réponse n'est alors gardée nulle part.
      const frais = !!(req.query && req.query.frais) && typeof source.rafraichir === 'function';
      const donnees = frais ? await source.rafraichir() : await source();
      res.setHeader('Cache-Control', frais ? 'no-store' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({
        genereLe: donnees.genereLe,
        ressources: donnees.ressources,
        porteurs: donnees.porteurs,
        carte: { cle: process.env.CARTO_BASEMAP_KEY || '' },
        // Les boutons « Proposer » n'existent dans la page que si les contributions sont ouvertes.
        contributions: process.env.CONTRIBUTIONS === 'oui',
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
module.exports.creerGestionnaire = creerGestionnaire;
module.exports.creerSource = creerSource;
module.exports.donneesPubliques = donneesPubliques;
module.exports.MESSAGE_INDISPONIBLE = MESSAGE_INDISPONIBLE;
