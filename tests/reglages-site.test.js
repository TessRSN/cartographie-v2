const test = require('node:test');
const assert = require('node:assert/strict');
const { creerReglages, COLONNES } = require('../lib/reglages');
const { etatPublic, lireEtatPublic, valider, creerReglagesSite, ORIGINE, LIMITES } = require('../lib/reglages-site');
const { TEXTES } = require('../public/js/texte.js');
const { fauxNotion } = require('./aides/faux-notion');

const OUI = { CONTRIBUTIONS: 'oui', NOTION_DB_REGLAGES: 'base-reglages' };
const lus = (reglages) => ({ etat: 'lus', perime: false, reglages: Object.fromEntries(Object.entries(reglages).map(([cle, valeur]) => [cle, valeur && valeur.illisible ? { illisible: true } : { valeur, illisible: false }])) });

function poser(faux, cle, json, le = '2026-11-20T10:00:00.000Z') {
  const id = `ligne-${cle}`;
  faux.pages.set(id, { id, parent: { database_id: 'base-reglages' }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: cle } }] }, [COLONNES.modifieLe]: { date: { start: le } }, [COLONNES.modifiePar]: { email: 'tess@exemple.ca' } } });
  faux.blocs.set(id, [{ id: `${id}-bloc`, type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
}
function socle({ reglages = {}, env = OUI, pannes = {} } = {}) {
  const faux = fauxNotion({ pannes });
  for (const [cle, valeur] of Object.entries(reglages)) poser(faux, cle, JSON.stringify(valeur));
  let instant = Date.parse('2026-11-26T12:00:00.000Z');
  const horloge = { avancer: (ms) => { instant += ms; } };
  const lignes = [];
  return { faux, horloge, lignes, socle: creerReglages(faux.client, env, { maintenant: () => instant, journal: (...l) => lignes.push(l.join(' ')) }) };
}

// ─── L'état public : une fonction pure ───
test('les textes d\'origine sont ceux du code', () => {
  assert.equal(ORIGINE.conditions, TEXTES.contribuer.conditions);
  assert.equal(ORIGINE.messageFerme, TEXTES.contribuer.fermees);
  assert.ok(ORIGINE.messageFerme.length > 20 && ORIGINE.messageFerme.length <= LIMITES.messageFerme);
});

test('sans base « Réglages », ou sans réglage : exactement comme avant, selon CONTRIBUTIONS', () => {
  for (const tous of [{ etat: 'absente', reglages: {} }, lus({})]) {
    assert.deepEqual(etatPublic(tous, { CONTRIBUTIONS: 'oui' }), { ouvertes: true, source: 'defaut', message: null, conditions: ORIGINE.conditions });
    for (const env of [{}, { CONTRIBUTIONS: 'non' }, { CONTRIBUTIONS: 'OUI' }]) {
      assert.deepEqual(etatPublic(tous, env), { ouvertes: false, source: 'installation', message: null, conditions: ORIGINE.conditions });
    }
  }
});

test('le verrou d\'installation gagne toujours : le panneau ne peut pas ouvrir ce que CONTRIBUTIONS ferme', () => {
  const e = etatPublic(lus({ contributionsOuvertes: true, messageFerme: 'Fermé pour l\'été.' }), { CONTRIBUTIONS: 'non' });
  assert.deepEqual([e.ouvertes, e.source, e.message], [false, 'installation', null]);
});

test('le panneau ferme le côté public, avec son message ou le message d\'origine', () => {
  assert.deepEqual(etatPublic(lus({ contributionsOuvertes: false }), OUI), { ouvertes: false, source: 'panneau', message: ORIGINE.messageFerme, conditions: ORIGINE.conditions });
  assert.equal(etatPublic(lus({ contributionsOuvertes: false, messageFerme: 'De retour en janvier.' }), OUI).message, 'De retour en janvier.');
  // Un message illisible, vide, trop long ou d'une autre forme : le message d'origine.
  for (const mauvais of [{ illisible: true }, '', '   ', 42, 'x'.repeat(LIMITES.messageFerme + 1), ['a']]) {
    assert.equal(etatPublic(lus({ contributionsOuvertes: false, messageFerme: mauvais }), OUI).message, ORIGINE.messageFerme);
  }
  const ouvert = etatPublic(lus({ contributionsOuvertes: true, messageFerme: 'De retour en janvier.' }), OUI);
  assert.deepEqual([ouvert.ouvertes, ouvert.source, ouvert.message], [true, 'panneau', null]);
});

test('dans le doute, rien ne s\'ouvre : réglage illisible, valeur qui ne dit ni vrai ni faux, base illisible sans rien de connu', () => {
  for (const tous of [lus({ contributionsOuvertes: { illisible: true } }), lus({ contributionsOuvertes: 'oui' }), lus({ contributionsOuvertes: null }), { etat: 'inconnu', reglages: {} }, null, undefined]) {
    const e = etatPublic(tous, OUI);
    assert.deepEqual([e.ouvertes, e.source, e.message], [false, 'precaution', TEXTES.contribuer.indisponibles]);
    assert.equal(e.conditions, ORIGINE.conditions);
  }
});

test('le texte des conditions : celui du panneau s\'il est valable, sinon celui du code', () => {
  assert.equal(etatPublic(lus({ conditions: 'J\'accepte les conditions du RSN.' }), OUI).conditions, 'J\'accepte les conditions du RSN.');
  for (const mauvais of [{ illisible: true }, '', ' ', 7, {}, 'x'.repeat(LIMITES.conditions + 1)]) {
    assert.equal(etatPublic(lus({ conditions: mauvais }), OUI).conditions, ORIGINE.conditions);
  }
});

// ─── La lecture pour les pages publiques ───
test('lireEtatPublic : sans socle ou sans base, aucun appel à Notion et l\'état d\'avant', async () => {
  assert.deepEqual(await lireEtatPublic(null, { CONTRIBUTIONS: 'oui' }), { ouvertes: true, source: 'defaut', message: null, conditions: ORIGINE.conditions });
  const s = socle({ env: { CONTRIBUTIONS: 'oui' } });
  assert.equal((await lireEtatPublic(s.socle, { CONTRIBUTIONS: 'oui' })).ouvertes, true);
  assert.equal(s.faux.appels.length, 0);
  // Verrou d'installation fermé : la base n'est même pas lue.
  const f = socle({ reglages: { contributionsOuvertes: true } });
  assert.equal((await lireEtatPublic(f.socle, { CONTRIBUTIONS: 'non', NOTION_DB_REGLAGES: 'base-reglages' })).source, 'installation');
  assert.equal(f.faux.appels.length, 0);
});

test('lireEtatPublic : la base est lue une fois par minute, pas à chaque visite', async () => {
  const s = socle({ reglages: { contributionsOuvertes: false, messageFerme: 'Pause.' } });
  for (let i = 0; i < 5; i += 1) assert.deepEqual([(await lireEtatPublic(s.socle, OUI)).ouvertes, (await lireEtatPublic(s.socle, OUI)).message], [false, 'Pause.']);
  assert.equal(s.faux.de('databases.query').length, 1);
  s.horloge.avancer(61000);
  await lireEtatPublic(s.socle, OUI);
  assert.equal(s.faux.de('databases.query').length, 2);
});

test('lireEtatPublic : une panne de Notion ne lève jamais ; la dernière valeur connue vaut, et sans elle rien ne s\'ouvre', async () => {
  let panne = false;
  const s = socle({ reglages: { contributionsOuvertes: false }, pannes: { 'databases.query': () => panne } });
  assert.equal((await lireEtatPublic(s.socle, OUI)).source, 'panneau');
  panne = true; s.horloge.avancer(120000);
  const apres = await lireEtatPublic(s.socle, OUI);
  assert.deepEqual([apres.ouvertes, apres.source], [false, 'panneau'], 'fermé reste fermé pendant la panne');
  const froid = socle({ pannes: { 'databases.query': true } });
  assert.deepEqual([(await lireEtatPublic(froid.socle, OUI)).ouvertes, (await lireEtatPublic(froid.socle, OUI)).source], [false, 'precaution']);
  // Un socle qui lève : pareil.
  const casse = { active: () => true, lireTousVite: async () => { throw new Error('cassé'); } };
  assert.equal((await lireEtatPublic(casse, OUI)).source, 'precaution');
});

test('lireTousVite : Notion lent, la page n\'attend pas ; la dernière valeur connue est servie, et la lecture finit en arrière-plan', async () => {
  const s = socle({ reglages: { contributionsOuvertes: false } });
  assert.equal((await s.socle.lireTousVite()).reglages.contributionsOuvertes.valeur, false);
  s.horloge.avancer(61000);
  // Notion ne répond plus avant longtemps.
  const vraie = s.faux.client.databases.query;
  let liberer; const bloque = new Promise((suite) => { liberer = suite; });
  s.faux.client.databases.query = async (a) => { await bloque; return vraie(a); };
  const debut = Date.now();
  const lent = await s.socle.lireTousVite({ attenteMs: 30, attenteSansRienMs: 5000 });
  assert.ok(Date.now() - debut < 1000);
  assert.deepEqual([lent.etat, lent.perime, lent.reglages.contributionsOuvertes.valeur], ['lus', true, false]);
  liberer();
  await s.socle.lireTous();
  // Sans rien de connu : l'attente est plus longue, puis « inconnu ».
  const froid = socle({ reglages: { contributionsOuvertes: true } });
  froid.faux.client.databases.query = () => new Promise(() => {});
  const rien = await froid.socle.lireTousVite({ attenteMs: 5, attenteSansRienMs: 40 });
  assert.deepEqual([rien.etat, Object.keys(rien.reglages).length], ['inconnu', 0]);
});

// ─── La vérification de ce que l'Administration enregistre ───
test('valider : les trois réglages, nettoyés ; seuls ceux qui sont donnés comptent', () => {
  assert.deepEqual(valider({}), { ok: true, valeurs: {} });
  assert.deepEqual(valider({ ouvertes: false, messageFerme: '  De retour\n en  janvier. ', conditions: ' J\'accepte.\r\n\r\nVraiment. ' }),
    { ok: true, valeurs: { ouvertes: false, messageFerme: 'De retour en janvier.', conditions: 'J\'accepte.\n\nVraiment.' } });
  // Un message vide veut dire « le message d'origine ».
  assert.deepEqual(valider({ messageFerme: '  ' }), { ok: true, valeurs: { messageFerme: '' } });
});

test('valider : ce qui est refusé, avec un message par champ', () => {
  for (const [saisie, champ] of [
    [{ ouvertes: 'oui' }, 'ouvertes'], [{ ouvertes: 1 }, 'ouvertes'], [{ messageFerme: 12 }, 'messageFerme'], [{ messageFerme: 'x'.repeat(LIMITES.messageFerme + 1) }, 'messageFerme'],
    [{ conditions: '' }, 'conditions'], [{ conditions: '   ' }, 'conditions'], [{ conditions: null }, 'conditions'], [{ conditions: 'x'.repeat(LIMITES.conditions + 1) }, 'conditions'],
  ]) {
    const v = valider(saisie);
    assert.equal(v.ok, false, JSON.stringify(saisie).slice(0, 60));
    assert.deepEqual(Object.keys(v.erreurs), [champ]);
    assert.ok(v.erreurs[champ].length > 10 && !/—/.test(v.erreurs[champ]));
  }
});

// ─── Le module du panneau ───
const ROLES = { 'tess@exemple.ca': 'administration', 'max@exemple.ca': 'approbation', 'lea@exemple.ca': 'lecture' };
function module_({ reglages = {}, env = OUI, pannes = {} } = {}) {
  const s = socle({ reglages, env, pannes });
  const site = creerReglagesSite({ reglages: s.socle, env, roleDe: async (courriel) => ROLES[courriel] || null });
  const ecrits = () => Object.fromEntries([...s.faux.pages.values()].filter((p) => !p.archived).map((p) => [p.properties[COLONNES.cle].title[0].text.content, JSON.parse(s.faux.blocs.get(p.id)[0].code.rich_text.map((x) => x.text.content).join(''))]));
  const ecritures = () => ['pages.create', 'pages.update', 'blocks.update', 'blocks.children.append'].reduce((n, nom) => n + s.faux.de(nom).length, 0);
  return { ...s, site, ecrits, ecritures };
}

test('lire : ce que l\'écran montre, avec qui a changé quoi et quand', async () => {
  const m = module_({ reglages: { contributionsOuvertes: false, conditions: 'Mes conditions.' } });
  const vue = await m.site.lire();
  assert.deepEqual(vue.reglages, { actifs: true, lus: true, perime: false });
  assert.deepEqual(vue.contributions, { ouvertes: false, choix: false, source: 'panneau', modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'tess@exemple.ca' });
  assert.deepEqual(vue.messageFerme, { texte: ORIGINE.messageFerme, origine: ORIGINE.messageFerme, modifie: false, ecarte: false, modifieLe: null, modifiePar: null });
  assert.deepEqual(vue.conditions, { texte: 'Mes conditions.', origine: ORIGINE.conditions, modifie: true, ecarte: false, modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: 'tess@exemple.ca' });
  assert.deepEqual(vue.limites, LIMITES);
});

test('lire : sans base, ou base illisible, l\'écran le sait et montre les textes d\'origine', async () => {
  const sans = await module_({ env: { CONTRIBUTIONS: 'oui' } }).site.lire();
  assert.deepEqual([sans.reglages, sans.contributions.ouvertes, sans.contributions.choix, sans.contributions.source], [{ actifs: false, lus: true, perime: false }, true, true, 'defaut']);
  const panne = await module_({ pannes: { 'databases.query': true } }).site.lire();
  assert.deepEqual([panne.reglages, panne.contributions.ouvertes, panne.contributions.choix, panne.contributions.source, panne.conditions.texte], [{ actifs: true, lus: false, perime: false }, false, false, 'precaution', ORIGINE.conditions]);
  // Un texte enregistré qui ne vaut plus rien est montré comme écarté.
  const ecarte = await module_({ reglages: { conditions: 42 } }).site.lire();
  assert.deepEqual([ecarte.conditions.texte, ecarte.conditions.modifie, ecarte.conditions.ecarte], [ORIGINE.conditions, false, true]);
});

test('enregistrer : seule l\'Administration, vérifiée dans le module ; les autres rôles et les inconnus sont refusés sans rien écrire', async () => {
  for (const par of ['max@exemple.ca', 'lea@exemple.ca', 'inconnue@exemple.org', '', null, undefined]) {
    const m = module_();
    assert.deepEqual(await m.site.enregistrer({ ouvertes: false, par }), { ok: false, code: 'role' }, String(par));
    assert.equal(m.ecritures(), 0);
  }
  // Le rôle illisible : refusé aussi.
  const s = socle();
  const site = creerReglagesSite({ reglages: s.socle, env: OUI, roleDe: async () => { throw new Error('Notion en panne'); } });
  await assert.rejects(site.enregistrer({ ouvertes: false, par: 'tess@exemple.ca' }));
  assert.equal(s.faux.de('pages.create').length, 0);
});

test('enregistrer : fermer, puis rouvrir ; chaque réglage changé est écrit avec la personne, et le retour dit ce qui a changé', async () => {
  const m = module_();
  const ferme = await m.site.enregistrer({ ouvertes: false, messageFerme: 'De retour en janvier.', conditions: ORIGINE.conditions, par: 'tess@exemple.ca' });
  assert.deepEqual(ferme, { ok: true, change: { contributions: 'fermees', messageFerme: true, conditions: false } });
  assert.deepEqual(m.ecrits(), { contributionsOuvertes: false, messageFerme: 'De retour en janvier.' });
  assert.deepEqual(await lireEtatPublic(m.socle, OUI), { ouvertes: false, source: 'panneau', message: 'De retour en janvier.', conditions: ORIGINE.conditions });
  const rouvre = await m.site.enregistrer({ ouvertes: true, par: 'tess@exemple.ca' });
  assert.deepEqual(rouvre, { ok: true, change: { contributions: 'ouvertes', messageFerme: false, conditions: false } });
  assert.equal(m.ecrits().contributionsOuvertes, true);
  assert.equal((await lireEtatPublic(m.socle, OUI)).ouvertes, true);
  assert.ok([...m.faux.pages.values()].every((p) => p.properties[COLONNES.modifiePar].email === 'tess@exemple.ca'));
});

test('enregistrer : rien de changé, rien d\'écrit ; un texte revenu à l\'origine retire le réglage', async () => {
  const m = module_({ reglages: { contributionsOuvertes: false, conditions: 'Mes conditions.', messageFerme: 'Pause.' } });
  assert.deepEqual(await m.site.enregistrer({ ouvertes: false, conditions: 'Mes conditions.', messageFerme: 'Pause.', par: 'tess@exemple.ca' }), { ok: true, inchange: true, change: { contributions: null, messageFerme: false, conditions: false } });
  assert.equal(m.ecritures(), 0);
  const retour = await m.site.enregistrer({ conditions: ORIGINE.conditions, messageFerme: '', par: 'tess@exemple.ca' });
  assert.deepEqual(retour, { ok: true, change: { contributions: null, messageFerme: true, conditions: true } });
  assert.deepEqual(m.ecrits(), { contributionsOuvertes: false });
  // Sans réglage, « ouvert » est déjà l'état : rien à écrire.
  const neuf = module_();
  assert.equal((await neuf.site.enregistrer({ ouvertes: true, par: 'tess@exemple.ca' })).inchange, true);
  assert.equal(neuf.ecritures(), 0);
});

test('enregistrer : une saisie invalide, l\'absence de base, une base illisible', async () => {
  const m = module_();
  const invalide = await m.site.enregistrer({ conditions: '', par: 'tess@exemple.ca' });
  assert.deepEqual([invalide.ok, invalide.code, Object.keys(invalide.erreurs)], [false, 'invalide', ['conditions']]);
  assert.equal(m.ecritures(), 0);
  assert.deepEqual(await module_({ env: { CONTRIBUTIONS: 'oui' } }).site.enregistrer({ ouvertes: false, par: 'tess@exemple.ca' }), { ok: false, code: 'reglages-absents' });
  // Base illisible : on n'écrit pas par-dessus ce qu'on ne peut pas lire ; la panne remonte.
  const panne = module_({ pannes: { 'databases.query': true } });
  await assert.rejects(panne.site.enregistrer({ ouvertes: true, par: 'tess@exemple.ca' }));
  assert.equal(panne.ecritures(), 0);
});

test('enregistrer : un réglage illisible dans la base est remplacé par ce que l\'Administration choisit', async () => {
  const m = module_();
  poser(m.faux, 'contributionsOuvertes', 'pas du json');
  assert.equal((await lireEtatPublic(m.socle, OUI)).source, 'precaution');
  assert.deepEqual((await m.site.enregistrer({ ouvertes: true, par: 'tess@exemple.ca' })).change.contributions, 'ouvertes');
  assert.deepEqual(await lireEtatPublic(m.socle, OUI), { ouvertes: true, source: 'panneau', message: null, conditions: ORIGINE.conditions });
});

test('installation : des états et des valeurs publiques, jamais un secret ni l\'adresse d\'essai', () => {
  const env = {
    ...OUI, SITE_URL: 'https://carto.exemple', NOTION_KEY: 'ntn_cle_secrete', RESEND_API_KEY: 're_cle_secrete', JWT_SECRET: 'jwt-secret', CRON_SECRET: 'cron-secret',
    EMAIL_TEST_RECIPIENT: 'boite-d-essai@exemple.org', KV_REST_API_URL: 'https://kv.exemple', KV_REST_API_TOKEN: 'kv-jeton-secret', CARTO_BASEMAP_KEY: 'cle-carte',
    NOTION_DB_RESSOURCES: 'id-ressources', NOTION_DB_PORTEURS: 'id-porteurs', NOTION_DB_SAUVEGARDES: 'id-sauvegardes', INDEXATION: 'oui',
  };
  const site = creerReglagesSite({ reglages: null, env, roleDe: async () => null });
  const i = site.installation({ origine: 'https://carto.exemple' });
  assert.equal(i.site, 'https://carto.exemple');
  assert.equal(i.expedition, 'cartographie@cartographie.rsn.quebec');
  assert.equal(i.reponse, 'rsn.gestion@rimuhc.ca');
  assert.deepEqual(i.bases.map((b) => [b.nom, b.definie]), [['Ressources', true], ['Porteurs', true], ['Propositions', false], ['Approbateurs', false], ['Versions', false], ['Journal', false], ['Réglages', true], ['Sauvegardes', true]]);
  assert.deepEqual([i.cleNotion, i.serviceEnvoi, i.adresseEssai, i.compteur, i.secretLiens, i.secretTaches, i.indexation], [true, true, true, true, true, true, true]);
  assert.deepEqual(i.durees, { proposer: { n: 24, unite: 'h' }, panneau: { n: 1, unite: 'h' }, session: { n: 7, unite: 'j' } });
  assert.deepEqual(i.plafonds, { parCourriel: 3, parIp: 10, parJour: 80 });
  const brut = JSON.stringify(i);
  for (const interdit of ['ntn_cle', 're_cle', 'jwt-secret', 'cron-secret', 'boite-d-essai', 'kv-jeton', 'kv.exemple', 'id-ressources', 'id-sauvegardes', 'cle-carte']) assert.ok(!brut.includes(interdit), interdit);
  // Rien de défini : tout est « non », rien ne casse.
  const vide = creerReglagesSite({ reglages: null, env: {}, roleDe: async () => null }).installation({ origine: '' });
  assert.deepEqual([vide.site, vide.cleNotion, vide.serviceEnvoi, vide.adresseEssai, vide.compteur, vide.secretLiens, vide.secretTaches, vide.indexation], ['', false, false, false, false, false, false, false]);
  assert.ok(vide.bases.every((b) => !b.definie));
  // Une adresse d'expédition réglée à l'installation est montrée : elle est dans chaque courriel.
  assert.equal(creerReglagesSite({ reglages: null, env: { RESEND_FROM_EMAIL: 'envoi@exemple.org' }, roleDe: async () => null }).installation({ origine: '' }).expedition, 'envoi@exemple.org');
});

// ─── Corrections après relecture ───
test('lire : l\'écran reçoit, pour chaque réglage, la date de la ligne qu\'il a vue (ou rien)', async () => {
  const m = module_({ reglages: { contributionsOuvertes: false } });
  assert.deepEqual((await m.site.lire()).vu, { ouvertes: '2026-11-20T10:00:00.000Z', messageFerme: null, conditions: null });
});

test('enregistrer : si la base a changé depuis ce que l\'écran a vu, rien n\'est écrit et le conflit nomme les réglages', async () => {
  const m = module_();
  const vu = (await m.site.lire()).vu;
  // Une autre personne ferme avec un message pendant que l'écran reste ouvert.
  poser(m.faux, 'contributionsOuvertes', 'false', '2026-11-26T11:00:00.000Z');
  poser(m.faux, 'messageFerme', '"Pause."', '2026-11-26T11:00:00.000Z');
  const avant = m.ecritures();
  assert.deepEqual(await m.site.enregistrer({ ouvertes: true, messageFerme: '', conditions: 'Mes conditions.', vu, par: 'tess@exemple.ca' }), { ok: false, code: 'conflit', champs: ['ouvertes', 'messageFerme'] });
  assert.equal(m.ecritures(), avant);
  // Ce qui n'est pas en conflit, envoyé seul, passe : les réglages de l'autre personne restent.
  assert.deepEqual(await m.site.enregistrer({ conditions: 'Mes conditions.', vu: { conditions: vu.conditions }, par: 'tess@exemple.ca' }), { ok: true, change: { contributions: null, messageFerme: false, conditions: true } });
  assert.deepEqual(m.ecrits(), { contributionsOuvertes: false, messageFerme: 'Pause.', conditions: 'Mes conditions.' });
  // Une ligne retirée entre-temps est un changement aussi.
  const n = module_({ reglages: { conditions: 'Anciennes.' } });
  const vuN = (await n.site.lire()).vu;
  n.faux.pages.get('ligne-conditions').archived = true;
  assert.deepEqual(await n.site.enregistrer({ conditions: 'Nouvelles.', vu: vuN, par: 'tess@exemple.ca' }), { ok: false, code: 'conflit', champs: ['conditions'] });
});

test('enregistrer : une écriture qui échoue après une autre réussie remonte en erreur, avec ce qui a déjà été écrit', async () => {
  const m = module_({ pannes: { 'pages.create': (a) => a.properties[COLONNES.cle].title[0].text.content === 'contributionsOuvertes' } });
  await assert.rejects(m.site.enregistrer({ ouvertes: false, messageFerme: 'Pause.', par: 'tess@exemple.ca' }), (err) => {
    assert.deepEqual(err.partiel, { contributions: null, messageFerme: true, conditions: false });
    return true;
  });
  assert.deepEqual(m.ecrits(), { messageFerme: 'Pause.' });
  // Rien d'écrit avant la panne : pas de « partiel ».
  const rien = module_({ pannes: { 'pages.create': true } });
  await assert.rejects(rien.site.enregistrer({ ouvertes: false, par: 'tess@exemple.ca' }), (err) => err.partiel === undefined);
});

test('lire : après une lecture réussie puis une panne, la vue dit que ses valeurs datent', async () => {
  let panne = false;
  const m = module_({ reglages: { contributionsOuvertes: false }, pannes: { 'databases.query': () => panne } });
  assert.deepEqual((await m.site.lire()).reglages, { actifs: true, lus: true, perime: false });
  panne = true;
  const vue = await m.site.lire();
  assert.deepEqual([vue.reglages, vue.contributions.ouvertes], [{ actifs: true, lus: true, perime: true }, false]);
});

test('deux lignes pour « contributionsOuvertes » qui se contredisent, ou dont une est illisible : fermé, la plus sûre gagne', async () => {
  const double = (json, le) => (faux) => {
    faux.pages.set('double', { id: 'double', parent: { database_id: 'base-reglages' }, properties: { [COLONNES.cle]: { title: [{ type: 'text', text: { content: 'contributionsOuvertes' } }] }, [COLONNES.modifieLe]: { date: { start: le } } } });
    faux.blocs.set('double', [{ id: 'double-bloc', type: 'code', code: { rich_text: [{ type: 'text', text: { content: json } }], language: 'json' } }]);
  };
  for (const [premiere, seconde, le] of [[true, 'false', '2026-11-01T10:00:00.000Z'], [true, 'false', '2026-11-25T10:00:00.000Z'], [true, 'pas du json', '2026-11-01T10:00:00.000Z']]) {
    const s = socle({ reglages: { contributionsOuvertes: premiere } });
    double(seconde, le)(s.faux);
    const e = await lireEtatPublic(s.socle, OUI);
    assert.deepEqual([e.ouvertes, e.source], [false, 'precaution'], `${premiere} / ${seconde}`);
  }
  // Deux lignes qui disent la même chose : pas de doute.
  const pareil = socle({ reglages: { contributionsOuvertes: true } });
  double('true', '2026-11-01T10:00:00.000Z')(pareil.faux);
  assert.deepEqual([(await lireEtatPublic(pareil.socle, OUI)).ouvertes, (await lireEtatPublic(pareil.socle, OUI)).source], [true, 'panneau']);
  // L'Administration tranche : une seule ligne reste.
  const m = module_({ reglages: { contributionsOuvertes: true } });
  double('false', '2026-11-25T10:00:00.000Z')(m.faux);
  assert.equal((await m.site.lire()).contributions.source, 'precaution');
  assert.equal((await m.site.enregistrer({ ouvertes: true, par: 'tess@exemple.ca' })).change.contributions, 'ouvertes');
  assert.deepEqual(await lireEtatPublic(m.socle, OUI), { ouvertes: true, source: 'panneau', message: null, conditions: ORIGINE.conditions });
});
