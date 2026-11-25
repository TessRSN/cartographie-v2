/**
 * POST /api/lien : envoie par courriel un lien pour proposer une ressource, pour modifier
 * une fiche, ou pour entrer dans le panneau.
 * Corps : { courriel, but: 'proposer' | 'modifier' | 'panneau', adresse, site }
 * La réponse est la même que le lien parte ou non : elle ne dit pas si une adresse est connue.
 */
const { signer, normaliserCourriel } = require('../lib/jetons');
const { ouvertes, origineSure, memeOrigine, ipDe, corpsDe, dependances } = require('../lib/contributions');

const BUTS = ['proposer', 'modifier', 'panneau'];

// Le nom de la personne de l'équipe, pour le repère {nom} du courriel. S'il ne peut pas être lu,
// le lien part quand même, sans nom.
async function nomDansLEquipe(d, courriel) {
  try {
    const personne = (await d.propositions.equipe()).find((x) => x.courriel === courriel);
    return (personne && personne.nom) || '';
  } catch (err) { return ''; }
}

function creerGestionnaire(donnees) {
  return async function gestionnaire(req, res) {
    const env = (donnees && donnees.env) || process.env;
    if (!ouvertes(env)) return res.status(404).json({ erreur: 'Introuvable.' });
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erreur: 'Méthode non permise.' }); }
    if (!memeOrigine(req)) return res.status(403).json({ erreur: 'Demande refusée.' });
    res.setHeader('Cache-Control', 'no-store');

    const corps = corpsDe(req);
    if (!corps) return res.status(400).json({ erreur: 'Demande illisible.' });
    // Champ piège : invisible dans la page, seul un robot le remplit.
    if (corps.site) return res.status(200).json({ ok: true });
    const courriel = normaliserCourriel(corps.courriel);
    if (!courriel) return res.status(400).json({ erreur: "Cette adresse courriel n'a pas la bonne forme." });
    if (!BUTS.includes(corps.but)) return res.status(400).json({ erreur: 'Demande illisible.' });

    const d = dependances(donnees);
    try {
      const origine = origineSure(req, env);
      const permis = origine && await d.limites.autoriserLien({ courriel, ip: ipDe(req), plafondDuJour: corps.but !== 'panneau' });
      if (!permis) return res.status(200).json({ ok: true });
      const secret = { secret: env.JWT_SECRET };

      if (corps.but === 'panneau') {
        if (await d.propositions.estApprobateur(courriel)) {
          await d.courriels.lienPanneau({ a: courriel, lien: `${origine}/admin?jeton=${signer('panneau', { courriel }, secret)}`, destinataire: await nomDansLEquipe(d, courriel) });
        }
      } else if (corps.but === 'modifier') {
        const publiques = await d.source();
        const adresse = String(corps.adresse || '');
        if (Object.hasOwn(publiques.idParAdresse || {}, adresse)) {
          const fiche = publiques.ressources.find((r) => r.adresse === adresse);
          const jeton = signer('modifier', { courriel, ficheId: publiques.idParAdresse[adresse] }, secret);
          await d.courriels.lienProposer({ a: courriel, lien: `${origine}/proposer?fiche=${encodeURIComponent(adresse)}&jeton=${jeton}`, nomFiche: fiche ? fiche.nom : adresse });
        }
      } else {
        await d.courriels.lienProposer({ a: courriel, lien: `${origine}/proposer?jeton=${signer('proposer', { courriel }, secret)}` });
      }
    } catch (err) {
      d.journal('[lien] envoi impossible :', err.message);
    }
    return res.status(200).json({ ok: true });
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
