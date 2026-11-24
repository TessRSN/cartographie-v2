const test = require('node:test');
const assert = require('node:assert/strict');
const { creerGestionnaire, creerSource } = require('../api/export');

function reponse() {
  return {
    code: null, corps: null, entetes: {},
    setHeader(k, v) { this.entetes[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.corps = o; return this; },
  };
}
const donnees = { ressources: [{ nom: 'A' }], porteurs: [] };

test('GET renvoie les fiches avec les en-têtes de mémoire', async () => {
  const gestionnaire = creerGestionnaire({ source: creerSource({ lire: async () => donnees }) });
  const res = reponse();
  await gestionnaire({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.ressources, donnees.ressources);
  assert.ok(res.corps.genereLe);
  assert.equal(res.entetes['Cache-Control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
});

test('la lecture est gardée en mémoire pendant la durée prévue', async () => {
  let appels = 0; let maintenant = 1000;
  const source = creerSource({ lire: async () => { appels++; return donnees; }, maintenant: () => maintenant, dureeMs: 300000 });
  await source(); maintenant += 299000; await source();
  assert.equal(appels, 1);
  maintenant += 2000; await source();
  assert.equal(appels, 2);
});

test('si Notion échoue après un succès, les données gardées sont servies', async () => {
  let echoue = false; let maintenant = 0;
  const source = creerSource({ lire: async () => { if (echoue) throw new Error('Notion injoignable'); return donnees; }, maintenant: () => maintenant, dureeMs: 10 });
  const gestionnaire = creerGestionnaire({ source });
  await gestionnaire({ method: 'GET' }, reponse());
  echoue = true; maintenant = 1000;
  const res = reponse();
  await gestionnaire({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps.ressources, donnees.ressources);
});

test('si Notion échoue sans données gardées : 502 et message clair', async () => {
  const gestionnaire = creerGestionnaire({ source: creerSource({ lire: async () => { throw new Error('clé secrète invalide'); } }), journal: () => {} });
  const res = reponse();
  await gestionnaire({ method: 'GET' }, res);
  assert.equal(res.code, 502);
  assert.deepEqual(res.corps, { erreur: 'Les données ne sont pas disponibles pour le moment.' });
});

test('deux lectures simultanées ne déclenchent qu\'un appel à Notion', async () => {
  let appels = 0;
  const source = creerSource({ lire: async () => { appels++; await new Promise((r) => setTimeout(r, 5)); return donnees; } });
  await Promise.all([source(), source()]);
  assert.equal(appels, 1);
});

test('une autre méthode que GET est refusée', async () => {
  const gestionnaire = creerGestionnaire({ source: creerSource({ lire: async () => donnees }) });
  const res = reponse();
  await gestionnaire({ method: 'POST' }, res);
  assert.equal(res.code, 405);
});

test('la clé du fond de carte vient de l\'environnement, vide si absente', async () => {
  const gestionnaire = creerGestionnaire({ source: creerSource({ lire: async () => donnees }) });
  const avant = process.env.CARTO_BASEMAP_KEY;
  delete process.env.CARTO_BASEMAP_KEY;
  let res = reponse(); await gestionnaire({ method: 'GET' }, res);
  assert.deepEqual(res.corps.carte, { cle: '' });
  process.env.CARTO_BASEMAP_KEY = 'abc';
  res = reponse(); await gestionnaire({ method: 'GET' }, res);
  assert.deepEqual(res.corps.carte, { cle: 'abc' });
  if (avant === undefined) delete process.env.CARTO_BASEMAP_KEY; else process.env.CARTO_BASEMAP_KEY = avant;
});

test('si Notion ne répond pas et qu\'une lecture est gardée, elle est servie sans attendre', async () => {
  let bloque = false; let maintenant = 0;
  const source = creerSource({
    lire: () => (bloque ? new Promise(() => {}) : Promise.resolve(donnees)),
    maintenant: () => maintenant, dureeMs: 10, attenteMs: 20, journal: () => {},
  });
  await source();
  bloque = true; maintenant = 1000;
  const resultat = await Promise.race([source(), new Promise((r) => setTimeout(() => r('trop long'), 500))]);
  assert.notEqual(resultat, 'trop long');
  assert.deepEqual(resultat.ressources, donnees.ressources);
});

test('après un échec, Notion n\'est pas réinterrogé avant le délai de reprise', async () => {
  let appels = 0; let maintenant = 0; let echoue = false;
  const source = creerSource({
    lire: async () => { appels++; if (echoue) throw new Error('panne'); return donnees; },
    maintenant: () => maintenant, dureeMs: 10, repriseMs: 30000, journal: () => {},
  });
  await source();
  echoue = true; maintenant = 1000;
  await source(); await source();
  assert.equal(appels, 2, 'un seul nouvel essai pendant le délai de reprise');
  maintenant = 1000 + 30001;
  await source();
  assert.equal(appels, 3);
});

test('sans lecture gardée, une lecture sans réponse finit par un 502', async () => {
  const source = creerSource({ lire: () => new Promise(() => {}), attenteSansGardeMs: 20, journal: () => {} });
  const gestionnaire = creerGestionnaire({ source, journal: () => {} });
  const res = reponse();
  await Promise.race([gestionnaire({ method: 'GET' }, res), new Promise((r) => setTimeout(r, 500))]);
  assert.equal(res.code, 502);
});
