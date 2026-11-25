const test = require('node:test');
const assert = require('node:assert/strict');
const { creerGestionnaire } = require('../api/resume');

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } };
}
const ENV = { CONTRIBUTIONS: 'oui', CRON_SECRET: 'secret-du-cron', SITE_URL: 'https://carto.exemple' };
const requete = (headers = {}, method = 'GET') => ({ method, query: {}, headers: { host: 'carto.exemple', ...headers } });
const autorise = { authorization: 'Bearer secret-du-cron' };

function banc({ env = ENV, enAttente = [{ titre: 'Nouvelle : X', proposeLe: '2026-11-20T15:00:00.000Z' }], destinataires = ['a@exemple.org', 'b@exemple.org'], panne = null } = {}) {
  const envois = [];
  const deps = {
    env, journal: () => {},
    limites: {},
    propositions: {
      async listerPropositions({ statut }) { assert.equal(statut, 'attente'); if (panne === 'notion') throw new Error('Notion en panne'); return enAttente; },
      async approbateursAPrevenir() { return destinataires; },
    },
    courriels: { async resumeHebdomadaire(m) { envois.push(m); if (panne === m.a) return { envoye: false }; return { envoye: true }; } },
  };
  return { gestionnaire: creerGestionnaire(deps), envois };
}
async function appeler(g, req) { const res = reponse(); await g(req, res); return res; }

test('le résumé part à chaque approbateur à prévenir, un courriel chacun', async () => {
  const b = banc();
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, enAttente: 1, envoyes: 2 });
  assert.deepEqual(b.envois.map((m) => m.a), ['a@exemple.org', 'b@exemple.org']);
  assert.equal(b.envois[0].lienPanneau, 'https://carto.exemple/admin');
  assert.deepEqual(b.envois[0].propositions, [{ titre: 'Nouvelle : X', proposeLe: '2026-11-20T15:00:00.000Z' }]);
});

test('sans proposition en attente, aucun courriel', async () => {
  const b = banc({ enAttente: [] });
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.deepEqual(res.corps, { ok: true, enAttente: 0, envoyes: 0 });
  assert.equal(b.envois.length, 0);
});

test('sans le secret du déclencheur, la route refuse : 401', async () => {
  for (const headers of [{}, { authorization: 'Bearer autre' }, { authorization: 'secret-du-cron' }]) {
    const b = banc();
    const res = await appeler(b.gestionnaire, requete(headers));
    assert.equal(res.code, 401);
    assert.equal(b.envois.length, 0);
  }
});

test('sans CRON_SECRET réglé, personne ne peut déclencher le résumé', async () => {
  const b = banc({ env: { CONTRIBUTIONS: 'oui', SITE_URL: 'https://carto.exemple' } });
  const res = await appeler(b.gestionnaire, requete({ authorization: 'Bearer undefined' }));
  assert.equal(res.code, 401);
  assert.equal(b.envois.length, 0);
});

test('contributions fermées : 404, aucun courriel', async () => {
  const b = banc({ env: { ...ENV, CONTRIBUTIONS: 'non' } });
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.equal(res.code, 404);
  assert.equal(b.envois.length, 0);
});

test('une panne chez un destinataire n\'empêche pas les autres ; Notion en panne : 502 sans détail', async () => {
  const b = banc({ panne: 'a@exemple.org' });
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.deepEqual(res.corps, { ok: true, enAttente: 1, envoyes: 1 });
  const c = banc({ panne: 'notion' });
  const res2 = await appeler(c.gestionnaire, requete(autorise));
  assert.equal(res2.code, 502);
  assert.ok(!JSON.stringify(res2.corps).includes('Notion en panne'));
});

test('autre méthode que GET : 405', async () => {
  const b = banc();
  const res = await appeler(b.gestionnaire, requete(autorise, 'POST'));
  assert.equal(res.code, 405);
});
