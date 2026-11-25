/**
 * Faux Notion en mémoire pour les essais : des pages rangées par base, avec leurs propriétés
 * et un bloc de code dans le corps. Seul le filtre « relation contient » est compris.
 */
function fauxNotion({ pannes = {} } = {}) {
  const pages = new Map(); const blocs = new Map(); const appels = []; let n = 0;
  const lu = (segments) => (segments || []).map((s) => ({ ...s, plain_text: s.text.content }));
  const noter = (nom, args) => { appels.push({ nom, args }); if (pannes[nom]) throw new Error(`${nom} en panne`); };
  const lisible = (page) => {
    const properties = {};
    for (const [nom, p] of Object.entries(page.properties)) {
      properties[nom] = p.title ? { title: lu(p.title) } : p.rich_text ? { rich_text: lu(p.rich_text) } : p;
    }
    return { ...page, properties };
  };
  const retient = (page, filtre) => {
    if (!filtre) return true;
    if (filtre.relation && Object.hasOwn(filtre.relation, 'contains')) {
      return ((page.properties[filtre.property] || {}).relation || []).some((r) => r.id === filtre.relation.contains);
    }
    return true;
  };
  const client = {
    pages: {
      async create({ parent, properties, children }) {
        noter('pages.create', { parent, properties, children });
        const id = `page-${++n}`;
        pages.set(id, { id, parent, properties: JSON.parse(JSON.stringify(properties)) });
        blocs.set(id, (children || []).map((b, i) => ({ ...JSON.parse(JSON.stringify(b)), id: `${id}-bloc-${i}` })));
        return { id };
      },
    },
    blocks: {
      children: {
        async list({ block_id }) {
          noter('blocks.children.list', block_id);
          return { results: (blocs.get(block_id) || []).map((b) => ({ ...b, code: { ...b.code, rich_text: lu(b.code.rich_text) } })), has_more: false };
        },
      },
    },
    databases: {
      async query({ database_id, filter, sorts }) {
        noter('databases.query', { database_id, filter, sorts });
        const results = [...pages.values()].filter((p) => p.parent.database_id === database_id && retient(p, filter)).map(lisible);
        return { results, has_more: false };
      },
    },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  return { client, pages, blocs, appels, de };
}

module.exports = { fauxNotion };
