/**
 * Les six courriels de la cartographie, en gabarits : un objet et un texte avec des repères entre
 * accolades, remplacés au moment de l'envoi. Fonctions pures, partagées par le serveur (l'envoi) et
 * par le panneau (l'aperçu) : l'aperçu est fait du même code que le courriel.
 *
 * Règles de rendu :
 * - des paragraphes séparés par une ligne vide ; un retour de ligne simple est gardé ;
 * - TOUT est échappé, le texte du gabarit comme les valeurs insérées : aucun HTML saisi ne passe ;
 * - un repère {lien} seul sur sa ligne devient le bouton du courriel ; ailleurs, l'adresse est
 *   écrite en clair, sans balise de lien ; ce qui suit le bouton s'affiche en plus petit ;
 * - l'objet reste sur une ligne, et {lien} n'y est jamais remplacé ;
 * - une valeur n'est jamais relue : des accolades dans un nom de fiche restent des accolades.
 */
(function (racine) {
'use strict';

const { echapper } = (typeof module !== 'undefined' && module.exports) ? require('./texte.js') : racine;

const REPONSE = 'rsn.gestion@rimuhc.ca';
const OBJET_MAX = 200;
const TEXTE_MAX = 5000;
const LISTE_MAX = 30;
const FORME_REPERE = /\{[^{}\n]*\}/g;

// Chaque repère, avec ce qu'il devient. « forme » : la balise que le code pose autour de la valeur.
const REPERES = {
  '{nom}': { aide: 'le nom de la personne qui reçoit le courriel, quand il est connu (sinon rien)' },
  '{ressource}': { aide: 'le nom de la ressource', forme: 'strong' },
  '{proposition}': { aide: 'le titre de la proposition, par exemple « Modification : CARTaGENE »', forme: 'strong' },
  '{commentaire}': { aide: 'le commentaire écrit au moment du refus', forme: 'em' },
  '{nombre de propositions}': { aide: 'le compte des propositions en attente, par exemple « 3 propositions »' },
  '{but du lien}': { aide: '« proposer une ressource », ou « modifier la fiche » suivi du nom de la fiche' },
  '{lien}': { aide: 'le lien ; seul sur sa ligne, il devient le bouton du courriel' },
};

// Les six courriels, dans l'ordre de l'écran. « requis » : les repères sans lesquels le texte est refusé.
// « bouton » : le libellé du bouton que devient {lien}. « quand » : {jour} est le jour du résumé.
const COURRIELS = [
  {
    id: 'lien', nom: 'Lien pour proposer', aQui: 'À la personne qui propose',
    quand: 'Quand une personne donne son adresse pour proposer une ressource ou modifier une fiche',
    bouton: 'Ouvrir le formulaire', reperes: ['{but du lien}', '{lien}'], requis: ['{lien}'],
    objet: 'Votre lien pour {but du lien}',
    texte: "Bonjour,\n\nVoici votre lien pour {but du lien} dans la cartographie du RSN.\n\n{lien}\n\nCe lien est valable 24 heures et sert pour une seule proposition. Si vous n'avez pas fait cette demande, ignorez ce courriel.",
  },
  {
    id: 'recue', nom: 'Proposition reçue', aQui: 'À la personne qui propose',
    quand: 'Dès que le formulaire est envoyé',
    bouton: null, reperes: ['{nom}', '{proposition}', '{ressource}'], requis: [],
    objet: 'Proposition reçue',
    texte: "Bonjour,\n\nNous avons bien reçu votre proposition : {proposition}.\n\nElle sera examinée par une personne de l'équipe. Vous recevrez un courriel dès qu'une décision sera prise.\n\nMerci de contribuer à la cartographie,\nL'équipe du RSN",
  },
  {
    id: 'approuvee', nom: 'Proposition approuvée', aQui: 'À la personne qui propose',
    quand: 'À l’approbation',
    bouton: 'Voir la fiche', reperes: ['{nom}', '{ressource}', '{lien}'], requis: ['{lien}'],
    objet: 'Proposition approuvée : {ressource}',
    texte: 'Bonjour,\n\nVotre proposition pour {ressource} a été approuvée. Merci !\n\n{lien}\n\nLe changement apparaît sur le site en quelques minutes.',
  },
  {
    id: 'refusee', nom: 'Proposition refusée', aQui: 'À la personne qui propose',
    quand: 'Au refus, avec le commentaire',
    bouton: null, reperes: ['{nom}', '{proposition}', '{ressource}', '{commentaire}'], requis: ['{commentaire}'],
    objet: 'Proposition non retenue : {proposition}',
    texte: "Bonjour,\n\nVotre proposition {proposition} n'a pas été retenue.\n\nCommentaire de la personne qui l'a examinée :\n{commentaire}\n\nVous pouvez répondre à ce courriel pour en discuter, ou faire une nouvelle proposition.",
  },
  {
    id: 'panneau', nom: 'Lien d’entrée du panneau', aQui: 'À la personne de l’équipe',
    quand: 'Quand une personne de l’équipe demande à entrer, ou vient d’être invitée',
    bouton: 'Entrer dans le panneau', reperes: ['{nom}', '{lien}'], requis: ['{lien}'],
    objet: "Votre lien vers le panneau d'approbation",
    texte: "Bonjour,\n\nVoici votre lien pour entrer dans le panneau d'approbation de la cartographie.\n\n{lien}\n\nCe lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez ce courriel.",
  },
  {
    id: 'resume', nom: 'Résumé hebdomadaire', aQui: 'Aux personnes de l’équipe qui le reçoivent',
    quand: 'Chaque {jour}, s’il y a des propositions en attente',
    bouton: 'Ouvrir le panneau', reperes: ['{nom}', '{nombre de propositions}', '{lien}'], requis: ['{lien}'],
    // La liste des propositions est ajoutée par le code, juste avant le bouton.
    liste: true,
    objet: '{nombre de propositions} à examiner dans la cartographie',
    texte: "Bonjour,\n\n{nombre de propositions} en attente d'une décision dans le panneau de la cartographie :\n\n{lien}\n\nCe résumé est envoyé une fois par semaine, seulement quand des propositions attendent. Pour ne plus le recevoir, écrivez à l'équipe du RSN.",
  },
];
const PAR_ID = Object.fromEntries(COURRIELS.map((c) => [c.id, c]));
const possede = (o, cle) => Object.prototype.hasOwnProperty.call(o, cle);
const courrielDe = (id) => (typeof id === 'string' && possede(PAR_ID, id) ? PAR_ID[id] : null);
// Le texte d'origine d'un courriel : celui qui part tant que le panneau n'en a pas enregistré un autre.
const origine = (id) => { const c = courrielDe(id); return c ? { objet: c.objet, texte: c.texte } : null; };

const MESSAGES = {
  forme: 'Ce texte n’a pas pu être lu.',
  inconnu: 'Ce courriel n’existe pas.',
  objetVide: 'Donnez un objet au courriel.',
  objetLong: `L’objet ne peut pas dépasser ${OBJET_MAX} caractères.`,
  texteVide: 'Écrivez le texte du courriel.',
  texteLong: 'Le texte ne peut pas dépasser 5 000 caractères.',
  reperesInconnus: (liste) => `${liste.length > 1 ? 'Ces repères n’existent pas' : 'Ce repère n’existe pas'} pour ce courriel : ${liste.join(', ')}. Retirez les accolades, ou choisissez un repère de la liste.`,
  lienDansObjet: 'Le repère {lien} ne va pas dans l’objet : mettez-le dans le texte.',
  requis: {
    '{lien}': 'Le texte doit garder le repère {lien} : sans lui, le courriel partirait sans son lien.',
    '{commentaire}': 'Le texte doit garder le repère {commentaire} : sans lui, la personne ne saurait pas pourquoi sa proposition est refusée.',
  },
};

const uneLigne = (texte) => String(texte === null || texte === undefined ? '' : texte).replace(/\s+/g, ' ').trim();
const sansCommandes = (texte) => texte.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
const reperesDe = (texte) => [...new Set(texte.match(FORME_REPERE) || [])];

/**
 * Vérifie un gabarit avant de l'enregistrer, et à chaque envoi. Renvoie
 * { ok, gabarit: { objet, texte } rangé (ou null), erreurs: { objet, texte } }.
 */
function valider(id, brut) {
  const c = courrielDe(id);
  if (!c) return { ok: false, gabarit: null, erreurs: { texte: MESSAGES.inconnu } };
  if (!brut || typeof brut !== 'object' || Array.isArray(brut) || typeof brut.objet !== 'string' || typeof brut.texte !== 'string') {
    return { ok: false, gabarit: null, erreurs: { texte: MESSAGES.forme } };
  }
  const objet = uneLigne(sansCommandes(brut.objet));
  const texte = sansCommandes(brut.texte.replace(/\r\n?/g, '\n')).replace(/[ \t]+$/gm, '').trim();
  const erreurs = {};
  const inconnus = (zone) => reperesDe(zone).filter((r) => !c.reperes.includes(r));
  if (!objet) erreurs.objet = MESSAGES.objetVide;
  else if (objet.length > OBJET_MAX) erreurs.objet = MESSAGES.objetLong;
  else if (inconnus(objet).length) erreurs.objet = MESSAGES.reperesInconnus(inconnus(objet));
  else if (objet.includes('{lien}')) erreurs.objet = MESSAGES.lienDansObjet;
  const manquant = c.requis.find((r) => !texte.includes(r));
  if (!texte) erreurs.texte = MESSAGES.texteVide;
  else if (texte.length > TEXTE_MAX) erreurs.texte = MESSAGES.texteLong;
  else if (inconnus(texte).length) erreurs.texte = MESSAGES.reperesInconnus(inconnus(texte));
  else if (manquant) erreurs.texte = MESSAGES.requis[manquant];
  const ok = !Object.keys(erreurs).length;
  return { ok, gabarit: ok ? { objet, texte } : null, erreurs };
}

/**
 * Le gabarit qui part : celui du panneau s'il existe et qu'il est valide, sinon le texte d'origine.
 * « lecture » : ce que rend la lecture du réglage « courriel.<id> ».
 * ignore : 'invalide' ou 'illisible' quand un texte enregistré a dû être écarté.
 */
function gabaritEnVigueur(id, lecture) {
  const depart = origine(id);
  const etat = lecture && lecture.etat;
  if (etat === 'present') {
    const v = valider(id, lecture.valeur);
    return v.ok ? { gabarit: v.gabarit, modifie: true, ignore: null } : { gabarit: depart, modifie: false, ignore: 'invalide' };
  }
  return { gabarit: depart, modifie: false, ignore: etat === 'illisible' ? 'illisible' : null };
}

// ─── Rendu ───
const paragraphe = (html) => `<p>${html}</p>`;
const petit = (html) => `<p style="font-size:0.85rem;color:#718096">${html}</p>`;
function bouton(lien, libelle) {
  return `<div style="text-align:center;margin:2rem 0"><a href="${echapper(lien)}" style="display:inline-block;padding:0.75rem 2rem;background:#0c2e53;color:#ffffff;text-decoration:none;border-radius:0.5rem;font-weight:600">${echapper(libelle)}</a></div>`
    + petit(`Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}`);
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// « 2026-11-20T15:00:00.000Z » → « 20 novembre », à l'heure du Québec.
function jourEnClair(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const [annee, mois, jour] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
  return annee ? `${Number(jour) === 1 ? '1er' : Number(jour)} ${MOIS[Number(mois) - 1]}` : '';
}
const nombreDePropositions = (n) => `${Number(n) || 0} proposition${Number(n) > 1 ? 's' : ''}`;
// La liste des propositions en attente du résumé hebdomadaire : trente lignes au plus.
function listePropositions(propositions) {
  const liste = (propositions || []).filter((x) => x && x.titre);
  if (!liste.length) return '';
  const lignes = liste.slice(0, LISTE_MAX).map((x) => {
    const quand = jourEnClair(x.proposeLe);
    return `<li style="margin:0 0 6px;">${echapper(x.titre)}${quand ? ` <span style="color:#64748b;">(reçue le ${echapper(quand)})</span>` : ''}</li>`;
  }).join('');
  return `<ul style="margin:0 0 16px;padding-left:20px;">${lignes}</ul>${liste.length > LISTE_MAX ? paragraphe(`… et ${liste.length - LISTE_MAX} autres.`) : ''}`;
}

// Remplace les repères d'un morceau de texte. valeurDe(repère) rend la valeur prête à écrire, ou
// null si le repère reste tel quel ; litteral() traite tout ce qui n'est pas une valeur.
// Une valeur vide emporte l'espace qui la précède : « Bonjour {nom}, » devient « Bonjour, ».
function remplir(texte, valeurDe, litteral) {
  let sortie = ''; let dernier = 0;
  for (const m of texte.matchAll(FORME_REPERE)) {
    let avant = texte.slice(dernier, m.index);
    const rendu = valeurDe(m[0]);
    if (rendu === null) sortie += litteral(avant + m[0]);
    else {
      if (rendu === '') avant = avant.replace(/[ \t ]+$/, '');
      sortie += litteral(avant) + rendu;
    }
    dernier = m.index + m[0].length;
  }
  return sortie + litteral(texte.slice(dernier));
}

/**
 * Remplit un gabarit. valeurs : { '{repère}': texte }. propositions : la liste du résumé hebdomadaire.
 * Renvoie { objet (texte brut, sur une ligne), corps (HTML, à mettre dans l'enveloppe) }.
 */
function rendre(id, gabarit, valeurs, { propositions } = {}) {
  const c = courrielDe(id);
  if (!c) throw new Error('courriel inconnu');
  const v = valeurs || {};
  const brut = (r) => (c.reperes.includes(r) && possede(v, r) && v[r] !== null && v[r] !== undefined ? String(v[r]) : '');
  const connu = (r) => c.reperes.includes(r);

  const objet = uneLigne(remplir(String(gabarit.objet || ''), (r) => (connu(r) && r !== '{lien}' ? uneLigne(brut(r)) : null), (x) => x));

  const enHtml = (r) => {
    if (!connu(r)) return null;
    const valeur = brut(r).trim();
    if (!valeur) return '';
    const sur = echapper(valeur).replace(/\r?\n/g, '<br>');
    const forme = REPERES[r] && REPERES[r].forme;
    return forme ? `<${forme}>${sur}</${forme}>` : sur;
  };
  const lien = brut('{lien}').trim();
  const avecBouton = !!(c.bouton && connu('{lien}') && lien);
  const blocs = []; let lignes = []; let apresBouton = false;
  const clore = () => {
    const html = lignes.map((l) => remplir(l, enHtml, echapper)).filter((l) => l.trim()).join('<br>');
    lignes = [];
    if (html) blocs.push({ html: apresBouton ? petit(html) : paragraphe(html) });
  };
  for (const ligne of String(gabarit.texte || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!ligne.trim()) clore();
    else if (avecBouton && ligne.trim() === '{lien}') { clore(); blocs.push({ bouton: true, html: bouton(lien, c.bouton) }); apresBouton = true; }
    else lignes.push(ligne.trim());
  }
  clore();
  const liste = c.liste ? listePropositions(propositions) : '';
  if (liste) {
    const place = blocs.findIndex((b) => b.bouton);
    blocs.splice(place < 0 ? blocs.length : place, 0, { html: liste });
  }
  return { objet, corps: blocs.map((b) => b.html).join('') };
}

// L'enveloppe commune à tous les courriels : le titre, le corps, le pied avec l'adresse de réponse.
function enveloppe(corps) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:2rem;color:#1a202c">
<h2 style="color:#0c2e53;margin:0 0 1.5rem;text-align:center;font-size:1.15rem">Cartographie du Réseau santé numérique</h2>
${corps}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0">
<p style="font-size:0.75rem;color:#718096;text-align:center">Réseau santé numérique (RSN) · <a href="mailto:${REPONSE}" style="color:#718096">${REPONSE}</a></p>
</div>`;
}

// Des valeurs d'exemple, pour l'aperçu du panneau et pour « M'envoyer un essai ».
function exemple(id, site = 'https://cartographie.rsn.quebec') {
  const c = courrielDe(id);
  if (!c) return null;
  const base = String(site || '').replace(/\/+$/, '');
  const equipe = id === 'panneau' || id === 'resume';
  const propositions = [
    { titre: 'Nouvelle : Entrepôt de données d’exemple', proposeLe: '2026-11-20T15:00:00.000Z' },
    { titre: 'Modification : CARTaGENE', proposeLe: '2026-11-23T15:00:00.000Z' },
  ];
  const toutes = {
    '{nom}': equipe ? 'Maxime' : 'Sandrine',
    '{ressource}': 'CARTaGENE',
    '{proposition}': 'Modification : CARTaGENE',
    '{commentaire}': 'Le lien proposé ne mène pas à la ressource. Pouvez-vous le vérifier ?',
    '{nombre de propositions}': nombreDePropositions(propositions.length),
    '{but du lien}': 'modifier la fiche CARTaGENE',
    '{lien}': `${base}${{ lien: '/proposer?fiche=cartagene&jeton=exemple', approuvee: '/ressource/cartagene', panneau: '/admin?jeton=exemple', resume: '/admin' }[id] || '/'}`,
  };
  return { valeurs: Object.fromEntries(c.reperes.map((r) => [r, toutes[r]])), ...(c.liste ? { propositions } : {}) };
}

const api = { COURRIELS, REPERES, REPONSE, OBJET_MAX, TEXTE_MAX, courrielDe, origine, valider, gabaritEnVigueur, rendre, enveloppe, exemple, nombreDePropositions, jourEnClair };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else racine.Gabarits = api;
})(typeof window !== 'undefined' ? window : globalThis);
