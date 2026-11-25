const test = require('node:test');
const assert = require('node:assert/strict');
const { ficheDepuisPage, porteurDepuisPage } = require('../lib/notion');
const f = require('./fixtures/pages');

test('ficheDepuisPage traduit une ressource complète', () => {
  const fiche = ficheDepuisPage(f.ressourceComplete);
  assert.equal(fiche.id, 'r-1');
  assert.equal(fiche.nom, 'CARTaGENE');
  assert.equal(fiche.autresNoms, 'CaG');
  assert.equal(fiche.typePrincipal, 'Jeu de données ou cohorte ou biobanque');
  assert.equal(fiche.secondType, 'Catalogue ou entrepôt de données');
  assert.equal(fiche.description, 'Une cohorte. Deux phrases.');
  assert.deepEqual(fiche.motsCles, ['génomique', 'épidémiologie']);
  assert.deepEqual(fiche.modesAcces, ['Sur demande évaluée']);
  assert.equal(fiche.environnementSecurise, true);
  assert.equal(fiche.contact, 'acces@exemple.org');
  assert.equal(fiche.verifieeLe, '2026-11-24');
  assert.deepEqual(fiche.porteurIds, ['p-1']);
  assert.deepEqual(fiche.donneAccesA, ['r-2']);
  assert.equal(fiche.statutFiche, 'Brouillon');
});

test('ficheDepuisPage traduit une ressource minimale sans rien inventer', () => {
  const fiche = ficheDepuisPage(f.ressourceMinimale);
  assert.equal(fiche.nom, 'Ressource minimale');
  assert.equal(fiche.phrase, '');
  assert.deepEqual(fiche.motsCles, []);
  assert.equal(fiche.contact, null);
  assert.equal(fiche.secondType, null);
  assert.equal(fiche.lien, null);
  assert.equal(fiche.verifieeLe, null);
  assert.deepEqual(fiche.porteurIds, []);
});

test('ficheDepuisPage ne lit aucun champ interne', () => {
  const texte = JSON.stringify(ficheDepuisPage(f.ressourceComplete));
  assert.ok(!texte.includes('note interne'));
  assert.ok(!texte.includes('remarque interne'));
});

test('ficheDepuisPage tolère une propriété absente de la page', () => {
  const page = { id: 'r-3', properties: { 'Nom': { type: 'title', title: [{ plain_text: 'Seule' }] } } };
  const fiche = ficheDepuisPage(page);
  assert.equal(fiche.nom, 'Seule');
  assert.deepEqual(fiche.modesAcces, []);
  assert.equal(fiche.statutFiche, null);
});

test('porteurDepuisPage lit le lieu et le lien avec le bottin', () => {
  const p = porteurDepuisPage(f.porteurAvecLieu);
  assert.equal(p.nom, 'CHU Sainte-Justine');
  assert.equal(p.latitude, 45.503);
  assert.equal(p.institutionBottinId, 'i-1');
  const sans = porteurDepuisPage(f.porteurSansLieu);
  assert.equal(sans.latitude, null);
  assert.equal(sans.institutionBottinId, null);
  assert.equal(sans.adresse, '');
});

test('ficheDepuisPage lit les normes et formats, et les outils et environnements', () => {
  const page = { id: 'r-9', properties: {
    Nom: { title: [{ plain_text: 'CODA' }] },
    'Normes et formats': { multi_select: [{ name: 'HL7 FHIR' }, { name: 'DICOM' }] },
    'Outils et environnements': { multi_select: [{ name: 'Docker' }] },
  } };
  const fiche = ficheDepuisPage(page);
  assert.deepEqual(fiche.normes, ['HL7 FHIR', 'DICOM']);
  assert.deepEqual(fiche.outils, ['Docker']);
  // Une page sans ces colonnes donne des listes vides, rien d'inventé.
  const sans = ficheDepuisPage({ id: 'r-10', properties: { Nom: { title: [{ plain_text: 'X' }] } } });
  assert.deepEqual(sans.normes, []);
  assert.deepEqual(sans.outils, []);
});

test('ficheDepuisPage lit le DOI de la ressource', () => {
  const page = { id: 'r-11', properties: { Nom: { title: [{ plain_text: 'BALSAC' }] }, DOI: { url: 'https://doi.org/10.5683/SP3/BW7DIG' } } };
  assert.equal(ficheDepuisPage(page).doi, 'https://doi.org/10.5683/SP3/BW7DIG');
  assert.equal(ficheDepuisPage({ id: 'r-12', properties: { Nom: { title: [{ plain_text: 'X' }] } } }).doi, null);
});
