const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { banc, TESS, T0 } = require('./aides/banc-lot4c');
const { faussePage } = require('./aides/fausse-page');
const { comparerCopies, resumeCourt, lireResume, NOMS_MAX } = require('../lib/changements');
const { COLONNES, FORMAT } = require('../lib/sauvegardes');
const { TEXTES } = require('../public/js/texte.js');

const SV = TEXTES.panneau.sauvegardes;
const JOUR = 86400000;
const ilYA = (jours) => new Date(T0 - jours * JOUR).toISOString();
const texte = (contenu) => [{ type: 'text', text: { content: contenu } }];

// ─── La comparaison, à part ───
const page = (id, proprietes, plus = {}) => ({ id, creeLe: '2026-10-01T10:00:00.000Z', modifieLe: '2026-11-01T10:00:00.000Z', proprietes, ...plus });
const copie = (bases, plus = {}) => ({ format: FORMAT, version: 1, faiteLe: '2026-11-19T13:00:00.000Z', origine: 'automatique', incomplete: false, bases: {
  ressources: { pages: [] }, porteurs: { pages: [] }, propositions: { pages: [] }, approbateurs: { pages: [] }, versions: { pages: [] }, journal: { pages: [] }, reglages: { pages: [] }, ...bases,
}, ...plus });
const AVANT = copie({
  ressources: { colonneTitre: 'Nom', pages: [
    page('r1', { Nom: 'CARTaGENE', Phrase: 'Une cohorte.', 'Mots-clés': ['cancer', 'cohorte'], Porteurs: ['p1', 'p2'], Gratuit: true }),
    page('r2', { Nom: 'CBRAIN', 'Année': 2012 }),
    page('r3', { Nom: 'À retirer' }),
  ] },
  porteurs: { colonneTitre: 'Nom', pages: [page('p1', { Nom: 'CHU Sainte-Justine' }), page('p2', { Nom: 'CUSM' })] },
  propositions: { colonneTitre: 'Titre', pages: [page('o1', { Titre: 'Nouvelle : Outil X', Statut: 'En attente' }, { contenu: { propose: { nom: { apres: 'Outil X' } }, avis: [] } })] },
  approbateurs: { colonneTitre: 'Nom', pages: [page('a1', { Nom: 'Tess Berthier', 'Rôle': 'Administration', Courriel: 'tess@exemple.ca' })] },
  versions: { pages: [page('v1', { Titre: 'CARTaGENE, version 1' }, { contenu: { n: 1 } })] },
  journal: { pages: [page('j1', { Titre: 'a approuvé X' })] },
  reglages: { colonneTitre: 'Clé', pages: [page('g1', { 'Clé': 'conditions', 'Modifié le': '2026-11-01' }, { contenu: 'Texte A' }), page('g2', { 'Clé': 'modeEssai', 'Modifié le': '2026-11-01' }, { contenu: true }), page('g3', { 'Clé': 'messageFerme' }, { contenu: 'Pause.' })] },
});

test('comparerCopies : par base, les lignes nouvelles, modifiées et retirées, reconnues par leur identifiant de page', () => {
  const apres = copie({
    ressources: { colonneTitre: 'Nom', pages: [
      page('r2', { Nom: 'CBRAIN', 'Année': 2013 }),
      page('r1', { Nom: 'CARTaGENE', Phrase: 'Une cohorte.', 'Mots-clés': ['cancer', 'cohorte'], Porteurs: ['p1', 'p2'], Gratuit: true }),
      page('r4', { Nom: 'Nouvelle fiche' }), page('r5', { Nom: 'Autre nouvelle' }),
    ] },
    porteurs: { colonneTitre: 'Nom', pages: [page('p1', { Nom: 'CHU Sainte-Justine (renommé)' }), page('p2', { Nom: 'CUSM' })] },
    propositions: { colonneTitre: 'Titre', pages: [
      page('o1', { Titre: 'Nouvelle : Outil X', Statut: 'En attente' }, { contenu: { avis: [{ sens: 'pour' }], propose: { nom: { apres: 'Outil X' } } } }),
      page('o2', { Titre: 'Modification : CBRAIN', Statut: 'En attente' }, { contenu: {} }),
    ] },
    approbateurs: { colonneTitre: 'Nom', pages: [page('a1', { Nom: 'Tess Berthier', 'Rôle': 'Administration', Courriel: 'tess@exemple.ca' }), page('a2', { Nom: 'Maxime Lafrenière', 'Rôle': 'Approbation' })] },
    versions: { pages: [page('v1', { Titre: 'CARTaGENE, version 1' }, { contenu: { n: 1 } }), page('v2', {}), page('v3', {})] },
    journal: { pages: [page('j1', { Titre: 'a approuvé X' }), page('j2', {}), page('j3', {}), page('j4', {})] },
    reglages: { colonneTitre: 'Clé', pages: [
      page('g1', { 'Clé': 'conditions', 'Modifié le': '2026-11-20' }, { contenu: 'Texte B' }),
      // Réécrit sans changer de valeur, et sur une autre ligne : ce n'est pas un réglage changé.
      page('g9', { 'Clé': 'modeEssai', 'Modifié le': '2026-11-25' }, { contenu: true }),
      page('g4', { 'Clé': 'adresseEssai' }, { contenu: 'essais@exemple.org' }),
    ] },
  });
  const c = comparerCopies(AVANT, apres, { depuis: '2026-11-19T13:00:00.000Z' });
  assert.deepEqual([c.etat, c.depuis, c.partiel], ['compare', '2026-11-19T13:00:00.000Z', false]);
  assert.deepEqual(c.bases, {
    ressources: { nouvelles: 2, modifiees: 1, retirees: 1 },
    porteurs: { nouvelles: 0, modifiees: 1, retirees: 0 },
    propositions: { nouvelles: 1, modifiees: 1, retirees: 0 },
    equipe: { nouvelles: 1, modifiees: 0, retirees: 0 },
    versions: { nouvelles: 2 },
    journal: { nouvelles: 3 },
    reglages: { changes: 3 },
  });
  assert.deepEqual(c.noms.ressources, { nouvelles: ['Nouvelle fiche', 'Autre nouvelle'], modifiees: ['CBRAIN'], retirees: ['À retirer'] });
  assert.deepEqual(c.noms.porteurs, { nouvelles: [], modifiees: ['CHU Sainte-Justine (renommé)'], retirees: [] });
  assert.deepEqual(c.noms.propositions, { nouvelles: ['Modification : CBRAIN'], modifiees: ['Nouvelle : Outil X'], retirees: [] });
  assert.deepEqual(c.noms.equipe.nouvelles, ['Maxime Lafrenière']);
  assert.deepEqual(c.noms.reglages.slice().sort(), ['adresseEssai', 'conditions', 'messageFerme']);
  // Le résumé court, pour la ligne Notion et l'écran : les compteurs, sans aucun nom.
  assert.deepEqual(resumeCourt(c), { etat: 'compare', depuis: c.depuis, partiel: false, bases: c.bases });
  assert.ok(!JSON.stringify(resumeCourt(c)).includes('CBRAIN'));
});

test('comparerCopies : ce qui change sans que la donnée change est ignoré (dates de Notion, colonnes techniques, ordre, colonne vide ajoutée)', () => {
  const apres = JSON.parse(JSON.stringify(AVANT));
  // Notion a retouché la page : sa date de dernière modification bouge, pas ses valeurs.
  for (const base of Object.values(apres.bases)) for (const p of base.pages) p.modifieLe = '2026-11-26T09:00:00.000Z';
  // L'ordre des pages, des colonnes et des valeurs d'une liste.
  apres.bases.ressources.pages.reverse();
  const r1 = apres.bases.ressources.pages.find((p) => p.id === 'r1');
  r1.proprietes = { Gratuit: true, Porteurs: ['p2', 'p1'], 'Mots-clés': ['cohorte', 'cancer'], Phrase: 'Une cohorte.', Nom: 'CARTaGENE' };
  // Une colonne ajoutée à la base, vide partout ; et une colonne technique (dernière modification) qui bouge.
  for (const p of apres.bases.ressources.pages) Object.assign(p.proprietes, { 'Nouvelle colonne': null, 'Liste vide': [], 'Texte vide': '', 'Case': false, 'Dernière modification': '2026-11-26T09:00:00.000Z' });
  apres.bases.ressources.colonnesTechniques = ['Dernière modification'];
  // Les clés du contenu dans un autre ordre.
  apres.bases.propositions.pages[0].contenu = { avis: [], propose: { nom: { apres: 'Outil X' } } };
  const c = comparerCopies(AVANT, apres, { depuis: 'x' });
  assert.deepEqual(c.bases, {
    ressources: { nouvelles: 0, modifiees: 0, retirees: 0 }, porteurs: { nouvelles: 0, modifiees: 0, retirees: 0 },
    propositions: { nouvelles: 0, modifiees: 0, retirees: 0 }, equipe: { nouvelles: 0, modifiees: 0, retirees: 0 },
    versions: { nouvelles: 0 }, journal: { nouvelles: 0 }, reglages: { changes: 0 },
  });
  // À l'inverse, une vraie valeur qui change se voit : une case, une liste, un contenu, l'ordre d'un contenu.
  const vrai = JSON.parse(JSON.stringify(AVANT));
  vrai.bases.ressources.pages[0].proprietes.Gratuit = false;
  vrai.bases.ressources.pages[1].proprietes['Mots-clés'] = ['neuf'];
  vrai.bases.propositions.pages[0].contenu.avis = [{ sens: 'contre' }];
  vrai.bases.approbateurs.pages[0].proprietes['Rôle'] = 'Approbation';
  const d = comparerCopies(AVANT, vrai, { depuis: 'x' });
  assert.deepEqual([d.bases.ressources.modifiees, d.bases.propositions.modifiees, d.bases.equipe.modifiees], [2, 1, 1]);
});

test('comparerCopies : les listes de noms sont bornées ; une ligne sans nom n\'en donne pas', () => {
  const apres = copie({ ressources: { colonneTitre: 'Nom', pages: [...Array.from({ length: 60 }, (_, i) => page(`n${i}`, { Nom: `Fiche ${i} ${'x'.repeat(300)}` })), page('sans-nom', {})] } });
  const c = comparerCopies(copie({}), apres, { depuis: 'x' });
  assert.equal(c.bases.ressources.nouvelles, 61);
  assert.equal(c.noms.ressources.nouvelles.length, NOMS_MAX);
  assert.ok(NOMS_MAX <= 25 && c.noms.ressources.nouvelles.every((n) => n.length <= 120));
  // Sans le nom de la colonne du titre (copie d'avant ce résumé) : « Nom », « Titre » ou « Clé » servent.
  const vieille = copie({ ressources: { pages: [page('r1', { Nom: 'Ancienne' })] }, propositions: { pages: [page('o1', { Titre: 'Vieille proposition' })] } });
  const d = comparerCopies(vieille, copie({}), { depuis: 'x' });
  assert.deepEqual([d.noms.ressources.retirees, d.noms.propositions.retirees], [['Ancienne'], ['Vieille proposition']]);
});

test('comparerCopies : une copie incomplète donne un résumé partiel ; une référence qui ne vaut rien, « impossible »', () => {
  const apres = JSON.parse(JSON.stringify(AVANT));
  apres.incomplete = true;
  apres.bases.propositions.contenusNonLus = 1;
  delete apres.bases.propositions.pages[0].contenu;
  apres.bases.propositions.pages[0].contenuNonLu = true;
  const c = comparerCopies(AVANT, apres, { depuis: 'x' });
  assert.equal(c.partiel, true);
  assert.equal(c.bases.propositions.modifiees, 0, 'un contenu non lu ne compte pas comme une modification');
  // Une base absente d'un seul côté n'est pas comparée, et le résumé le dit.
  const sansVersions = JSON.parse(JSON.stringify(AVANT));
  sansVersions.bases.versions = { absente: true, pages: [] };
  const d = comparerCopies(AVANT, sansVersions, { depuis: 'x' });
  assert.deepEqual([d.partiel, Object.hasOwn(d.bases, 'versions'), d.bases.journal], [true, false, { nouvelles: 0 }]);
  // Absente des deux côtés : rien à comparer, rien de partiel.
  const f = comparerCopies(sansVersions, sansVersions, { depuis: 'x' });
  assert.deepEqual([f.partiel, Object.hasOwn(f.bases, 'versions')], [false, false]);
  for (const reference of [null, undefined, 'texte', [], {}, { format: 'autre', bases: {} }, { format: FORMAT }, { format: FORMAT, bases: [] }, { ...AVANT, incomplete: true }]) {
    assert.deepEqual(comparerCopies(reference, AVANT, { depuis: 'x' }), { etat: 'impossible' }, JSON.stringify(reference || null).slice(0, 40));
  }
  assert.deepEqual(resumeCourt({ etat: 'impossible' }), { etat: 'impossible' });
  assert.deepEqual(resumeCourt({ etat: 'premiere' }), { etat: 'premiere' });
});

test('lireResume : le texte de la colonne « Changements » ne rend que des états et des compteurs connus', () => {
  const bon = { etat: 'compare', depuis: '2026-11-19T13:00:00.000Z', partiel: false, bases: { ressources: { nouvelles: 3, modifiees: 5, retirees: 1 }, journal: { nouvelles: 4 }, reglages: { changes: 1 } } };
  assert.deepEqual(lireResume(JSON.stringify(bon)), bon);
  assert.deepEqual(lireResume('{"etat":"premiere"}'), { etat: 'premiere' });
  assert.deepEqual(lireResume('{"etat":"impossible","bases":{"x":1}}'), { etat: 'impossible' });
  for (const rien of ['', '   ', 'pas du json', '[]', 'null', '12', '{"etat":"autre"}', '{}', undefined, null]) assert.equal(lireResume(rien), null, String(rien));
  // Ce qui n'est pas attendu est écarté : bases inconnues, compteurs qui ne sont pas des entiers positifs, date mal formée.
  const sale = { etat: 'compare', depuis: '<script>alert(1)</script>', partiel: 'oui', noms: { ressources: ['x'] }, bases: { ressources: { nouvelles: '<b>3</b>', modifiees: -2, retirees: 1.5, autre: 9 }, inconnue: { nouvelles: 1 }, journal: { nouvelles: 2, modifiees: 7 }, reglages: 'x' } };
  assert.deepEqual(lireResume(JSON.stringify(sale)), { etat: 'compare', depuis: null, partiel: false, bases: { ressources: { nouvelles: 0, modifiees: 0, retirees: 0 }, journal: { nouvelles: 2 } } });
});

// ─── Au moment de faire une copie ───
const colonne = (b, id) => { const p = b.faux.pages.get(id).properties[COLONNES.changements]; return p ? JSON.parse(p.rich_text.map((s) => s.text.content).join('')) : null; };
const copieDe = (b, id) => b.copies().find((c) => c.id === id);
const RIEN = {
  ressources: { nouvelles: 0, modifiees: 0, retirees: 0 }, porteurs: { nouvelles: 0, modifiees: 0, retirees: 0 }, propositions: { nouvelles: 0, modifiees: 0, retirees: 0 },
  equipe: { nouvelles: 0, modifiees: 0, retirees: 0 }, versions: { nouvelles: 0 }, journal: { nouvelles: 0 }, reglages: { changes: 0 },
};

test('la colonne attendue dans la base « Sauvegardes » s\'appelle « Changements »', () => {
  assert.equal(COLONNES.changements, 'Changements');
});

test('faire : sans copie complète précédente, « première copie » ; ensuite, le résumé des changements depuis la dernière copie complète, dans le fichier et dans la ligne', async () => {
  const b = banc({ reglages: { conditions: 'Mes conditions.' } });
  const une = await b.sauvegardes.faire({ par: TESS });
  assert.deepEqual(une.changements, { etat: 'premiere' });
  assert.deepEqual(copieDe(b, une.id).contenu.changements, { etat: 'premiere' });
  assert.deepEqual(colonne(b, une.id), { etat: 'premiere' });
  assert.equal(b.fichiers.appels.filter((a) => a.nom === 'telecharger').length, 0);
  // Entre les deux copies : une fiche modifiée, une ajoutée, une retirée ; une proposition dont le contenu change ; une ligne au journal ; un réglage changé.
  b.faux.pages.get('fiche-1').properties.Phrase = { rich_text: texte('Une grande cohorte.') };
  b.faux.pages.get('fiche-1').last_edited_time = '2026-11-26T15:30:00.000Z';
  b.faux.pages.get('fiche-2').archived = true;
  b.faux.pages.set('fiche-3', { id: 'fiche-3', parent: { database_id: 'base-ressources' }, properties: { Nom: { title: texte('Nouvel outil') } } });
  b.faux.blocs.get('prop-1')[0].code.rich_text = texte(JSON.stringify({ propose: { nom: { apres: 'Outil Y' } }, applique: null }));
  b.faux.pages.set('journal-2', { id: 'journal-2', parent: { database_id: 'base-journal' }, properties: { Titre: { title: texte('a modifié la fiche de CARTaGENE') } } });
  b.faux.blocs.get('ligne-conditions')[0].code.rich_text = texte('"Autres conditions."');
  // Une page que Notion a seulement retouchée : sa date bouge, rien d'autre.
  b.faux.pages.get('porteur-1').last_edited_time = '2026-11-26T15:31:00.000Z';
  const deux = await b.sauvegardes.faire({ par: TESS });
  const attendu = { etat: 'compare', depuis: une.faiteLe, partiel: false, bases: {
    ...RIEN, ressources: { nouvelles: 1, modifiees: 1, retirees: 1 }, propositions: { nouvelles: 0, modifiees: 1, retirees: 0 }, journal: { nouvelles: 1 }, reglages: { changes: 1 },
  } };
  assert.deepEqual(deux.changements, attendu);
  assert.deepEqual(colonne(b, deux.id), attendu, 'la ligne Notion porte les compteurs et la date de la copie de comparaison, en JSON compact');
  const fichier = copieDe(b, deux.id).contenu;
  assert.deepEqual(resumeCourtDe(fichier.changements), attendu);
  assert.deepEqual(fichier.changements.noms.ressources, { nouvelles: ['Nouvel outil'], modifiees: ['CARTaGENE'], retirees: ['CBRAIN'] });
  assert.deepEqual(fichier.changements.noms.propositions.modifiees, ['Nouvelle : Outil X']);
  assert.ok(!JSON.stringify(colonne(b, deux.id)).includes('CARTaGENE'), 'aucun nom dans la ligne Notion');
  // Le fichier précédent a été lu par la fonction de téléchargement, avec la limite des sauvegardes.
  const lectures = b.fichiers.appels.filter((a) => a.nom === 'telecharger');
  assert.equal(lectures.length, 1);
  assert.ok(lectures[0].args.options.max > 5 * 1024 * 1024);
  // La liste rend le résumé de chaque copie.
  const liste = await b.sauvegardes.lister({ par: TESS });
  assert.deepEqual(liste.copies.map((c) => c.changements), [attendu, { etat: 'premiere' }]);
  // Rien n'a changé depuis : des zéros partout.
  const trois = await b.sauvegardes.faire({ par: TESS });
  assert.deepEqual(trois.changements, { etat: 'compare', depuis: deux.faiteLe, partiel: false, bases: RIEN });
});
function resumeCourtDe(changements) { return resumeCourt(changements); }

test('faire : le fichier note la colonne du titre et les colonnes techniques de chaque base, pour les comparaisons à venir', async () => {
  const b = banc();
  b.faux.pages.get('fiche-1').properties['Dernière modification'] = { type: 'last_edited_time', last_edited_time: '2026-11-26T15:30:00.000Z' };
  b.faux.pages.get('fiche-1').properties['Modifiée par'] = { type: 'last_edited_by', last_edited_by: { id: 'u1' } };
  const une = await b.sauvegardes.faire({ par: TESS });
  const bases = copieDe(b, une.id).contenu.bases;
  assert.deepEqual([bases.ressources.colonneTitre, bases.porteurs.colonneTitre, bases.propositions.colonneTitre, bases.reglages.colonneTitre], ['Nom', 'Nom', 'Titre', undefined]);
  assert.deepEqual(bases.ressources.colonnesTechniques, ['Dernière modification', 'Modifiée par']);
  assert.ok(!Object.hasOwn(bases.porteurs, 'colonnesTechniques'));
  // La colonne technique bouge seule : la copie suivante ne compte aucune fiche modifiée.
  b.faux.pages.get('fiche-1').properties['Dernière modification'].last_edited_time = '2026-11-27T10:00:00.000Z';
  assert.deepEqual((await b.sauvegardes.faire({ par: TESS })).changements.bases.ressources, { nouvelles: 0, modifiees: 0, retirees: 0 });
});

test('faire : une copie incomplète ne sert jamais de référence, et son propre résumé est marqué partiel', async () => {
  const b = banc();
  const complete = await b.sauvegardes.faire({ par: TESS });
  // Une copie incomplète, plus récente, posée dans la base : elle est ignorée comme référence.
  const incomplete = b.poserCopie({ faiteLe: new Date(T0 + 3600000).toISOString(), contenu: { format: FORMAT, version: 1, incomplete: true, bases: {} } });
  b.faux.pages.get(incomplete).properties.Titre.title[0].text.content += ' (incomplète)';
  b.horloge.instant = T0 + 2 * 3600000;
  const suivante = await b.sauvegardes.faire({ par: TESS });
  assert.deepEqual([suivante.changements.etat, suivante.changements.depuis], ['compare', complete.faiteLe]);
  // Une copie dont le fichier dit « incomplète » alors que son titre ne le dit pas : pas de comparaison.
  const c = banc();
  c.poserCopie({ faiteLe: ilYA(2), contenu: { format: FORMAT, version: 1, incomplete: true, bases: {} } });
  assert.deepEqual((await c.sauvegardes.faire({ par: TESS })).changements, { etat: 'impossible' });
  // La nouvelle copie est incomplète : elle est faite, et son résumé est marqué partiel.
  const d = banc();
  const reference = await d.sauvegardes.faire({ par: TESS });
  const vraie = d.faux.client.blocks.children.list;
  d.faux.client.blocks.children.list = async (a) => { if (a.block_id === 'prop-1') throw new Error('contenu illisible'); return vraie(a); };
  const partielle = await d.sauvegardes.faire({ par: TESS });
  assert.deepEqual([partielle.incomplete, partielle.changements.etat, partielle.changements.partiel, partielle.changements.depuis], [true, 'compare', true, reference.faiteLe]);
  assert.equal(partielle.changements.bases.propositions.modifiees, 0);
});

test('faire : fichier précédent illisible, invalide, introuvable ou trop long à lire : la copie se fait, « comparaison impossible »', async () => {
  const cas = {
    'téléchargement en panne': () => banc({ pannesFichiers: { telecharger: true } }),
    'pas du JSON': () => banc(),
    'page illisible': () => banc({ pannesNotion: { 'pages.retrieve': true } }),
  };
  for (const [nom, creer] of Object.entries(cas)) {
    const b = creer();
    b.poserCopie({ faiteLe: ilYA(2), contenu: nom === 'pas du JSON' ? '<html>' : undefined });
    const retour = await b.sauvegardes.faire({ par: TESS });
    assert.deepEqual([retour.ok, retour.incomplete, retour.changements], [true, false, { etat: 'impossible' }], nom);
    assert.deepEqual(copieDe(b, retour.id).contenu.changements, { etat: 'impossible' }, nom);
    assert.equal(copieDe(b, retour.id).contenu.bases.ressources.pages.length, 2, nom);
  }
  // Le fichier précédent met trop de temps à venir : la copie n'attend pas au-delà de son budget.
  const lent = banc({ budgetComparaisonMs: 5 });
  lent.poserCopie({ faiteLe: ilYA(2) });
  lent.fichiers.telecharger = () => new Promise(() => {});
  const debut = Date.now();
  const retour = await lent.sauvegardes.faire({ par: TESS });
  assert.deepEqual([retour.ok, retour.changements], [true, { etat: 'impossible' }]);
  assert.ok(Date.now() - debut < 2000, 'la copie n\'est pas retenue par la comparaison');
  assert.ok(lent.lignesServeur.some((l) => l.includes('[sauvegardes]') && l.includes('comparaison')));
  // Une comparaison qui lèverait (fichier précédent tordu) ne fait pas échouer la copie.
  const tordu = banc();
  tordu.poserCopie({ faiteLe: ilYA(2), contenu: { format: FORMAT, version: 1, bases: { ressources: { pages: [null, 12, { id: null }, { id: 'x', proprietes: 'texte' }] }, porteurs: 'x', journal: { pages: 'x' } } } });
  const r = await tordu.sauvegardes.faire({ par: TESS });
  assert.equal(r.ok, true);
  assert.ok(['compare', 'impossible'].includes(r.changements.etat));
});

test('faire : sans la colonne « Changements » dans la base, la copie se fait quand même, sans résumé', async () => {
  const refuse = (a) => { if (a.properties && Object.hasOwn(a.properties, COLONNES.changements)) { const e = new Error('Changements is not a property that exists.'); e.code = 'validation_error'; e.status = 400; throw e; } return false; };
  const b = banc({ pannesNotion: { 'pages.update': refuse, 'pages.create': refuse } });
  b.poserCopie({ faiteLe: ilYA(2) });
  const retour = await b.sauvegardes.faire({ par: TESS });
  assert.deepEqual([retour.ok, retour.incomplete, retour.changements], [true, false, null]);
  const [neuve] = b.copies().filter((c) => c.id === retour.id);
  assert.equal(neuve.contenu.bases.ressources.pages.length, 2);
  assert.equal(neuve.contenu.changements.etat, 'compare', 'le fichier, lui, garde son résumé');
  assert.equal(colonne(b, retour.id), null);
  assert.ok(b.lignesServeur.some((l) => l.includes('[sauvegardes]') && l.includes('Changements')));
  // La liste dit qu'il n'y a pas de comparaison, pour cette copie comme pour celles d'avant ce résumé.
  const liste = await b.sauvegardes.lister({ par: TESS });
  assert.deepEqual(liste.copies.map((c) => c.changements), [null, null]);
  // Une colonne remplie à la main avec n'importe quoi : pas de comparaison non plus.
  b.faux.pages.get(retour.id).properties[COLONNES.changements] = { rich_text: texte('<script>alert(1)</script>') };
  assert.equal((await b.sauvegardes.lister({ par: TESS })).copies[0].changements, null);
});

test('la copie du lundi porte aussi son résumé, et le ménage se fait toujours', async () => {
  const b = banc();
  const vieille = b.poserCopie({ faiteLe: ilYA(100) });
  const avant = await b.sauvegardes.faire({ par: TESS });
  b.faux.pages.set('fiche-3', { id: 'fiche-3', parent: { database_id: 'base-ressources' }, properties: { Nom: { title: texte('Nouvel outil') } } });
  const retour = await b.sauvegardes.hebdomadaire();
  assert.deepEqual([retour.etat, retour.incomplete, retour.retirees], ['faite', false, 1]);
  assert.equal(b.faux.pages.get(vieille).archived, true);
  const lundi = b.copies().find((c) => c.origine === 'Automatique');
  assert.deepEqual([lundi.contenu.changements.depuis, lundi.contenu.changements.bases.ressources], [avant.faiteLe, { nouvelles: 1, modifiees: 0, retirees: 0 }]);
  assert.deepEqual(colonne(b, lundi.id).bases.ressources, { nouvelles: 1, modifiees: 0, retirees: 0 });
  // La comparaison en panne ou trop lente ne fait pas échouer la copie du lundi.
  const lent = banc({ budgetComparaisonMs: 5 });
  lent.poserCopie({ faiteLe: ilYA(2) });
  lent.fichiers.telecharger = () => new Promise(() => {});
  assert.equal((await lent.sauvegardes.hebdomadaire()).etat, 'faite');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'), /"api\/resume\.js": \{\s*"maxDuration": 60/);
});

// ─── La route ───
test('sauvegardes et sauvegarder : chaque copie est rendue avec son résumé, sans aucun nom de fiche', async () => {
  const b = banc();
  const une = await b.envoyer('sauvegarder', {});
  assert.deepEqual(une.corps.copie.changements, { etat: 'premiere' });
  b.faux.pages.set('fiche-3', { id: 'fiche-3', parent: { database_id: 'base-ressources' }, properties: { Nom: { title: texte('Nom très reconnaissable') } } });
  const deux = await b.envoyer('sauvegarder', {});
  assert.deepEqual(deux.corps.copie.changements.bases.ressources, { nouvelles: 1, modifiees: 0, retirees: 0 });
  const liste = await b.lire('sauvegardes');
  assert.deepEqual(liste.corps.copies.map((c) => c.changements && c.changements.etat), ['compare', 'premiere']);
  assert.deepEqual(liste.corps.copies[0].changements, deux.corps.copie.changements);
  assert.ok(!JSON.stringify([deux.corps, liste.corps]).includes('reconnaissable'));
});

// ─── L'écran ───
test('le texte d\'une copie dit en bref ce qui a changé depuis la copie de comparaison', () => {
  const r = (bases, plus = {}) => ({ etat: 'compare', depuis: '2026-11-26T15:00:00.000Z', partiel: false, bases, ...plus });
  assert.equal(SV.changements(r({ ressources: { nouvelles: 3, modifiees: 5, retirees: 1 }, propositions: { nouvelles: 2, modifiees: 0, retirees: 0 } }), '26 novembre'),
    'Depuis la copie du 26 novembre : 3 ressources nouvelles, 5 modifiées, 1 retirée ; 2 propositions nouvelles.');
  assert.equal(SV.changements(r(RIEN), '26 novembre'), 'Aucun changement depuis la copie du 26 novembre.');
  assert.equal(SV.changements(r({ ressources: { nouvelles: 1, modifiees: 0, retirees: 0 }, porteurs: { nouvelles: 1, modifiees: 2, retirees: 1 }, equipe: { nouvelles: 0, modifiees: 1, retirees: 0 }, versions: { nouvelles: 4 }, journal: { nouvelles: 1 }, reglages: { changes: 2 } }), '19 novembre'),
    'Depuis la copie du 19 novembre : 1 ressource nouvelle ; 1 porteur nouveau, 2 modifiés, 1 retiré ; 1 membre de l’équipe modifié ; 4 nouvelles versions ; 1 nouvelle ligne au journal ; 2 réglages changés.');
  assert.equal(SV.changements(r({ ressources: { nouvelles: 0, modifiees: 2, retirees: 0 } }, { partiel: true }), ''), 'Depuis la copie précédente : 2 ressources modifiées (comparaison partielle).');
  assert.match(SV.changements({ etat: 'premiere' }, ''), /[Pp]remière copie.*rien à comparer/);
  assert.match(SV.changements({ etat: 'impossible' }, ''), /[Cc]omparaison impossible/);
  for (const rien of [null, undefined, {}, 'x', { etat: 'autre' }]) assert.match(SV.changements(rien, ''), /[Pp]as de comparaison/);
  // Des compteurs tordus ne font rien dire de faux.
  assert.equal(SV.changements(r({ ressources: { nouvelles: '<b>', modifiees: -1 }, journal: null }), '26 novembre'), 'Aucun changement depuis la copie du 26 novembre.');
});

const PIEGE = '<script>alert(1)</script><img src=x onerror=alert(2)>';
test('écran Sauvegardes : sous chaque copie, une ligne lisible sur ce qui a changé ; tout est échappé', async () => {
  const copies = [
    { id: '10000000-0000-4000-8000-000000000001', faiteLe: '2026-11-30T13:00:00.000Z', origine: 'automatique', par: null, taille: 1300000, fichier: true, incomplete: false,
      changements: { etat: 'compare', depuis: '2026-11-26T15:00:00.000Z', partiel: false, bases: { ressources: { nouvelles: 3, modifiees: 5, retirees: 1 }, propositions: { nouvelles: 2, modifiees: 0, retirees: 0 } } } },
    { id: '10000000-0000-4000-8000-000000000002', faiteLe: '2026-11-26T15:00:00.000Z', origine: 'demande', par: 'Tess Berthier', taille: 900, fichier: true, incomplete: false, changements: { etat: 'compare', depuis: '2026-11-23T13:00:00.000Z', partiel: false, bases: {} } },
    { id: '10000000-0000-4000-8000-000000000003', faiteLe: '2026-11-23T13:00:00.000Z', origine: 'automatique', par: null, taille: 900, fichier: true, incomplete: false, changements: { etat: 'premiere' } },
    { id: '10000000-0000-4000-8000-000000000004', faiteLe: '2026-11-16T13:00:00.000Z', origine: 'automatique', par: null, taille: 900, fichier: true, incomplete: false, changements: { etat: 'impossible' } },
    { id: '10000000-0000-4000-8000-000000000005', faiteLe: '2026-11-09T13:00:00.000Z', origine: 'automatique', par: null, taille: 900, fichier: true, incomplete: false, changements: null },
    { id: '10000000-0000-4000-8000-000000000006', faiteLe: '2026-11-02T13:00:00.000Z', origine: 'automatique', par: null, taille: 900, fichier: true, incomplete: false,
      changements: { etat: 'compare', depuis: PIEGE, partiel: false, bases: { ressources: { nouvelles: PIEGE, modifiees: 1, retirees: 0 }, [PIEGE]: { nouvelles: 2 } } } },
  ];
  const moi = () => ({ code: 200, donnees: { nom: 'Tess Berthier', courriel: 'tess@exemple.ca', role: 'administration', permis: { decider: true, administrer: true } } });
  const p = faussePage({ hash: '#sauvegardes', reponses: { moi, sauvegardes: () => ({ code: 200, donnees: { actives: true, copies, jour: 'lundi', semaines: 12 } }),
    sauvegarder: () => ({ code: 200, donnees: { ok: true, copie: { id: '10000000-0000-4000-8000-000000000009', faiteLe: '2026-12-01T16:00:00.000Z', origine: 'demande', par: 'Tess Berthier', taille: 2048, fichier: true, incomplete: false, changements: { etat: 'compare', depuis: '2026-11-30T13:00:00.000Z', partiel: false, bases: { journal: { nouvelles: 2 } } } } } }) } });
  await p.repos();
  let html = p.html('#sbody');
  assert.ok(!/<script|<img/.test(html), 'rien de ce qui vient des données ne devient du HTML');
  assert.ok(html.includes('Depuis la copie du 26 novembre : 3 ressources nouvelles, 5 modifiées, 1 retirée ; 2 propositions nouvelles.'));
  assert.ok(html.includes('Aucun changement depuis la copie du 23 novembre.'));
  for (const etat of [{ etat: 'premiere' }, { etat: 'impossible' }, null]) assert.ok(html.includes(SV.changements(etat, '')), JSON.stringify(etat));
  assert.ok(html.includes('1 ressource modifiée'), 'un résumé tordu ne dit que ce qui se lit');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
  assert.match(source, /\$\{e\(SV\.changements\(/);
  // Une copie faite à l'instant montre aussi sa ligne.
  await p.cliquer('s-faire');
  html = p.html('#sbody');
  assert.ok(html.includes('Depuis la copie du 30 novembre : 2 nouvelles lignes au journal.'));
});
