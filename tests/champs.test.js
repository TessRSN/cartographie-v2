const test = require('node:test');
const assert = require('node:assert/strict');
const { CHAMPS, OBLIGATOIRES, LIENS_AVEC_RESSOURCE, nettoyer, calculerChangements, champsBouscules, fusionner } = require('../public/js/champs.js');
const { PROP } = require('../lib/notion');

const options = {
  typePrincipal: ['Jeu de données, cohorte ou biobanque', 'Logiciel ou application'],
  secondType: ['Jeu de données, cohorte ou biobanque', 'Logiciel ou application'],
  portee: ['Le Québec', 'Le Canada', 'International'],
  frais: ['Gratuit', 'Payant'],
  langues: ['Français', 'Anglais'],
  etat: ['Actif', 'Archivé'],
};
const base = { nom: 'Cohorte X', typePrincipal: 'Logiciel ou application', phrase: 'Une phrase.', lien: 'https://exemple.org' };
const proposant = (saisie, genre = 'nouvelle') => nettoyer(saisie, { role: 'proposant', options, genre });

test('chaque champ du catalogue correspond à une colonne lue dans Notion', () => {
  const cles = CHAMPS.map((c) => c.cle);
  assert.equal(new Set(cles).size, cles.length);
  for (const c of CHAMPS) {
    assert.ok(Object.hasOwn(PROP, c.cle === 'porteurs' ? 'porteurs' : c.cle), c.cle);
    assert.ok(['proposant', 'approbateur'].includes(c.role), c.cle);
    assert.ok(['commun', 'donnees', 'logiciel'].includes(c.section), c.cle);
  }
  for (const interdit of ['statutFiche', 'verifieeLe', 'verifieePar']) assert.ok(!cles.includes(interdit));
  assert.deepEqual(OBLIGATOIRES, ['nom', 'typePrincipal', 'phrase', 'lien']);
  assert.deepEqual(LIENS_AVEC_RESSOURCE, ['responsable', 'jy-travaille', 'aucun']);
  assert.deepEqual(CHAMPS.filter((c) => c.section === 'donnees').map((c) => c.cle).sort(), ['collecte', 'dictionnaire', 'jumelage', 'periode', 'population', 'typesDonnees']);
  assert.deepEqual(CHAMPS.filter((c) => c.section === 'logiciel').map((c) => c.cle).sort(), ['depotCode', 'licence']);
  assert.deepEqual(CHAMPS.filter((c) => c.role === 'approbateur').map((c) => c.cle).sort(), ['donneAccesA', 'etat', 'faitPartieDe', 'profilResponsable', 'remplace', 'reposeSur']);
});

test('une saisie valide ressort rognée, sans erreur', () => {
  const { valeurs, erreurs } = proposant({ ...base, nom: '  Cohorte X ', motsCles: [' cancer ', 'Cancer', '', 'génomique'], contact: ' Info@Exemple.ORG ', jumelage: true });
  assert.deepEqual(erreurs, {});
  assert.equal(valeurs.nom, 'Cohorte X');
  assert.deepEqual(valeurs.motsCles, ['cancer', 'génomique']);
  assert.equal(valeurs.contact, 'info@exemple.org');
  assert.equal(valeurs.jumelage, true);
});

test("un champ inconnu ou réservé aux approbateurs disparaît de la saisie d'un proposant", () => {
  const { valeurs, erreurs } = proposant({ ...base, notesDeVeille: 'secret', statutFiche: 'Publiée', etat: 'Archivé', faitPartieDe: ['x'], __proto__: { y: 1 } });
  assert.deepEqual(erreurs, {});
  assert.deepEqual(Object.keys(valeurs).sort(), ['lien', 'nom', 'phrase', 'typePrincipal']);
});

test('un approbateur peut saisir les champs qui lui sont réservés', () => {
  const { valeurs, erreurs } = nettoyer({ etat: 'Archivé', faitPartieDe: ['cartagene'], profilResponsable: 'https://bottin.rsn.quebec/x' }, { role: 'approbateur', options, genre: 'modification' });
  assert.deepEqual(erreurs, {});
  assert.deepEqual(valeurs, { etat: 'Archivé', faitPartieDe: ['cartagene'], profilResponsable: 'https://bottin.rsn.quebec/x' });
});

test('une adresse web doit commencer par http:// ou https://', () => {
  for (const mauvais of ['javascript:alert(1)', 'exemple.org', 'ftp://x.org', 'https://a b.org', 'data:text/html,x']) {
    assert.ok(proposant({ ...base, lien: mauvais }).erreurs.lien, mauvais);
  }
  assert.ok(proposant({ ...base, doi: 'https://exemple.org/10.1/x' }).erreurs.doi);
  assert.deepEqual(proposant({ ...base, doi: 'https://doi.org/10.1/x' }).erreurs, {});
});

test('un choix fermé hors des valeurs existantes est refusé', () => {
  assert.ok(proposant({ ...base, portee: 'Mars' }).erreurs.portee);
  assert.ok(proposant({ ...base, langues: ['Français', 'Klingon'] }).erreurs.langues);
  assert.ok(proposant({ ...base, collecte: 'En cours' }).erreurs.collecte, 'liste inconnue du serveur : refus');
  assert.deepEqual(proposant({ ...base, portee: 'Le Québec', langues: ['Anglais'] }).erreurs, {});
});

test('une liste ouverte refuse les virgules, les valeurs trop longues et plus de 30 valeurs', () => {
  assert.ok(proposant({ ...base, motsCles: ['a, b'] }).erreurs.motsCles);
  assert.ok(proposant({ ...base, normes: ['x'.repeat(101)] }).erreurs.normes);
  assert.ok(proposant({ ...base, outils: Array.from({ length: 31 }, (_, i) => `o${i}`) }).erreurs.outils);
  assert.ok(proposant({ ...base, porteurs: 'CHUM' }).erreurs.porteurs);
  assert.ok(proposant({ ...base, porteurs: [42] }).erreurs.porteurs);
});

test('un texte trop long ou qui n\'est pas du texte est refusé', () => {
  assert.ok(proposant({ ...base, phrase: 'x'.repeat(301) }).erreurs.phrase);
  assert.ok(proposant({ ...base, description: 'x'.repeat(6001) }).erreurs.description);
  assert.ok(proposant({ ...base, responsable: { a: 1 } }).erreurs.responsable);
  assert.ok(proposant({ ...base, jumelage: 'oui' }).erreurs.jumelage);
  assert.ok(proposant({ ...base, contact: 'pas une adresse' }).erreurs.contact);
  assert.deepEqual(proposant({ ...base, description: 'x'.repeat(6000) }).erreurs, {});
});

test('un texte court tient sur une ligne, une description garde ses sauts de ligne', () => {
  const { valeurs } = proposant({ ...base, responsable: 'Marie\nCurie', description: 'Un.\n\nDeux.' });
  assert.equal(valeurs.responsable, 'Marie Curie');
  assert.equal(valeurs.description, 'Un.\n\nDeux.');
});

test('une nouvelle ressource exige nom, type, phrase et lien', () => {
  const { erreurs } = proposant({ nom: 'X', lien: 'https://exemple.org' });
  assert.deepEqual(Object.keys(erreurs).sort(), ['phrase', 'typePrincipal']);
  assert.ok(proposant({ ...base, nom: '   ' }).erreurs.nom);
});

test("une modification n'exige rien, mais ne vide pas un champ obligatoire", () => {
  assert.deepEqual(proposant({ contact: 'a@b.org' }, 'modification').erreurs, {});
  assert.ok(proposant({ nom: '' }, 'modification').erreurs.nom);
  assert.deepEqual(proposant({ contact: '', motsCles: [] }, 'modification'), { valeurs: { contact: null, motsCles: [] }, erreurs: {} });
});

test('« à remplir par le RSN » ne garde que le nom, le lien et la description', () => {
  assert.deepEqual(proposant({ nom: 'X' }, 'rsn'), { valeurs: { nom: 'X' }, erreurs: {} });
  const complet = proposant({ nom: 'X', lien: 'https://x.org', description: 'Quelques mots', phrase: 'ignorée', motsCles: ['a'] }, 'rsn');
  assert.deepEqual(Object.keys(complet.valeurs).sort(), ['description', 'lien', 'nom']);
  assert.ok(proposant({ lien: 'https://x.org' }, 'rsn').erreurs.nom);
});

test('une saisie qui n\'est pas un objet donne une erreur générale', () => {
  for (const mauvais of [null, 'x', [], 42]) assert.ok(proposant(mauvais).erreurs._);
});

test("calculerChangements reproduit l'exemple de la conception", () => {
  const avant = { nom: 'X', contact: 'ancien@exemple.org', normes: ['BIDS'], motsCles: ['a', 'b'], phrase: 'P' };
  const valeurs = { nom: 'X', contact: 'nouveau@exemple.org', normes: ['BIDS', 'NIfTI'], motsCles: ['b', 'a'], phrase: 'P' };
  assert.deepEqual(calculerChangements(avant, valeurs), {
    contact: { avant: 'ancien@exemple.org', apres: 'nouveau@exemple.org' },
    normes: { avant: ['BIDS'], apres: ['BIDS', 'NIfTI'] },
  });
});

test('vide, nul, liste vide et case décochée sont équivalents', () => {
  const avant = { contact: null, motsCles: [], jumelage: false, licence: '' };
  assert.deepEqual(calculerChangements(avant, { contact: '', motsCles: [], jumelage: false, licence: null }), {});
  assert.deepEqual(calculerChangements(avant, { jumelage: true }), { jumelage: { avant: false, apres: true } });
  assert.deepEqual(calculerChangements({ contact: 'a@b.org' }, { contact: null }), { contact: { avant: 'a@b.org', apres: null } });
});

test("pour une nouvelle ressource, seuls les champs remplis sont gardés, sans « avant »", () => {
  assert.deepEqual(calculerChangements(null, { nom: 'X', contact: null, motsCles: [], jumelage: false, normes: ['BIDS'] }), {
    nom: { apres: 'X' }, normes: { apres: ['BIDS'] },
  });
});

test('champsBouscules signale un champ qui a changé depuis la proposition', () => {
  const changements = { contact: { avant: 'a@b.org', apres: 'c@d.org' }, normes: { avant: ['BIDS'], apres: ['BIDS', 'NIfTI'] }, licence: { avant: null, apres: 'MIT' } };
  assert.deepEqual(champsBouscules(changements, { contact: 'a@b.org', normes: ['BIDS'], licence: '' }), []);
  assert.deepEqual(champsBouscules(changements, { contact: 'autre@b.org', normes: ['BIDS', 'DICOM'], licence: '' }), ['contact', 'normes']);
  assert.deepEqual(champsBouscules({ nom: { apres: 'X' } }, { nom: 'Y' }), []);
});

test("fusionner applique les corrections de l'approbateur par-dessus la proposition", () => {
  const changements = { motsCles: { avant: [], apres: ['fhir'] }, contact: { avant: null, apres: 'a@b.org' } };
  assert.deepEqual(fusionner(changements, { motsCles: ['HL7 FHIR'], etat: 'Actif' }), { motsCles: ['HL7 FHIR'], contact: 'a@b.org', etat: 'Actif' });
  assert.deepEqual(fusionner(changements), { motsCles: ['fhir'], contact: 'a@b.org' });
});
