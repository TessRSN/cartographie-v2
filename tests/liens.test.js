const test = require('node:test');
const assert = require('node:assert/strict');
const { adresseInterdite, controler, visiter, creerLiens, AGENT } = require('../lib/liens');
const { creerGestionnaire } = require('../api/liens');
const { PROP } = require('../lib/notion');
const { fausseBase, brute } = require('./aides/fausses-fiches');

const PUBLIQUE = '93.184.216.34';
// Un faux réseau : les noms et ce qu'ils résolvent, les adresses et ce qu'elles répondent.
function reseau({ noms = {}, reponses = {} } = {}) {
  const demandes = []; const resolus = [];
  return {
    demandes, resolus,
    async resoudre(hote) {
      resolus.push(hote);
      if (!Object.hasOwn(noms, hote)) return [{ address: PUBLIQUE, family: 4 }];
      if (noms[hote] === null) { const e = new Error('ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; }
      return [].concat(noms[hote]).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    async requete(demande) {
      demandes.push(demande);
      const cle = `${demande.methode} ${demande.url}`;
      const r = Object.hasOwn(reponses, cle) ? reponses[cle] : Object.hasOwn(reponses, demande.url) ? reponses[demande.url] : 200;
      if (r === 'reseau') throw new Error('ECONNREFUSED');
      if (r === 'delai') throw new Error('délai dépassé');
      return typeof r === 'number' ? { statut: r, location: null } : r;
    },
  };
}
const vers = (location, statut = 302) => ({ statut, location });

test('chaque plage interdite est refusée, en IPv4 comme en IPv6 ; une adresse publique passe', () => {
  const interdites = ['127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.255.255',
    '169.254.169.254', '169.254.0.1', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fdff:ffff::1', 'fe80::1', 'febf::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', 'pas-une-adresse', ''];
  for (const ip of interdites) assert.equal(adresseInterdite(ip), true, ip);
  for (const ip of [PUBLIQUE, '8.8.8.8', '172.15.255.255', '172.32.0.1', '192.167.1.1', '169.253.1.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:8.8.8.8']) assert.equal(adresseInterdite(ip), false, ip);
});

test('seulement http et https, sans identifiants ; les noms locaux et les adresses privées écrites en clair sont refusés sans résolution', async () => {
  const r = reseau();
  const refusees = ['ftp://exemple.org/x', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://exemple.org', 'pas une adresse', '', 'https://moi:secret@exemple.org/',
    'http://localhost/', 'http://LOCALHOST:8080/', 'http://localhost./', 'http://service.localhost/', 'http://imprimante.local/', 'http://base.internal/', 'http://metadata.google.internal/', 'http://intranet/',
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://127.1/', 'http://10.1.2.3/', 'http://172.16.5.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/'];
  for (const url of refusees) assert.equal((await controler(url, r)).ok, false, url);
  assert.deepEqual(r.resolus, [], 'aucune de ces adresses ne demande de résolution');
  const bonne = await controler('https://exemple.org/page', r);
  assert.deepEqual({ ok: bonne.ok, adresse: bonne.adresse, famille: bonne.famille }, { ok: true, adresse: PUBLIQUE, famille: 4 });
});

test('un nom qui résout vers une adresse privée est refusé, même si une autre de ses adresses est publique', async () => {
  for (const adresses of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1', 'fd00::5', [PUBLIQUE, '192.168.1.10'], []]) {
    const r = reseau({ noms: { 'piege.exemple.org': adresses } });
    assert.equal((await controler('https://piege.exemple.org/', r)).ok, false, String(adresses));
    const visite = await visiter('https://piege.exemple.org/', r);
    assert.equal(visite.etat, 'ignore');
    assert.equal(r.demandes.length, 0, 'aucune connexion vers une adresse interdite');
  }
});

test('la connexion se fait vers l\'adresse contrôlée, avec un agent générique et rien d\'autre', async () => {
  const r = reseau();
  assert.deepEqual(await visiter('https://exemple.org/page', r), { etat: 'ok', raison: 'http-200' });
  assert.equal(r.demandes.length, 1);
  const d = r.demandes[0];
  assert.deepEqual({ methode: d.methode, url: d.url, adresse: d.adresse, famille: d.famille }, { methode: 'HEAD', url: 'https://exemple.org/page', adresse: PUBLIQUE, famille: 4 });
  assert.deepEqual(Object.keys(d.entetes).sort(), ['Accept', 'User-Agent']);
  assert.equal(d.entetes['User-Agent'], AGENT);
  assert.ok(!/rsn|cartographie|quebec|rimuhc|@/i.test(JSON.stringify(d.entetes)));
  assert.ok(d.delaiMs > 0 && d.delaiMs <= 10000);
});

test('en panne : 404, 410, 5xx, erreur de réseau, délai dépassé, nom introuvable', async () => {
  for (const reponse of [404, 410, 500, 502, 503, 599, 'reseau', 'delai']) {
    const r = reseau({ reponses: { 'https://exemple.org/': reponse } });
    assert.equal((await visiter('https://exemple.org/', r)).etat, 'panne', String(reponse));
    assert.deepEqual(r.demandes.map((d) => d.methode), ['HEAD', 'GET'], 'GET est essayé avant de conclure');
  }
  assert.equal((await visiter('https://disparu.exemple.org/', reseau({ noms: { 'disparu.exemple.org': null } }))).etat, 'panne');
});

test('pas en panne : 2xx, 401, 403, 429 et les autres 4xx (le site bloque les robots)', async () => {
  for (const reponse of [200, 204, 304, 401, 403, 429, 400, 405, 451, 999]) {
    const r = reseau({ reponses: { 'https://exemple.org/': reponse } });
    assert.equal((await visiter('https://exemple.org/', r)).etat, 'ok', String(reponse));
  }
});

test('HEAD refusé ou en erreur : GET est essayé, et c\'est lui qui décide', async () => {
  for (const head of [405, 501, 400, 404, 503, 'reseau']) {
    const r = reseau({ reponses: { 'HEAD https://exemple.org/': head, 'GET https://exemple.org/': 200 } });
    assert.deepEqual(await visiter('https://exemple.org/', r), { etat: 'ok', raison: 'http-200' }, String(head));
    assert.deepEqual(r.demandes.map((d) => d.methode), ['HEAD', 'GET']);
  }
});

test('les redirections sont suivies à la main, chacune recontrôlée ; cinq au plus', async () => {
  const r = reseau({ reponses: { 'https://exemple.org/': vers('/nouveau', 301), 'https://exemple.org/nouveau': vers('https://autre.exemple.org/fin'), 'https://autre.exemple.org/fin': 404 } });
  assert.equal((await visiter('https://exemple.org/', r)).etat, 'panne');
  assert.deepEqual(r.resolus, ['exemple.org', 'exemple.org', 'autre.exemple.org']);
  const boucle = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`https://exemple.org/${i}`, vers(`/${i + 1}`)]));
  const r2 = reseau({ reponses: boucle });
  assert.equal((await visiter('https://exemple.org/0', r2)).etat, 'ignore');
  assert.deepEqual(r2.demandes.map((d) => d.url), [0, 1, 2, 3, 4, 5].map((i) => `https://exemple.org/${i}`), 'la visite de départ et cinq redirections, pas une de plus');
});

test('une redirection vers une adresse interdite n\'est pas suivie', async () => {
  const cibles = ['http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:8080/', 'http://[::1]/', 'file:///etc/passwd', 'http://10.0.0.1/', 'https://piege.exemple.org/', 'http://base.internal/'];
  for (const cible of cibles) {
    const r = reseau({ noms: { 'piege.exemple.org': '192.168.0.4' }, reponses: { 'https://exemple.org/': vers(cible) } });
    const visite = await visiter('https://exemple.org/', r);
    assert.equal(visite.etat, 'ignore', cible);
    assert.deepEqual(r.demandes.map((d) => d.url), ['https://exemple.org/'], cible);
  }
});

// ─── La tournée et ses écritures ───
const AUJOURDHUI = Date.parse('2026-11-26T03:30:00.000Z'); // encore le 25 novembre au Québec
function banc({ fiches, reponses = {}, noms = {}, pannes = {}, ...options } = {}) {
  const base = fausseBase({ fiches, porteurs: [], pannes });
  const r = reseau({ reponses, noms });
  const journal = [];
  const liens = creerLiens({ notion: base.notion, resoudre: r.resoudre, requete: r.requete, maintenant: () => AUJOURDHUI, journal: (...l) => journal.push(l.join(' ')), ...options });
  return { ...base, r, liens, journal };
}
const fiche = (n, o = {}) => brute({ id: `f${n}`, nom: `Fiche ${n}`, lien: `https://site${n}.exemple.org/`, ...o });

test('la tournée n\'écrit que quand l\'état change : le lien tombe (date du jour au Québec), il revient (vide)', async () => {
  const b = banc({
    fiches: [fiche(1), fiche(2), fiche(3, { lienEnPanneDepuis: '2026-11-04' }), fiche(4, { lienEnPanneDepuis: '2026-11-04' }),
      fiche(5, { statutFiche: 'Écartée' }), fiche(6, { lien: null }), fiche(7, { lien: 'http://127.0.0.1/', lienEnPanneDepuis: '2026-11-04' }), fiche(8), fiche(9), fiche(10), fiche(11), fiche(12)],
    reponses: { 'https://site2.exemple.org/': 404, 'https://site3.exemple.org/': 500, 'https://site8.exemple.org/': 403 },
  });
  const compte = await b.liens.verifierTous();
  assert.deepEqual(b.de('mettreAJourFiche'), [
    { id: 'f2', proprietes: { [PROP.lienEnPanneDepuis]: { date: { start: '2026-11-25' } } } },
    { id: 'f4', proprietes: { [PROP.lienEnPanneDepuis]: { date: null } } },
  ]);
  assert.equal(b.fiches.find((f) => f.id === 'f3').lienEnPanneDepuis, '2026-11-04', 'un lien déjà en panne garde sa date');
  assert.equal(b.fiches.find((f) => f.id === 'f7').lienEnPanneDepuis, '2026-11-04', 'un lien qu\'on ne peut pas visiter n\'est pas touché');
  assert.deepEqual(compte, { visites: 9, tombes: 1, revenus: 1, enPanne: 2, ignores: 1, nonVisites: 0, suspect: false, erreurs: 0 });
  assert.ok(!b.r.demandes.some((d) => /site5|site6|127\.0/.test(d.url)), 'ni fiche écartée, ni fiche sans lien, ni adresse locale');
  // Une seconde tournée sans changement n'écrit rien.
  await b.liens.verifierTous();
  assert.equal(b.de('mettreAJourFiche').length, 2);
});

test('si trop de liens tombent d\'un coup, la panne est sans doute de notre côté : rien n\'est noté en panne', async () => {
  const fiches = Array.from({ length: 12 }, (_, i) => fiche(i + 1, i === 0 ? { lienEnPanneDepuis: '2026-11-04' } : {}));
  const reponses = Object.fromEntries(fiches.slice(1).map((f) => [f.lien, 'reseau']));
  const b = banc({ fiches, reponses });
  const compte = await b.liens.verifierTous();
  assert.equal(compte.suspect, true);
  assert.equal(compte.tombes, 0);
  assert.deepEqual(b.de('mettreAJourFiche').map((a) => a.id), ['f1'], 'un lien revenu est quand même noté');
});

test('plusieurs liens à la fois, jamais plus que la limite ; le temps compté laisse le reste pour la prochaine fois', async () => {
  let enVol = 0; let sommet = 0; let horloge = 0;
  const fiches = Array.from({ length: 20 }, (_, i) => fiche(i + 1, { lienEnPanneDepuis: '2026-11-04' }));
  const base = fausseBase({ fiches, porteurs: [] });
  const requete = async () => { enVol += 1; sommet = Math.max(sommet, enVol); await new Promise((s) => setImmediate(s)); enVol -= 1; horloge += 1000; return { statut: 200, location: null }; };
  const liens = creerLiens({ notion: base.notion, resoudre: async () => [{ address: PUBLIQUE, family: 4 }], requete, maintenant: () => horloge, journal: () => {}, simultanes: 4, budgetMs: 9500 });
  const compte = await liens.verifierTous();
  assert.equal(sommet, 4);
  assert.ok(compte.visites >= 10 && compte.visites < 20, String(compte.visites));
  assert.equal(compte.nonVisites, 20 - compte.visites);
  assert.equal(base.de('mettreAJourFiche').length, compte.visites, 'seuls les liens visités sont notés');
});

test('une écriture qui échoue n\'arrête pas la tournée', async () => {
  const b = banc({ fiches: [fiche(1), fiche(2)], reponses: { 'https://site1.exemple.org/': 404, 'https://site2.exemple.org/': 410 }, pannes: { mettreAJourFiche: (a) => a.id === 'f1' }, seuilSuspect: 5 });
  const compte = await b.liens.verifierTous();
  assert.equal(compte.erreurs, 1);
  assert.equal(b.fiches.find((f) => f.id === 'f2').lienEnPanneDepuis, '2026-11-25');
});

test('noter un seul lien revisité : même règle, et la date en vigueur est rendue', async () => {
  const b = banc({ fiches: [fiche(1), fiche(2, { lienEnPanneDepuis: '2026-11-04' })] });
  assert.deepEqual(await b.liens.noter(b.fiches[0], { etat: 'panne' }), { change: 'tombe', depuis: '2026-11-25' });
  assert.deepEqual(await b.liens.noter(b.fiches[1], { etat: 'panne' }), { change: null, depuis: '2026-11-04' });
  assert.deepEqual(await b.liens.noter(b.fiches[1], { etat: 'ignore' }), { change: null, depuis: '2026-11-04' });
  assert.deepEqual(await b.liens.noter(b.fiches[1], { etat: 'ok' }), { change: 'revenu', depuis: null });
  assert.equal(b.de('mettreAJourFiche').length, 2);
});

// ─── La route planifiée ───
function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } };
}
const ENV = { CONTRIBUTIONS: 'oui', CRON_SECRET: 'secret-du-cron' };
const requeteHttp = (headers = {}, method = 'GET') => ({ method, query: {}, headers: { host: 'carto.exemple', ...headers } });
function route({ env = ENV, panne = false } = {}) {
  let tournees = 0;
  const compte = { visites: 3, tombes: 1, revenus: 0, enPanne: 1, ignores: 0, nonVisites: 0, suspect: false, erreurs: 0 };
  const deps = { env, journal: () => {}, limites: {}, liens: { async verifierTous() { tournees += 1; if (panne) throw new Error('Notion en panne : jeton secret'); return compte; } } };
  const g = creerGestionnaire(deps);
  return { appeler: async (req) => { const res = reponse(); await g(req, res); return res; }, tournees: () => tournees, compte };
}

test('la route des liens : GET avec le secret du planificateur lance la tournée et rend des comptes, sans rien garder en mémoire', async () => {
  const b = route();
  const res = await b.appeler(requeteHttp({ authorization: 'Bearer secret-du-cron' }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, ...b.compte });
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  assert.equal(b.tournees(), 1);
});

test('la route des liens refuse : sans secret ou avec un autre (401), sans CRON_SECRET réglé (401), contributions fermées (404), autre méthode (405)', async () => {
  for (const headers of [{}, { authorization: 'Bearer autre' }, { authorization: 'secret-du-cron' }, { authorization: 'Bearer secret-du-cron-plus' }]) {
    const b = route();
    assert.equal((await b.appeler(requeteHttp(headers))).code, 401);
    assert.equal(b.tournees(), 0);
  }
  const sansSecret = route({ env: { CONTRIBUTIONS: 'oui' } });
  assert.equal((await sansSecret.appeler(requeteHttp({ authorization: 'Bearer undefined' }))).code, 401);
  const fermee = route({ env: { ...ENV, CONTRIBUTIONS: 'non' } });
  assert.equal((await fermee.appeler(requeteHttp({ authorization: 'Bearer secret-du-cron' }))).code, 404);
  const poste = route();
  assert.equal((await poste.appeler(requeteHttp({ authorization: 'Bearer secret-du-cron' }, 'POST'))).code, 405);
  assert.equal(sansSecret.tournees() + fermee.tournees() + poste.tournees(), 0);
});

test('la route des liens : une panne répond 502 sans détail', async () => {
  const res = await route({ panne: true }).appeler(requeteHttp({ authorization: 'Bearer secret-du-cron' }));
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.corps).includes('secret'));
});

test('le planificateur : la tournée des liens passe une fois par semaine, à un autre moment que le résumé, avec soixante secondes au plus', () => {
  const vercel = require('../vercel.json');
  const liens = vercel.crons.find((c) => c.path === '/api/liens');
  const resume = vercel.crons.find((c) => c.path === '/api/resume');
  assert.match(liens.schedule, /^\d+ \d+ \* \* [0-6]$/);
  assert.notEqual(liens.schedule, resume.schedule);
  assert.notEqual(liens.schedule.split(' ').slice(0, 2).join(' '), resume.schedule.split(' ').slice(0, 2).join(' '));
  const duree = vercel.functions['api/liens.js'].maxDuration;
  assert.ok(duree > 30 && duree <= 60);
  assert.ok(vercel.headers.some((h) => h.source.includes('api/liens') && h.headers.some((x) => x.key === 'X-Robots-Tag')));
});

// ─── Constats de la relecture ───
test('plages de relais et écritures IPv6 d\'une adresse locale : refusées', () => {
  for (const ip of ['::127.0.0.1', '::7f00:1', '::ffff:0:127.0.0.1', '2001:0:7f00:1::1', '192.88.99.1', '2001:10::1', '3fff::1', '5f00::1']) assert.equal(adresseInterdite(ip), true, ip);
  for (const ip of ['2606:2800:220:1:248:1893:25c8:1946', '2a00:1450:4001:81b::200e', '93.184.216.34']) assert.equal(adresseInterdite(ip), false, ip);
});

test('seuls les ports habituels du web sont visités', async () => {
  const r = reseau();
  for (const url of ['http://exemple.org:22/', 'https://exemple.org:6379/', 'http://exemple.org:8080/']) {
    assert.deepEqual(await controler(url, r), { ok: false, raison: 'interdite' }, url);
  }
  assert.equal((await controler('https://exemple.org:443/x', r)).ok, true);
  assert.equal((await controler('http://exemple.org:80/x', r)).ok, true);
  assert.equal(r.demandes.length, 0);
});

test('un nom qui n\'existe pas est une panne ; une résolution en échec passager ne dit rien', async () => {
  const passager = async () => { const e = new Error('EAI_AGAIN'); e.code = 'EAI_AGAIN'; throw e; };
  assert.deepEqual(await visiter('https://exemple.org/', { resoudre: passager, requete: async () => ({ statut: 200 }) }), { etat: 'ignore', raison: 'resolution' });
  const r = reseau({ noms: { 'disparu.exemple.org': null } });
  assert.deepEqual(await visiter('https://disparu.exemple.org/', r), { etat: 'panne', raison: 'nom' });
});

test('parmi les adresses d\'un nom, une adresse IPv4 est préférée', async () => {
  const r = reseau({ noms: { 'double.exemple.org': ['2606:2800:220:1:248:1893:25c8:1946', PUBLIQUE] } });
  const c = await controler('https://double.exemple.org/', r);
  assert.equal(c.adresse, PUBLIQUE);
  assert.equal(c.famille, 4);
});

test('une visite a une échéance totale, tous sauts compris : un lien lent ne retient pas la tournée', async () => {
  const lent = (ms) => new Promise((suite) => setTimeout(suite, ms));
  const requete = async (d) => { await lent(60); return { statut: 302, location: `${d.url}x` }; };
  const debut = Date.now();
  const r = await visiter('https://lent.exemple.org/', { resoudre: async () => [{ address: PUBLIQUE, family: 4 }], requete, echeanceMs: 150 });
  assert.deepEqual(r, { etat: 'ignore', raison: 'delai' });
  assert.ok(Date.now() - debut < 500, `${Date.now() - debut} ms`);
  // Un serveur de noms qui ne répond jamais ne retient rien non plus.
  const debut2 = Date.now();
  const muet = await visiter('https://muet.exemple.org/', { resoudre: () => new Promise(() => {}), requete: async () => ({ statut: 200 }), echeanceMs: 120 });
  assert.deepEqual(muet, { etat: 'ignore', raison: 'delai' });
  assert.ok(Date.now() - debut2 < 500);
});

test('la tournée écrit au fil de l\'eau : un lien lent en fin de liste ne fait pas perdre les autres', async () => {
  const fiches = [brute({ id: 'f1', nom: 'A', lien: 'https://tombe.exemple.org/' }), brute({ id: 'f2', nom: 'B', lien: 'https://lent.exemple.org/' })];
  const base = fausseBase({ fiches });
  const requete = async (d) => { if (d.url.includes('lent')) await new Promise((s) => setTimeout(s, 80)); return { statut: d.url.includes('tombe') ? 404 : 200, location: null }; };
  const service = creerLiens({ notion: base.notion, resoudre: async () => [{ address: PUBLIQUE, family: 4 }], requete, simultanes: 1, journal: () => {} });
  const compte = await service.verifierTous();
  assert.equal(compte.tombes, 1);
  const ordre = base.appels.map((a) => a.nom);
  assert.ok(ordre.indexOf('mettreAJourFiche') >= 0);
});
