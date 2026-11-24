const test = require('node:test');
const assert = require('node:assert/strict');
const { echapper, filtrer, TEXTES, valeursDeFiltre } = require('../js/texte.js');
const { htmlFiche } = require('../js/fiche.js');

const fiche = (nom, props = {}) => ({
  nom, adresse: nom.toLowerCase(), autresNoms: '', typePrincipal: 'Logiciel ou application', secondType: null,
  phrase: '', description: '', motsCles: [], lien: null, autresLiens: '', etat: null, verifieeLe: null, verifieePar: null,
  langues: [], modesAcces: [], commentAcceder: null, frais: null, environnementSecurise: false, reserveA: '',
  responsable: '', profilResponsable: null, contact: null, portee: null, financePar: [], population: '', periode: '',
  typesDonnees: [], collecte: null, jumelage: false, dictionnaire: null, depotCode: null, licence: '',
  porteurs: [], lieu: null, liens: [], ...props,
});

test('echapper neutralise les caractères du HTML', () => {
  assert.equal(echapper('<b>a & "b"</b>'), '&lt;b&gt;a &amp; &quot;b&quot;&lt;/b&gt;');
  assert.equal(echapper("l'accès"), 'l&#39;accès');
  assert.equal(echapper(null), '');
});

test('filtrer par type retient le type principal ou le second type', () => {
  const liste = [
    fiche('A', { typePrincipal: 'Plateforme ou infrastructure', secondType: 'Logiciel ou application' }),
    fiche('B', { typePrincipal: 'Logiciel ou application' }),
    fiche('C', { typePrincipal: 'Service ou accompagnement' }),
  ];
  assert.deepEqual(filtrer(liste, { type: 'Logiciel ou application' }).map((f) => f.nom), ['A', 'B']);
});

test('filtrer par mode d\'accès, porteur et état, en intersection', () => {
  const liste = [
    fiche('A', { modesAcces: ['Ouvert', 'Sur inscription'], porteurs: [{ nom: 'Mila' }], etat: 'Actif' }),
    fiche('B', { modesAcces: ['Ouvert'], porteurs: [{ nom: 'Mila' }], etat: 'Archivé' }),
    fiche('C', { modesAcces: ['Sur demande évaluée'], porteurs: [{ nom: 'ISQ' }], etat: 'Actif' }),
  ];
  assert.deepEqual(filtrer(liste, { modeAcces: 'Ouvert' }).map((f) => f.nom), ['A', 'B']);
  assert.deepEqual(filtrer(liste, { porteur: 'Mila', etat: 'Actif' }).map((f) => f.nom), ['A']);
  assert.deepEqual(filtrer(liste, {}).map((f) => f.nom), ['A', 'B', 'C']);
  assert.deepEqual(filtrer(liste, { horsCarte: true }).map((f) => f.nom), ['A', 'B', 'C']);
});

test('horsCarte retient les fiches sans lieu ou hors du Québec', () => {
  const liste = [
    fiche('Montréal', { lieu: { latitude: 45.5, longitude: -73.6, porteur: 'X' } }),
    fiche('Toronto', { lieu: { latitude: 43.65, longitude: -79.38, porteur: 'Y' } }),
    fiche('Nulle part'),
  ];
  assert.deepEqual(filtrer(liste, { horsCarte: true }).map((f) => f.nom), ['Toronto', 'Nulle part']);
});

test('valeursDeFiltre liste les valeurs présentes, triées, sans doublon', () => {
  const liste = [
    fiche('A', { secondType: 'Plateforme ou infrastructure', porteurs: [{ nom: 'Mila' }, { nom: 'IVADO' }] }),
    fiche('B', { porteurs: [{ nom: 'Mila' }] }),
  ];
  const v = valeursDeFiltre(liste);
  assert.deepEqual(v.type, ['Logiciel ou application', 'Plateforme ou infrastructure']);
  assert.deepEqual(v.porteur, ['IVADO', 'Mila']);
});

test('htmlFiche échappe tout contenu venu de Notion', () => {
  const html = htmlFiche(fiche('<img src=x onerror=alert(1)>', {
    phrase: 'Une <b>phrase</b>', description: 'a & b </script><script>alert(1)</script>',
    motsCles: ['<i>mot</i>'], porteurs: [{ nom: '"Porteur"' }], reserveA: '<u>x</u>',
    responsable: '<s>Nom</s>', liens: [{ nature: 'repose sur', adresse: 'cible', nom: '<em>Cible</em>' }],
  }));
  for (const interdit of ['<img', '<b>', '<script', '<i>', '<u>', '<s>', '<em>']) {
    assert.ok(!html.includes(interdit), `${interdit} ne doit pas passer`);
  }
  assert.ok(html.includes('&lt;img src=x'));
});

test('htmlFiche refuse une adresse qui n\'est pas http(s)', () => {
  const html = htmlFiche(fiche('X', { lien: 'javascript:alert(1)', commentAcceder: 'data:text/html,x', profilResponsable: 'javascript:1', responsable: 'Nom' }));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('data:text'));
});

test('htmlFiche n\'affiche pas un champ vide, mais affiche « Non précisé par la ressource »', () => {
  const vide = htmlFiche(fiche('X'));
  assert.ok(!vide.includes(TEXTES.fiche.frais));
  assert.ok(!vide.includes(TEXTES.fiche.financePar));
  assert.ok(vide.includes(echapper(TEXTES.fiche.nonConfirmee)));
  const pleine = htmlFiche(fiche('X', { modesAcces: ['Non précisé par la ressource'], frais: 'Oui', verifieeLe: '2026-11-24' }));
  assert.ok(pleine.includes('Non précisé par la ressource'));
  assert.ok(pleine.includes(TEXTES.fiche.frais));
  assert.ok(pleine.includes('24 novembre 2026'));
  assert.ok(!pleine.includes(echapper(TEXTES.fiche.nonConfirmee)));
});

test('htmlFiche montre contact, responsable et liens entre fiches', () => {
  const html = htmlFiche(fiche('X', {
    contact: 'info@exemple.org', responsable: 'Ada Lovelace', profilResponsable: 'https://exemple.org/ada',
    liens: [{ nature: 'repose sur', adresse: 'socle', nom: 'Socle' }], lien: 'https://exemple.org',
  }));
  assert.ok(html.includes('href="mailto:info@exemple.org"'));
  assert.ok(html.includes('href="https://exemple.org/ada"'));
  assert.ok(html.includes('href="/ressource/socle"'));
  assert.ok(html.includes('data-fiche="socle"'));
  assert.ok(html.includes('rel="noopener'));
});
