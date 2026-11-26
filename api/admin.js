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
 *   POST enregistrer  { fiche, valeurs, depart } → modifie une fiche ; 409 si un champ a changé entre-temps.
 *                                                 Administration : la fiche change. Approbation : une « Modification
 *                                                 de l'équipe » part dans les propositions ({ proposee: true })
 *   POST retablir     { fiche, numero }         → la fiche reprend les valeurs d'une version (Administration)
 *   POST verifier { fiche } ; ecarter | republier { fiche } (Administration)
 *   POST creer        { valeurs }               → ajoute une ressource (Administration)
 *   GET  porteurs                               → tous les porteurs, et la clé du fond de carte
 *   GET  porteur      ?porteur=                 → un porteur, ses ressources et les autres porteurs
 *   POST enregistrer-porteur { porteur, valeurs } | creer-porteur { valeurs }
 *   POST geocoder     { adresse }               → les coordonnées d'une adresse, sans rien écrire
 *   POST fusionner-porteurs { doublon, garde }  → rattache les fiches du doublon au porteur gardé
 *   GET  qualite                                → ce qui est à corriger dans les fiches publiées
 *   POST fusionner-valeurs { cle, de, vers }    → une seule écriture pour un mot-clé ou une norme
 *   POST revoir         { fiche, actif, note }  → marque une fiche « à revoir » pour l'équipe, ou retire la marque
 *   POST revisiter-lien { fiche }               → revisite le lien principal d'une fiche
 *   GET  equipe                                 → les personnes qui ont accès, et le journal de l'équipe
 *   POST inviter        { courriel, nom, role } → inscrit une personne et lui envoie son lien d'entrée (Administration)
 *                                                 { courriel: false } si le lien n'est pas parti (panne, ou limite des liens atteinte) ;
 *                                                 { essai: true } si le mode d'essai des courriels l'a envoyé à l'adresse d'essai
 *   POST changer-role   { personne, role }      → (Administration) ; jamais le sien
 *   POST retirer        { personne }            → coupe l'accès sans rien supprimer (Administration) ; jamais soi-même
 *   POST regler-resume  { personne, actif }     → le résumé hebdomadaire : le sien, ou celui de tous en Administration
 *   GET  courriels                              → les six courriels (texte en vigueur, texte d'origine, repères), et le mode d'essai en vigueur
 *   POST enregistrer-courriel { id, objet, texte } → enregistre le texte d'un courriel, après vérification (Administration)
 *   POST retablir-courriel    { id }            → le texte d'origine revient (Administration)
 *   POST essai-courriel { id, objet, texte }    → envoie le courriel, rempli de valeurs d'exemple, à la personne connectée
 *                                                 et à elle seule (Administration) ; objet et texte : un brouillon à essayer
 *   POST mode-essai     { actif, confirme }     → active ou coupe le mode d'essai des courriels (Administration) ;
 *                                                 le couper exige « confirme: true »
 * Une fiche est désignée par son adresse publique, ou par un repère opaque si elle est écartée ;
 * un porteur ou une personne, toujours par un repère opaque : jamais par un identifiant Notion.
 * Les courriels de l'équipe ne sortent que par « equipe » ; partout ailleurs, une personne est un nom.
 * Ni l'adresse d'essai des courriels ni aucune valeur secrète ne sort : seulement si elle est définie.
 * Chaque geste réussi qui change quelque chose est noté dans le journal de l'équipe, comme une fusion
 * interrompue qui a déjà changé des fiches. Le journal ne fait jamais échouer un geste et ne le retarde
 * jamais de plus de trois secondes.
 * Hors « session » et « deconnexion », chaque appel exige un témoin de session valide ET une
 * personne toujours inscrite et active, dont le rôle, relu à chaque appel, suffit pour l'action.
 * Tout envoi doit venir du site lui-même.
 */
const { signer, verifier } = require('../lib/jetons');
const { CHAMPS, egales } = require('../public/js/champs.js');
const { avisDe, ROLES } = require('../lib/propositions');
const { verifierOctets } = require('../lib/images');
const { ouvertes, origineSure, memeOrigineStricte, ipDe, corpsDe, dependances } = require('../lib/contributions');
const { repereValide } = require('../lib/ressources');
const { reperePorteurValide } = require('../lib/porteurs');
const { reperePersonneValide } = require('../lib/equipe');
const { lireModeEssai, CLES: CLES_REGLAGES } = require('../lib/reglages');
const { courrielDe } = require('../public/js/gabarits.js');

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
  // Modifier une fiche reste ouvert au rôle Approbation, mais sa modification part alors en proposition.
  enregistrer: { methode: 'POST', role: 'approbation' }, retablir: { methode: 'POST', role: 'administration' },
  verifier: { methode: 'POST', role: 'approbation' }, ecarter: { methode: 'POST', role: 'administration' },
  revoir: { methode: 'POST', role: 'approbation' },
  republier: { methode: 'POST', role: 'administration' }, creer: { methode: 'POST', role: 'administration' },
  porteurs: { methode: 'GET', role: 'lecture' }, porteur: { methode: 'GET', role: 'lecture' }, qualite: { methode: 'GET', role: 'lecture' },
  'enregistrer-porteur': { methode: 'POST', role: 'approbation' }, 'creer-porteur': { methode: 'POST', role: 'approbation' },
  geocoder: { methode: 'POST', role: 'approbation' }, 'fusionner-porteurs': { methode: 'POST', role: 'approbation' },
  'fusionner-valeurs': { methode: 'POST', role: 'approbation' }, 'revisiter-lien': { methode: 'POST', role: 'approbation' },
  equipe: { methode: 'GET', role: 'lecture' },
  inviter: { methode: 'POST', role: 'administration' }, 'changer-role': { methode: 'POST', role: 'administration' }, retirer: { methode: 'POST', role: 'administration' },
  // Chaque personne règle son propre résumé : le module de l'équipe vérifie que c'est bien le sien.
  'regler-resume': { methode: 'POST', role: 'lecture' },
  // Les courriels : tout le monde les lit, l'Administration seule les modifie et règle le mode d'essai.
  courriels: { methode: 'GET', role: 'lecture' },
  'enregistrer-courriel': { methode: 'POST', role: 'administration' }, 'retablir-courriel': { methode: 'POST', role: 'administration' },
  'essai-courriel': { methode: 'POST', role: 'administration' }, 'mode-essai': { methode: 'POST', role: 'administration' },
};
// Les gestes du lot 3 : ce que le corps doit porter, puis l'appel, toujours au nom de la personne en session.
const texteCourt = (v, max) => typeof v === 'string' && v.length <= max;
const GESTES_LOT3 = {
  'enregistrer-porteur': { lisible: (c) => reperePorteurValide(c.porteur) && estObjet(c.valeurs), faire: (d, c, par) => d.porteurs.enregistrer({ repere: c.porteur, valeurs: c.valeurs, par }) },
  'creer-porteur': { lisible: (c) => estObjet(c.valeurs), faire: (d, c, par) => d.porteurs.creer({ valeurs: c.valeurs, par }) },
  geocoder: { lisible: (c) => texteCourt(c.adresse, 300), faire: (d, c, par) => d.porteurs.geocoder({ adresse: c.adresse, par }) },
  'fusionner-porteurs': { lisible: (c) => reperePorteurValide(c.doublon) && reperePorteurValide(c.garde), faire: (d, c, par) => d.porteurs.fusionner({ doublon: c.doublon, garde: c.garde, par }) },
  'fusionner-valeurs': { lisible: (c) => texteCourt(c.cle, 40) && texteCourt(c.de, 200) && texteCourt(c.vers, 200), faire: (d, c, par) => d.qualite.fusionnerValeurs({ cle: c.cle, de: c.de, vers: c.vers, par }) },
  'revisiter-lien': { lisible: (c) => repereValide(c.fiche), faire: (d, c, par) => d.qualite.revisiterLien({ repere: c.fiche, par }) },
};
// Les gestes sur l'équipe. Les garde-fous (son propre rôle, la dernière Administration…) sont dans lib/equipe.js.
const GESTES_EQUIPE = {
  inviter: { lisible: (c) => texteCourt(c.courriel, 254) && texteCourt(c.nom, 400) && texteCourt(c.role, 40), faire: (d, c, par, origine, ip) => d.equipe.inviter({ courriel: c.courriel, nom: c.nom, role: c.role, par, origine, ip }) },
  'changer-role': { lisible: (c) => reperePersonneValide(c.personne) && texteCourt(c.role, 40), faire: (d, c, par) => d.equipe.changerRole({ personne: c.personne, role: c.role, par }) },
  retirer: { lisible: (c) => reperePersonneValide(c.personne), faire: (d, c, par) => d.equipe.retirer({ personne: c.personne, par }) },
  'regler-resume': { lisible: (c) => reperePersonneValide(c.personne) && typeof c.actif === 'boolean', faire: (d, c, par) => d.equipe.reglerResume({ personne: c.personne, actif: c.actif, par }) },
};
// Les gestes sur les courriels. Le texte est vérifié dans lib/courriels.js ; ici, seulement sa forme
// et une taille au-delà de laquelle la demande n'est pas lue. L'essai part toujours à la personne
// en session : rien de ce que dit le corps ne désigne un destinataire.
const OBJET_BRUT_MAX = 1000;
const TEXTE_BRUT_MAX = 20000;
const brouillonLisible = (c) => texteCourt(c.objet, OBJET_BRUT_MAX) && texteCourt(c.texte, TEXTE_BRUT_MAX);
const GESTES_COURRIEL = {
  'enregistrer-courriel': { lisible: (c) => texteCourt(c.id, 40) && brouillonLisible(c), faire: (d, c, par) => d.courriels.enregistrer({ id: c.id, objet: c.objet, texte: c.texte, par }) },
  'retablir-courriel': { lisible: (c) => texteCourt(c.id, 40), faire: (d, c, par) => d.courriels.retablir({ id: c.id, par }) },
  'essai-courriel': {
    lisible: (c) => texteCourt(c.id, 40) && ((c.objet === undefined && c.texte === undefined) || brouillonLisible(c)),
    faire: (d, c, par, origine) => d.courriels.essai({ id: c.id, a: par, ...(c.objet === undefined ? {} : { objet: c.objet, texte: c.texte }), site: origine }),
  },
};
// Les gestes qui portent sur une fiche existante.
const GESTES_FICHE = ['enregistrer', 'retablir', 'verifier', 'revoir', 'ecarter', 'republier'];
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
const LIGNES_JOURNAL = 50;
const MESSAGES_ROLE = {
  approbation: 'Votre rôle ne permet pas ce geste : il demande le rôle Approbation ou Administration.',
  administration: 'Votre rôle ne permet pas ce geste : il est réservé au rôle Administration.',
};
const CODES = { 'reglages-absents': 409, 'sans-adresse': 409, envoi: 502, limite: 429, confirmation: 400, role: 403, 'soi-meme': 409, 'derniere-administration': 409, 'deja-inscrite': 409, 'adresse-introuvable': 404, 'a-poursuivre': 409, interrompue: 502, 'non-approbateur': 401, introuvable: 404, occupee: 409, 'deja-tranchee': 409, doublon: 409, ressemble: 409, conflit: 409, 'sans-historique': 409, 'fiche-introuvable': 410, invalide: 400, notion: 502 };
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

// Le nom d'une personne de l'équipe d'après son courriel ; à défaut, le nom qu'on a sous la main.
// Jamais le courriel : hors de l'écran « Équipe », une personne de l'équipe n'est qu'un nom.
// « equipe » compte ici les personnes retirées : leur nom reste dans l'historique.
const nomDans = (equipe, courriel, sinon) => {
  const personne = courriel ? equipe.find((x) => x.courriel === courriel) : null;
  return (personne && personne.nom) || sinon || null;
};
// Les avis tels que le panneau les montre : le nom, jamais le courriel ; « moi » marque le sien.
function avisPublics(avis, equipe, moi) {
  return avis.map((a) => ({ nom: nomDans(equipe, a.courriel, a.nom) || '', sens: a.sens, commentaire: a.commentaire, le: a.le, moi: a.courriel === moi }));
}
// Une modification, du public ou de l'équipe, vise une fiche qui existe déjà.
const viseUneFiche = (genre) => genre === 'modification' || genre === 'equipe';

// ─── Le journal de l'équipe ───
// Pour chaque action : le geste noté, ce sur quoi il porte et la phrase, à partir de ce que le
// module a répondu (r) et de ce qui était demandé (c). null : rien à noter (rien n'a changé).
const sansPrefixe = (titre) => String(titre || '').replace(/^[^:]{1,40} : /, '');
const OBJETS = {
  nouvelle: (nom) => `la nouvelle ressource ${nom}`, modification: (nom) => `la modification de ${nom}`,
  rsn: (nom) => `la fiche à remplir ${nom}`, equipe: (nom) => `la modification de l'équipe sur ${nom}`,
};
const objetDe = (genre, nom) => (OBJETS[genre] || OBJETS.modification)(nom);
const champs = (n) => `${n} ${n > 1 ? 'champs' : 'champ'}`;
const ligne = (geste, sur, phrase) => ({ geste, sur, phrase });
const JOURNAL = {
  approuver: (r) => ligne('Approbation', r.nom, `a approuvé ${objetDe(r.genre, r.nom)}`),
  refuser: (r) => ligne('Refus', sansPrefixe(r.titre), `a refusé ${objetDe(r.genre, sansPrefixe(r.titre))}`),
  verification: (r) => (r.inchangee ? null : ligne('Second regard', sansPrefixe(r.titre), `a demandé un second regard sur ${objetDe(r.genre, sansPrefixe(r.titre))}`)),
  enregistrer: (r) => (r.inchangee ? null : r.proposee
    ? ligne('Modification proposée', r.nom, `a proposé une modification de ${r.nom} (${champs(r.champs)}), à faire approuver`)
    : ligne('Fiche modifiée', r.nom, `a modifié la fiche de ${r.nom} (${champs(r.champs)})`)),
  creer: (r) => ligne('Fiche créée', r.nom, `a ajouté la ressource ${r.nom}`),
  retablir: (r, c) => (r.inchangee ? null : ligne('Version rétablie', r.nom, `a rétabli la version ${Number(c.numero)} de ${r.nom}`)),
  ecarter: (r) => (r.inchangee ? null : ligne('Fiche écartée', r.nom, `a écarté la fiche de ${r.nom}`)),
  republier: (r) => (r.inchangee ? null : ligne('Fiche republiée', r.nom, `a republié la fiche de ${r.nom}`)),
  verifier: (r) => (r.inchangee ? null : ligne('Fiche vérifiée', r.nom, `a marqué ${r.nom} comme vérifiée`)),
  revoir: (r) => (r.inchangee ? null : ligne('Fiche à revoir', r.nom, r.aRevoir ? `a marqué ${r.nom} « à revoir »` : `a retiré la marque « à revoir » de ${r.nom}`)),
  'creer-porteur': (r) => ligne('Porteur créé', r.nom, `a ajouté le porteur ${r.nom}`),
  'enregistrer-porteur': (r) => (r.inchange ? null : ligne('Porteur modifié', r.nom, `a modifié le porteur ${r.nom}`)),
  'fusionner-porteurs': (r) => ligne('Porteurs fusionnés', r.nom, `a fusionné le porteur ${r.nomDoublon} dans ${r.nom}`),
  'fusionner-valeurs': (r, c) => (r.faites ? ligne('Valeurs fusionnées', c.vers, `a fusionné « ${c.de} » dans « ${c.vers} » (${r.faites} ${r.faites > 1 ? 'fiches' : 'fiche'})`) : null),
  inviter: (r) => ligne('Invitation', r.nom, `${r.reactivee ? "a redonné l'accès à" : 'a invité'} ${r.nom} (${ROLES[r.role]})`),
  'changer-role': (r) => (r.inchange ? null : ligne('Rôle changé', r.nom, `a changé le rôle de ${r.nom} : ${ROLES[r.role]}`)),
  retirer: (r) => ligne('Personne retirée', r.nom, `a retiré l'accès de ${r.nom}`),
  'regler-resume': (r) => (r.inchange ? null : ligne('Résumé réglé', r.nom, `${r.resume ? 'a activé' : 'a arrêté'} le résumé hebdomadaire pour ${r.nom}`)),
  // Le texte d'un courriel n'est jamais recopié au journal : seulement le nom du courriel.
  'enregistrer-courriel': (r) => (r.inchange ? null : r.retabli ? JOURNAL['retablir-courriel'](r) : ligne('Courriel modifié', r.nom, `a modifié le courriel « ${r.nom} »`)),
  'retablir-courriel': (r) => (r.inchange ? null : ligne('Courriel rétabli', r.nom, `a rétabli le texte d'origine du courriel « ${r.nom} »`)),
  'mode-essai': (r) => (r.inchange ? null : ligne("Mode d'essai changé", 'Courriels', r.actif
    ? "a activé le mode d'essai des courriels : ils vont tous à l'adresse d'essai"
    : "a coupé le mode d'essai des courriels : ils partent aux vraies personnes")),
};
// Un geste de masse arrêté en route (échec, ou « à poursuivre ») qui a déjà changé des fiches : il
// est noté quand même, avec le compte des fiches faites. Les noms des porteurs sont relus ici, la
// réponse du module ne les porte pas ; s'ils ne peuvent pas l'être, la ligne s'écrit sans eux.
const fichesFaites = (n) => `${n} ${n > 1 ? 'fiches faites' : 'fiche faite'}, puis le geste a été interrompu`;
const INTERROMPUS = {
  'fusionner-porteurs': async (r, c, d) => {
    let noms = null;
    try {
      const { porteurs } = await d.porteurs.lister();
      const nomDe = (repere) => (porteurs.find((o) => o.id === repere) || {}).nom;
      if (nomDe(c.doublon) && nomDe(c.garde)) noms = { doublon: nomDe(c.doublon), garde: nomDe(c.garde) };
    } catch (err) { /* la ligne s'écrit sans les noms */ }
    return noms
      ? ligne('Porteurs fusionnés', noms.garde, `a commencé à fusionner le porteur ${noms.doublon} dans ${noms.garde} : ${fichesFaites(r.faites)}`)
      : ligne('Porteurs fusionnés', '', `a commencé à fusionner deux porteurs : ${fichesFaites(r.faites)}`);
  },
  'fusionner-valeurs': (r, c) => ligne('Valeurs fusionnées', c.vers, `a commencé à fusionner « ${c.de} » dans « ${c.vers} » : ${fichesFaites(r.faites)}`),
};
// Le journal ne retarde jamais un geste plus longtemps que cela.
const ATTENTE_JOURNAL_MS = 3000;
// Note un geste réussi, ou un geste de masse interrompu qui a déjà changé des fiches. Ne lève jamais,
// ne change rien à la réponse et n'attend pas plus de trois secondes : une panne ou une lenteur va
// au journal du serveur.
async function consigner(d, action, par, retour, corps) {
  const dire = (...texte) => { try { d.journal(...texte); } catch (e) { /* rien de plus à faire */ } };
  let minuterie;
  try {
    if (!d.journalEquipe || !retour) return;
    const table = retour.ok ? JOURNAL : (Number.isInteger(retour.faites) && retour.faites > 0 ? INTERROMPUS : null);
    if (!table || !Object.hasOwn(table, action)) return;
    const ecriture = (async () => {
      const aNoter = await table[action](retour, corps || {}, d);
      if (aNoter) await d.journalEquipe.noter({ ...aNoter, par });
    })().catch((err) => { dire(`[admin] journal de l'équipe non écrit (${action}) :`, err && err.message); });
    const tropLong = new Promise((suite) => { minuterie = setTimeout(() => suite('trop long'), ATTENTE_JOURNAL_MS); });
    if ((await Promise.race([ecriture, tropLong])) === 'trop long') dire(`[admin] journal de l'équipe : pas de réponse après trois secondes, le geste n'attend plus (${action})`);
  } catch (err) {
    dire(`[admin] journal de l'équipe non écrit (${action}) :`, err && err.message);
  } finally {
    clearTimeout(minuterie);
  }
}
// Ce qu'un geste réussi répond : sans ce que le module a ajouté pour le journal.
function reponseDe(retour) {
  const { nom, nomDoublon, titre, genre, ...reste } = retour;
  return reste;
}
// Une adresse web réduite à ce qui la distingue : sans protocole, sans « www. », sans barre finale, en minuscules.
const lienReduit = (lien) => (typeof lien === 'string' ? lien.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/#?]+$/, '') : '');
const nomReduit = (nom) => (typeof nom === 'string' ? nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : '');
// Une nouvelle ressource qui a le lien principal ou le nom d'une fiche publique : { adresse, nom }, sinon null.
function ressemblance(p, propose, ressources) {
  if (viseUneFiche(p.genre) || !OUVERTS.includes(p.statut)) return null;
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
  // Une modification de l'équipe porte le nom de la personne, jamais son courriel.
  const deLEquipe = p.genre === 'equipe';
  return {
    id: p.id, genre: p.genre,
    // Le nom de la ressource : celui de la fiche visée, sinon le nom proposé, sinon le titre sans son préfixe.
    nom: (fiche && fiche.nom) || nomPropose || String(p.titre || '').replace(/^[^:]{1,40} : /, ''),
    statut: p.statut, proposeLe: p.proposeLe, verificationLe: p.verificationLe || null,
    courriel: deLEquipe ? null : p.courriel, nomProposant: deLEquipe ? (nomDans(equipe, p.courriel, p.nomProposant) || '') : p.nomProposant,
    lienAvecRessource: p.lienAvecRessource, decidePar: nomDans(equipe, p.decidePar), decideLe: p.decideLe, commentaire: p.commentaire, aLogo: !!p.logoPropose,
    fiche: adresse ? { adresse, nom: (fiche && fiche.nom) || adresse } : null,
    type: viseUneFiche(p.genre) ? ((fiche && fiche.typePrincipal) || null) : typePropose,
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
      // « annuaire » : toute la base, personnes retirées comprises, pour montrer un nom dans
      // l'historique. Seules les personnes actives (« equipe ») ont accès.
      const annuaire = await d.propositions.equipe({ avecInactifs: true });
      const equipe = annuaire.filter((x) => x.actif !== false);
      const personne = equipe.find((x) => x.courriel === session.courriel);
      if (!personne) return refuse();
      const roleRefuse = () => res.status(403).json({ code: 'role', erreur: MESSAGES_ROLE[roleMinimal] || MESSAGES_ROLE.administration });
      if (rang(personne.role) < RANGS[roleMinimal]) return roleRefuse();
      const approbateur = personne.courriel;
      const administre = rang(personne.role) >= RANGS.administration;

      if (action === 'moi') {
        return res.status(200).json({
          nom: personne.nom || '', courriel: personne.courriel, role: personne.role,
          permis: { decider: rang(personne.role) >= RANGS.approbation, administrer: administre },
        });
      }

      if (action === 'file' || action === 'accueil') {
        const { propositions, contenus, publiques } = await tableau(d, contenusTranches);
        const r = reperes(publiques);
        const resumes = propositions.map((p) => resume(p, contenus.get(p.id), r, annuaire, approbateur));
        if (action === 'file') return res.status(200).json({ courriel: approbateur, propositions: resumes });
        return res.status(200).json({
          compteurs: { nouvelles: resumes.filter((x) => x.statut === 'attente').length, verification: resumes.filter((x) => x.statut === 'verification').length },
          activite: activiteDe(resumes, propositions),
          // L'état des envois : ce qui est vrai, sans l'adresse d'essai ni aucune valeur secrète.
          envois: {
            resume: { jour: JOUR_RESUME, destinataires: equipe.filter((x) => x.resume).length },
            contributions: ouvertes(env),
            // Le mode d'essai en vigueur : la valeur du panneau, sinon la variable de Vercel.
            essaiCourriels: (await lireModeEssai(d.reglages, env)).actif,
          },
        });
      }

      // ─── Ressources ───
      const illisible = () => res.status(400).json({ erreur: 'Demande illisible.' });
      if (action === 'ressources') {
        const { ressources, historique } = await d.ressources.lister();
        // Le nom de la personne, jamais son courriel.
        return res.status(200).json({ historique, ressources: ressources.map((r) => ({ ...r, dernier: r.dernier ? { ...r.dernier, par: nomDans(annuaire, r.dernier.par) } : null })) });
      }
      if (action === 'ressource') {
        if (req.query.neuve) return res.status(200).json(await d.ressources.neuve());
        if (!repereValide(req.query.fiche)) return illisible();
        const vue = await d.ressources.lire(req.query.fiche);
        if (!vue) return res.status(404).json({ code: 'introuvable', erreur: 'Cette fiche est introuvable.' });
        return res.status(200).json({ ...vue, versions: vue.versions.map((v) => ({ ...v, par: nomDans(annuaire, v.par) })) });
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
          if (action === 'revoir') Object.assign(demande, { actif: corps.actif === true, note: typeof corps.note === 'string' ? corps.note : '' });
          retour = await d.ressources[action](demande);
        }
        if (retour.ok) {
          await consigner(d, action, approbateur, retour, corps);
          return res.status(200).json(reponseDe(retour));
        }
        if (retour.code === 'role') return roleRefuse();
        const { ok, code, ...detail } = retour;
        return res.status(CODES[code] || 502).json({ code, ...detail });
      }

      // ─── Équipe et journal ───
      if (action === 'equipe') {
        const actif = !!(d.journalEquipe && d.journalEquipe.active());
        // Le journal illisible n'empêche pas de voir l'équipe.
        const lireJournal = async () => {
          if (!actif) return { lu: true, lignes: [] };
          try { return { lu: true, lignes: await d.journalEquipe.lire({ limite: LIGNES_JOURNAL }) }; } catch (err) { d.journal("[admin] journal de l'équipe illisible :", err.message); return { lu: false, lignes: [] }; }
        };
        const [personnes, lecture] = await Promise.all([d.equipe.lister({ moi: approbateur }), lireJournal()]);
        return res.status(200).json({
          personnes,
          resume: { jour: JOUR_RESUME },
          // Le nom de la personne, jamais son courriel ; null si elle n'a plus de ligne ou pas de nom.
          journal: { actif, lu: lecture.lu, lignes: lecture.lignes.map((l) => ({ qui: nomDans(annuaire, l.par), geste: l.geste, phrase: l.phrase, le: l.le })) },
        });
      }
      if (Object.hasOwn(GESTES_EQUIPE, action)) {
        const geste = GESTES_EQUIPE[action];
        if (!geste.lisible(corps)) return illisible();
        const retour = await geste.faire(d, corps, approbateur, origine, ipDe(req));
        if (retour.ok) {
          await consigner(d, action, approbateur, retour, corps);
          return res.status(200).json(reponseDe(retour));
        }
        if (retour.code === 'role') return res.status(403).json({ code: 'role', erreur: MESSAGES_ROLE.administration });
        const { ok, code, ...detail } = retour;
        return res.status(CODES[code] || 502).json({ code, ...detail });
      }

      // ─── Courriels et mode d'essai ───
      const sansReglages = () => res.status(409).json({ code: 'reglages-absents' });
      // Un courriel tel que l'écran le montre : « modifié par » est un nom, jamais un courriel.
      const vueCourriel = (c) => ({ ...c, quand: c.quand.replace('{jour}', JOUR_RESUME), modifiePar: nomDans(annuaire, c.modifiePar) });
      if (action === 'courriels') {
        // L'écran montre ce qui est enregistré maintenant, pas ce que l'instance a gardé en mémoire.
        if (d.reglages) d.reglages.vider();
        const [liste, etat] = await Promise.all([d.courriels.lister(), d.courriels.etat()]);
        const regle = etat.essai.source === 'panneau' && d.reglages ? await d.reglages.lire(CLES_REGLAGES.modeEssai) : null;
        return res.status(200).json({
          reglages: { actifs: liste.base, lus: liste.lus },
          // L'adresse d'essai ne sort pas : seulement si elle est définie.
          essai: { actif: etat.essai.actif, source: etat.essai.source, adresseDefinie: etat.adresseEssai, modifieLe: (regle && regle.modifieLe) || null, modifiePar: regle ? nomDans(annuaire, regle.modifiePar) : null },
          service: etat.service,
          courriels: liste.liste.map(vueCourriel),
        });
      }
      if (action === 'mode-essai') {
        if (typeof corps.actif !== 'boolean') return illisible();
        // Couper le mode d'essai envoie les courriels aux vraies personnes : la page le fait confirmer, le serveur l'exige.
        if (!corps.actif && corps.confirme !== true) return res.status(400).json({ code: 'confirmation' });
        if (!d.reglages || !d.reglages.active()) return sansReglages();
        // Toujours écrit : la mémoire de l'instance peut retarder sur la base, et « déjà réglé » serait alors faux.
        if (!(await d.reglages.ecrire(CLES_REGLAGES.modeEssai, corps.actif, approbateur)).ok) return sansReglages();
        const retour = { ok: true, actif: corps.actif, source: 'panneau' };
        await consigner(d, action, approbateur, retour, corps);
        return res.status(200).json(retour);
      }
      if (Object.hasOwn(GESTES_COURRIEL, action)) {
        const geste = GESTES_COURRIEL[action];
        if (!geste.lisible(corps)) return illisible();
        if (!courrielDe(corps.id)) return res.status(404).json({ code: 'introuvable' });
        if (action === 'essai-courriel' && !(await d.limites.autoriserEssai({ courriel: approbateur }))) return res.status(429).json({ code: 'limite' });
        const retour = await geste.faire(d, corps, approbateur, origine);
        if (!retour.ok) {
          const { ok, code, ...detail } = retour;
          return res.status(CODES[code] || 502).json({ code, ...detail });
        }
        if (action === 'essai-courriel') return res.status(200).json(retour);
        await consigner(d, action, approbateur, retour, corps);
        // Le courriel tel qu'il est maintenant, pour que l'écran n'ait pas à relire la base.
        const vue = (await d.courriels.lister()).liste.find((c) => c.id === corps.id);
        return res.status(200).json({ ...reponseDe(retour), courriel: vueCourriel(vue) });
      }

      // ─── Porteurs et qualité des données ───
      if (action === 'porteurs') {
        // La clé du fond de carte est déjà publique : c'est celle que le site donne avec ses fiches.
        return res.status(200).json({ ...(await d.porteurs.lister()), carte: { cle: env.CARTO_BASEMAP_KEY || '' } });
      }
      if (action === 'porteur') {
        if (!reperePorteurValide(req.query.porteur)) return illisible();
        const vue = await d.porteurs.lire(req.query.porteur);
        if (!vue) return res.status(404).json({ code: 'introuvable', erreur: 'Ce porteur est introuvable.' });
        return res.status(200).json({ ...vue, carte: { cle: env.CARTO_BASEMAP_KEY || '' } });
      }
      if (action === 'qualite') return res.status(200).json(await d.qualite.lire());
      if (Object.hasOwn(GESTES_LOT3, action)) {
        const geste = GESTES_LOT3[action];
        if (!geste.lisible(corps)) return illisible();
        const retour = await geste.faire(d, corps, approbateur);
        // Réussi ou non : une fusion arrêtée en route qui a déjà changé des fiches est notée elle aussi.
        await consigner(d, action, approbateur, retour, corps);
        if (retour.ok) return res.status(200).json(reponseDe(retour));
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
        const { ressemble, ...vue } = resume(proposition, proposition.contenu === undefined ? null : proposition.contenu, r, annuaire, approbateur);
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
        // Un avis ne se note pas dans le journal : la table n'a pas de ligne pour lui.
        await consigner(d, action, approbateur, retour, corps);
        return res.status(200).json(action === 'avis' ? { ok: true, avis: avisPublics(avisDe({ avis: retour.avis }), annuaire, approbateur) } : { ok: true });
      }

      // Une modification de l'équipe ne se tranche qu'en Administration. Le module de l'approbation
      // le vérifie de son côté, sous le verrou ; ici, une personne en Approbation est arrêtée avant.
      if (!administre) {
        const visee = await d.propositions.lireProposition(id);
        if (visee && visee.genre === 'equipe') return res.status(403).json({ code: 'role', erreur: MESSAGES_ROLE.administration });
      }
      const resultat = action === 'approuver'
        ? await d.approbation.approuver({ propositionId: id, corrections: objet(corps.corrections), porteursNouveaux: adressesDe(corps.porteursNouveaux), sansLogo: corps.sansLogo === true, approbateur, origine })
        : await d.approbation.refuser({ propositionId: id, commentaire, approbateur });
      if (resultat.ok) {
        await consigner(d, action, approbateur, resultat, corps);
        return res.status(200).json({ ok: true, courriel: !!resultat.courriel, historique: resultat.historique !== false });
      }
      if (resultat.code === 'role') return res.status(403).json({ code: 'role', erreur: MESSAGES_ROLE.administration });
      return res.status(CODES[resultat.code] || 502).json({ code: resultat.code, erreurs: resultat.erreurs });
    } catch (err) {
      d.journal(`[admin] ${action} impossible :`, err.message);
      return res.status(502).json({ code: 'notion', erreur: 'Le service ne répond pas pour le moment. Réessayez dans un instant.' });
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
