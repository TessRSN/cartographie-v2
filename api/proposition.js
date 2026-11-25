/**
 * Le formulaire de proposition, ouvert par un lien reçu par courriel.
 *   GET  /api/proposition?jeton=…  → ce qu'il faut pour afficher le formulaire
 *   POST /api/proposition          → enregistre la proposition dans la file
 * Seuls les champs du catalogue ouverts aux proposants entrent et sortent.
 */
const { verifier } = require('../lib/jetons');
const { valeursDepuisFiche } = require('../lib/notion');
const { CHAMPS, LIENS_AVEC_RESSOURCE, nettoyer, calculerChangements } = require('../public/js/champs.js');
const { verifierImage } = require('../lib/images');
const { ouvertes, origineSure, memeOrigine, corpsDe, dependances } = require('../lib/contributions');

const STATUT_ECARTEE = 'Écartée';
const GENRES = ['nouvelle', 'modification', 'rsn'];
const PREFIXES = { nouvelle: 'Nouvelle', modification: 'Modification', rsn: 'À remplir' };
const DU_PROPOSANT = CHAMPS.filter((c) => c.role === 'proposant');
const expire = (res) => res.status(401).json({ code: 'lien-expire', erreur: "Ce lien n'est plus valable." });

// Le jeton d'un lien pour proposer ou pour modifier, ou null.
function lireJeton(jeton, env) {
  const secret = { secret: env.JWT_SECRET };
  return verifier(jeton, 'proposer', secret) || verifier(jeton, 'modifier', secret);
}

// Valeurs actuelles de la fiche visée, limitées aux champs ouverts aux proposants ; null si elle n'est plus publique.
async function valeursActuelles(d, ficheId) {
  const fiche = await d.notion.lireFiche(ficheId);
  if (!fiche || fiche.statutFiche === STATUT_ECARTEE) return null;
  const porteursParId = new Map((await d.notion.lirePorteurs()).map((p) => [p.id, p]));
  const toutes = valeursDepuisFiche(fiche, porteursParId);
  return { nom: fiche.nom, valeurs: Object.fromEntries(DU_PROPOSANT.map((c) => [c.cle, toutes[c.cle]])) };
}

// Adresses des porteurs nouveaux : seulement pour les porteurs proposés qui n'existent pas encore.
function adressesNouvelles(brut, porteurs, existants) {
  const adresses = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return adresses;
  const connus = new Set(existants.map((nom) => nom.trim().toLowerCase()));
  for (const nom of porteurs || []) {
    if (!Object.hasOwn(brut, nom) || connus.has(nom.toLowerCase()) || typeof brut[nom] !== 'string') continue;
    const adresse = brut[nom].replace(/\s+/g, ' ').trim();
    if (adresse && adresse.length <= 300) adresses[nom] = adresse;
  }
  return adresses;
}

function creerGestionnaire(donnees) {
  return async function gestionnaire(req, res) {
    const env = (donnees && donnees.env) || process.env;
    if (!ouvertes(env)) return res.status(404).json({ erreur: 'Introuvable.' });
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ erreur: 'Méthode non permise.' }); }
    res.setHeader('Cache-Control', 'no-store');
    const d = dependances(donnees);

    try {
      if (req.method === 'GET') {
        const charge = lireJeton(req.query && req.query.jeton, env);
        if (!charge) return expire(res);
        const [options, publiques] = await Promise.all([d.notion.lireOptions(), d.source()]);
        let fiche = null; let dejaEnAttente = false;
        if (charge.sorte === 'modifier') {
          const actuelle = await valeursActuelles(d, charge.ficheId);
          if (!actuelle) return res.status(410).json({ code: 'fiche-introuvable', erreur: "Cette fiche n'est plus dans la cartographie." });
          const adresse = Object.keys(publiques.idParAdresse || {}).find((a) => publiques.idParAdresse[a] === charge.ficheId) || null;
          fiche = { nom: actuelle.nom, adresse, valeurs: actuelle.valeurs };
          dejaEnAttente = await d.propositions.enAttenteSur(charge.ficheId);
        }
        const fermes = DU_PROPOSANT.filter((c) => c.saisie === 'choix' || c.saisie === 'choixMultiples');
        const ouvertesListes = DU_PROPOSANT.filter((c) => c.saisie === 'listeOuverte' && c.cle !== 'porteurs');
        return res.status(200).json({
          genre: charge.sorte === 'modifier' ? 'modification' : 'nouvelle',
          fiche,
          options: Object.fromEntries(fermes.map((c) => [c.cle, options[c.cle] || []])),
          existantes: { ...Object.fromEntries(ouvertesListes.map((c) => [c.cle, options[c.cle] || []])), porteurs: (publiques.porteurs || []).map((p) => p.nom) },
          dejaEnAttente,
        });
      }

      if (!memeOrigine(req)) return res.status(403).json({ erreur: 'Demande refusée.' });
      const corps = corpsDe(req);
      if (!corps) return res.status(400).json({ erreur: 'Demande illisible.' });
      const charge = lireJeton(corps.jeton, env);
      if (!charge) return expire(res);
      const { genre } = corps;
      const modification = charge.sorte === 'modifier';
      if (!GENRES.includes(genre) || modification !== (genre === 'modification')) return res.status(400).json({ erreur: 'Demande illisible.' });
      if (corps.conditions !== true) return res.status(400).json({ erreurs: { conditions: 'Veuillez accepter les conditions de contribution.' } });

      const options = await d.notion.lireOptions();
      const { valeurs, erreurs } = nettoyer(corps.valeurs, { role: 'proposant', options, genre });
      if (Object.keys(erreurs).length) return res.status(400).json({ erreurs });

      // Logo joint : contrôlé ici, déposé dans Notion seulement quand tout le reste est valide.
      let image = null;
      if (corps.logoFichier && genre !== 'rsn') {
        image = verifierImage(corps.logoFichier);
        if (!image.ok) return res.status(400).json({ erreurs: { logo: image.erreur } });
      }

      let avant = null; let nomFiche = valeurs.nom;
      if (modification) {
        const actuelle = await valeursActuelles(d, charge.ficheId);
        if (!actuelle) return res.status(410).json({ code: 'fiche-introuvable', erreur: "Cette fiche n'est plus dans la cartographie." });
        avant = actuelle.valeurs; nomFiche = actuelle.nom;
      }
      const propose = calculerChangements(avant, valeurs);
      if (!Object.keys(propose).length && !image) return res.status(400).json({ code: 'aucun-changement', erreur: "Vous n'avez rien modifié." });

      const existants = ((await d.source()).porteurs || []).map((p) => p.nom);
      const porteursNouveaux = adressesNouvelles(corps.porteursNouveaux, propose.porteurs && propose.porteurs.apres, existants);

      // Le lien est consommé en dernier : une erreur de saisie ne le brûle pas.
      if (!(await d.limites.consommerJeton(charge.jti))) return expire(res);

      const titre = `${PREFIXES[genre]} : ${nomFiche}`;
      let propositionId;
      try {
        const logoDepot = image ? { id: await d.fichiers.deposer(image), nom: image.nom } : null;
        propositionId = await d.propositions.creerProposition({
          ...(logoDepot ? { logoDepot } : {}),
          genre, ficheId: modification ? charge.ficheId : null, courriel: charge.courriel,
          nomProposant: typeof corps.nomProposant === 'string' ? corps.nomProposant.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
          lienAvecRessource: LIENS_AVEC_RESSOURCE.includes(corps.lienAvecRessource) ? corps.lienAvecRessource : 'aucun',
          titre, contenu: { propose, applique: null, porteursNouveaux, ...(image ? { logoFichier: image.nom } : {}) },
        });
      } catch (err) {
        // Rien n'a été enregistré : le lien est rendu pour que la personne puisse réessayer.
        await d.limites.libererJeton(charge.jti);
        throw err;
      }

      // À partir d'ici la proposition est enregistrée : rien ne doit faire échouer la réponse.
      const origine = origineSure(req, env);
      let recu = { envoye: false };
      const suite = async (quoi, faire) => {
        try { return await faire(); } catch (err) { d.journal(`[proposition] ${quoi} impossible :`, err.message); return null; }
      };
      recu = (await suite('accusé de réception', () => d.courriels.propositionRecue({ a: charge.courriel, titre }))) || recu;
      // Toute proposition passe par le panneau, y compris celle d'un approbateur (décision de Tess,
      // 25 novembre 2026) : rien ne change sur le site sans un geste dans le panneau.
      await suite("avis à l'équipe", async () => d.courriels.nouvelleProposition({ a: await d.propositions.approbateursActifs(), titre, lienPanneau: `${origine}/admin` }));
      // « approuvee » reste dans la réponse, toujours faux, pour la page du formulaire.
      return res.status(200).json({ ok: true, approuvee: false, courriel: !!(recu && recu.envoye) });
    } catch (err) {
      d.journal('[proposition] échec :', err.message);
      return res.status(502).json({ erreur: 'Le service est indisponible pour le moment. Réessayez dans quelques minutes.' });
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
