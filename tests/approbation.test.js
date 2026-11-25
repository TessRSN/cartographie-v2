const test = require('node:test');
const assert = require('node:assert/strict');
const { creerApprobation } = require('../lib/approbation');
const { PROP } = require('../lib/notion');

const APPROBATEUR = 'tess@exemple.ca';
const PNG_ESSAI = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const OPTIONS = { typePrincipal: ['Logiciel ou application'], secondType: [], etat: ['Actif', 'Archivé'], portee: ['Le Québec'] };
const NOUVELLE = { nom: { apres: 'Outil X' }, typePrincipal: { apres: 'Logiciel ou application' }, phrase: { apres: 'Une phrase.' }, lien: { apres: 'https://x.org' } };

// Banc d'essai : tout ce qui touche Notion, les courriels et le géocodage est factice et noté.
function banc({ proposition = {}, fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'a@b.org', porteurIds: [] }, pannes = {}, approbateurs = [APPROBATEUR], lecteurs = [], equipe = [{ nom: 'Tess Berthier', courriel: APPROBATEUR, role: 'administration' }], fichesExistantes = {}, porteurs = [], lent = 0, verrous, partage, avecVersions = false } = {}) {
  const appels = partage ? partage.appels : [];
  const noter = (nom, args) => { appels.push({ nom, args }); if (pannes[nom]) { const e = pannes[nom]; if (typeof e === 'function') { const r = e(); if (r) throw r; } else throw e; } };
  const prop = partage ? partage.prop : {
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
    // Toute personne active de l'équipe, lecture seule comprise ; seuls les autres rôles décident.
    async estApprobateur(c) { return approbateurs.includes(c) || lecteurs.includes(c); },
    async peutDecider(c) { return approbateurs.includes(c); },
    async equipe() { return equipe; },
    async marquerVerification(id) { noter('marquerVerification', id); prop.statut = 'verification'; },
    async ecrireAvis(id, avis) {
      if (lent) await new Promise((r) => setTimeout(r, lent));
      noter('ecrireAvis', { id, ...avis });
      prop.contenu = { ...prop.contenu, avis: [...((prop.contenu && prop.contenu.avis) || []).filter((a) => a.courriel !== avis.courriel), avis] };
      return prop.contenu.avis;
    },
    async lireProposition(id) { noter('lireProposition', id); return id === prop.id ? { ...prop } : null; },
    async marquerDecision(id, d) { noter('marquerDecision', { id, ...d }); prop.statut = d.statut; },
    async lierFiche(id, ficheId) { noter('lierFiche', { id, ficheId }); prop.ficheId = ficheId; },
  };
  const courriels = {
    async approuvee(m) { noter('courriel.approuvee', m); return { envoye: !pannes.courriel }; },
    async refusee(m) { noter('courriel.refusee', m); return { envoye: !pannes.courriel }; },
  };
  const approbation = creerApprobation({
    notion, propositions, courriels,
    geocoder: async (adresse) => { noter('geocoder', adresse); return { latitude: 45.5, longitude: -73.5 }; },
    fichiers: {
      async telecharger(url) { noter('telecharger', url); return PNG_ESSAI; },
      async deposer(f) { noter('deposer', f.nom); return 'depot-9'; },
      proprieteFichier: (id, nom) => ({ files: [{ type: 'file_upload', file_upload: { id }, name: nom }] }),
    },
    viderMemoire: () => noter('viderMemoire'),
    idParAdresse: async () => ({ 'cohorte-x': 'fiche-1', 'outil-x': 'fiche-neuve', cartagene: 'fiche-c' }),
    maintenant: () => Date.UTC(2026, 10, 24, 15),
    journal: () => {},
    verrous,
    attendre: () => new Promise((r) => setTimeout(r, 5)),
    // L'historique des versions, factice et noté comme le reste ; absent par défaut, comme avant le lot 2.
    versions: avecVersions ? { async ecrire(v) { noter('versions.ecrire', v); return { ecrite: true, numero: 2 }; } } : undefined,
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
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true, genre: 'nouvelle', nom: 'Outil X' });
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
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true, genre: 'nouvelle', nom: 'Outil X' });
  assert.equal(b.de('creerFiche').length, 1);
});

test('deux approbations lancées ensemble : une seule écriture', async () => {
  const b = banc({ lent: 20 });
  const resultats = await Promise.all([approuver(b), approuver(b)]);
  assert.deepEqual(resultats.map((r) => r.ok).sort(), [false, true]);
  assert.equal(resultats.find((r) => !r.ok).code, 'occupee');
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
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-1', courriel: true, genre: 'modification', nom: 'Cohorte X' });
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
  assert.deepEqual(await approuver(banc({ pannes: { courriel: true } })), { ok: true, ficheId: 'fiche-neuve', courriel: false, genre: 'nouvelle', nom: 'Outil X' });
});

test('un refus exige un commentaire, enregistre la décision et prévient le proposant', async () => {
  const sans = banc();
  assert.equal((await sans.approbation.refuser({ propositionId: 'prop-1', commentaire: '   ', approbateur: APPROBATEUR })).code, 'invalide');
  assert.equal(sans.de('marquerDecision').length, 0);
  const b = banc();
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: ' Hors du périmètre. ', approbateur: APPROBATEUR }), { ok: true, courriel: true, genre: 'nouvelle', titre: 'Nouvelle : Outil X' });
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
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true, genre: 'nouvelle', nom: 'Outil X' });
});

// Verrou partagé factice, comme celui du stockage clé-valeur.
function verrousPartages() {
  const pris = new Set();
  return { async prendreVerrou(nom) { if (pris.has(nom)) return false; pris.add(nom); return true; }, async rendreVerrou(nom) { pris.delete(nom); } };
}

test('deux instances du serveur qui approuvent en même temps : une seule écriture', async () => {
  const verrous = verrousPartages();
  const a = banc({ lent: 20, verrous });
  const b = banc({ lent: 20, verrous, partage: a });
  const resultats = await Promise.all([approuver(a), approuver(b)]);
  assert.deepEqual(resultats.map((r) => r.ok).sort(), [false, true]);
  assert.equal(resultats.find((r) => !r.ok).code, 'occupee');
  assert.equal(a.de('creerFiche').length, 1);
  assert.equal(a.de('marquerDecision').length, 1);
  assert.equal(a.de('courriel.approuvee').length, 1);
});

test('approuver et refuser en même temps sur deux instances : un seul geste passe', async () => {
  const verrous = verrousPartages();
  const a = banc({ lent: 20, verrous });
  const b = banc({ verrous, partage: a });
  const resultats = await Promise.all([approuver(a), b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non', approbateur: APPROBATEUR })]);
  assert.equal(resultats.filter((r) => r.ok).length, 1);
  assert.equal(a.de('marquerDecision').length, 1);
});

test('le verrou est rendu après le geste, réussi ou non', async () => {
  const verrous = verrousPartages();
  const b = banc({ verrous, pannes: { creerFiche: new Error('panne') } });
  assert.equal((await approuver(b)).code, 'notion');
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true);
});

test('une fiche écartée depuis la proposition n\'est pas republiée', async () => {
  const fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'a@b.org', porteurIds: [], statutFiche: 'Écartée' };
  const proposition = { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} } };
  const b = banc({ fiche, proposition });
  assert.deepEqual(await approuver(b), { ok: false, code: 'fiche-introuvable' });
  assert.equal(b.de('mettreAJourFiche').length + b.de('marquerDecision').length, 0);
  assert.equal((await b.approbation.examiner('prop-1')).ficheDisparue, true);
});

test('la fiche créée est reliée à la proposition aussitôt, avant la décision', async () => {
  const b = banc();
  await approuver(b);
  const ordre = b.appels.map((x) => x.nom).filter((n) => ['creerFiche', 'lierFiche', 'marquerDecision'].includes(n));
  assert.deepEqual(ordre, ['creerFiche', 'lierFiche', 'marquerDecision']);
  assert.deepEqual(b.de('lierFiche')[0], { id: 'prop-1', ficheId: 'fiche-neuve' });
});

test('seconde tentative avec un nom corrigé : la fiche déjà créée est mise à jour, pas recréée', async () => {
  let premier = true;
  const b = banc({ pannes: { marquerDecision: () => { if (premier) { premier = false; return new Error('panne'); } return null; } } });
  assert.equal((await approuver(b)).code, 'notion');
  assert.deepEqual(await approuver(b, { corrections: { nom: 'Outil X corrigé' } }), { ok: true, ficheId: 'fiche-neuve', courriel: true, genre: 'nouvelle', nom: 'Outil X corrigé' });
  assert.equal(b.de('creerFiche').length, 1);
  const [{ id, p }] = b.de('mettreAJourFiche');
  assert.equal(id, 'fiche-neuve');
  assert.equal(p[PROP.nom].title[0].text.content, 'Outil X corrigé');
});

test('une nouvelle ressource qui existe déjà (même nom, même lien) est signalée comme doublon', async () => {
  const b = banc({ fichesExistantes: { 'Outil X|https://x.org': 'fiche-ancienne' } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'doublon' });
  assert.equal(b.de('creerFiche').length + b.de('mettreAJourFiche').length + b.de('marquerDecision').length + b.de('courriel.approuvee').length, 0);
});

test('une proposition au contenu illisible est invalide, rien n\'est écrit', async () => {
  for (const contenu of [null, { propose: null }, { propose: 'x' }, { propose: { nom: null } }]) {
    const b = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', contenu } });
    const retour = await approuver(b);
    assert.equal(retour.code, 'invalide', JSON.stringify(contenu));
    assert.equal(b.de('mettreAJourFiche').length + b.de('marquerDecision').length, 0);
  }
});

test('un porteur nommé comme une méthode d\'objet ne reçoit pas une adresse fantôme', async () => {
  const contenu = { propose: { ...NOUVELLE, porteurs: { apres: ['constructor'] } }, applique: null, porteursNouveaux: {} };
  const b = banc({ proposition: { contenu } });
  await approuver(b);
  assert.deepEqual(b.de('creerPorteur'), [{ nom: 'constructor', adresse: '' }]);
  assert.equal(b.de('geocoder').length, 0);
});

test('le logo proposé est recopié dans la fiche à l\'approbation', async () => {
  const b = banc({ proposition: { logoPropose: { nom: 'logo.png', url: 'https://notion.exemple/x' } } });
  assert.equal((await approuver(b)).ok, true);
  assert.deepEqual(b.de('telecharger'), ['https://notion.exemple/x']);
  assert.deepEqual(b.de('creerFiche')[0][PROP.logoFichier], { files: [{ type: 'file_upload', file_upload: { id: 'depot-9' }, name: 'logo.png' }] });
});

test('une modification qui ne porte que sur le logo est approuvable', async () => {
  const b = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', logoPropose: { nom: 'logo.png', url: 'https://notion.exemple/x' }, contenu: { propose: {}, applique: null, porteursNouveaux: {}, logoFichier: 'logo.png' } } });
  assert.equal((await approuver(b)).ok, true);
  assert.ok(PROP.logoFichier in b.de('mettreAJourFiche')[0].p);
});

test("l'approbateur peut écarter le logo proposé ; sans logo, rien n'est téléchargé", async () => {
  const b = banc({ proposition: { logoPropose: { nom: 'logo.png', url: 'https://notion.exemple/x' } } });
  await approuver(b, { sansLogo: true });
  assert.equal(b.de('telecharger').length, 0);
  assert.ok(!(PROP.logoFichier in b.de('creerFiche')[0]));
  const sans = banc();
  await approuver(sans);
  assert.equal(sans.de('telecharger').length, 0);
});

test('un logo illisible fait échouer l\'approbation sans écrire la fiche', async () => {
  const b = banc({ proposition: { logoPropose: { nom: 'logo.png', url: 'https://notion.exemple/x' } }, pannes: { telecharger: new Error('adresse expirée') } });
  assert.deepEqual(await approuver(b), { ok: false, code: 'notion' });
  assert.equal(b.de('creerFiche').length + b.de('marquerDecision').length, 0);
});

test("une nouvelle adresse de logo, approuvée sans image, retire l'ancien fichier de la fiche", async () => {
  const b = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { logo: { avant: null, apres: 'https://exemple.org/nouveau.png' } }, applique: null, porteursNouveaux: {} } } });
  assert.equal((await approuver(b)).ok, true);
  assert.deepEqual(b.de('mettreAJourFiche')[0].p[PROP.logoFichier], { files: [] });
  const autre = banc({ proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { phrase: { avant: 'Une phrase.', apres: 'Une autre phrase.' } }, applique: null, porteursNouveaux: {} } } });
  assert.equal((await approuver(autre)).ok, true);
  assert.ok(!(PROP.logoFichier in autre.de('mettreAJourFiche')[0].p));
});

test('modifier un lien entre fiches garde les liens vers des fiches qui ne sont pas publiques', async () => {
  const fiche = { id: 'fiche-1', nom: 'Cohorte X', porteurIds: [], reposeSur: ['fiche-c', 'fiche-cachee'], faitPartieDe: ['fiche-cachee-2'] };
  const b = banc({ fiche, proposition: { genre: 'modification', ficheId: 'fiche-1', contenu: { propose: { phrase: { avant: 'Une phrase.', apres: 'Une autre.' } }, applique: null, porteursNouveaux: {} } } });
  assert.equal((await approuver(b, { corrections: { reposeSur: ['cartagene', 'outil-x'] } })).ok, true);
  const ecrit = b.de('mettreAJourFiche')[0].p;
  assert.deepEqual(ecrit[PROP.reposeSur], { relation: [{ id: 'fiche-c' }, { id: 'fiche-neuve' }, { id: 'fiche-cachee' }] });
  assert.ok(!(PROP.faitPartieDe in ecrit));
});

// ─── Lot 1 du nouveau panneau : second regard, avis, rôles ───
const MAX = 'max@exemple.ca';
const CAM = 'cam@exemple.ca';
const EQUIPE = [{ nom: 'Tess Berthier', courriel: APPROBATEUR, role: 'administration' }, { nom: 'Max Lafrenière', courriel: MAX, role: 'approbation' }, { nom: 'Cam', courriel: CAM, role: 'lecture' }];
const enVerification = (b, extra = {}) => b.approbation.mettreEnVerification({ propositionId: 'prop-1', par: APPROBATEUR, ...extra });
const avis = (b, extra = {}) => b.approbation.donnerAvis({ propositionId: 'prop-1', par: APPROBATEUR, sens: 'favorable', commentaire: '', ...extra });
const ecritures = (b) => ['creerFiche', 'mettreAJourFiche', 'marquerDecision', 'marquerVerification', 'ecrireAvis', 'lierFiche', 'courriel.approuvee', 'courriel.refusee'].reduce((n, nom) => n + b.de(nom).length, 0);

test('une personne en lecture seule ne peut faire aucun geste, même en appelant le module directement', async () => {
  const b = banc({ lecteurs: [CAM], equipe: EQUIPE });
  const refus = { ok: false, code: 'non-approbateur' };
  assert.deepEqual(await approuver(b, { approbateur: CAM }), refus);
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non', approbateur: CAM }), refus);
  assert.deepEqual(await enVerification(b, { par: CAM }), refus);
  assert.deepEqual(await avis(b, { par: CAM }), refus);
  assert.deepEqual(await enVerification(b, { par: 'intrus@exemple.org' }), refus);
  assert.deepEqual(await avis(b, { par: 'intrus@exemple.org' }), refus);
  assert.equal(b.appels.length, 0);
});

test('demander un second regard : la proposition passe en vérification, rien d\'autre ne bouge', async () => {
  const verrous = verrousPartages();
  const b = banc({ verrous });
  assert.deepEqual(await enVerification(b), { ok: true, genre: 'nouvelle', titre: 'Nouvelle : Outil X' });
  assert.deepEqual(b.de('marquerVerification'), ['prop-1']);
  assert.equal(b.prop.statut, 'verification');
  assert.equal(ecritures(b), 1, 'ni fiche, ni décision, ni courriel');
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true, 'le verrou est rendu');
});

test('second regard : déjà en vérification, rien n\'est réécrit ; tranchée ou introuvable, refusé', async () => {
  const deja = banc({ proposition: { statut: 'verification' } });
  assert.deepEqual(await enVerification(deja), { ok: true, inchangee: true });
  assert.equal(ecritures(deja), 0);
  for (const statut of ['approuvee', 'refusee', null]) {
    const b = banc({ proposition: { statut } });
    assert.deepEqual(await enVerification(b), { ok: false, code: 'deja-tranchee' }, String(statut));
    assert.equal(ecritures(b), 0);
  }
  assert.deepEqual(await enVerification(banc(), { propositionId: 'autre' }), { ok: false, code: 'introuvable' });
  const panne = banc({ pannes: { marquerVerification: new Error('Notion en panne') } });
  assert.deepEqual(await enVerification(panne), { ok: false, code: 'notion' });
});

test('second regard et approbation en même temps sur deux instances : un seul geste passe', async () => {
  const verrous = verrousPartages();
  const a = banc({ lent: 20, verrous });
  const b = banc({ verrous, partage: a });
  const resultats = await Promise.all([approuver(a), enVerification(b)]);
  assert.deepEqual(resultats.map((r) => r.ok), [true, false]);
  assert.equal(resultats[1].code, 'occupee');
  assert.equal(a.de('marquerVerification').length, 0);
});

test('donner un avis : enregistré au nom de la personne, sur une proposition en attente ou en vérification', async () => {
  for (const statut of ['attente', 'verification']) {
    const b = banc({ proposition: { statut }, approbateurs: [APPROBATEUR, MAX], equipe: EQUIPE });
    const retour = await avis(b, { par: MAX, sens: 'defavorable', commentaire: '  Le lien   est mort.  ' });
    assert.equal(retour.ok, true, statut);
    const attendu = { courriel: MAX, nom: 'Max Lafrenière', sens: 'defavorable', commentaire: 'Le lien est mort.', le: '2026-11-24T15:00:00.000Z' };
    assert.deepEqual(b.de('ecrireAvis'), [{ id: 'prop-1', ...attendu }]);
    assert.deepEqual(retour.avis, [attendu]);
    assert.equal(b.prop.statut, statut, 'un avis ne décide rien');
    assert.equal(ecritures(b), 1);
  }
});

test('un nouvel avis de la même personne remplace le sien, sans effacer celui des autres', async () => {
  const b = banc({ approbateurs: [APPROBATEUR, MAX], equipe: EQUIPE });
  await avis(b);
  await avis(b, { par: MAX, sens: 'defavorable' });
  const retour = await avis(b, { sens: 'defavorable', commentaire: 'Finalement non.' });
  assert.deepEqual(retour.avis.map((a) => [a.courriel, a.sens, a.commentaire]), [[MAX, 'defavorable', ''], [APPROBATEUR, 'defavorable', 'Finalement non.']]);
});

test('aucun avis sur une proposition approuvée, refusée ou introuvable', async () => {
  for (const statut of ['approuvee', 'refusee']) {
    const b = banc({ proposition: { statut } });
    assert.deepEqual(await avis(b), { ok: false, code: 'deja-tranchee' }, statut);
    assert.equal(ecritures(b), 0);
  }
  assert.deepEqual(await avis(banc(), { propositionId: 'autre' }), { ok: false, code: 'introuvable' });
});

test('un avis sans sens reconnu, ou un commentaire trop long, est refusé sans écriture ni verrou gardé', async () => {
  const verrous = verrousPartages();
  const b = banc({ verrous });
  for (const sens of ['', 'peut-être', null, undefined, ['favorable']]) {
    const retour = await avis(b, { sens });
    assert.equal(retour.ok, false);
    assert.equal(retour.code, 'invalide');
  }
  const long = await avis(b, { commentaire: 'x'.repeat(1001) });
  assert.equal(long.code, 'invalide');
  assert.ok(long.erreurs.commentaire);
  assert.equal(ecritures(b), 0);
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true);
});

test('deux avis donnés en même temps sur deux instances : les deux sont gardés', async () => {
  const verrous = verrousPartages();
  const a = banc({ lent: 15, verrous, approbateurs: [APPROBATEUR, MAX], equipe: EQUIPE });
  const b = banc({ lent: 15, verrous, approbateurs: [APPROBATEUR, MAX], equipe: EQUIPE, partage: a });
  const resultats = await Promise.all([avis(a), avis(b, { par: MAX, sens: 'defavorable' })]);
  assert.deepEqual(resultats.map((r) => r.ok), [true, true]);
  assert.deepEqual(a.prop.contenu.avis.map((x) => x.courriel).sort(), [MAX, APPROBATEUR].sort());
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true);
});

test('un avis donné pendant un geste qui dure : « occupee » après quelques essais, rien d\'écrit', async () => {
  const verrous = verrousPartages();
  await verrous.prendreVerrou('proposition:prop-1');
  const b = banc({ verrous });
  assert.deepEqual(await avis(b), { ok: false, code: 'occupee' });
  assert.equal(ecritures(b), 0);
});

test('si Notion échoue pendant l\'avis : code « notion », verrou rendu', async () => {
  const verrous = verrousPartages();
  const b = banc({ verrous, pannes: { ecrireAvis: new Error('Notion en panne') } });
  assert.deepEqual(await avis(b), { ok: false, code: 'notion' });
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true);
});

test('une proposition en vérification s\'approuve et se refuse comme une proposition en attente', async () => {
  const b = banc({ proposition: { statut: 'verification' } });
  assert.deepEqual(await approuver(b), { ok: true, ficheId: 'fiche-neuve', courriel: true, genre: 'nouvelle', nom: 'Outil X' });
  assert.equal(b.de('creerFiche').length, 1);
  assert.equal(b.de('marquerDecision')[0].statut, 'approuvee');
  assert.deepEqual(await approuver(b), { ok: false, code: 'deja-tranchee' }, 'pas appliquée deux fois');
  const c = banc({ proposition: { statut: 'verification' } });
  assert.deepEqual(await c.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Doublon.', approbateur: APPROBATEUR }), { ok: true, courriel: true, genre: 'nouvelle', titre: 'Nouvelle : Outil X' });
  assert.equal(c.de('marquerDecision')[0].statut, 'refusee');
});

test('examiner signale aussi les champs bousculés d\'une proposition en vérification', async () => {
  const fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'autre@b.org', porteurIds: [], statutFiche: 'Publiée' };
  const contenu = { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} };
  const b = banc({ fiche, proposition: { genre: 'modification', ficheId: 'fiche-1', statut: 'verification', contenu } });
  assert.deepEqual((await b.approbation.examiner('prop-1')).bouscules, ['contact']);
  const tranchee = banc({ fiche, proposition: { genre: 'modification', ficheId: 'fiche-1', statut: 'approuvee', contenu } });
  assert.deepEqual((await tranchee.approbation.examiner('prop-1')).bouscules, []);
});

// ─── Historique des versions ───
const MODIFICATION = { genre: 'modification', ficheId: 'fiche-1', titre: 'Modification : Cohorte X', contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' }, nom: { avant: 'Cohorte X', apres: 'Cohorte X' } }, applique: null, porteursNouveaux: {} } };

test('approuver une modification écrit une version « Proposition », reliée à la proposition, après la fiche', async () => {
  const b = banc({ proposition: MODIFICATION, avecVersions: true });
  assert.equal((await approuver(b)).ok, true);
  assert.deepEqual(b.de('versions.ecrire'), [{
    ficheId: 'fiche-1', nom: 'Cohorte X', source: 'proposition', par: APPROBATEUR, propositionId: 'prop-1',
    changements: { contact: { avant: 'a@b.org', apres: 'c@d.org' } },
  }]);
  const ordre = b.appels.map((a) => a.nom).filter((n) => ['mettreAJourFiche', 'versions.ecrire', 'marquerDecision'].includes(n));
  assert.deepEqual(ordre, ['mettreAJourFiche', 'versions.ecrire', 'marquerDecision']);
});

test('approuver une nouvelle ressource écrit une version « Création » avec tout ce qui est publié', async () => {
  const b = banc({ avecVersions: true });
  assert.equal((await approuver(b)).ok, true);
  const [version] = b.de('versions.ecrire');
  assert.equal(b.de('versions.ecrire').length, 1);
  assert.equal(version.source, 'creation');
  assert.equal(version.ficheId, 'fiche-neuve');
  assert.equal(version.propositionId, 'prop-1');
  assert.equal(version.par, APPROBATEUR);
  assert.deepEqual(version.changements, {
    typePrincipal: { apres: 'Logiciel ou application' }, nom: { apres: 'Outil X' }, phrase: { apres: 'Une phrase.' }, lien: { apres: 'https://x.org' }, etat: { apres: 'Actif' },
  });
});

test('une approbation qui ne change aucun champ de la fiche n\'écrit pas de version', async () => {
  const b = banc({ avecVersions: true, proposition: { ...MODIFICATION, contenu: { propose: { contact: { avant: 'x@y.org', apres: 'a@b.org' } }, applique: null, porteursNouveaux: {} } } });
  assert.equal((await approuver(b)).ok, true);
  assert.equal(b.de('mettreAJourFiche').length, 1);
  assert.equal(b.de('versions.ecrire').length, 0);
});

test('l\'approbation réussit même si la version ne peut pas s\'écrire', async () => {
  for (const proposition of [MODIFICATION, {}]) {
    const b = banc({ proposition, avecVersions: true, pannes: { 'versions.ecrire': new Error('base Versions en panne') } });
    const retour = await approuver(b);
    assert.equal(retour.ok, true);
    assert.equal(retour.courriel, true);
    assert.equal(b.de('marquerDecision')[0].statut, 'approuvee');
    assert.equal(b.de('courriel.approuvee').length, 1);
    assert.equal(retour.historique, false, 'le geste dit que l\'historique n\'a pas pu être écrit');
  }
});

test('une approbation dont la version s\'écrit le dit aussi', async () => {
  const b = banc({ proposition: MODIFICATION, avecVersions: true });
  assert.equal((await approuver(b)).historique, true);
});

test('la décision échoue puis réussit : la fiche a changé une fois, une seule version', async () => {
  const fiche = { id: 'fiche-1', nom: 'Cohorte X', contact: 'a@b.org', porteurIds: [] };
  let premier = true;
  const b = banc({ fiche, proposition: MODIFICATION, avecVersions: true, pannes: {
    mettreAJourFiche: () => { fiche.contact = 'c@d.org'; return null; },
    marquerDecision: () => { if (premier) { premier = false; return new Error('Notion en panne'); } return null; },
  } });
  assert.equal((await approuver(b)).code, 'notion');
  assert.equal((await approuver(b)).ok, true);
  assert.equal(b.de('versions.ecrire').length, 1);
});

test('la fiche visée est verrouillée pendant l\'approbation : occupée, rien ne s\'écrit ; libre ensuite', async () => {
  const verrous = verrousPartages();
  await verrous.prendreVerrou('fiche:fiche-1');
  const b = banc({ proposition: MODIFICATION, avecVersions: true, verrous });
  assert.deepEqual(await approuver(b), { ok: false, code: 'occupee' });
  assert.equal(b.de('mettreAJourFiche').length + b.de('marquerDecision').length + b.de('versions.ecrire').length, 0);
  assert.equal(await verrous.prendreVerrou('proposition:prop-1'), true, 'le verrou de la proposition est rendu');
  await verrous.rendreVerrou('proposition:prop-1');
  await verrous.rendreVerrou('fiche:fiche-1');
  assert.equal((await approuver(b)).ok, true);
  assert.equal(await verrous.prendreVerrou('fiche:fiche-1'), true, 'le verrou de la fiche est rendu');
});

// ─── Modifications de l'équipe : l'Administration seule tranche, sans courriel ───
const MAXIME = 'maxime@exemple.ca';
const DE_L_EQUIPE = {
  genre: 'equipe', ficheId: 'fiche-1', courriel: MAXIME, nomProposant: 'Maxime Lafrenière', lienAvecRessource: 'aucun', titre: "Modification de l'équipe : Cohorte X",
  contenu: { propose: { contact: { avant: 'a@b.org', apres: 'c@d.org' } }, applique: null, porteursNouveaux: {} },
};
const EQUIPE_4A = [{ nom: 'Tess Berthier', courriel: APPROBATEUR, role: 'administration' }, { nom: 'Maxime Lafrenière', courriel: MAXIME, role: 'approbation' }];
const bancEquipe = (options = {}) => banc({ proposition: DE_L_EQUIPE, approbateurs: [APPROBATEUR, MAXIME], equipe: EQUIPE_4A, avecVersions: true, ...options });

test('une modification de l\'équipe : une personne en Approbation ne peut ni l\'approuver ni la refuser, rien n\'est écrit', async () => {
  const b = bancEquipe();
  assert.deepEqual(await approuver(b, { approbateur: MAXIME }), { ok: false, code: 'role' });
  assert.deepEqual(await b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non.', approbateur: MAXIME }), { ok: false, code: 'role' });
  for (const nom of ['mettreAJourFiche', 'versions.ecrire', 'marquerDecision', 'courriel.approuvee', 'courriel.refusee']) assert.equal(b.de(nom).length, 0, nom);
  assert.equal(b.prop.statut, 'attente');
  // Le verrou est rendu : l'Administration peut trancher ensuite.
  assert.equal((await approuver(b)).ok, true);
});

test('une modification de l\'équipe approuvée par l\'Administration : fiche changée, version « Proposition », aucun courriel, jamais « Vérifiée »', async () => {
  const b = bancEquipe();
  const retour = await approuver(b);
  assert.equal(retour.ok, true);
  assert.equal(retour.courriel, false);
  assert.equal(retour.historique, true);
  const [ecrit] = b.de('mettreAJourFiche');
  assert.equal(ecrit.id, 'fiche-1');
  assert.deepEqual(ecrit.p[PROP.contact], { email: 'c@d.org' });
  assert.ok(!Object.hasOwn(ecrit.p, PROP.verifieeLe) && !Object.hasOwn(ecrit.p, PROP.verifieePar));
  assert.deepEqual(b.de('versions.ecrire'), [{
    ficheId: 'fiche-1', nom: 'Cohorte X', source: 'proposition', par: APPROBATEUR, propositionId: 'prop-1',
    changements: { contact: { avant: 'a@b.org', apres: 'c@d.org' } },
  }]);
  assert.equal(b.de('marquerDecision')[0].statut, 'approuvee');
  assert.equal(b.de('marquerDecision')[0].approbateur, APPROBATEUR);
  assert.equal(b.de('courriel.approuvee').length + b.de('courriel.refusee').length, 0);
  assert.equal(b.de('creerFiche').length, 0);
});

test('une modification de l\'équipe ne marque jamais la fiche « vérifiée », même si elle se dit « responsable »', async () => {
  for (const lienAvecRessource of ['responsable', 'jy-travaille']) {
    const b = bancEquipe({ proposition: { ...DE_L_EQUIPE, lienAvecRessource, courriel: 'dehors@exemple.org' } });
    assert.equal((await approuver(b)).ok, true);
    const [ecrit] = b.de('mettreAJourFiche');
    assert.ok(!Object.hasOwn(ecrit.p, PROP.verifieeLe) && !Object.hasOwn(ecrit.p, PROP.verifieePar), lienAvecRessource);
    assert.equal(b.de('courriel.approuvee').length, 0);
  }
});

test('une modification de l\'équipe refusée par l\'Administration : commentaire obligatoire et gardé, aucun courriel', async () => {
  const b = bancEquipe();
  const sans = await b.approbation.refuser({ propositionId: 'prop-1', commentaire: '  ', approbateur: APPROBATEUR });
  assert.equal(sans.code, 'invalide');
  assert.ok(sans.erreurs.commentaire);
  const retour = await b.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Le contact est le bon.', approbateur: APPROBATEUR });
  assert.equal(retour.ok, true);
  assert.equal(retour.courriel, false);
  assert.deepEqual(b.de('marquerDecision').map((d) => [d.statut, d.commentaire]), [['refusee', 'Le contact est le bon.']]);
  assert.equal(b.de('courriel.refusee').length + b.de('courriel.approuvee').length, 0);
  assert.equal(b.de('mettreAJourFiche').length, 0);
});

test('une modification de l\'équipe : le second regard et les avis restent ouverts au rôle Approbation', async () => {
  const b = bancEquipe();
  assert.equal((await b.approbation.mettreEnVerification({ propositionId: 'prop-1', par: MAXIME })).ok, true);
  assert.equal(b.prop.statut, 'verification');
  assert.equal((await b.approbation.donnerAvis({ propositionId: 'prop-1', par: MAXIME, sens: 'favorable', commentaire: '' })).ok, true);
  assert.equal(b.de('ecrireAvis').length, 1);
});

test('une modification de l\'équipe sur une fiche disparue ou écartée ne s\'approuve pas', async () => {
  const b = bancEquipe({ fiche: { id: 'fiche-1', nom: 'Cohorte X', statutFiche: 'Écartée', porteurIds: [] } });
  assert.equal((await approuver(b)).code, 'fiche-introuvable');
  assert.equal(b.de('mettreAJourFiche').length, 0);
});

test('les propositions du public ne changent pas : une personne en Approbation les tranche, et le courriel part', async () => {
  const publique = { ...DE_L_EQUIPE, genre: 'modification', courriel: 'pat@exemple.org', nomProposant: 'Pat', titre: 'Modification : Cohorte X' };
  const b = bancEquipe({ proposition: publique });
  const retour = await approuver(b, { approbateur: MAXIME });
  assert.equal(retour.ok, true);
  assert.equal(retour.courriel, true);
  assert.deepEqual(b.de('courriel.approuvee').map((m) => m.a), ['pat@exemple.org']);
  const c = bancEquipe({ proposition: publique });
  const refus = await c.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non.', approbateur: MAXIME });
  assert.equal(refus.ok, true);
  assert.equal(refus.courriel, true);
  assert.deepEqual(c.de('courriel.refusee').map((m) => m.a), ['pat@exemple.org']);
});

test('les gestes réussis disent sur quoi ils portaient, pour le journal de l\'équipe', async () => {
  const b = bancEquipe();
  assert.deepEqual(await b.approbation.mettreEnVerification({ propositionId: 'prop-1', par: MAXIME }), { ok: true, genre: 'equipe', titre: "Modification de l'équipe : Cohorte X" });
  const retour = await approuver(b);
  assert.equal(retour.genre, 'equipe');
  assert.equal(retour.nom, 'Cohorte X');
  const c = bancEquipe();
  const refus = await c.approbation.refuser({ propositionId: 'prop-1', commentaire: 'Non.', approbateur: APPROBATEUR });
  assert.equal(refus.genre, 'equipe');
  assert.equal(refus.titre, "Modification de l'équipe : Cohorte X");
});
