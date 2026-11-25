const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verifier } = require('../lib/jetons');
const { PROP } = require('../lib/notion');
const { GESTES } = require('../lib/journal');
const { banc, requete, temoin, SECRET, ENV, TESS, MAX, LEA, ODILE, PAT } = require('./aides/banc-lot4a');

const LECTURES = ['equipe'];
const ECRITURES = ['inviter', 'changer-role', 'retirer', 'regler-resume'];
const RESERVEES = ['inviter', 'changer-role', 'retirer'];
const NEUVE = { nom: 'Plateforme Z', typePrincipal: 'Logiciel ou application', phrase: 'Elle calcule.', lien: 'https://z.org' };
const MODIFIER = { fiche: 'cohorte-x', valeurs: { phrase: 'Une autre phrase.' }, depart: { phrase: 'Une phrase.' } };
const COURRIELS_EQUIPE = [TESS, MAX, LEA, ODILE];

// ─── La route ───
test('les actions du lot 4a : voir en GET, agir en POST, rien d\'autre', async () => {
  const b = banc();
  for (const action of LECTURES) assert.equal((await b.envoyer(action)).code, 405, action);
  for (const action of ECRITURES) assert.equal((await b.lire(action)).code, 405, action);
  assert.equal(b.faux.de('pages.create').length + b.faux.de('pages.update').length, 0);
});

test('un geste sur l\'équipe venu d\'un autre site, ou sans session, est refusé avant tout', async () => {
  const b = banc();
  const corps = { courriel: 'a@b.org', nom: 'A', role: 'administration' };
  assert.equal((await b.appeler(requete('POST', 'inviter', { body: corps, headers: { origin: 'https://ailleurs.org' } }))).code, 403);
  assert.equal((await b.appeler(requete('POST', 'inviter', { body: corps, headers: { 'content-type': 'text/plain' } }))).code, 403);
  assert.equal((await b.appeler(requete('POST', 'inviter', { body: corps, cookie: null }))).code, 401);
  assert.equal((await b.appeler(requete('GET', 'equipe', { cookie: null }))).code, 401);
  assert.equal((await b.appeler(requete('GET', 'equipe', { cookie: temoin(ODILE) }))).code, 401, 'une personne retirée n\'entre plus');
  assert.equal(b.equipeEcrite().length, 4);
  assert.equal(b.envois.length, 0);
});

test('« moi » dit ce que le rôle permet : décider et administrer sont deux choses', async () => {
  const b = banc();
  assert.deepEqual((await b.lire('moi', {}, TESS)).corps.permis, { decider: true, administrer: true });
  assert.deepEqual((await b.lire('moi', {}, MAX)).corps.permis, { decider: true, administrer: false });
  assert.deepEqual((await b.lire('moi', {}, LEA)).corps.permis, { decider: false, administrer: false });
});

// ─── L'écran « Équipe » ───
test('l\'écran « Équipe » : toute l\'équipe le voit, avec les noms, les courriels, les rôles et « vous »', async () => {
  const b = banc();
  for (const par of [TESS, MAX, LEA]) {
    const res = await b.lire('equipe', {}, par);
    assert.equal(res.code, 200, par);
    assert.equal(res.entetes['Cache-Control'], 'no-store');
    assert.deepEqual(res.corps.personnes.map((x) => [x.nom, x.courriel, x.role, x.resume, x.moi]), [
      ['Léa Lecture', LEA, 'lecture', true, par === LEA],
      ['Maxime Lafrenière', MAX, 'approbation', true, par === MAX],
      ['Tess Berthier', TESS, 'administration', true, par === TESS],
    ]);
    for (const x of res.corps.personnes) assert.match(x.id, /^~[0-9a-f]{24}$/);
    assert.ok(!JSON.stringify(res.corps).includes('id-notion'), 'aucun identifiant Notion');
    assert.ok(!JSON.stringify(res.corps).includes(ODILE), 'une personne retirée n\'est plus dans la liste');
    assert.deepEqual(res.corps.journal, { actif: true, lu: true, lignes: [] });
    assert.equal(res.corps.resume.jour, 'lundi');
  }
});

// ─── Inviter ───
test('inviter : la ligne est créée, le lien signé part à l\'origine sûre, la personne peut entrer', async () => {
  const b = banc();
  // L'en-tête Host ne décide jamais de l'adresse mise dans le courriel.
  const res = await b.appeler(requete('POST', 'inviter', { body: { courriel: ' Nadia@Exemple.org ', nom: 'Nadia Tremblay', role: 'approbation' }, headers: { host: 'attaquant.exemple', origin: 'https://attaquant.exemple' } }));
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['courriel', 'id', 'ok', 'reactivee', 'role']);
  assert.equal(res.corps.courriel, true);
  assert.equal(res.corps.reactivee, false);
  assert.match(res.corps.id, /^~[0-9a-f]{24}$/);
  assert.deepEqual(b.equipeEcrite().filter((l) => l.courriel === 'nadia@exemple.org').map(({ id, ...l }) => l), [{ nom: 'Nadia Tremblay', courriel: 'nadia@exemple.org', role: 'Approbation', actif: true, sansResume: false }]);
  assert.equal(b.envois.length, 1);
  assert.equal(b.envois[0].sorte, 'lienPanneau');
  assert.equal(b.envois[0].a, 'nadia@exemple.org');
  const lien = /^https:\/\/carto\.exemple\/admin\?jeton=([\w.-]+)$/.exec(b.envois[0].lien);
  assert.ok(lien, b.envois[0].lien);
  assert.equal(verifier(lien[1], 'panneau', { secret: SECRET }).courriel, 'nadia@exemple.org');
  // Le lien ouvre bien une session, et la session donne le rôle choisi.
  const session = await b.appeler(requete('POST', 'session', { cookie: null, body: { jeton: lien[1] } }));
  assert.equal(session.code, 200);
  assert.equal((await b.lire('moi', {}, 'nadia@exemple.org')).corps.role, 'approbation');
});

test('inviter : adresse déjà inscrite refusée (409), personne retirée réactivée, saisie invalide refusée (400)', async () => {
  const b = banc();
  const deja = await b.envoyer('inviter', { courriel: MAX, nom: 'Max', role: 'administration' });
  assert.equal(deja.code, 409);
  assert.equal(deja.corps.code, 'deja-inscrite');
  assert.ok(deja.corps.erreurs.courriel);
  assert.equal(b.envois.length, 0);
  const invalide = await b.envoyer('inviter', { courriel: 'pas-une-adresse', nom: '', role: 'chef' });
  assert.equal(invalide.code, 400);
  assert.deepEqual(Object.keys(invalide.corps.erreurs).sort(), ['courriel', 'nom', 'role']);
  for (const corps of [{}, { courriel: MAX }, { courriel: 'a@b.org', nom: 'A', role: ['administration'] }, { courriel: 'a@b.org', nom: { toString: 1 }, role: 'lecture' }]) {
    assert.equal((await b.envoyer('inviter', corps)).code, 400, JSON.stringify(corps));
  }
  const revenue = await b.envoyer('inviter', { courriel: ODILE, nom: 'Odile Charbonneau', role: 'lecture' });
  assert.equal(revenue.code, 200);
  assert.equal(revenue.corps.reactivee, true);
  assert.deepEqual(b.equipeEcrite().filter((l) => l.courriel === ODILE).map((l) => [l.role, l.actif]), [['Lecture seule', true]]);
  assert.equal(b.equipeEcrite().length, 4, 'aucune seconde ligne');
  assert.deepEqual(b.journalEcrit().map((l) => l.geste), ['Invitation'], 'seule l\'invitation réussie est notée');
});

test('inviter : si le courriel ne part pas, la personne reste inscrite et la réponse le dit', async () => {
  const b = banc({ envoi: { envoye: false } });
  const res = await b.envoyer('inviter', { courriel: 'a@b.org', nom: 'A', role: 'lecture' });
  assert.equal(res.code, 200);
  assert.equal(res.corps.courriel, false);
  assert.equal(b.equipeEcrite().filter((l) => l.courriel === 'a@b.org' && l.actif).length, 1);
});

// ─── Les garde-fous, par la route ───
test('seule l\'Administration invite, change un rôle ou retire : 403 pour les autres, rien d\'écrit, rien de noté', async () => {
  const b = banc();
  const corps = { inviter: { courriel: 'a@b.org', nom: 'A', role: 'administration' }, 'changer-role': { personne: await b.repere(MAX), role: 'administration' }, retirer: { personne: await b.repere(TESS) } };
  for (const par of [MAX, LEA]) {
    for (const action of RESERVEES) {
      const res = await b.envoyer(action, corps[action], par);
      assert.equal(res.code, 403, `${action} par ${par}`);
      assert.equal(res.corps.code, 'role');
      assert.match(res.corps.erreur, /Administration/);
    }
  }
  assert.equal(b.faux.de('pages.create').length + b.faux.de('pages.update').length, 0);
  assert.equal(b.envois.length, 0);
  assert.deepEqual(b.equipeEcrite().map((l) => [l.courriel, l.role, l.actif]), [[TESS, 'Administration', true], [MAX, 'Approbation', true], [LEA, 'Lecture seule', true], [ODILE, 'Approbation', false]]);
});

test('personne ne change son propre rôle ni ne se retire : 409, rien d\'écrit', async () => {
  const b = banc();
  const moi = await b.repere(TESS);
  for (const [action, corps] of [['changer-role', { personne: moi, role: 'lecture' }], ['changer-role', { personne: moi, role: 'administration' }], ['retirer', { personne: moi }]]) {
    const res = await b.envoyer(action, corps);
    assert.equal(res.code, 409, action);
    assert.equal(res.corps.code, 'soi-meme');
  }
  assert.equal(b.faux.de('pages.update').length, 0);
  assert.equal(b.journalEcrit().length, 0);
});

test('changer un rôle et retirer : le changement vaut tout de suite, même avec une session encore valide', async () => {
  const b = banc();
  const max = await b.repere(MAX);
  assert.equal((await b.envoyer('enregistrer', MODIFIER, MAX)).code, 200, 'Max est en Approbation');
  const change = await b.envoyer('changer-role', { personne: max, role: 'lecture' });
  assert.equal(change.code, 200);
  assert.deepEqual(change.corps, { ok: true, id: max, role: 'lecture' });
  assert.equal((await b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX)).code, 403, 'le nouveau rôle compte au geste suivant');
  const retire = await b.envoyer('retirer', { personne: max });
  assert.equal(retire.code, 200);
  assert.deepEqual(retire.corps, { ok: true, id: max });
  assert.equal((await b.lire('moi', {}, MAX)).code, 401, 'l\'accès est coupé tout de suite');
  assert.deepEqual(b.equipeEcrite().filter((l) => l.courriel === MAX).map((l) => [l.nom, l.actif]), [['Maxime Lafrenière', false]], 'la ligne et le nom restent');
  assert.equal((await b.envoyer('retirer', { personne: max })).code, 404, 'une personne déjà retirée n\'est plus désignée');
});

test('un repère de personne mal formé, un rôle ou un réglage illisible : 400, sans aller plus loin', async () => {
  const b = banc();
  for (const [action, corps] of [
    ['changer-role', { personne: 'id-notion-max', role: 'lecture' }], ['changer-role', { personne: await b.repere(MAX) }], ['changer-role', { personne: await b.repere(MAX), role: 'Chef' }],
    ['retirer', {}], ['retirer', { personne: ['x'] }], ['regler-resume', { personne: await b.repere(MAX) }], ['regler-resume', { personne: await b.repere(MAX), actif: 'non' }],
  ]) assert.equal((await b.envoyer(action, corps)).code, 400, `${action} ${JSON.stringify(corps)}`);
  assert.equal(b.faux.de('pages.update').length, 0);
});

test('le résumé hebdomadaire : chacun règle le sien, l\'Administration celui de tous, personne d\'autre celui d\'un autre', async () => {
  const b = banc();
  const [tess, max, lea] = [await b.repere(TESS), await b.repere(MAX), await b.repere(LEA)];
  const sien = await b.envoyer('regler-resume', { personne: lea, actif: false }, LEA);
  assert.equal(sien.code, 200);
  assert.deepEqual(sien.corps, { ok: true, id: lea, resume: false });
  assert.equal((await b.envoyer('regler-resume', { personne: tess, actif: false }, MAX)).code, 403);
  assert.equal((await b.envoyer('regler-resume', { personne: max, actif: false }, LEA)).code, 403);
  assert.equal((await b.envoyer('regler-resume', { personne: max, actif: false }, TESS)).code, 200);
  assert.deepEqual(b.equipeEcrite().map((l) => [l.courriel, l.sansResume]), [[TESS, false], [MAX, true], [LEA, true], [ODILE, false]]);
  // Le résumé de la semaine suit ce réglage.
  assert.deepEqual(await b.propositions.approbateursAPrevenir(), [TESS]);
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.par, l.sur]), [['Résumé réglé', LEA, 'Léa Lecture'], ['Résumé réglé', TESS, 'Maxime Lafrenière']]);
});

test('Notion en panne pendant un geste sur l\'équipe : 502, sans détail technique, rien de noté', async () => {
  const b = banc({ pannesNotion: { 'pages.update': true } });
  const res = await b.envoyer('retirer', { personne: await b.repere(MAX) });
  assert.equal(res.code, 502);
  assert.deepEqual(Object.keys(res.corps), ['code']);
  assert.ok(!/panne|pages\.update/.test(JSON.stringify(res.corps)));
  assert.equal(b.journalEcrit().length, 0);
});

// ─── Qui modifie les fiches ───
test('Approbation ne peut plus créer, rétablir, écarter ni republier : 403, rien d\'écrit, rien de noté', async () => {
  const b = banc();
  assert.equal((await b.envoyer('enregistrer', MODIFIER, TESS)).code, 200, 'une version à rétablir');
  const ecartee = (await b.lire('ressources')).corps.ressources.find((r) => r.statut === 'ecartee').id;
  const avant = { fiches: b.ecrituresFiches(), versions: b.versionsEcrites().length, journal: b.journalEcrit().length };
  for (const [action, corps] of [['creer', { valeurs: NEUVE }], ['retablir', { fiche: 'cohorte-x', numero: 1 }], ['ecarter', { fiche: 'cohorte-x' }], ['republier', { fiche: ecartee }]]) {
    const res = await b.envoyer(action, corps, MAX);
    assert.equal(res.code, 403, action);
    assert.equal(res.corps.code, 'role');
    assert.match(res.corps.erreur, /Administration/);
  }
  assert.deepEqual({ fiches: b.ecrituresFiches(), versions: b.versionsEcrites().length, journal: b.journalEcrit().length }, avant);
  assert.equal(b.propositionsEcrites().length, 0);
});

test('Approbation garde « marquer vérifiée » et « à revoir » ; l\'Administration garde tout', async () => {
  const b = banc();
  assert.equal((await b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX)).code, 200);
  assert.equal((await b.envoyer('revoir', { fiche: 'cohorte-x', actif: true, note: 'À revoir.' }, MAX)).code, 200);
  const ecartee = (await b.lire('ressources')).corps.ressources.find((r) => r.statut === 'ecartee').id;
  for (const [action, corps] of [['creer', { valeurs: NEUVE }], ['enregistrer', MODIFIER], ['retablir', { fiche: 'cohorte-x', numero: 1 }], ['ecarter', { fiche: 'outil-y' }], ['republier', { fiche: ecartee }]]) {
    assert.equal((await b.envoyer(action, corps, TESS)).code, 200, action);
  }
});

test('Approbation enregistre une fiche : la fiche ne change pas, aucune version, une « Modification de l\'équipe » exacte, aucun courriel', async () => {
  const b = banc();
  const res = await b.envoyer('enregistrer', { fiche: 'cohorte-x', valeurs: { phrase: 'Une autre phrase.', contact: 'c@d.org' }, depart: { phrase: 'Une phrase.', contact: 'a@b.org' } }, MAX);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, proposee: true, id: 'cohorte-x', champs: 2 });
  assert.equal(b.ecrituresFiches(), 0);
  assert.equal(b.fiches[0].phrase, 'Une phrase.');
  assert.equal(b.versionsEcrites().length, 0);
  assert.equal(b.envois.length, 0, 'aucun courriel, à personne');
  const [page] = b.propositionsEcrites();
  assert.equal(b.propositionsEcrites().length, 1);
  assert.deepEqual(page.properties.Genre, { select: { name: "Modification de l'équipe" } });
  assert.deepEqual(page.properties['Fiche visée'], { relation: [{ id: 'id-notion-x' }] });
  assert.deepEqual(page.properties['Proposé par'], { email: MAX });
  assert.equal(page.properties['Nom du proposant'].rich_text[0].text.content, 'Maxime Lafrenière');
  assert.deepEqual(page.properties.Statut, { select: { name: 'En attente' } });
  assert.equal(page.properties.Titre.title[0].text.content, "Modification de l'équipe : Cohorte X");
  const contenu = JSON.parse(b.faux.blocs.get(page.id)[0].code.rich_text.map((s) => s.text.content).join(''));
  assert.deepEqual(contenu, { propose: { phrase: { avant: 'Une phrase.', apres: 'Une autre phrase.' }, contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} });
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.par, l.sur]), [['Modification proposée', MAX, 'Cohorte X']]);
});

test('Approbation : la personne qui propose est celle de la session, pas celle que dit le corps', async () => {
  const b = banc();
  await b.envoyer('enregistrer', { ...MODIFIER, par: TESS, courriel: TESS, approbateur: TESS, nomProposant: 'Tess Berthier', genre: 'modification' }, MAX);
  const [page] = b.propositionsEcrites();
  assert.deepEqual(page.properties['Proposé par'], { email: MAX });
  assert.deepEqual(page.properties.Genre, { select: { name: "Modification de l'équipe" } });
  assert.equal(b.ecrituresFiches(), 0);
});

test('Approbation : un conflit ou une valeur invalide ne crée aucune proposition et ne note rien', async () => {
  const b = banc();
  b.fiches[0].phrase = 'Changée entre-temps.';
  const conflit = await b.envoyer('enregistrer', MODIFIER, MAX);
  assert.equal(conflit.code, 409);
  assert.equal(conflit.corps.code, 'conflit');
  assert.deepEqual(conflit.corps.conflits, { phrase: 'Changée entre-temps.' });
  const invalide = await b.envoyer('enregistrer', { fiche: 'cohorte-x', valeurs: { contact: 'pas-un-courriel' }, depart: { contact: 'a@b.org' } }, MAX);
  assert.equal(invalide.code, 400);
  assert.ok(invalide.corps.erreurs.contact);
  assert.equal(b.propositionsEcrites().length, 0);
  assert.equal(b.journalEcrit().length, 0);
  assert.equal(b.ecrituresFiches(), 0);
});

test('Administration enregistre une fiche : elle change tout de suite, avec sa version, sans proposition', async () => {
  const b = banc();
  const res = await b.envoyer('enregistrer', MODIFIER, TESS);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, id: 'cohorte-x', numero: 2, historique: true, champs: 1 });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  assert.deepEqual(b.versionsEcrites(), [{ fiche: 'id-notion-x', source: 'Panneau', par: TESS, proposition: null }]);
  assert.equal(b.propositionsEcrites().length, 0);
});

// ─── Les modifications de l'équipe dans « Propositions » ───
async function proposer(b) {
  assert.equal((await b.envoyer('enregistrer', MODIFIER, MAX)).code, 200);
  return (await b.lire('file')).corps.propositions.find((p) => p.genre === 'equipe');
}

test('dans « Propositions », une modification de l\'équipe porte son genre et le nom de la personne, jamais son courriel', async () => {
  const b = banc();
  const p = await proposer(b);
  assert.equal(p.genre, 'equipe');
  assert.equal(p.nom, 'Cohorte X');
  assert.equal(p.nomProposant, 'Maxime Lafrenière');
  assert.equal(p.courriel, null);
  assert.equal(p.statut, 'attente');
  assert.deepEqual(p.fiche, { adresse: 'cohorte-x', nom: 'Cohorte X' });
  assert.equal(p.nbChamps, 1);
  assert.equal(p.ressemble, false);
  for (const par of [TESS, MAX, LEA]) {
    const detail = await b.lire('detail', { id: p.id }, par);
    assert.equal(detail.code, 200);
    assert.deepEqual(detail.corps.proposition.propose, { phrase: { avant: 'Une phrase.', apres: 'Une autre phrase.' } });
    assert.equal(detail.corps.proposition.nomProposant, 'Maxime Lafrenière');
    assert.equal(detail.corps.proposition.courriel, null);
    assert.equal(detail.corps.actuelle.phrase, 'Une phrase.');
    assert.equal(detail.corps.ressemble, null);
    assert.ok(!JSON.stringify(detail.corps).includes(MAX));
  }
  // L'accueil la compte et la raconte comme les autres.
  const accueil = (await b.lire('accueil')).corps;
  assert.equal(accueil.compteurs.nouvelles, 1);
  assert.deepEqual(accueil.activite.map((a) => [a.sorte, a.genre, a.qui, a.nom]), [['recue', 'equipe', 'Maxime Lafrenière', 'Cohorte X']]);
  // La fiche dit qu'une proposition l'attend, et laquelle.
  const fiche = (await b.lire('ressource', { fiche: 'cohorte-x' })).corps;
  assert.deepEqual(fiche.enAttente, [{ id: p.id, genre: 'equipe', nomProposant: 'Maxime Lafrenière' }]);
});

test('une modification de l\'équipe « a changé depuis » comme une modification du public', async () => {
  const b = banc();
  const p = await proposer(b);
  b.fiches[0].phrase = 'Changée entre-temps.';
  const detail = (await b.lire('detail', { id: p.id })).corps;
  assert.deepEqual(detail.bouscules, ['phrase']);
  assert.equal(detail.actuelle.phrase, 'Changée entre-temps.');
});

test('approuver ou refuser une modification de l\'équipe : 403 pour le rôle Approbation, rien ne change', async () => {
  const b = banc();
  const p = await proposer(b);
  const noteesAvant = b.journalEcrit().length;
  for (const [action, corps] of [['approuver', { id: p.id }], ['refuser', { id: p.id, commentaire: 'Non.' }]]) {
    const res = await b.envoyer(action, corps, MAX);
    assert.equal(res.code, 403, action);
    assert.equal(res.corps.code, 'role');
  }
  assert.equal(b.ecrituresFiches(), 0);
  assert.equal(b.versionsEcrites().length, 0);
  assert.equal((await b.lire('file')).corps.propositions[0].statut, 'attente');
  assert.equal(b.journalEcrit().length, noteesAvant);
  // Les avis et le second regard restent ouverts au rôle Approbation.
  assert.equal((await b.envoyer('avis', { id: p.id, sens: 'favorable', commentaire: '' }, MAX)).code, 200);
  assert.equal((await b.envoyer('verification', { id: p.id }, MAX)).code, 200);
});

test('l\'Administration approuve une modification de l\'équipe : fiche changée, version reliée, aucun courriel, pas de « Vérifiée »', async () => {
  const b = banc();
  const p = await proposer(b);
  const res = await b.envoyer('approuver', { id: p.id }, TESS);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, courriel: false, historique: true });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  assert.equal(b.fiches[0].verifieeLe, null);
  assert.equal(b.fiches[0].verifieePar, null);
  const [ecrit] = b.de('mettreAJourFiche');
  assert.ok(!Object.hasOwn(ecrit.proprietes, PROP.verifieeLe) && !Object.hasOwn(ecrit.proprietes, PROP.verifieePar));
  assert.deepEqual(b.versionsEcrites(), [{ fiche: 'id-notion-x', source: 'Proposition', par: TESS, proposition: p.id }]);
  assert.equal(b.envois.length, 0, 'aucun courriel');
  const apres = (await b.lire('file')).corps.propositions[0];
  assert.equal(apres.statut, 'approuvee');
  assert.equal(apres.decidePar, 'Tess Berthier');
  // L'historique de la fiche dit d'où vient la version.
  const fiche = (await b.lire('ressource', { fiche: 'cohorte-x' })).corps;
  const version = fiche.versions[fiche.versions.length - 1];
  assert.equal(version.source, 'proposition');
  assert.deepEqual(version.proposition, { id: p.id, nomProposant: 'Maxime Lafrenière', lien: 'aucun', genre: 'equipe' });
  assert.deepEqual(b.journalEcrit().map((l) => [l.geste, l.par, l.sur]), [['Modification proposée', MAX, 'Cohorte X'], ['Approbation', TESS, 'Cohorte X']]);
});

test('l\'Administration refuse une modification de l\'équipe : commentaire obligatoire, gardé dans le panneau, aucun courriel', async () => {
  const b = banc();
  const p = await proposer(b);
  const sans = await b.envoyer('refuser', { id: p.id, commentaire: ' ' }, TESS);
  assert.equal(sans.code, 400);
  assert.ok(sans.corps.erreurs.commentaire);
  const res = await b.envoyer('refuser', { id: p.id, commentaire: 'La phrase actuelle est la bonne.' }, TESS);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, courriel: false, historique: true });
  assert.equal(b.envois.length, 0);
  assert.equal(b.ecrituresFiches(), 0);
  const apres = (await b.lire('file')).corps.propositions[0];
  assert.deepEqual([apres.statut, apres.commentaire, apres.decidePar], ['refusee', 'La phrase actuelle est la bonne.', 'Tess Berthier']);
  assert.deepEqual(b.journalEcrit().map((l) => l.geste), ['Modification proposée', 'Refus']);
});

test('les propositions du public ne changent pas : Approbation les approuve et les refuse, et les courriels partent', async () => {
  const b = banc();
  const id = await b.propositionPublique();
  const vue = (await b.lire('file', {}, MAX)).corps.propositions.find((p) => p.id === id);
  assert.equal(vue.genre, 'modification');
  assert.equal(vue.courriel, PAT, 'le courriel de la personne du public reste montré');
  const res = await b.envoyer('approuver', { id }, MAX);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, courriel: true, historique: true });
  assert.equal(b.fiches[0].phrase, 'Une phrase du public.');
  assert.equal(b.fiches[0].verifieePar, 'Responsable', 'une proposition du responsable marque toujours la fiche vérifiée');
  assert.deepEqual(b.envois.map((m) => [m.sorte, m.a]), [['approuvee', PAT]]);
  const autre = await b.propositionPublique();
  assert.equal((await b.envoyer('refuser', { id: autre, commentaire: 'Non.' }, MAX)).code, 200);
  assert.deepEqual(b.envois.map((m) => [m.sorte, m.a]), [['approuvee', PAT], ['refusee', PAT]]);
});

// ─── Le journal de l'équipe ───
test('chaque geste réussi du panneau note une ligne, au nom de la personne en session', async () => {
  const b = banc();
  const publique = await b.propositionPublique();
  const aRefuser = await b.propositionPublique();
  const porteursVus = (await b.lire('porteurs')).corps.porteurs;
  const reperePorteur = (nom) => porteursVus.find((o) => o.nom === nom).id;
  const ecartee = (await b.lire('ressources')).corps.ressources.find((r) => r.statut === 'ecartee').id;
  const gestes = [
    ['verification', { id: publique }, MAX, 'Second regard', 'Cohorte X'],
    ['approuver', { id: publique }, MAX, 'Approbation', 'Cohorte X'],
    ['refuser', { id: aRefuser, commentaire: 'Non.' }, MAX, 'Refus', 'Cohorte X'],
    ['enregistrer', { fiche: 'cohorte-x', valeurs: { contact: 'c@d.org' }, depart: { contact: 'a@b.org' } }, TESS, 'Fiche modifiée', 'Cohorte X'],
    ['enregistrer', { fiche: 'outil-y', valeurs: { phrase: 'Autre.' }, depart: { phrase: 'Une phrase.' } }, MAX, 'Modification proposée', 'Outil Y'],
    ['creer', { valeurs: NEUVE }, TESS, 'Fiche créée', 'Plateforme Z'],
    ['retablir', { fiche: 'cohorte-x', numero: 1 }, TESS, 'Version rétablie', 'Cohorte X'],
    ['ecarter', { fiche: 'plateforme-z' }, TESS, 'Fiche écartée', 'Plateforme Z'],
    ['republier', { fiche: ecartee }, TESS, 'Fiche republiée', 'Vieille fiche'],
    ['verifier', { fiche: 'cohorte-x' }, MAX, 'Fiche vérifiée', 'Cohorte X'],
    ['revoir', { fiche: 'cohorte-x', actif: true, note: 'Le lien a changé.' }, MAX, 'Fiche à revoir', 'Cohorte X'],
    ['revoir', { fiche: 'cohorte-x', actif: false }, MAX, 'Fiche à revoir', 'Cohorte X'],
    ['creer-porteur', { valeurs: { nom: 'Institut Y' } }, MAX, 'Porteur créé', 'Institut Y'],
    ['enregistrer-porteur', { porteur: reperePorteur('CHUM'), valeurs: { adresse: '1051 rue Sanguinet' } }, MAX, 'Porteur modifié', 'CHUM'],
    ['fusionner-porteurs', { doublon: reperePorteur('C.H.U.M.'), garde: reperePorteur('CHUM') }, MAX, 'Porteurs fusionnés', 'CHUM'],
    ['fusionner-valeurs', { cle: 'motsCles', de: 'cancer', vers: 'Cancer' }, MAX, 'Valeurs fusionnées', 'Cancer'],
    ['inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia Tremblay', role: 'lecture' }, TESS, 'Invitation', 'Nadia Tremblay'],
    ['changer-role', { personne: await b.repere(LEA), role: 'approbation' }, TESS, 'Rôle changé', 'Léa Lecture'],
    ['regler-resume', { personne: await b.repere(LEA), actif: false }, LEA, 'Résumé réglé', 'Léa Lecture'],
    ['retirer', { personne: await b.repere(LEA) }, TESS, 'Personne retirée', 'Léa Lecture'],
  ];
  for (const [action, corps, par] of gestes) {
    const res = await b.envoyer(action, corps, par);
    assert.equal(res.code, 200, `${action} : ${JSON.stringify(res.corps)}`);
  }
  const ecrit = b.journalEcrit();
  assert.deepEqual(ecrit.map((l) => [l.geste, l.par, l.sur]), gestes.map(([, , par, geste, sur]) => [geste, par, sur]));
  // Chaque geste de la base « Journal » a servi au moins une fois : la table des gestes est complète.
  assert.deepEqual([...new Set(ecrit.map((l) => l.geste))].sort(), [...GESTES].sort());
  // La phrase se lit après le nom de la personne, et ne porte ni courriel de l'équipe ni identifiant.
  for (const l of ecrit) {
    assert.match(l.phrase, /^a /, l.phrase);
    assert.ok(!/@|id-notion|~[0-9a-f]{24}/.test(l.phrase.replace('nadia@exemple.org', '')), l.phrase);
    assert.ok(!COURRIELS_EQUIPE.some((c) => l.phrase.includes(c) || l.sur.includes(c)), l.phrase);
  }
  assert.equal(ecrit.find((l) => l.geste === 'Porteurs fusionnés').phrase, 'a fusionné le porteur C.H.U.M. dans CHUM');
  assert.equal(ecrit.find((l) => l.geste === 'Version rétablie').phrase, 'a rétabli la version 1 de Cohorte X');
  assert.match(ecrit.find((l) => l.geste === 'Rôle changé').phrase, /Léa Lecture.*Approbation/);
  assert.deepEqual(ecrit.filter((l) => l.geste === 'Fiche à revoir').map((l) => l.phrase), ['a marqué Cohorte X « à revoir »', 'a retiré la marque « à revoir » de Cohorte X']);
  // Aucune réponse à un geste ne laisse sortir le nom ajouté pour le journal, ni un identifiant Notion.
  for (const { action, res } of b.vues.filter((v) => gestes.some(([a]) => a === v.action))) {
    assert.ok(!JSON.stringify(res.corps).includes('id-notion'), action);
    assert.ok(!Object.hasOwn(res.corps, 'nom') && !Object.hasOwn(res.corps, 'nomDoublon') && !Object.hasOwn(res.corps, 'titre'), action);
  }
});

test('un avis ne se note pas ; un geste refusé, échoué ou qui ne change rien non plus', async () => {
  const b = banc();
  const id = await b.propositionPublique();
  assert.equal((await b.envoyer('avis', { id, sens: 'favorable', commentaire: 'Bien.' }, MAX)).code, 200);
  assert.equal((await b.envoyer('geocoder', { adresse: '1051 rue Sanguinet' }, MAX)).code, 200);
  assert.equal((await b.envoyer('verification', { id }, LEA)).code, 403);
  assert.equal((await b.envoyer('refuser', { id, commentaire: '' }, MAX)).code, 400);
  assert.equal((await b.envoyer('ecarter', { fiche: 'cohorte-x' }, MAX)).code, 403);
  assert.equal((await b.envoyer('enregistrer', { fiche: 'fiche-inconnue', valeurs: { phrase: 'x' }, depart: { phrase: 'y' } }, TESS)).code, 404);
  assert.equal((await b.envoyer('enregistrer', { fiche: 'cohorte-x', valeurs: { phrase: 'Une phrase.' }, depart: { phrase: 'Une phrase.' } }, TESS)).code, 200, 'rien de changé');
  assert.equal((await b.envoyer('republier', { fiche: 'cohorte-x' }, TESS)).code, 200, 'déjà publiée');
  assert.equal((await b.envoyer('changer-role', { personne: await b.repere(MAX), role: 'approbation' }, TESS)).code, 200, 'déjà ce rôle');
  assert.equal((await b.envoyer('regler-resume', { personne: await b.repere(MAX), actif: true }, MAX)).code, 200, 'déjà réglé');
  assert.equal((await b.envoyer('inviter', { courriel: MAX, nom: 'Max', role: 'lecture' }, TESS)).code, 409);
  assert.deepEqual(b.journalEcrit(), []);
  // Une fiche que Notion refuse d'écrire : le geste échoue, rien n'est noté.
  const c = banc({ pannes: { mettreAJourFiche: true } });
  assert.equal((await c.envoyer('verifier', { fiche: 'cohorte-x' }, TESS)).code, 502);
  assert.deepEqual(c.journalEcrit(), []);
});

test('le journal en panne ne fait échouer aucun geste : la fiche change, la réponse est la même, la panne va au journal du serveur', async () => {
  const enPanne = (args) => args.parent.database_id === 'base-journal';
  const b = banc({ pannesNotion: { 'pages.create': enPanne } });
  const res = await b.envoyer('enregistrer', MODIFIER, TESS);
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true, id: 'cohorte-x', numero: 2, historique: true, champs: 1 });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  assert.equal((await b.envoyer('inviter', { courriel: 'a@b.org', nom: 'A', role: 'lecture' })).code, 200);
  assert.equal((await b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX)).code, 200);
  assert.equal(b.journalEcrit().length, 0);
  assert.ok(b.lignesServeur.filter((l) => /\[journal\]/.test(l)).length >= 3);
});

test('un module de journal qui lèverait quand même ne fait rien échouer non plus', async () => {
  const b = banc();
  b.deps.journalEquipe.noter = async () => { throw new Error('imprévu'); };
  assert.equal((await b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX)).code, 200);
  assert.equal(b.fiches[0].verifieePar, 'Équipe du RSN');
});

test('sans la base « Journal » : tout fonctionne, l\'écran montre un journal vide et le dit', async () => {
  for (const b of [banc({ env: { ...ENV, NOTION_DB_JOURNAL: undefined } }), banc({ sansJournal: true })]) {
    assert.equal((await b.envoyer('enregistrer', MODIFIER, TESS)).code, 200);
    assert.equal((await b.envoyer('inviter', { courriel: 'a@b.org', nom: 'A', role: 'lecture' })).code, 200);
    assert.equal((await b.envoyer('enregistrer', { fiche: 'outil-y', valeurs: { phrase: 'Autre.' }, depart: { phrase: 'Une phrase.' } }, MAX)).code, 200);
    const ecran = await b.lire('equipe');
    assert.equal(ecran.code, 200);
    assert.deepEqual(ecran.corps.journal, { actif: false, lu: true, lignes: [] });
    assert.equal(b.faux.de('databases.query').filter((q) => q.database_id === undefined || q.database_id === 'base-journal').length, 0);
    assert.equal(b.journalEcrit().length, 0);
  }
});

test('le journal illisible : l\'écran « Équipe » s\'affiche quand même, et dit que le journal n\'a pas pu être lu', async () => {
  const b = banc({ pannesNotion: { 'databases.query': (args) => args.database_id === 'base-journal' } });
  const ecran = await b.lire('equipe');
  assert.equal(ecran.code, 200);
  assert.equal(ecran.corps.personnes.length, 3);
  assert.deepEqual(ecran.corps.journal, { actif: true, lu: false, lignes: [] });
});

test('le journal se lit avec des noms : jamais de courriel, pas même celui d\'une personne partie ou inconnue', async () => {
  const b = banc();
  assert.equal((await b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX)).code, 200);
  assert.equal((await b.envoyer('retirer', { personne: await b.repere(MAX) }, TESS)).code, 200);
  // Deux lignes anciennes : une d'une personne retirée depuis longtemps, une d'une adresse qui n'a plus de ligne.
  await b.deps.journalEquipe.noter({ geste: 'Refus', par: ODILE, sur: 'Outil Y', phrase: 'a refusé la modification de Outil Y' });
  await b.deps.journalEquipe.noter({ geste: 'Fiche vérifiée', par: 'disparue@exemple.ca', sur: 'Outil Y', phrase: 'a marqué Outil Y comme vérifiée' });
  for (const par of [TESS, LEA]) {
    const { journal } = (await b.lire('equipe', {}, par)).corps;
    assert.deepEqual(journal.lignes.map((l) => [l.qui, l.phrase]), [
      [null, 'a marqué Outil Y comme vérifiée'],
      ['Odile Charbonneau', 'a refusé la modification de Outil Y'],
      ['Tess Berthier', "a retiré l'accès de Maxime Lafrenière"],
      ['Maxime Lafrenière', 'a marqué Cohorte X comme vérifiée'],
    ], 'de la plus récente à la plus ancienne ; le nom d\'une personne retirée reste, une adresse inconnue devient anonyme');
    for (const l of journal.lignes) {
      assert.deepEqual(Object.keys(l).sort(), ['le', 'phrase', 'qui']);
      assert.match(l.le, /^2026-11-25T/);
    }
    const tout = JSON.stringify(journal);
    for (const courriel of [...COURRIELS_EQUIPE, 'disparue@exemple.ca']) assert.ok(!tout.includes(courriel), courriel);
  }
});

test('l\'écran montre les cinquante dernières lignes du journal', async () => {
  const b = banc();
  for (let i = 1; i <= 53; i++) await b.deps.journalEquipe.noter({ geste: 'Fiche vérifiée', par: TESS, sur: `Fiche ${i}`, phrase: `a marqué Fiche ${i} comme vérifiée` });
  const { lignes } = (await b.lire('equipe')).corps.journal;
  assert.equal(lignes.length, 50);
  assert.equal(lignes[0].phrase, 'a marqué Fiche 53 comme vérifiée');
  assert.equal(lignes[49].phrase, 'a marqué Fiche 4 comme vérifiée');
});

// ─── Rien ne sort ───
test('hors de l\'écran « Équipe », aucune réponse ne laisse sortir le courriel d\'une autre personne de l\'équipe ni un identifiant Notion', async () => {
  const b = banc();
  // De quoi remplir chaque écran : une proposition de l'équipe tranchée par une personne ensuite retirée,
  // un avis, des versions, une proposition du public, un porteur.
  const p = await proposer(b);
  assert.equal((await b.envoyer('avis', { id: p.id, sens: 'favorable', commentaire: 'Oui.' }, MAX)).code, 200);
  assert.equal((await b.envoyer('approuver', { id: p.id }, TESS)).code, 200);
  assert.equal((await b.envoyer('enregistrer', { fiche: 'outil-y', valeurs: { phrase: 'Autre.' }, depart: { phrase: 'Une phrase.' } }, MAX)).code, 200);
  const publique = await b.propositionPublique();
  assert.equal((await b.envoyer('inviter', { courriel: 'admin2@exemple.ca', nom: 'Seconde Admin', role: 'administration' }, TESS)).code, 200);
  assert.equal((await b.envoyer('retirer', { personne: await b.repere(MAX) }, 'admin2@exemple.ca')).code, 200, 'Max quitte l\'équipe après avoir agi');
  const porteur = (await b.lire('porteurs', {}, LEA)).corps.porteurs[0].id;
  const ouverte = (await b.lire('file', {}, LEA)).corps.propositions.find((x) => x.genre === 'equipe' && x.statut === 'attente');
  const lectures = [['moi'], ['accueil'], ['file'], ['detail', { id: p.id }], ['detail', { id: ouverte.id }], ['detail', { id: publique }], ['ressources'], ['ressource', { fiche: 'cohorte-x' }], ['ressource', { fiche: 'outil-y' }],
    ['ressource', { neuve: '1' }], ['porteurs'], ['porteur', { porteur }], ['qualite']];
  const autres = [TESS, MAX, ODILE, 'admin2@exemple.ca'];
  for (const [action, query] of lectures) {
    const res = await b.lire(action, query || {}, LEA);
    assert.equal(res.code, 200, action);
    const tout = JSON.stringify(res.corps);
    for (const courriel of autres) assert.ok(!tout.includes(courriel), `${action} laisse sortir ${courriel}`);
    assert.ok(!tout.includes('id-notion'), `${action} laisse sortir un identifiant Notion`);
    assert.ok(!/base-(approbateurs|journal|versions|propositions)/.test(tout), action);
  }
  // Les noms, eux, restent : celui de la personne partie aussi.
  const file = (await b.lire('file', {}, LEA)).corps.propositions;
  assert.equal(file.find((x) => x.id === p.id).avis[0].nom, 'Maxime Lafrenière');
  assert.equal(file.find((x) => x.id === ouverte.id).nomProposant, 'Maxime Lafrenière');
  assert.equal(file.find((x) => x.id === p.id).decidePar, 'Tess Berthier');
  // Les réponses aux gestes non plus.
  for (const { action, res } of b.vues.filter((v) => v.action !== 'equipe' && v.action !== 'moi' && v.action !== 'file')) {
    const tout = JSON.stringify(res.corps || '');
    for (const courriel of [...autres, LEA]) assert.ok(!tout.includes(courriel), `${action} laisse sortir ${courriel}`);
  }
});

test('une personne dont la ligne n\'a pas de nom n\'est pas montrée par son adresse aux autres', async () => {
  const b = banc();
  assert.equal((await b.envoyer('inviter', { courriel: 'sansnom@exemple.ca', nom: 'Temporaire', role: 'approbation' }, TESS)).code, 200);
  // Le nom est effacé dans Notion, à la main.
  const ligne = b.equipeEcrite().find((l) => l.courriel === 'sansnom@exemple.ca');
  b.faux.pages.get(ligne.id).properties.Nom = { title: [] };
  const id = await b.propositionPublique();
  assert.equal((await b.envoyer('refuser', { id, commentaire: 'Non.' }, 'sansnom@exemple.ca')).code, 200);
  const file = (await b.lire('file', {}, LEA)).corps;
  assert.equal(file.propositions[0].decidePar, null);
  assert.ok(!JSON.stringify(file).includes('sansnom@exemple.ca'));
  assert.equal((await b.lire('equipe', {}, LEA)).corps.journal.lignes[0].qui, null);
  assert.equal((await b.lire('moi', {}, 'sansnom@exemple.ca')).corps.courriel, 'sansnom@exemple.ca', 'chacun voit sa propre adresse');
});

// ─── La page ───
const lirePublic = (...morceaux) => fs.readFileSync(path.join(__dirname, '..', 'public', ...morceaux), 'utf8');

test('la page : l\'écran « Équipe » existe, et l\'affichage distingue décider et administrer', () => {
  const source = lirePublic('js', 'admin.js');
  const { TEXTES } = require('../public/js/texte.js');
  const T = TEXTES.panneau;
  assert.ok(source.includes("'equipe'"), 'la route « equipe »');
  assert.equal(T.routes.equipe, 'Équipe');
  assert.equal(T.genres.equipe, 'Équipe');
  assert.match(source, /permis\.administrer/);
  assert.equal(T.ressources.proposer, 'Proposer cette modification');
  assert.match(T.ressources.proposerAide, /Administration/);
  for (const action of ['equipe', 'inviter', 'changer-role', 'retirer', 'regler-resume']) assert.ok(source.includes(`'${action}'`), action);
  // Retirer une personne passe par une confirmation.
  assert.equal(typeof T.equipe.retirer.question, 'function');
  assert.match(source, /EQ\.retirer\.question/);
  // Un texte par rôle pour le rappel de ce que chaque rôle permet, et une phrase pour le journal absent.
  for (const role of ['administration', 'approbation', 'lecture']) assert.ok(T.equipe.permis[role], role);
  assert.ok(T.equipe.journal.absent && T.equipe.journal.vide && T.equipe.journal.illisible && T.equipe.journal.ancienMembre);
  // Les textes de l'écran ne portent pas de tiret cadratin.
  const textes = JSON.stringify(T.equipe, (cle, v) => (typeof v === 'function' ? v('a', 'b', 'c') : v));
  assert.ok(!/—/.test(textes));
});

test('la page : chaque texte de l\'écran « Équipe » que le script demande existe', () => {
  const source = lirePublic('js', 'admin.js');
  const { TEXTES } = require('../public/js/texte.js');
  const demandes = [...source.matchAll(/\bEQ\.([A-Za-z]+(?:\.[A-Za-z]+)*)/g)].map((m) => m[1]);
  assert.ok(demandes.length > 20);
  for (const chemin of new Set(demandes)) {
    let v = TEXTES.panneau.equipe;
    for (const cle of chemin.split('.')) {
      if (typeof v === 'function' || typeof v === 'string') break;
      assert.ok(v && Object.hasOwn(v, cle), `TEXTES.panneau.equipe.${chemin}`);
      v = v[cle];
    }
  }
});

test('le journal de l\'équipe est branché sur les vrais modules, et sa base est un réglage documenté', () => {
  const assemblage = fs.readFileSync(path.join(__dirname, '..', 'lib', 'contributions.js'), 'utf8');
  assert.match(assemblage, /creerJournal\(client, env\)/);
  assert.match(assemblage, /creerEquipe\(\{/);
  assert.match(assemblage, /journalEquipe/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /NOTION_DB_JOURNAL/);
});

// ─── Relecture du lot 4a ───
test('Approbation, par la route : corriger ce qui est proposé oui, compléter un autre champ non (400) ; sa propre proposition non plus (403)', async () => {
  const b = banc();
  const id = await b.propositionPublique();
  const trop = await b.envoyer('approuver', { id, corrections: { phrase: 'Une phrase corrigée.', contact: 'max@ailleurs.org' } }, MAX);
  assert.equal(trop.code, 400);
  assert.equal(trop.corps.code, 'invalide');
  assert.deepEqual(Object.keys(trop.corps.erreurs), ['contact']);
  assert.equal(b.ecrituresFiches(), 0);
  assert.equal(b.fiches[0].contact, 'a@b.org');
  assert.equal(b.envois.length, 0);
  assert.deepEqual(b.journalEcrit(), []);
  const sienne = await b.propositionPublique({ courriel: MAX, nomProposant: 'Maxime' });
  const refus = await b.envoyer('approuver', { id: sienne }, MAX);
  assert.equal(refus.code, 403);
  assert.equal(refus.corps.code, 'role');
  assert.equal(b.ecrituresFiches(), 0);
  assert.equal(b.envois.length, 0);
  assert.deepEqual(b.journalEcrit(), []);
  // La correction d'un champ proposé passe ; l'Administration complète ce qu'elle veut, même sur la proposition de Max.
  assert.equal((await b.envoyer('approuver', { id, corrections: { phrase: 'Une phrase corrigée.' } }, MAX)).code, 200);
  assert.equal(b.fiches[0].phrase, 'Une phrase corrigée.');
  assert.equal((await b.envoyer('approuver', { id: sienne, corrections: { contact: 'c@d.org' } }, TESS)).code, 200);
  assert.equal(b.fiches[0].contact, 'c@d.org');
});

test('la page : le menu « Compléter un autre champ » d\'une proposition n\'existe que pour l\'Administration', () => {
  const source = lirePublic('js', 'admin.js');
  const menu = source.split('\n').filter((l) => l.includes('id="autreChamp"'));
  assert.equal(menu.length, 1);
  assert.match(menu[0], /corrigeable\(\) && administre\(\) && restants\.length/);
  // Même sans le menu, la page n'ajoute aucun champ pour une personne qui n'administre pas.
  assert.ok(source.includes("cible.id === 'autreChamp' && cible.value && administre()"));
});

test('inviter en mode d\'essai des courriels : la réponse le dit, sans l\'adresse d\'essai ; hors de ce mode, rien ne change', async () => {
  const b = banc({ env: { ...ENV, EMAIL_TEST_MODE: 'true', EMAIL_TEST_RECIPIENT: 'boite-d-essai@exemple.org' } });
  const res = await b.envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia Tremblay', role: 'approbation' });
  assert.equal(res.code, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ['courriel', 'essai', 'id', 'ok', 'reactivee', 'role']);
  assert.equal(res.corps.essai, true);
  assert.ok(!JSON.stringify(res.corps).includes('boite-d-essai'));
  const sans = await banc().envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia Tremblay', role: 'approbation' });
  assert.ok(!Object.hasOwn(sans.corps, 'essai'));
});

test('inviter passe par la limite des liens d\'entrée, avec l\'adresse du visiteur ; au-delà : inscrite, sans courriel', async () => {
  const b = banc();
  const res = await b.envoyer('inviter', { courriel: 'Nadia@exemple.org', nom: 'Nadia Tremblay', role: 'approbation' }, TESS, { headers: { 'x-real-ip': '203.0.113.9' } });
  assert.equal(res.corps.courriel, true);
  assert.deepEqual(b.demandesDeLien, [{ courriel: 'nadia@exemple.org', ip: '203.0.113.9', plafondDuJour: false }]);
  const c = banc({ lienPermis: false });
  const refuse = await c.envoyer('inviter', { courriel: 'nadia@exemple.org', nom: 'Nadia Tremblay', role: 'approbation' }, TESS, { headers: { 'x-real-ip': '203.0.113.9' } });
  assert.equal(refuse.code, 200);
  assert.equal(refuse.corps.courriel, false);
  assert.equal(c.envois.length, 0, 'aucun courriel');
  assert.equal(c.equipeEcrite().filter((l) => l.courriel === 'nadia@exemple.org' && l.actif).length, 1, 'la personne est inscrite');
  assert.deepEqual(c.journalEcrit().map((l) => l.geste), ['Invitation']);
  // Les vrais modules sont branchés de la même façon.
  const assemblage = fs.readFileSync(path.join(__dirname, '..', 'lib', 'contributions.js'), 'utf8');
  assert.match(assemblage, /creerEquipe\(\{[^}]*\blimites,[^}]*\}\)/);
});

test('la page : après une invitation en mode d\'essai, le message dit où le lien est parti et quoi faire', () => {
  const source = lirePublic('js', 'admin.js');
  const { TEXTES } = require('../public/js/texte.js');
  const EQ = TEXTES.panneau.equipe;
  assert.ok(source.includes('(d.reactivee ? EQ.reactivee : EQ.invitee)(nom, !!d.courriel, d.essai === true)'), 'le message reçoit le mode d\'essai');
  for (const texte of [EQ.invitee('Nadia', true, true), EQ.reactivee('Nadia', true, true)]) {
    assert.match(texte, /Nadia/);
    assert.match(texte, /adresse d’essai/);
    assert.match(texte, /non à (Nadia|son adresse)/);
    assert.match(texte, /[Tt]ransférez-le-lui dans l’heure/);
    assert.match(texte, /[Tt]ant que le mode d’essai est actif, .*ne peut pas demander son lien elle-même/);
    assert.ok(!/—/.test(texte));
  }
  // Courriel non parti en mode d'essai : on ne dit pas à tort qu'elle peut demander son lien elle-même.
  for (const texte of [EQ.invitee('Nadia', false, true), EQ.reactivee('Nadia', false, true)]) {
    assert.match(texte, /n’a pas pu partir/);
    assert.match(texte, /ne peut pas demander son lien elle-même/);
  }
  // Hors du mode d'essai, les messages d'avant.
  assert.equal(EQ.invitee('Nadia', true), 'Nadia est invitée : son lien d’entrée vient de partir par courriel.');
  assert.match(EQ.invitee('Nadia', false), /Elle peut demander son lien elle-même/);
  assert.match(EQ.reactivee('Nadia', true), /retrouve son accès : son lien d’entrée vient de partir/);
});

test('le journal ne note pas un geste sans effet : fiche déjà « à revoir », déjà démarquée, déjà vérifiée aujourd\'hui', async () => {
  const b = banc();
  const gestes = [
    ['revoir', { fiche: 'cohorte-x', actif: false }, 200, 0],
    ['revoir', { fiche: 'cohorte-x', actif: true, note: 'Le lien a changé.' }, 200, 1],
    ['revoir', { fiche: 'cohorte-x', actif: true, note: 'Le lien a changé.' }, 200, 1],
    ['verifier', { fiche: 'cohorte-x' }, 200, 2],
    ['verifier', { fiche: 'cohorte-x' }, 200, 2],
    ['revoir', { fiche: 'cohorte-x', actif: false }, 200, 3],
    ['revoir', { fiche: 'cohorte-x', actif: false }, 200, 3],
  ];
  for (const [action, corps, code, lignes] of gestes) {
    const res = await b.envoyer(action, corps, MAX);
    assert.equal(res.code, code, action);
    assert.equal(res.corps.ok, true);
    assert.equal(b.journalEcrit().length, lignes, `${action} ${JSON.stringify(corps)}`);
  }
  assert.deepEqual(b.journalEcrit().map((l) => l.geste), ['Fiche à revoir', 'Fiche vérifiée', 'Fiche à revoir']);
  assert.equal(b.de('mettreAJourFiche').length, 3, 'un geste sans effet n\'écrit pas non plus dans Notion');
});

test('une fusion interrompue qui a déjà changé des fiches est notée quand même, avec le compte et l\'interruption', async () => {
  // Fusion de valeurs : la seconde fiche ne s'écrit pas.
  const b = banc({ pannes: { mettreAJourFiche: (a) => a.id === 'id-notion-outil' } });
  const valeurs = await b.envoyer('fusionner-valeurs', { cle: 'motsCles', de: 'Cancer', vers: 'cancer' }, MAX);
  assert.equal(valeurs.code, 502);
  assert.deepEqual(valeurs.corps, { code: 'interrompue', faites: 1, restantes: 1 }, 'la réponse ne change pas');
  assert.deepEqual(b.journalEcrit(), [{ geste: 'Valeurs fusionnées', par: MAX, sur: 'cancer', phrase: 'a commencé à fusionner « Cancer » dans « cancer » : 1 fiche faite, puis le geste a été interrompu' }]);
  // Fusion de porteurs : la fiche est rattachée, puis le doublon ne peut pas être mis à la corbeille.
  const c = banc({ pannes: { archiverPorteur: true } });
  const porteurs = (await c.lire('porteurs')).corps.porteurs;
  const repereDe = (nom) => porteurs.find((o) => o.nom === nom).id;
  const fusion = await c.envoyer('fusionner-porteurs', { doublon: repereDe('C.H.U.M.'), garde: repereDe('CHUM') }, MAX);
  assert.equal(fusion.code, 502);
  assert.deepEqual(fusion.corps, { code: 'interrompue', faites: 1, restantes: 0 });
  assert.deepEqual(c.journalEcrit(), [{ geste: 'Porteurs fusionnés', par: MAX, sur: 'CHUM', phrase: 'a commencé à fusionner le porteur C.H.U.M. dans CHUM : 1 fiche faite, puis le geste a été interrompu' }]);
});

test('une fusion « à poursuivre » est notée si des fiches sont faites ; un échec sans aucune fiche faite ne note rien', async () => {
  const b = banc();
  let retour = { ok: false, code: 'a-poursuivre', faites: 2, restantes: 5 };
  b.deps.qualite.fusionnerValeurs = async () => retour;
  const corps = { cle: 'motsCles', de: 'Cancer', vers: 'cancer' };
  const res = await b.envoyer('fusionner-valeurs', corps, MAX);
  assert.equal(res.code, 409);
  assert.deepEqual(res.corps, { code: 'a-poursuivre', faites: 2, restantes: 5 });
  assert.deepEqual(b.journalEcrit().map((l) => l.phrase), ['a commencé à fusionner « Cancer » dans « cancer » : 2 fiches faites, puis le geste a été interrompu']);
  for (retour of [{ ok: false, code: 'interrompue', faites: 0, restantes: 2 }, { ok: false, code: 'occupee', faites: 0, restantes: 2 }, { ok: false, code: 'notion' }]) {
    await b.envoyer('fusionner-valeurs', corps, MAX);
  }
  assert.equal(b.journalEcrit().length, 1);
  // Les noms des porteurs introuvables au moment de noter : la ligne est écrite quand même, sans eux.
  const c = banc();
  c.deps.porteurs.fusionner = async () => ({ ok: false, code: 'a-poursuivre', faites: 3, restantes: 1 });
  c.deps.porteurs.lister = async () => { throw new Error('Notion en panne'); };
  const fusion = await c.envoyer('fusionner-porteurs', { doublon: '~000000000000000000000001', garde: '~000000000000000000000002' }, MAX);
  assert.equal(fusion.code, 409);
  assert.deepEqual(c.journalEcrit(), [{ geste: 'Porteurs fusionnés', par: MAX, sur: '', phrase: 'a commencé à fusionner deux porteurs : 3 fiches faites, puis le geste a été interrompu' }]);
});

test('le journal ne retarde jamais un geste de plus de trois secondes, et sa lenteur va au journal du serveur', async (t) => {
  const b = banc();
  b.deps.journalEquipe.noter = () => new Promise(() => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const laisserFaire = async () => { for (let i = 0; i < 30; i++) await new Promise((suite) => setImmediate(suite)); };
  let res = null;
  b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX).then((r) => { res = r; });
  await laisserFaire();
  assert.equal(b.fiches[0].verifieePar, 'Équipe du RSN', 'le geste est fait');
  assert.equal(res, null, 'la réponse attend le journal');
  t.mock.timers.tick(2999);
  await laisserFaire();
  assert.equal(res, null, 'encore un instant');
  t.mock.timers.tick(1);
  await laisserFaire();
  assert.ok(res, 'au bout de trois secondes, la réponse part sans le journal');
  assert.equal(res.code, 200);
  assert.equal(res.corps.ok, true);
  assert.ok(b.lignesServeur.some((l) => /journal de l'équipe.*trois secondes/.test(l)), b.lignesServeur.join(' | '));
});

test('un journal qui échoue après les trois secondes ne lève rien ; un journal rapide ne laisse aucune minuterie', async (t) => {
  const b = banc();
  let rejeter;
  b.deps.journalEquipe.noter = () => new Promise((_, rejet) => { rejeter = rejet; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const laisserFaire = async () => { for (let i = 0; i < 30; i++) await new Promise((suite) => setImmediate(suite)); };
  let res = null;
  b.envoyer('verifier', { fiche: 'cohorte-x' }, MAX).then((r) => { res = r; });
  await laisserFaire();
  t.mock.timers.tick(3000);
  await laisserFaire();
  assert.equal(res.code, 200);
  rejeter(new Error('trop tard'));
  await laisserFaire();
  // Un journal rapide : la réponse part sans attendre la minuterie.
  const c = banc();
  const rapide = await c.envoyer('revoir', { fiche: 'cohorte-x', actif: true, note: 'x' }, MAX);
  assert.equal(rapide.code, 200);
  assert.equal(c.journalEcrit().length, 1);
});
