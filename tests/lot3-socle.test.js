const test = require('node:test');
const assert = require('node:assert/strict');
const { PROP, PROP_PORTEUR, ficheDepuisPage, ecriture } = require('../lib/notion');
const { assembler } = require('../lib/fiches');
const { SOURCES, creerVersions } = require('../lib/versions');
const { creerGestionnaire, creerSource } = require('../api/export');
const { fauxNotion } = require('./aides/faux-notion');
const { brute } = require('./aides/fausses-fiches');

test('« Lien en panne depuis » se lit dans une fiche, mais ne sort jamais dans les données publiques', async () => {
  const fiche = ficheDepuisPage({ id: 'f1', properties: { [PROP.nom]: { title: [{ plain_text: 'X' }] }, [PROP.lienEnPanneDepuis]: { date: { start: '2026-11-20' } } } });
  assert.equal(fiche.lienEnPanneDepuis, '2026-11-20');
  assert.equal(ficheDepuisPage({ id: 'f2', properties: {} }).lienEnPanneDepuis, null);
  const porteurs = [{ id: 'id-notion-chum', nom: 'CHUM', latitude: 45.5, longitude: -73.5, institutionBottinId: 'id-notion-institution' }];
  const donnees = assembler([brute({ lienEnPanneDepuis: '2026-11-20' })], porteurs);
  const source = creerSource({ lire: async () => donnees });
  const res = { entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } };
  await creerGestionnaire({ source })({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 200);
  const sortie = JSON.stringify(res.corps);
  for (const interdit of ['lienEnPanneDepuis', 'Lien en panne', '2026-11-20', 'id-notion', 'statutFiche', 'porteurIds', 'logoFichier', 'modifieeLe']) assert.ok(!sortie.includes(interdit), interdit);
  assert.deepEqual(Object.keys(res.corps).sort(), ['carte', 'contributions', 'genereLe', 'messageFerme', 'porteurs', 'ressources']);
});

test('la source « Qualité » existe pour les versions et s\'écrit dans Notion', async () => {
  assert.equal(SOURCES.qualite, 'Qualité');
  const faux = fauxNotion();
  const versions = creerVersions(faux.client, { NOTION_DB_VERSIONS: 'base-versions' });
  const retour = await versions.ecrire({ ficheId: 'f1', nom: 'X', source: 'qualite', par: 'tess@exemple.ca', changements: { motsCles: { avant: ['fhir'], apres: ['HL7 FHIR'] } }, note: 'Fusion' });
  assert.deepEqual(retour, { ecrite: true, numero: 2 });
  assert.equal(faux.de('pages.create')[0].properties.Source.select.name, 'Qualité');
  assert.equal((await versions.lister('f1'))[0].source, 'qualite');
});

function fauxClient(pages) {
  const appels = [];
  return {
    appels,
    pages: {
      async retrieve({ page_id }) { appels.push(['retrieve', page_id]); const p = pages[page_id]; if (!p) { const e = new Error('introuvable'); e.code = 'object_not_found'; throw e; } if (p.interdit) throw new Error('accès refusé'); return p; },
      async update(demande) { appels.push(['update', demande]); return {}; },
    },
  };
}
const ENV = { NOTION_DB_PORTEURS: 'base-porteurs', NOTION_DB_RESSOURCES: 'base-ressources' };
const pagePorteur = (o = {}) => ({ id: 'p1', parent: { database_id: 'base-porteurs' }, properties: { [PROP_PORTEUR.nom]: { title: [{ plain_text: 'CHUM' }] }, [PROP_PORTEUR.latitude]: { number: 45.5 }, [PROP_PORTEUR.longitude]: { number: -73.5 } }, ...o });

test('lire, modifier et mettre à la corbeille un porteur : seulement une page de la base des porteurs', async () => {
  const client = fauxClient({ p1: pagePorteur(), autre: pagePorteur({ id: 'autre', parent: { database_id: 'base-ressources' } }), parti: pagePorteur({ id: 'parti', archived: true }) });
  const n = ecriture(client, ENV);
  assert.equal((await n.lirePorteur('p1')).nom, 'CHUM');
  assert.equal(await n.lirePorteur('autre'), null);
  assert.equal(await n.lirePorteur('parti'), null);
  assert.equal(await n.lirePorteur('absent'), null);
  await n.mettreAJourPorteur('p1', { nom: 'CHUM 2', adresse: '1 rue X', latitude: null, longitude: null });
  const ecrit = client.appels.find((a) => a[0] === 'update')[1];
  assert.equal(ecrit.page_id, 'p1');
  assert.equal(ecrit.properties[PROP_PORTEUR.nom].title[0].text.content, 'CHUM 2');
  assert.deepEqual(ecrit.properties[PROP_PORTEUR.latitude], { number: null });
  assert.deepEqual(Object.keys(ecrit.properties).sort(), [PROP_PORTEUR.adresse, PROP_PORTEUR.latitude, PROP_PORTEUR.longitude, PROP_PORTEUR.nom].sort());
  await n.mettreAJourPorteur('p1', { adresse: 'seule' });
  assert.deepEqual(Object.keys(client.appels.filter((a) => a[0] === 'update')[1][1].properties), [PROP_PORTEUR.adresse]);
  await n.archiverPorteur('p1');
  assert.deepEqual(client.appels[client.appels.length - 1], ['update', { page_id: 'p1', archived: true }]);
  await assert.rejects(() => n.archiverPorteur('autre'));
  assert.equal(client.appels.filter((a) => a[0] === 'update').length, 3, 'aucune page d\'une autre base n\'est archivée');
});

test('le titre d\'une page liée : lu quelle que soit sa colonne de titre ; une lecture refusée remonte en erreur', async () => {
  const client = fauxClient({ inst: { id: 'inst', properties: { Nom: { type: 'title', title: [{ plain_text: 'CHU de ' }, { plain_text: 'Québec' }] }, Autre: { type: 'rich_text', rich_text: [] } } }, ferme: { interdit: true } });
  const n = ecriture(client, ENV);
  assert.equal(await n.lireTitrePage('inst'), 'CHU de Québec');
  await assert.rejects(() => n.lireTitrePage('ferme'));
});

test('la marque « à revoir » et sa note sont lues de Notion, et ne sortent jamais dans les données publiques', () => {
  const { PROP, ficheDepuisPage } = require('../lib/notion');
  const { assembler } = require('../lib/fiches');
  const page = { id: 'f1', properties: {
    [PROP.nom]: { title: [{ plain_text: 'Cohorte X' }] }, [PROP.statutFiche]: { select: { name: 'Publiée' } },
    [PROP.aRevoir]: { checkbox: true }, [PROP.noteARevoir]: { rich_text: [{ plain_text: 'Note interne secrète.' }] },
  } };
  const fiche = ficheDepuisPage(page);
  assert.equal(fiche.aRevoir, true);
  assert.equal(fiche.noteARevoir, 'Note interne secrète.');
  assert.equal(ficheDepuisPage({ id: 'f2', properties: { [PROP.nom]: { title: [{ plain_text: 'Y' }] } } }).aRevoir, false);
  const publiques = JSON.stringify(assembler([fiche], [], { logosCopies: {} }));
  assert.ok(!/aRevoir|noteARevoir|secrète/.test(publiques), publiques.slice(0, 200));
});
