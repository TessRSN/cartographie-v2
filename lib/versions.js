/**
 * L'historique des versions des fiches, dans la base Notion « Versions ».
 * Une ligne par changement de fiche ; le détail ({ changements, note }) est écrit en JSON dans
 * un bloc de code du corps de la page, comme pour les propositions. Rien n'est jamais effacé.
 * Sans le réglage NOTION_DB_VERSIONS, l'historique est vide et l'écriture est sautée : le reste
 * du panneau continue de fonctionner.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');
const pures = require('../public/js/versions.js');

const COLONNES = {
  titre: 'Titre',               // title
  fiche: 'Fiche',               // relation -> Ressources
  numero: 'Numéro',             // number
  faiteLe: 'Faite le',          // date
  faitePar: 'Faite par',        // email
  source: 'Source',             // select
  proposition: 'Proposition',   // relation -> Propositions
};
const SOURCES = { creation: 'Création', proposition: 'Proposition', panneau: 'Panneau', retablissement: 'Rétablissement' };
// Le verrou partagé d'une fiche : un seul changement à la fois, toutes instances confondues.
const cleVerrouFiche = (id) => `fiche:${id}`;

const cleDe = (table, libelle) => Object.keys(table).find((cle) => table[cle] === libelle) || null;
const relationDe = (prop) => { const liste = (prop && prop.relation) || []; return liste.length ? liste[0].id : null; };

function resumeDepuisPage(page) {
  const p = page.properties || {};
  const numero = p[COLONNES.numero] && typeof p[COLONNES.numero].number === 'number' ? p[COLONNES.numero].number : null;
  return {
    id: page.id,
    ficheId: relationDe(p[COLONNES.fiche]),
    numero,
    le: (p[COLONNES.faiteLe] && p[COLONNES.faiteLe].date && p[COLONNES.faiteLe].date.start) || null,
    par: normaliserCourriel((p[COLONNES.faitePar] || {}).email) || null,
    source: cleDe(SOURCES, p[COLONNES.source] && p[COLONNES.source].select && p[COLONNES.source].select.name),
    propositionId: relationDe(p[COLONNES.proposition]),
  };
}

function creerVersions(client, env = process.env, { maintenant = Date.now, journal = console.error } = {}) {
  const active = () => !!env.NOTION_DB_VERSIONS;

  async function interroger(requete = {}) {
    const pages = []; let curseur;
    do {
      const reponse = await client.databases.query({ database_id: env.NOTION_DB_VERSIONS, page_size: 100, start_cursor: curseur, ...requete });
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    // Une ligne sans fiche ou sans numéro n'est pas une version lisible.
    return pages.filter((page) => !page.archived && !page.in_trash).map(resumeDepuisPage)
      .filter((v) => v.ficheId && Number.isInteger(v.numero) && v.numero > 0);
  }
  const deLaFiche = (ficheId) => ({ filter: { property: COLONNES.fiche, relation: { contains: ficheId } } });

  // Le contenu du bloc de code d'une version, ou null s'il est absent ou illisible.
  async function lireContenu(pageId) {
    const reponse = await client.blocks.children.list({ block_id: pageId, page_size: 50 });
    const bloc = (reponse.results || []).find((b) => b.type === 'code');
    if (!bloc) return null;
    try {
      const contenu = JSON.parse((bloc.code.rich_text || []).map((s) => s.plain_text || '').join(''));
      return contenu && typeof contenu === 'object' && !Array.isArray(contenu) ? contenu : null;
    } catch (err) { return null; }
  }

  return {
    active,

    // Pour le tableau des fiches, d'un seul appel et sans lire aucun corps de page :
    // identifiant de fiche → { nombre de versions, dernier changement }.
    async compter() {
      const comptes = new Map();
      if (!active()) return comptes;
      for (const v of await interroger()) {
        const c = comptes.get(v.ficheId) || { nombre: 1, dernier: null, rang: 0 };
        c.nombre = Math.max(c.nombre, v.numero);
        if (v.numero >= c.rang) { c.rang = v.numero; c.dernier = { le: v.le, par: v.par, source: v.source }; }
        comptes.set(v.ficheId, c);
      }
      for (const [ficheId, { nombre, dernier }] of comptes) comptes.set(ficheId, { nombre, dernier });
      return comptes;
    },

    // Les versions d'une fiche, de la plus ancienne à la plus récente, avec leurs changements.
    async lister(ficheId) {
      if (!active() || !ficheId) return [];
      const lignes = (await interroger(deLaFiche(ficheId))).sort((a, b) => a.numero - b.numero || String(a.le).localeCompare(String(b.le)));
      const contenus = new Map();
      const file = lignes.map((v) => v.id);
      // Trois lectures à la fois, pour ménager Notion.
      const ouvrier = async () => { while (file.length) { const id = file.shift(); contenus.set(id, await lireContenu(id)); } };
      await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
      return lignes.map((v) => {
        const contenu = contenus.get(v.id);
        return {
          numero: v.numero, le: v.le, par: v.par, source: v.source, propositionId: v.propositionId,
          changements: pures.changementsLisibles(contenu && contenu.changements),
          note: contenu && typeof contenu.note === 'string' ? contenu.note : '',
          illisible: !contenu,
        };
      });
    },

    // Écrit une version. À appeler sous le verrou de la fiche, après l'écriture de la fiche.
    // Renvoie { ecrite: true, numero }, ou { ecrite: false, raison } si rien n'était à écrire
    // ('vide') ou si la base n'est pas réglée ('absente'). Une panne de Notion remonte en erreur.
    async ecrire({ ficheId, nom, source, par, changements, note = '', propositionId = null }) {
      if (!changements || !Object.keys(changements).length) return { ecrite: false, raison: 'vide' };
      if (!ficheId || !Object.hasOwn(SOURCES, source)) throw new Error('version invalide');
      if (!active()) {
        journal('[versions] base « Versions » absente (NOTION_DB_VERSIONS) : version non écrite pour', nom || ficheId);
        return { ecrite: false, raison: 'absente' };
      }
      const numero = pures.prochainNumero((await interroger(deLaFiche(ficheId))).map((v) => v.numero), source);
      const proprietes = {
        [COLONNES.titre]: { title: segments(`${String(nom || 'Fiche').slice(0, 250)}, version ${numero}`) },
        [COLONNES.fiche]: { relation: [{ id: ficheId }] },
        [COLONNES.numero]: { number: numero },
        [COLONNES.faiteLe]: { date: { start: new Date(maintenant()).toISOString() } },
        [COLONNES.source]: { select: { name: SOURCES[source] } },
      };
      const courriel = normaliserCourriel(par);
      if (courriel) proprietes[COLONNES.faitePar] = { email: courriel };
      if (propositionId) proprietes[COLONNES.proposition] = { relation: [{ id: propositionId }] };
      await client.pages.create({
        parent: { database_id: env.NOTION_DB_VERSIONS },
        properties: proprietes,
        children: [{ object: 'block', type: 'code', code: { rich_text: segments(JSON.stringify({ changements, note: String(note || '') })), language: 'json' } }],
      });
      return { ecrite: true, numero };
    },
  };
}

module.exports = { creerVersions, COLONNES, SOURCES, cleVerrouFiche, ...pures };
