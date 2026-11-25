const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../api/admin');
const { signer } = require('../lib/jetons');
const { banc: bancLot3, repereDe, SECRET, TESS, LEA } = require('./aides/banc-lot3');

const PARTIE = 'partie@exemple.ca';
const LECTURES = ['porteurs', 'porteur', 'qualite'];
const ECRITURES = ['enregistrer-porteur', 'creer-porteur', 'geocoder', 'fusionner-porteurs', 'fusionner-valeurs', 'revisiter-lien'];

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.corps = o; return this; }, send(o) { this.corps = o; return this; } };
}
const temoin = (courriel = TESS) => `carto_session=${signer('session', { courriel }, { secret: SECRET })}`;
function requete(method, action, { body, query = {}, headers = {}, cookie = temoin() } = {}) {
  const propres = method === 'POST' ? { origin: 'https://carto.exemple', 'content-type': 'application/json' } : {};
  return { method, body, query: { action, ...query }, headers: { host: 'carto.exemple', ...(cookie ? { cookie } : {}), ...propres, ...headers } };
}
function banc(options) {
  const b = bancLot3(options);
  const deps = { env: b.env, journal: (...l) => b.journal.push(l.join(' ')), limites: { async consommerJeton() { return true; } }, propositions: b.propositions, notion: b.notion, ressources: b.ressources, porteurs: b.porteursService, qualite: b.qualite, liens: b.liens };
  const gestionnaire = admin.creerGestionnaire(deps);
  const vues = [];
  b.appeler = async (req) => { const res = reponse(); await gestionnaire(req, res); vues.push(res); return res; };
  b.vues = vues;
  return b;
}
const envoyer = (b, action, corps, options = {}) => b.appeler(requete('POST', action, { body: corps, ...options }));
const lire = (b, action, query = {}, options = {}) => b.appeler(requete('GET', action, { query, ...options }));
// Un corps valable pour chaque geste du lot 3.
async function corpsValables(b) {
  const doublon = await repereDe(b, 'C.H.U.M.'); const garde = await repereDe(b, 'CHUM');
  return {
    'enregistrer-porteur': { porteur: doublon, valeurs: { nom: 'Autre nom' } },
    'creer-porteur': { valeurs: { nom: 'Nouveau porteur' } },
    geocoder: { adresse: '1051 rue Sanguinet' },
    'fusionner-porteurs': { doublon, garde },
    'fusionner-valeurs': { cle: 'motsCles', de: 'fhir', vers: 'FHIR' },
    'revisiter-lien': { fiche: 'delta' },
  };
}

test('les actions du lot 3 : voir en GET, agir en POST, rien d\'autre', async () => {
  const b = banc();
  for (const action of LECTURES) assert.equal((await envoyer(b, action, {})).code, 405, action);
  for (const action of ECRITURES) assert.equal((await lire(b, action)).code, 405, action);
  assert.equal(b.ecritures(), 0);
});

test('une personne en lecture seule voit les porteurs et la qualité, mais ne fait aucun geste : 403, rien d\'écrit, rien de visité', async () => {
  const b = banc();
  const corps = await corpsValables(b);
  const cookie = temoin(LEA);
  assert.equal((await lire(b, 'porteurs', {}, { cookie })).code, 200);
  assert.equal((await lire(b, 'porteur', { porteur: corps['fusionner-porteurs'].garde }, { cookie })).code, 200);
  assert.equal((await lire(b, 'qualite', {}, { cookie })).code, 200);
  for (const action of ECRITURES) {
    const res = await envoyer(b, action, corps[action], { cookie });
    assert.equal(res.code, 403, action);
    assert.equal(res.corps.code, 'role', action);
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.geocodees.length + b.demandes.length, 0);
});

test('une personne qui n\'est plus dans l\'équipe, ou sans session, n\'a accès à rien du lot 3 : 401', async () => {
  const b = banc();
  const corps = await corpsValables(b);
  for (const cookie of [temoin(PARTIE), null, 'carto_session=faux']) {
    for (const action of LECTURES) assert.equal((await lire(b, action, { porteur: corps['fusionner-porteurs'].garde }, { cookie })).code, 401, action);
    for (const action of ECRITURES) assert.equal((await envoyer(b, action, corps[action], { cookie })).code, 401, action);
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.geocodees.length + b.demandes.length, 0);
});

test('un geste venu d\'un autre site, ou qui n\'est pas du JSON, est refusé avant tout : 403', async () => {
  const b = banc();
  const corps = await corpsValables(b);
  for (const action of ECRITURES) {
    assert.equal((await envoyer(b, action, corps[action], { headers: { origin: 'https://ailleurs.exemple' } })).code, 403, action);
    assert.equal((await envoyer(b, action, corps[action], { headers: { 'content-type': 'text/plain' } })).code, 403, action);
  }
  assert.equal(b.ecritures(), 0);
});

test('les porteurs par la route : la liste avec la clé du fond de carte, le volet, et les gestes au nom de la session', async () => {
  const b = banc();
  const liste = await lire(b, 'porteurs');
  assert.equal(liste.code, 200);
  assert.equal(liste.entetes['Cache-Control'], 'no-store');
  assert.deepEqual(liste.corps.carte, { cle: 'cle-du-fond' });
  assert.equal(liste.corps.porteurs.length, 4);
  const chum = liste.corps.porteurs.find((p) => p.nom === 'CHUM').id;
  const doublon = liste.corps.porteurs.find((p) => p.nom === 'C.H.U.M.').id;
  const volet = await lire(b, 'porteur', { porteur: chum });
  assert.equal(volet.corps.porteur.bottin.nom, 'Centre hospitalier de l\'Université de Montréal');
  assert.deepEqual(volet.corps.carte, { cle: 'cle-du-fond' }, 'le volet s\'ouvre aussi depuis l\'écran Qualité');
  assert.equal((await lire(b, 'porteur', { porteur: '~000000000000000000000000' })).code, 404);
  assert.deepEqual((await envoyer(b, 'geocoder', { adresse: '1051 rue Sanguinet' })).corps, { ok: true, latitude: 46.8, longitude: -71.2 });
  const cree = await envoyer(b, 'creer-porteur', { valeurs: { nom: 'Nouveau porteur', adresse: 'Québec' }, par: LEA });
  assert.equal(cree.code, 200);
  assert.equal((await envoyer(b, 'creer-porteur', { valeurs: { nom: 'nouveau PORTEUR' } })).code, 409);
  assert.equal((await envoyer(b, 'enregistrer-porteur', { porteur: doublon, valeurs: { adresse: '1 rue X' } })).code, 200);
  const fusion = await envoyer(b, 'fusionner-porteurs', { doublon, garde: chum, par: LEA });
  assert.deepEqual(fusion.corps, { ok: true, faites: 3, historique: true, archive: true });
  assert.ok(b.versionsEcrites().every((v) => v.par === TESS), 'la personne est celle de la session, pas celle du corps');
});

test('la qualité par la route : la liste, la fusion de valeurs, le lien revisité, la vérification existante', async () => {
  const b = banc();
  const q = await lire(b, 'qualite');
  assert.equal(q.code, 200);
  assert.equal(q.entetes['Cache-Control'], 'no-store');
  assert.equal(q.corps.compteurs.points, q.corps.points.length);
  assert.deepEqual((await envoyer(b, 'fusionner-valeurs', { cle: 'motsCles', de: 'fhir', vers: 'FHIR' })).corps, { ok: true, faites: 3, historique: true });
  assert.deepEqual((await envoyer(b, 'revisiter-lien', { fiche: 'delta' })).corps, { ok: true, etat: 'ok', enPanne: false, depuis: null });
  assert.equal((await envoyer(b, 'verifier', { fiche: 'alpha' })).code, 200);
  assert.ok(!(await lire(b, 'qualite')).corps.points.some((p) => ['doublons', 'liens'].includes(p.sujet)));
});

test('une fusion arrêtée en route répond par une erreur qui dit où elle en est', async () => {
  const b = banc({ pannes: { mettreAJourFiche: (a) => a.id === 'id-notion-b' } });
  const corps = await corpsValables(b);
  const res = await envoyer(b, 'fusionner-porteurs', corps['fusionner-porteurs']);
  assert.equal(res.code, 502);
  assert.deepEqual(res.corps, { code: 'interrompue', faites: 1, restantes: 2 });
  const valeurs = await envoyer(b, 'fusionner-valeurs', corps['fusionner-valeurs']);
  assert.equal(valeurs.code, 502);
  assert.deepEqual(valeurs.corps, { code: 'interrompue', faites: 1, restantes: 2 });
  await b.verrous.prendreVerrou('fiche:id-notion-a');
  const occupee = await envoyer(b, 'fusionner-valeurs', { cle: 'motsCles', de: 'cancer', vers: 'FHIR' });
  assert.equal(occupee.code, 409);
  assert.deepEqual(occupee.corps, { code: 'occupee', faites: 0, restantes: 1 });
});

test('demandes illisibles : 400, rien d\'écrit', async () => {
  const b = banc();
  const { garde } = (await corpsValables(b))['fusionner-porteurs'];
  const illisibles = [
    ['enregistrer-porteur', { porteur: 'id-notion-chum', valeurs: { nom: 'X' } }], ['enregistrer-porteur', { porteur: garde }], ['enregistrer-porteur', { porteur: garde, valeurs: 'nom' }],
    ['creer-porteur', {}], ['creer-porteur', { valeurs: [] }],
    ['geocoder', {}], ['geocoder', { adresse: 12 }], ['geocoder', { adresse: 'x'.repeat(301) }],
    ['fusionner-porteurs', { doublon: garde }], ['fusionner-porteurs', { doublon: 'chum', garde }], ['fusionner-porteurs', { doublon: garde, garde: 'cohorte-x' }],
    ['fusionner-valeurs', { cle: 'motsCles', de: 'fhir' }], ['fusionner-valeurs', { cle: 7, de: 'a', vers: 'b' }], ['fusionner-valeurs', { cle: 'motsCles', de: 'a'.repeat(201), vers: 'b' }],
    ['revisiter-lien', {}], ['revisiter-lien', { fiche: 'Pas Un Repère !' }],
  ];
  for (const [action, corps] of illisibles) assert.equal((await envoyer(b, action, corps)).code, 400, `${action} ${JSON.stringify(corps)}`);
  assert.equal((await lire(b, 'porteur', { porteur: 'cohorte-x' })).code, 400);
  assert.equal((await lire(b, 'porteur')).code, 400);
  assert.equal(b.ecritures(), 0);
});

test('saisie refusée et pannes : des codes 4xx ou 502, jamais de détail technique', async () => {
  const b = banc({ coordonnees: null });
  const { doublon } = (await corpsValables(b))['fusionner-porteurs'];
  const vide = await envoyer(b, 'creer-porteur', { valeurs: { nom: ' ' } });
  assert.equal(vide.code, 400);
  assert.ok(vide.corps.erreurs.nom);
  assert.equal((await envoyer(b, 'geocoder', { adresse: 'nulle part' })).code, 404);
  assert.equal((await envoyer(b, 'fusionner-porteurs', { doublon, garde: doublon })).code, 400);
  assert.equal((await envoyer(b, 'revisiter-lien', { fiche: 'fiche-inconnue' })).code, 404);
  for (const pannes of [{ lireRessources: true }, { lirePorteurs: true }]) {
    const c = banc({ pannes });
    for (const action of LECTURES) {
      const res = await lire(c, action, { porteur: doublon });
      assert.equal(res.code, 502, action);
      assert.ok(!JSON.stringify(res.corps).includes('en panne'), action);
    }
    const corps = await corpsValables(banc());
    for (const action of pannes.lirePorteurs ? ['fusionner-porteurs', 'revisiter-lien'] : ['fusionner-porteurs', 'fusionner-valeurs', 'revisiter-lien']) {
      const res = await envoyer(c, action, corps[action]);
      assert.equal(res.code, 502, action);
      assert.ok(!JSON.stringify(res.corps).includes('en panne'), action);
    }
    assert.equal(c.ecritures(), 0);
  }
  const geo = banc({ coordonnees: 'panne' });
  const res = await envoyer(geo, 'geocoder', { adresse: 'x' });
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.corps).includes('Nominatim'));
});

test('aucune réponse du lot 3 ne porte un identifiant de Notion, la colonne interne des liens ni un champ interne', async () => {
  const ouvertes = [{ id: '423ffcaf-d90f-8181-a940-e38afc0c69ce', ficheId: 'id-notion-a', statut: 'attente', genre: 'modification', titre: 'Modification : Alpha', logoPropose: { nom: 'l.png', url: 'https://fichiers.notion.exemple/secret?sig=abc' } }];
  const b = banc({ ouvertes, contenus: { [ouvertes[0].id]: { propose: { outils: { apres: ['Python'] } } } } });
  const corps = await corpsValables(b);
  await lire(b, 'porteurs'); await lire(b, 'qualite');
  for (const nom of ['CHUM', 'C.H.U.M.', 'Hôpital Ste-Justine']) await lire(b, 'porteur', { porteur: await repereDe(b, nom) });
  await lire(b, 'ressources'); await lire(b, 'ressource', { fiche: 'delta' });
  for (const action of ['geocoder', 'creer-porteur', 'enregistrer-porteur', 'revisiter-lien', 'fusionner-valeurs', 'fusionner-porteurs']) assert.equal((await envoyer(b, action, corps[action])).code, 200, action);
  await lire(b, 'porteurs'); await lire(b, 'qualite');
  const sortie = JSON.stringify(b.vues.map((v) => v.corps));
  for (const interdit of ['id-notion', 'lienEnPanneDepuis', 'Lien en panne', 'institutionBottinId', 'porteurIds', 'logoFichier', 'statutFiche', 'modifieeLe', 'fichiers.notion', 'siteWeb', TESS, LEA]) assert.ok(!sortie.includes(interdit), interdit);
  assert.ok(b.vues.every((v) => v.entetes['Cache-Control'] === 'no-store'));
});

// ─── La page ───
const fs = require('node:fs');
const path = require('node:path');
const lirePublic = (...morceaux) => fs.readFileSync(path.join(__dirname, '..', 'public', ...morceaux), 'utf8');

test('chaque texte que les écrans Porteurs et Qualité demandent existe', () => {
  const { TEXTES } = require('../public/js/texte.js');
  const source = lirePublic('js', 'admin.js');
  for (const [alias, racine] of [['P', TEXTES.panneau.porteurs], ['Q', TEXTES.panneau.qualite]]) {
    const chemins = new Set([...source.matchAll(new RegExp(`\\b${alias}\\.((?:[A-Za-z_]\\w*)(?:\\.[A-Za-z_]\\w*)*)`, 'g'))].map((m) => m[1]));
    assert.ok(chemins.size > 15, alias);
    for (const chemin of chemins) {
      let v = racine;
      for (const cle of chemin.split('.')) {
        if (typeof v === 'string' || typeof v === 'function') break;
        assert.ok(v && Object.hasOwn(v, cle), `${alias}.${chemin}`);
        v = v[cle];
      }
    }
  }
  const { SUJETS } = require('../lib/qualite');
  assert.deepEqual(Object.keys(TEXTES.panneau.qualite.sujets), SUJETS, 'un titre par sujet, dans l\'ordre de l\'écran');
  assert.equal(typeof TEXTES.panneau.ressources.historique.qualite, 'function');
});

test('le panneau charge la carte du site : même bibliothèque, même version, même fond, et seulement à la demande', () => {
  const source = lirePublic('js', 'admin.js');
  const gabarit = lirePublic('gabarit.html');
  const duSite = gabarit.match(/https:\/\/unpkg\.com\/leaflet@[\d.]+\/dist\//)[0];
  assert.ok(source.includes(`'${duSite}'`), duSite);
  assert.ok(!lirePublic('admin.html').includes('leaflet'), 'rien n\'est chargé tant qu\'aucun volet n\'est ouvert');
  const fonds = (texte) => [...texte.matchAll(/https:\/\/(?:basemaps\.cartocdn\.com|tile\.openstreetmap\.org)[^'`]*/g)].map((m) => m[0].replace(/\$\{[^}]*\}|' \+ .*$/g, '')).sort();
  assert.deepEqual(fonds(source).map((u) => u.split('?')[0]), fonds(lirePublic('js', 'carte.js')).map((u) => u.split('?')[0]));
});

test('un lien qui ne répond pas n\'est jamais dit « mort », et rien de venu des données ne va dans une adresse de lien', () => {
  const { TEXTES } = require('../public/js/texte.js');
  const textes = JSON.stringify(TEXTES.panneau.qualite, (cle, v) => (typeof v === 'function' ? v('a', 'b', 'c', 'd', 'e') : v));
  assert.ok(!/\bmorts?\b/i.test(textes));
  assert.match(TEXTES.panneau.qualite.lien('X', 'https://x.org', '18 novembre 2026'), /ne répond pas à notre vérification depuis le 18 novembre 2026 : à vérifier/);
  const source = lirePublic('js', 'admin.js');
  const lot3 = source.slice(source.indexOf('// ─── Porteurs : les colonnes et la liste ───'), source.indexOf('// ─── Export en CSV'));
  assert.ok(lot3.length > 5000);
  assert.ok(!/href="\$\{|src="\$\{/.test(lot3), 'aucune adresse venue des données dans un lien ou une image');
});
