/**
 * La file des propositions et la liste des approbateurs, dans deux bases Notion.
 * Une ligne par proposition ; les champs proposés sont écrits en JSON dans un bloc de code
 * du corps de la page, parce qu'une colonne de texte Notion est limitée à 2 000 caractères.
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
  decidePar: 'Décidé par',                      // email
  decideLe: 'Décidé le',                        // date
  commentaire: 'Commentaire de décision',       // rich_text
};
const COLONNES_APPROBATEUR = { nom: 'Nom', courriel: 'Courriel', actif: 'Actif' };

const GENRES = { nouvelle: 'Nouvelle ressource', modification: 'Modification', rsn: 'À remplir par le RSN' };
const STATUTS = { attente: 'En attente', approuvee: 'Approuvée', refusee: 'Refusée' };
const LIENS = { responsable: 'Responsable', 'jy-travaille': "J'y travaille", aucun: 'Aucun' };

const cleDe = (table, libelle) => Object.keys(table).find((cle) => table[cle] === libelle) || null;
const texteDe = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.plain_text || '').join('');
const choixDe = (prop) => (prop && prop.select && prop.select.name) || null;
const dateDe = (prop) => (prop && prop.date && prop.date.start) || null;
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
    decidePar: (p[COLONNES.decidePar] && p[COLONNES.decidePar].email) || null,
    decideLe: dateDe(p[COLONNES.decideLe]),
    commentaire: texteDe(p[COLONNES.commentaire]),
  };
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

  async function approbateursActifs() {
    const pages = await interroger(env.NOTION_DB_APPROBATEURS);
    return pages
      .filter((page) => page.properties[COLONNES_APPROBATEUR.actif] && page.properties[COLONNES_APPROBATEUR.actif].checkbox)
      .map((page) => normaliserCourriel((page.properties[COLONNES_APPROBATEUR.courriel] || {}).email))
      .filter(Boolean);
  }

  return {
    async creerProposition({ genre, ficheId, courriel, nomProposant, lienAvecRessource, titre, contenu }) {
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

    // statut : 'attente' (de la plus ancienne à la plus récente) ou 'tranchees' (la dernière décision d'abord).
    async listerPropositions({ statut = 'attente' } = {}) {
      const enAttente = statut === 'attente';
      const pages = await interroger(env.NOTION_DB_PROPOSITIONS, {
        filter: { property: COLONNES.statut, select: enAttente ? { equals: STATUTS.attente } : { does_not_equal: STATUTS.attente } },
        sorts: [enAttente ? { property: COLONNES.proposeLe, direction: 'ascending' } : { property: COLONNES.decideLe, direction: 'descending' }],
      });
      return pages.map(resumeDepuisPage);
    },

    async enAttenteSur(ficheId) {
      const pages = await interroger(env.NOTION_DB_PROPOSITIONS, {
        filter: { and: [
          { property: COLONNES.statut, select: { equals: STATUTS.attente } },
          { property: COLONNES.ficheVisee, relation: { contains: ficheId } },
        ] },
      });
      return pages.length > 0;
    },

    // Le contenu est écrit d'abord, le statut en dernier : tant que le statut n'a pas changé,
    // la proposition reste « En attente » et la décision peut être rejouée.
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

    approbateursActifs,
    async estApprobateur(courriel) {
      const normalise = normaliserCourriel(courriel);
      return !!normalise && (await approbateursActifs()).includes(normalise);
    },
  };
}

module.exports = { creerPropositions, COLONNES, COLONNES_APPROBATEUR, GENRES, STATUTS, LIENS };
