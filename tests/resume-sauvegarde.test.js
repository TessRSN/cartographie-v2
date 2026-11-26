const test = require('node:test');
const assert = require('node:assert/strict');
const { creerGestionnaire } = require('../api/resume');

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } };
}
const ENV = { CONTRIBUTIONS: 'oui', CRON_SECRET: 'secret-du-cron', SITE_URL: 'https://carto.exemple' };
const requete = (headers = { authorization: 'Bearer secret-du-cron' }) => ({ method: 'GET', query: {}, headers: { host: 'carto.exemple', ...headers } });

// sauvegarde : ce que rend la copie de la semaine, ou une fonction (pour la faire lever ou traîner).
function banc({ env = ENV, enAttente = [{ titre: 'Nouvelle : X', proposeLe: '2026-11-20T15:00:00.000Z' }], panneResume = false, sauvegarde = { etat: 'faite', taille: 1200, incomplete: false, retirees: 0 }, sansModule = false } = {}) {
  const envois = []; const copies = []; const lignes = [];
  const deps = {
    env, journal: (...l) => lignes.push(l.join(' ')), limites: {},
    propositions: {
      async listerPropositions() { if (panneResume) throw new Error('Notion en panne'); return enAttente; },
      async equipe() { return [{ nom: 'Tess', courriel: 'tess@exemple.ca', role: 'administration', resume: true }]; },
    },
    courriels: { async resumeHebdomadaire(m) { envois.push(m); return { envoye: true }; } },
    ...(sansModule ? {} : { sauvegardes: { async hebdomadaire() { copies.push(1); return typeof sauvegarde === 'function' ? sauvegarde() : sauvegarde; } } }),
  };
  const appeler = async (req = requete()) => { const res = reponse(); await creerGestionnaire(deps)(req, res); return res; };
  return { appeler, envois, copies, lignes };
}

test('le lundi, la tâche du résumé fait aussi la copie de la semaine, et le dit dans sa réponse', async () => {
  const b = banc();
  const res = await b.appeler();
  assert.deepEqual([res.code, res.corps], [200, { ok: true, enAttente: 1, envoyes: 1, sauvegarde: 'faite' }]);
  assert.deepEqual([b.envois.length, b.copies.length], [1, 1]);
});

test('la copie se fait même sans proposition en attente, et même si les contributions sont fermées dans le panneau', async () => {
  const b = banc({ enAttente: [] });
  const res = await b.appeler();
  assert.deepEqual(res.corps, { ok: true, enAttente: 0, envoyes: 0, sauvegarde: 'faite' });
  assert.deepEqual([b.envois.length, b.copies.length], [0, 1]);
});

test('une copie qui échoue, qui lève ou qui rend n\'importe quoi n\'empêche pas le résumé', async () => {
  for (const [sauvegarde, attendu] of [[{ etat: 'echec' }, 'echec'], [() => { throw new Error('module cassé'); }, 'echec'], [async () => { throw new Error('Notion en panne'); }, 'echec'], [null, 'echec'], [{ etat: 'inactive' }, 'inactive'], [{ etat: 'autre' }, 'echec']]) {
    const b = banc({ sauvegarde });
    const res = await b.appeler();
    assert.deepEqual([res.code, res.corps], [200, { ok: true, enAttente: 1, envoyes: 1, sauvegarde: attendu }]);
    assert.equal(b.envois.length, 1);
  }
});

test('un résumé qui échoue n\'empêche pas la copie : 502 pour le résumé, mais la copie est faite', async () => {
  const b = banc({ panneResume: true });
  const res = await b.appeler();
  assert.equal(res.code, 502);
  assert.equal(res.corps.sauvegarde, 'faite');
  assert.equal(b.copies.length, 1);
  assert.ok(!JSON.stringify(res.corps).includes('Notion en panne'));
});

test('le résumé part d\'abord, la copie ensuite : une copie lente ne retarde pas les courriels', async () => {
  let finir; const lente = new Promise((suite) => { finir = suite; });
  const ordre = [];
  const b = banc({ sauvegarde: () => { ordre.push(`copie après ${b.envois.length} courriel`); return lente.then(() => ({ etat: 'faite' })); } });
  const enCours = b.appeler();
  for (let i = 0; i < 10; i += 1) await new Promise((suite) => setImmediate(suite));
  assert.deepEqual(ordre, ['copie après 1 courriel']);
  assert.equal(b.envois.length, 1, 'le résumé est parti pendant que la copie se fait');
  finir();
  assert.equal((await enCours).corps.sauvegarde, 'faite');
});

test('sans le secret du déclencheur : aucune copie, que les contributions soient ouvertes ou non', async () => {
  for (const env of [ENV, { ...ENV, CONTRIBUTIONS: 'non' }]) {
    const b = banc({ env });
    assert.equal((await b.appeler(requete({ authorization: 'Bearer autre' }))).code, env.CONTRIBUTIONS === 'oui' ? 401 : 404);
    assert.equal((await b.appeler(requete({}))).code, env.CONTRIBUTIONS === 'oui' ? 401 : 404);
    assert.equal(b.copies.length, 0);
  }
});

test('CONTRIBUTIONS fermé à l\'installation : pas de résumé, mais la copie de la semaine se fait quand même', async () => {
  for (const env of [{ ...ENV, CONTRIBUTIONS: 'non' }, { CRON_SECRET: 'secret-du-cron' }]) {
    const b = banc({ env });
    const res = await b.appeler();
    assert.deepEqual([res.code, res.corps], [200, { ok: true, resume: 'ferme', sauvegarde: 'faite' }]);
    assert.deepEqual([b.envois.length, b.copies.length], [0, 1]);
    assert.equal(res.entetes['Cache-Control'], 'no-store');
  }
  // Sans module de sauvegarde, la route reste introuvable, comme avant.
  assert.equal((await banc({ env: { ...ENV, CONTRIBUTIONS: 'non' }, sansModule: true }).appeler()).code, 404);
  // Une autre méthode aussi.
  const b = banc({ env: { ...ENV, CONTRIBUTIONS: 'non' } });
  const res = { code: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json() { return this; } };
  await require('../api/resume').creerGestionnaire({ env: { ...ENV, CONTRIBUTIONS: 'non' }, limites: {}, journal() {}, sauvegardes: { async hebdomadaire() { b.copies.push(1); return { etat: 'faite' }; } } })({ method: 'POST', query: {}, headers: { authorization: 'Bearer secret-du-cron' } }, res);
  assert.equal(res.code, 404);
  assert.equal(b.copies.length, 0);
});

test('sans module de sauvegarde, la réponse du résumé ne change pas', async () => {
  assert.deepEqual((await banc({ sansModule: true }).appeler()).corps, { ok: true, enAttente: 1, envoyes: 1 });
});

test('aucune tâche planifiée de plus : la copie vit dans celle du résumé, qui a le temps de la faire', () => {
  const vercel = require('../vercel.json');
  assert.deepEqual(vercel.crons.map((c) => c.path).sort(), ['/api/liens', '/api/resume']);
  assert.ok(vercel.functions['api/resume.js'].maxDuration >= 60);
  assert.ok(vercel.functions['api/admin.js'].maxDuration >= 60);
  const fs = require('node:fs'); const path = require('node:path');
  const assemblage = fs.readFileSync(path.join(__dirname, '..', 'lib', 'contributions.js'), 'utf8');
  assert.match(assemblage, /creerSauvegardes\(\{[^}]*\bfichiers\b[^}]*\broleDe\b/);
  assert.match(assemblage, /creerReglagesSite\(\{[^}]*\breglages\b[^}]*\broleDe\b/);
  assert.match(assemblage, /assemblage = \{[^}]*\breglagesSite\b[^}]*\bsauvegardes\b/);
});
