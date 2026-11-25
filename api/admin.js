/**
 * Le panneau d'approbation, côté serveur. Une seule route, /api/admin?action=… :
 *   POST session      { jeton }                 → ouvre une session à partir du lien reçu par courriel
 *   GET  file         ?statut=attente|tranchees → les propositions
 *   GET  detail       ?id=                      → une proposition, la fiche visée et les listes de choix
 *   GET  logo         ?id=                      → l'image jointe à une proposition
 *   POST approuver    { id, corrections, porteursNouveaux, sansLogo }
 *   POST refuser      { id, commentaire }
 *   POST deconnexion
 * Hors « session », chaque appel exige un témoin de session valide ET une personne toujours
 * inscrite parmi les approbateurs. Tout envoi doit venir du site lui-même.
 */
const { signer, verifier } = require('../lib/jetons');
const { CHAMPS } = require('../public/js/champs.js');
const { verifierOctets } = require('../lib/images');
const { ouvertes, origineSure, memeOrigineStricte, corpsDe, dependances } = require('../lib/contributions');

const TEMOIN = 'carto_session';
const DUREE_SESSION_S = 7 * 24 * 3600;
const ACTIONS = { session: 'POST', file: 'GET', detail: 'GET', logo: 'GET', approuver: 'POST', refuser: 'POST', deconnexion: 'POST' };
const CODES = { 'non-approbateur': 401, introuvable: 404, 'deja-tranchee': 409, doublon: 409, 'fiche-introuvable': 410, invalide: 400, notion: 502 };
const CLES = new Set(CHAMPS.map((c) => c.cle));
const idValide = (id) => typeof id === 'string' && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id);
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const duCatalogue = (valeurs) => Object.fromEntries(Object.entries(objet(valeurs)).filter(([cle]) => CLES.has(cle)));

function temoinDe(req) {
  for (const morceau of String((req.headers && req.headers.cookie) || '').split(';')) {
    const egal = morceau.indexOf('=');
    if (egal > 0 && morceau.slice(0, egal).trim() === TEMOIN) return morceau.slice(egal + 1).trim();
  }
  return null;
}
function poserTemoin(res, valeur, dureeS, origine) {
  const secure = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine) ? '' : ' Secure;';
  res.setHeader('Set-Cookie', `${TEMOIN}=${valeur}; HttpOnly;${secure} SameSite=Strict; Path=/api/admin; Max-Age=${dureeS}`);
}

// Ce que le panneau voit d'une proposition : jamais l'identifiant Notion de la fiche ni l'adresse du fichier.
function resume(p, adresseParId, nomParAdresse) {
  const adresse = p.ficheId ? adresseParId.get(p.ficheId) || null : null;
  return {
    id: p.id, genre: p.genre, titre: p.titre, statut: p.statut, proposeLe: p.proposeLe, courriel: p.courriel, nomProposant: p.nomProposant,
    lienAvecRessource: p.lienAvecRessource, decidePar: p.decidePar, decideLe: p.decideLe, commentaire: p.commentaire, aLogo: !!p.logoPropose,
    fiche: adresse ? { adresse, nom: nomParAdresse.get(adresse) || adresse } : null,
  };
}
function reperes(publiques) {
  return {
    adresseParId: new Map(Object.entries(publiques.idParAdresse || {}).map(([adresse, id]) => [id, adresse])),
    nomParAdresse: new Map((publiques.ressources || []).map((r) => [r.adresse, r.nom])),
  };
}

function creerGestionnaire(donnees) {
  return async function gestionnaire(req, res) {
    const env = (donnees && donnees.env) || process.env;
    if (!ouvertes(env)) return res.status(404).json({ erreur: 'Introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    const action = String((req.query && req.query.action) || '');
    if (!Object.hasOwn(ACTIONS, action)) return res.status(404).json({ erreur: 'Introuvable.' });
    if (req.method !== ACTIONS[action]) { res.setHeader('Allow', ACTIONS[action]); return res.status(405).json({ erreur: 'Méthode non permise.' }); }
    const envoi = req.method === 'POST';
    if (envoi && !memeOrigineStricte(req)) return res.status(403).json({ erreur: 'Demande refusée.' });
    const corps = envoi ? corpsDe(req) : null;
    if (envoi && !corps) return res.status(400).json({ erreur: 'Demande illisible.' });

    const d = dependances(donnees);
    const secret = { secret: env.JWT_SECRET };
    const origine = origineSure(req, env);
    const refuse = () => res.status(401).json({ code: 'session', erreur: 'Session absente ou expirée.' });

    try {
      if (action === 'session') {
        const charge = verifier(corps.jeton, 'panneau', secret);
        if (!charge || !(await d.propositions.estApprobateur(charge.courriel))) return refuse();
        // Le lien ne sert qu'une fois.
        if (!(await d.limites.consommerJeton(charge.jti))) return refuse();
        poserTemoin(res, signer('session', { courriel: charge.courriel }, secret), DUREE_SESSION_S, origine);
        return res.status(200).json({ courriel: charge.courriel });
      }
      if (action === 'deconnexion') {
        poserTemoin(res, '', 0, origine);
        return res.status(200).json({ ok: true });
      }

      const session = verifier(temoinDe(req), 'session', secret);
      if (!session || !(await d.propositions.estApprobateur(session.courriel))) return refuse();
      const approbateur = session.courriel;

      if (action === 'file') {
        const statut = req.query.statut === 'tranchees' ? 'tranchees' : 'attente';
        const [liste, publiques] = await Promise.all([d.propositions.listerPropositions({ statut }), d.source()]);
        const { adresseParId, nomParAdresse } = reperes(publiques);
        return res.status(200).json({ courriel: approbateur, propositions: liste.map((p) => resume(p, adresseParId, nomParAdresse)) });
      }

      const id = envoi ? corps.id : req.query.id;
      if (!idValide(id)) return res.status(400).json({ erreur: 'Demande illisible.' });

      if (action === 'detail' || action === 'logo') {
        const examen = await d.approbation.examiner(id);
        if (!examen) return res.status(404).json({ code: 'introuvable', erreur: 'Cette proposition est introuvable.' });
        const { proposition } = examen;
        if (action === 'logo') {
          const image = proposition.logoPropose ? verifierOctets(await d.fichiers.telecharger(proposition.logoPropose.url)) : null;
          if (!image || !image.ok) return res.status(404).send('');
          res.setHeader('Content-Type', image.type);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
          return res.status(200).send(image.octets);
        }
        const [options, publiques] = await Promise.all([d.notion.lireOptions(), d.source()]);
        const { adresseParId, nomParAdresse } = reperes(publiques);
        const contenu = objet(proposition.contenu);
        const fermes = CHAMPS.filter((c) => c.saisie === 'choix' || c.saisie === 'choixMultiples');
        const listes = CHAMPS.filter((c) => c.saisie === 'listeOuverte' && c.cle !== 'porteurs');
        return res.status(200).json({
          proposition: {
            ...resume(proposition, adresseParId, nomParAdresse),
            propose: duCatalogue(contenu.propose), applique: contenu.applique ? duCatalogue(contenu.applique) : null,
            porteursNouveaux: objet(contenu.porteursNouveaux),
          },
          actuelle: examen.actuelle ? duCatalogue(examen.actuelle) : null,
          bouscules: (examen.bouscules || []).filter((cle) => CLES.has(cle)),
          ficheDisparue: !!examen.ficheDisparue,
          options: Object.fromEntries(fermes.map((c) => [c.cle, options[c.cle] || []])),
          existantes: {
            ...Object.fromEntries(listes.map((c) => [c.cle, options[c.cle] || []])),
            porteurs: (publiques.porteurs || []).map((p) => p.nom),
            fiches: (publiques.ressources || []).map((r) => ({ adresse: r.adresse, nom: r.nom })),
          },
        });
      }

      const resultat = action === 'approuver'
        ? await d.approbation.approuver({ propositionId: id, corrections: objet(corps.corrections), porteursNouveaux: objet(corps.porteursNouveaux), sansLogo: corps.sansLogo === true, approbateur, origine })
        : await d.approbation.refuser({ propositionId: id, commentaire: typeof corps.commentaire === 'string' ? corps.commentaire.slice(0, 2000) : '', approbateur });
      if (resultat.ok) return res.status(200).json({ ok: true, courriel: !!resultat.courriel });
      return res.status(CODES[resultat.code] || 502).json({ code: resultat.code, erreurs: resultat.erreurs });
    } catch (err) {
      d.journal(`[admin] ${action} impossible :`, err.message);
      return res.status(502).json({ code: 'notion', erreur: 'Le service ne répond pas pour le moment. Réessayez dans un instant.' });
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
