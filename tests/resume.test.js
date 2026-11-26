const test = require('node:test');
const assert = require('node:assert/strict');
const { creerGestionnaire } = require('../api/resume');

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } };
}
const ENV = { CONTRIBUTIONS: 'oui', CRON_SECRET: 'secret-du-cron', SITE_URL: 'https://carto.exemple' };
const requete = (headers = {}, method = 'GET') => ({ method, query: {}, headers: { host: 'carto.exemple', ...headers } });
const autorise = { authorization: 'Bearer secret-du-cron' };

// equipe : les personnes actives, avec leur rôle et leur réglage du résumé ; par défaut, les destinataires, en Approbation.
function banc({ env = ENV, enAttente = [{ titre: 'Nouvelle : X', proposeLe: '2026-11-20T15:00:00.000Z' }], destinataires = ['a@exemple.org', 'b@exemple.org'], equipe = destinataires.map((courriel) => ({ nom: '', courriel, role: 'approbation', resume: true })), panne = null } = {}) {
  const envois = [];
  const deps = {
    env, journal: () => {},
    limites: {},
    propositions: {
      async listerPropositions({ statut }) { assert.equal(statut, 'ouvertes', 'nouvelles et en vérification'); if (panne === 'notion') throw new Error('Notion en panne'); return enAttente; },
      async equipe() { return equipe; },
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

// ─── Modifications de l'équipe : annoncées à l'Administration seulement ───
const ADMIN = 'admin@exemple.org'; const APPRO = 'appro@exemple.org'; const LECTRICE = 'lectrice@exemple.org'; const ADMIN_SANS = 'sans@exemple.org';
const EQUIPE = [
  { nom: 'A', courriel: ADMIN, role: 'administration', resume: true },
  { nom: 'B', courriel: APPRO, role: 'approbation', resume: true },
  { nom: 'C', courriel: LECTRICE, role: 'lecture', resume: true },
  { nom: 'D', courriel: ADMIN_SANS, role: 'administration', resume: false },
];
const DU_PUBLIC = { genre: 'modification', titre: 'Modification : Cohorte X', proposeLe: '2026-11-20T15:00:00.000Z' };
const DE_L_EQUIPE = { genre: 'equipe', titre: "Modification de l'équipe : Outil Y", proposeLe: '2026-11-21T15:00:00.000Z' };
const titres = (m) => m.propositions.map((p) => p.titre);

test('une modification de l\'équipe n\'est annoncée qu\'aux personnes en Administration ; les autres ne voient que les propositions du public', async () => {
  const b = banc({ equipe: EQUIPE, enAttente: [DU_PUBLIC, DE_L_EQUIPE] });
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.deepEqual(res.corps, { ok: true, enAttente: 2, envoyes: 3 });
  assert.deepEqual(b.envois.map((m) => m.a), [ADMIN, APPRO, LECTRICE], 'un courriel par personne, aucun à qui a arrêté le résumé');
  assert.deepEqual(titres(b.envois[0]), [DU_PUBLIC.titre, DE_L_EQUIPE.titre]);
  assert.deepEqual(titres(b.envois[1]), [DU_PUBLIC.titre]);
  assert.deepEqual(titres(b.envois[2]), [DU_PUBLIC.titre]);
  assert.deepEqual(b.envois[0].propositions[1], { titre: DE_L_EQUIPE.titre, proposeLe: DE_L_EQUIPE.proposeLe }, 'la même forme qu\'avant');
});

test('s\'il n\'y a que des modifications de l\'équipe, seules les personnes en Administration reçoivent le résumé', async () => {
  const b = banc({ equipe: EQUIPE, enAttente: [DE_L_EQUIPE] });
  const res = await appeler(b.gestionnaire, requete(autorise));
  assert.deepEqual(res.corps, { ok: true, enAttente: 1, envoyes: 1 });
  assert.deepEqual(b.envois.map((m) => m.a), [ADMIN]);
  assert.deepEqual(titres(b.envois[0]), [DE_L_EQUIPE.titre]);
  // Sans personne en Administration à prévenir : aucun courriel.
  const c = banc({ equipe: EQUIPE.filter((x) => x.courriel !== ADMIN), enAttente: [DE_L_EQUIPE] });
  assert.deepEqual((await appeler(c.gestionnaire, requete(autorise))).corps, { ok: true, enAttente: 1, envoyes: 0 });
  assert.equal(c.envois.length, 0);
});

test('chaque résumé porte le nom de la personne qui le reçoit, pour le repère {nom} du courriel', async () => {
  const b = banc({ equipe: [{ nom: 'Tess Berthier', courriel: 'a@exemple.org', role: 'administration', resume: true }, { nom: '', courriel: 'b@exemple.org', role: 'approbation', resume: true }] });
  await appeler(b.gestionnaire, requete(autorise));
  assert.deepEqual(b.envois.map((m) => m.destinataire), ['Tess Berthier', '']);
});
