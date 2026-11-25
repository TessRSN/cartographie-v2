/**
 * Le panneau d'administration, côté serveur. Une seule route, /api/admin?action=… :
 *   POST session      { jeton }                 → ouvre une session à partir du lien reçu par courriel
 *   POST deconnexion
 *   GET  moi                                    → nom, courriel, rôle, et ce que le rôle permet
 *   GET  accueil                                → compteurs, activité récente, état des envois
 *   GET  file                                   → les propositions des quatre états, avec leurs avis
 *   GET  detail       ?id=                      → une proposition, la fiche visée et les listes de choix
 *   GET  logo         ?id=                      → l'image jointe à une proposition
 *   POST verification { id }                    → demande un second regard
 *   POST avis         { id, sens, commentaire }
 *   POST approuver    { id, corrections, porteursNouveaux, sansLogo }
 *   POST refuser      { id, commentaire }
 *   GET  ressources                             → toutes les fiches, publiques et écartées
 *   GET  ressource    ?fiche= (ou ?neuve=1)     → une fiche, son historique et les listes de choix
 *   POST enregistrer  { fiche, valeurs, depart } → modifie une fiche ; 409 si un champ a changé entre-temps
 *   POST retablir     { fiche, numero }         → la fiche reprend les valeurs d'une version
 *   POST verifier | ecarter | republier { fiche }
 *   POST creer        { valeurs }               → ajoute une ressource
 * Une fiche est désignée par son adresse publique, ou par un repère opaque si elle est écartée :
 * jamais par son identifiant Notion.
 * Hors « session » et « deconnexion », chaque appel exige un témoin de session valide ET une
 * personne toujours inscrite et active, dont le rôle, relu à chaque appel, suffit pour l'action.
 * Tout envoi doit venir du site lui-même.
 */
const { signer, verifier } = require('../lib/jetons');
const { CHAMPS, egales } = require('../public/js/champs.js');
const { avisDe } = require('../lib/propositions');
const { verifierOctets } = require('../lib/images');
const { ouvertes, origineSure, memeOrigineStricte, corpsDe, dependances } = require('../lib/contributions');
const { repereValide } = require('../lib/ressources');

const TEMOIN = 'carto_session';
const DUREE_SESSION_S = 7 * 24 * 3600;
// Chaque action : sa méthode et le rôle minimal qu'elle demande.
const ACTIONS = {
  session: { methode: 'POST' }, deconnexion: { methode: 'POST' },
  moi: { methode: 'GET', role: 'lecture' }, accueil: { methode: 'GET', role: 'lecture' }, file: { methode: 'GET', role: 'lecture' },
  detail: { methode: 'GET', role: 'lecture' }, logo: { methode: 'GET', role: 'lecture' },
  verification: { methode: 'POST', role: 'approbation' }, avis: { methode: 'POST', role: 'approbation' },
  approuver: { methode: 'POST', role: 'approbation' }, refuser: { methode: 'POST', role: 'approbation' },
  ressources: { methode: 'GET', role: 'lecture' }, ressource: { methode: 'GET', role: 'lecture' },
  enregistrer: { methode: 'POST', role: 'approbation' }, retablir: { methode: 'POST', role: 'approbation' },
  verifier: { methode: 'POST', role: 'approbation' }, ecarter: { methode: 'POST', role: 'approbation' },
  republier: { methode: 'POST', role: 'approbation' }, creer: { methode: 'POST', role: 'approbation' },
};
// Les gestes qui portent sur une fiche existante.
const GESTES_FICHE = ['enregistrer', 'retablir', 'verifier', 'ecarter', 'republier'];
// Un rôle inconnu a le rang le plus bas : il ne permet que la lecture.
const RANGS = { lecture: 1, approbation: 2, administration: 3 };
const rang = (role) => RANGS[role] || 1;
const OUVERTS = ['attente', 'verification'];
const TRANCHES = ['approuvee', 'refusee'];
// Le contenu des propositions tranchées n'est lu que pour les plus récentes : l'historique grandit sans fin.
const CONTENUS_TRANCHEES_MAX = 40;
const ACTIVITE_MAX = 20;
// Jour d'envoi du résumé hebdomadaire : celui du planificateur (« crons » dans vercel.json), vérifié par un essai.
const JOUR_RESUME = 'lundi';
const CODES = { 'non-approbateur': 401, introuvable: 404, occupee: 409, 'deja-tranchee': 409, doublon: 409, ressemble: 409, conflit: 409, 'sans-historique': 409, 'fiche-introuvable': 410, invalide: 400, notion: 502 };
const CLES = new Set(CHAMPS.map((c) => c.cle));
const idValide = (id) => typeof id === 'string' && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id);
const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const objet = (v) => (estObjet(v) ? v : {});
// Changements proposés lisibles : clés du catalogue, chacune avec sa valeur « apres ».
const proposeLisible = (propose) => Object.fromEntries(Object.entries(objet(propose))
  .filter(([cle, c]) => CLES.has(cle) && c && typeof c === 'object' && Object.hasOwn(c, 'apres')));
// Adresses des nouveaux porteurs : du texte seulement, 300 caractères au plus. Une adresse vide
// est gardée : elle dit que l'approbateur a retiré celle du proposant.
const adressesDe = (brut) => Object.fromEntries(Object.entries(objet(brut))
  .filter(([, v]) => typeof v === 'string').map(([nom, v]) => [nom, v.replace(/\s+/g, ' ').trim().slice(0, 300)]));
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

// Le nom d'une personne de l'équipe d'après son courriel ; à défaut, ce qu'on a sous la main.
const nomDans = (equipe, courriel, sinon) => {
  const personne = courriel ? equipe.find((x) => x.courriel === courriel) : null;
  return (personne && personne.nom) || sinon || courriel || null;
};
// Les avis tels que le panneau les montre : le nom, jamais le courriel ; « moi » marque le sien.
function avisPublics(avis, equipe, moi) {
  return avis.map((a) => ({ nom: nomDans(equipe, a.courriel, a.nom), sens: a.sens, commentaire: a.commentaire, le: a.le, moi: a.courriel === moi }));
}
// Une adresse web réduite à ce qui la distingue : sans protocole, sans « www. », sans barre finale, en minuscules.
const lienReduit = (lien) => (typeof lien === 'string' ? lien.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/#?]+$/, '') : '');
const nomReduit = (nom) => (typeof nom === 'string' ? nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : '');
// Une nouvelle ressource qui a le lien principal ou le nom d'une fiche publique : { adresse, nom }, sinon null.
function ressemblance(p, propose, ressources) {
  if (p.genre === 'modification' || !OUVERTS.includes(p.statut)) return null;
  const lien = lienReduit(propose.lien && propose.lien.apres);
  const nom = nomReduit(propose.nom && propose.nom.apres);
  const fiche = (ressources || []).find((r) => (lien && lienReduit(r.lien) === lien) || (nom && nomReduit(r.nom) === nom));
  return fiche ? { adresse: fiche.adresse, nom: fiche.nom } : null;
}

// Repères tirés des données publiques : ils évitent d'envoyer un identifiant Notion au navigateur.
function reperes(publiques) {
  return {
    adresseParId: new Map(Object.entries(publiques.idParAdresse || {}).map(([adresse, id]) => [id, adresse])),
    ficheParAdresse: new Map((publiques.ressources || []).map((r) => [r.adresse, r])),
    ressources: publiques.ressources || [],
  };
}

// Ce que le panneau voit d'une proposition : jamais l'identifiant Notion de la fiche ni l'adresse du fichier.
// contenu : le bloc JSON de la proposition, ou undefined s'il n'a pas été lu.
function resume(p, contenu, { adresseParId, ficheParAdresse, ressources }, equipe, moi) {
  const adresse = p.ficheId ? adresseParId.get(p.ficheId) || null : null;
  const fiche = adresse ? ficheParAdresse.get(adresse) : null;
  const lu = contenu !== undefined;
  const propose = proposeLisible(objet(contenu).propose);
  const applique = objet(contenu).applique ? duCatalogue(objet(contenu).applique) : null;
  const nomPropose = propose.nom && typeof propose.nom.apres === 'string' ? propose.nom.apres.trim() : '';
  const typePropose = propose.typePrincipal && typeof propose.typePrincipal.apres === 'string' ? propose.typePrincipal.apres : null;
  return {
    id: p.id, genre: p.genre,
    // Le nom de la ressource : celui de la fiche visée, sinon le nom proposé, sinon le titre sans son préfixe.
    nom: (fiche && fiche.nom) || nomPropose || String(p.titre || '').replace(/^[^:]{1,40} : /, ''),
    statut: p.statut, proposeLe: p.proposeLe, verificationLe: p.verificationLe || null, courriel: p.courriel, nomProposant: p.nomProposant,
    lienAvecRessource: p.lienAvecRessource, decidePar: nomDans(equipe, p.decidePar), decideLe: p.decideLe, commentaire: p.commentaire, aLogo: !!p.logoPropose,
    fiche: adresse ? { adresse, nom: (fiche && fiche.nom) || adresse } : null,
    type: p.genre === 'modification' ? ((fiche && fiche.typePrincipal) || null) : typePropose,
    nbChamps: lu ? Object.keys(propose).length + (p.logoPropose ? 1 : 0) : null,
    avis: avisPublics(avisDe(contenu), equipe, moi),
    ressemble: !!ressemblance(p, propose, ressources),
    // Vrai si ce qui a été appliqué diffère de ce qui était proposé.
    corrige: !!applique && Object.keys(applique).some((cle) => !propose[cle] || !egales(applique[cle], propose[cle].apres)),
  };
}

// Toutes les propositions des quatre états, avec leur contenu quand il est lu : les ouvertes de la
// plus ancienne à la plus récente, puis les tranchées de la dernière décision à la plus ancienne.
// memoire : contenus déjà lus des propositions tranchées. Une proposition tranchée ne change plus,
// donc son contenu n'est lu qu'une fois par instance ; celui des ouvertes est relu à chaque fois.
async function tableau(d, memoire) {
  const [toutes, publiques] = await Promise.all([d.propositions.listerPropositions({ statut: 'toutes' }), d.source()]);
  const parDate = (cle, sens) => (a, b) => sens * String(a[cle] || '').localeCompare(String(b[cle] || ''));
  const ouvertes = toutes.filter((p) => OUVERTS.includes(p.statut)).sort(parDate('proposeLe', 1));
  const tranchees = toutes.filter((p) => TRANCHES.includes(p.statut)).sort(parDate('decideLe', -1));
  const recentes = tranchees.slice(0, CONTENUS_TRANCHEES_MAX);
  const aLire = [...ouvertes, ...recentes.filter((p) => !memoire.has(p.id))].map((p) => p.id);
  const contenus = aLire.length ? await d.propositions.lireContenus(aLire) : new Map();
  for (const p of recentes) {
    if (memoire.has(p.id)) contenus.set(p.id, memoire.get(p.id));
    // Gardé seulement une minute après la décision, le temps que toutes ses écritures soient finies.
    else if (contenus.has(p.id) && Date.now() - Date.parse(p.decideLe || '') > 60000) memoire.set(p.id, contenus.get(p.id));
  }
  if (memoire.size > 500) memoire.clear();
  return { propositions: [...ouvertes, ...tranchees], contenus, publiques };
}

// L'activité récente, dérivée des propositions : reçue, mise en vérification, avis, approuvée, refusée.
function activiteDe(resumes, brutes) {
  const evenements = [];
  resumes.forEach((r, i) => {
    const commun = { nom: r.nom, genre: r.genre };
    if (r.proposeLe) evenements.push({ sorte: 'recue', quand: r.proposeLe, qui: r.nomProposant || null, ...commun });
    if (r.verificationLe) evenements.push({ sorte: 'verification', quand: r.verificationLe, qui: null, ...commun });
    for (const a of r.avis) if (a.le) evenements.push({ sorte: 'avis', quand: a.le, qui: a.nom, ...commun, sens: a.sens });
    if (TRANCHES.includes(r.statut) && brutes[i].decideLe) evenements.push({ sorte: r.statut, quand: r.decideLe, qui: r.decidePar, ...commun });
  });
  return evenements.sort((a, b) => String(b.quand).localeCompare(String(a.quand))).slice(0, ACTIVITE_MAX);
}

function creerGestionnaire(donnees) {
  const contenusTranches = new Map();
  return async function gestionnaire(req, res) {
    const env = (donnees && donnees.env) || process.env;
    if (!ouvertes(env)) return res.status(404).json({ erreur: 'Introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    const action = String((req.query && req.query.action) || '');
    if (!Object.hasOwn(ACTIONS, action)) return res.status(404).json({ erreur: 'Introuvable.' });
    const { methode, role: roleMinimal } = ACTIONS[action];
    if (req.method !== methode) { res.setHeader('Allow', methode); return res.status(405).json({ erreur: 'Méthode non permise.' }); }
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
        // Toute personne inscrite et active peut entrer, quel que soit son rôle.
        if (!charge || !(await d.propositions.equipe()).some((x) => x.courriel === charge.courriel)) return refuse();
        // Le lien ne sert qu'une fois.
        if (!(await d.limites.consommerJeton(charge.jti))) return refuse();
        poserTemoin(res, signer('session', { courriel: charge.courriel }, secret), DUREE_SESSION_S, origine);
        return res.status(200).json({ courriel: charge.courriel });
      }
      if (action === 'deconnexion') {
        poserTemoin(res, '', 0, origine);
        return res.status(200).json({ ok: true });
      }

      // L'équipe est relue dans Notion à chaque appel : un rôle changé ou une case « Actif » décochée
      // compte tout de suite, même avec un témoin encore valide.
      const session = verifier(temoinDe(req), 'session', secret);
      if (!session) return refuse();
      const equipe = await d.propositions.equipe();
      const personne = equipe.find((x) => x.courriel === session.courriel);
      if (!personne) return refuse();
      if (rang(personne.role) < RANGS[roleMinimal]) {
        return res.status(403).json({ code: 'role', erreur: 'Votre rôle ne permet pas ce geste : il demande le rôle Approbation ou Administration.' });
      }
      const approbateur = personne.courriel;

      if (action === 'moi') {
        return res.status(200).json({
          nom: personne.nom || '', courriel: personne.courriel, role: personne.role,
          permis: { decider: rang(personne.role) >= RANGS.approbation, administrer: rang(personne.role) >= RANGS.administration },
        });
      }

      if (action === 'file' || action === 'accueil') {
        const { propositions, contenus, publiques } = await tableau(d, contenusTranches);
        const r = reperes(publiques);
        const resumes = propositions.map((p) => resume(p, contenus.get(p.id), r, equipe, approbateur));
        if (action === 'file') return res.status(200).json({ courriel: approbateur, propositions: resumes });
        return res.status(200).json({
          compteurs: { nouvelles: resumes.filter((x) => x.statut === 'attente').length, verification: resumes.filter((x) => x.statut === 'verification').length },
          activite: activiteDe(resumes, propositions),
          // L'état des envois : ce qui est vrai, sans l'adresse d'essai ni aucune valeur secrète.
          envois: {
            resume: { jour: JOUR_RESUME, destinataires: equipe.filter((x) => x.resume).length },
            contributions: ouvertes(env),
            essaiCourriels: env.EMAIL_TEST_MODE === 'true',
          },
        });
      }

      // ─── Ressources ───
      const illisible = () => res.status(400).json({ erreur: 'Demande illisible.' });
      if (action === 'ressources') {
        const { ressources, historique } = await d.ressources.lister();
        // Le nom de la personne, jamais son courriel.
        return res.status(200).json({ historique, ressources: ressources.map((r) => ({ ...r, dernier: r.dernier ? { ...r.dernier, par: nomDans(equipe, r.dernier.par) } : null })) });
      }
      if (action === 'ressource') {
        if (req.query.neuve) return res.status(200).json(await d.ressources.neuve());
        if (!repereValide(req.query.fiche)) return illisible();
        const vue = await d.ressources.lire(req.query.fiche);
        if (!vue) return res.status(404).json({ code: 'introuvable', erreur: 'Cette fiche est introuvable.' });
        return res.status(200).json({ ...vue, versions: vue.versions.map((v) => ({ ...v, par: nomDans(equipe, v.par) })) });
      }
      if (action === 'creer' || GESTES_FICHE.includes(action)) {
        // La personne qui agit est celle de la session : rien de ce que dit le corps ne la remplace.
        let retour;
        if (action === 'creer') {
          if (!estObjet(corps.valeurs)) return illisible();
          retour = await d.ressources.creer({ valeurs: corps.valeurs, par: approbateur, malgreRessemblance: corps.malgreRessemblance === true });
        } else {
          if (!repereValide(corps.fiche)) return illisible();
          if (action === 'enregistrer' && !(estObjet(corps.valeurs) && estObjet(corps.depart))) return illisible();
          if (action === 'retablir' && !(Number.isInteger(corps.numero) && corps.numero > 0)) return illisible();
          const demande = { repere: corps.fiche, par: approbateur };
          if (action === 'enregistrer') Object.assign(demande, { valeurs: corps.valeurs, depart: corps.depart });
          if (action === 'retablir') demande.numero = corps.numero;
          retour = await d.ressources[action](demande);
        }
        if (retour.ok) return res.status(200).json(retour);
        const { ok, code, ...detail } = retour;
        return res.status(CODES[code] || 502).json({ code, ...detail });
      }

      const id = envoi ? corps.id : req.query.id;
      if (!idValide(id)) return res.status(400).json({ erreur: 'Demande illisible.' });

      if (action === 'logo') {
        const proposition = await d.propositions.lireProposition(id);
        const image = proposition && proposition.logoPropose ? verifierOctets(await d.fichiers.telecharger(proposition.logoPropose.url)) : null;
        if (!image || !image.ok) return res.status(404).send('');
        res.setHeader('Content-Type', image.type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        return res.status(200).send(image.octets);
      }

      if (action === 'detail') {
        const examen = await d.approbation.examiner(id);
        if (!examen) return res.status(404).json({ code: 'introuvable', erreur: 'Cette proposition est introuvable.' });
        const { proposition } = examen;
        const [options, publiques] = await Promise.all([d.notion.lireOptions(), d.source()]);
        const r = reperes(publiques);
        const contenu = objet(proposition.contenu);
        // « ressemble » sort à part, avec la fiche qui ressemble.
        const { ressemble, ...vue } = resume(proposition, proposition.contenu === undefined ? null : proposition.contenu, r, equipe, approbateur);
        const publique = vue.fiche ? r.ficheParAdresse.get(vue.fiche.adresse) : null;
        const fermes = CHAMPS.filter((c) => c.saisie === 'choix' || c.saisie === 'choixMultiples');
        const listes = CHAMPS.filter((c) => c.saisie === 'listeOuverte' && c.cle !== 'porteurs');
        return res.status(200).json({
          proposition: {
            ...vue,
            propose: proposeLisible(contenu.propose),
            // Vrai si une partie du contenu enregistré n'a pas pu être lue.
            illisible: Object.keys(proposeLisible(contenu.propose)).length !== Object.keys(objet(contenu.propose)).filter((cle) => CLES.has(cle)).length,
            applique: contenu.applique ? duCatalogue(contenu.applique) : null,
            porteursNouveaux: objet(contenu.porteursNouveaux),
          },
          actuelle: examen.actuelle ? duCatalogue(examen.actuelle) : null,
          bouscules: (examen.bouscules || []).filter((cle) => CLES.has(cle)),
          ficheDisparue: !!examen.ficheDisparue,
          // Une nouvelle ressource qui a le lien ou le nom d'une fiche publique.
          ressemble: ressemble ? ressemblance(proposition, proposeLisible(contenu.propose), r.ressources) : null,
          // Ce que la fiche publique montre déjà et que le catalogue ne porte pas, pour l'aperçu.
          apercu: publique ? { logo: publique.logo || null, verifieeLe: publique.verifieeLe || null } : null,
          options: Object.fromEntries(fermes.map((c) => [c.cle, options[c.cle] || []])),
          existantes: {
            ...Object.fromEntries(listes.map((c) => [c.cle, options[c.cle] || []])),
            porteurs: (publiques.porteurs || []).map((p) => p.nom),
            fiches: (publiques.ressources || []).map((r) => ({ adresse: r.adresse, nom: r.nom })),
          },
        });
      }

      const commentaire = typeof corps.commentaire === 'string' ? corps.commentaire.slice(0, 2000) : '';
      if (action === 'verification' || action === 'avis') {
        const retour = action === 'verification'
          ? await d.approbation.mettreEnVerification({ propositionId: id, par: approbateur })
          : await d.approbation.donnerAvis({ propositionId: id, par: approbateur, sens: typeof corps.sens === 'string' ? corps.sens : '', commentaire });
        if (!retour.ok) return res.status(CODES[retour.code] || 502).json({ code: retour.code, erreurs: retour.erreurs });
        return res.status(200).json(action === 'avis' ? { ok: true, avis: avisPublics(avisDe({ avis: retour.avis }), equipe, approbateur) } : { ok: true });
      }

      const resultat = action === 'approuver'
        ? await d.approbation.approuver({ propositionId: id, corrections: objet(corps.corrections), porteursNouveaux: adressesDe(corps.porteursNouveaux), sansLogo: corps.sansLogo === true, approbateur, origine })
        : await d.approbation.refuser({ propositionId: id, commentaire, approbateur });
      if (resultat.ok) return res.status(200).json({ ok: true, courriel: !!resultat.courriel, historique: resultat.historique !== false });
      return res.status(CODES[resultat.code] || 502).json({ code: resultat.code, erreurs: resultat.erreurs });
    } catch (err) {
      d.journal(`[admin] ${action} impossible :`, err.message);
      return res.status(502).json({ code: 'notion', erreur: 'Le service ne répond pas pour le moment. Réessayez dans un instant.' });
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
