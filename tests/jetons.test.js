const test = require('node:test');
const assert = require('node:assert/strict');
const { signer, verifier, normaliserCourriel, DUREES } = require('../lib/jetons');

const secret = 'secret-d-essai';

test('chaque sorte de jeton fait un aller-retour', () => {
  const charges = {
    proposer: { courriel: 'a@exemple.org' },
    modifier: { courriel: 'a@exemple.org', ficheId: 'abc-123' },
    panneau: { courriel: 'a@exemple.org' },
    session: { courriel: 'a@exemple.org' },
  };
  assert.deepEqual(Object.keys(DUREES).sort(), Object.keys(charges).sort());
  for (const [sorte, charge] of Object.entries(charges)) {
    const lu = verifier(signer(sorte, charge, { secret }), sorte, { secret });
    for (const [cle, valeur] of Object.entries(charge)) assert.equal(lu[cle], valeur);
    assert.equal(lu.sorte, sorte);
    assert.match(lu.jti, /^[0-9a-f-]{36}$/);
  }
});

test('deux jetons identiques ont des identifiants différents', () => {
  const a = verifier(signer('proposer', { courriel: 'a@exemple.org' }, { secret }), 'proposer', { secret });
  const b = verifier(signer('proposer', { courriel: 'a@exemple.org' }, { secret }), 'proposer', { secret });
  assert.notEqual(a.jti, b.jti);
});

test("un jeton n'est pas accepté pour une autre sorte", () => {
  const jeton = signer('proposer', { courriel: 'a@exemple.org' }, { secret });
  assert.equal(verifier(jeton, 'panneau', { secret }), null);
  assert.equal(verifier(jeton, 'session', { secret }), null);
});

test('un jeton échu, falsifié ou signé avec un autre secret est refusé', () => {
  const echu = signer('proposer', { courriel: 'a@exemple.org' }, { secret, duree: -1 });
  assert.equal(verifier(echu, 'proposer', { secret }), null);
  const bon = signer('proposer', { courriel: 'a@exemple.org' }, { secret });
  assert.equal(verifier(bon.slice(0, -3) + 'abc', 'proposer', { secret }), null);
  assert.equal(verifier(bon, 'proposer', { secret: 'autre' }), null);
  assert.equal(verifier('', 'proposer', { secret }), null);
  assert.equal(verifier(undefined, 'proposer', { secret }), null);
});

test('une sorte inconnue est refusée à la signature', () => {
  assert.throws(() => signer('admin', { courriel: 'a@exemple.org' }, { secret }), /Sorte de jeton inconnue/);
});

test('sans secret, signer et vérifier lèvent', () => {
  assert.throws(() => signer('proposer', { courriel: 'a@exemple.org' }, { secret: '' }), /JWT_SECRET manquant/);
  assert.throws(() => verifier('x', 'proposer', { secret: '' }), /JWT_SECRET manquant/);
});

test('normaliserCourriel met en minuscules et rogne', () => {
  assert.equal(normaliserCourriel('  Tess@Exemple.CA '), 'tess@exemple.ca');
});

test('normaliserCourriel refuse ce qui ne ressemble pas à une adresse', () => {
  for (const mauvais of ['abc', 'a@b', 'a b@c.ca', '@c.ca', 'a@c.ca\nBcc: x@y.z', '', null, undefined, 42, `${'a'.repeat(250)}@c.ca`]) {
    assert.equal(normaliserCourriel(mauvais), null, String(mauvais).slice(0, 20));
  }
});
