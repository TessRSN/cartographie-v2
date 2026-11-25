/**
 * Courriels de la cartographie, envoyés par Resend.
 * - EMAIL_TEST_MODE=true : tout part vers EMAIL_TEST_RECIPIENT, l'objet nomme le destinataire d'origine.
 * - Sans RESEND_API_KEY : rien ne part, l'objet et le lien sont écrits au journal (utile en local).
 * Une panne d'envoi ne lève jamais : l'appelant reçoit { envoye: false } et continue.
 */
const { echapper } = require('../public/js/texte.js');

const REPONSE = 'rsn.gestion@rimuhc.ca';

function envoyeurResend(cle) {
  let client;
  return async (message) => {
    if (!client) { const { Resend } = require('resend'); client = new Resend(cle); }
    const { error } = await client.emails.send(message);
    if (error) throw new Error(error.message || 'Envoi refusé par Resend');
  };
}

function enveloppe(corps) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:2rem;color:#1a202c">
<h2 style="color:#0c2e53;margin:0 0 1.5rem;text-align:center;font-size:1.15rem">Cartographie du Réseau santé numérique</h2>
${corps}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0">
<p style="font-size:0.75rem;color:#718096;text-align:center">Réseau santé numérique (RSN) · <a href="mailto:${REPONSE}" style="color:#718096">${REPONSE}</a></p>
</div>`;
}

const p = (texte) => `<p>${texte}</p>`;
const petit = (texte) => `<p style="font-size:0.85rem;color:#718096">${texte}</p>`;
function bouton(lien, libelle) {
  return `<div style="text-align:center;margin:2rem 0"><a href="${echapper(lien)}" style="display:inline-block;padding:0.75rem 2rem;background:#0c2e53;color:#ffffff;text-decoration:none;border-radius:0.5rem;font-weight:600">${echapper(libelle)}</a></div>`
    + petit(`Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}`);
}
const multiligne = (texte) => echapper(texte).replace(/\r?\n/g, '<br>');
const uneLigne = (texte) => String(texte === null || texte === undefined ? '' : texte).replace(/[\r\n]+/g, ' ').trim();

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// « 2026-11-20T15:00:00.000Z » → « 20 novembre », à l'heure du Québec.
function jourEnClair(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const [annee, mois, jour] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
  return annee ? `${Number(jour) === 1 ? '1er' : Number(jour)} ${MOIS[Number(mois) - 1]}` : '';
}

function creerCourriels({ envoyeur, env = process.env, journal = console.log } = {}) {
  const expediteur = `${env.RESEND_FROM_NAME || 'Cartographie du RSN'} <${env.RESEND_FROM_EMAIL || 'cartographie@cartographie.rsn.quebec'}>`;
  const envoyer = envoyeur || (env.RESEND_API_KEY ? envoyeurResend(env.RESEND_API_KEY) : null);

  async function expedier({ a, objet, corps, lien }) {
    const destinataires = (Array.isArray(a) ? a : [a]).filter(Boolean);
    let sujet = uneLigne(objet);
    if (!destinataires.length) return { envoye: false };
    if (!envoyer) {
      journal(`[courriel simulé] à ${destinataires.join(', ')} | ${sujet}${lien ? ` | ${lien}` : ''}`);
      return { envoye: false, simule: true };
    }
    let vers = destinataires;
    if (env.EMAIL_TEST_MODE === 'true') {
      if (!env.EMAIL_TEST_RECIPIENT) {
        journal("[courriel] mode d'essai sans EMAIL_TEST_RECIPIENT : envoi annulé");
        return { envoye: false };
      }
      sujet = `[TEST → ${destinataires.join(', ')}] ${sujet}`;
      vers = [env.EMAIL_TEST_RECIPIENT];
    }
    try {
      await envoyer({ from: expediteur, to: vers, subject: sujet, html: enveloppe(corps), replyTo: REPONSE });
      return { envoye: true };
    } catch (err) {
      journal(`[courriel] envoi impossible (${sujet}) : ${err.message}`);
      return { envoye: false };
    }
  }

  return {
    lienProposer({ a, lien, nomFiche }) {
      const quoi = nomFiche ? `modifier la fiche ${nomFiche}` : 'proposer une ressource';
      return expedier({
        a, lien, objet: `Votre lien pour ${quoi}`,
        corps: p('Bonjour,') + p(`Voici votre lien pour ${echapper(quoi)} dans la cartographie du RSN.`)
          + bouton(lien, 'Ouvrir le formulaire')
          + petit("Ce lien est valable 24 heures et sert pour une seule proposition. Si vous n'avez pas fait cette demande, ignorez ce courriel."),
      });
    },
    propositionRecue({ a, titre }) {
      return expedier({
        a, objet: 'Proposition reçue',
        corps: p('Bonjour,') + p(`Nous avons bien reçu votre proposition : <strong>${echapper(titre)}</strong>.`)
          + p("Elle sera examinée par une personne de l'équipe. Vous recevrez un courriel dès qu'une décision sera prise.")
          + p("Merci de contribuer à la cartographie,<br>L'équipe du RSN"),
      });
    },
    // Une fois par semaine, à chaque approbateur : ce qui attend dans le panneau. Rien ne part s'il n'y a rien.
    resumeHebdomadaire({ a, propositions, lienPanneau }) {
      const liste = (propositions || []).filter((x) => x && x.titre);
      if (!liste.length) return Promise.resolve({ envoye: false });
      const n = liste.length;
      const lignes = liste.slice(0, 30).map((x) => {
        const quand = jourEnClair(x.proposeLe);
        return `<li style="margin:0 0 6px;">${echapper(x.titre)}${quand ? ` <span style="color:#64748b;">(reçue le ${echapper(quand)})</span>` : ''}</li>`;
      }).join('');
      const reste = n > 30 ? p(`… et ${n - 30} autres.`) : '';
      return expedier({
        a, lien: lienPanneau, objet: `${n} proposition${n > 1 ? 's' : ''} à examiner dans la cartographie`,
        corps: p('Bonjour,')
          + p(n > 1 ? `${n} propositions attendent une décision dans le panneau de la cartographie :` : 'Une proposition attend une décision dans le panneau de la cartographie :')
          + `<ul style="margin:0 0 16px;padding-left:20px;">${lignes}</ul>` + reste
          + bouton(lienPanneau, 'Ouvrir le panneau')
          + petit("Ce résumé est envoyé une fois par semaine, seulement quand des propositions attendent. Pour ne plus le recevoir, écrivez à l'équipe du RSN."),
      });
    },
    approuvee({ a, nom, lienFiche }) {
      return expedier({
        a, lien: lienFiche, objet: `Proposition approuvée : ${nom}`,
        corps: p('Bonjour,') + p(`Votre proposition pour <strong>${echapper(nom)}</strong> a été approuvée. Merci !`)
          + bouton(lienFiche, 'Voir la fiche')
          + petit('Le changement apparaît sur le site en quelques minutes.'),
      });
    },
    refusee({ a, titre, commentaire }) {
      return expedier({
        a, objet: `Proposition non retenue : ${titre}`,
        corps: p('Bonjour,') + p(`Votre proposition <strong>${echapper(titre)}</strong> n'a pas été retenue.`)
          + p(`Commentaire de la personne qui l'a examinée :<br><em>${multiligne(commentaire)}</em>`)
          + p('Vous pouvez répondre à ce courriel pour en discuter, ou faire une nouvelle proposition.'),
      });
    },
    lienPanneau({ a, lien }) {
      return expedier({
        a, lien, objet: "Votre lien vers le panneau d'approbation",
        corps: p('Bonjour,') + p("Voici votre lien pour entrer dans le panneau d'approbation de la cartographie.")
          + bouton(lien, 'Entrer dans le panneau')
          + petit("Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez ce courriel."),
      });
    },
  };
}

module.exports = { creerCourriels };
