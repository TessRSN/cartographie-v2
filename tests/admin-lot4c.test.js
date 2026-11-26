const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { banc, requete, SECRETS, TESS, MAX, LEA, ODILE, T0 } = require('./aides/banc-lot4c');
const { GESTES } = require('../lib/journal');
const { ORIGINE, LIMITES } = require('../lib/reglages-site');
const { FORMAT } = require('../lib/sauvegardes');
const lien = require('../api/lien');
const proposition = require('../api/proposition');

const sansSecret = (b) => {
  for (const { action, res } of b.vues) {
    const brut = (Buffer.isBuffer(res.corps) ? '' : JSON.stringify(res.corps)) + JSON.stringify(res.entetes);
    for (const interdit of SECRETS) assert.ok(!brut.includes(interdit), `${action} : ${interdit}`);
  }
};
const ilYA = (jours) => new Date(T0 - jours * 86400000).toISOString();
const ECRITURES = { 'enregistrer-reglages': { ouvertes: false }, sauvegarder: {} };

// ─── Lire l'écran « Réglages » ───
test('reglages : toute l\'équipe lit l\'écran ; un nom, jamais un courriel ; rien de secret', async () => {
  const b = banc({ reglages: { contributionsOuvertes: false, conditions: 'Mes conditions.' } });
  for (const qui of [TESS, MAX, LEA]) {
    const res = await b.lire('reglages', {}, qui);
    assert.equal(res.code, 200, qui);
    assert.equal(res.entetes['Cache-Control'], 'no-store');
    assert.deepEqual(Object.keys(res.corps).sort(), ['conditions', 'contributions', 'installation', 'limites', 'messageFerme', 'reglages', 'sauvegardes', 'vu']);
    assert.deepEqual(res.corps.reglages, { actifs: true, lus: true, perime: false });
    assert.deepEqual(res.corps.contributions, { ouvertes: false, choix: false, source: 'panneau', modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' });
    assert.deepEqual(res.corps.conditions, { texte: 'Mes conditions.', origine: ORIGINE.conditions, modifie: true, ecarte: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'Tess Berthier' });
    assert.deepEqual(res.corps.messageFerme, { texte: ORIGINE.messageFerme, origine: ORIGINE.messageFerme, modifie: false, ecarte: false, modifieLe: null, modifiePar: null });
    assert.deepEqual(res.corps.limites, LIMITES);
    assert.deepEqual(res.corps.sauvegardes, { actives: true });
    assert.ok(!JSON.stringify(res.corps).includes('@exemple.ca'), 'aucun courriel de l\'équipe');
  }
  sansSecret(b);
});

test('reglages : le bloc « Fixé à l\'installation » dit ce qui est défini, sans jamais une valeur secrète ni l\'adresse d\'essai', async () => {
  const b = banc();
  const i = (await b.lire('reglages', {}, LEA)).corps.installation;
  assert.deepEqual([i.site, i.expedition, i.reponse], ['https://carto.exemple', 'cartographie@cartographie.rsn.quebec', 'rsn.gestion@rimuhc.ca']);
  assert.ok(i.bases.length === 8 && i.bases.every((x) => x.definie === true));
  assert.deepEqual([i.cleNotion, i.serviceEnvoi, i.adresseEssai, i.compteur, i.secretLiens, i.secretTaches, i.indexation], [true, true, true, true, true, true, false]);
  const cron = (chemin) => require('../vercel.json').crons.find((c) => c.path === chemin).schedule.split(' ')[4];
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  assert.deepEqual(i.taches, { resume: jours[Number(cron('/api/resume'))], liens: jours[Number(cron('/api/liens'))] });
  const vide = banc({ sans: ['RESEND_API_KEY', 'EMAIL_TEST_RECIPIENT', 'KV_REST_API_TOKEN', 'CRON_SECRET', 'NOTION_DB_SAUVEGARDES', 'NOTION_DB_JOURNAL'] });
  const j = (await vide.lire('reglages')).corps;
  assert.deepEqual([j.installation.serviceEnvoi, j.installation.adresseEssai, j.installation.compteur, j.installation.secretTaches, j.sauvegardes.actives], [false, false, false, false, false]);
  assert.deepEqual(j.installation.bases.filter((x) => !x.definie).map((x) => x.nom), ['Journal', 'Sauvegardes']);
  sansSecret(b); sansSecret(vide);
});

test('reglages : l\'écran relit la base à chaque ouverture ; sans base ou base illisible, il le sait', async () => {
  const b = banc();
  assert.equal((await b.lire('reglages')).corps.contributions.choix, true);
  b.poser('contributionsOuvertes', 'false', MAX);
  assert.deepEqual([(await b.lire('reglages')).corps.contributions.choix, (await b.lire('reglages')).corps.contributions.modifiePar], [false, 'Maxime Lafrenière']);
  const sans = (await banc({ sans: ['NOTION_DB_REGLAGES'] }).lire('reglages')).corps;
  assert.deepEqual([sans.reglages, sans.contributions.ouvertes, sans.contributions.source, sans.conditions.texte], [{ actifs: false, lus: true, perime: false }, true, 'defaut', ORIGINE.conditions]);
  const panne = (await banc({ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-reglages' } }).lire('reglages'));
  assert.equal(panne.code, 200);
  assert.deepEqual([panne.corps.reglages, panne.corps.contributions.ouvertes, panne.corps.contributions.source], [{ actifs: true, lus: false, perime: false }, false, 'precaution']);
});

// ─── Enregistrer ───
test('enregistrer-reglages : fermer les contributions avec un message ; écrit, noté au journal sans les textes, et le public le voit', async () => {
  const b = banc();
  const res = await b.envoyer('enregistrer-reglages', { ouvertes: false, messageFerme: ' De retour  en janvier. ', conditions: 'Mes nouvelles conditions, très longues et très précises.' });
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['change', 'ok', 'reglages']);
  assert.deepEqual(res.corps.change, { contributions: 'fermees', messageFerme: true, conditions: true });
  assert.deepEqual([res.corps.reglages.contributions.ouvertes, res.corps.reglages.contributions.modifiePar, res.corps.reglages.messageFerme.texte, res.corps.reglages.conditions.modifie], [false, 'Tess Berthier', 'De retour en janvier.', true]);
  assert.deepEqual(b.reglagesEcrits(), { contributionsOuvertes: false, messageFerme: 'De retour en janvier.', conditions: 'Mes nouvelles conditions, très longues et très précises.' });
  const journal = b.journalEcrit();
  assert.deepEqual(journal.map((l) => [l.geste, l.par, l.sur]), [['Contributions fermées', TESS, 'Réglages']]);
  assert.equal(journal[0].phrase, 'a fermé les contributions du public, et a modifié le message de fermeture et le texte des conditions');
  assert.ok(!/janvier|précises/.test(JSON.stringify(journal)), 'les textes ne sont pas recopiés au journal');
  // Le côté public suit, avec le socle partagé ; le panneau, lui, reste ouvert.
  const deps = { ...b.deps, limites: { ...b.deps.limites, async autoriserLien() { return true; } } };
  const appeler = async (g, req) => { const r = { code: null, corps: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; } }; await g(req, r); return r; };
  const refus = await appeler(lien.creerGestionnaire(deps), { method: 'POST', query: {}, headers: { host: 'carto.exemple' }, body: { courriel: 'pat@exemple.org', but: 'proposer' } });
  assert.deepEqual([refus.code, refus.corps], [403, { code: 'contributions-fermees', erreur: 'De retour en janvier.' }]);
  assert.deepEqual((await appeler(proposition.creerGestionnaire(deps), { method: 'GET', query: { etat: '1' }, headers: { host: 'carto.exemple' } })).corps, { ouvertes: false, message: 'De retour en janvier.', conditions: 'Mes nouvelles conditions, très longues et très précises.' });
  assert.equal((await b.lire('accueil')).code, 200, 'fermer les contributions ne ferme pas le panneau');
  assert.equal((await b.lire('accueil')).corps.envois.contributions, false, 'l\'accueil dit ce qui vaut pour le public');
  sansSecret(b);
});

test('enregistrer-reglages : rouvrir, changer un seul texte, ne rien changer : chaque cas a sa ligne de journal, ou aucune', async () => {
  const b = banc({ reglages: { contributionsOuvertes: false, messageFerme: 'Pause.' } });
  assert.deepEqual((await b.envoyer('enregistrer-reglages', { ouvertes: true })).corps.change, { contributions: 'ouvertes', messageFerme: false, conditions: false });
  assert.equal((await b.envoyer('enregistrer-reglages', { conditions: 'Autres conditions.' })).code, 200);
  assert.equal((await b.envoyer('enregistrer-reglages', { messageFerme: '' })).code, 200);
  const rien = await b.envoyer('enregistrer-reglages', { ouvertes: true, conditions: 'Autres conditions.', messageFerme: ORIGINE.messageFerme });
  assert.deepEqual([rien.code, rien.corps.inchange, rien.corps.change], [200, true, { contributions: null, messageFerme: false, conditions: false }]);
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.phrase]), [
    ['Contributions ouvertes', 'a ouvert les contributions du public'],
    ['Réglages modifiés', 'a modifié le texte des conditions'],
    ['Réglages modifiés', 'a modifié le message de fermeture'],
  ]);
  assert.deepEqual(b.reglagesEcrits(), { contributionsOuvertes: true, conditions: 'Autres conditions.' });
  assert.equal((await b.lire('accueil')).corps.envois.contributions, true);
});

test('enregistrer-reglages : une saisie invalide est refusée avec ses erreurs ; une demande mal formée, sans rien lire', async () => {
  const b = banc();
  const invalide = await b.envoyer('enregistrer-reglages', { conditions: '   ', messageFerme: 'x'.repeat(LIMITES.messageFerme + 1) });
  assert.deepEqual([invalide.code, invalide.corps.code, Object.keys(invalide.corps.erreurs).sort()], [400, 'invalide', ['conditions', 'messageFerme']]);
  for (const corps of [{}, { autre: 1 }, { ouvertes: 'oui' }, { ouvertes: null }, { conditions: 12 }, { messageFerme: ['a'] }, { conditions: 'x'.repeat(20001) }, { messageFerme: 'x'.repeat(2001) }]) {
    const res = await b.envoyer('enregistrer-reglages', corps);
    assert.deepEqual([res.code, res.corps], [400, { erreur: 'Demande illisible.' }], JSON.stringify(corps).slice(0, 40));
  }
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
});

test('enregistrer-reglages sans la base « Réglages », ou avec une base en panne', async () => {
  const sans = banc({ sans: ['NOTION_DB_REGLAGES'] });
  const res = await sans.envoyer('enregistrer-reglages', { ouvertes: false });
  assert.deepEqual([res.code, res.corps], [409, { code: 'reglages-absents' }]);
  const panne = banc({ pannesNotion: { 'pages.create': (a) => a.parent.database_id === 'base-reglages' } });
  const echec = await panne.envoyer('enregistrer-reglages', { ouvertes: false });
  assert.deepEqual([echec.code, echec.corps.code], [502, 'notion']);
  assert.ok(!JSON.stringify(echec.corps).includes('pages.create'));
  assert.deepEqual(panne.journalEcrit(), []);
});

// ─── Les sauvegardes ───
test('sauvegardes : la liste, pour l\'Administration, avec des noms et sans adresse de fichier', async () => {
  const b = banc();
  b.poserCopie({ faiteLe: ilYA(7) });
  const aLaMain = b.poserCopie({ faiteLe: ilYA(1), origine: 'À la demande', par: TESS });
  b.poserCopie({ faiteLe: ilYA(3), origine: 'À la demande', par: ODILE });
  const res = await b.lire('sauvegardes');
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['actives', 'copies', 'jour', 'semaines']);
  assert.deepEqual([res.corps.actives, res.corps.jour, res.corps.semaines], [true, 'lundi', 12]);
  assert.deepEqual(res.corps.copies.map((c) => [c.origine, c.par]), [['demande', 'Tess Berthier'], ['demande', 'Odile Charbonneau'], ['automatique', null]]);
  assert.deepEqual(Object.keys(res.corps.copies[0]).sort(), ['changements', 'faiteLe', 'fichier', 'id', 'incomplete', 'origine', 'par', 'taille']);
  assert.equal(res.corps.copies[0].changements, null);
  assert.equal(res.corps.copies[0].id, aLaMain);
  assert.ok(!/https?:\/\/|@exemple/.test(JSON.stringify(res.corps)));
  sansSecret(b);
});

test('sauvegarder : « Faire une copie maintenant » dépose le fichier, inscrit la ligne et le note au journal', async () => {
  const b = banc();
  const res = await b.envoyer('sauvegarder', {});
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['copie', 'ok']);
  const [copie] = b.copies();
  assert.deepEqual(res.corps.copie, { id: copie.id, faiteLe: copie.faiteLe, origine: 'demande', par: 'Tess Berthier', taille: copie.taille, fichier: true, incomplete: false, changements: { etat: 'premiere' } });
  assert.deepEqual([copie.origine, copie.par, copie.contenu.format, copie.contenu.bases.ressources.pages.length], ['À la demande', TESS, FORMAT, 2]);
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.par, l.sur, l.phrase]), [['Sauvegarde faite', TESS, 'Sauvegardes', 'a fait une copie de sauvegarde']]);
  // Le corps de la demande ne choisit rien : ni la personne, ni l'origine.
  await b.envoyer('sauvegarder', { par: MAX, origine: 'automatique', courriel: 'autre@exemple.org' });
  assert.deepEqual(b.copies().map((c) => [c.origine, c.par]), [['À la demande', TESS], ['À la demande', TESS]]);
  sansSecret(b);
});

test('sauvegarde : le fichier d\'une copie passe par le serveur, en pièce jointe, et le téléchargement est noté', async () => {
  const b = banc();
  const { id } = (await b.envoyer('sauvegarder', {})).corps.copie;
  const res = await b.lire('sauvegarde', { id });
  assert.equal(res.code, 200);
  assert.ok(Buffer.isBuffer(res.corps));
  assert.equal(JSON.parse(res.corps.toString('utf8')).format, FORMAT);
  assert.equal(res.entetes['Content-Type'], 'application/json; charset=utf-8');
  assert.match(res.entetes['Content-Disposition'], /^attachment; filename="sauvegarde-cartographie-2026-11-26-\d{4}\.json"$/);
  assert.equal(res.entetes['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  assert.equal(res.entetes.Location, undefined, 'jamais de renvoi vers une autre adresse');
  assert.deepEqual(b.journalEcrit().map((l) => l.geste), ['Sauvegarde faite', 'Sauvegarde téléchargée']);
  assert.match(b.journalEcrit()[1].phrase, /^a téléchargé la copie de sauvegarde du 2026-11-26$/);
});

test('sauvegarde : une grosse copie est comprimée pour passer la limite de réponse de l\'hébergeur', async () => {
  const b = banc();
  const id = b.poserCopie({ faiteLe: ilYA(1), contenu: { format: FORMAT, version: 1, bases: {}, remplissage: 'abcdefgh'.repeat(600000) } });
  const res = await b.lire('sauvegarde', { id }, TESS, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert.deepEqual([res.code, res.entetes['Content-Encoding']], [200, 'gzip']);
  assert.ok(res.corps.length < 1024 * 1024);
  assert.equal(JSON.parse(zlib.gunzipSync(res.corps).toString('utf8')).format, FORMAT);
  // Une petite copie part telle quelle.
  const petite = b.poserCopie({ faiteLe: ilYA(2) });
  assert.equal((await b.lire('sauvegarde', { id: petite }, TESS, { headers: { 'accept-encoding': 'gzip' } })).entetes['Content-Encoding'], undefined);
});

test('sauvegarde : rien d\'autre qu\'une ligne de la base « Sauvegardes » ne se télécharge', async () => {
  const b = banc();
  const externe = b.poserCopie({ faiteLe: ilYA(2), fichier: [{ type: 'external', name: 'piege.json', external: { url: 'https://ailleurs.exemple/piege.json' } }] });
  const pasUneCopie = b.poserCopie({ faiteLe: ilYA(3), contenu: '<html></html>' });
  for (const [id, code, statut] of [[externe, 'introuvable', 404], ['99999999-0000-4000-8000-000000000000', 'introuvable', 404], [pasUneCopie, 'invalide', 404]]) {
    const res = await b.lire('sauvegarde', { id });
    assert.deepEqual([res.code, res.corps.code], [statut, code], id);
  }
  for (const id of ['', 'fiche-1', 'https://ailleurs.exemple/piege.json', '../x']) {
    assert.deepEqual([(await b.lire('sauvegarde', { id })).code, (await b.lire('sauvegarde', { id })).corps], [400, { erreur: 'Demande illisible.' }], id);
  }
  assert.equal(b.fichiers.appels.filter((a) => a.nom === 'telecharger' && !a.args.url.includes('ancien-2')).length, 0);
  assert.deepEqual(b.journalEcrit(), []);
});

test('sans NOTION_DB_SAUVEGARDES : l\'écran dit que ce n\'est pas activé, et rien ne casse', async () => {
  const b = banc({ sans: ['NOTION_DB_SAUVEGARDES'] });
  assert.deepEqual((await b.lire('sauvegardes')).corps, { actives: false, copies: [], jour: 'lundi', semaines: 12 });
  const res = await b.envoyer('sauvegarder', {});
  assert.deepEqual([res.code, res.corps], [409, { code: 'sauvegardes-absentes' }]);
  assert.deepEqual([(await b.lire('sauvegarde', { id: '10000000-0000-4000-8000-000000000001' })).code], [409]);
  assert.equal(b.fichiers.appels.length, 0);
  assert.deepEqual(b.journalEcrit(), []);
});

test('une panne de Notion ou du dépôt pendant une copie : 502 sans détail technique, rien de noté', async () => {
  for (const pannes of [{ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-ressources' } }, { pannesFichiers: { deposer: true } }]) {
    const b = banc(pannes);
    const res = await b.envoyer('sauvegarder', {});
    assert.deepEqual([res.code, res.corps.code], [502, 'notion']);
    assert.ok(!/databases|dépôt|500/.test(JSON.stringify(res.corps)));
    assert.equal(b.copies().length, 0);
    assert.deepEqual(b.journalEcrit(), []);
  }
  const b = banc({ pannesFichiers: { telecharger: true } });
  const id = b.poserCopie({ faiteLe: ilYA(1) });
  assert.equal((await b.lire('sauvegarde', { id })).code, 502);
});

// ─── Qui peut ───
test('modifier les réglages, voir les copies, en faire une, en télécharger une : Administration seulement', async () => {
  for (const qui of [MAX, LEA]) {
    const b = banc();
    const id = b.poserCopie({ faiteLe: ilYA(1) });
    for (const [action, corps] of Object.entries(ECRITURES)) {
      const res = await b.envoyer(action, corps, qui);
      assert.deepEqual([res.code, res.corps.code], [403, 'role'], `${action} ${qui}`);
    }
    for (const [action, query] of [['sauvegardes', {}], ['sauvegarde', { id }]]) {
      const res = await b.lire(action, query, qui);
      assert.deepEqual([res.code, res.corps.code], [403, 'role'], `${action} ${qui}`);
      assert.ok(!Buffer.isBuffer(res.corps));
    }
    assert.equal(b.ecritures(), 0);
    assert.equal(b.fichiers.appels.length, 0);
    assert.deepEqual(b.journalEcrit(), []);
    assert.equal(b.copies().length, 1);
  }
});

test('une personne retirée de l\'équipe, ou sans session, n\'a accès à rien du lot', async () => {
  const b = banc();
  const id = b.poserCopie({ faiteLe: ilYA(1) });
  for (const cookie of [null, 'carto_session=faux']) {
    for (const [action, query] of [['reglages', {}], ['sauvegardes', {}], ['sauvegarde', { id }]]) assert.equal((await b.appeler(requete('GET', action, { query, cookie }))).code, 401, action);
    for (const [action, corps] of Object.entries(ECRITURES)) assert.equal((await b.appeler(requete('POST', action, { body: corps, cookie }))).code, 401, action);
  }
  for (const [action, query] of [['reglages', {}], ['sauvegardes', {}], ['sauvegarde', { id }]]) assert.equal((await b.lire(action, query, ODILE)).code, 401, action);
  for (const [action, corps] of Object.entries(ECRITURES)) assert.equal((await b.envoyer(action, corps, ODILE)).code, 401, action);
  assert.equal(b.ecritures(), 0);
  assert.equal(b.fichiers.appels.length, 0);
});

test('les actions du lot : la bonne méthode, et tout envoi doit venir du site lui-même, en JSON', async () => {
  const b = banc();
  for (const action of ['reglages', 'sauvegardes', 'sauvegarde']) assert.equal((await b.appeler(requete('POST', action, { body: {} }))).code, 405, action);
  for (const [action, corps] of Object.entries(ECRITURES)) {
    assert.equal((await b.appeler(requete('GET', action))).code, 405, action);
    assert.equal((await b.envoyer(action, corps, TESS, { headers: { origin: 'https://ailleurs.exemple' } })).code, 403, action);
    assert.equal((await b.envoyer(action, corps, TESS, { headers: { 'content-type': 'text/plain' } })).code, 403, action);
  }
  assert.equal(b.ecritures(), 0);
});

test('le verrou d\'installation fermé : le panneau entier répond 404, réglages et sauvegardes compris', async () => {
  const b = banc({ env: { CONTRIBUTIONS: 'non' }, reglages: { contributionsOuvertes: true } });
  for (const action of ['reglages', 'sauvegardes']) assert.equal((await b.lire(action)).code, 404);
  assert.equal((await b.envoyer('enregistrer-reglages', { ouvertes: true })).code, 404);
});

test('sans le journal de l\'équipe, les gestes du lot se font quand même', async () => {
  const b = banc({ sansJournal: true });
  assert.equal((await b.envoyer('enregistrer-reglages', { ouvertes: false })).code, 200);
  assert.equal((await b.envoyer('sauvegarder', {})).code, 200);
});

// ─── Le journal et la route ───
test('les gestes du lot existent dans le journal, et la page leur donne une couleur', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
  for (const geste of ['Contributions ouvertes', 'Contributions fermées', 'Réglages modifiés', 'Sauvegarde faite', 'Sauvegarde téléchargée']) {
    assert.ok(GESTES.includes(geste), geste);
    assert.ok(page.includes(`'${geste}': '`), `couleur de « ${geste} »`);
  }
});

test('la route documente ses actions, et les deux rôles sont dits dans sa table', () => {
  const route = fs.readFileSync(path.join(__dirname, '../api/admin.js'), 'utf8');
  for (const action of ['reglages', 'enregistrer-reglages', 'sauvegardes', 'sauvegarder', 'sauvegarde']) assert.match(route, new RegExp(`\\* +(GET|POST) +${action}\\b`), action);
  assert.match(route, /reglages: \{ methode: 'GET', role: 'lecture' \}/);
  for (const action of ["'enregistrer-reglages': { methode: 'POST'", "sauvegardes: { methode: 'GET'", "sauvegarder: { methode: 'POST'", "sauvegarde: { methode: 'GET'"]) assert.ok(route.includes(`${action}, role: 'administration' }`), action);
});

// ─── Corrections après relecture ───
test('écran resté ouvert : A n\'enregistre que ce qu\'il a changé, les réglages de B restent, et le journal ne lui attribue que les siens', async () => {
  const b = banc();
  const ecranDeA = (await b.lire('reglages', {}, TESS)).corps;
  assert.deepEqual(ecranDeA.vu, { ouvertes: null, messageFerme: null, conditions: null });
  // B (ici Tess aussi, seule en Administration) ferme avec un message, sur un autre écran.
  assert.equal((await b.envoyer('enregistrer-reglages', { ouvertes: false, messageFerme: 'Pause.', vu: { ouvertes: null, messageFerme: null } })).code, 200);
  // A, sans recharger, ne change que les conditions.
  const res = await b.envoyer('enregistrer-reglages', { conditions: 'Mes conditions.', vu: { conditions: ecranDeA.vu.conditions } });
  assert.deepEqual([res.code, res.corps.change], [200, { contributions: null, messageFerme: false, conditions: true }]);
  assert.deepEqual(b.reglagesEcrits(), { contributionsOuvertes: false, messageFerme: 'Pause.', conditions: 'Mes conditions.' });
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.phrase]), [
    ['Contributions fermées', 'a fermé les contributions du public, et a modifié le message de fermeture'],
    ['Réglages modifiés', 'a modifié le texte des conditions'],
  ]);
  // La réponse porte les nouvelles dates, pour l'enregistrement suivant.
  assert.ok(res.corps.reglages.vu.conditions && res.corps.reglages.vu.ouvertes);
});

test('enregistrer-reglages : 409 si la base a changé depuis ce que l\'écran a vu ; rien n\'est écrit ni noté', async () => {
  const b = banc({ reglages: { contributionsOuvertes: false, messageFerme: 'Pause.' } });
  const res = await b.envoyer('enregistrer-reglages', { ouvertes: true, messageFerme: '', conditions: 'Mes conditions.', vu: { ouvertes: null, messageFerme: null, conditions: null } });
  assert.deepEqual([res.code, res.corps], [409, { code: 'conflit', champs: ['ouvertes', 'messageFerme'] }]);
  assert.equal(b.ecritures(), 0);
  assert.deepEqual(b.journalEcrit(), []);
  // « vu » mal formé : la demande n'est pas lue.
  for (const vu of ['hier', ['a'], { ouvertes: 12 }, { conditions: 'x'.repeat(41) }, { autre: null }]) {
    assert.equal((await b.envoyer('enregistrer-reglages', { ouvertes: true, vu })).code, 400, JSON.stringify(vu));
  }
});

test('enregistrer-reglages : une écriture qui échoue après une autre réussie : 502, mais ce qui a été écrit est noté au journal', async () => {
  const b = banc({ pannesNotion: { 'pages.create': (a) => a.parent.database_id === 'base-reglages' && a.properties['Clé'].title[0].text.content === 'contributionsOuvertes' } });
  const res = await b.envoyer('enregistrer-reglages', { ouvertes: false, messageFerme: 'Pause.' });
  assert.deepEqual([res.code, res.corps.code], [502, 'notion']);
  assert.deepEqual(b.reglagesEcrits(), { messageFerme: 'Pause.' });
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.par, l.phrase]), [['Réglages modifiés', TESS, 'a modifié le message de fermeture']]);
});

test('reglages : après une lecture réussie puis une panne de la base, la vue dit que ses valeurs datent', async () => {
  let panne = false;
  const b = banc({ reglages: { contributionsOuvertes: false }, pannesNotion: { 'databases.query': (a) => panne && a.database_id === 'base-reglages' } });
  assert.deepEqual((await b.lire('reglages')).corps.reglages, { actifs: true, lus: true, perime: false });
  panne = true;
  const res = await b.lire('reglages');
  assert.deepEqual([res.code, res.corps.reglages, res.corps.contributions.ouvertes], [200, { actifs: true, lus: true, perime: true }, false]);
});

test('accueil : pour l\'Administration, la date de la dernière copie complète et un avertissement si elle date ou manque', async () => {
  const b = banc();
  assert.deepEqual((await b.lire('accueil')).corps.sauvegardes, { lue: true, derniere: null, alerte: true });
  b.poserCopie({ faiteLe: ilYA(9) });
  assert.deepEqual((await b.lire('accueil')).corps.sauvegardes, { lue: true, derniere: ilYA(9), alerte: true });
  b.poserCopie({ faiteLe: ilYA(2), origine: 'À la demande', par: TESS });
  assert.deepEqual((await b.lire('accueil')).corps.sauvegardes, { lue: true, derniere: ilYA(2), alerte: false });
  // Les autres rôles n'en voient rien ; sans la base « Sauvegardes », rien non plus.
  for (const qui of [MAX, LEA]) assert.ok(!Object.hasOwn((await b.lire('accueil', {}, qui)).corps, 'sauvegardes'));
  assert.ok(!Object.hasOwn((await banc({ sans: ['NOTION_DB_SAUVEGARDES'] }).lire('accueil')).corps, 'sauvegardes'));
  // La base « Sauvegardes » illisible ne fait pas tomber l'accueil.
  const panne = await banc({ pannesNotion: { 'databases.query': (a) => a.database_id === 'base-sauvegardes' } }).lire('accueil');
  assert.deepEqual([panne.code, panne.corps.sauvegardes], [200, { lue: false, derniere: null, alerte: false }]);
});
