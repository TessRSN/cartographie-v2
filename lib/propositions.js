/**
 * La file des propositions et la liste des approbateurs, dans deux bases Notion.
 * Une ligne par proposition ; les champs proposés sont écrits en JSON dans un bloc de code
 * du corps de la page, parce qu'une colonne de texte Notion est limitée à 2 000 caractères.
 * Les avis de l'équipe sont dans le même bloc, sous la clé « avis ».
 * Une proposition tranchée n'est jamais effacée : c'est l'historique des fiches.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');

const COLONNES = {
  titre: 'Titre',                               // title
  genre: 'Genre',                               // select
  ficheVisee: 'Fiche visée',                    // relation -> Ressources
  proposePar: 'Proposé par',                    // email
  nomProposant: 'Nom du proposant',             // rich_text
  lienAvecRessource: 'Lien avec la ressource',  // select
  proposeLe: 'Proposé le',                      // date
  statut: 'Statut',                             // select
  verificationLe: 'Mise en vérification le',    // date
  decidePar: 'Décidé par',                      // email
  decideLe: 'Décidé le',                        // date
  commentaire: 'Commentaire de décision',       // rich_text
  logoPropose: 'Logo proposé',                  // files (image jointe à la proposition)
};
// « Sans résumé hebdomadaire » : case cochée par qui ne veut pas du courriel de la semaine.
// Colonne absente ou case vide : la personne le reçoit.
// « Rôle » : ce que la personne peut faire dans le panneau. Case « Actif » décochée : aucun accès.
const COLONNES_APPROBATEUR = { nom: 'Nom', courriel: 'Courriel', actif: 'Actif', sansResume: 'Sans résumé hebdomadaire', role: 'Rôle' };

const GENRES = { nouvelle: 'Nouvelle ressource', modification: 'Modification', rsn: 'À remplir par le RSN' };
const STATUTS = { attente: 'En attente', verification: 'En vérification', approuvee: 'Approuvée', refusee: 'Refusée' };
const ROLES = { administration: 'Administration', approbation: 'Approbation', lecture: 'Lecture seule' };
const SENS_AVIS = ['favorable', 'defavorable'];
const LIENS = { responsable: 'Responsable', 'jy-travaille': "J'y travaille", aucun: 'Aucun' };

const cleDe = (table, libelle) => Object.keys(table).find((cle) => table[cle] === libelle) || null;
const texteDe = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.plain_text || '').join('');
const choixDe = (prop) => (prop && prop.select && prop.select.name) || null;
const dateDe = (prop) => (prop && prop.date && prop.date.start) || null;
// Le fichier déposé dans une colonne : son nom et son adresse temporaire (une heure), ou null.
function fichierDe(prop) {
  const fichier = ((prop && prop.files) || []).find((f) => f.type === 'file' && f.file && f.file.url);
  return fichier ? { nom: fichier.name || 'logo', url: fichier.file.url } : null;
}
const sansTirets = (id) => String(id || '').replace(/-/g, '');

function resumeDepuisPage(page) {
  const p = page.properties || {};
  const relation = (p[COLONNES.ficheVisee] && p[COLONNES.ficheVisee].relation) || [];
  return {
    id: page.id,
    genre: cleDe(GENRES, choixDe(p[COLONNES.genre])),
    ficheId: relation.length ? relation[0].id : null,
    courriel: (p[COLONNES.proposePar] && p[COLONNES.proposePar].email) || null,
    nomProposant: texteDe(p[COLONNES.nomProposant]),
    lienAvecRessource: cleDe(LIENS, choixDe(p[COLONNES.lienAvecRessource])),
    titre: texteDe(p[COLONNES.titre]),
    proposeLe: dateDe(p[COLONNES.proposeLe]),
    statut: cleDe(STATUTS, choixDe(p[COLONNES.statut])),
    verificationLe: dateDe(p[COLONNES.verificationLe]),
    decidePar: (p[COLONNES.decidePar] && p[COLONNES.decidePar].email) || null,
    decideLe: dateDe(p[COLONNES.decideLe]),
    commentaire: texteDe(p[COLONNES.commentaire]),
    logoPropose: fichierDe(p[COLONNES.logoPropose]),
  };
}

// Les avis lisibles d'un contenu de proposition : { courriel, nom, sens, commentaire, le }.
// Une entrée abîmée est écartée.
function avisDe(contenu) {
  const liste = contenu && Array.isArray(contenu.avis) ? contenu.avis : [];
  const avis = [];
  for (const a of liste) {
    if (!a || typeof a !== 'object' || !SENS_AVIS.includes(a.sens)) continue;
    const courriel = normaliserCourriel(a.courriel);
    if (!courriel) continue;
    avis.push({
      courriel, nom: typeof a.nom === 'string' ? a.nom : '', sens: a.sens,
      commentaire: typeof a.commentaire === 'string' ? a.commentaire : '', le: typeof a.le === 'string' ? a.le : null,
    });
  }
  return avis;
}

// Le rôle d'une ligne de la base « Approbateurs » : sans rôle, « approbation » (les lignes d'avant
// la colonne continuent de fonctionner) ; un libellé inconnu donne le moins de droits possible.
function roleDeLigne(prop) {
  const libelle = choixDe(prop);
  if (!libelle) return 'approbation';
  return cleDe(ROLES, libelle) || 'lecture';
}

function creerPropositions(client, env = process.env, { maintenant = Date.now } = {}) {
  const instant = () => new Date(maintenant()).toISOString();
  const blocJson = (contenu) => ({ rich_text: segments(JSON.stringify(contenu)), language: 'json' });

  async function interroger(database_id, requete = {}) {
    const pages = []; let curseur;
    do {
      const reponse = await client.databases.query({ database_id, page_size: 100, start_cursor: curseur, ...requete });
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    return pages.filter((page) => !page.archived && !page.in_trash);
  }

  // Le bloc de code qui porte le JSON, avec son contenu.
  async function lireBloc(pageId) {
    const reponse = await client.blocks.children.list({ block_id: pageId, page_size: 50 });
    const bloc = (reponse.results || []).find((b) => b.type === 'code');
    if (!bloc) return { blocId: null, contenu: null };
    const brut = (bloc.code.rich_text || []).map((s) => s.plain_text || '').join('');
    try { return { blocId: bloc.id, contenu: JSON.parse(brut) }; } catch (err) { return { blocId: bloc.id, contenu: null }; }
  }

  // Les personnes actives de l'équipe : nom, courriel, rôle, et si elles reçoivent le résumé de la semaine.
  async function equipe() {
    const pages = await interroger(env.NOTION_DB_APPROBATEURS);
    const personnes = [];
    for (const page of pages) {
      const p = page.properties || {};
      if (!(p[COLONNES_APPROBATEUR.actif] && p[COLONNES_APPROBATEUR.actif].checkbox)) continue;
      const courriel = normaliserCourriel((p[COLONNES_APPROBATEUR.courriel] || {}).email);
      if (!courriel) continue;
      personnes.push({
        nom: texteDe(p[COLONNES_APPROBATEUR.nom]).trim(), courriel, role: roleDeLigne(p[COLONNES_APPROBATEUR.role]),
        resume: !(p[COLONNES_APPROBATEUR.sansResume] && p[COLONNES_APPROBATEUR.sansResume].checkbox),
      });
    }
    return personnes;
  }

  async function approbateursActifs({ pourResume = false } = {}) {
    return (await equipe()).filter((personne) => !pourResume || personne.resume).map((personne) => personne.courriel);
  }

  // 'administration', 'approbation' ou 'lecture' ; null si la personne est absente ou inactive.
  async function roleDe(courriel) {
    const normalise = normaliserCourriel(courriel);
    if (!normalise) return null;
    const personne = (await equipe()).find((x) => x.courriel === normalise);
    return personne ? personne.role : null;
  }

  const egal = (statut) => ({ property: COLONNES.statut, select: { equals: STATUTS[statut] } });
  const OUVERTES = { or: [egal('attente'), egal('verification')] };

  return {
    async creerProposition({ genre, ficheId, courriel, nomProposant, lienAvecRessource, titre, contenu, logoDepot }) {
      const proprietes = {
        [COLONNES.titre]: { title: segments(String(titre).slice(0, 300)) },
        [COLONNES.genre]: { select: { name: GENRES[genre] } },
        [COLONNES.proposePar]: { email: courriel },
        [COLONNES.nomProposant]: { rich_text: segments(String(nomProposant || '').slice(0, 200)) },
        [COLONNES.lienAvecRessource]: { select: { name: LIENS[lienAvecRessource] || LIENS.aucun } },
        [COLONNES.proposeLe]: { date: { start: instant() } },
        [COLONNES.statut]: { select: { name: STATUTS.attente } },
      };
      if (ficheId) proprietes[COLONNES.ficheVisee] = { relation: [{ id: ficheId }] };
      if (logoDepot) proprietes[COLONNES.logoPropose] = { files: [{ type: 'file_upload', file_upload: { id: logoDepot.id }, name: logoDepot.nom }] };
      const page = await client.pages.create({
        parent: { database_id: env.NOTION_DB_PROPOSITIONS },
        properties: proprietes,
        children: [{ object: 'block', type: 'code', code: blocJson(contenu) }],
      });
      return page.id;
    },

    // La proposition complète, ou null si elle est introuvable ou d'une autre base.
    async lireProposition(id) {
      let page;
      try {
        page = await client.pages.retrieve({ page_id: id });
      } catch (err) {
        if (err && (err.code === 'object_not_found' || err.status === 404 || err.code === 'validation_error')) return null;
        throw err;
      }
      if (!page || page.archived || page.in_trash) return null;
      if (sansTirets(page.parent && page.parent.database_id) !== sansTirets(env.NOTION_DB_PROPOSITIONS)) return null;
      const { contenu } = await lireBloc(id);
      return { ...resumeDepuisPage(page), contenu };
    },

    // statut : un des quatre états ('attente', 'verification', 'approuvee', 'refusee'), 'ouvertes'
    // (en attente ou en vérification), 'tranchees' (approuvées ou refusées) ou 'toutes'.
    // Les propositions qui attendent vont de la plus ancienne à la plus récente ; les tranchées,
    // de la dernière décision à la plus ancienne. Le contenu n'est pas lu (voir lireContenus).
    async listerPropositions({ statut = 'attente' } = {}) {
      const parReception = [{ property: COLONNES.proposeLe, direction: 'ascending' }];
      const parDecision = [{ property: COLONNES.decideLe, direction: 'descending' }];
      let requete;
      if (statut === 'toutes') requete = { sorts: parReception };
      else if (statut === 'ouvertes') requete = { filter: OUVERTES, sorts: parReception };
      else if (statut === 'tranchees') {
        requete = { sorts: parDecision, filter: { and: [
          { property: COLONNES.statut, select: { does_not_equal: STATUTS.attente } },
          { property: COLONNES.statut, select: { does_not_equal: STATUTS.verification } },
        ] } };
      } else if (statut === 'approuvee' || statut === 'refusee') requete = { filter: egal(statut), sorts: parDecision };
      else requete = { filter: egal(statut === 'verification' ? 'verification' : 'attente'), sorts: parReception };
      return (await interroger(env.NOTION_DB_PROPOSITIONS, requete)).map(resumeDepuisPage);
    },

    // Le contenu (bloc JSON) de plusieurs propositions : une table identifiant → contenu, null
    // si le bloc est absent ou illisible. Trois lectures à la fois, pour ménager Notion.
    async lireContenus(ids) {
      const contenus = new Map();
      const file = [...new Set(ids)];
      const ouvrier = async () => {
        while (file.length) {
          const id = file.shift();
          contenus.set(id, (await lireBloc(id)).contenu);
        }
      };
      await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
      return contenus;
    },

    // Vrai si une proposition attend encore une décision sur cette fiche (en attente ou en vérification).
    async enAttenteSur(ficheId) {
      const pages = await interroger(env.NOTION_DB_PROPOSITIONS, {
        filter: { and: [OUVERTES, { property: COLONNES.ficheVisee, relation: { contains: ficheId } }] },
      });
      return pages.length > 0;
    },

    // Second regard demandé : la proposition passe « En vérification », sans décision.
    async marquerVerification(id) {
      await client.pages.update({ page_id: id, properties: {
        [COLONNES.statut]: { select: { name: STATUTS.verification } },
        [COLONNES.verificationLe]: { date: { start: instant() } },
      } });
    },

    // Enregistre l'avis d'une personne dans le bloc JSON : un seul avis par personne, le nouveau
    // remplace le sien. À appeler sous le verrou de la proposition. Renvoie la liste des avis.
    async ecrireAvis(id, { courriel, nom, sens, commentaire, le }) {
      const qui = normaliserCourriel(courriel);
      if (!qui || !SENS_AVIS.includes(sens)) throw new Error('avis invalide');
      const { blocId, contenu } = await lireBloc(id);
      // Sans contenu lisible, rien n'est écrit : réécrire le bloc effacerait la proposition.
      if (!blocId || !contenu || typeof contenu !== 'object' || Array.isArray(contenu)) throw new Error('contenu de la proposition illisible');
      const avis = [...avisDe(contenu).filter((a) => a.courriel !== qui), {
        courriel: qui, nom: String(nom || '').slice(0, 200), sens, commentaire: String(commentaire || '').slice(0, 1000), le: le || instant(),
      }];
      await client.blocks.update({ block_id: blocId, code: blocJson({ ...contenu, avis }) });
      return avis;
    },

    // Le contenu est écrit d'abord, le statut en dernier : tant que le statut n'a pas changé,
    // la proposition reste ouverte et la décision peut être rejouée.
    async marquerDecision(id, { statut, approbateur, commentaire, ficheId, applique }) {
      if (applique !== undefined) {
        const { blocId, contenu } = await lireBloc(id);
        if (blocId) await client.blocks.update({ block_id: blocId, code: blocJson({ ...(contenu || {}), applique }) });
      }
      const proprietes = {
        [COLONNES.statut]: { select: { name: STATUTS[statut] } },
        [COLONNES.decidePar]: { email: approbateur },
        [COLONNES.decideLe]: { date: { start: instant() } },
      };
      if (commentaire) proprietes[COLONNES.commentaire] = { rich_text: segments(String(commentaire).slice(0, 2000)) };
      if (ficheId) proprietes[COLONNES.ficheVisee] = { relation: [{ id: ficheId }] };
      await client.pages.update({ page_id: id, properties: proprietes });
    },

    // Relie la fiche qui vient d'être créée, sans changer le statut : si la décision ne
    // s'enregistre pas, la tentative suivante retrouve la fiche et ne la recrée pas.
    async lierFiche(id, ficheId) {
      await client.pages.update({ page_id: id, properties: { [COLONNES.ficheVisee]: { relation: [{ id: ficheId }] } } });
    },

    equipe,
    roleDe,
    approbateursActifs: () => approbateursActifs(),
    // Les personnes actives qui n'ont pas refusé le résumé hebdomadaire.
    approbateursAPrevenir: () => approbateursActifs({ pourResume: true }),
    // Vrai pour toute personne inscrite et active, quel que soit son rôle : elle peut entrer dans le panneau.
    async estApprobateur(courriel) {
      return (await roleDe(courriel)) !== null;
    },
    // Vrai si la personne peut donner un avis, demander un second regard, approuver ou refuser.
    async peutDecider(courriel) {
      const role = await roleDe(courriel);
      return role === 'approbation' || role === 'administration';
    },
  };
}

module.exports = { creerPropositions, avisDe, COLONNES, COLONNES_APPROBATEUR, GENRES, STATUTS, ROLES, SENS_AVIS, LIENS };
