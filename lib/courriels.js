/**
 * Courriels de la cartographie, envoyés par Resend.
 * Chaque courriel est un gabarit (public/js/gabarits.js) : le texte d'origine, ou celui que
 * l'Administration a enregistré dans le panneau (réglage « courriel.<id> »). Un texte enregistré
 * mais invalide ou illisible est ignoré au profit du texte d'origine : un courriel ne part jamais
 * sans son lien.
 * - Mode d'essai : décidé à chaque envoi (lib/reglages.js) : la valeur du panneau, sinon
 *   EMAIL_TEST_MODE. Tout part alors vers EMAIL_TEST_RECIPIENT, et l'objet nomme le destinataire
 *   d'origine ; sans adresse d'essai, l'envoi est annulé.
 * - Sans RESEND_API_KEY : rien ne part, l'objet et le lien sont écrits au journal (utile en local).
 * Une panne d'envoi ou de lecture des réglages ne lève jamais : l'appelant reçoit { envoye: false }
 * ou le texte d'origine, et continue.
 */
const { echapper } = require('../public/js/texte.js');
const { COURRIELS, REPERES, REPONSE, courrielDe, origine, valider, gabaritEnVigueur, rendre, enveloppe, exemple, nombreDePropositions } = require('../public/js/gabarits.js');
const { lireModeEssai, cleCourriel } = require('./reglages');

function envoyeurResend(cle) {
  let client;
  return async (message) => {
    if (!client) { const { Resend } = require('resend'); client = new Resend(cle); }
    const { error } = await client.emails.send(message);
    if (error) throw new Error(error.message || 'Envoi refusé par Resend');
  };
}

const uneLigne = (texte) => String(texte === null || texte === undefined ? '' : texte).replace(/[\r\n]+/g, ' ').trim();
// « Modification : CARTaGENE » → « CARTaGENE ».
const sansPrefixe = (titre) => String(titre || '').replace(/^[^:]{1,40} : /, '');
const memeGabarit = (a, b) => !!a && !!b && a.objet === b.objet && a.texte === b.texte;

function creerCourriels({ envoyeur, env = process.env, journal = console.log, reglages = null } = {}) {
  const expediteur = `${env.RESEND_FROM_NAME || 'Cartographie du RSN'} <${env.RESEND_FROM_EMAIL || 'cartographie@cartographie.rsn.quebec'}>`;
  const envoyer = envoyeur || (env.RESEND_API_KEY ? envoyeurResend(env.RESEND_API_KEY) : null);
  const baseReglee = () => { try { return !!(reglages && reglages.active()); } catch (err) { return false; } };

  // Un réglage, sans jamais lever : une lecture impossible vaut « inconnu ».
  async function lireReglage(cle) {
    if (!reglages) return { etat: 'absent' };
    try { return (await reglages.lire(cle)) || { etat: 'inconnu' }; } catch (err) {
      journal('[courriel] réglages illisibles :', err && err.message);
      return { etat: 'inconnu' };
    }
  }
  // Le mode d'essai en vigueur : { actif, source }.
  const modeEssai = () => lireModeEssai(reglages, env);

  async function expedier({ a, objet, corps, lien }) {
    const destinataires = (Array.isArray(a) ? a : [a]).filter(Boolean);
    let sujet = uneLigne(objet);
    if (!destinataires.length) return { envoye: false };
    if (!envoyer) {
      journal(`[courriel simulé] à ${destinataires.join(', ')} | ${sujet}${lien ? ` | ${lien}` : ''}`);
      return { envoye: false, simule: true };
    }
    let vers = destinataires;
    const essai = (await modeEssai()).actif;
    if (essai) {
      if (!env.EMAIL_TEST_RECIPIENT) {
        journal("[courriel] mode d'essai sans EMAIL_TEST_RECIPIENT : envoi annulé");
        return { envoye: false };
      }
      sujet = `[TEST → ${destinataires.join(', ')}] ${sujet}`;
      vers = [env.EMAIL_TEST_RECIPIENT];
    }
    try {
      await envoyer({ from: expediteur, to: vers, subject: sujet, html: enveloppe(corps), replyTo: REPONSE });
      return essai ? { envoye: true, essai: true } : { envoye: true };
    } catch (err) {
      journal(`[courriel] envoi impossible (${sujet}) : ${err.message}`);
      return { envoye: false };
    }
  }

  // Le gabarit qui part pour un courriel : celui du panneau s'il est valide, sinon le texte d'origine.
  async function enVigueur(id) {
    const v = gabaritEnVigueur(id, await lireReglage(cleCourriel(id)));
    if (v.ignore) journal(`[courriel] le texte enregistré pour « ${id} » est ${v.ignore} : le texte d'origine est utilisé`);
    return v.gabarit;
  }
  // Remplit un gabarit et l'envoie. « gabarit » : un texte à essayer à la place de celui en vigueur.
  async function envoyerGabarit(id, { a, valeurs, propositions, gabarit = null, prefixe = '' }) {
    const lien = valeurs['{lien}'] ? String(valeurs['{lien}']).trim() : '';
    let rendu = rendre(id, gabarit || await enVigueur(id), valeurs, { propositions });
    // Dernier garde-fou : un courriel à lien dont le lien aurait disparu repart du texte d'origine.
    if (lien && !rendu.corps.includes(echapper(lien))) {
      journal(`[courriel] le texte de « ${id} » a perdu son lien : le texte d'origine est utilisé`);
      rendu = rendre(id, origine(id), valeurs, { propositions });
    }
    return expedier({ a, objet: `${prefixe}${rendu.objet}`, corps: rendu.corps, lien: lien || undefined });
  }

  return {
    // « destinataire » : le nom de la personne qui reçoit le courriel, quand il est connu ({nom}).
    lienProposer({ a, lien, nomFiche }) {
      return envoyerGabarit('lien', { a, valeurs: { '{but du lien}': nomFiche ? `modifier la fiche ${nomFiche}` : 'proposer une ressource', '{lien}': lien } });
    },
    propositionRecue({ a, titre, destinataire }) {
      return envoyerGabarit('recue', { a, valeurs: { '{nom}': destinataire, '{proposition}': titre, '{ressource}': sansPrefixe(titre) } });
    },
    // Une fois par semaine, à chaque approbateur : ce qui attend dans le panneau. Rien ne part s'il n'y a rien.
    resumeHebdomadaire({ a, propositions, lienPanneau, destinataire }) {
      const liste = (propositions || []).filter((x) => x && x.titre);
      if (!liste.length) return Promise.resolve({ envoye: false });
      return envoyerGabarit('resume', { a, propositions: liste, valeurs: { '{nom}': destinataire, '{nombre de propositions}': nombreDePropositions(liste.length), '{lien}': lienPanneau } });
    },
    approuvee({ a, nom, lienFiche, destinataire }) {
      return envoyerGabarit('approuvee', { a, valeurs: { '{nom}': destinataire, '{ressource}': nom, '{lien}': lienFiche } });
    },
    refusee({ a, titre, commentaire, destinataire }) {
      return envoyerGabarit('refusee', { a, valeurs: { '{nom}': destinataire, '{proposition}': titre, '{ressource}': sansPrefixe(titre), '{commentaire}': commentaire } });
    },
    lienPanneau({ a, lien, destinataire }) {
      return envoyerGabarit('panneau', { a, valeurs: { '{nom}': destinataire, '{lien}': lien } });
    },

    // ─── Pour l'écran « Courriels » du panneau ───
    modeEssai,

    // Ce qui est vrai des envois, sans aucune valeur : ni clé, ni adresse d'essai.
    async etat() {
      return { service: !!envoyer, essai: await modeEssai(), adresseEssai: !!env.EMAIL_TEST_RECIPIENT };
    },

    // Les six courriels : le texte en vigueur, le texte d'origine, modifié ou non, par qui et quand.
    // base : la base « Réglages » est réglée ; lus : elle a pu être lue (ou n'existe pas).
    async lister() {
      let tous = { etat: 'absente', reglages: {} };
      if (reglages) {
        try { tous = await reglages.lireTous(); } catch (err) { tous = { etat: 'inconnu', reglages: {} }; }
      }
      const lectureDe = (cle) => {
        const entree = Object.hasOwn(tous.reglages || {}, cle) ? tous.reglages[cle] : null;
        if (!entree) return { etat: tous.etat === 'inconnu' ? 'inconnu' : 'absent' };
        return { ...entree, etat: entree.illisible ? 'illisible' : 'present' };
      };
      return {
        base: baseReglee(),
        lus: tous.etat !== 'inconnu',
        liste: COURRIELS.map((c) => {
          const lecture = lectureDe(cleCourriel(c.id));
          const v = gabaritEnVigueur(c.id, lecture);
          return {
            id: c.id, nom: c.nom, quand: c.quand, aQui: c.aQui, bouton: c.bouton,
            reperes: c.reperes.map((r) => ({ repere: r, aide: REPERES[r].aide, requis: c.requis.includes(r) })),
            objet: v.gabarit.objet, texte: v.gabarit.texte, origine: origine(c.id),
            modifie: v.modifie, ignore: v.ignore,
            modifieLe: v.modifie || v.ignore ? lecture.modifieLe || null : null,
            modifiePar: v.modifie || v.ignore ? lecture.modifiePar || null : null,
          };
        }),
      };
    },

    // Enregistre le texte d'un courriel, après l'avoir vérifié. Le texte d'origine, enregistré tel
    // quel, retire le réglage. Une panne de Notion remonte en erreur.
    async enregistrer({ id, objet, texte, par }) {
      const c = courrielDe(id);
      if (!c) return { ok: false, code: 'introuvable' };
      const v = valider(id, { objet, texte });
      if (!v.ok) return { ok: false, code: 'invalide', erreurs: v.erreurs };
      if (!baseReglee()) return { ok: false, code: 'reglages-absents' };
      const cle = cleCourriel(id);
      if (memeGabarit(v.gabarit, origine(id))) {
        const retour = await reglages.retirer(cle, par);
        if (!retour.ok) return { ok: false, code: 'reglages-absents' };
        return { ok: true, nom: c.nom, retabli: true, ...(retour.inchange ? { inchange: true } : {}) };
      }
      // Relu dans la base, pas dans la mémoire de l'instance : une autre a pu changer ce texte entre-temps.
      if (typeof reglages.vider === 'function') reglages.vider();
      const lecture = await lireReglage(cle);
      if (lecture.etat === 'present' && memeGabarit(lecture.valeur, v.gabarit)) return { ok: true, nom: c.nom, inchange: true };
      const retour = await reglages.ecrire(cle, v.gabarit, par);
      return retour.ok ? { ok: true, nom: c.nom } : { ok: false, code: 'reglages-absents' };
    },

    // Rétablit le texte d'origine d'un courriel.
    async retablir({ id, par }) {
      const c = courrielDe(id);
      if (!c) return { ok: false, code: 'introuvable' };
      if (!baseReglee()) return { ok: false, code: 'reglages-absents' };
      const retour = await reglages.retirer(cleCourriel(id), par);
      if (!retour.ok) return { ok: false, code: 'reglages-absents' };
      return { ok: true, nom: c.nom, retabli: true, ...(retour.inchange ? { inchange: true } : {}) };
    },

    // « M'envoyer un essai » : le courriel rempli de valeurs d'exemple, « [ESSAI] » dans l'objet.
    // « a » est donné par le serveur (la personne connectée), jamais par la page.
    // objet et texte : un brouillon à essayer avant de l'enregistrer ; sans eux, le texte en vigueur.
    // site : l'adresse du site, pour les liens d'exemple.
    async essai({ id, a, objet, texte, site }) {
      const c = courrielDe(id);
      if (!c) return { ok: false, code: 'introuvable' };
      let gabarit = null;
      if (objet !== undefined || texte !== undefined) {
        const v = valider(id, { objet, texte });
        if (!v.ok) return { ok: false, code: 'invalide', erreurs: v.erreurs };
        gabarit = v.gabarit;
      }
      const mode = await modeEssai();
      if (envoyer && mode.actif && !env.EMAIL_TEST_RECIPIENT) return { ok: false, code: 'sans-adresse' };
      const ex = exemple(id, site || undefined);
      const envoi = await envoyerGabarit(id, { a, valeurs: ex.valeurs, propositions: ex.propositions, gabarit, prefixe: '[ESSAI] ' });
      if (!envoi.envoye && !envoi.simule) return { ok: false, code: 'envoi' };
      return { ok: true, envoye: !!envoi.envoye, simule: !!envoi.simule, essai: !!envoi.essai };
    },
  };
}

module.exports = { creerCourriels };
