const test = require('node:test');
const assert = require('node:assert/strict');
const { creerPropositions, GENRES, STATUTS, COLONNES } = require('../lib/propositions');

const env = { NOTION_DB_PROPOSITIONS: 'base-propositions', NOTION_DB_APPROBATEURS: 'base-approbateurs' };
const T0 = Date.UTC(2026, 10, 24, 15, 30);

// Faux Notion en mémoire : pages avec propriétés et un bloc de code dans le corps.
function fauxNotion({ approbateurs = [] } = {}) {
  const pages = new Map(); const blocs = new Map(); let n = 0;
  const lu = (segments) => (segments || []).map((s) => ({ ...s, plain_text: s.text.content }));
  const client = {
    pages: {
      async create({ parent, properties, children }) {
        const id = `page-${++n}`;
        pages.set(id, { id, parent, properties: JSON.parse(JSON.stringify(properties)) });
        blocs.set(id, (children || []).map((b, i) => ({ ...JSON.parse(JSON.stringify(b)), id: `${id}-bloc-${i}` })));
        return { id };
      },
      async retrieve({ page_id }) {
        const page = pages.get(page_id);
        if (!page) { const e = new Error('absent'); e.code = 'object_not_found'; throw e; }
        const properties = {};
        for (const [nom, p] of Object.entries(page.properties)) {
          properties[nom] = p.title ? { title: lu(p.title) } : p.rich_text ? { rich_text: lu(p.rich_text) } : p;
        }
        return { ...page, properties };
      },
      async update({ page_id, properties }) { Object.assign(pages.get(page_id).properties, JSON.parse(JSON.stringify(properties))); return {}; },
    },
    blocks: {
      children: { async list({ block_id }) { return { results: blocs.get(block_id).map((b) => ({ ...b, code: { ...b.code, rich_text: lu(b.code.rich_text) } })), has_more: false }; } },
      async update({ block_id, code }) {
        for (const liste of blocs.values()) for (const b of liste) if (b.id === block_id) b.code = JSON.parse(JSON.stringify(code));
        return {};
      },
    },
    databases: {
      async query({ database_id, filter, sorts }) {
        client.derniereRequete = { database_id, filter, sorts };
        if (database_id === 'base-approbateurs') return { results: approbateurs, has_more: false };
        const toutes = await Promise.all([...pages.keys()].map((id) => client.pages.retrieve({ page_id: id })));
        return { results: toutes, has_more: false };
      },
    },
  };
  return { client, pages, blocs };
}
const approbateur = (courriel, actif = true) => ({ id: courriel, properties: { Courriel: { email: courriel }, Actif: { checkbox: actif } } });

const base = {
  genre: 'modification', ficheId: 'fiche-1', courriel: 'p@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable',
  titre: 'Modification : Cohorte X',
  contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} },
};

test('une proposition créée se relit telle quelle, en attente', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  const lue = await propositions.lireProposition(id);
  assert.deepEqual(lue, {
    id, genre: 'modification', ficheId: 'fiche-1', courriel: 'p@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable',
    titre: 'Modification : Cohorte X', proposeLe: '2026-11-24T15:30:00.000Z', statut: 'attente',
    decidePar: null, decideLe: null, commentaire: '', logoPropose: null, contenu: base.contenu,
  });
});

test('la page Notion porte les libellés lisibles', async () => {
  const { client, pages } = fauxNotion();
  const id = await creerPropositions(client, env, { maintenant: () => T0 }).creerProposition(base);
  const p = pages.get(id).properties;
  assert.equal(pages.get(id).parent.database_id, 'base-propositions');
  assert.equal(p[COLONNES.genre].select.name, GENRES.modification);
  assert.equal(p[COLONNES.statut].select.name, STATUTS.attente);
  assert.equal(p[COLONNES.lienAvecRessource].select.name, 'Responsable');
  assert.deepEqual(p[COLONNES.ficheVisee].relation, [{ id: 'fiche-1' }]);
});

test('une nouvelle ressource n\'a pas de fiche visée', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition({ ...base, genre: 'nouvelle', ficheId: null, lienAvecRessource: 'aucun', nomProposant: '' });
  const lue = await propositions.lireProposition(id);
  assert.equal(lue.ficheId, null);
  assert.equal(lue.genre, 'nouvelle');
  assert.equal(lue.lienAvecRessource, 'aucun');
});

test('un contenu de plus de 2 000 caractères est découpé et relu à l\'identique', async () => {
  const { client, blocs } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const contenu = { propose: { description: { apres: 'é"\n'.repeat(1700) } }, applique: null, porteursNouveaux: {} };
  const id = await propositions.creerProposition({ ...base, contenu });
  const morceaux = blocs.get(id)[0].code.rich_text;
  assert.ok(morceaux.length >= 3);
  assert.ok(morceaux.every((m) => m.text.content.length <= 2000));
  assert.deepEqual((await propositions.lireProposition(id)).contenu, contenu);
});

test('lireProposition renvoie null pour une page absente ou d\'une autre base', async () => {
  const { client, pages } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  assert.equal(await propositions.lireProposition('inconnue'), null);
  const id = await propositions.creerProposition(base);
  pages.get(id).parent.database_id = 'autre-base';
  assert.equal(await propositions.lireProposition(id), null);
});

test('marquerDecision écrit le statut, l\'approbateur, la date et ce qui a été appliqué', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition({ ...base, genre: 'nouvelle', ficheId: null });
  await propositions.marquerDecision(id, { statut: 'approuvee', approbateur: 'tess@exemple.ca', ficheId: 'fiche-9', applique: { contact: 'x@y.org' } });
  const lue = await propositions.lireProposition(id);
  assert.equal(lue.statut, 'approuvee');
  assert.equal(lue.decidePar, 'tess@exemple.ca');
  assert.equal(lue.decideLe, '2026-11-24T15:30:00.000Z');
  assert.equal(lue.ficheId, 'fiche-9');
  assert.deepEqual(lue.contenu.applique, { contact: 'x@y.org' });
  assert.deepEqual(lue.contenu.propose, base.contenu.propose, 'ce qui était proposé est gardé');
});

test('un refus garde le commentaire et ne touche pas à la fiche visée', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  await propositions.marquerDecision(id, { statut: 'refusee', approbateur: 'tess@exemple.ca', commentaire: 'Hors du périmètre.' });
  const lue = await propositions.lireProposition(id);
  assert.equal(lue.statut, 'refusee');
  assert.equal(lue.commentaire, 'Hors du périmètre.');
  assert.equal(lue.ficheId, 'fiche-1');
  assert.equal(lue.contenu.applique, null);
});

test('listerPropositions filtre par statut, trie par date et ne renvoie pas le contenu', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  await propositions.creerProposition(base);
  const liste = await propositions.listerPropositions({ statut: 'attente' });
  assert.equal(liste.length, 1);
  assert.ok(!('contenu' in liste[0]));
  assert.equal(liste[0].titre, 'Modification : Cohorte X');
  assert.deepEqual(client.derniereRequete.filter, { property: COLONNES.statut, select: { equals: STATUTS.attente } });
  assert.deepEqual(client.derniereRequete.sorts, [{ property: COLONNES.proposeLe, direction: 'ascending' }]);
  await propositions.listerPropositions({ statut: 'tranchees' });
  assert.deepEqual(client.derniereRequete.filter, { property: COLONNES.statut, select: { does_not_equal: STATUTS.attente } });
  assert.deepEqual(client.derniereRequete.sorts, [{ property: COLONNES.decideLe, direction: 'descending' }]);
});

test('enAttenteSur interroge les propositions en attente de la fiche', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  assert.equal(await propositions.enAttenteSur('fiche-1'), false);
  await propositions.creerProposition(base);
  assert.equal(await propositions.enAttenteSur('fiche-1'), true);
  assert.deepEqual(client.derniereRequete.filter, { and: [
    { property: COLONNES.statut, select: { equals: STATUTS.attente } },
    { property: COLONNES.ficheVisee, relation: { contains: 'fiche-1' } },
  ] });
});

test('seuls les approbateurs actifs sont reconnus, sans tenir compte de la casse', async () => {
  const { client } = fauxNotion({ approbateurs: [approbateur(' Tess@Exemple.ca '), approbateur('ancien@exemple.ca', false), approbateur(null)] });
  const propositions = creerPropositions(client, env);
  assert.deepEqual(await propositions.approbateursActifs(), ['tess@exemple.ca']);
  assert.equal(await propositions.estApprobateur(' TESS@exemple.ca'), true);
  assert.equal(await propositions.estApprobateur('ancien@exemple.ca'), false);
  assert.equal(await propositions.estApprobateur('autre@exemple.ca'), false);
  assert.equal(await propositions.estApprobateur(''), false);
  assert.equal(await propositions.estApprobateur(null), false);
});

test('lierFiche relie la fiche créée sans toucher au statut', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition({ ...base, genre: 'nouvelle', ficheId: null });
  await propositions.lierFiche(id, 'fiche-9');
  const lue = await propositions.lireProposition(id);
  assert.equal(lue.ficheId, 'fiche-9');
  assert.equal(lue.statut, 'attente');
});

test('un logo déposé est attaché à la proposition et relu avec son adresse temporaire', async () => {
  const { client, pages } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition({ ...base, logoDepot: { id: 'depot-1', nom: 'logo.png' } });
  assert.deepEqual(pages.get(id).properties[COLONNES.logoPropose], { files: [{ type: 'file_upload', file_upload: { id: 'depot-1' }, name: 'logo.png' }] });
  // À la relecture, Notion rend le fichier avec une adresse temporaire.
  pages.get(id).properties[COLONNES.logoPropose] = { files: [{ type: 'file', name: 'logo.png', file: { url: 'https://notion.exemple/x' } }] };
  assert.deepEqual((await propositions.lireProposition(id)).logoPropose, { nom: 'logo.png', url: 'https://notion.exemple/x' });
  const sans = await propositions.creerProposition(base);
  assert.equal((await propositions.lireProposition(sans)).logoPropose, null);
});
