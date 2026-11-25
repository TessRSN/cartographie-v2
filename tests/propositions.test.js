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
const approbateur = (courriel, actif = true, sansResume) => ({ id: courriel, properties: { Courriel: { email: courriel }, Actif: { checkbox: actif }, ...(sansResume === undefined ? {} : { 'Sans résumé hebdomadaire': { checkbox: sansResume } }) } });

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
    verificationLe: null, decidePar: null, decideLe: null, commentaire: '', logoPropose: null, contenu: base.contenu,
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
  // Tranchées : ni « En attente » ni « En vérification ».
  assert.deepEqual(client.derniereRequete.filter, { and: [
    { property: COLONNES.statut, select: { does_not_equal: STATUTS.attente } },
    { property: COLONNES.statut, select: { does_not_equal: STATUTS.verification } },
  ] });
  assert.deepEqual(client.derniereRequete.sorts, [{ property: COLONNES.decideLe, direction: 'descending' }]);
});

test('enAttenteSur interroge les propositions en attente de la fiche', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  assert.equal(await propositions.enAttenteSur('fiche-1'), false);
  await propositions.creerProposition(base);
  assert.equal(await propositions.enAttenteSur('fiche-1'), true);
  // Une proposition en vérification attend encore une décision : elle compte aussi.
  assert.deepEqual(client.derniereRequete.filter, { and: [
    { or: [{ property: COLONNES.statut, select: { equals: STATUTS.attente } }, { property: COLONNES.statut, select: { equals: STATUTS.verification } }] },
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

test('le résumé hebdomadaire va aux approbateurs actifs qui ne l\'ont pas refusé', async () => {
  const { client } = fauxNotion({ approbateurs: [approbateur('a@exemple.ca'), approbateur('b@exemple.ca', true, true), approbateur('c@exemple.ca', true, false), approbateur('d@exemple.ca', false)] });
  const propositions = creerPropositions(client, env);
  assert.deepEqual(await propositions.approbateursAPrevenir(), ['a@exemple.ca', 'c@exemple.ca']);
});

// ─── Lot 1 du nouveau panneau : état « En vérification », rôles, équipe, avis ───
const { ROLES, COLONNES_APPROBATEUR, avisDe } = require('../lib/propositions');
const membre = ({ nom = '', courriel, actif = true, role, sansResume = false }) => ({ id: String(courriel), properties: {
  Nom: { title: nom ? [{ plain_text: nom }] : [] }, Courriel: { email: courriel }, Actif: { checkbox: actif },
  'Sans résumé hebdomadaire': { checkbox: sansResume }, 'Rôle': { select: role ? { name: role } : null },
} });

test('les libellés Notion du lot 1 : statut, date de mise en vérification, rôles', () => {
  assert.equal(STATUTS.verification, 'En vérification');
  assert.equal(COLONNES.verificationLe, 'Mise en vérification le');
  assert.equal(COLONNES_APPROBATEUR.role, 'Rôle');
  assert.deepEqual(ROLES, { administration: 'Administration', approbation: 'Approbation', lecture: 'Lecture seule' });
});

test('marquerVerification passe la proposition « En vérification » et date le passage', async () => {
  const { client, pages } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  await propositions.marquerVerification(id);
  assert.equal(pages.get(id).properties[COLONNES.statut].select.name, 'En vérification');
  const lue = await propositions.lireProposition(id);
  assert.equal(lue.statut, 'verification');
  assert.equal(lue.verificationLe, '2026-11-24T15:30:00.000Z');
  assert.equal(lue.decidePar, null);
  assert.deepEqual(lue.contenu, base.contenu, 'le contenu ne bouge pas');
});

test('roleDe : le rôle de la ligne, « approbation » sans rôle, null si absente ou inactive', async () => {
  const { client } = fauxNotion({ approbateurs: [
    membre({ nom: 'Tess B', courriel: ' Tess@Exemple.ca ', role: 'Administration' }),
    membre({ nom: 'Max', courriel: 'max@exemple.ca', role: 'Approbation' }),
    membre({ nom: 'Cam', courriel: 'cam@exemple.ca', role: 'Lecture seule' }),
    membre({ nom: 'Sans rôle', courriel: 'sans@exemple.ca' }),
    membre({ nom: 'Partie', courriel: 'partie@exemple.ca', actif: false, role: 'Administration' }),
    membre({ nom: 'Bizarre', courriel: 'bizarre@exemple.ca', role: 'Super-pouvoirs' }),
    membre({ nom: 'Sans courriel', courriel: null, role: 'Administration' }),
  ] });
  const propositions = creerPropositions(client, env);
  assert.equal(await propositions.roleDe('TESS@exemple.ca '), 'administration');
  assert.equal(await propositions.roleDe('max@exemple.ca'), 'approbation');
  assert.equal(await propositions.roleDe('cam@exemple.ca'), 'lecture');
  assert.equal(await propositions.roleDe('sans@exemple.ca'), 'approbation');
  assert.equal(await propositions.roleDe('partie@exemple.ca'), null);
  assert.equal(await propositions.roleDe('inconnue@exemple.ca'), null);
  assert.equal(await propositions.roleDe(''), null);
  assert.equal(await propositions.roleDe(null), null);
  // Un rôle que le code ne connaît pas donne le moins de droits possible.
  assert.equal(await propositions.roleDe('bizarre@exemple.ca'), 'lecture');
});

test('peutDecider : approbation et administration seulement ; estApprobateur : toute personne active', async () => {
  const { client } = fauxNotion({ approbateurs: [
    membre({ courriel: 'tess@exemple.ca', role: 'Administration' }), membre({ courriel: 'max@exemple.ca' }),
    membre({ courriel: 'cam@exemple.ca', role: 'Lecture seule' }), membre({ courriel: 'partie@exemple.ca', actif: false, role: 'Approbation' }),
  ] });
  const propositions = creerPropositions(client, env);
  assert.equal(await propositions.peutDecider('tess@exemple.ca'), true);
  assert.equal(await propositions.peutDecider('max@exemple.ca'), true);
  assert.equal(await propositions.peutDecider('cam@exemple.ca'), false);
  assert.equal(await propositions.peutDecider('partie@exemple.ca'), false);
  assert.equal(await propositions.peutDecider('autre@exemple.ca'), false);
  assert.equal(await propositions.estApprobateur('cam@exemple.ca'), true);
  assert.equal(await propositions.estApprobateur('partie@exemple.ca'), false);
});

test("equipe : les personnes actives, avec nom, courriel, rôle et résumé", async () => {
  const { client } = fauxNotion({ approbateurs: [
    membre({ nom: 'Tess Berthier', courriel: 'Tess@exemple.ca', role: 'Administration' }),
    membre({ courriel: 'max@exemple.ca', sansResume: true }),
    membre({ nom: 'Partie', courriel: 'partie@exemple.ca', actif: false }),
  ] });
  const propositions = creerPropositions(client, env);
  assert.deepEqual(await propositions.equipe(), [
    { nom: 'Tess Berthier', courriel: 'tess@exemple.ca', role: 'administration', resume: true },
    { nom: '', courriel: 'max@exemple.ca', role: 'approbation', resume: false },
  ]);
});

const AVIS_TESS = { courriel: 'tess@exemple.ca', nom: 'Tess Berthier', sens: 'favorable', commentaire: 'Bien.', le: '2026-11-24T15:30:00.000Z' };
const AVIS_MAX = { courriel: 'max@exemple.ca', nom: 'Max', sens: 'defavorable', commentaire: '', le: '2026-11-24T16:00:00.000Z' };

test('ecrireAvis ajoute un avis dans le bloc JSON, sous la clé « avis », sans toucher au reste', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  assert.deepEqual(await propositions.ecrireAvis(id, AVIS_TESS), [AVIS_TESS]);
  assert.deepEqual(await propositions.ecrireAvis(id, AVIS_MAX), [AVIS_TESS, AVIS_MAX]);
  const lue = await propositions.lireProposition(id);
  assert.deepEqual(lue.contenu, { ...base.contenu, avis: [AVIS_TESS, AVIS_MAX] });
  assert.equal(lue.statut, 'attente');
});

test('un seul avis par personne : le nouvel avis remplace le sien, pas celui des autres', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  await propositions.ecrireAvis(id, AVIS_TESS);
  await propositions.ecrireAvis(id, AVIS_MAX);
  const second = { ...AVIS_TESS, courriel: ' TESS@exemple.ca', sens: 'defavorable', commentaire: 'Finalement non.', le: '2026-11-25T09:00:00.000Z' };
  const liste = await propositions.ecrireAvis(id, second);
  assert.deepEqual(liste, [AVIS_MAX, { ...second, courriel: 'tess@exemple.ca' }]);
});

test('la décision garde les avis déjà donnés', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  await propositions.ecrireAvis(id, AVIS_TESS);
  await propositions.marquerDecision(id, { statut: 'approuvee', approbateur: 'max@exemple.ca', applique: { contact: 'c@d.org' } });
  const lue = await propositions.lireProposition(id);
  assert.deepEqual(lue.contenu.avis, [AVIS_TESS]);
  assert.deepEqual(lue.contenu.applique, { contact: 'c@d.org' });
});

test("ecrireAvis échoue si le bloc JSON est absent ou illisible, plutôt que d'écraser le contenu", async () => {
  const { client, blocs } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const id = await propositions.creerProposition(base);
  blocs.get(id)[0].code.rich_text = [{ text: { content: '{ abîmé' } }];
  await assert.rejects(() => propositions.ecrireAvis(id, AVIS_TESS));
  blocs.set(id, []);
  await assert.rejects(() => propositions.ecrireAvis(id, AVIS_TESS));
});

test('avisDe ne garde que les avis bien formés', () => {
  assert.deepEqual(avisDe(null), []);
  assert.deepEqual(avisDe({ avis: 'texte' }), []);
  assert.deepEqual(avisDe({ avis: [AVIS_TESS, null, 'x', { courriel: 'a@b.ca', sens: 'peut-être' }, { sens: 'favorable' }, { courriel: 'm@b.ca', sens: 'defavorable', commentaire: 42, nom: ['x'], le: 7 }] }), [
    AVIS_TESS, { courriel: 'm@b.ca', nom: '', sens: 'defavorable', commentaire: '', le: null },
  ]);
});

test('listerPropositions sait rendre chacun des quatre états, les ouvertes et toutes', async () => {
  const { client } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  await propositions.creerProposition(base);
  const egal = (statut) => ({ property: COLONNES.statut, select: { equals: STATUTS[statut] } });
  for (const statut of ['attente', 'verification']) {
    await propositions.listerPropositions({ statut });
    assert.deepEqual(client.derniereRequete.filter, egal(statut), statut);
    assert.deepEqual(client.derniereRequete.sorts, [{ property: COLONNES.proposeLe, direction: 'ascending' }]);
  }
  for (const statut of ['approuvee', 'refusee']) {
    await propositions.listerPropositions({ statut });
    assert.deepEqual(client.derniereRequete.filter, egal(statut), statut);
    assert.deepEqual(client.derniereRequete.sorts, [{ property: COLONNES.decideLe, direction: 'descending' }]);
  }
  await propositions.listerPropositions({ statut: 'ouvertes' });
  assert.deepEqual(client.derniereRequete.filter, { or: [egal('attente'), egal('verification')] });
  const toutes = await propositions.listerPropositions({ statut: 'toutes' });
  assert.equal(client.derniereRequete.filter, undefined);
  assert.equal(toutes.length, 1);
  assert.equal(toutes[0].verificationLe, null);
  assert.ok(!('contenu' in toutes[0]));
  // Un statut inconnu retombe sur « attente », comme avant.
  await propositions.listerPropositions({ statut: 'nimporte' });
  assert.deepEqual(client.derniereRequete.filter, egal('attente'));
});

test('lireContenus rend le contenu de chaque proposition demandée, null si le bloc est illisible', async () => {
  const { client, blocs } = fauxNotion();
  const propositions = creerPropositions(client, env, { maintenant: () => T0 });
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push(await propositions.creerProposition({ ...base, contenu: { propose: { nom: { apres: `N${i}` } } } }));
  blocs.get(ids[3])[0].code.rich_text = [{ text: { content: 'pas du JSON' } }];
  const contenus = await propositions.lireContenus(ids);
  assert.equal(contenus.size, 7);
  assert.deepEqual(contenus.get(ids[6]), { propose: { nom: { apres: 'N6' } } });
  assert.equal(contenus.get(ids[3]), null);
});

test('une colonne « Rôle » d\'un autre type que le choix simple donne le moins de droits, pas « approbation »', async () => {
  const autreType = membre({ nom: 'Cam', courriel: 'cam@exemple.ca' });
  autreType.properties['Rôle'] = { type: 'multi_select', multi_select: [{ name: 'Lecture seule' }] };
  const statutNotion = membre({ nom: 'Max', courriel: 'max@exemple.ca' });
  statutNotion.properties['Rôle'] = { type: 'status', status: { name: 'Administration' } };
  const sansColonne = membre({ nom: 'Ancienne ligne', courriel: 'ancienne@exemple.ca' });
  delete sansColonne.properties['Rôle'];
  const { client } = fauxNotion({ approbateurs: [autreType, statutNotion, sansColonne] });
  const propositions = creerPropositions(client, env);
  assert.equal(await propositions.roleDe('cam@exemple.ca'), 'lecture');
  assert.equal(await propositions.roleDe('max@exemple.ca'), 'lecture');
  assert.equal(await propositions.roleDe('ancienne@exemple.ca'), 'approbation');
});
