const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApprobation } = require('../lib/approbation');
const { PROP } = require('../lib/notion');

const APPROBATEUR = 'tess@exemple.ca';
const OPTIONS = { typePrincipal: ['Logiciel ou application'], secondType: [], etat: ['Actif', 'Archivé'], portee: ['Le Québec'] };
const NOUVELLE = { nom: { apres: 'Outil X' }, typePrincipal: { apres: 'Logiciel ou application' }, phrase: { apres: 'Une phrase.' }, lien: { apres: 'https://x.org' } };

// Banc d'essai : tout ce qui touche Notion, les courriels et le géocodage est factice et noté.
function banc({ proposition = {}, fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'a@b.org', porteurIds: [] }, pannes = {}, approbateurs = [APPROBATEUR], fichesExistantes = {}, porteurs = [], lent = 0 } = {}) {
  const appels = [];
  const noter = (nom, args) => { appels.push({ nom, args }); if (pannes[nom]) { const e = pannes[nom]; if (typeof e === 'function') { const r = e(); if (r) throw r; } else throw e; } };
  const prop = {
    id: 'prop-1', genre: 'nouvelle', ficheId: null, courriel: 'p@exemple.org', nomProposant: 'Pat', lienAvecRessource: 'aucun',
    titre: 'Nouvelle : Outil X', statut: 'attente', contenu: { propose: NOUVELLE, applique: null, porteursNouveaux: {} }, ...proposition,
  };
  const notion = {
    async lireFiche(id) { noter('lireFiche', id); return fiche && fiche.id === id ? fiche : null; },
    async trouverFiche(cle) { noter('trouverFiche', cle); return fichesExistantes[`${cle.nom}|${cle.lien}`] || null; },
    async creerFiche(p) { if (lent) await new Promise((r) => setTimeout(r, lent)); noter('creerFiche', p); fichesExistantes[`Outil X|https://x.org`] = 'fiche-neuve'; return 'fiche-neuve'; },
    async mettreAJourFiche(id, p) { noter('mettreAJourFiche', { id, p }); },
    async lireOptions() { return OPTIONS; },
    async lirePorteurs() { return porteurs; },
    async creerPorteur(p) { noter('creerPorteur', p); return `porteur-${p.nom}`; },
  };
  const propositions = {
    async estApprobateur(c) { return approbateurs.includes(c); },
    async lireProposition(id) { noter('lireProposition', id); return id === prop.id ? { ...prop } : null; },
    async marquerDecision(id, d) { noter('marquerDecision', { id, ...d }); prop.statut = d.statut; },
  };
  const courriels = {
    async approuvee(m) { noter('courriel.approuvee', m); return { envoye: !pannes.courriel }; },
    async refusee(m) { noter('courriel.refusee', m); return { envoye: !pannes.courriel }; },
  };
  const approbation = creerApprobation({
    notion, propositions, courriels,
    geocoder: async (adresse) => { noter('geocoder', adresse); return { latitude: 45.5, longitude: -73.5 }; },
    viderMemoire: () => noter('viderMemoire'),
    idParAdresse: async () => ({ 'cohorte-x': 'fiche-1', 'outil-x': 'fiche-neuve', cartagene: 'fiche-c' }),
    maintenant: () => Date.UTC(2026, 10, 24, 15),
    journal: () => {},
  });
  const de = (nom) => appels.filter((a) => a.nom === nom).map((a) => a.args);
  return { approbation, appels, de, prop };
}
const approuver = (b, extra = {}) => b.approbation.approuver({ propositionId: 'prop-1', approbateur: APPROBATEUR, origine: 'https://site', ...extra });

test("quelqu'un qui n'est pas approbateur ne peut ni approuver ni refuser", async () => {
  const b = banc();
  assert.deepEqual(await approuver(b, { approbateur: 'intrus@exemple.org' }), { ok: false, code: 'non-approbateur' });
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non', approbateur: 'intrus@exemple.org' }), { ok: false, code: 'non-approbateur' });
  assert.equal(b.appels.length, 0);
});

test('proposition introuvable ou déjà tranchée', async () => {
  assert.deepEqual(await approuver(banc(), { propositionId: 'autre' }), { ok: false, code: 'introuvable' });
  const b = banc({ proposition: { statut: 'approuvee' } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'deja-tranchee' });
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non', approbateur: APPROBATEUR }), { ok: false, code: 'deja-tranchee' });
  assert.equal(b.de('creerFiche').length + b.de('mettreAJourFiche').length + b.de('marquerDecision').length, 0);
});

test('une nouvelle ressource est créée une fois, « Publiée » et « Actif »', async () => {
  const b = banc();
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true });
  const [proprietes] = b.de('creerFiche');
  assert.equal(b.de('creerFiche').length, 1);
  assert.deepEqual(proprietes[PROP.statutFiche], { select: { name: 'Publiée' } });
  assert.deepEqual(proprietes[PROP.etat], { select: { name: 'Actif' } });
  assert.equal(proprietes[PROP.nom].title[0].text.content, 'Outil X');
  assert.ok(!(PROP.verifieeLe in proprietes) && !(PROP.verifieePar in proprietes));
  const [decision] = b.de('marquerDecision');
  assert.equal(decision.statut, 'approuvee');
  assert.equal(decision.approbateur, APPROBATEUR);
  assert.equal(decision.ficheId, 'fiche-neuve');
  assert.equal(decision.applique.nom, 'Outil X');
  assert.equal(b.de('viderMemoire').length, 1);
  assert.deepEqual(b.de('courriel.approuvee')[0], { a: 'p@exemple.org', nom: 'Outil X', lienFiche: 'https://site/ressource/outil-x' });
});

test("l'ordre des écritures : la fiche, puis la décision, puis le courriel", async () => {
  const b = banc();
  await approuver(b);
  const ordre = b.appels.map((a) => a.nom).filter((n) => ['creerFiche', 'marquerDecision', 'viderMemoire', 'courriel.approuvee'].includes(n));
  assert.deepEqual(ordre, ['creerFiche', 'marquerDecision', 'viderMemoire', 'courriel.approuvee']);
});

test("si l'enregistrement de la décision échoue, une seconde tentative ne recrée pas la fiche", async () => {
  let premier = true;
  const b = banc({ pannes: { marquerDecision: () => { if (premier) { premier = false; return new Error('Notion en panne'); } return null; } } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'notion' });
  assert.equal(b.prop.statut, 'attente');
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true });
  assert.equal(b.de('creerFiche').length, 1);
});

test('deux approbations lancées ensemble : une seule écriture', async () => {
  const b = banc({ lent: 20 });
  const resultats = await Promise.all([approuver(b), approuver(b)]);
  assert.deepEqual(resultats.map((r) => r.ok).sort(), [false, true]);
  assert.equal(resultats.find((r) => !r.ok).code, 'deja-tranchee');
  assert.equal(b.de('creerFiche').length, 1);
  assert.equal(b.de('marquerDecision').length, 1);
});

test("si l'écriture de la fiche échoue, la proposition reste en attente", async () => {
  const b = banc({ pannes: { creerFiche: new Error('Notion en panne') } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'notion' });
  assert.equal(b.de('marquerDecision').length, 0);
  assert.equal(b.de('courriel.approuvee').length, 0);
});

test('une modification met à jour la fiche visée, seulement pour les champs proposés', async () => {
  const b = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', titre: 'Modification : Cohorte X', contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} } } });
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-1', courriel: true });
  const [{ id, p }] = b.de('mettreAJourFiche');
  assert.equal(id, 'fiche-1');
  assert.deepEqual(Object.keys(p).sort(), [PROP.contact, PROP.statutFiche].sort());
  assert.deepEqual(p[PROP.contact], { email: 'c@d.org' });
  assert.equal(b.de('creerFiche').length, 0);
  assert.equal(b.de('courriel.approuvee')[0].lienFiche, 'https://site/ressource/cohorte-x');
  assert.equal(b.de('courriel.approuvee')[0].nom, 'Cohorte X');
});

test("la correction de l'approbateur est appliquée, et enregistrée à côté de la proposition", async () => {
  const b = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { motsCles: { avant: [], apres: ['fhir'] } }, applique: null, porteursNouveaux: {} } } });
  await approuver(b, { corrections: { motsCles: ['HL7 FHIR'], etat: 'Archivé', notesInternes: 'x' } });
  const [{ p }] = b.de('mettreAJourFiche');
  assert.deepEqual(p[PROP.motsCles], { multi_select: [{ name: 'HL7 FHIR' }] });
  assert.deepEqual(p[PROP.etat], { select: { name: 'Archivé' } });
  assert.deepEqual(b.de('marquerDecision')[0].applique, { motsCles: ['HL7 FHIR'], etat: 'Archivé' });
});

test('une proposition invalide après correction est refusée avec le détail, sans écriture', async () => {
  const b = banc();
  const retour = await approuver(b, { corrections: { lien: 'pas une adresse' } });
  assert.equal(retour.code, 'invalide');
  assert.ok(retour.erreurs.lien);
  assert.equal(b.de('creerFiche').length, 0);
  const rsn = banc({ proposition: { genre: 'rsn', contenu: { propose: { nom: { apres: 'Outil X' } }, applique: null, porteursNouveaux: {} } } });
  const incomplet = await approuver(rsn);
  assert.equal(incomplet.code, 'invalide');
  assert.deepEqual(Object.keys(incomplet.erreurs).sort(), ['lien', 'phrase', 'typePrincipal']);
});

test("« Vérifiée » n'est écrit que pour un proposant lié à la ressource et qui n'est pas approbateur", async () => {
  const verif = async (proposition, approbateurs) => {
    const b = banc({ proposition, approbateurs });
    await approuver(b);
    return b.de('creerFiche')[0];
  };
  const responsable = await verif({ lienAvecRessource: 'responsable' });
  assert.deepEqual(responsable[PROP.verifieeLe], { date: { start: '2026-11-24' } });
  assert.deepEqual(responsable[PROP.verifieePar], { select: { name: 'Responsable' } });
  const contact = await verif({ lienAvecRessource: 'jy-travaille' });
  assert.deepEqual(contact[PROP.verifieePar], { select: { name: 'Contact' } });
  const aucun = await verif({ lienAvecRessource: 'aucun' });
  assert.ok(!(PROP.verifieeLe in aucun));
  const approbateurQuiPropose = await verif({ lienAvecRessource: 'responsable', courriel: APPROBATEUR }, [APPROBATEUR]);
  assert.ok(!(PROP.verifieeLe in approbateurQuiPropose) && !(PROP.verifieePar in approbateurQuiPropose));
  const rsn = await verif({ genre: 'rsn', lienAvecRessource: 'responsable' });
  assert.ok(!(PROP.verifieeLe in rsn));
});

test('un porteur existant est réutilisé, un nouveau est créé avec ses coordonnées', async () => {
  const contenu = { propose: { ...NOUVELLE, porteurs: { apres: ['chum', 'Institut Neuf'] } }, applique: null, porteursNouveaux: { 'Institut Neuf': '1 rue Neuve, Montréal' } };
  const b = banc({ proposition: { contenu }, porteurs: [{ id: 'porteur-chum', nom: 'CHUM' }] });
  await approuver(b);
  assert.deepEqual(b.de('geocoder'), ['1 rue Neuve, Montréal']);
  assert.deepEqual(b.de('creerPorteur'), [{ nom: 'Institut Neuf', adresse: '1 rue Neuve, Montréal', latitude: 45.5, longitude: -73.5 }]);
  assert.deepEqual(b.de('creerFiche')[0][PROP.porteurs], { relation: [{ id: 'porteur-chum' }, { id: 'porteur-Institut Neuf' }] });
});

test('si le géocodage échoue ou si aucune adresse n\'est donnée, le porteur est créé sans coordonnées', async () => {
  const contenu = { propose: { ...NOUVELLE, porteurs: { apres: ['Institut Neuf', 'Sans Adresse'] } }, applique: null, porteursNouveaux: { 'Institut Neuf': '1 rue Neuve' } };
  const b = banc({ proposition: { contenu }, pannes: { geocoder: new Error('Nominatim en panne') } });
  assert.equal((await approuver(b)).ok, true);
  assert.deepEqual(b.de('creerPorteur'), [{ nom: 'Institut Neuf', adresse: '1 rue Neuve' }, { nom: 'Sans Adresse', adresse: '' }]);
});

test("l'adresse d'un nouveau porteur corrigée par l'approbateur l'emporte", async () => {
  const contenu = { propose: { ...NOUVELLE, porteurs: { apres: ['Institut Neuf'] } }, applique: null, porteursNouveaux: { 'Institut Neuf': 'vague' } };
  const b = banc({ proposition: { contenu } });
  await approuver(b, { porteursNouveaux: { 'Institut Neuf': '1 rue Précise, Québec' } });
  assert.deepEqual(b.de('geocoder'), ['1 rue Précise, Québec']);
});

test('les liens entre fiches saisis par un approbateur sont traduits en identifiants', async () => {
  const b = banc();
  await approuver(b, { corrections: { faitPartieDe: ['cartagene'] } });
  assert.deepEqual(b.de('creerFiche')[0][PROP.faitPartieDe], { relation: [{ id: 'fiche-c' }] });
  const inconnu = banc();
  const retour = await approuver(inconnu, { corrections: { reposeSur: ['nulle-part'] } });
  assert.equal(retour.code, 'invalide');
  assert.ok(retour.erreurs.reposeSur);
});

test('fiche visée disparue : erreur claire, aucune écriture', async () => {
  const b = banc({ fiche: null, proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} } } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'fiche-introuvable' });
  assert.equal(b.de('mettreAJourFiche').length + b.de('marquerDecision').length, 0);
  assert.equal(b.prop.statut, 'attente');
});

test('courriel en échec : la décision tient, la réponse le signale', async () => {
  assert.deepEqual(await approuver(banc({ pannes: { courriel: true } })), { ok: true, ficheId: 'fiche-neuve', courriel: false });
});

test('un refus exige un commentaire, enregistre la décision et prévient le proposant', async () => {
  const sans = banc();
  assert.equal((await sans.approbation.refuser({ propositionId: 'prop-1', commentaire: '   ', approbateur: APPROBATEUR })).code, 'invalide');
  assert.equal(sans.de('marquerDecision').length, 0);
  const b = banc();
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: ' Hors du périmètre. ', approbateur: APPROBATEUR }), { ok: true, courriel: true });
  assert.deepEqual(b.de('marquerDecision')[0], { id: 'prop-1', statut: 'refusee', approbateur: APPROBATEUR, commentaire: 'Hors du périmètre.' });
  assert.deepEqual(b.de('courriel.refusee')[0], { a: 'p@exemple.org', titre: 'Nouvelle : Outil X', commentaire: 'Hors du périmètre.' });
  assert.equal(b.de('creerFiche').length + b.de('mettreAJourFiche').length + b.de('trouverFiche').length, 0);
});

test('examiner donne les valeurs actuelles et les champs bousculés, sans champ interne', async () => {
  const fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'autre@b.org', porteurIds: [], statutFiche: 'Publiée', notesDeVeille: 'secret', motsCles: ['a'] };
  const b = banc({ fiche, proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' }, motsCles: { avant: ['a'], apres: ['a', 'b'] } }, applique: null, porteursNouveaux: {} } } });
  const vue = await b.approbation.examiner('prop-1');
  assert.equal(vue.proposition.id, 'prop-1');
  assert.equal(vue.actuelle.contact, 'autre@b.org');
  assert.deepEqual(vue.bouscules, ['contact']);
  assert.equal(vue.ficheDisparue, false);
  assert.ok(!JSON.stringify(vue.actuelle).includes('secret') && !('statutFiche' in vue.actuelle) && !('id' in vue.actuelle));
  assert.equal(await b.approbation.examiner('autre'), null);
  const nouvelle = await banc().approbation.examiner('prop-1');
  assert.equal(nouvelle.actuelle, null);
  assert.deepEqual(nouvelle.bouscules, []);
});

test('la source de données sait vider sa mémoire', async () => {
  const { creerSource } = require('../api/export');
  let appels = 0;
  const source = creerSource({ lire: async () => { appels++; return { ressources: [], porteurs: [] }; } });
  await source(); await source();
  assert.equal(appels, 1);
  source.vider();
  await source();
  assert.equal(appels, 2);
});

test("une panne de lecture ne laisse pas la proposition verrouillée", async () => {
  let premier = true;
  const b = banc({ pannes: { lireProposition: () => { if (premier) { premier = false; return new Error('Notion en panne'); } return null; } } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'notion' });
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true });
});
