const test = require('node:test');
const assert = require('node:assert/strict');
const { pointsDeQualite, normNom, normVal } = require('../lib/qualite');
const { brute } = require('./aides/fausses-fiches');

const MAINTENANT = Date.parse('2026-11-25T15:00:00.000Z');
const CHUM = { id: 'p-chum', nom: 'CHUM', latitude: 45.5, longitude: -73.5 };
// Une fiche sans aucun défaut : elle ne doit jamais rien signaler.
const saine = (o = {}) => brute({ id: 'f-saine', nom: 'Saine', porteurIds: ['p-chum'], logo: 'https://x.org/logo.png', verifieeLe: '2026-06-01', contact: 'a@b.org', motsCles: [], normes: [], ...o });
const points = (fiches, o = {}) => pointsDeQualite({ fiches, porteurs: [CHUM], maintenant: MAINTENANT, ...o });
const du = (liste, sujet) => liste.filter((p) => p.sujet === sujet);

test('une fiche complète et à jour ne signale rien', () => {
  assert.deepEqual(points([saine()]), []);
});

test('une fiche écartée n\'est jamais signalée, quel que soit son défaut', () => {
  const ecartee = saine({ statutFiche: 'Écartée', contact: null, porteurIds: [], logo: null, verifieeLe: null, lienEnPanneDepuis: '2026-11-01', motsCles: ['fhir'] });
  assert.deepEqual(points([ecartee, saine({ id: 'f2', nom: 'Autre', motsCles: ['FHIR'] })]), []);
});

test('fiches sans contact, sans porteur', () => {
  const liste = points([saine({ contact: null }), saine({ id: 'f2', nom: 'Orpheline', porteurIds: [] }), saine({ id: 'f3', nom: 'Fantôme', porteurIds: ['porteur-disparu'] })]);
  assert.deepEqual(du(liste, 'sansContact').map((p) => p.fiche), [{ id: 'f-saine', nom: 'Saine' }]);
  assert.deepEqual(du(liste, 'sansPorteur').map((p) => p.fiche.nom), ['Fantôme', 'Orpheline']);
  assert.equal(liste.length, 3);
});

test('sans logo : une image déposée compte comme un logo, même sans adresse', () => {
  const liste = points([saine({ logo: null, logoFichier: 'logo.png' }), saine({ id: 'f2', nom: 'Nue', logo: null }), saine({ id: 'f3', nom: 'Vide', logo: '' })]);
  assert.deepEqual(du(liste, 'sansLogo').map((p) => p.fiche.nom), ['Nue', 'Vide']);
  assert.equal(liste.length, 2);
});

test('sans logo : la proposition ouverte qui en apporte un est signalée (image jointe ou adresse)', () => {
  const fiches = [saine({ id: 'f1', nom: 'A', logo: null }), saine({ id: 'f2', nom: 'B', logo: null }), saine({ id: 'f3', nom: 'C', logo: null }), saine({ id: 'f4', nom: 'D', logo: null })];
  const propositions = [
    { id: 'prop-image', ficheId: 'f1', statut: 'attente', logoPropose: { nom: 'l.png', url: 'https://secret' }, contenu: { propose: {} } },
    { id: 'prop-adresse', ficheId: 'f2', statut: 'verification', contenu: { propose: { logo: { apres: 'https://x.org/l.png' } } } },
    { id: 'prop-sans', ficheId: 'f3', statut: 'attente', contenu: { propose: { phrase: { apres: 'x' }, logo: { apres: null } } } },
    { id: 'prop-tranchee', ficheId: 'f4', statut: 'approuvee', logoPropose: { nom: 'l.png' }, contenu: { propose: {} } },
  ];
  const liste = du(points(fiches, { propositions }), 'sansLogo');
  assert.deepEqual(liste.map((p) => p.proposition), ['prop-image', 'prop-adresse', null, null]);
  assert.ok(!JSON.stringify(liste).includes('secret'));
});

test('jamais vérifiée, ou vérifiée depuis plus d\'un an ; moins d\'un an ne signale rien', () => {
  const liste = points([
    saine({ id: 'f1', nom: 'Jamais', verifieeLe: null }),
    saine({ id: 'f2', nom: 'Vieille', verifieeLe: '2025-11-20' }),
    saine({ id: 'f3', nom: 'Récente', verifieeLe: '2025-11-27' }),
    saine({ id: 'f4', nom: 'Hier', verifieeLe: '2026-11-24' }),
  ]);
  assert.deepEqual(liste, [
    { sujet: 'aVerifier', fiche: { id: 'f1', nom: 'Jamais' }, verifieeLe: null },
    { sujet: 'aVerifier', fiche: { id: 'f2', nom: 'Vieille' }, verifieeLe: '2025-11-20' },
  ]);
});

test('normVal et normNom : les règles de la maquette', () => {
  assert.equal(normVal('HL7-FHIR'), 'hl7fhir');
  assert.equal(normVal(' Génomique '), 'genomique');
  assert.equal(normNom('Hôpital Ste-Justine (CHU)'), 'hopital sainte justine');
  assert.equal(normNom('CHU St. Jérôme'), 'chu saint jerome');
});

test('mots-clés en double : même écriture à la casse, aux accents et à la ponctuation près ; pas de sous-chaîne', () => {
  const liste = du(points([
    saine({ id: 'f1', nom: 'A', motsCles: ['génomique', 'cancer'] }),
    saine({ id: 'f2', nom: 'B', motsCles: ['Genomique', 'cancérologie'] }),
    saine({ id: 'f3', nom: 'C', motsCles: ['Genomique'] }),
    saine({ id: 'f4', nom: 'D', motsCles: ['genomique'], statutFiche: 'Écartée' }),
  ]), 'doublons');
  assert.deepEqual(liste, [{ sujet: 'doublons', cle: 'motsCles', garder: 'génomique', retirer: 'Genomique', fiches: { garder: 1, retirer: 2 }, toutes: { garder: 1, retirer: 2 }, sur: true }]);
});

test('normes en double : une norme contenue dans une autre (quatre lettres au moins) ; l\'écriture la plus longue est proposée', () => {
  const liste = du(points([
    saine({ id: 'f1', nom: 'A', normes: ['fhir', 'DICOM'] }),
    saine({ id: 'f2', nom: 'B', normes: ['HL7 FHIR', 'CSV'] }),
    saine({ id: 'f3', nom: 'C', normes: ['CS', 'OMOP CDM'] }),
    saine({ id: 'f4', nom: 'D', normes: ['fhir'], statutFiche: 'Écartée' }),
  ]), 'doublons');
  assert.deepEqual(liste, [{ sujet: 'doublons', cle: 'normes', garder: 'HL7 FHIR', retirer: 'fhir', fiches: { garder: 1, retirer: 1 }, toutes: { garder: 1, retirer: 2 }, sur: false }]);
});

test('porteurs peut-être en double : même nom une fois réduit ; un nom vide ne compte pas', () => {
  const porteurs = [CHUM, { id: 'p2', nom: 'Hôpital Ste-Justine' }, { id: 'p3', nom: 'Hopital Sainte Justine (CHU)' }, { id: 'p4', nom: '' }, { id: 'p5', nom: '()' }, { id: 'p6', nom: 'CHUS' }];
  const liste = pointsDeQualite({ fiches: [saine()], porteurs, maintenant: MAINTENANT });
  assert.deepEqual(liste, [{ sujet: 'porteursDoubles', porteur: { id: 'p3', nom: 'Hopital Sainte Justine (CHU)' }, autre: { id: 'p2', nom: 'Hôpital Ste-Justine' } }]);
});

test('valeurs nouvelles : celles des propositions ouvertes qui ne sont dans aucune fiche ni dans les listes connues', () => {
  const propositions = [
    { id: 'prop-1', ficheId: 'f-saine', statut: 'attente', contenu: { propose: { motsCles: { apres: ['cancer', 'Apprentissage', 'CANCER'] }, outils: { apres: ['R'] }, phrase: { apres: 'x' } } } },
    { id: 'prop-2', ficheId: null, statut: 'verification', titre: 'Nouvelle : Plateforme Z', contenu: { propose: { nom: { apres: 'Plateforme Z' }, normes: { apres: ['OMOP'] }, financePar: { apres: ['FRQS'] } } } },
    { id: 'prop-3', ficheId: 'f-saine', statut: 'refusee', contenu: { propose: { motsCles: { apres: ['refusé'] } } } },
    { id: 'prop-4', ficheId: 'f-saine', statut: 'attente', contenu: null },
  ];
  const liste = du(points([saine({ motsCles: ['cancer'] }), saine({ id: 'f2', nom: 'Écartée', statutFiche: 'Écartée', outils: ['R'] })], { propositions, connues: { financePar: ['frqs'] } }), 'valeursNouvelles');
  assert.deepEqual(liste, [
    { sujet: 'valeursNouvelles', cle: 'motsCles', valeur: 'Apprentissage', proposition: { id: 'prop-1', nom: 'Saine' } },
    { sujet: 'valeursNouvelles', cle: 'normes', valeur: 'OMOP', proposition: { id: 'prop-2', nom: 'Plateforme Z' } },
  ]);
});

test('lien principal qui ne répond plus : seulement une fiche publiée qui a encore un lien', () => {
  const liste = du(points([
    saine({ id: 'f1', nom: 'Tombée', lien: 'https://tombe.org', lienEnPanneDepuis: '2026-11-18' }),
    saine({ id: 'f2', nom: 'Sans lien', lien: null, lienEnPanneDepuis: '2026-11-18' }),
    saine({ id: 'f3', nom: 'Debout', lien: 'https://debout.org', lienEnPanneDepuis: null }),
  ]), 'liens');
  assert.deepEqual(liste, [{ sujet: 'liens', fiche: { id: 'f1', nom: 'Tombée' }, lien: 'https://tombe.org', depuis: '2026-11-18' }]);
});

test('les repères remplacent les identifiants de Notion ; les sujets sortent dans l\'ordre de l\'écran', () => {
  const liste = pointsDeQualite({
    fiches: [saine({ id: 'id-notion-1', contact: null, porteurIds: [], logo: null, verifieeLe: null, lienEnPanneDepuis: '2026-11-18', motsCles: ['a b', 'A-B'] })],
    porteurs: [{ id: 'id-notion-p1', nom: 'CHUM' }, { id: 'id-notion-p2', nom: 'chum' }], maintenant: MAINTENANT,
    propositions: [{ id: 'prop-1', ficheId: 'id-notion-1', statut: 'attente', contenu: { propose: { outils: { apres: ['R'] } } } }],
    repereFiche: (id) => `fiche(${id.slice(-1)})`, reperePorteur: (id) => `porteur(${id.slice(-2)})`,
  });
  assert.ok(!JSON.stringify(liste).includes('id-notion'));
  assert.deepEqual(liste.map((p) => p.sujet), ['sansContact', 'sansPorteur', 'sansLogo', 'liens', 'aVerifier', 'doublons', 'porteursDoubles', 'valeursNouvelles']);
  assert.equal(liste[0].fiche.id, 'fiche(1)');
  assert.deepEqual(liste[6].porteur, { id: 'porteur(p2)', nom: 'chum' });
});

// ─── L'écran et ses gestes, sur de fausses bases ───
const { banc, TESS, LEA } = require('./aides/banc-lot3');
const { PROP } = require('../lib/notion');
const motsCles = (b, id) => b.fiches.find((f) => f.id === id).motsCles;
const garderFhir = (b, par = TESS) => b.qualite.fusionnerValeurs({ cle: 'motsCles', de: 'fhir', vers: 'FHIR', par });

test('l\'écran Qualité : la liste calculée sur les bases, les compteurs, et aucun identifiant de Notion', async () => {
  const ouvertes = [{ id: 'prop-1', ficheId: 'id-notion-a', statut: 'attente', genre: 'modification', titre: 'Modification : Alpha', logoPropose: null }];
  const b = banc({ ouvertes, contenus: { 'prop-1': { propose: { outils: { apres: ['Python'] } } } } });
  const { points, compteurs } = await b.qualite.lire();
  assert.deepEqual(compteurs, { points: points.length, aVerifier: 0, porteursAPlacer: 3 });
  assert.deepEqual([...new Set(points.map((p) => p.sujet))], ['liens', 'doublons', 'valeursNouvelles']);
  assert.deepEqual(points.find((p) => p.sujet === 'liens'), { sujet: 'liens', fiche: { id: 'delta', nom: 'Delta' }, lien: 'https://delta.exemple.org', depuis: '2026-11-18' });
  assert.deepEqual(points.find((p) => p.sujet === 'doublons'), { sujet: 'doublons', cle: 'motsCles', garder: 'fhir', retirer: 'FHIR', fiches: { garder: 2, retirer: 2 }, toutes: { garder: 3, retirer: 2 }, sur: true });
  assert.deepEqual(points.find((p) => p.sujet === 'valeursNouvelles').proposition, { id: 'prop-1', nom: 'Alpha' });
  assert.ok(!JSON.stringify(points).includes('id-notion'));
  assert.equal(b.ecritures(), 0, 'rien n\'est enregistré : tout est calculé');
});

test('fusionner deux écritures : chaque fiche, publiée ou écartée, garde une seule écriture, avec une version « Qualité » par fiche touchée', async () => {
  const b = banc();
  assert.deepEqual(await garderFhir(b), { ok: true, faites: 3, historique: true });
  assert.deepEqual(motsCles(b, 'id-notion-a'), ['FHIR', 'cancer']);
  assert.deepEqual(motsCles(b, 'id-notion-b'), ['FHIR'], 'pas deux fois la même écriture');
  assert.deepEqual(motsCles(b, 'id-notion-c'), ['FHIR'], 'la fiche écartée aussi');
  assert.deepEqual(b.de('mettreAJourFiche').map((a) => [a.id, a.proprietes]), [
    ['id-notion-a', { [PROP.motsCles]: { multi_select: [{ name: 'FHIR' }, { name: 'cancer' }] } }],
    ['id-notion-b', { [PROP.motsCles]: { multi_select: [{ name: 'FHIR' }] } }],
    ['id-notion-c', { [PROP.motsCles]: { multi_select: [{ name: 'FHIR' }] } }],
  ]);
  assert.deepEqual(b.versionsEcrites(), [
    { fiche: 'id-notion-a', source: 'Qualité', par: TESS, changements: { motsCles: { avant: ['fhir', 'cancer'], apres: ['FHIR', 'cancer'] } }, note: '« fhir » remplacé par « FHIR »' },
    { fiche: 'id-notion-b', source: 'Qualité', par: TESS, changements: { motsCles: { avant: ['FHIR', 'fhir'], apres: ['FHIR'] } }, note: '« fhir » remplacé par « FHIR »' },
    { fiche: 'id-notion-c', source: 'Qualité', par: TESS, changements: { motsCles: { avant: ['fhir'], apres: ['FHIR'] } }, note: '« fhir » remplacé par « FHIR »' },
  ]);
  assert.equal(b.vidages(), 1);
  assert.ok(!(await b.qualite.lire()).points.some((p) => p.sujet === 'doublons'));
});

test('fusion de valeurs interrompue puis reprise : le compte de ce qui est fait et de ce qui reste, puis rien n\'est refait', async () => {
  let panne = true;
  const b = banc({ pannes: { mettreAJourFiche: (a) => panne && a.id === 'id-notion-b' } });
  assert.deepEqual(await garderFhir(b), { ok: false, code: 'interrompue', faites: 1, restantes: 2 });
  assert.deepEqual(motsCles(b, 'id-notion-c'), ['fhir']);
  panne = false;
  assert.deepEqual(await garderFhir(b), { ok: true, faites: 2, historique: true });
  assert.deepEqual(b.versionsEcrites().map((v) => v.fiche), ['id-notion-a', 'id-notion-b', 'id-notion-c']);
  assert.deepEqual(await garderFhir(b), { ok: true, faites: 0, historique: true });
  assert.equal(b.versionsEcrites().length, 3);
});

test('fusion de valeurs refusée : autre liste, écritures identiques ou vides, écriture gardée inconnue, lecture seule', async () => {
  const b = banc();
  const refusees = [
    { cle: 'outils', de: 'fhir', vers: 'FHIR' }, { cle: 'nom', de: 'Alpha', vers: 'Bêta' }, { cle: '__proto__', de: 'a', vers: 'b' },
    { cle: 'motsCles', de: 'fhir', vers: 'fhir' }, { cle: 'motsCles', de: '', vers: 'FHIR' }, { cle: 'motsCles', de: 'fhir', vers: ['FHIR'] },
    { cle: 'motsCles', de: 'fhir', vers: 'Valeur inventée' },
  ];
  for (const demande of refusees) assert.equal((await b.qualite.fusionnerValeurs({ ...demande, par: TESS })).code, 'invalide', JSON.stringify(demande));
  assert.equal((await garderFhir(b, LEA)).code, 'non-approbateur');
  assert.equal(b.ecritures(), 0);
});

test('essayer de nouveau : le seul lien de la fiche est revisité, et la colonne suit l\'état', async () => {
  const b = banc({ reponses: { 'https://alpha.exemple.org/': 404 } });
  assert.deepEqual(await b.qualite.revisiterLien({ repere: 'delta', par: TESS }), { ok: true, etat: 'ok', enPanne: false, depuis: null });
  assert.deepEqual(b.de('mettreAJourFiche'), [{ id: 'id-notion-d', proprietes: { [PROP.lienEnPanneDepuis]: { date: null } } }]);
  assert.deepEqual(await b.qualite.revisiterLien({ repere: 'alpha', par: TESS }), { ok: true, etat: 'panne', enPanne: true, depuis: '2026-11-25' });
  assert.deepEqual(b.demandes.map((d) => d.url), ['https://delta.exemple.org/', 'https://alpha.exemple.org/', 'https://alpha.exemple.org/']);
  assert.equal(b.faux.de('pages.create').length, 0, 'jamais de version pour un lien');
  assert.equal((await b.qualite.revisiterLien({ repere: 'inconnue', par: TESS })).code, 'introuvable');
  assert.equal((await b.qualite.revisiterLien({ repere: 'alpha', par: LEA })).code, 'non-approbateur');
  assert.equal(b.de('mettreAJourFiche').length, 2);
});

test('une norme contenue dans une autre n\'est qu\'une ressemblance à vérifier, jamais une identité', () => {
  const paires = [['CIM-10', 'CIM-10-CA'], ['FHIR', 'FHIR R4'], ['DICOM', 'DICOMweb'], ['OMOP', 'OMOP CDM']];
  for (const [a, b] of paires) {
    const [point] = points([saine({ id: 'f1', nom: 'A', normes: [a] }), saine({ id: 'f2', nom: 'B', normes: [b] })]).filter((x) => x.sujet === 'doublons');
    assert.ok(point, `${a} / ${b}`);
    assert.equal(point.sur, false, `${a} / ${b}`);
  }
  const [meme] = points([saine({ id: 'f1', nom: 'A', normes: ['hl7-fhir'] }), saine({ id: 'f2', nom: 'B', normes: ['HL7 FHIR'] })]).filter((x) => x.sujet === 'doublons');
  assert.equal(meme.sur, true);
});

test('le compteur de la barre latérale ne compte pas les fiches à vérifier : c\'est un état de fond, pas un défaut à corriger', async () => {
  const { banc: bancLot3 } = require('./aides/banc-lot3');
  const { brute } = require('./aides/fausses-fiches');
  const fiches = [brute({ id: 'id-notion-a', nom: 'Alpha', verifieeLe: null, contact: null, logo: 'https://x.org/l.png', porteurIds: ['id-notion-chum'] })];
  const b = bancLot3({ fiches });
  const { points, compteurs } = await b.qualite.lire();
  assert.deepEqual(points.map((p) => p.sujet).sort(), ['aVerifier', 'sansContact']);
  assert.equal(compteurs.points, 1);
  assert.equal(compteurs.aVerifier, 1);
});
