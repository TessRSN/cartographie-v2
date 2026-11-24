const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rendrePage, rendreAccueil, rendreIntrouvable, rendrePlanDuSite, rendreRobots, donneesStructurees } = require('../lib/page-publique');
const { creerGestionnaire } = require('../api/ressource');

const gabarit = fs.readFileSync(path.join(__dirname, '..', 'gabarit.html'), 'utf8');
const origine = 'https://carto.exemple.org';
const fiche = (props = {}) => ({
  nom: 'CARTaGENE', adresse: 'cartagene', autresNoms: 'CaG', typePrincipal: 'Jeu de données, cohorte ou biobanque', secondType: null,
  phrase: 'Cohorte populationnelle du Québec.', description: 'Une grande cohorte.', motsCles: ['génomique'], lien: 'https://www.cartagene.qc.ca/',
  autresLiens: '', etat: 'Actif', verifieeLe: null, verifieePar: null, langues: [], modesAcces: ['Sur demande évaluée'], commentAcceder: null,
  frais: 'Oui', environnementSecurise: false, reserveA: '', responsable: '', profilResponsable: null, contact: null, portee: null,
  financePar: [], population: '', periode: '', typesDonnees: [], collecte: null, jumelage: false, dictionnaire: null, depotCode: null,
  licence: 'CC BY 4.0', porteurs: [{ nom: 'CHU Sainte-Justine' }], lieu: null, liens: [], ...props,
});

test('rendrePage remplit le titre, la description, l\'adresse canonique et le contenu', () => {
  const { html, manquants } = rendrePage(gabarit, fiche(), { origine, indexation: true });
  assert.deepEqual(manquants, []);
  assert.ok(html.includes('<title>CARTaGENE | Cartographie du RSN</title>'));
  assert.ok(html.includes('<meta name="description" content="Cohorte populationnelle du Québec.">'));
  assert.ok(html.includes('<link rel="canonical" href="https://carto.exemple.org/ressource/cartagene">'));
  assert.ok(html.includes('<meta name="robots" content="index, follow">'));
  const corps = html.slice(html.indexOf('<main id="ficheStatique"'), html.indexOf('</main>'));
  assert.ok(!corps.includes('hidden'), 'la fiche doit être visible sans JavaScript');
  for (const attendu of ['CARTaGENE', 'Une grande cohorte.', 'Sur demande évaluée', 'href="https://www.cartagene.qc.ca/"']) {
    assert.ok(corps.includes(attendu), attendu);
  }
  assert.ok(/<div id="accueil" hidden>/.test(html), 'l\'accueil est masqué tant que le script n\'a pas pris le relais');
});

test('pendant la construction, la page demande de ne pas être indexée', () => {
  const { html } = rendrePage(gabarit, fiche(), { origine, indexation: false });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(rendreAccueil(gabarit, { origine, indexation: true }).includes('<meta name="robots" content="index, follow">'));
  assert.ok(rendreAccueil(gabarit, { origine, indexation: true }).includes('<link rel="canonical" href="https://carto.exemple.org/">'));
});

test('les données structurées suivent le type de la ressource', () => {
  assert.equal(donneesStructurees(fiche(), origine)['@type'], 'Dataset');
  assert.equal(donneesStructurees(fiche({ typePrincipal: 'Logiciel ou application' }), origine)['@type'], 'SoftwareApplication');
  assert.equal(donneesStructurees(fiche({ typePrincipal: 'Catalogue ou entrepôt de données' }), origine)['@type'], 'DataCatalog');
  assert.equal(donneesStructurees(fiche({ typePrincipal: 'Service ou accompagnement' }), origine)['@type'], 'Service');
  const d = donneesStructurees(fiche(), origine);
  assert.equal(d.url, 'https://carto.exemple.org/ressource/cartagene');
  assert.equal(d.name, 'CARTaGENE');
  assert.deepEqual(d.keywords, ['génomique']);
});

test('un contenu hostile ne sort jamais non échappé, y compris dans le bloc JSON', () => {
  const { html } = rendrePage(gabarit, fiche({
    nom: 'X</title><script>alert(1)</script>', phrase: '"><img src=x onerror=alert(2)>',
    description: 'fin </script><script>alert(3)</script> <b>gras</b>',
  }), { origine, indexation: false });
  assert.ok(!html.includes('<script>alert('));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>gras</b>'));
  const blocs = html.match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g);
  assert.equal(blocs.length, 1);
  assert.ok(!blocs[0].slice(0, -9).includes('</script'));
  assert.doesNotThrow(() => JSON.parse(blocs[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')));
});

test('un symbole $ dans le contenu n\'est pas interprété par le remplacement', () => {
  const { html } = rendrePage(gabarit, fiche({ phrase: 'Coût : 500 $& plus, $1 $$' }), { origine, indexation: false });
  assert.ok(html.includes('Coût : 500 $&amp; plus, $1 $$'));
});

test('rendreIntrouvable garde l\'accueil et interdit l\'indexation', () => {
  const html = rendreIntrouvable(gabarit, { origine });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.ok(html.includes("n&#39;existe pas"));
});

test('robots et plan du site', () => {
  assert.ok(rendreRobots(false, origine).includes('Disallow: /'));
  const ouvert = rendreRobots(true, origine);
  assert.ok(ouvert.includes('Allow: /'));
  assert.ok(ouvert.includes('Sitemap: https://carto.exemple.org/sitemap.xml'));
  const plan = rendrePlanDuSite([fiche(), fiche({ adresse: 'loris' })], origine);
  assert.ok(plan.includes('<loc>https://carto.exemple.org/</loc>'));
  assert.ok(plan.includes('<loc>https://carto.exemple.org/ressource/cartagene</loc>'));
  assert.ok(plan.includes('<loc>https://carto.exemple.org/ressource/loris</loc>'));
});

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, send(c) { this.corps = c; return this; }, json(o) { this.corps = o; return this; } };
}
const source = async () => ({ ressources: [fiche()], porteurs: [] });
const requete = (query) => ({ method: 'GET', query, headers: { host: 'carto.exemple.org' } });

test('la fonction sert la page d\'une ressource, 404 pour une adresse inconnue', async () => {
  const g = creerGestionnaire({ source, gabarit: () => gabarit });
  let res = reponse(); await g(requete({ vue: 'page', adresse: 'cartagene' }), res);
  assert.equal(res.code, 200);
  assert.ok(res.corps.includes('<title>CARTaGENE | Cartographie du RSN</title>'));
  assert.ok(res.entetes['Content-Type'].startsWith('text/html'));
  res = reponse(); await g(requete({ vue: 'page', adresse: 'inconnue' }), res);
  assert.equal(res.code, 404);
  res = reponse(); await g(requete({ vue: 'page', adresse: '../../etc/passwd' }), res);
  assert.equal(res.code, 404);
});

test('si Notion est injoignable, la page d\'une ressource répond 503 avec l\'accueil, pas une erreur brute', async () => {
  const g = creerGestionnaire({ source: async () => { throw new Error('secret'); }, gabarit: () => gabarit, journal: () => {} });
  const res = reponse(); await g(requete({ vue: 'page', adresse: 'cartagene' }), res);
  assert.equal(res.code, 503);
  assert.ok(!String(res.corps).includes('secret'));
  assert.ok(res.corps.includes('noindex'));
});

test('la fonction sert robots, plan du site et accueil', async () => {
  const g = creerGestionnaire({ source, gabarit: () => gabarit });
  let res = reponse(); await g(requete({ vue: 'robots' }), res);
  assert.ok(res.corps.includes('Disallow: /'));
  res = reponse(); await g(requete({ vue: 'plan' }), res);
  assert.ok(res.corps.includes('https://carto.exemple.org/ressource/cartagene'));
  res = reponse(); await g(requete({ vue: 'accueil' }), res);
  assert.equal(res.code, 200);
  assert.ok(res.corps.includes('<link rel="canonical" href="https://carto.exemple.org/">'));
});
