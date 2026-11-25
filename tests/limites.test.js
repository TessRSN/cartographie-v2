const test = require('node:test');
const assert = require('node:assert/strict');
const { creerLimites } = require('../lib/limites');

const HEURE = 3600000;

// Faux stockage clé-valeur : comprend INCR, EXPIRE … NX et SET … NX EX, comme l'interface REST d'Upstash.
function fauxStockage({ panne = false } = {}) {
  const valeurs = new Map(); const appels = [];
  const requete = async (url, options) => {
    appels.push({ url, options });
    if (panne) throw new Error('stockage en panne');
    const commandes = JSON.parse(options.body);
    const resultats = commandes.map(([nom, cle, ...reste]) => {
      if (nom === 'INCR') { valeurs.set(cle, (valeurs.get(cle) || 0) + 1); return { result: valeurs.get(cle) }; }
      if (nom === 'EXPIRE') return { result: 1 };
      if (nom === 'SET') { if (valeurs.has(cle)) return { result: null }; valeurs.set(cle, reste[0]); return { result: 'OK' }; }
      return { error: 'commande inconnue' };
    });
    return { ok: true, json: async () => resultats };
  };
  return { requete, valeurs, appels };
}

function enMemoire(horloge = { t: Date.UTC(2026, 10, 24, 12) }) {
  return { horloge, limites: creerLimites({ env: {}, maintenant: () => horloge.t, journal: () => {} }) };
}

test('le quatrième lien pour une adresse dans la même heure est refusé', async () => {
  const { limites } = enMemoire();
  for (let i = 1; i <= 3; i++) assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: `10.0.0.${i}` }), true);
  assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.9' }), false);
  assert.equal(await limites.autoriserLien({ courriel: 'b@e.org', ip: '10.0.0.9' }), true);
});

test('le onzième lien pour une adresse IP dans la même heure est refusé', async () => {
  const { limites } = enMemoire();
  for (let i = 1; i <= 10; i++) assert.equal(await limites.autoriserLien({ courriel: `p${i}@e.org`, ip: '10.0.0.1' }), true);
  assert.equal(await limites.autoriserLien({ courriel: 'p11@e.org', ip: '10.0.0.1' }), false);
});

test("le quatre-vingt-unième lien de la journée est refusé, et le lendemain ça repart", async () => {
  const { limites, horloge } = enMemoire();
  for (let i = 1; i <= 80; i++) assert.equal(await limites.autoriserLien({ courriel: `p${i}@e.org`, ip: `10.0.${i}.1` }), true);
  assert.equal(await limites.autoriserLien({ courriel: 'p81@e.org', ip: '10.9.9.9' }), false);
  horloge.t += 24 * HEURE;
  assert.equal(await limites.autoriserLien({ courriel: 'p81@e.org', ip: '10.9.9.9' }), true);
});

test("une heure plus tard, le compteur d'une adresse repart", async () => {
  const { limites, horloge } = enMemoire();
  for (let i = 1; i <= 3; i++) await limites.autoriserLien({ courriel: 'a@e.org', ip: `10.0.0.${i}` });
  assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.4' }), false);
  horloge.t += HEURE;
  assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.4' }), true);
});

test('un jeton ne se consomme qu\'une fois', async () => {
  const { limites } = enMemoire();
  assert.equal(await limites.consommerJeton('jti-1'), true);
  assert.equal(await limites.consommerJeton('jti-1'), false);
  assert.equal(await limites.consommerJeton('jti-2'), true);
});

test('avec le stockage, les compteurs y sont tenus', async () => {
  const stock = fauxStockage();
  const limites = creerLimites({ env: { KV_REST_API_URL: 'https://kv.exemple', KV_REST_API_TOKEN: 'jeton-kv' }, requete: stock.requete, maintenant: () => Date.UTC(2026, 10, 24, 12), journal: () => {} });
  for (let i = 1; i <= 3; i++) assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.1' }), true);
  assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.1' }), false);
  assert.equal(stock.appels[0].url, 'https://kv.exemple/pipeline');
  assert.equal(stock.appels[0].options.headers.Authorization, 'Bearer jeton-kv');
  assert.ok([...stock.valeurs.keys()].some((c) => c.startsWith('carto:lien:jour:2026-11-24')));
  assert.equal(await limites.consommerJeton('jti-1'), true);
  assert.equal(await limites.consommerJeton('jti-1'), false);
});

test("les noms de variables d'Upstash sont aussi reconnus", async () => {
  const stock = fauxStockage();
  const limites = creerLimites({ env: { UPSTASH_REDIS_REST_URL: 'https://kv.exemple/', UPSTASH_REDIS_REST_TOKEN: 'j' }, requete: stock.requete, journal: () => {} });
  await limites.consommerJeton('jti-1');
  assert.equal(stock.appels[0].url, 'https://kv.exemple/pipeline');
});

test('stockage en panne : repli en mémoire, sans exception', async () => {
  const stock = fauxStockage({ panne: true }); const lignes = [];
  const limites = creerLimites({ env: { KV_REST_API_URL: 'https://kv.exemple', KV_REST_API_TOKEN: 'j' }, requete: stock.requete, maintenant: () => Date.UTC(2026, 10, 24, 12), journal: (...a) => lignes.push(a.join(' ')) });
  for (let i = 1; i <= 3; i++) assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.1' }), true);
  assert.equal(await limites.autoriserLien({ courriel: 'a@e.org', ip: '10.0.0.1' }), false);
  assert.equal(await limites.consommerJeton('jti-1'), true);
  assert.equal(await limites.consommerJeton('jti-1'), false);
  assert.ok(lignes.some((l) => l.includes('stockage en panne')));
});

test('sans adresse IP connue, seules les limites par adresse et par jour jouent', async () => {
  const { limites } = enMemoire();
  for (let i = 1; i <= 12; i++) assert.equal(await limites.autoriserLien({ courriel: `p${i}@e.org`, ip: '' }), true);
});

test("des demandes refusées ne consomment pas le plafond de la journée", async () => {
  const { limites } = enMemoire();
  for (let i = 1; i <= 100; i++) await limites.autoriserLien({ courriel: `p${i}@e.org`, ip: '10.0.0.1' });
  for (let i = 1; i <= 70; i++) assert.equal(await limites.autoriserLien({ courriel: `q${i}@e.org`, ip: `10.1.${i}.1` }), true, `demande ${i}`);
});

test('un lien vers le panneau ne dépend pas du plafond de la journée', async () => {
  const { limites } = enMemoire();
  for (let i = 1; i <= 80; i++) await limites.autoriserLien({ courriel: `p${i}@e.org`, ip: `10.0.${i}.1` });
  assert.equal(await limites.autoriserLien({ courriel: 'x@e.org', ip: '10.9.9.9' }), false);
  assert.equal(await limites.autoriserLien({ courriel: 'tess@e.org', ip: '10.9.9.8', plafondDuJour: false }), true);
});

test('un verrou ne se prend qu\'une fois, puis se rend', async () => {
  const { limites } = enMemoire();
  assert.equal(await limites.prendreVerrou('proposition:1'), true);
  assert.equal(await limites.prendreVerrou('proposition:1'), false);
  await limites.rendreVerrou('proposition:1');
  assert.equal(await limites.prendreVerrou('proposition:1'), true);
});

test('un verrou oublié expire au bout d\'une minute', async () => {
  const { limites, horloge } = enMemoire();
  assert.equal(await limites.prendreVerrou('proposition:1'), true);
  horloge.t += 61000;
  assert.equal(await limites.prendreVerrou('proposition:1'), true);
});
