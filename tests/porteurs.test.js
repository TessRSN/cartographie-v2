const test = require('node:test');
const assert = require('node:assert/strict');
const { PROP } = require('../lib/notion');
const { reperePorteurValide } = require('../lib/porteurs');
const { banc, repereDe, porteur, FICHES, TESS, LEA } = require('./aides/banc-lot3');
const { brute } = require('./aides/fausses-fiches');

const relation = (b, id) => b.fiches.find((f) => f.id === id).porteurIds;
const fusion = async (b, par = TESS) => b.porteursService.fusionner({ doublon: await repereDe(b, 'C.H.U.M.'), garde: await repereDe(b, 'CHUM'), par });

test('la liste des porteurs : ressources comptées, placé ou non, lien avec le bottin sans aucune lecture de plus', async () => {
  const b = banc();
  const { porteurs } = await b.porteursService.lister();
  assert.deepEqual(porteurs.map((p) => [p.nom, p.place, p.ressources, p.ecartees, p.bottin]), [
    ['C.H.U.M.', false, 2, 1, false], ['CHUM', true, 2, 0, true], ['Hôpital Ste-Justine', false, 0, 1, true], ['Porteur sans fiche', false, 0, 0, false],
  ]);
  assert.ok(porteurs.every((p) => reperePorteurValide(p.id)));
  assert.equal(new Set(porteurs.map((p) => p.id)).size, 4);
  assert.ok(!JSON.stringify(porteurs).includes('id-notion'));
  assert.equal(b.de('lireTitrePage').length, 0, 'pas un appel par porteur pour le bottin');
  assert.deepEqual((await b.porteursService.lister()).porteurs.map((p) => p.id), porteurs.map((p) => p.id), 'le repère est stable');
});

test('le volet d\'un porteur : ses ressources désignées par leur repère, les autres porteurs, le nom de l\'institution s\'il se lit', async () => {
  const b = banc();
  const vue = await b.porteursService.lire(await repereDe(b, 'CHUM'));
  assert.deepEqual(vue.porteur, { id: vue.porteur.id, nom: 'CHUM', adresse: '1051 rue Sanguinet, Montréal', latitude: 45.51, longitude: -73.56, place: true, bottin: { nom: 'Centre hospitalier de l\'Université de Montréal' } });
  assert.deepEqual(vue.ressources.map((r) => [r.id, r.nom, r.statut]), [['beta', 'Bêta', 'publiee'], ['delta', 'Delta', 'publiee']]);
  assert.deepEqual(vue.autres.map((p) => p.nom), ['C.H.U.M.', 'Hôpital Ste-Justine', 'Porteur sans fiche']);
  const doublon = await b.porteursService.lire(await repereDe(b, 'C.H.U.M.'));
  assert.equal(doublon.porteur.bottin, null);
  assert.deepEqual(doublon.ressources.map((r) => r.statut), ['publiee', 'publiee', 'ecartee']);
  assert.match(doublon.ressources[2].id, /^~[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify([vue, doublon]).includes('id-notion'));
});

test('bottin : une institution illisible ne casse rien, le volet dit seulement que le porteur est lié', async () => {
  const b = banc();
  const vue = await b.porteursService.lire(await repereDe(b, 'Hôpital Ste-Justine'));
  assert.deepEqual(vue.porteur.bottin, { nom: null });
  assert.equal(await b.porteursService.lire('~000000000000000000000000'), null);
  assert.equal(await b.porteursService.lire('id-notion-chum'), null);
});

test('ajouter un porteur : le nom est obligatoire, et un nom déjà pris à la casse et aux accents près est refusé', async () => {
  const b = banc();
  for (const nom of ['', '   ', null, 42]) {
    const r = await b.porteursService.creer({ valeurs: { nom }, par: TESS });
    assert.equal(r.code, 'invalide', String(nom));
    assert.ok(r.erreurs.nom);
  }
  for (const nom of ['chum', ' CHUM ', 'hopital ste-justine', 'HÔPITAL  STE-JUSTINE']) {
    const r = await b.porteursService.creer({ valeurs: { nom }, par: TESS });
    assert.equal(r.code, 'doublon', nom);
    assert.ok(r.erreurs.nom);
  }
  assert.equal(b.ecritures(), 0);
  const r = await b.porteursService.creer({ valeurs: { nom: '  Institut  de cardiologie ', adresse: ' 5000 rue Bélanger ', latitude: 45.57, longitude: -73.58 }, par: TESS });
  assert.equal(r.ok, true);
  assert.ok(reperePorteurValide(r.id));
  assert.deepEqual(b.de('creerPorteur'), [{ nom: 'Institut de cardiologie', adresse: '5000 rue Bélanger', latitude: 45.57, longitude: -73.58 }]);
  assert.equal((await b.porteursService.lire(r.id)).porteur.place, true);
  assert.equal(b.vidages(), 1);
});

test('coordonnées : les deux ou aucune, et dans les bornes', async () => {
  const b = banc();
  for (const coordonnees of [{ latitude: 45 }, { latitude: 45, longitude: null }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: '45', longitude: '-73' }, { latitude: NaN, longitude: 1 }]) {
    const r = await b.porteursService.creer({ valeurs: { nom: 'Nouveau', ...coordonnees }, par: TESS });
    assert.equal(r.code, 'invalide', JSON.stringify(coordonnees));
  }
  assert.equal(b.ecritures(), 0);
});

test('modifier un porteur : seul ce qui change est écrit ; le renommer ne réécrit aucune fiche et n\'écrit aucune version', async () => {
  const b = banc();
  const repere = await repereDe(b, 'C.H.U.M.');
  const r = await b.porteursService.enregistrer({ repere, valeurs: { nom: 'Centre hospitalier', adresse: '', latitude: 45.5, longitude: -73.6 }, par: TESS });
  assert.deepEqual(r, { ok: true, id: repere });
  assert.deepEqual(b.de('mettreAJourPorteur'), [{ id: 'id-notion-doublon', valeurs: { nom: 'Centre hospitalier', latitude: 45.5, longitude: -73.6 } }]);
  assert.equal(b.de('mettreAJourFiche').length, 0);
  assert.equal(b.faux.de('pages.create').length, 0);
  assert.equal(b.vidages(), 1);
  const rien = await b.porteursService.enregistrer({ repere, valeurs: { nom: 'Centre hospitalier', adresse: '', latitude: 45.5, longitude: -73.6 }, par: TESS });
  assert.deepEqual(rien, { ok: true, id: repere, inchange: true });
  assert.equal(b.de('mettreAJourPorteur').length, 1);
  // Retirer de la carte : les deux coordonnées vides.
  await b.porteursService.enregistrer({ repere, valeurs: { latitude: null, longitude: null }, par: TESS });
  assert.deepEqual(b.de('mettreAJourPorteur')[1].valeurs, { latitude: null, longitude: null });
});

test('modifier un porteur : nom vide ou déjà pris refusé (son propre nom reste permis), porteur inconnu, verrou pris', async () => {
  const b = banc();
  const repere = await repereDe(b, 'C.H.U.M.');
  assert.equal((await b.porteursService.enregistrer({ repere, valeurs: { nom: ' ' }, par: TESS })).code, 'invalide');
  assert.equal((await b.porteursService.enregistrer({ repere, valeurs: { nom: 'Chum' }, par: TESS })).code, 'doublon');
  assert.equal((await b.porteursService.enregistrer({ repere, valeurs: { nom: 'c.h.u.m.' }, par: TESS })).ok, true);
  assert.equal((await b.porteursService.enregistrer({ repere: '~000000000000000000000000', valeurs: { nom: 'X' }, par: TESS })).code, 'introuvable');
  await b.verrous.prendreVerrou('porteur:id-notion-doublon');
  assert.equal((await b.porteursService.enregistrer({ repere, valeurs: { adresse: 'x' }, par: TESS })).code, 'occupee');
  assert.equal(b.de('mettreAJourPorteur').length, 1);
});

test('retrouver une adresse : coordonnées rendues, adresse inconnue dite, service en panne sans détail', async () => {
  const b = banc();
  assert.deepEqual(await b.porteursService.geocoder({ adresse: ' 1051 rue Sanguinet ', par: TESS }), { ok: true, latitude: 46.8, longitude: -71.2 });
  assert.deepEqual(b.geocodees, ['1051 rue Sanguinet']);
  assert.equal((await b.porteursService.geocoder({ adresse: '  ', par: TESS })).code, 'invalide');
  assert.equal((await banc({ coordonnees: null }).porteursService.geocoder({ adresse: 'nulle part', par: TESS })).code, 'adresse-introuvable');
  const panne = await banc({ coordonnees: 'panne' }).porteursService.geocoder({ adresse: 'x', par: TESS });
  assert.deepEqual(panne, { ok: false, code: 'notion' });
  assert.equal(b.ecritures(), 0);
});

test('une personne en lecture seule ne fait aucun geste sur les porteurs', async () => {
  const b = banc();
  const doublon = await repereDe(b, 'C.H.U.M.'); const garde = await repereDe(b, 'CHUM');
  const gestes = [
    b.porteursService.creer({ valeurs: { nom: 'Nouveau' }, par: LEA }),
    b.porteursService.enregistrer({ repere: doublon, valeurs: { nom: 'Autre' }, par: LEA }),
    b.porteursService.geocoder({ adresse: 'x', par: LEA }),
    b.porteursService.fusionner({ doublon, garde, par: LEA }),
    b.porteursService.fusionner({ doublon, garde, par: 'inconnue@exemple.ca' }),
  ];
  for (const r of await Promise.all(gestes)) assert.equal(r.code, 'non-approbateur');
  assert.equal(b.ecritures(), 0);
  assert.equal(b.geocodees.length, 0);
});

test('fusion complète : chaque fiche du doublon, publiée ou écartée, passe au porteur gardé sans doublon dans la relation, puis le doublon va à la corbeille', async () => {
  const b = banc();
  const r = await fusion(b);
  assert.deepEqual(r, { ok: true, faites: 3, historique: true, archive: true });
  assert.deepEqual(relation(b, 'id-notion-a'), ['id-notion-chum']);
  assert.deepEqual(relation(b, 'id-notion-b'), ['id-notion-chum'], 'le porteur gardé n\'y est qu\'une fois');
  assert.deepEqual(relation(b, 'id-notion-c'), ['id-notion-chum', 'id-notion-justine'], 'la fiche écartée suit aussi');
  assert.deepEqual(relation(b, 'id-notion-d'), ['id-notion-chum']);
  assert.deepEqual(b.de('mettreAJourFiche').map((a) => [a.id, Object.keys(a.proprietes)]), [['id-notion-a', [PROP.porteurs]], ['id-notion-b', [PROP.porteurs]], ['id-notion-c', [PROP.porteurs]]]);
  assert.deepEqual(b.de('archiverPorteur'), ['id-notion-doublon']);
  assert.ok(!b.porteurs.some((p) => p.id === 'id-notion-doublon'));
  assert.equal(b.vidages(), 1);
});

test('fusion : une version par fiche touchée, source « Qualité », sur le champ « Porté par », au nom de la personne', async () => {
  const b = banc();
  await fusion(b);
  assert.deepEqual(b.versionsEcrites(), [
    { fiche: 'id-notion-a', source: 'Qualité', par: TESS, changements: { porteurs: { avant: ['C.H.U.M.'], apres: ['CHUM'] } }, note: 'Fusion du porteur « C.H.U.M. » dans « CHUM »' },
    { fiche: 'id-notion-b', source: 'Qualité', par: TESS, changements: { porteurs: { avant: ['CHUM', 'C.H.U.M.'], apres: ['CHUM'] } }, note: 'Fusion du porteur « C.H.U.M. » dans « CHUM »' },
    { fiche: 'id-notion-c', source: 'Qualité', par: TESS, changements: { porteurs: { avant: ['C.H.U.M.', 'Hôpital Ste-Justine'], apres: ['CHUM', 'Hôpital Ste-Justine'] } }, note: 'Fusion du porteur « C.H.U.M. » dans « CHUM »' },
  ]);
  // L'historique d'une fiche lit cette version comme les autres.
  const lue = await b.ressources.lire('alpha');
  assert.equal(lue.versions[lue.versions.length - 1].source, 'qualite');
  assert.deepEqual(lue.valeurs.porteurs, ['CHUM']);
});

test('fusion interrompue : arrêt à la première erreur, avec le compte de ce qui est fait et de ce qui reste ; le doublon reste', async () => {
  const b = banc({ pannes: { mettreAJourFiche: (a) => a.id === 'id-notion-b' } });
  const r = await fusion(b);
  assert.deepEqual(r, { ok: false, code: 'interrompue', faites: 1, restantes: 2 });
  assert.deepEqual(relation(b, 'id-notion-a'), ['id-notion-chum']);
  assert.deepEqual(relation(b, 'id-notion-b'), ['id-notion-chum', 'id-notion-doublon']);
  assert.deepEqual(relation(b, 'id-notion-c'), ['id-notion-doublon', 'id-notion-justine'], 'rien n\'est tenté après l\'erreur');
  assert.equal(b.de('archiverPorteur').length, 0);
  assert.ok(b.porteurs.some((p) => p.id === 'id-notion-doublon'));
  assert.equal(b.versionsEcrites().length, 1);
  assert.equal(b.vidages(), 1, 'ce qui est fait paraît sur le site');
});

test('fusion reprise : relancer termine le travail sans rien refaire', async () => {
  let panne = true;
  const b = banc({ pannes: { mettreAJourFiche: (a) => panne && a.id === 'id-notion-b' } });
  await fusion(b);
  panne = false;
  const r = await fusion(b);
  assert.deepEqual(r, { ok: true, faites: 2, historique: true, archive: true });
  assert.deepEqual(b.de('mettreAJourFiche').map((a) => a.id), ['id-notion-a', 'id-notion-b', 'id-notion-b', 'id-notion-c'], 'la fiche déjà faite n\'est pas réécrite');
  assert.deepEqual(b.versionsEcrites().map((v) => v.fiche), ['id-notion-a', 'id-notion-b', 'id-notion-c'], 'une seule version par fiche');
  assert.deepEqual(b.de('archiverPorteur'), ['id-notion-doublon']);
  // Une troisième fois : le doublon n'existe plus.
  assert.equal((await b.porteursService.fusionner({ doublon: '~000000000000000000000000', garde: await repereDe(b, 'CHUM'), par: TESS })).code, 'introuvable');
});

test('le doublon n\'est pas mis à la corbeille tant qu\'une fiche, même écartée, y est rattachée', async () => {
  // La fiche écartée ne peut pas être écrite : le doublon reste.
  const b = banc({ pannes: { mettreAJourFiche: (a) => a.id === 'id-notion-c' } });
  assert.deepEqual(await fusion(b), { ok: false, code: 'interrompue', faites: 2, restantes: 1 });
  assert.equal(b.de('archiverPorteur').length, 0);
  // Une fiche écartée est rattachée au doublon pendant la fusion : la relecture finale la voit.
  let lectures = 0;
  const c = banc({ avant: (nom, args, base) => { if (nom === 'lireRessources' && ++lectures === 4) base.fiches.push(brute({ id: 'id-notion-tardive', nom: 'Tardive', statutFiche: 'Écartée', porteurIds: ['id-notion-doublon'] })); } });
  const r = await fusion(c);
  assert.deepEqual(r, { ok: false, code: 'interrompue', faites: 3, restantes: 1 });
  assert.equal(c.de('archiverPorteur').length, 0);
  assert.ok(c.porteurs.some((p) => p.id === 'id-notion-doublon'));
  assert.deepEqual(await fusion(c), { ok: true, faites: 1, historique: true, archive: true });
});

test('fusion : chaque fiche est changée sous son verrou ; une fiche occupée arrête le geste sans rien perdre', async () => {
  const tenus = new Set();
  const c = banc({ avant: (nom, args) => { if (nom === 'mettreAJourFiche') assert.ok(tenus.has(`fiche:${args[0]}`), 'écriture sous le verrou de la fiche'); } });
  const { prendreVerrou, rendreVerrou } = c.verrous;
  c.verrous.prendreVerrou = async (cle) => { const ok = await prendreVerrou(cle); if (ok) tenus.add(cle); return ok; };
  c.verrous.rendreVerrou = async (cle) => { tenus.delete(cle); return rendreVerrou(cle); };
  assert.equal((await fusion(c)).ok, true);
  assert.equal(c.de('mettreAJourFiche').length, 3);
  assert.equal(tenus.size, 0, 'tous les verrous sont rendus');
  // Une fiche occupée par un autre geste.
  const d = banc();
  await d.verrous.prendreVerrou('fiche:id-notion-b');
  assert.deepEqual(await fusion(d), { ok: false, code: 'occupee', faites: 1, restantes: 2 });
  assert.equal(d.de('archiverPorteur').length, 0);
  await d.verrous.rendreVerrou('fiche:id-notion-b');
  assert.deepEqual(await fusion(d), { ok: true, faites: 2, historique: true, archive: true });
});

test('fusion : une version qui ne s\'écrit pas remet la fiche comme avant, pour que la relance refasse les deux ; sans base des versions, la fusion se fait et le dit', async () => {
  const b = banc({ pannesVersions: { 'pages.create': true } });
  const r = await fusion(b);
  assert.deepEqual(r, { ok: false, code: 'interrompue', faites: 0, restantes: 3, sansVersion: true });
  // La fiche a été écrite, puis remise à ses porteurs d'avant.
  assert.equal(b.de('mettreAJourFiche').length, 2);
  assert.deepEqual(b.fiches.find((f) => f.id === 'id-notion-a').porteurIds, ['id-notion-doublon']);
  assert.equal(b.de('archiverPorteur').length, 0);
  const { NOTION_DB_VERSIONS, ...sansVersions } = b.env;
  const c = banc({ env: sansVersions });
  assert.deepEqual(await fusion(c), { ok: true, faites: 3, historique: false, archive: true });
});

test('fusion : le temps compté arrête proprement, et la suite se relance', async () => {
  let t = 0;
  const b = banc({ horloge: () => t, budgetMs: 1500, avant: (nom) => { if (nom === 'mettreAJourFiche') t += 1000; } });
  assert.deepEqual(await fusion(b), { ok: false, code: 'a-poursuivre', faites: 2, restantes: 1 });
  assert.equal(b.de('archiverPorteur').length, 0);
  t = 0;
  assert.deepEqual(await fusion(b), { ok: true, faites: 1, historique: true, archive: true });
});

test('fusion refusée : un porteur dans lui-même, un porteur inconnu, une fusion déjà en cours', async () => {
  const b = banc();
  const doublon = await repereDe(b, 'C.H.U.M.'); const garde = await repereDe(b, 'CHUM');
  assert.equal((await b.porteursService.fusionner({ doublon, garde: doublon, par: TESS })).code, 'invalide');
  assert.equal((await b.porteursService.fusionner({ doublon, garde: '~000000000000000000000000', par: TESS })).code, 'introuvable');
  assert.equal((await b.porteursService.fusionner({ doublon: 'id-notion-doublon', garde, par: TESS })).code, 'introuvable');
  await b.verrous.prendreVerrou('porteur:id-notion-chum');
  assert.equal((await b.porteursService.fusionner({ doublon, garde, par: TESS })).code, 'occupee');
  assert.equal(b.ecritures(), 0);
});

test('fusionner un porteur sans fiche : il va simplement à la corbeille', async () => {
  const b = banc();
  const r = await b.porteursService.fusionner({ doublon: await repereDe(b, 'Porteur sans fiche'), garde: await repereDe(b, 'CHUM'), par: TESS });
  assert.deepEqual(r, { ok: true, faites: 0, historique: true, archive: true });
  assert.deepEqual(b.de('archiverPorteur'), ['id-notion-vide']);
  assert.equal(FICHES().length, b.fiches.length);
});

// ─── Constats de la relecture ───
test('fusion : si le porteur gardé a disparu entre la lecture et le geste, rien n\'est rattaché ni mis à la corbeille', async () => {
  let fait = false;
  const b = banc({
    avant: async (nom, args, base) => {
      // Juste avant la première lecture d'une fiche sous verrou, une autre personne a mis le porteur gardé à la corbeille.
      if (nom === 'lirePorteur' && !fait) { fait = true; const i = base.porteurs.findIndex((p) => p.id === 'id-notion-chum'); if (i >= 0) base.porteurs.splice(i, 1); }
    },
  });
  const doublon = await repereDe(b, 'C.H.U.M.'); const garde = await repereDe(b, 'CHUM');
  const r = await b.porteursService.fusionner({ doublon, garde, par: TESS });
  assert.equal(r.code, 'introuvable');
  assert.equal(b.de('mettreAJourFiche').length, 0);
  assert.equal(b.de('archiverPorteur').length, 0);
  assert.deepEqual(b.fiches.find((f) => f.id === 'id-notion-a').porteurIds, ['id-notion-doublon']);
});
