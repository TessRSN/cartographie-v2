const test = require('node:test');
const assert = require('node:assert/strict');
const { fauxNotion } = require('./aides/faux-notion');
const { fausseBase, brute, TYPE_JEU } = require('./aides/fausses-fiches');
const { creerRessources } = require('../lib/ressources');
const { creerVersions, COLONNES } = require('../lib/versions');
const { PROP } = require('../lib/notion');
const { CHAMPS } = require('../public/js/champs.js');

const TESS = 'tess@exemple.ca';
const LECTRICE = 'lea@exemple.ca';
const T0 = Date.UTC(2026, 10, 25, 19, 0);
const CLES = CHAMPS.map((c) => c.cle);

// Trois fiches : deux publiques, une écartée ; deux porteurs.
function banc({ pannes = {}, pannesVersions = {}, env = { NOTION_DB_VERSIONS: 'base-versions' }, propositions = [], verrous, fiches } = {}) {
  const base = fausseBase({
    pannes,
    porteurs: [{ id: 'id-notion-chum', nom: 'CHUM', latitude: 45.5, longitude: -73.5 }, { id: 'id-notion-mcgill', nom: 'Université McGill', latitude: null, longitude: null }],
    fiches: fiches || [
      brute(),
      brute({ id: 'id-notion-outil', nom: 'Outil Y', typePrincipal: 'Logiciel ou application', lien: 'https://outil-y.org', contact: null, porteurIds: [], motsCles: [], reposeSur: ['id-notion-x', 'id-notion-ecartee'], logoFichier: 'logo.png', logoFichierUrl: 'https://fichiers.notion.exemple/secret?sig=abc' }),
      brute({ id: 'id-notion-ecartee', nom: 'Vieille fiche', lien: null, statutFiche: 'Écartée', porteurIds: [] }),
    ],
  });
  const faux = fauxNotion({ pannes: pannesVersions });
  const journal = [];
  const noterJournal = (...ligne) => journal.push(ligne.join(' '));
  const versions = creerVersions(faux.client, env, { maintenant: () => T0, journal: noterJournal });
  let vidages = 0;
  const ressources = creerRessources({
    notion: base.notion, versions, verrous, secret: 'secret-d-essai', maintenant: () => T0, journal: noterJournal,
    viderMemoire: () => { vidages += 1; }, attendre: async () => {},
    propositions: {
      async peutDecider(courriel) { return courriel === TESS; },
      async listerPropositions() { return propositions; },
    },
  });
  // L'ordre de tous les appels, fiches et versions confondues.
  return { ...base, ressources, versions, faux, journal, vidages: () => vidages };
}
const pagesVersions = (b) => [...b.faux.pages.values()];
const enregistrer = (b, valeurs, depart, extra = {}) => b.ressources.enregistrer({ repere: 'cohorte-x', valeurs, depart, par: TESS, ...extra });

// ─── Lecture ───
test('le tableau donne toutes les fiches, publiques et écartées, sans aucun identifiant Notion', async () => {
  const b = banc({ propositions: [{ id: 'prop-1', statut: 'attente', ficheId: 'id-notion-x' }, { id: 'prop-2', statut: 'verification', ficheId: 'id-notion-x' }, { id: 'prop-3', statut: 'approuvee', ficheId: 'id-notion-x' }] });
  const { ressources, historique } = await b.ressources.lister();
  assert.equal(historique, true);
  assert.deepEqual(ressources.map((r) => [r.nom, r.statut, r.adresse]), [['Cohorte X', 'publiee', 'cohorte-x'], ['Outil Y', 'publiee', 'outil-y'], ['Vieille fiche', 'ecartee', null]]);
  const [cohorte, , ecartee] = ressources;
  assert.equal(cohorte.id, 'cohorte-x', 'une fiche publique est désignée par son adresse');
  assert.match(ecartee.id, /^~[0-9a-f]{24}$/, 'une fiche écartée reçoit un repère opaque');
  assert.deepEqual(cohorte.porteurs, ['CHUM']);
  assert.equal(cohorte.typePrincipal, TYPE_JEU);
  assert.equal(cohorte.versions, 1);
  assert.equal(cohorte.dernier, null);
  assert.equal(cohorte.enAttente, 2, 'les propositions ouvertes seulement');
  assert.equal(ecartee.enAttente, 0);
  const tout = JSON.stringify(ressources);
  assert.ok(!/id-notion|porteurIds|logoFichier|modifieeLe|statutFiche|notion\.exemple/.test(tout), tout);
});

test('une fiche ouverte : les champs du catalogue seulement, la version de départ, les listes de choix', async () => {
  const b = banc({ propositions: [{ id: 'prop-1', statut: 'attente', ficheId: 'id-notion-outil', genre: 'modification', nomProposant: 'Pat', courriel: 'pat@exemple.org' }] });
  const d = await b.ressources.lire('outil-y');
  assert.deepEqual(Object.keys(d.valeurs), CLES);
  assert.deepEqual(d.fiche, { id: 'outil-y', adresse: 'outil-y', nom: 'Outil Y', statut: 'publiee', verifieeLe: null, verifieePar: null, aRevoir: false, noteARevoir: '', logo: d.fiche.logo, logoDepose: true });
  assert.match(d.fiche.logo, /^\/api\/logo\?adresse=outil-y&v=[0-9a-f]+$/);
  assert.deepEqual(d.valeurs.reposeSur, ['cohorte-x'], 'un lien vers une fiche écartée n\'est pas montré');
  assert.deepEqual(d.versions.map((v) => [v.numero, v.source]), [[1, 'depart']]);
  assert.equal(d.historique, true);
  assert.deepEqual(d.enAttente, [{ id: 'prop-1', genre: 'modification', nomProposant: 'Pat' }]);
  assert.deepEqual(d.existantes.porteurs, ['CHUM', 'Université McGill']);
  assert.deepEqual(d.existantes.fiches, [{ adresse: 'cohorte-x', nom: 'Cohorte X' }, { adresse: 'outil-y', nom: 'Outil Y' }]);
  assert.deepEqual(d.existantes.motsCles, ['cancer', 'génomique']);
  assert.deepEqual(d.options.etat, ['Actif', 'Archivé']);
  assert.ok(!/id-notion|porteurIds|logoFichier|modifieeLe|statutFiche|notion\.exemple/.test(JSON.stringify(d)));
});

test('une fiche écartée s\'ouvre par son repère ; un repère inconnu ne donne rien', async () => {
  const b = banc();
  const { ressources } = await b.ressources.lister();
  const d = await b.ressources.lire(ressources[2].id);
  assert.equal(d.fiche.nom, 'Vieille fiche');
  assert.equal(d.fiche.statut, 'ecartee');
  assert.equal(d.fiche.adresse, null);
  assert.equal(await b.ressources.lire('inconnue'), null);
  assert.equal(await b.ressources.lire('~000000000000000000000000'), null);
  assert.equal(await b.ressources.lire('id-notion-x'), null, 'l\'identifiant Notion ne désigne pas une fiche');
});

// ─── Enregistrer ───
test('enregistrer écrit la fiche, puis une version « Panneau » avec l\'avant et l\'après', async () => {
  const b = banc();
  const retour = await enregistrer(b, { phrase: 'Une autre phrase.', motsCles: ['cancer', 'génomique'] }, { phrase: 'Une phrase.', motsCles: ['cancer'] });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', numero: 2, historique: true, champs: 2 });
  const [ecriture] = b.de('mettreAJourFiche');
  assert.equal(ecriture.id, 'id-notion-x');
  assert.deepEqual(Object.keys(ecriture.proprietes).sort(), [PROP.phrase, PROP.motsCles].sort(), 'seuls les champs changés sont écrits');
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  const [page] = pagesVersions(b);
  assert.equal(page.properties[COLONNES.source].select.name, 'Panneau');
  assert.deepEqual(page.properties[COLONNES.fiche], { relation: [{ id: 'id-notion-x' }] });
  assert.deepEqual(page.properties[COLONNES.faitePar], { email: TESS });
  const [version] = await b.versions.lister('id-notion-x');
  assert.deepEqual(version.changements, { phrase: { avant: 'Une phrase.', apres: 'Une autre phrase.' }, motsCles: { avant: ['cancer'], apres: ['cancer', 'génomique'] } });
  assert.equal(b.vidages(), 1, 'la copie gardée du site public est oubliée');
});

test('la fiche est écrite avant la version', async () => {
  const b = banc();
  const ordre = [];
  const ecrireFiche = b.notion.mettreAJourFiche; const ecrireVersion = b.versions.ecrire;
  b.notion.mettreAJourFiche = async (...a) => { ordre.push('fiche'); return ecrireFiche(...a); };
  b.versions.ecrire = async (...a) => { ordre.push('version'); return ecrireVersion(...a); };
  await enregistrer(b, { phrase: 'Une autre phrase.' }, { phrase: 'Une phrase.' });
  assert.deepEqual(ordre, ['fiche', 'version']);
});

test('rien ne s\'écrit quand rien n\'a changé : ni fiche, ni version', async () => {
  const b = banc();
  const retour = await enregistrer(b, { phrase: 'Une  phrase. ', contact: 'A@B.org' }, { phrase: 'Une phrase.', contact: 'a@b.org' });
  assert.deepEqual(retour, { ok: true, inchangee: true, id: 'cohorte-x' });
  assert.equal(b.de('mettreAJourFiche').length, 0);
  assert.equal(pagesVersions(b).length, 0);
  assert.equal(b.vidages(), 0);
});

test('conflit : un champ modifié a changé entre-temps sur la fiche, rien n\'est écrit', async () => {
  const b = banc();
  // Pendant la saisie, quelqu'un d'autre a changé la phrase.
  b.fiches[0].phrase = 'Phrase de quelqu\'un d\'autre.';
  const retour = await enregistrer(b, { phrase: 'Ma phrase.', contact: 'c@d.org' }, { phrase: 'Une phrase.', contact: 'a@b.org' });
  assert.deepEqual(retour, { ok: false, code: 'conflit', conflits: { phrase: 'Phrase de quelqu\'un d\'autre.' } });
  assert.equal(b.de('mettreAJourFiche').length, 0);
  assert.equal(pagesVersions(b).length, 0);
  assert.equal(b.fiches[0].contact, 'a@b.org');
});

test('pas de conflit pour un champ que l\'on ne touche pas, ni quand l\'autre a écrit la même valeur', async () => {
  const b = banc();
  b.fiches[0].contact = 'autre@exemple.org';
  b.fiches[0].phrase = 'Ma phrase.';
  const retour = await enregistrer(b, { phrase: 'Ma phrase.', lien: 'https://nouveau.org' }, { phrase: 'Une phrase.', lien: 'https://cohorte-x.org' });
  assert.equal(retour.ok, true);
  assert.equal(retour.champs, 1);
  assert.equal(b.fiches[0].lien, 'https://nouveau.org');
  assert.equal(b.fiches[0].contact, 'autre@exemple.org', 'le champ changé par l\'autre personne est laissé tel quel');
});

test('un champ envoyé sans sa valeur de départ est refusé', async () => {
  const b = banc();
  const retour = await enregistrer(b, { phrase: 'Ma phrase.' }, {});
  assert.equal(retour.ok, false);
  assert.equal(retour.code, 'invalide');
  assert.equal(b.de('mettreAJourFiche').length, 0);
});

test('les valeurs passent par la validation du catalogue ; un champ inconnu est ignoré', async () => {
  const b = banc();
  const refus = await enregistrer(b, { lien: 'pas une adresse', etat: 'Inventé', nom: '' }, { lien: 'https://cohorte-x.org', etat: 'Actif', nom: 'Cohorte X' });
  assert.equal(refus.code, 'invalide');
  assert.deepEqual(Object.keys(refus.erreurs).sort(), ['etat', 'lien', 'nom']);
  assert.equal(b.de('mettreAJourFiche').length, 0);
  const retour = await enregistrer(b, { etat: 'Archivé', notesDeVeille: 'intrus', statutFiche: 'Écartée' }, { etat: 'Actif', notesDeVeille: '', statutFiche: 'Publiée' });
  assert.equal(retour.ok, true);
  assert.deepEqual(Object.keys(b.de('mettreAJourFiche')[0].proprietes), [PROP.etat]);
  assert.equal(b.fiches[0].statutFiche, 'Publiée');
});

test('un porteur se rattache parmi les porteurs existants, sans en créer', async () => {
  const b = banc();
  const refus = await enregistrer(b, { porteurs: ['CHUM', 'Institut inconnu'] }, { porteurs: ['CHUM'] });
  assert.equal(refus.code, 'invalide');
  assert.ok(refus.erreurs.porteurs);
  const retour = await enregistrer(b, { porteurs: ['chum', 'Université McGill'] }, { porteurs: ['CHUM'] });
  assert.equal(retour.ok, true);
  assert.deepEqual(b.fiches[0].porteurIds, ['id-notion-chum', 'id-notion-mcgill']);
  assert.ok(!b.appels.some((a) => a.nom === 'creerPorteur'));
});

test('liens entre fiches : adresse inconnue refusée, lien vers soi refusé, lien caché conservé', async () => {
  const b = banc();
  const versOutil = (valeurs, depart) => b.ressources.enregistrer({ repere: 'outil-y', valeurs, depart, par: TESS });
  assert.ok((await versOutil({ reposeSur: ['inconnue'] }, { reposeSur: ['cohorte-x'] })).erreurs.reposeSur);
  assert.ok((await versOutil({ faitPartieDe: ['outil-y'] }, { faitPartieDe: [] })).erreurs.faitPartieDe);
  const retour = await versOutil({ reposeSur: [] }, { reposeSur: ['cohorte-x'] });
  assert.equal(retour.ok, true);
  assert.deepEqual(b.fiches[1].reposeSur, ['id-notion-ecartee'], 'le lien vers la fiche écartée, invisible dans le panneau, reste');
});

test('renommer une fiche change son adresse : la réponse donne la nouvelle', async () => {
  const b = banc();
  const retour = await enregistrer(b, { nom: 'Cohorte Z' }, { nom: 'Cohorte X' });
  assert.equal(retour.id, 'cohorte-z');
  assert.equal((await b.ressources.lire('cohorte-z')).fiche.nom, 'Cohorte Z');
  assert.equal(pagesVersions(b)[0].properties[COLONNES.titre].title[0].text.content, 'Cohorte Z, version 2');
});

test('une nouvelle adresse de logo remplace l\'image déposée', async () => {
  const b = banc();
  const retour = await b.ressources.enregistrer({ repere: 'outil-y', valeurs: { logo: 'https://outil-y.org/logo.png' }, depart: { logo: null }, par: TESS });
  assert.equal(retour.ok, true);
  assert.deepEqual(b.de('mettreAJourFiche')[0].proprietes[PROP.logoFichier], { files: [] });
});

// ─── Rétablir ───
test('rétablir ajoute une version « Rétablissement » et n\'en retire aucune', async () => {
  const b = banc();
  await enregistrer(b, { phrase: 'Deuxième.' }, { phrase: 'Une phrase.' });
  await enregistrer(b, { phrase: 'Troisième.', contact: 'c@d.org' }, { phrase: 'Deuxième.', contact: 'a@b.org' });
  const avant = await b.versions.lister('id-notion-x');
  const retour = await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par: TESS });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', numero: 4, historique: true, champs: 2 });
  assert.equal(b.fiches[0].phrase, 'Une phrase.');
  assert.equal(b.fiches[0].contact, 'a@b.org');
  const apres = await b.versions.lister('id-notion-x');
  assert.deepEqual(apres.slice(0, 2), avant, 'les versions d\'avant sont intactes');
  assert.deepEqual(apres.map((v) => [v.numero, v.source]), [[2, 'panneau'], [3, 'panneau'], [4, 'retablissement']]);
  assert.equal(apres[2].note, 'Retour à la version 1');
  assert.deepEqual(apres[2].changements, { phrase: { avant: 'Troisième.', apres: 'Une phrase.' }, contact: { avant: 'c@d.org', apres: 'a@b.org' } });
  // La version 3 se retrouve encore, après le rétablissement.
  const d = await b.ressources.lire('cohorte-x');
  assert.deepEqual(d.versions.map((v) => v.numero), [1, 2, 3, 4]);
});

test('rétablir une version identique à la fiche n\'écrit rien ; une version inconnue est refusée', async () => {
  const b = banc();
  await enregistrer(b, { phrase: 'Deuxième.' }, { phrase: 'Une phrase.' });
  const ecritures = b.de('mettreAJourFiche').length;
  assert.deepEqual(await b.ressources.retablir({ repere: 'cohorte-x', numero: 2, par: TESS }), { ok: true, inchangee: true, id: 'cohorte-x' });
  assert.equal((await b.ressources.retablir({ repere: 'cohorte-x', numero: 9, par: TESS })).code, 'invalide');
  assert.equal((await b.ressources.retablir({ repere: 'cohorte-x', numero: 1.5, par: TESS })).code, 'invalide');
  assert.equal(b.de('mettreAJourFiche').length, ecritures);
  assert.equal(pagesVersions(b).length, 1);
});

// ─── Rôles ───
test('une personne en lecture seule, ou inconnue, ne fait aucun geste d\'écriture', async () => {
  for (const par of [LECTRICE, 'intrus@exemple.org', '']) {
    const b = banc();
    const refus = { ok: false, code: 'non-approbateur' };
    assert.deepEqual(await enregistrer(b, { phrase: 'X.' }, { phrase: 'Une phrase.' }, { par }), refus);
    assert.deepEqual(await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par }), refus);
    assert.deepEqual(await b.ressources.verifier({ repere: 'cohorte-x', par }), refus);
    assert.deepEqual(await b.ressources.ecarter({ repere: 'cohorte-x', par }), refus);
    assert.deepEqual(await b.ressources.republier({ repere: 'cohorte-x', par }), refus);
    assert.deepEqual(await b.ressources.creer({ valeurs: { nom: 'N' }, par }), refus);
    assert.equal(b.appels.length, 0, 'aucune lecture, aucune écriture');
    assert.equal(b.faux.appels.length, 0);
  }
});

// ─── Base « Versions » absente, ou en panne ───
test('sans la base « Versions » : la fiche se lit et se modifie, l\'historique est vide', async () => {
  const b = banc({ env: {} });
  const { ressources, historique } = await b.ressources.lister();
  assert.equal(historique, false);
  assert.equal(ressources[0].versions, 1);
  const d = await b.ressources.lire('cohorte-x');
  assert.equal(d.historique, false);
  assert.deepEqual(d.versions.map((v) => v.source), ['depart']);
  const retour = await enregistrer(b, { phrase: 'Une autre phrase.' }, { phrase: 'Une phrase.' });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', numero: null, historique: false, champs: 1 });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.');
  assert.equal(b.faux.appels.length, 0, 'la base absente n\'est jamais interrogée');
  assert.ok(b.journal.some((ligne) => /NOTION_DB_VERSIONS/.test(ligne)));
  assert.deepEqual(await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par: TESS }), { ok: false, code: 'sans-historique' });
});

test('la version ne peut pas s\'écrire : la fiche reste changée, le geste le dit et le journalise', async () => {
  const b = banc({ pannesVersions: { 'pages.create': true } });
  const retour = await enregistrer(b, { phrase: 'Une autre phrase.' }, { phrase: 'Une phrase.' });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', numero: null, historique: false, champs: 1 });
  assert.equal(b.fiches[0].phrase, 'Une autre phrase.', 'la fiche n\'est pas remise en arrière');
  assert.ok(b.journal.some((ligne) => /version non écrite/.test(ligne)));
});

test('l\'historique ne peut pas se lire : le tableau et la fiche s\'affichent quand même', async () => {
  const b = banc({ pannesVersions: { 'databases.query': true } });
  const { ressources, historique } = await b.ressources.lister();
  assert.equal(ressources.length, 3);
  assert.equal(historique, false);
  const d = await b.ressources.lire('cohorte-x');
  assert.equal(d.historique, false);
  assert.deepEqual(d.versions.map((v) => v.source), ['depart']);
});

test('la fiche ne peut pas s\'écrire : aucune version, et le geste échoue', async () => {
  const b = banc({ pannes: { mettreAJourFiche: true } });
  assert.deepEqual(await enregistrer(b, { phrase: 'Une autre phrase.' }, { phrase: 'Une phrase.' }), { ok: false, code: 'notion' });
  assert.equal(pagesVersions(b).length, 0);
});

// ─── Verrou ───
test('un seul changement à la fois par fiche ; le verrou est rendu, même après un échec', async () => {
  const pris = new Set();
  const verrous = { async prendreVerrou(nom) { if (pris.has(nom)) return false; pris.add(nom); return true; }, async rendreVerrou(nom) { pris.delete(nom); } };
  const b = banc({ verrous });
  pris.add('fiche:id-notion-x');
  assert.deepEqual(await enregistrer(b, { phrase: 'X.' }, { phrase: 'Une phrase.' }), { ok: false, code: 'occupee' });
  assert.equal(b.de('mettreAJourFiche').length, 0);
  pris.clear();
  assert.equal((await enregistrer(b, { phrase: 'X.' }, { phrase: 'Une phrase.' })).ok, true);
  assert.equal(pris.size, 0);
  assert.equal((await enregistrer(b, { lien: 'non' }, { lien: 'https://cohorte-x.org' })).code, 'invalide');
  assert.equal(pris.size, 0);
});

test('deux enregistrements lancés ensemble sur la même valeur de départ : un seul passe', async () => {
  const b = banc();
  const resultats = await Promise.all([
    enregistrer(b, { phrase: 'Phrase de A.' }, { phrase: 'Une phrase.' }),
    enregistrer(b, { phrase: 'Phrase de B.' }, { phrase: 'Une phrase.' }),
  ]);
  assert.deepEqual(resultats.map((r) => r.ok).sort(), [false, true]);
  assert.ok(['occupee', 'conflit'].includes(resultats.find((r) => !r.ok).code));
  assert.equal(pagesVersions(b).length, 1);
});

// ─── Vérifier, écarter, republier ───
test('marquer vérifiée : la date du jour au Québec, par l\'équipe, sans version', async () => {
  const b = banc();
  const retour = await b.ressources.verifier({ repere: 'cohorte-x', par: TESS });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', verifieeLe: '2026-11-25', verifieePar: 'Équipe du RSN' });
  assert.deepEqual(b.de('mettreAJourFiche')[0].proprietes, { [PROP.verifieeLe]: { date: { start: '2026-11-25' } }, [PROP.verifieePar]: { select: { name: 'Équipe du RSN' } } });
  assert.equal(pagesVersions(b).length, 0);
  assert.equal(b.vidages(), 1);
});

test('écarter puis republier : le statut change, la fiche change de repère, aucune version', async () => {
  const b = banc();
  const ecartee = await b.ressources.ecarter({ repere: 'cohorte-x', par: TESS });
  assert.equal(ecartee.ok, true);
  assert.match(ecartee.id, /^~[0-9a-f]{24}$/);
  assert.equal(b.fiches[0].statutFiche, 'Écartée');
  assert.deepEqual(b.de('mettreAJourFiche')[0].proprietes, { [PROP.statutFiche]: { select: { name: 'Écartée' } } });
  assert.equal(await b.ressources.lire('cohorte-x'), null);
  assert.equal((await b.ressources.lire(ecartee.id)).fiche.statut, 'ecartee');
  // Une fiche écartée ne se marque pas vérifiée.
  assert.equal((await b.ressources.verifier({ repere: ecartee.id, par: TESS })).code, 'invalide');
  const republiee = await b.ressources.republier({ repere: ecartee.id, par: TESS });
  assert.deepEqual(republiee, { ok: true, id: 'cohorte-x' });
  assert.equal(b.fiches[0].statutFiche, 'Publiée');
  assert.equal(pagesVersions(b).length, 0);
  assert.equal(b.vidages(), 2);
  // Le repère opaque reste compris après la republication.
  assert.equal((await b.ressources.lire(ecartee.id)).fiche.id, 'cohorte-x');
});

test('une fiche introuvable : aucun geste', async () => {
  const b = banc();
  for (const geste of ['verifier', 'ecarter', 'republier']) assert.deepEqual(await b.ressources[geste]({ repere: 'inconnue', par: TESS }), { ok: false, code: 'introuvable' });
  assert.deepEqual(await enregistrer(b, { phrase: 'X.' }, { phrase: 'Une phrase.' }, { repere: 'inconnue' }), { ok: false, code: 'introuvable' });
  assert.deepEqual(await b.ressources.retablir({ repere: 'inconnue', numero: 1, par: TESS }), { ok: false, code: 'introuvable' });
  assert.equal(b.de('mettreAJourFiche').length, 0);
});

// ─── Ajouter une ressource ───
const NEUVE = { nom: 'Plateforme Z', typePrincipal: 'Logiciel ou application', phrase: 'Elle calcule.', lien: 'https://z.org', porteurs: ['CHUM'], motsCles: ['cancer'] };

test('ajouter une ressource : fiche « Publiée » et « Actif », version « Création » numéro 1', async () => {
  const b = banc();
  const retour = await b.ressources.creer({ valeurs: NEUVE, par: TESS });
  assert.deepEqual(retour, { ok: true, id: 'plateforme-z', numero: 1, historique: true });
  const [proprietes] = b.de('creerFiche');
  assert.deepEqual(proprietes[PROP.statutFiche], { select: { name: 'Publiée' } });
  assert.deepEqual(proprietes[PROP.etat], { select: { name: 'Actif' } });
  assert.deepEqual(proprietes[PROP.porteurs], { relation: [{ id: 'id-notion-chum' }] });
  assert.ok(!(PROP.verifieeLe in proprietes), 'la fiche n\'est pas marquée vérifiée');
  const [page] = pagesVersions(b);
  assert.equal(page.properties[COLONNES.source].select.name, 'Création');
  assert.deepEqual(page.properties[COLONNES.numero], { number: 1 });
  const d = await b.ressources.lire('plateforme-z');
  assert.deepEqual(d.versions.map((v) => [v.numero, v.source]), [[1, 'creation']]);
  assert.equal(d.versions[0].changements.nom.apres, 'Plateforme Z');
  assert.equal(d.versions[0].changements.etat.apres, 'Actif');
  assert.equal(b.vidages(), 1);
});

test('ajouter une ressource : champs obligatoires, porteur inconnu et doublon refusés, rien n\'est créé', async () => {
  const b = banc();
  const incomplet = await b.ressources.creer({ valeurs: { nom: 'Sans le reste' }, par: TESS });
  assert.equal(incomplet.code, 'invalide');
  assert.deepEqual(Object.keys(incomplet.erreurs).sort(), ['lien', 'phrase', 'typePrincipal']);
  assert.ok((await b.ressources.creer({ valeurs: { ...NEUVE, porteurs: ['Inconnu'] }, par: TESS })).erreurs.porteurs);
  assert.deepEqual(await b.ressources.creer({ valeurs: { ...NEUVE, nom: 'Cohorte X', lien: 'https://cohorte-x.org' }, par: TESS }), { ok: false, code: 'doublon' });
  assert.equal(b.de('creerFiche').length, 0);
  assert.equal(pagesVersions(b).length, 0);
});

test('le formulaire d\'une nouvelle ressource : des champs vides et les listes de choix', async () => {
  const b = banc();
  const d = await b.ressources.neuve();
  assert.deepEqual(Object.keys(d.valeurs), CLES);
  assert.deepEqual(d.valeurs.motsCles, []);
  assert.equal(d.valeurs.nom, null);
  assert.deepEqual(d.existantes.porteurs, ['CHUM', 'Université McGill']);
  assert.ok(d.options.typePrincipal.length > 0);
});

// ─── Constats de la relecture ───
test('rétablir est refusé si une version plus récente est illisible : la fiche ne reçoit pas un état mélangé', async () => {
  const b = banc();
  await enregistrer(b, { phrase: 'Deuxième.' }, { phrase: 'Une phrase.' });
  await enregistrer(b, { phrase: 'Troisième.' }, { phrase: 'Deuxième.' });
  // Le bloc de la version 3 est abîmé.
  const [, page3] = pagesVersions(b);
  b.faux.blocs.get(page3.id)[0].code.rich_text = [{ type: 'text', text: { content: 'pas du json' } }];
  const ecritures = b.de('mettreAJourFiche').length;
  const retour = await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par: TESS });
  assert.equal(retour.code, 'invalide');
  assert.match(retour.erreurs._, /illisible/);
  assert.equal(b.de('mettreAJourFiche').length, ecritures);
  assert.equal(b.fiches[0].phrase, 'Troisième.');
  // Rétablir la version 3 elle-même (rien de plus récent n'est illisible) reste sans effet et sans erreur.
  assert.equal((await b.ressources.retablir({ repere: 'cohorte-x', numero: 3, par: TESS })).inchangee, true);
});

test('rétablir : un champ qui ne peut plus revenir est laissé de côté et nommé, les autres reviennent', async () => {
  const b = banc();
  await enregistrer(b, { porteurs: ['Université McGill'] }, { porteurs: ['CHUM'] });
  await enregistrer(b, { phrase: 'Deuxième.' }, { phrase: 'Une phrase.' });
  // Le porteur de la version 1 a été renommé depuis.
  b.porteurs.find((p) => p.nom === 'CHUM').nom = 'Centre hospitalier de l\'UdeM';
  const retour = await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par: TESS });
  assert.equal(retour.ok, true);
  assert.deepEqual(retour.laisses, ['porteurs']);
  assert.equal(retour.champs, 1);
  assert.equal(b.fiches[0].phrase, 'Une phrase.');
  assert.deepEqual(b.fiches[0].porteurIds, ['id-notion-mcgill'], 'les porteurs ne bougent pas');
  const versions = await b.versions.lister('id-notion-x');
  const derniere = versions[versions.length - 1];
  assert.deepEqual(Object.keys(derniere.changements), ['phrase']);
  assert.match(derniere.note, /Retour à la version 1/);
});

test('rétablir : si aucun champ ne peut revenir, rien n\'est écrit et les champs sont nommés', async () => {
  const b = banc();
  await enregistrer(b, { porteurs: ['Université McGill'] }, { porteurs: ['CHUM'] });
  b.porteurs.find((p) => p.nom === 'CHUM').nom = 'Autre nom';
  const ecritures = b.de('mettreAJourFiche').length;
  const retour = await b.ressources.retablir({ repere: 'cohorte-x', numero: 1, par: TESS });
  assert.equal(retour.code, 'invalide');
  assert.ok(retour.erreurs.porteurs);
  assert.equal(b.de('mettreAJourFiche').length, ecritures);
});

test('vider l\'adresse du logo ne retire pas l\'image déposée', async () => {
  const fiches = [brute({ logo: 'https://vieux.exemple/logo.png', logoFichier: 'logo.png', logoFichierUrl: 'https://notion.exemple/x' })];
  const b = banc({ fiches });
  const retour = await enregistrer(b, { logo: '' }, { logo: 'https://vieux.exemple/logo.png' });
  assert.equal(retour.ok, true);
  assert.ok(!(PROP.logoFichier in b.de('mettreAJourFiche')[0].proprietes));
  assert.equal(b.fiches[0].logoFichier, 'logo.png');
});

test('ajouter une ressource qui ressemble à une fiche existante demande confirmation', async () => {
  const b = banc();
  for (const proche of [{ ...NEUVE, lien: 'https://WWW.cohorte-x.org/' }, { ...NEUVE, nom: 'cohorte  x' }, { ...NEUVE, nom: 'Vieille Fiche' }]) {
    const retour = await b.ressources.creer({ valeurs: proche, par: TESS });
    assert.equal(retour.code, 'ressemble', JSON.stringify(proche).slice(0, 60));
    assert.ok(['Cohorte X', 'Vieille fiche'].includes(retour.nom));
  }
  assert.equal(b.de('creerFiche').length, 0);
  const force = await b.ressources.creer({ valeurs: { ...NEUVE, lien: 'https://WWW.cohorte-x.org/' }, par: TESS, malgreRessemblance: true });
  assert.equal(force.ok, true);
  assert.equal(b.de('creerFiche').length, 1);
});

test('changer le lien principal d\'une fiche efface sa date de panne : elle ne vaut plus pour le nouveau lien', async () => {
  const b = banc({ fiches: [brute({ lienEnPanneDepuis: '2026-11-18' })] });
  const retour = await enregistrer(b, { lien: 'https://nouveau.cohorte-x.org' }, { lien: 'https://cohorte-x.org' });
  assert.equal(retour.ok, true);
  assert.deepEqual(b.de('mettreAJourFiche')[0].proprietes[PROP.lienEnPanneDepuis], { date: null });
  const autre = banc({ fiches: [brute({ lienEnPanneDepuis: '2026-11-18' })] });
  await enregistrer(autre, { phrase: 'Autre.' }, { phrase: 'Une phrase.' });
  assert.ok(!(PROP.lienEnPanneDepuis in autre.de('mettreAJourFiche')[0].proprietes));
});

// ─── Fiche « à revoir » ───
test('marquer une fiche à revoir : une case et une note pour l\'équipe, sans version ; puis retirer la marque', async () => {
  const b = banc();
  const retour = await b.ressources.revoir({ repere: 'cohorte-x', actif: true, note: '  Le lien a changé,\n à confirmer.  ', par: TESS });
  assert.deepEqual(retour, { ok: true, id: 'cohorte-x', aRevoir: true, note: 'Le lien a changé, à confirmer.' });
  const ecrit = b.de('mettreAJourFiche')[0].proprietes;
  assert.deepEqual(Object.keys(ecrit).sort(), [PROP.aRevoir, PROP.noteARevoir].sort());
  assert.deepEqual(ecrit[PROP.aRevoir], { checkbox: true });
  assert.equal(pagesVersions(b).length, 0);
  const d = await b.ressources.lire('cohorte-x');
  assert.equal(d.fiche.aRevoir, true);
  assert.equal(d.fiche.noteARevoir, 'Le lien a changé, à confirmer.');
  assert.equal((await b.ressources.lister()).ressources.find((r) => r.id === 'cohorte-x').aRevoir, true);
  // Retirer la marque efface aussi la note.
  const retire = await b.ressources.revoir({ repere: 'cohorte-x', actif: false, note: 'ignorée', par: TESS });
  assert.deepEqual(retire, { ok: true, id: 'cohorte-x', aRevoir: false, note: '' });
  assert.equal(b.fiches[0].aRevoir, false);
  assert.equal(b.fiches[0].noteARevoir, '');
});

test('à revoir : la note est bornée, et une personne en lecture seule ne marque rien', async () => {
  const b = banc();
  const longue = await b.ressources.revoir({ repere: 'cohorte-x', actif: true, note: 'x'.repeat(900), par: TESS });
  assert.equal(longue.note.length, 500);
  const ecritures = b.de('mettreAJourFiche').length;
  assert.equal((await b.ressources.revoir({ repere: 'cohorte-x', actif: true, note: 'x', par: LECTRICE })).code, 'non-approbateur');
  assert.equal(b.de('mettreAJourFiche').length, ecritures);
});
