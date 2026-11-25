const test = require('node:test');
const assert = require('node:assert/strict');
const { creerEquipe, reperePersonneValide, administrationApres } = require('../lib/equipe');
const { creerPropositions } = require('../lib/propositions');
const { verifier } = require('../lib/jetons');
const { fauxNotion } = require('./aides/faux-notion');
const { inscrire, lignes, BASE } = require('./aides/fausse-equipe');

const SECRET = 'secret-d-essai';
const ENV = { NOTION_DB_APPROBATEURS: BASE, JWT_SECRET: SECRET };
const TESS = 'tess@exemple.ca';
const MAX = 'max@exemple.ca';
const LEA = 'lea@exemple.ca';
const ODILE = 'odile@exemple.ca';
const ORIGINE = 'https://carto.exemple';

// Tess (Administration), Max (Approbation), Léa (Lecture seule, sans résumé), Odile (retirée).
function banc({ pannes = {}, envoi = { envoye: true }, verrous, admins = [TESS], secret = SECRET } = {}) {
  const faux = fauxNotion({ pannes });
  inscrire(faux, { id: 'id-notion-tess', nom: 'Tess Berthier', courriel: TESS, role: admins.includes(TESS) ? 'Administration' : 'Approbation' });
  inscrire(faux, { id: 'id-notion-max', nom: 'Maxime Lafrenière', courriel: MAX, role: admins.includes(MAX) ? 'Administration' : 'Approbation' });
  inscrire(faux, { id: 'id-notion-lea', nom: 'Léa Lecture', courriel: LEA, role: 'Lecture seule', sansResume: true });
  inscrire(faux, { id: 'id-notion-odile', nom: 'Odile Charbonneau', courriel: ODILE, role: 'Approbation', actif: false, sansResume: true });
  const envois = []; const journal = [];
  const courriels = { async lienPanneau(m) { envois.push(m); if (envoi === 'panne') throw new Error('Resend en panne'); return envoi; } };
  const equipe = creerEquipe({ client: faux.client, env: ENV, courriels, verrous, secret, journal: (...l) => journal.push(l.join(' ')), attendre: async () => {} });
  const ecritures = () => faux.de('pages.create').length + faux.de('pages.update').length;
  const repere = async (courriel) => ((await equipe.lister({ moi: TESS })).find((x) => x.courriel === courriel) || {}).id;
  return { faux, equipe, envois, journal, ecritures, repere, lignes: () => lignes(faux), ligne: (courriel) => lignes(faux).filter((l) => l.courriel === courriel) };
}

// ─── Lecture ───
test('la liste donne les personnes actives, « moi » sur la sienne, et un repère opaque à la place de l\'identifiant Notion', async () => {
  const b = banc();
  const liste = await b.equipe.lister({ moi: MAX });
  assert.deepEqual(liste.map((x) => [x.nom, x.courriel, x.role, x.resume, x.moi]), [
    ['Léa Lecture', LEA, 'lecture', false, false],
    ['Maxime Lafrenière', MAX, 'approbation', true, true],
    ['Tess Berthier', TESS, 'administration', true, false],
  ]);
  for (const x of liste) { assert.match(x.id, /^~[0-9a-f]{24}$/); assert.ok(reperePersonneValide(x.id)); }
  assert.equal(new Set(liste.map((x) => x.id)).size, 3);
  assert.ok(!JSON.stringify(liste).includes('id-notion'));
  assert.deepEqual((await b.equipe.lister({ moi: MAX })).map((x) => x.id), liste.map((x) => x.id), 'le repère est stable');
  assert.equal(reperePersonneValide('id-notion-tess'), false);
  assert.equal(reperePersonneValide(null), false);
});

// ─── Inviter ───
test('inviter crée la ligne dans « Approbateurs » et envoie le lien d\'entrée signé, à l\'origine sûre', async () => {
  const b = banc();
  const r = await b.equipe.inviter({ courriel: '  Nadia@Exemple.ORG ', nom: '  Nadia   Tremblay ', role: 'approbation', par: TESS, origine: ORIGINE });
  assert.equal(r.ok, true);
  assert.equal(r.courriel, true);
  assert.equal(r.reactivee, false);
  assert.equal(r.nom, 'Nadia Tremblay');
  assert.match(r.id, /^~[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify(r).includes('page-'), 'aucun identifiant Notion');
  const [creee] = b.faux.de('pages.create');
  assert.deepEqual(creee.parent, { database_id: BASE });
  assert.deepEqual(b.ligne('nadia@exemple.org').map(({ id, ...l }) => l), [{ nom: 'Nadia Tremblay', courriel: 'nadia@exemple.org', role: 'Approbation', actif: true, sansResume: false }]);
  assert.equal(b.envois.length, 1);
  assert.equal(b.envois[0].a, 'nadia@exemple.org');
  const lien = /^https:\/\/carto\.exemple\/admin\?jeton=([\w.-]+)$/.exec(b.envois[0].lien);
  assert.ok(lien, b.envois[0].lien);
  const charge = verifier(lien[1], 'panneau', { secret: SECRET });
  assert.equal(charge.courriel, 'nadia@exemple.org');
  assert.ok(charge.jti);
  assert.equal(verifier(lien[1], 'session', { secret: SECRET }), null, 'ce n\'est pas une session');
  // La personne invitée fait maintenant partie de l'équipe que lit le reste du panneau.
  const propositions = creerPropositions(b.faux.client, { ...ENV, NOTION_DB_PROPOSITIONS: 'base-propositions' });
  assert.equal(await propositions.roleDe('nadia@exemple.org'), 'approbation');
});

test('une personne invitée en lecture seule ne reçoit pas le résumé hebdomadaire au départ', async () => {
  const b = banc();
  await b.equipe.inviter({ courriel: 'dir@exemple.org', nom: 'Direction', role: 'lecture', par: TESS, origine: ORIGINE });
  assert.deepEqual(b.ligne('dir@exemple.org').map((l) => [l.role, l.sansResume]), [['Lecture seule', true]]);
});

test('une adresse déjà inscrite et active est refusée : rien d\'écrit, aucun courriel', async () => {
  const b = banc();
  const r = await b.equipe.inviter({ courriel: ' MAX@exemple.ca', nom: 'Max', role: 'administration', par: TESS, origine: ORIGINE });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'deja-inscrite');
  assert.ok(r.erreurs.courriel);
  assert.equal(b.ecritures(), 0);
  assert.equal(b.envois.length, 0);
  assert.deepEqual(b.ligne(MAX).map((l) => l.role), ['Approbation']);
});

test('une personne retirée auparavant est réactivée, avec le rôle et le nom donnés, sans seconde ligne', async () => {
  const b = banc();
  const r = await b.equipe.inviter({ courriel: ODILE, nom: 'Odile C.', role: 'lecture', par: TESS, origine: ORIGINE });
  assert.equal(r.ok, true);
  assert.equal(r.reactivee, true);
  assert.equal(b.faux.de('pages.create').length, 0);
  assert.deepEqual(b.ligne(ODILE).map(({ id, ...l }) => l), [{ nom: 'Odile C.', courriel: ODILE, role: 'Lecture seule', actif: true, sansResume: true }]);
  assert.equal(b.envois.length, 1);
  assert.equal(b.envois[0].a, ODILE);
});

test('une invitation mal remplie est refusée champ par champ, sans rien écrire', async () => {
  const b = banc();
  const cas = [
    [{ courriel: 'pas-une-adresse', nom: 'X', role: 'approbation' }, 'courriel'],
    [{ courriel: 'a@b.org', nom: '   ', role: 'approbation' }, 'nom'],
    [{ courriel: 'a@b.org', nom: 'x'.repeat(201), role: 'approbation' }, 'nom'],
    [{ courriel: 'a@b.org', nom: 'X', role: 'Administration' }, 'role'],
    [{ courriel: 'a@b.org', nom: 'X', role: '__proto__' }, 'role'],
    [{ courriel: 'a@b.org', nom: 42, role: 'approbation' }, 'nom'],
  ];
  for (const [demande, champ] of cas) {
    const r = await b.equipe.inviter({ ...demande, par: TESS, origine: ORIGINE });
    assert.equal(r.code, 'invalide', JSON.stringify(demande));
    assert.ok(r.erreurs[champ], champ);
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.envois.length, 0);
});

test('seule l\'Administration invite : Approbation, lecture seule, personne retirée ou inconnue sont refusées', async () => {
  const b = banc();
  for (const par of [MAX, LEA, ODILE, 'intrus@exemple.org', '', null]) {
    const r = await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'lecture', par, origine: ORIGINE });
    assert.deepEqual(r, { ok: false, code: 'role' }, String(par));
  }
  assert.equal(b.ecritures(), 0);
  assert.equal(b.envois.length, 0);
});

test('si le courriel ne part pas, la personne reste inscrite et la réponse le dit', async () => {
  for (const envoi of [{ envoye: false }, 'panne']) {
    const b = banc({ envoi });
    const r = await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: ORIGINE });
    assert.equal(r.ok, true);
    assert.equal(r.courriel, false);
    assert.equal(b.ligne('a@b.org').length, 1);
  }
  // Sans origine sûre, aucun lien n'est fabriqué.
  const b = banc();
  const r = await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: '' });
  assert.equal(r.ok, true);
  assert.equal(r.courriel, false);
  assert.equal(b.envois.length, 0);
});

test('Notion en panne pendant une invitation : refus net, aucun courriel', async () => {
  const b = banc({ pannes: { 'pages.create': true } });
  const r = await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: ORIGINE });
  assert.deepEqual(r, { ok: false, code: 'notion' });
  assert.equal(b.envois.length, 0);
  assert.ok(await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: ORIGINE }), 'le verrou est rendu');
});

test('deux invitations de la même adresse en même temps : une seule ligne', async () => {
  const b = banc();
  const demande = { courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: ORIGINE };
  const retours = await Promise.all([b.equipe.inviter(demande), b.equipe.inviter(demande)]);
  assert.deepEqual(retours.map((r) => r.ok).sort(), [false, true]);
  assert.equal(retours.find((r) => !r.ok).code, 'deja-inscrite');
  assert.equal(b.ligne('a@b.org').length, 1);
});

test('le verrou de l\'équipe pris par un autre geste : « occupee », rien d\'écrit', async () => {
  const verrous = { async prendreVerrou() { return false; }, async rendreVerrou() {} };
  const b = banc({ verrous });
  const r = await b.equipe.inviter({ courriel: 'a@b.org', nom: 'A', role: 'approbation', par: TESS, origine: ORIGINE });
  assert.deepEqual(r, { ok: false, code: 'occupee' });
  assert.equal(b.ecritures(), 0);
});

// ─── Changer un rôle ───
test('l\'Administration change le rôle d\'une autre personne', async () => {
  const b = banc();
  const r = await b.equipe.changerRole({ personne: await b.repere(MAX), role: 'lecture', par: TESS });
  assert.deepEqual(r, { ok: true, id: await b.repere(MAX), nom: 'Maxime Lafrenière', role: 'lecture' });
  assert.deepEqual(b.ligne(MAX).map((l) => l.role), ['Lecture seule']);
  const [ecrit] = b.faux.de('pages.update');
  assert.deepEqual(ecrit, { page_id: 'id-notion-max', properties: { 'Rôle': { select: { name: 'Lecture seule' } } } });
});

test('personne ne change son propre rôle, pas même l\'Administration', async () => {
  const b = banc();
  for (const role of ['lecture', 'approbation', 'administration']) {
    const r = await b.equipe.changerRole({ personne: await b.repere(TESS), role, par: TESS });
    assert.equal(r.code, 'soi-meme', role);
  }
  assert.equal(b.ecritures(), 0);
});

test('une personne qui n\'est pas en Administration ne change aucun rôle, ni le sien ni celui d\'un autre', async () => {
  const b = banc();
  for (const [par, cible] of [[MAX, MAX], [MAX, LEA], [MAX, TESS], [LEA, LEA], [ODILE, MAX], ['intrus@exemple.org', MAX]]) {
    const r = await b.equipe.changerRole({ personne: await b.repere(cible), role: 'administration', par });
    assert.deepEqual(r, { ok: false, code: 'role' }, `${par} → ${cible}`);
  }
  assert.equal(b.ecritures(), 0);
});

test('un rôle inconnu, un repère mal formé ou une personne retirée : rien ne change', async () => {
  const b = banc();
  assert.equal((await b.equipe.changerRole({ personne: await b.repere(MAX), role: 'Chef', par: TESS })).code, 'invalide');
  assert.equal((await b.equipe.changerRole({ personne: 'id-notion-max', role: 'lecture', par: TESS })).code, 'introuvable');
  assert.equal((await b.equipe.changerRole({ personne: '~000000000000000000000000', role: 'lecture', par: TESS })).code, 'introuvable');
  assert.equal(b.ecritures(), 0);
});

test('deux personnes en Administration qui se rétrogradent l\'une l\'autre au même moment : il en reste une', async () => {
  const b = banc({ admins: [TESS, MAX] });
  const [versMax, versTess] = [await b.repere(MAX), await b.repere(TESS)];
  const retours = await Promise.all([
    b.equipe.changerRole({ personne: versMax, role: 'approbation', par: TESS }),
    b.equipe.changerRole({ personne: versTess, role: 'approbation', par: MAX }),
  ]);
  assert.deepEqual(retours.map((r) => r.ok).sort(), [false, true]);
  assert.equal(retours.find((r) => !r.ok).code, 'role', 'la seconde relit l\'équipe sous le verrou : elle n\'est plus en Administration');
  assert.equal(b.lignes().filter((l) => l.actif && l.role === 'Administration').length, 1);
});

test('il reste toujours une personne active en Administration : le compte se fait sur l\'équipe telle qu\'elle serait après le geste', () => {
  const lignes = [
    { pageId: 'a', courriel: TESS, role: 'administration', actif: true },
    { pageId: 'b', courriel: MAX, role: 'approbation', actif: true },
    { pageId: 'c', courriel: ODILE, role: 'administration', actif: false },
  ];
  assert.equal(administrationApres(lignes, 'a', { role: 'approbation' }), 0);
  assert.equal(administrationApres(lignes, 'a', { actif: false }), 0);
  assert.equal(administrationApres(lignes, 'b', { role: 'lecture' }), 1);
  assert.equal(administrationApres(lignes, 'b', { role: 'administration' }), 2);
  assert.equal(administrationApres(lignes, 'b', { actif: false }), 1);
});

test('avec deux lignes pour la même adresse, viser l\'une d\'elles reste se viser soi-même', async () => {
  const b = banc();
  inscrire(b.faux, { id: 'id-notion-tess-bis', nom: 'Tess (seconde ligne)', courriel: TESS, role: 'Approbation' });
  const liste = await b.equipe.lister({ moi: TESS });
  assert.equal(liste.filter((x) => x.courriel === TESS && x.moi).length, 2);
  for (const ligne of liste.filter((x) => x.courriel === TESS)) {
    assert.equal((await b.equipe.changerRole({ personne: ligne.id, role: 'lecture', par: TESS })).code, 'soi-meme');
    assert.equal((await b.equipe.retirer({ personne: ligne.id, par: TESS })).code, 'soi-meme');
  }
  assert.equal(b.ecritures(), 0);
});

// ─── Retirer ───
test('retirer décoche « Actif » et ne supprime rien : la ligne et le nom restent', async () => {
  const b = banc();
  const r = await b.equipe.retirer({ personne: await b.repere(MAX), par: TESS });
  assert.equal(r.ok, true);
  assert.equal(r.nom, 'Maxime Lafrenière');
  assert.deepEqual(b.faux.de('pages.update'), [{ page_id: 'id-notion-max', properties: { Actif: { checkbox: false } } }]);
  assert.deepEqual(b.ligne(MAX).map(({ id, ...l }) => l), [{ nom: 'Maxime Lafrenière', courriel: MAX, role: 'Approbation', actif: false, sansResume: false }]);
  assert.ok(!(await b.equipe.lister({ moi: TESS })).some((x) => x.courriel === MAX));
});

test('personne ne se retire soi-même, et seule l\'Administration retire', async () => {
  const b = banc();
  assert.equal((await b.equipe.retirer({ personne: await b.repere(TESS), par: TESS })).code, 'soi-meme');
  assert.deepEqual(await b.equipe.retirer({ personne: await b.repere(LEA), par: MAX }), { ok: false, code: 'role' });
  assert.deepEqual(await b.equipe.retirer({ personne: await b.repere(MAX), par: MAX }), { ok: false, code: 'role' });
  assert.equal(b.ecritures(), 0);
});

test('deux personnes en Administration qui se retirent l\'une l\'autre au même moment : il en reste une', async () => {
  const b = banc({ admins: [TESS, MAX] });
  const [versMax, versTess] = [await b.repere(MAX), await b.repere(TESS)];
  const retours = await Promise.all([b.equipe.retirer({ personne: versMax, par: TESS }), b.equipe.retirer({ personne: versTess, par: MAX })]);
  assert.deepEqual(retours.map((r) => r.ok).sort(), [false, true]);
  assert.equal(b.lignes().filter((l) => l.actif && l.role === 'Administration').length, 1);
});

// ─── Résumé hebdomadaire ───
test('chaque personne règle son propre résumé, quel que soit son rôle', async () => {
  const b = banc();
  const r = await b.equipe.reglerResume({ personne: await b.repere(LEA), actif: true, par: LEA });
  assert.deepEqual(r, { ok: true, id: await b.repere(LEA), nom: 'Léa Lecture', resume: true });
  assert.deepEqual(b.faux.de('pages.update'), [{ page_id: 'id-notion-lea', properties: { 'Sans résumé hebdomadaire': { checkbox: false } } }]);
  assert.equal((await b.equipe.reglerResume({ personne: await b.repere(MAX), actif: false, par: MAX })).resume, false);
  assert.deepEqual(b.ligne(MAX).map((l) => l.sansResume), [true]);
});

test('le résumé d\'une autre personne : l\'Administration seulement', async () => {
  const b = banc();
  assert.deepEqual(await b.equipe.reglerResume({ personne: await b.repere(TESS), actif: false, par: MAX }), { ok: false, code: 'role' });
  assert.deepEqual(await b.equipe.reglerResume({ personne: await b.repere(MAX), actif: false, par: LEA }), { ok: false, code: 'role' });
  assert.deepEqual(await b.equipe.reglerResume({ personne: await b.repere(MAX), actif: false, par: 'intrus@exemple.org' }), { ok: false, code: 'role' });
  assert.equal(b.ecritures(), 0);
  assert.equal((await b.equipe.reglerResume({ personne: await b.repere(MAX), actif: false, par: TESS })).ok, true);
  assert.deepEqual(b.ligne(MAX).map((l) => l.sansResume), [true]);
  assert.equal((await b.equipe.reglerResume({ personne: await b.repere(MAX), actif: 'oui', par: TESS })).code, 'invalide');
});

test('Notion en panne pendant un réglage : refus net, et le verrou est rendu', async () => {
  const b = banc({ pannes: { 'pages.update': true } });
  assert.deepEqual(await b.equipe.retirer({ personne: await b.repere(MAX), par: TESS }), { ok: false, code: 'notion' });
  assert.deepEqual(await b.equipe.changerRole({ personne: await b.repere(MAX), role: 'lecture', par: TESS }), { ok: false, code: 'notion' });
  assert.ok(b.journal.length >= 2);
});
