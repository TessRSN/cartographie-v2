const test = require('node:test');
const assert = require('node:assert/strict');
const { PROP, ficheDepuisPage, segments, proprietesDepuisValeurs, valeursDepuisFiche, ecriture } = require('../lib/notion');
const { CHAMPS } = require('../public/js/champs.js');
const { geocoder } = require('../lib/geocodage');

// Notion renvoie « plain_text » à la lecture ; on le reconstitue pour relire ce qu'on écrit.
function commeLu(proprietes) {
  const copie = JSON.parse(JSON.stringify(proprietes));
  for (const p of Object.values(copie)) {
    for (const s of p.title || p.rich_text || []) s.plain_text = s.text.content;
  }
  return copie;
}

test('segments découpe un long texte en morceaux de 2 000 caractères', () => {
  const texte = 'é'.repeat(4500);
  const morceaux = segments(texte);
  assert.equal(morceaux.length, 3);
  assert.ok(morceaux.every((m) => m.text.content.length <= 2000));
  assert.equal(morceaux.map((m) => m.text.content).join(''), texte);
  assert.deepEqual(segments(''), []);
  assert.deepEqual(segments(null), []);
});

test('proprietesDepuisValeurs écrit chaque type de colonne', () => {
  const p = proprietesDepuisValeurs({
    nom: 'Cohorte X', phrase: 'Une phrase.', portee: 'Le Québec', motsCles: ['a', 'b'], lien: 'https://x.org',
    contact: 'a@b.org', jumelage: true, porteurs: ['CHUM'], faitPartieDe: ['cartagene'],
  }, { porteurIds: ['p1'], ficheIds: { faitPartieDe: ['f1'] } });
  assert.deepEqual(p[PROP.nom], { title: [{ type: 'text', text: { content: 'Cohorte X' } }] });
  assert.deepEqual(p[PROP.phrase], { rich_text: [{ type: 'text', text: { content: 'Une phrase.' } }] });
  assert.deepEqual(p[PROP.portee], { select: { name: 'Le Québec' } });
  assert.deepEqual(p[PROP.motsCles], { multi_select: [{ name: 'a' }, { name: 'b' }] });
  assert.deepEqual(p[PROP.lien], { url: 'https://x.org' });
  assert.deepEqual(p[PROP.contact], { email: 'a@b.org' });
  assert.deepEqual(p[PROP.jumelage], { checkbox: true });
  assert.deepEqual(p[PROP.porteurs], { relation: [{ id: 'p1' }] });
  assert.deepEqual(p[PROP.faitPartieDe], { relation: [{ id: 'f1' }] });
  assert.equal(Object.keys(p).length, 9);
});

test('un champ vidé est écrit vide', () => {
  const p = proprietesDepuisValeurs({ licence: '', lien: null, frais: null, normes: [], contact: null, jumelage: false });
  assert.deepEqual(p[PROP.licence], { rich_text: [] });
  assert.deepEqual(p[PROP.lien], { url: null });
  assert.deepEqual(p[PROP.frais], { select: null });
  assert.deepEqual(p[PROP.normes], { multi_select: [] });
  assert.deepEqual(p[PROP.contact], { email: null });
  assert.deepEqual(p[PROP.jumelage], { checkbox: false });
});

test("le type public retrouve son libellé Notion, sans virgule", () => {
  const p = proprietesDepuisValeurs({ typePrincipal: 'Jeu de données, cohorte ou biobanque', secondType: 'Logiciel ou application' });
  assert.deepEqual(p[PROP.typePrincipal], { select: { name: 'Jeu de données ou cohorte ou biobanque' } });
  assert.deepEqual(p[PROP.secondType], { select: { name: 'Logiciel ou application' } });
});

test('une clé hors du catalogue, ou une relation sans identifiants, est ignorée', () => {
  const p = proprietesDepuisValeurs({ statutFiche: 'Publiée', notes: 'x', verifieeLe: '2026-01-01', porteurs: ['CHUM'], remplace: ['x'] });
  assert.deepEqual(p, {});
});

test('une fiche lue, réécrite puis relue garde les mêmes valeurs', () => {
  const fiche = {
    id: 'f0', nom: 'Cohorte X', autresNoms: 'CX', typePrincipal: 'Jeu de données ou cohorte ou biobanque', secondType: null,
    phrase: 'Une phrase.', description: 'd'.repeat(4500), motsCles: ['cancer'], lien: 'https://x.org', autresLiens: '',
    etat: 'Actif', langues: ['Français'], modesAcces: ['Ouvert'], commentAcceder: null, frais: 'Gratuit',
    environnementSecurise: true, reserveA: '', responsable: 'M. C.', profilResponsable: null, contact: 'a@b.org',
    porteurIds: ['p1', 'p-inconnu'], portee: 'Le Québec', financePar: ['FRQS'], population: '', periode: '2010-2020',
    typesDonnees: ['Imagerie'], normes: ['BIDS'], outils: [], collecte: null, jumelage: false, dictionnaire: null,
    depotCode: null, doi: null, licence: '', logo: null, faitPartieDe: ['f1'], reposeSur: [], donneAccesA: [], remplace: [],
  };
  const porteursParId = new Map([['p1', { id: 'p1', nom: 'CHUM' }]]);
  const valeurs = valeursDepuisFiche(fiche, porteursParId, new Map([['f1', 'cartagene']]));
  assert.deepEqual(Object.keys(valeurs).sort(), CHAMPS.map((c) => c.cle).sort());
  assert.equal(valeurs.typePrincipal, 'Jeu de données, cohorte ou biobanque');
  assert.deepEqual(valeurs.porteurs, ['CHUM']);
  assert.deepEqual(valeurs.faitPartieDe, ['cartagene']);
  assert.ok(!('id' in valeurs) && !('statutFiche' in valeurs));

  const proprietes = proprietesDepuisValeurs(valeurs, { porteurIds: ['p1'], ficheIds: { faitPartieDe: ['f1'], reposeSur: [], donneAccesA: [], remplace: [] } });
  const relue = ficheDepuisPage({ id: 'f0', properties: commeLu(proprietes) });
  for (const cle of Object.keys(fiche)) {
    if (cle === 'porteurIds') assert.deepEqual(relue.porteurIds, ['p1']);
    else assert.deepEqual(relue[cle], fiche[cle], cle);
  }
});

test('sans table des adresses, les liens entre fiches ne sont pas renvoyés', () => {
  const valeurs = valeursDepuisFiche({ nom: 'X', porteurIds: [], faitPartieDe: ['f1'] }, new Map());
  assert.ok(!('faitPartieDe' in valeurs));
});

function fauxClient(surcharge = {}) {
  const appels = [];
  const noter = (nom, retour) => async (args) => { appels.push({ nom, args }); return typeof retour === 'function' ? retour(args) : retour; };
  return {
    appels,
    pages: {
      retrieve: noter('pages.retrieve', surcharge.retrieve || ((a) => ({ id: a.page_id, parent: { database_id: 'base-ressources' }, properties: {} }))),
      create: noter('pages.create', { id: 'nouvelle-page' }),
      update: noter('pages.update', {}),
    },
    databases: {
      query: noter('databases.query', surcharge.query || { results: [], has_more: false }),
      retrieve: noter('databases.retrieve', surcharge.base || { properties: {} }),
    },
  };
}
const env = { NOTION_DB_RESSOURCES: 'base-ressources', NOTION_DB_PORTEURS: 'base-porteurs' };

test('lireFiche renvoie null pour une page archivée, introuvable ou d\'une autre base', async () => {
  assert.equal((await ecriture(fauxClient(), env).lireFiche('f1')).id, 'f1');
  assert.equal(await ecriture(fauxClient({ retrieve: () => ({ id: 'f1', archived: true, parent: { database_id: 'base-ressources' }, properties: {} }) }), env).lireFiche('f1'), null);
  assert.equal(await ecriture(fauxClient({ retrieve: () => ({ id: 'f1', in_trash: true, parent: { database_id: 'base-ressources' }, properties: {} }) }), env).lireFiche('f1'), null);
  assert.equal(await ecriture(fauxClient({ retrieve: () => ({ id: 'f1', parent: { database_id: 'autre-base' }, properties: {} }) }), env).lireFiche('f1'), null);
  const introuvable = () => { const e = new Error('absent'); e.code = 'object_not_found'; throw e; };
  assert.equal(await ecriture(fauxClient({ retrieve: introuvable }), env).lireFiche('f1'), null);
  const panne = () => { throw new Error('panne'); };
  await assert.rejects(ecriture(fauxClient({ retrieve: panne }), env).lireFiche('f1'), /panne/);
});

test('trouverFiche cherche par nom et lien principal exacts', async () => {
  const client = fauxClient({ query: { results: [{ id: 'f9' }], has_more: false } });
  assert.equal(await ecriture(client, env).trouverFiche({ nom: 'X', lien: 'https://x.org' }), 'f9');
  assert.deepEqual(client.appels[0].args.filter, { and: [
    { property: PROP.nom, title: { equals: 'X' } }, { property: PROP.lien, url: { equals: 'https://x.org' } },
  ] });
  assert.equal(client.appels[0].args.database_id, 'base-ressources');
  const vide = fauxClient();
  assert.equal(await ecriture(vide, env).trouverFiche({ nom: 'X', lien: null }), null);
  assert.deepEqual(vide.appels[0].args.filter.and[1], { property: PROP.lien, url: { is_empty: true } });
});

test('creerFiche et mettreAJourFiche écrivent dans la base des ressources', async () => {
  const client = fauxClient();
  const e = ecriture(client, env);
  assert.equal(await e.creerFiche({ a: 1 }), 'nouvelle-page');
  await e.mettreAJourFiche('f1', { b: 2 });
  assert.deepEqual(client.appels[0].args, { parent: { database_id: 'base-ressources' }, properties: { a: 1 } });
  assert.deepEqual(client.appels[1].args, { page_id: 'f1', properties: { b: 2 } });
});

test('lireOptions donne les choix du catalogue, avec les types en libellé public', async () => {
  const base = { properties: {
    [PROP.portee]: { select: { options: [{ name: 'Le Québec' }, { name: 'International' }] } },
    [PROP.typePrincipal]: { select: { options: [{ name: 'Jeu de données ou cohorte ou biobanque' }] } },
    [PROP.motsCles]: { multi_select: { options: [{ name: 'cancer' }] } },
    [PROP.statutFiche]: { select: { options: [{ name: 'Écartée' }] } },
    'Notes de veille': { select: { options: [{ name: 'secret' }] } },
  } };
  const options = await ecriture(fauxClient({ base }), env).lireOptions();
  assert.deepEqual(options.portee, ['Le Québec', 'International']);
  assert.deepEqual(options.typePrincipal, ['Jeu de données, cohorte ou biobanque']);
  assert.deepEqual(options.motsCles, ['cancer']);
  assert.deepEqual(options.collecte, []);
  assert.ok(!('statutFiche' in options) && !Object.values(options).flat().includes('secret'));
});

test('creerPorteur écrit le nom, l\'adresse et les coordonnées quand elles existent', async () => {
  const client = fauxClient();
  assert.equal(await ecriture(client, env).creerPorteur({ nom: 'CHUM', adresse: '1000 rue Saint-Denis', latitude: 45.5, longitude: -73.5 }), 'nouvelle-page');
  assert.equal(client.appels[0].args.parent.database_id, 'base-porteurs');
  assert.deepEqual(client.appels[0].args.properties.Latitude, { number: 45.5 });
  await ecriture(client, env).creerPorteur({ nom: 'Sans lieu' });
  assert.ok(!('Latitude' in client.appels[1].args.properties));
  assert.deepEqual(client.appels[1].args.properties.Adresse, { rich_text: [] });
});

test('geocoder renvoie des coordonnées, ou null si rien ne correspond', async () => {
  const requete = (corps, ok = true) => async (url, options) => {
    assert.ok(String(url).startsWith('https://nominatim.openstreetmap.org/search?'));
    assert.match(options.headers['User-Agent'], /RSN-Cartographie/);
    return { ok, status: ok ? 200 : 503, json: async () => corps };
  };
  assert.deepEqual(await geocoder('1000 rue Saint-Denis, Montréal', { requete: requete([{ lat: '45.51', lon: '-73.55' }]) }), { latitude: 45.51, longitude: -73.55 });
  assert.equal(await geocoder('nulle part', { requete: requete([]) }), null);
  assert.equal(await geocoder('  ', { requete: requete([]) }), null);
  await assert.rejects(geocoder('x', { requete: requete([], false) }), /503/);
});
