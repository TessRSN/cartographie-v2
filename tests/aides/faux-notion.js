/**
 * Faux Notion en mémoire pour les essais : des pages rangées par base, avec leurs propriétés
 * et un bloc de code dans le corps. Les filtres compris : « relation contient », « choix égal »,
 * « choix différent », et leurs combinaisons « et » / « ou ».
 * pannes : par nom d'appel, vrai (toujours en panne) ou une fonction des arguments.
 * uuid : vrai pour des identifiants de page à la forme de ceux de Notion.
 * figerListes() : à partir de là, « databases.query » rend les pages telles qu'elles étaient à cet
 * instant (une liste périmée, comme Notion en rend juste après une écriture), alors que
 * « pages.retrieve » rend toujours la page à jour. degelerListes() remet les listes à jour.
 */
function fauxNotion({ pannes = {}, uuid = false } = {}) {
  const pages = new Map(); const blocs = new Map(); const appels = []; let n = 0;
  let figees = null;
  const lu = (segments) => (segments || []).map((s) => ({ ...s, plain_text: s.text.content }));
  const noter = (nom, args) => {
    appels.push({ nom, args });
    const panne = pannes[nom];
    if (typeof panne === 'function' ? panne(args) : panne) throw new Error(`${nom} en panne`);
  };
  const lisible = (page) => {
    const properties = {};
    for (const [nom, p] of Object.entries(page.properties)) {
      properties[nom] = p.title ? { title: lu(p.title) } : p.rich_text ? { rich_text: lu(p.rich_text) } : p;
    }
    return { ...page, properties };
  };
  const retient = (page, filtre) => {
    if (!filtre) return true;
    if (Array.isArray(filtre.and)) return filtre.and.every((f) => retient(page, f));
    if (Array.isArray(filtre.or)) return filtre.or.some((f) => retient(page, f));
    const p = page.properties[filtre.property] || {};
    if (filtre.relation && Object.hasOwn(filtre.relation, 'contains')) return (p.relation || []).some((r) => r.id === filtre.relation.contains);
    if (filtre.select && Object.hasOwn(filtre.select, 'equals')) return !!p.select && p.select.name === filtre.select.equals;
    if (filtre.select && Object.hasOwn(filtre.select, 'does_not_equal')) return !p.select || p.select.name !== filtre.select.does_not_equal;
    return true;
  };
  const client = {
    pages: {
      async create({ parent, properties, children }) {
        noter('pages.create', { parent, properties, children });
        n += 1;
        const id = uuid ? `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` : `page-${n}`;
        pages.set(id, { id, parent, properties: JSON.parse(JSON.stringify(properties)) });
        blocs.set(id, (children || []).map((b, i) => ({ ...JSON.parse(JSON.stringify(b)), id: `${id}-bloc-${i}` })));
        return { id };
      },
      async retrieve({ page_id }) {
        noter('pages.retrieve', page_id);
        const page = pages.get(page_id);
        if (!page) { const erreur = new Error('absent'); erreur.code = 'object_not_found'; throw erreur; }
        return lisible(page);
      },
      async update({ page_id, properties }) {
        noter('pages.update', { page_id, properties });
        const page = pages.get(page_id);
        if (!page) throw new Error('page absente');
        Object.assign(page.properties, JSON.parse(JSON.stringify(properties)));
        return { id: page_id };
      },
    },
    blocks: {
      children: {
        async list({ block_id }) {
          noter('blocks.children.list', block_id);
          return { results: (blocs.get(block_id) || []).map((b) => ({ ...b, code: { ...b.code, rich_text: lu(b.code.rich_text) } })), has_more: false };
        },
      },
      async update({ block_id, code }) {
        noter('blocks.update', { block_id, code });
        for (const liste of blocs.values()) for (const b of liste) if (b.id === block_id) b.code = JSON.parse(JSON.stringify(code));
        return {};
      },
    },
    databases: {
      async query({ database_id, filter, sorts }) {
        noter('databases.query', { database_id, filter, sorts });
        const results = [...(figees || pages.values())].filter((p) => p.parent.database_id === database_id && retient(p, filter)).map(lisible);
        return { results, has_more: false };
      },
    },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  const figerListes = () => { figees = JSON.parse(JSON.stringify([...pages.values()])); };
  const degelerListes = () => { figees = null; };
  return { client, pages, blocs, appels, de, figerListes, degelerListes };
}

module.exports = { fauxNotion };
