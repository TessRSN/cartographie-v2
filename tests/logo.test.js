const test = require('node:test');
const assert = require('node:assert/strict');
const { verifierImage, verifierOctets, TAILLE_MAX } = require('../lib/images');
const { creerFichiers } = require('../lib/fichiers-notion');
const { PROP, ficheDepuisPage, ecriture } = require('../lib/notion');
const { assembler } = require('../lib/fiches');
const { adresseLogo } = require('../public/js/texte.js');
const logo = require('../api/logo');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(10)]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
const b64 = (octets) => octets.toString('base64');

test('les quatre formats acceptés sont reconnus à leur contenu, pas à leur nom', () => {
  for (const [octets, type, extension] of [[PNG, 'image/png', 'png'], [JPEG, 'image/jpeg', 'jpg'], [WEBP, 'image/webp', 'webp'], [SVG, 'image/svg+xml', 'svg']]) {
    const v = verifierImage({ nom: 'n-importe-quoi.exe', donnees: b64(octets) });
    assert.equal(v.ok, true, type);
    assert.equal(v.type, type);
    assert.equal(v.nom, `logo.${extension}`);
    assert.ok(v.octets.equals(octets));
  }
});

test('ce qui n\'est pas une image, ou trop gros, est refusé avec un message', () => {
  for (const mauvais of [
    { nom: 'a.png', donnees: b64(Buffer.from('<html><script>alert(1)</script></html>')) },
    { nom: 'a.gif', donnees: b64(Buffer.from('GIF89a')) },
    { nom: 'a.png', donnees: '' },
    { nom: 'a.png', donnees: '***pas du base64***' },
    { nom: 'a.png', donnees: b64(Buffer.concat([PNG, Buffer.alloc(TAILLE_MAX)])) },
    { nom: 'a.png' }, null, 'texte', { donnees: 42 },
  ]) {
    const v = verifierImage(mauvais);
    assert.equal(v.ok, false, JSON.stringify(mauvais).slice(0, 40));
    assert.ok(v.erreur.length > 10);
  }
});

test('un SVG qui contient du code actif est refusé', () => {
  const svg = (contenu) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${contenu}</svg>`);
  for (const dangereux of ['<script>alert(1)</script>', '<circle onload="alert(1)"/>', '<a href="javascript:alert(1)">x</a>', '<foreignObject><iframe src="x"/></foreignObject>', '<image href="https://ailleurs.org/x.png"/>', '<use xlink:href="http://ailleurs.org/x.svg#a"/>']) {
    assert.equal(verifierOctets(svg(dangereux)).ok, false, dangereux);
  }
  assert.equal(verifierOctets(svg('<use href="#forme"/><path d="M0 0h1"/>')).ok, true);
});

test('le dépôt dans Notion se fait en deux appels et renvoie l\'identifiant', async () => {
  const appels = [];
  const requete = async (url, options) => {
    appels.push({ url, options });
    if (url.endsWith('/file_uploads')) return { ok: true, json: async () => ({ id: 'depot-1' }) };
    return { ok: true, json: async () => ({ status: 'uploaded' }) };
  };
  const fichiers = creerFichiers({ env: { NOTION_KEY: 'cle' }, requete });
  assert.equal(await fichiers.deposer({ nom: 'logo.png', type: 'image/png', octets: PNG }), 'depot-1');
  assert.equal(appels[0].url, 'https://api.notion.com/v1/file_uploads');
  assert.deepEqual(JSON.parse(appels[0].options.body), { filename: 'logo.png', content_type: 'image/png' });
  assert.equal(appels[0].options.headers.Authorization, 'Bearer cle');
  assert.equal(appels[1].url, 'https://api.notion.com/v1/file_uploads/depot-1/send');
  assert.ok(appels[1].options.body instanceof FormData);
  assert.deepEqual(fichiers.proprieteFichier('depot-1', 'logo.png'), { files: [{ type: 'file_upload', file_upload: { id: 'depot-1' }, name: 'logo.png' }] });
});

test('un dépôt refusé par Notion lève, un téléchargement trop gros aussi', async () => {
  const refus = creerFichiers({ env: { NOTION_KEY: 'cle' }, requete: async () => ({ ok: false, status: 400, json: async () => ({}) }) });
  await assert.rejects(refus.deposer({ nom: 'logo.png', type: 'image/png', octets: PNG }), /400/);
  const gros = creerFichiers({ env: {}, requete: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(TAILLE_MAX + 1) }) });
  await assert.rejects(gros.telecharger('https://fichiers.exemple/x'), /trop/);
  const bon = creerFichiers({ env: {}, requete: async () => ({ ok: true, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) }) });
  assert.ok((await bon.telecharger('https://fichiers.exemple/x')).equals(PNG));
});

test('une fiche avec un fichier de logo reçoit une adresse servie par le site', () => {
  const page = (id, nom, fichiers) => ({ id, last_edited_time: '2026-11-24T10:00:00.000Z', properties: {
    [PROP.nom]: { title: [{ plain_text: nom }] }, [PROP.logo]: { url: 'https://ailleurs.org/logo.png' },
    [PROP.logoFichier]: { files: fichiers }, [PROP.statutFiche]: { select: { name: 'Publiée' } },
  } });
  const avec = ficheDepuisPage(page('f1', 'Avec fichier', [{ type: 'file', name: 'logo.png', file: { url: 'https://notion.exemple/secret?sig=abc' } }]));
  const sans = ficheDepuisPage(page('f2', 'Sans fichier', []));
  assert.equal(avec.logoFichier, 'logo.png');
  assert.equal(sans.logoFichier, null);
  const { ressources } = assembler([avec, sans], [], { logosCopies: {} });
  const parNom = Object.fromEntries(ressources.map((r) => [r.nom, r]));
  assert.match(parNom['Avec fichier'].logo, /^\/api\/logo\?adresse=avec-fichier&v=[a-f0-9]{10}$/);
  assert.equal(parNom['Sans fichier'].logo, 'https://ailleurs.org/logo.png');
  const brut = JSON.stringify(ressources);
  assert.ok(!brut.includes('logoFichier') && !brut.includes('modifieeLe') && !brut.includes('notion.exemple'));
  assert.equal(adresseLogo(parNom['Avec fichier'].logo), parNom['Avec fichier'].logo);
  assert.equal(adresseLogo('/api/logo?adresse=x&v=zz'), null);
  assert.equal(adresseLogo('/api/export'), null);
});

test('lireFichierLogo donne le nom et l\'adresse temporaire du fichier', async () => {
  const client = (fichiers) => ({ pages: { retrieve: async () => ({ id: 'f1', parent: { database_id: 'base-r' }, properties: { [PROP.logoFichier]: { files: fichiers } } }) } });
  const env = { NOTION_DB_RESSOURCES: 'base-r' };
  assert.deepEqual(await ecriture(client([{ type: 'file', name: 'logo.png', file: { url: 'https://notion.exemple/x' } }]), env).lireFichierLogo('f1'), { nom: 'logo.png', url: 'https://notion.exemple/x' });
  assert.equal(await ecriture(client([]), env).lireFichierLogo('f1'), null);
  assert.equal(await ecriture(client([{ type: 'external', name: 'x', external: { url: 'https://ailleurs.org/x.png' } }]), env).lireFichierLogo('f1'), null);
});

function reponse() {
  return { code: null, corps: null, entetes: {}, setHeader(k, v) { this.entetes[k] = v; }, status(c) { this.code = c; return this; }, send(o) { this.corps = o; return this; }, end() { return this; }, json(o) { this.corps = o; return this; } };
}
function bancLogo({ fichier = { nom: 'logo.png', url: 'https://notion.exemple/x' }, octets = PNG, logos = { 'cohorte-x': { v: 'abc', url: 'https://notion.exemple/x' } }, panneUneFois = false } = {}) {
  let panne = panneUneFois;
  const appels = [];
  const gestionnaire = logo.creerGestionnaire({
    journal: () => {},
    source: async () => ({ idParAdresse: { 'cohorte-x': 'f1', 'sans-logo': 'f2' }, logos }),
    notion: { async lireFichierLogo(id) { appels.push(id); return fichier; } },
    fichiers: { async telecharger(url) { appels.push(url); if (panne) { panne = false; throw new Error('adresse expirée'); } return octets; } },
  });
  return { gestionnaire, appels };
}
const voir = async (b, query, method = 'GET') => { const res = reponse(); await b.gestionnaire({ method, query, headers: {} }, res); return res; };

test('la route /api/logo sert l\'image avec des en-têtes sûrs et une longue mémoire', async () => {
  const b = bancLogo();
  const res = await voir(b, { adresse: 'cohorte-x', v: 'abc' });
  assert.equal(res.code, 200);
  assert.ok(res.corps.equals(PNG));
  assert.equal(res.entetes['Content-Type'], 'image/png');
  assert.equal(res.entetes['X-Content-Type-Options'], 'nosniff');
  assert.match(res.entetes['Content-Security-Policy'], /sandbox/);
  assert.match(res.entetes['Cache-Control'], /s-maxage=86400/);
  assert.deepEqual(b.appels, ['https://notion.exemple/x']);
});

test('/api/logo : adresse inconnue, fiche sans fichier ou contenu qui n\'est pas une image', async () => {
  assert.equal((await voir(bancLogo(), { adresse: 'inconnue' })).code, 404);
  assert.equal((await voir(bancLogo(), { adresse: '../etc' })).code, 404);
  assert.equal((await voir(bancLogo(), { adresse: 'constructor' })).code, 404);
  assert.equal((await voir(bancLogo({ octets: Buffer.from('<html></html>') }), { adresse: 'cohorte-x', v: 'abc' })).code, 404);
  assert.equal((await voir(bancLogo(), { adresse: 'cohorte-x' }, 'POST')).code, 405);
});

test('/api/logo : une fiche sans fichier répond 404 sans interroger Notion', async () => {
  const b = bancLogo();
  assert.equal((await voir(b, { adresse: 'sans-logo', v: 'abc' })).code, 404);
  assert.deepEqual(b.appels, []);
});

test('/api/logo : une version inconnue ou un paramètre en trop renvoie à l\'adresse courante, sans rien télécharger', async () => {
  for (const query of [{ adresse: 'cohorte-x', v: 'hasard' }, { adresse: 'cohorte-x' }, { adresse: 'cohorte-x', v: 'abc', x: '1' }]) {
    const b = bancLogo();
    const res = await voir(b, query);
    assert.equal(res.code, 302, JSON.stringify(query));
    assert.equal(res.entetes.Location, '/api/logo?adresse=cohorte-x&v=abc');
    assert.deepEqual(b.appels, []);
  }
});

test('/api/logo : si l\'adresse gardée a expiré, le fichier est relu une fois dans Notion', async () => {
  const b = bancLogo({ panneUneFois: true });
  const res = await voir(b, { adresse: 'cohorte-x', v: 'abc' });
  assert.equal(res.code, 200);
  assert.deepEqual(b.appels, ['https://notion.exemple/x', 'f1', 'https://notion.exemple/x']);
});

test('/api/logo : un SVG est servi avec une politique qui interdit tout chargement et toute exécution', async () => {
  const res = await voir(bancLogo({ octets: SVG }), { adresse: 'cohorte-x', v: 'abc' });
  assert.equal(res.code, 200);
  assert.equal(res.entetes['Content-Type'], 'image/svg+xml');
  assert.equal(res.entetes['Content-Security-Policy'], "default-src 'none'; style-src 'unsafe-inline'; sandbox");
});

test('l\'assemblage garde à part, pour le serveur, la version et l\'adresse de chaque fichier de logo', () => {
  const page = { id: 'f1', last_edited_time: '2026-11-24T10:00:00.000Z', properties: {
    [PROP.nom]: { title: [{ plain_text: 'Avec fichier' }] }, [PROP.statutFiche]: { select: { name: 'Publiée' } },
    [PROP.logoFichier]: { files: [{ type: 'file', name: 'logo.png', file: { url: 'https://notion.exemple/secret?sig=abc' } }] },
  } };
  const { ressources, logos } = assembler([ficheDepuisPage(page)], [], { logosCopies: {} });
  assert.deepEqual(Object.keys(logos), ['avec-fichier']);
  assert.equal(logos['avec-fichier'].url, 'https://notion.exemple/secret?sig=abc');
  assert.equal(ressources[0].logo, `/api/logo?adresse=avec-fichier&v=${logos['avec-fichier'].v}`);
  assert.ok(!JSON.stringify(ressources).includes('notion.exemple'));
});

test('un téléchargement annoncé trop gros est refusé avant d\'être lu', async () => {
  let lu = false;
  const gros = creerFichiers({ env: {}, requete: async () => ({ ok: true, headers: { get: (n) => (n.toLowerCase() === 'content-length' ? String(TAILLE_MAX + 1) : null) }, arrayBuffer: async () => { lu = true; return new ArrayBuffer(8); } }) });
  await assert.rejects(gros.telecharger('https://fichiers.exemple/x'), /trop/);
  assert.equal(lu, false);
});

const svgDe = (contenu, attributs = '') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"${attributs}>${contenu}</svg>`);

test('les contournements connus du filtre SVG sont refusés', () => {
  const X = 'http://www.w3.org/1999/xhtml';
  const cas = {
    'élément préfixé': svgDe('<s:script>alert(1)</s:script>', ' xmlns:s="http://www.w3.org/2000/svg"'),
    'foreignObject préfixé': svgDe(`<s:foreignObject><h:iframe src="https://example.org/"/></s:foreignObject>`, ` xmlns:s="http://www.w3.org/2000/svg" xmlns:h="${X}"`),
    'gestionnaire posé par la DTD': Buffer.from('<!DOCTYPE svg SYSTEM "<?xml" [<!ATTLIST svg onload CDATA "alert(1)"><?p ?>]><svg xmlns="http://www.w3.org/2000/svg"/>'),
    'DOCTYPE simple': Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>'),
    'encodage déclaré': Buffer.from('<?xml version="1.0" encoding="ISO-2022-JP"?><svg xmlns="http://www.w3.org/2000/svg"><scr\x1b(Bipt>alert(1)</scr\x1b(Bipt></svg>'),
    'caractère de contrôle': svgDe('<circle o\x1b(Bnload="alert(1)"/>'),
    '@import': svgDe('<style>@import "https://example.org/x.css";</style>'),
    'url échappée': svgDe('<rect style="fill:u\\72l(https://example.org/x)"/>'),
    'url en entités': svgDe('<rect style="fill:&#117;rl(https://example.org/x)"/>'),
    'img html': svgDe(`<img xmlns="${X}" src="https://example.org/pixel"/>`),
    'animation': svgDe('<animateTransform attributeName="transform"/>'),
    'instruction de traitement': svgDe('<?xml-stylesheet href="https://example.org/x.css"?>'),
    'section CDATA': svgDe('<style><![CDATA[ a { fill: red } ]]></style>'),
    'commentaire jamais fermé': Buffer.from('<!-- <svg xmlns="http://www.w3.org/2000/svg"/>'),
    'gestionnaire sans espace': svgDe('<circle r="1"onclick="alert(1)"/>'),
  };
  for (const [nom, octets] of Object.entries(cas)) assert.equal(verifierOctets(octets).ok, false, nom);
});

test('un SVG ordinaire avec dégradé, style et titre reste accepté', () => {
  for (const contenu of [
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(\'#g\')" width="1" height="1"/>',
    '<rect fill="url( #g)" width="1" height="1"/><rect style="fill:url(#g)"/>',
    '<title>Metadata: logo</title><desc>Version 2</desc><g><path d="M0 0h1"/></g>',
    '<style>.a{fill:#123456}</style><text class="a">RSN</text><use href="#forme"/>',
    '<!-- exporté --><clipPath id="c"><circle r="1"/></clipPath><g clip-path="url(#c)"><ellipse rx="1" ry="2"/></g>',
  ]) assert.equal(verifierOctets(svgDe(contenu)).ok, true, contenu);
  assert.equal(verifierOctets(Buffer.from('﻿<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')).ok, true);
});

test('le contrôle d\'un SVG reste rapide sur une entrée hostile, et un SVG énorme est refusé', () => {
  for (const motif of ['<!--', '<?xml', '<!DOCTYPE', '<svg ']) {
    const debut = Date.now();
    const v = verifierOctets(Buffer.from(motif.repeat(100000)));
    if (motif !== '<svg ') assert.equal(v.ok, false, motif);
    assert.ok(Date.now() - debut < 500, `${motif} : ${Date.now() - debut} ms`);
  }
  const lourd = svgDe(`<path d="${'M0 0h1'.repeat(100000)}"/>`);
  assert.ok(lourd.length > 500 * 1024 && lourd.length < TAILLE_MAX);
  assert.equal(verifierOctets(lourd).ok, false);
});
