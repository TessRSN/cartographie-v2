const test = require('node:test');
const assert = require('node:assert/strict');
const lien = require('../api/lien');
const proposition = require('../api/proposition');
const { signer, verifier } = require('../lib/jetons');
const { egales } = require('../public/js/champs.js');

const secret = 'secret-d-essai';
const ENV = { CONTRIBUTIONS: 'oui', JWT_SECRET: secret, SITE_URL: 'https://carto.exemple' };
const OPTIONS = { typePrincipal: ['Logiciel ou application'], secondType: [], portee: ['Le Québec'], motsCles: ['cancer'], normes: ['BIDS'], outils: [], financePar: [], etat: ['Actif'] };

function reponse() {
  return {
    code: null, corps: null, entetes: {},
    setHeader(k, v) { this.entetes[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.corps = o; return this; },
    send(o) { this.corps = o; return this; },
  };
}
const requete = (method, { body, query = {}, headers = {} } = {}) => ({ method, body, query, headers: { host: 'carto.exemple', 'x-real-ip': '10.0.0.1', ...headers } });

function banc({ env = ENV, approbateurs = [], autorise = true, pannes = {}, fiche, enAttente = false } = {}) {
  const appels = [];
  const noter = (nom, args) => { appels.push({ nom, args }); if (pannes[nom]) throw new Error(`${nom} en panne`); };
  const jetonsVus = new Set();
  const deps = {
    env, journal: () => {},
    limites: {
      async autoriserLien(a) { noter('autoriserLien', a); return autorise; },
      async consommerJeton(jti) { noter('consommerJeton', jti); if (jetonsVus.has(jti)) return false; jetonsVus.add(jti); return true; },
      async libererJeton(jti) { noter('libererJeton', jti); jetonsVus.delete(jti); },
    },
    courriels: {
      async lienProposer(m) { noter('lienProposer', m); return { envoye: true }; },
      async lienPanneau(m) { noter('lienPanneau', m); return { envoye: true }; },
      async propositionRecue(m) { noter('propositionRecue', m); if (pannes.courriel) return { envoye: false }; return { envoye: true }; },
      async nouvelleProposition(m) { noter('nouvelleProposition', m); return { envoye: true }; },
    },
    propositions: {
      async estApprobateur(c) { if (pannes.estApprobateur) throw new Error('Notion en panne'); return approbateurs.includes(c); },
      async approbateursActifs() { return approbateurs; },
      async enAttenteSur(id) { noter('enAttenteSur', id); return enAttente; },
      async creerProposition(p) { noter('creerProposition', p); return 'prop-1'; },
    },
    notion: {
      async lireFiche(id) { return id === 'fiche-1' ? (fiche === undefined ? { id: 'fiche-1', nom: 'Cohorte X', phrase: 'Une  phrase.', contact: 'a@b.org', etat: 'Actif', porteurIds: ['p1'], statutFiche: 'Publiée', notesDeVeille: 'secret', faitPartieDe: ['f2'] } : fiche) : null; },
      async lireOptions() { return OPTIONS; },
      async lirePorteurs() { return [{ id: 'p1', nom: 'CHUM' }]; },
    },
    source: async () => ({ ressources: [{ nom: 'Cohorte X', adresse: 'cohorte-x' }], porteurs: [{ nom: 'CHUM' }], idParAdresse: { 'cohorte-x': 'fiche-1' } }),
    fichiers: { async deposer(f) { noter('deposer', { nom: f.nom, type: f.type, taille: f.octets.length }); return 'depot-1'; } },
    approbation: { async approuver(a) { noter('approuver', a); return { ok: true, ficheId: 'fiche-9', courriel: true }; } },
  };
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  return { lien: lien.creerGestionnaire(deps), proposition: proposition.creerGestionnaire(deps), appels, de };
}
async function appeler(gestionnaire, req) { const res = reponse(); await gestionnaire(req, res); return res; }
const jeton = (sorte, charge) => signer(sorte, charge, { secret });

// ─── /api/lien ───
test('sans le réglage CONTRIBUTIONS, les routes répondent 404', async () => {
  const b = banc({ env: { ...ENV, CONTRIBUTIONS: '' } });
  assert.equal((await appeler(b.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' } }))).code, 404);
  assert.equal((await appeler(b.proposition, requete('GET', { query: { jeton: 'x' } }))).code, 404);
  assert.equal((await appeler(b.proposition, requete('POST', { body: {} }))).code, 404);
  assert.equal(b.appels.length, 0);
});

test('demander un lien pour proposer envoie un jeton valable vers /proposer', async () => {
  const b = banc();
  const res = await appeler(b.lien, requete('POST', { body: { courriel: ' Pat@Exemple.org ', but: 'proposer' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true });
  const [message] = b.de('lienProposer');
  assert.equal(message.a, 'pat@exemple.org');
  assert.ok(message.lien.startsWith('https://carto.exemple/proposer?jeton='));
  assert.equal(verifier(new URL(message.lien).searchParams.get('jeton'), 'proposer', { secret }).courriel, 'pat@exemple.org');
  assert.deepEqual(b.de('autoriserLien')[0], { courriel: 'pat@exemple.org', ip: '10.0.0.1', plafondDuJour: true });
});

test('le lien pour modifier porte la fiche, et nomme la fiche dans le courriel', async () => {
  const b = banc();
  await appeler(b.lien, requete('POST', { body: { courriel: 'pat@exemple.org', but: 'modifier', adresse: 'cohorte-x' } }));
  const [message] = b.de('lienProposer');
  assert.equal(message.nomFiche, 'Cohorte X');
  const charge = verifier(new URL(message.lien).searchParams.get('jeton'), 'modifier', { secret });
  assert.equal(charge.ficheId, 'fiche-1');
  const inconnue = banc();
  const res = await appeler(inconnue.lien, requete('POST', { body: { courriel: 'pat@exemple.org', but: 'modifier', adresse: 'constructor' } }));
  assert.deepEqual([res.code, inconnue.de('lienProposer').length], [200, 0]);
});

test("le lien du panneau ne part qu'à un approbateur, sans le plafond du jour, et la réponse est la même", async () => {
  const inconnu = banc();
  const r1 = await appeler(inconnu.lien, requete('POST', { body: { courriel: 'intrus@exemple.org', but: 'panneau' } }));
  assert.deepEqual([r1.code, r1.corps, inconnu.de('lienPanneau').length], [200, { ok: true }, 0]);
  const b = banc({ approbateurs: ['tess@exemple.ca'] });
  const r2 = await appeler(b.lien, requete('POST', { body: { courriel: 'tess@exemple.ca', but: 'panneau' } }));
  assert.deepEqual([r2.code, r2.corps], [200, { ok: true }]);
  assert.ok(b.de('lienPanneau')[0].lien.startsWith('https://carto.exemple/admin?jeton='));
  assert.equal(b.de('autoriserLien')[0].plafondDuJour, false);
});

test('champ piège rempli, limite atteinte ou panne : réponse 200, aucun envoi', async () => {
  const piege = banc();
  await appeler(piege.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer', site: 'http://spam' } }));
  assert.equal(piege.appels.length, 0);
  const limite = banc({ autorise: false });
  const res = await appeler(limite.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' } }));
  assert.deepEqual([res.code, limite.de('lienProposer').length], [200, 0]);
  const panne = banc({ pannes: { lienProposer: true } });
  assert.equal((await appeler(panne.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' } }))).code, 200);
});

test('demande de lien mal formée ou venue d\'un autre site', async () => {
  const b = banc();
  assert.equal((await appeler(b.lien, requete('POST', { body: { courriel: 'pas une adresse', but: 'proposer' } }))).code, 400);
  assert.equal((await appeler(b.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'autre' } }))).code, 400);
  assert.equal((await appeler(b.lien, requete('POST', { body: null }))).code, 400);
  assert.equal((await appeler(b.lien, requete('GET'))).code, 405);
  assert.equal((await appeler(b.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' }, headers: { origin: 'https://mechant.exemple' } }))).code, 403);
  assert.equal((await appeler(b.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' }, headers: { origin: 'https://carto.exemple' } }))).code, 200);
  assert.equal(b.de('lienProposer').length, 1);
});

test("sans SITE_URL, le lien ne suit pas l'en-tête Host hors du poste local", async () => {
  const b = banc({ env: { CONTRIBUTIONS: 'oui', JWT_SECRET: secret, VERCEL_URL: 'apercu-123.vercel.app' } });
  await appeler(b.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' }, headers: { host: 'mechant.exemple' } }));
  assert.ok(b.de('lienProposer')[0].lien.startsWith('https://apercu-123.vercel.app/proposer?jeton='));
  const local = banc({ env: { CONTRIBUTIONS: 'oui', JWT_SECRET: secret } });
  await appeler(local.lien, requete('POST', { body: { courriel: 'a@b.org', but: 'proposer' }, headers: { host: 'localhost:3211' } }));
  assert.ok(local.de('lienProposer')[0].lien.startsWith('http://localhost:3211/proposer?jeton='));
});

// ─── GET /api/proposition ───
test('le formulaire d\'une nouvelle ressource reçoit les choix et les valeurs existantes', async () => {
  const b = banc();
  const res = await appeler(b.proposition, requete('GET', { query: { jeton: jeton('proposer', { courriel: 'pat@exemple.org' }) } }));
  assert.equal(res.code, 200);
  assert.equal(res.entetes['Cache-Control'], 'no-store');
  assert.equal(res.corps.genre, 'nouvelle');
  assert.equal(res.corps.fiche, null);
  assert.deepEqual(res.corps.options.portee, ['Le Québec']);
  assert.ok(!('etat' in res.corps.options), 'les choix réservés aux approbateurs ne sortent pas');
  assert.deepEqual(res.corps.existantes, { motsCles: ['cancer'], normes: ['BIDS'], outils: [], financePar: [], porteurs: ['CHUM'] });
  assert.equal(res.corps.dejaEnAttente, false);
});

test('le formulaire de modification est prérempli, sans champ interne ni champ d\'approbateur', async () => {
  const b = banc({ enAttente: true });
  const res = await appeler(b.proposition, requete('GET', { query: { jeton: jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' }) } }));
  assert.equal(res.corps.genre, 'modification');
  assert.equal(res.corps.fiche.nom, 'Cohorte X');
  assert.equal(res.corps.fiche.adresse, 'cohorte-x');
  assert.equal(res.corps.fiche.valeurs.contact, 'a@b.org');
  assert.deepEqual(res.corps.fiche.valeurs.porteurs, ['CHUM']);
  const brut = JSON.stringify(res.corps);
  assert.ok(!brut.includes('secret') && !brut.includes('fiche-1') && !brut.includes('statutFiche'));
  for (const reserve of ['etat', 'faitPartieDe']) assert.ok(!(reserve in res.corps.fiche.valeurs), reserve);
  assert.equal(res.corps.dejaEnAttente, true);
});

test('jeton absent, faux ou d\'une autre sorte : 401 ; fiche écartée : 410', async () => {
  const b = banc();
  for (const j of [undefined, 'faux', jeton('panneau', { courriel: 'a@b.org' }), jeton('session', { courriel: 'a@b.org' })]) {
    const res = await appeler(b.proposition, requete('GET', { query: { jeton: j } }));
    assert.deepEqual([res.code, res.corps.code], [401, 'lien-expire']);
  }
  const ecartee = banc({ fiche: { id: 'fiche-1', nom: 'X', porteurIds: [], statutFiche: 'Écartée' } });
  const res = await appeler(ecartee.proposition, requete('GET', { query: { jeton: jeton('modifier', { courriel: 'a@b.org', ficheId: 'fiche-1' }) } }));
  assert.deepEqual([res.code, res.corps.code], [410, 'fiche-introuvable']);
});

// ─── POST /api/proposition ───
const NOUVELLE = { nom: 'Outil X', typePrincipal: 'Logiciel ou application', phrase: 'Une phrase.', lien: 'https://x.org' };
const envoi = (j, extra = {}) => requete('POST', { body: { jeton: j, genre: 'nouvelle', valeurs: NOUVELLE, nomProposant: 'Pat', lienAvecRessource: 'responsable', conditions: true, ...extra } });

test('une nouvelle ressource entre dans la file et les courriels partent', async () => {
  const b = banc({ approbateurs: ['tess@exemple.ca'] });
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' })));
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, approuvee: false, courriel: true });
  assert.deepEqual(b.de('creerProposition')[0], {
    genre: 'nouvelle', ficheId: null, courriel: 'pat@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'responsable', titre: 'Nouvelle : Outil X',
    contenu: { propose: { typePrincipal: { apres: 'Logiciel ou application' }, nom: { apres: 'Outil X' }, phrase: { apres: 'Une phrase.' }, lien: { apres: 'https://x.org' } }, applique: null, porteursNouveaux: {} },
  });
  assert.equal(b.de('propositionRecue')[0].a, 'pat@exemple.org');
  assert.deepEqual(b.de('nouvelleProposition')[0], { a: ['tess@exemple.ca'], titre: 'Nouvelle : Outil X', lienPanneau: 'https://carto.exemple/admin' });
  assert.equal(b.de('approuver').length, 0);
});

test('un champ interne ou réservé envoyé par le formulaire est ignoré', async () => {
  const b = banc();
  await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { valeurs: { ...NOUVELLE, etat: 'Archivé', statutFiche: 'Publiée', notesDeVeille: 'x', faitPartieDe: ['cohorte-x'] } }));
  assert.deepEqual(Object.keys(b.de('creerProposition')[0].contenu.propose).sort(), ['lien', 'nom', 'phrase', 'typePrincipal']);
});

test('une modification n\'enregistre que les champs changés, avec leur valeur d\'avant', async () => {
  const b = banc();
  const j = jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' });
  const res = await appeler(b.proposition, envoi(j, { genre: 'modification', valeurs: { nom: 'Cohorte X', phrase: 'Une phrase.', contact: 'c@d.org', porteurs: ['CHUM'] } }));
  assert.equal(res.code, 200);
  const cree = b.de('creerProposition')[0];
  assert.equal(cree.ficheId, 'fiche-1');
  assert.equal(cree.titre, 'Modification : Cohorte X');
  assert.deepEqual(cree.contenu.propose, { contact: { avant: 'a@b.org', apres: 'c@d.org' } });
});

test('une modification sans aucun changement est refusée sans consommer le lien', async () => {
  const b = banc();
  const j = jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' });
  const res = await appeler(b.proposition, envoi(j, { genre: 'modification', valeurs: { nom: 'Cohorte X', contact: 'a@b.org' } }));
  assert.deepEqual([res.code, res.corps.code], [400, 'aucun-changement']);
  assert.equal(b.de('consommerJeton').length + b.de('creerProposition').length, 0);
});

test('« à remplir par le RSN » ne garde que le nom, le lien et la description', async () => {
  const b = banc();
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { genre: 'rsn', valeurs: { nom: 'Outil X', lien: '', description: 'Quelques mots', motsCles: ['a'] } }));
  assert.equal(res.code, 200);
  const cree = b.de('creerProposition')[0];
  assert.equal(cree.genre, 'rsn');
  assert.equal(cree.titre, 'À remplir : Outil X');
  assert.deepEqual(Object.keys(cree.contenu.propose).sort(), ['description', 'nom']);
});

test('un lien ne sert qu\'une fois, mais une erreur de saisie ne le brûle pas', async () => {
  const b = banc();
  const j = jeton('proposer', { courriel: 'pat@exemple.org' });
  const rate = await appeler(b.proposition, envoi(j, { valeurs: { ...NOUVELLE, lien: 'pas une adresse' } }));
  assert.equal(rate.code, 400);
  assert.ok(rate.corps.erreurs.lien);
  assert.equal((await appeler(b.proposition, envoi(j))).code, 200);
  const rejoue = await appeler(b.proposition, envoi(j));
  assert.deepEqual([rejoue.code, rejoue.corps.code], [401, 'lien-expire']);
  assert.equal(b.de('creerProposition').length, 1);
});

test('envois refusés : jeton faux, conditions non cochées, genre qui ne va pas avec le lien, autre site', async () => {
  const b = banc();
  const proposer = jeton('proposer', { courriel: 'pat@exemple.org' });
  const modifier = jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' });
  assert.deepEqual((await appeler(b.proposition, envoi('faux'))).corps.code, 'lien-expire');
  assert.equal((await appeler(b.proposition, envoi(jeton('panneau', { courriel: 'a@b.org' })))).code, 401);
  assert.equal((await appeler(b.proposition, envoi(proposer, { conditions: false }))).code, 400);
  assert.equal((await appeler(b.proposition, envoi(proposer, { genre: 'modification' }))).code, 400);
  assert.equal((await appeler(b.proposition, envoi(modifier, { genre: 'nouvelle' }))).code, 400);
  assert.equal((await appeler(b.proposition, envoi(modifier, { genre: 'rsn' }))).code, 400);
  assert.equal((await appeler(b.proposition, envoi(proposer, { valeurs: 'x' }))).code, 400);
  const autreSite = envoi(proposer); autreSite.headers.origin = 'https://mechant.exemple';
  assert.equal((await appeler(b.proposition, autreSite)).code, 403);
  assert.equal(b.de('creerProposition').length, 0);
});

test('les adresses de nouveaux porteurs sont gardées, les autres écartées', async () => {
  const b = banc();
  const valeurs = { ...NOUVELLE, porteurs: ['CHUM', 'Institut Neuf'] };
  await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { valeurs, porteursNouveaux: { 'Institut Neuf': ' 1 rue Neuve ', CHUM: 'inutile', Autre: 'x', constructor: 'y', Long: 'z'.repeat(400) } }));
  assert.deepEqual(b.de('creerProposition')[0].contenu.porteursNouveaux, { 'Institut Neuf': '1 rue Neuve' });
});

test('le nom et le lien avec la ressource sont bornés', async () => {
  const b = banc();
  await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { nomProposant: `  ${'n'.repeat(300)}`, lienAvecRessource: 'chef' }));
  const cree = b.de('creerProposition')[0];
  assert.equal(cree.nomProposant.length, 200);
  assert.equal(cree.lienAvecRessource, 'aucun');
});

test('courriel en panne : la proposition est créée, la réponse le signale', async () => {
  const b = banc({ pannes: { courriel: true } });
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' })));
  assert.deepEqual(res.corps, { ok: true, approuvee: false, courriel: false });
  assert.equal(b.de('creerProposition').length, 1);
});

test("la proposition d'un approbateur entre dans la file comme les autres, sans approbation d'office", async () => {
  const b = banc({ approbateurs: ['tess@exemple.ca'] });
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'tess@exemple.ca' })));
  assert.deepEqual(res.corps, { ok: true, approuvee: false, courriel: true });
  assert.equal(b.de('approuver').length, 0, 'rien ne change sur le site sans passer par le panneau');
  assert.equal(b.de('nouvelleProposition').length, 1, "l'équipe est prévenue comme pour toute proposition");
});

test('Notion en panne à la création : 502, sans détail', async () => {
  const b = banc({ pannes: { creerProposition: true } });
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' })));
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.corps).includes('en panne'));
});

test('deux textes qui ne diffèrent que par des espaces sont égaux, pas deux paragraphes différents', () => {
  assert.equal(egales('Une  phrase. ', 'Une phrase.'), true);
  assert.equal(egales('Un.\r\n\r\nDeux.', 'Un.\n\nDeux.'), true);
  assert.equal(egales('Un. Deux.', 'Un.\n\nDeux.'), false);
  assert.equal(egales('a', 'b'), false);
});

test('le lien pour modifier porte aussi l\'adresse publique de la fiche', async () => {
  const b = banc();
  await appeler(b.lien, requete('POST', { body: { courriel: 'pat@exemple.org', but: 'modifier', adresse: 'cohorte-x' } }));
  const url = new URL(b.de('lienProposer')[0].lien);
  assert.equal(url.searchParams.get('fiche'), 'cohorte-x');
  assert.ok(url.searchParams.get('jeton'));
});

test('si Notion échoue à la création, le lien est rendu et peut resservir', async () => {
  const liberes = [];
  const b = banc({ pannes: { creerProposition: true } });
  const j = jeton('proposer', { courriel: 'pat@exemple.org' });
  const deps = require('../api/proposition');
  assert.equal((await appeler(b.proposition, envoi(j))).code, 502);
  assert.equal(b.de('libererJeton').length, 1);
  assert.equal(b.de('libererJeton')[0], b.de('consommerJeton')[0]);
  void liberes; void deps;
});

test("une panne en lisant les approbateurs n'empêche pas de prévenir l'équipe", async () => {
  const b = banc({ approbateurs: ['tess@exemple.ca'], pannes: { estApprobateur: true } });
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' })));
  assert.deepEqual(res.corps, { ok: true, approuvee: false, courriel: true });
  assert.equal(b.de('nouvelleProposition').length, 1);
});

const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('un logo joint à la proposition est contrôlé, déposé dans Notion et attaché', async () => {
  const b = banc();
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { logoFichier: { nom: 'mon logo.PNG', donnees: PNG64 } }));
  assert.equal(res.code, 200);
  assert.deepEqual(b.de('deposer')[0], { nom: 'logo.png', type: 'image/png', taille: 70 });
  const cree = b.de('creerProposition')[0];
  assert.deepEqual(cree.logoDepot, { id: 'depot-1', nom: 'logo.png' });
  assert.equal(cree.contenu.logoFichier, 'logo.png');
});

test('un fichier qui n\'est pas une image est refusé sans brûler le lien ni rien déposer', async () => {
  const b = banc();
  const res = await appeler(b.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { logoFichier: { nom: 'x.png', donnees: Buffer.from('<html></html>').toString('base64') } }));
  assert.equal(res.code, 400);
  assert.ok(res.corps.erreurs.logo);
  assert.equal(b.de('deposer').length + b.de('consommerJeton').length + b.de('creerProposition').length, 0);
});

test('changer seulement le logo compte comme une modification', async () => {
  const b = banc();
  const j = jeton('modifier', { courriel: 'pat@exemple.org', ficheId: 'fiche-1' });
  const res = await appeler(b.proposition, envoi(j, { genre: 'modification', valeurs: {}, logoFichier: { nom: 'l.png', donnees: PNG64 } }));
  assert.equal(res.code, 200);
  assert.deepEqual(b.de('creerProposition')[0].contenu.propose, {});
  assert.equal(b.de('creerProposition')[0].contenu.logoFichier, 'logo.png');
});

test('pas de logo en genre « à remplir par le RSN », et un dépôt en panne rend le lien', async () => {
  const rsn = banc();
  await appeler(rsn.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { genre: 'rsn', valeurs: { nom: 'Outil X' }, logoFichier: { nom: 'l.png', donnees: PNG64 } }));
  assert.equal(rsn.de('deposer').length, 0);
  const panne = banc({ pannes: { deposer: true } });
  const res = await appeler(panne.proposition, envoi(jeton('proposer', { courriel: 'pat@exemple.org' }), { logoFichier: { nom: 'l.png', donnees: PNG64 } }));
  assert.equal(res.code, 502);
  assert.equal(panne.de('libererJeton').length, 1);
  assert.equal(panne.de('creerProposition').length, 0);
});
