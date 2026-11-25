/**
 * L'équipe du panneau, tenue depuis le panneau : la liste des personnes qui ont accès, inviter,
 * changer un rôle, retirer un accès, régler le résumé hebdomadaire.
 * Tout se passe dans la base Notion « Approbateurs » : inviter y crée une ligne (ou réactive celle
 * d'une personne retirée), retirer décoche « Actif » sans rien supprimer.
 * Les garde-fous sont ici, pas seulement dans la route : seule l'Administration invite, change un
 * rôle ou retire ; personne ne change son propre rôle ni ne se retire ; il reste toujours au moins
 * une personne active en Administration. Chaque geste prend le verrou de l'équipe et relit
 * l'équipe sous ce verrou : deux gestes faits au même moment se suivent au lieu de se croiser.
 * La liste d'une base Notion peut retarder de quelques secondes sur une écriture : sous le verrou,
 * la ligne de la personne qui agit et celle de la personne visée sont donc relues une à une, par
 * une lecture directe de la page, avant tout contrôle.
 * Une personne est désignée par un repère opaque et stable : jamais par un identifiant Notion.
 */
const { segments } = require('./notion');
const { signer, normaliserCourriel } = require('./jetons');
const { COLONNES_APPROBATEUR: C, ROLES, roleDeLigne } = require('./propositions');
const { opaqueDe } = require('./ressources');
const { verrousEnMemoire } = require('./approbation');
const { lireModeEssai } = require('./reglages');

const NOM_MAX = 200;
const ESSAIS_VERROU = 8;
const PAUSE_VERROU_MS = 250;
const CLE_VERROU = 'equipe';
const FORME_REPERE = /^~[0-9a-f]{24}$/;
const MESSAGES = {
  courriel: "Cette adresse courriel n'a pas la bonne forme.",
  nom: 'Donnez le nom de la personne.',
  nomLong: `Le nom ne peut pas dépasser ${NOM_MAX} caractères.`,
  role: 'Choisissez un rôle : Administration, Approbation ou Lecture seule.',
  dejaInscrite: 'Cette adresse a déjà accès au panneau.',
  resume: 'Dites si la personne reçoit le résumé, par oui ou par non.',
};

const reperePersonneValide = (repere) => typeof repere === 'string' && FORME_REPERE.test(repere);
const texteDe = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.plain_text || '').join('');
const parNom = (a, b) => String(a.nom || a.courriel).localeCompare(String(b.nom || b.courriel), 'fr') || String(a.courriel).localeCompare(String(b.courriel));

// Le nombre de personnes actives en Administration une fois le changement fait sur une ligne.
function administrationApres(lignes, pageId, changement) {
  return lignes.map((l) => (l.pageId === pageId ? { ...l, ...changement } : l)).filter((l) => l.actif && l.role === 'administration').length;
}

function creerEquipe({
  client, env = process.env, courriels, limites = null, reglages = null, verrous = verrousEnMemoire(), secret = env.JWT_SECRET,
  journal = console.error, attendre = () => new Promise((suite) => setTimeout(suite, PAUSE_VERROU_MS)),
}) {
  const repereDe = opaqueDe('personne', secret || '');
  const refus = (code, extra = {}) => ({ ok: false, code, ...extra });
  // Le mode d'essai des courriels en vigueur : la même décision que celle de l'envoi (la valeur du
  // panneau, sinon EMAIL_TEST_MODE). Ne lève jamais.
  const enEssai = async () => (await lireModeEssai(reglages, env)).actif;

  // Toutes les lignes lisibles de la base, actives ou non.
  async function lireLignes() {
    const pages = []; let curseur;
    do {
      const reponse = await client.databases.query({ database_id: env.NOTION_DB_APPROBATEURS, page_size: 100, start_cursor: curseur });
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    return pages.map(ligneDe).filter(Boolean);
  }
  // Une ligne de la base, ou null si la page n'en est pas une (à la corbeille, ou sans courriel).
  function ligneDe(page) {
    if (!page || page.archived || page.in_trash) return null;
    const p = page.properties || {};
    const courriel = normaliserCourriel((p[C.courriel] || {}).email);
    if (!courriel) return null;
    return {
      pageId: page.id, nom: texteDe(p[C.nom]).trim(), courriel, role: roleDeLigne(p[C.role]),
      actif: !!(p[C.actif] && p[C.actif].checkbox), resume: !(p[C.sansResume] && p[C.sansResume].checkbox),
    };
  }
  // Les lignes voulues, relues une à une par une lecture directe, remplacent celles de la liste :
  // la liste d'une base peut être périmée, la lecture d'une page ne l'est pas.
  async function rafraichir(lignes, voulue) {
    let fraiches = lignes;
    for (const { pageId } of lignes.filter(voulue)) {
      const relue = ligneDe(await client.pages.retrieve({ page_id: pageId }));
      fraiches = relue ? fraiches.map((l) => (l.pageId === pageId ? { ...relue, pageId } : l)) : fraiches.filter((l) => l.pageId !== pageId);
    }
    return fraiches;
  }
  const vue = (l, moi) => ({ id: repereDe(l.pageId), nom: l.nom, courriel: l.courriel, role: l.role, resume: l.resume, moi: l.courriel === moi });

  // Les personnes actives, par ordre de nom. « moi » marque la ligne de la personne qui regarde.
  async function lister({ moi } = {}) {
    const qui = normaliserCourriel(moi);
    return (await lireLignes()).filter((l) => l.actif).sort(parNom).map((l) => vue(l, qui));
  }

  // Le cadre commun des gestes : le verrou de l'équipe, la relecture, puis la personne qui agit.
  // visee(ligne) : vrai pour la ligne de la personne visée, relue directement comme celle de la
  // personne qui agit. geste(lignes, acteur) : acteur est la ligne active de la personne qui agit, ou null.
  async function sousVerrou(par, visee, geste) {
    let pris = false;
    try {
      for (let essai = 1; essai <= ESSAIS_VERROU && !pris; essai++) {
        pris = await verrous.prendreVerrou(CLE_VERROU);
        if (!pris && essai < ESSAIS_VERROU) await attendre();
      }
    } catch (err) {
      journal('[équipe] verrou impossible :', err.message);
      return refus('notion');
    }
    if (!pris) return refus('occupee');
    try {
      const qui = normaliserCourriel(par);
      const lignes = await rafraichir(await lireLignes(), (l) => (!!qui && l.courriel === qui) || visee(l));
      const acteur = qui ? lignes.find((l) => l.actif && l.courriel === qui) || null : null;
      return await geste(lignes, acteur);
    } catch (err) {
      journal('[équipe] geste impossible :', err.message);
      return refus('notion');
    } finally {
      try { await verrous.rendreVerrou(CLE_VERROU); } catch (err) { journal('[équipe] verrou non rendu :', err.message); }
    }
  }
  const administre = (acteur) => !!acteur && acteur.role === 'administration';
  // La ligne que désigne un repère, active ou non : pour la relire avant de savoir si elle est active.
  const viseePar = (repere) => (l) => reperePersonneValide(repere) && repereDe(l.pageId) === repere;
  const designee = (lignes, repere) => (reperePersonneValide(repere) ? lignes.find((l) => l.actif && repereDe(l.pageId) === repere) || null : null);

  // Le lien d'entrée, le même que celui que la personne demanderait elle-même, sous la même limite
  // que /api/lien (par adresse et par IP, sans le plafond du jour). Ne lève jamais.
  async function envoyerLien(courriel, origine, ip, nom) {
    try {
      if (!origine || !courriels) return false;
      if (limites && !(await limites.autoriserLien({ courriel, ip, plafondDuJour: false }))) return false;
      const lien = `${origine}/admin?jeton=${signer('panneau', { courriel }, { secret })}`;
      const envoi = await courriels.lienPanneau({ a: courriel, lien, destinataire: nom || '' });
      return !!(envoi && envoi.envoye);
    } catch (err) {
      journal("[équipe] lien d'entrée non envoyé :", err.message);
      return false;
    }
  }

  // Inviter : la ligne d'abord, le courriel ensuite. Si le courriel ne part pas (panne, ou limite
  // des liens atteinte), la personne reste inscrite (« courriel: false ») : elle peut demander son
  // lien elle-même sur la page d'entrée.
  // « essai: true » : le mode d'essai des courriels est actif, le lien est parti à l'adresse d'essai
  // et non à la personne invitée. L'adresse d'essai elle-même ne sort pas d'ici.
  async function inviter({ courriel, nom, role, par, origine = '', ip = '' }) {
    const adresse = normaliserCourriel(courriel);
    const retour = await sousVerrou(par, (l) => !!adresse && l.courriel === adresse, async (lignes, acteur) => {
      if (!administre(acteur)) return refus('role');
      const propre = typeof nom === 'string' ? nom.replace(/\s+/g, ' ').trim() : '';
      const erreurs = {};
      if (!adresse) erreurs.courriel = MESSAGES.courriel;
      if (!propre) erreurs.nom = MESSAGES.nom; else if (propre.length > NOM_MAX) erreurs.nom = MESSAGES.nomLong;
      if (typeof role !== 'string' || !Object.hasOwn(ROLES, role)) erreurs.role = MESSAGES.role;
      if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
      if (lignes.some((l) => l.actif && l.courriel === adresse)) return refus('deja-inscrite', { erreurs: { courriel: MESSAGES.dejaInscrite } });
      const ancienne = lignes.find((l) => l.courriel === adresse);
      const commun = { [C.nom]: { title: segments(propre) }, [C.actif]: { checkbox: true }, [C.role]: { select: { name: ROLES[role] } } };
      let pageId;
      if (ancienne) {
        pageId = ancienne.pageId;
        await client.pages.update({ page_id: pageId, properties: commun });
      } else {
        // Le résumé hebdomadaire parle des décisions à prendre : une personne en lecture seule ne le reçoit pas au départ.
        const page = await client.pages.create({
          parent: { database_id: env.NOTION_DB_APPROBATEURS },
          properties: { ...commun, [C.courriel]: { email: adresse }, [C.sansResume]: { checkbox: role === 'lecture' } },
        });
        pageId = page.id;
      }
      return { ok: true, id: repereDe(pageId), nom: propre, role, reactivee: !!ancienne, adresse };
    });
    if (!retour.ok) return retour;
    const { adresse: inscrite, ...reste } = retour;
    return { ...reste, courriel: await envoyerLien(inscrite, origine, ip, reste.nom), ...((await enEssai()) ? { essai: true } : {}) };
  }

  async function changerRole({ personne, role, par }) {
    return sousVerrou(par, viseePar(personne), async (lignes, acteur) => {
      if (!administre(acteur)) return refus('role');
      if (typeof role !== 'string' || !Object.hasOwn(ROLES, role)) return refus('invalide', { erreurs: { role: MESSAGES.role } });
      const cible = designee(lignes, personne);
      if (!cible) return refus('introuvable');
      if (cible.courriel === acteur.courriel) return refus('soi-meme');
      if (administrationApres(lignes, cible.pageId, { role }) < 1) return refus('derniere-administration');
      if (cible.role !== role) await client.pages.update({ page_id: cible.pageId, properties: { [C.role]: { select: { name: ROLES[role] } } } });
      return { ok: true, id: personne, nom: cible.nom, role, ...(cible.role === role ? { inchange: true } : {}) };
    });
  }

  async function retirer({ personne, par }) {
    return sousVerrou(par, viseePar(personne), async (lignes, acteur) => {
      if (!administre(acteur)) return refus('role');
      const cible = designee(lignes, personne);
      if (!cible) return refus('introuvable');
      if (cible.courriel === acteur.courriel) return refus('soi-meme');
      if (administrationApres(lignes, cible.pageId, { actif: false }) < 1) return refus('derniere-administration');
      await client.pages.update({ page_id: cible.pageId, properties: { [C.actif]: { checkbox: false } } });
      return { ok: true, id: personne, nom: cible.nom };
    });
  }

  // Chaque personne règle son propre résumé ; l'Administration, celui de tout le monde.
  async function reglerResume({ personne, actif, par }) {
    return sousVerrou(par, viseePar(personne), async (lignes, acteur) => {
      if (!acteur) return refus('role');
      const cible = designee(lignes, personne);
      if (!administre(acteur) && !(cible && cible.courriel === acteur.courriel)) return refus('role');
      if (!cible) return refus('introuvable');
      if (typeof actif !== 'boolean') return refus('invalide', { erreurs: { resume: MESSAGES.resume } });
      if (cible.resume !== actif) await client.pages.update({ page_id: cible.pageId, properties: { [C.sansResume]: { checkbox: !actif } } });
      return { ok: true, id: personne, nom: cible.nom, resume: actif, ...(cible.resume === actif ? { inchange: true } : {}) };
    });
  }

  return { lister, inviter, changerRole, retirer, reglerResume };
}

module.exports = { creerEquipe, reperePersonneValide, administrationApres };
