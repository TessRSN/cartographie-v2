// Les couleurs des types et des modes d'accès sont définies une seule fois, dans
// css/styles.css. Ces essais relisent la feuille : couleurs de la charte du RSN,
// et contraste du texte posé sur chaque pastille, en mode clair et en mode sombre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CLES_TYPE, CLES_ACCES } = require('../js/texte.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

function variables(selecteur) {
  const debut = css.indexOf(selecteur + ' {');
  assert.ok(debut >= 0, selecteur);
  const bloc = css.slice(debut, css.indexOf('\n}', debut));
  const v = {};
  for (const m of bloc.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) v[m[1]] = m[2].toUpperCase();
  return v;
}
const clair = variables(':root');
const sombre = Object.assign({}, clair, variables('[data-theme="dark"]'));

// Contraste WCAG entre deux couleurs « #rrggbb ».
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, v, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}
function contraste(a, b) {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}

const typesCles = Object.values(CLES_TYPE).concat(['autre']);
const accesCles = [...new Set(Object.values(CLES_ACCES))].concat(['neutre']);

test('le calcul du contraste est juste', () => {
  assert.equal(Math.round(contraste('#000000', '#FFFFFF')), 21);
  assert.equal(contraste('#777777', '#777777'), 1);
});

test('les six types portent les couleurs de la charte du RSN', () => {
  assert.deepEqual(
    { jeu: clair['--type-jeu'], catalogue: clair['--type-catalogue'], plateforme: clair['--type-plateforme'], logiciel: clair['--type-logiciel'], service: clair['--type-service'], initiative: clair['--type-initiative'] },
    { jeu: '#0061AF', catalogue: '#003469', plateforme: '#00A759', logiciel: '#FFCC4E', service: '#EE3124', initiative: '#5E0000' });
  // En mode sombre, seuls le bleu marine et le bordeaux reçoivent une variante plus claire.
  for (const cle of ['jeu', 'plateforme', 'logiciel', 'service']) assert.equal(sombre[`--type-${cle}`], clair[`--type-${cle}`], cle);
  for (const cle of ['catalogue', 'initiative']) assert.ok(luminance(sombre[`--type-${cle}`]) > luminance(clair[`--type-${cle}`]) * 4, cle);
  assert.equal(new Set(typesCles.map((c) => clair[`--type-${c}`])).size, typesCles.length, 'une couleur distincte par type');
});

test('le texte posé sur chaque pastille de type a un contraste d\'au moins 4,5:1, en clair et en sombre', () => {
  for (const [mode, v] of [['clair', clair], ['sombre', sombre]]) {
    for (const cle of typesCles) {
      const fond = v[`--type-${cle}`], texte = v[`--type-${cle}-sur`];
      assert.ok(fond && texte, `${mode} ${cle} : variables définies`);
      assert.ok(contraste(fond, texte) >= 4.5, `${mode} ${cle} : ${texte} sur ${fond} = ${contraste(fond, texte).toFixed(2)}`);
    }
  }
});

test('chaque étiquette d\'accès a un contraste d\'au moins 4,5:1, en clair et en sombre', () => {
  for (const [mode, v] of [['clair', clair], ['sombre', sombre]]) {
    for (const cle of accesCles) {
      const fond = v[`--acces-${cle}-fond`], texte = v[`--acces-${cle}-texte`];
      assert.ok(fond && texte, `${mode} ${cle} : variables définies`);
      assert.ok(contraste(fond, texte) >= 4.5, `${mode} ${cle} : ${texte} sur ${fond} = ${contraste(fond, texte).toFixed(2)}`);
    }
  }
});

test('chaque type et chaque mode d\'accès a sa classe dans la feuille de styles', () => {
  for (const cle of typesCles) assert.ok(css.includes(`.type-${cle} `), `.type-${cle}`);
  for (const cle of accesCles) assert.ok(css.includes(`.acces-${cle} `), `.acces-${cle}`);
});
