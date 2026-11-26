/**
 * Les réglages du site que l'Administration tient depuis l'écran « Réglages » du panneau :
 * les contributions du public ouvertes ou fermées, le message montré quand elles sont fermées,
 * et le texte des conditions du formulaire. Ils vivent dans la base « Réglages » (lib/reglages.js).
 *
 * Ce qui vaut pour le public (etatPublic), sûr par défaut :
 * - CONTRIBUTIONS reste le verrou d'installation : s'il ne vaut pas « oui », tout est fermé et le
 *   panneau n'y peut rien ;
 * - sans base « Réglages », ou sans réglage : comme avant (ouvert, texte des conditions du code) ;
 * - le panneau a dit « fermé » : fermé, avec son message ou le message d'origine ;
 * - dans le doute (réglage illisible, valeur qui ne dit ni vrai ni faux, base illisible sans rien
 *   de connu) : fermé « par précaution ». Rien de ce qui était fermé ne s'ouvre par une panne ;
 * - un texte enregistré qui ne vaut plus rien est ignoré au profit du texte d'origine.
 * La lecture pour les pages publiques ne lève jamais et n'attend pas Notion longtemps.
 * Seule l'Administration enregistre : le rôle est relu ici, pas seulement par la route du panneau.
 */
const { TEXTES } = require('../public/js/texte.js');
const { REPONSE } = require('../public/js/gabarits.js');
const { CLES } = require('./reglages');
const { DUREES } = require('./jetons');
const { PLAFONDS } = require('./limites');
const { ADRESSE_EXPEDITION } = require('./courriels');

const ORIGINE = { messageFerme: TEXTES.contribuer.fermees, conditions: TEXTES.contribuer.conditions };
const LIMITES = { messageFerme: 300, conditions: 2000 };
const MESSAGES = {
  ouvertes: 'Dites si les contributions sont ouvertes ou fermées.',
  messageFerme: `Le message ne peut pas dépasser ${LIMITES.messageFerme} caractères.`,
  messageForme: 'Le message doit être un texte.',
  conditionsVides: 'Le texte des conditions ne peut pas être vide : la case à cocher du formulaire doit dire quelque chose.',
  conditionsLongues: `Le texte des conditions ne peut pas dépasser ${LIMITES.conditions} caractères.`,
};
// Les bases Notion du site, dans l'ordre où l'écran les nomme : seulement si leur réglage est défini.
const BASES = [
  ['Ressources', 'NOTION_DB_RESSOURCES'], ['Porteurs', 'NOTION_DB_PORTEURS'], ['Propositions', 'NOTION_DB_PROPOSITIONS'], ['Approbateurs', 'NOTION_DB_APPROBATEURS'],
  ['Versions', 'NOTION_DB_VERSIONS'], ['Journal', 'NOTION_DB_JOURNAL'], ['Réglages', 'NOTION_DB_REGLAGES'], ['Sauvegardes', 'NOTION_DB_SAUVEGARDES'],
];

// Sans caractères de commande ; les fins de ligne sont celles d'Unix.
const propre = (texte) => texte.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
const uneLigne = (texte) => propre(texte).replace(/\s+/g, ' ').trim();
const paragraphes = (texte) => propre(texte).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Un réglage tel que la base le rend : { valeur, illisible, modifieLe, modifiePar }, ou null.
const entreeDe = (tous, cle) => (tous && tous.reglages && Object.hasOwn(tous.reglages, cle) ? tous.reglages[cle] : null);
// Un texte enregistré, s'il vaut encore : une chaîne non vide, dans la limite. Sinon null.
function texteValable(entree, max, nettoyer) {
  if (!entree || entree.illisible || typeof entree.valeur !== 'string') return null;
  const texte = nettoyer(entree.valeur);
  return texte && texte.length <= max ? texte : null;
}
const NETTOYAGES = { conditions: paragraphes, messageFerme: uneLigne };
// Le texte enregistré pour « conditions » ou « messageFerme », s'il vaut encore ; sinon null.
const enregistreDe = (tous, cle) => texteValable(entreeDe(tous, cle), LIMITES[cle], NETTOYAGES[cle]);
const conditionsDe = (tous) => enregistreDe(tous, CLES.conditions) || ORIGINE.conditions;
const messageDe = (tous) => enregistreDe(tous, CLES.messageFerme) || ORIGINE.messageFerme;

/**
 * Ce qui vaut pour le public. « tous » : ce que rend lireTous() du socle des réglages.
 * Renvoie { ouvertes, source, message, conditions } ;
 * source : 'installation' (CONTRIBUTIONS ferme), 'defaut' (rien de réglé : ouvert), 'panneau', ou 'precaution'.
 * message : ce qu'il faut dire au public quand c'est fermé par le panneau ou par précaution, sinon null.
 */
function etatPublic(tous, env = process.env) {
  const conditions = conditionsDe(tous);
  if (!env || env.CONTRIBUTIONS !== 'oui') return { ouvertes: false, source: 'installation', message: null, conditions };
  const parPrecaution = { ouvertes: false, source: 'precaution', message: TEXTES.contribuer.indisponibles, conditions };
  if (!tous || (tous.etat !== 'lus' && tous.etat !== 'absente')) return parPrecaution;
  const entree = entreeDe(tous, CLES.contributionsOuvertes);
  if (!entree) return { ouvertes: true, source: 'defaut', message: null, conditions };
  if (entree.illisible || typeof entree.valeur !== 'boolean') return parPrecaution;
  return entree.valeur
    ? { ouvertes: true, source: 'panneau', message: null, conditions }
    : { ouvertes: false, source: 'panneau', message: messageDe(tous), conditions };
}

// L'état public d'après un socle de réglages (ou sans socle). Ne lève jamais et n'attend pas Notion
// longtemps : un socle qui ne répond pas vaut « rien de connu ».
async function lireEtatPublic(reglages, env = process.env, attentes = undefined) {
  const absente = { etat: 'absente', reglages: {} };
  if (!env || env.CONTRIBUTIONS !== 'oui') return etatPublic(absente, env);
  let tous = absente;
  try {
    if (reglages && reglages.active()) tous = (await (reglages.lireTousVite ? reglages.lireTousVite(attentes) : reglages.lireTous())) || { etat: 'inconnu' };
  } catch (err) { tous = { etat: 'inconnu' }; }
  return etatPublic(tous, env);
}

/**
 * Vérifie ce que l'Administration veut enregistrer. Seuls les réglages donnés comptent.
 * Renvoie { ok: true, valeurs } (nettoyées), ou { ok: false, erreurs } avec un message par champ.
 * Un message de fermeture vide veut dire « le message d'origine ».
 */
function valider(saisie) {
  const s = saisie || {}; const valeurs = {}; const erreurs = {};
  if (s.ouvertes !== undefined) {
    if (typeof s.ouvertes === 'boolean') valeurs.ouvertes = s.ouvertes; else erreurs.ouvertes = MESSAGES.ouvertes;
  }
  if (s.messageFerme !== undefined) {
    if (typeof s.messageFerme !== 'string') erreurs.messageFerme = MESSAGES.messageForme;
    else if (uneLigne(s.messageFerme).length > LIMITES.messageFerme) erreurs.messageFerme = MESSAGES.messageFerme;
    else valeurs.messageFerme = uneLigne(s.messageFerme);
  }
  if (s.conditions !== undefined) {
    const texte = typeof s.conditions === 'string' ? paragraphes(s.conditions) : '';
    if (!texte) erreurs.conditions = MESSAGES.conditionsVides;
    else if (texte.length > LIMITES.conditions) erreurs.conditions = MESSAGES.conditionsLongues;
    else valeurs.conditions = texte;
  }
  return Object.keys(erreurs).length ? { ok: false, erreurs } : { ok: true, valeurs };
}

// « 24h » → { n: 24, unite: 'h' } ; « 7d » → { n: 7, unite: 'j' }.
function dureeEnClair(duree) {
  const m = /^(\d+)([hd])$/.exec(String(duree || ''));
  return m ? { n: Number(m[1]), unite: m[2] === 'd' ? 'j' : 'h' } : null;
}

// roleDe : async (courriel) → le rôle de cette personne si elle est inscrite et active, sinon null.
function creerReglagesSite({ reglages = null, env = process.env, roleDe }) {
  const baseReglee = () => { try { return !!(reglages && reglages.active()); } catch (err) { return false; } };
  const administre = async (par) => !!par && (await roleDe(par)) === 'administration';
  const trace = (entree, garde) => ({ modifieLe: (garde && entree && entree.modifieLe) || null, modifiePar: (garde && entree && entree.modifiePar) || null });

  return {
    // Ce que l'écran « Réglages » montre. Relit la base : l'écran dit ce qui est enregistré maintenant.
    // Ne lève pas : une base illisible se voit à « lus: false ».
    async lire() {
      let tous = { etat: 'absente', reglages: {} };
      if (baseReglee()) {
        try { reglages.vider(); tous = await reglages.lireTous(); } catch (err) { tous = { etat: 'inconnu', reglages: {} }; }
      }
      const public_ = etatPublic(tous, env);
      const ouvert = entreeDe(tous, CLES.contributionsOuvertes);
      const regle = !!ouvert && !ouvert.illisible && typeof ouvert.valeur === 'boolean';
      // Un texte : celui qui vaut, s'il a été modifié, ou si ce qui est enregistré a dû être écarté.
      const texte = (cle) => {
        const entree = entreeDe(tous, cle); const enregistre = enregistreDe(tous, cle);
        const modifie = !!enregistre && enregistre !== ORIGINE[cle];
        const ecarte = !!entree && !enregistre;
        return { texte: enregistre || ORIGINE[cle], origine: ORIGINE[cle], modifie, ecarte, ...trace(entree, modifie || ecarte) };
      };
      return {
        reglages: { actifs: baseReglee(), lus: tous.etat !== 'inconnu' },
        // ouvertes : ce qui vaut pour le public ; choix : ce que l'interrupteur du panneau montre.
        contributions: { ouvertes: public_.ouvertes, choix: regle ? ouvert.valeur : public_.source !== 'precaution', source: public_.source, ...trace(ouvert, !!ouvert) },
        messageFerme: texte(CLES.messageFerme),
        conditions: texte(CLES.conditions),
        limites: { ...LIMITES },
      };
    },

    /**
     * Enregistre les réglages donnés (ouvertes, messageFerme, conditions), au nom de « par ».
     * Seul ce qui change est écrit ; un texte revenu à l'origine retire son réglage.
     * Renvoie { ok: true, change: { contributions: 'ouvertes' | 'fermees' | null, messageFerme, conditions } }
     * (avec inchange: true si rien n'a changé), ou { ok: false, code } : 'role', 'invalide' (avec
     * erreurs) ou 'reglages-absents'. Une panne de Notion remonte en erreur.
     */
    async enregistrer({ ouvertes, messageFerme, conditions, par }) {
      if (!(await administre(par))) return { ok: false, code: 'role' };
      const v = valider({ ouvertes, messageFerme, conditions });
      if (!v.ok) return { ok: false, code: 'invalide', erreurs: v.erreurs };
      if (!baseReglee()) return { ok: false, code: 'reglages-absents' };
      // Relu dans la base, pas dans la mémoire de l'instance. Illisible : on n'écrit pas par-dessus
      // ce qu'on ne peut pas lire.
      reglages.vider();
      const tous = await reglages.lireTous();
      if (!tous || tous.etat !== 'lus' || tous.perime) throw new Error('la base « Réglages » ne peut pas être lue');
      const change = { contributions: null, messageFerme: false, conditions: false };
      const absente = () => { throw new Error('la base « Réglages » a refusé l\'écriture'); };
      const ecrire = async (cle, valeur) => { if (!(await reglages.ecrire(cle, valeur, par)).ok) absente(); };
      const retirer = async (cle) => { if (!(await reglages.retirer(cle, par)).ok) absente(); };

      // Les textes d'abord, l'interrupteur ensuite : des contributions qu'on ferme le sont avec leur message.
      for (const cle of [CLES.messageFerme, CLES.conditions]) {
        const voulu = v.valeurs[cle];
        if (voulu === undefined) continue;
        const entree = entreeDe(tous, cle);
        if (voulu === '' || voulu === ORIGINE[cle]) {
          // Le texte d'origine : le réglage est retiré, s'il y en avait un.
          if (entree) { await retirer(cle); change[cle] = true; }
        } else if (!(entree && !entree.illisible && entree.valeur === voulu)) {
          await ecrire(cle, voulu); change[cle] = true;
        }
      }
      if (v.valeurs.ouvertes !== undefined) {
        const entree = entreeDe(tous, CLES.contributionsOuvertes);
        const regle = !!entree && !entree.illisible && typeof entree.valeur === 'boolean';
        // Sans réglage, « ouvert » est déjà l'état : rien à écrire.
        if (entree ? !(regle && entree.valeur === v.valeurs.ouvertes) : v.valeurs.ouvertes === false) {
          await ecrire(CLES.contributionsOuvertes, v.valeurs.ouvertes);
          change.contributions = v.valeurs.ouvertes ? 'ouvertes' : 'fermees';
        }
      }
      const inchange = !change.contributions && !change.messageFerme && !change.conditions;
      return { ok: true, ...(inchange ? { inchange: true } : {}), change };
    },

    // Le bloc « Fixé à l'installation » : des états (« défini » ou non) et des valeurs déjà publiques
    // (adresse du site, adresses d'envoi et de réponse, durées, plafonds). Jamais une clé, un jeton,
    // un secret, l'adresse d'essai ni l'identifiant d'une base.
    installation({ origine = '' } = {}) {
      const defini = (nom) => !!(env && env[nom]);
      return {
        site: origine || '',
        expedition: (env && env.RESEND_FROM_EMAIL) || ADRESSE_EXPEDITION,
        reponse: REPONSE,
        bases: BASES.map(([nom, variable]) => ({ nom, definie: defini(variable) })),
        cleNotion: defini('NOTION_KEY'),
        serviceEnvoi: defini('RESEND_API_KEY'),
        adresseEssai: defini('EMAIL_TEST_RECIPIENT'),
        compteur: (defini('KV_REST_API_URL') || defini('UPSTASH_REDIS_REST_URL')) && (defini('KV_REST_API_TOKEN') || defini('UPSTASH_REDIS_REST_TOKEN')),
        secretLiens: defini('JWT_SECRET'),
        secretTaches: defini('CRON_SECRET'),
        indexation: !!env && env.INDEXATION === 'oui',
        durees: { proposer: dureeEnClair(DUREES.proposer), panneau: dureeEnClair(DUREES.panneau), session: dureeEnClair(DUREES.session) },
        plafonds: { parCourriel: PLAFONDS.parCourriel, parIp: PLAFONDS.parIp, parJour: PLAFONDS.parJour },
      };
    },
  };
}

module.exports = { creerReglagesSite, etatPublic, lireEtatPublic, valider, ORIGINE, LIMITES };
