const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/js/gabarits.js');
const { echapper } = require('../public/js/texte.js');

const IDS = ['lien', 'recue', 'approuvee', 'refusee', 'panneau', 'resume'];
// L'apostrophe droite et sa forme échappée se lisent pareil dans un courriel.
const lisible = (html) => html.replace(/&#39;/g, "'");
const liens = (html) => (html.match(/<a\b/g) || []).length;

// ─── Ce que les courriels contenaient avant les gabarits (recopié de lib/courriels.js d'avant ce lot) ───
const p = (texte) => `<p>${texte}</p>`;
const petit = (texte) => `<p style="font-size:0.85rem;color:#718096">${texte}</p>`;
const bouton = (lien, libelle) => `<div style="text-align:center;margin:2rem 0"><a href="${echapper(lien)}" style="display:inline-block;padding:0.75rem 2rem;background:#0c2e53;color:#ffffff;text-decoration:none;border-radius:0.5rem;font-weight:600">${echapper(libelle)}</a></div>`
  + petit(`Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}`);
const AVANT = {
  lien: ({ lien, quoi }) => ({
    objet: `Votre lien pour ${quoi}`,
    corps: p('Bonjour,') + p(`Voici votre lien pour ${echapper(quoi)} dans la cartographie du RSN.`) + bouton(lien, 'Ouvrir le formulaire')
      + petit("Ce lien est valable 24 heures et sert pour une seule proposition. Si vous n'avez pas fait cette demande, ignorez ce courriel."),
  }),
  recue: ({ titre }) => ({
    objet: 'Proposition reçue',
    corps: p('Bonjour,') + p(`Nous avons bien reçu votre proposition : <strong>${echapper(titre)}</strong>.`)
      + p("Elle sera examinée par une personne de l'équipe. Vous recevrez un courriel dès qu'une décision sera prise.")
      + p("Merci de contribuer à la cartographie,<br>L'équipe du RSN"),
  }),
  approuvee: ({ nom, lien }) => ({
    objet: `Proposition approuvée : ${nom}`,
    corps: p('Bonjour,') + p(`Votre proposition pour <strong>${echapper(nom)}</strong> a été approuvée. Merci !`) + bouton(lien, 'Voir la fiche')
      + petit('Le changement apparaît sur le site en quelques minutes.'),
  }),
  refusee: ({ titre, commentaire }) => ({
    objet: `Proposition non retenue : ${titre}`,
    corps: p('Bonjour,') + p(`Votre proposition <strong>${echapper(titre)}</strong> n'a pas été retenue.`)
      + p(`Commentaire de la personne qui l'a examinée :<br><em>${echapper(commentaire).replace(/\r?\n/g, '<br>')}</em>`)
      + p('Vous pouvez répondre à ce courriel pour en discuter, ou faire une nouvelle proposition.'),
  }),
  panneau: ({ lien }) => ({
    objet: "Votre lien vers le panneau d'approbation",
    corps: p('Bonjour,') + p("Voici votre lien pour entrer dans le panneau d'approbation de la cartographie.") + bouton(lien, 'Entrer dans le panneau')
      + petit("Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez ce courriel."),
  }),
};

test('les six courriels existent, dans l\'ordre de l\'écran, chacun avec son texte d\'origine valide', () => {
  assert.deepEqual(G.COURRIELS.map((c) => c.id), IDS);
  for (const c of G.COURRIELS) {
    assert.ok(c.nom && c.quand && c.aQui, c.id);
    const v = G.valider(c.id, G.origine(c.id));
    assert.deepEqual(v.erreurs, {}, c.id);
    assert.deepEqual(v.gabarit, G.origine(c.id), `${c.id} : le texte d'origine est déjà dans sa forme rangée`);
    for (const r of [...c.reperes, ...c.requis]) assert.ok(G.REPERES[r] && G.REPERES[r].aide, `${c.id} : ${r} est expliqué`);
    for (const r of c.requis) assert.ok(c.reperes.includes(r) && c.texte.includes(r), `${c.id} : ${r}`);
    assert.ok(!/—/.test(JSON.stringify(c)), `${c.id} : pas de tiret cadratin`);
  }
  // Les courriels à lien exigent {lien} ; le refus exige {commentaire}.
  assert.deepEqual(G.COURRIELS.filter((c) => c.requis.includes('{lien}')).map((c) => c.id), ['lien', 'approuvee', 'panneau', 'resume']);
  assert.deepEqual(G.courrielDe('refusee').requis, ['{commentaire}']);
  assert.deepEqual(G.courrielDe('recue').requis, []);
  // Un bouton pour chaque courriel à lien, et pour eux seulement.
  assert.deepEqual(G.COURRIELS.map((c) => c.bouton), ['Ouvrir le formulaire', null, 'Voir la fiche', null, 'Entrer dans le panneau', 'Ouvrir le panneau']);
  // Les repères demandés au minimum existent.
  for (const r of ['{nom}', '{ressource}', '{commentaire}', '{nombre de propositions}', '{lien}']) assert.ok(G.REPERES[r], r);
  assert.equal(G.courrielDe('inconnu'), null);
  assert.equal(G.origine('inconnu'), null);
});

test('les textes d\'origine donnent les courriels d\'avant : même objet, même contenu, même bouton', () => {
  const lien = 'https://site/proposer?jeton=abc&x=1';
  const cas = [
    ['lien', { '{but du lien}': 'proposer une ressource', '{lien}': lien }, AVANT.lien({ lien, quoi: 'proposer une ressource' })],
    ['lien', { '{but du lien}': 'modifier la fiche CARTaGENE', '{lien}': lien }, AVANT.lien({ lien, quoi: 'modifier la fiche CARTaGENE' })],
    ['recue', { '{proposition}': 'Nouvelle : Outil <X>', '{ressource}': 'Outil <X>' }, AVANT.recue({ titre: 'Nouvelle : Outil <X>' })],
    ['approuvee', { '{ressource}': "L'outil & Cie", '{lien}': 'https://site/ressource/x' }, AVANT.approuvee({ nom: "L'outil & Cie", lien: 'https://site/ressource/x' })],
    ['refusee', { '{proposition}': 'Modification : CARTaGENE', '{ressource}': 'CARTaGENE', '{commentaire}': 'Première ligne\nDeuxième <ligne>' }, AVANT.refusee({ titre: 'Modification : CARTaGENE', commentaire: 'Première ligne\nDeuxième <ligne>' })],
    ['panneau', { '{lien}': 'https://site/admin?jeton=abc' }, AVANT.panneau({ lien: 'https://site/admin?jeton=abc' })],
  ];
  for (const [id, valeurs, avant] of cas) {
    const rendu = G.rendre(id, G.origine(id), valeurs);
    assert.equal(rendu.objet, avant.objet, id);
    assert.equal(lisible(rendu.corps), lisible(avant.corps), id);
  }
});

test('le résumé hebdomadaire d\'origine : le compte dans l\'objet, la liste ajoutée par le code avant le bouton', () => {
  const propositions = [{ titre: 'Nouvelle : Outil <b>X</b>', proposeLe: '2026-11-20T15:00:00.000Z' }, { titre: 'Modification : CARTaGENE', proposeLe: '2026-12-01T15:00:00.000Z' }, { titre: '' }, null];
  const rendu = G.rendre('resume', G.origine('resume'), { '{nombre de propositions}': G.nombreDePropositions(2), '{lien}': 'https://site/admin' }, { propositions });
  assert.equal(rendu.objet, '2 propositions à examiner dans la cartographie');
  assert.ok(rendu.corps.startsWith('<p>Bonjour,</p><p>2 propositions en attente'));
  assert.ok(rendu.corps.includes('<li style="margin:0 0 6px;">Nouvelle : Outil &lt;b&gt;X&lt;/b&gt; <span style="color:#64748b;">(reçue le 20 novembre)</span></li>'));
  assert.ok(rendu.corps.includes('<li style="margin:0 0 6px;">Modification : CARTaGENE <span style="color:#64748b;">(reçue le 1er décembre)</span></li>'));
  assert.equal((rendu.corps.match(/<li /g) || []).length, 2, 'une ligne sans titre ne sort pas');
  assert.ok(rendu.corps.indexOf('</ul>') < rendu.corps.indexOf('Ouvrir le panneau'), 'la liste précède le bouton');
  assert.ok(rendu.corps.indexOf('Ouvrir le panneau') < rendu.corps.indexOf('une fois par semaine'));
  assert.ok(rendu.corps.includes('<p style="font-size:0.85rem;color:#718096">Ce résumé est envoyé une fois par semaine'));
  assert.equal(G.nombreDePropositions(1), '1 proposition');
  assert.equal(G.nombreDePropositions(12), '12 propositions');
  // Au-delà de trente, la liste s'arrête et le dit.
  const beaucoup = Array.from({ length: 34 }, (_, i) => ({ titre: `Nouvelle : ${i}` }));
  const long = G.rendre('resume', G.origine('resume'), { '{nombre de propositions}': G.nombreDePropositions(34), '{lien}': 'https://site/admin' }, { propositions: beaucoup });
  assert.equal((long.corps.match(/<li /g) || []).length, 30);
  assert.ok(long.corps.includes('… et 4 autres.'));
  // Sans bouton dans le texte, la liste vient à la fin.
  const sansBouton = G.rendre('resume', { objet: 'O', texte: 'Voir {lien} pour la suite.' }, { '{lien}': 'https://site/admin' }, { propositions });
  assert.ok(sansBouton.corps.endsWith('</ul>'));
});

test('{lien} seul sur sa ligne devient le bouton ; ailleurs, c\'est du texte, jamais un lien cliquable', () => {
  const valeurs = { '{but du lien}': 'proposer une ressource', '{lien}': 'https://site/x?a=1&b=2' };
  const seul = G.rendre('lien', { objet: 'O', texte: 'Avant\n\n{lien}\n\nAprès' }, valeurs);
  assert.equal(liens(seul.corps), 1);
  assert.ok(seul.corps.includes('<a href="https://site/x?a=1&amp;b=2"'));
  assert.ok(seul.corps.includes('>Ouvrir le formulaire</a>'));
  assert.ok(seul.corps.includes('copiez cette adresse dans votre navigateur :<br>https://site/x?a=1&amp;b=2'));
  // Entouré d'espaces, ou collé au paragraphe voisin sans ligne vide : toujours le bouton.
  assert.equal(liens(G.rendre('lien', { objet: 'O', texte: 'Avant\n  {lien}\t\nAprès' }, valeurs).corps), 1);
  const colle = G.rendre('lien', { objet: 'O', texte: 'Avant\n{lien}\nAprès' }, valeurs);
  assert.equal(lisible(colle.corps), `<p>Avant</p>${bouton(valeurs['{lien}'], 'Ouvrir le formulaire')}${petit('Après')}`);
  // Dans une phrase : l'adresse en clair, échappée, sans balise de lien.
  const dedans = G.rendre('lien', { objet: 'O', texte: 'Ouvrez {lien} dans votre navigateur.' }, valeurs);
  assert.equal(liens(dedans.corps), 0);
  assert.equal(dedans.corps, '<p>Ouvrez https://site/x?a=1&amp;b=2 dans votre navigateur.</p>');
  // Deux fois seul : deux boutons, rien de plus.
  assert.equal(liens(G.rendre('lien', { objet: 'O', texte: '{lien}\n\n{lien}' }, valeurs).corps), 2);
  // Un courriel sans bouton ne fabrique pas de lien, même si le texte en demande un.
  const sans = G.rendre('recue', { objet: 'O', texte: 'Texte\n\n{lien}' }, { '{lien}': 'https://piege.exemple' });
  assert.equal(liens(sans.corps), 0);
  assert.ok(!sans.corps.includes('piege.exemple'));
  assert.ok(sans.corps.includes('{lien}'), 'un repère qui n\'est pas de ce courriel reste du texte');
});

test('tout est échappé : le texte du gabarit comme les valeurs insérées', () => {
  const mechant = '<script>alert(1)</script>"><a href="https://piege.exemple">ici</a>';
  const gabarit = { objet: `Refus <b>{proposition}</b> ${mechant}`, texte: `Bonjour <img src=x onerror=alert(1)> {nom},\n\n${mechant}\n\n{proposition} et {ressource}\n\n{commentaire}` };
  const rendu = G.rendre('refusee', gabarit, { '{nom}': mechant, '{proposition}': mechant, '{ressource}': mechant, '{commentaire}': `${mechant}\n{lien}\n{nom}` });
  for (const interdit of ['<script', '<img', '<a ', '<b>', 'href="https://piege']) assert.ok(!rendu.corps.includes(interdit), interdit);
  assert.ok(rendu.corps.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;a href=&quot;https://piege.exemple&quot;&gt;ici&lt;/a&gt;'));
  // Seules balises du corps : celles que le code pose lui-même.
  assert.deepEqual([...new Set(rendu.corps.match(/<\/?[a-z]+/g))].sort(), ['</em', '</p', '</strong', '<br', '<em', '<p', '<strong']);
  // L'objet est du texte brut : rien n'y est interprété, et il tient sur une ligne.
  assert.equal(rendu.objet, `Refus <b>${mechant}</b> ${mechant}`);
  // Des accolades dans une valeur ne sont pas relues comme des repères.
  const accolades = G.rendre('refusee', G.origine('refusee'), { '{proposition}': '{commentaire} {lien} {nom}', '{commentaire}': '{proposition}' });
  assert.ok(accolades.corps.includes('<strong>{commentaire} {lien} {nom}</strong>'));
  assert.ok(accolades.corps.includes('<em>{proposition}</em>'));
  assert.equal(accolades.objet, 'Proposition non retenue : {commentaire} {lien} {nom}');
  // Une valeur ne peut pas fabriquer un bouton en glissant « {lien} » seul sur une ligne.
  const glisse = G.rendre('approuvee', G.origine('approuvee'), { '{ressource}': 'X\n{lien}\nY', '{lien}': 'https://site/r' });
  assert.equal(liens(glisse.corps), 1);
  // L'enveloppe n'ajoute que son propre lien de réponse.
  assert.equal(liens(G.enveloppe(glisse.corps)), 2);
});

test('un retour de ligne dans une valeur ne passe pas dans l\'objet', () => {
  const rendu = G.rendre('refusee', G.origine('refusee'), { '{proposition}': 'Nouvelle : X\r\nBcc: z@z.zz\n\tSuite', '{commentaire}': 'c' });
  assert.ok(!/[\r\n\t]/.test(rendu.objet));
  assert.equal(rendu.objet, 'Proposition non retenue : Nouvelle : X Bcc: z@z.zz Suite');
  // Ni depuis le gabarit lui-même, s'il venait d'ailleurs que de l'écran.
  assert.equal(G.rendre('recue', { objet: 'Ligne 1\nLigne 2', texte: 'T' }, {}).objet, 'Ligne 1 Ligne 2');
  // {lien} n'est jamais remplacé dans l'objet.
  assert.equal(G.rendre('panneau', { objet: 'Entrez {lien}', texte: '{lien}' }, { '{lien}': 'https://site/admin?jeton=secret' }).objet, 'Entrez {lien}');
});

test('mise en forme : paragraphes séparés par une ligne vide, retours de ligne gardés, petit texte après le bouton', () => {
  const rendu = G.rendre('panneau', { objet: 'O', texte: 'Un\nDeux\n\n\n\nTrois\n\n{lien}\n\nQuatre\nCinq\n\nSix' }, { '{lien}': 'https://site/admin' });
  assert.equal(lisible(rendu.corps), `<p>Un<br>Deux</p><p>Trois</p>${bouton('https://site/admin', 'Entrer dans le panneau')}${petit('Quatre<br>Cinq')}${petit('Six')}`);
  // Une valeur vide ne laisse pas d'espace orphelin, et un paragraphe resté vide disparaît.
  const sansNom = G.rendre('panneau', { objet: 'Bonjour {nom} !', texte: 'Bonjour {nom},\n\n{nom}\n\n{lien}' }, { '{nom}': '', '{lien}': 'https://site/admin' });
  assert.equal(sansNom.objet, 'Bonjour !');
  assert.ok(sansNom.corps.startsWith('<p>Bonjour,</p><div'));
  const avecNom = G.rendre('panneau', { objet: 'Bonjour {nom} !', texte: 'Bonjour {nom},\n\n{lien}' }, { '{nom}': 'Maxime', '{lien}': 'https://site/admin' });
  assert.equal(avecNom.objet, 'Bonjour Maxime !');
  assert.ok(avecNom.corps.startsWith('<p>Bonjour Maxime,</p>'));
  // Une accolade seule reste du texte.
  assert.equal(G.rendre('recue', { objet: 'O', texte: 'a { b } c {' }, {}).corps, '<p>a { b } c {</p>');
});

test('l\'enveloppe garde la mise en page d\'avant', () => {
  const html = G.enveloppe('<p>Corps</p>');
  assert.ok(html.startsWith('<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:2rem;color:#1a202c">'));
  assert.ok(html.includes('<h2 style="color:#0c2e53;margin:0 0 1.5rem;text-align:center;font-size:1.15rem">Cartographie du Réseau santé numérique</h2>\n<p>Corps</p>\n<hr'));
  assert.ok(html.includes('Réseau santé numérique (RSN) · <a href="mailto:rsn.gestion@rimuhc.ca" style="color:#718096">rsn.gestion@rimuhc.ca</a>'));
  assert.equal(G.REPONSE, 'rsn.gestion@rimuhc.ca');
});

test('valider : longueurs, repères inconnus, repère indispensable', () => {
  const bon = { objet: '  Votre   lien\t ', texte: '\r\nBonjour,\r\n\r\n{lien}  \r\n\r\nFin   \n\n' };
  assert.deepEqual(G.valider('panneau', bon), { ok: true, gabarit: { objet: 'Votre lien', texte: 'Bonjour,\n\n{lien}\n\nFin' }, erreurs: {} });
  const erreurs = (id, objet, texte) => G.valider(id, { objet, texte }).erreurs;
  // Longueurs : 200 pour l'objet, 5 000 pour le texte, à la lettre près.
  assert.deepEqual(erreurs('recue', 'o'.repeat(200), 't'.repeat(5000)), {});
  assert.match(erreurs('recue', 'o'.repeat(201), 'T').objet, /200/);
  assert.match(erreurs('recue', 'O', 't'.repeat(5001)).texte, /5[  ]?000/);
  assert.ok(erreurs('recue', '   ', 'T').objet);
  assert.ok(erreurs('recue', 'O', ' \n ').texte);
  // Repères inconnus : dans l'objet comme dans le texte, et un repère d'un autre courriel aussi.
  assert.match(erreurs('recue', 'O {inconnu}', 'T').objet, /\{inconnu\}/);
  assert.match(erreurs('recue', 'O', 'T {durée du lien} et {}').texte, /\{durée du lien\}/);
  assert.match(erreurs('recue', 'O', 'T {commentaire}').texte, /\{commentaire\}/);
  assert.match(erreurs('recue', 'O', 'T { nom }').texte, /\{ nom \}/);
  assert.match(erreurs('recue', 'O', 'T {lien}').texte, /\{lien\}/);
  assert.deepEqual(erreurs('recue', 'O {nom}', 'T {proposition} {ressource}'), {});
  // Repère indispensable : {lien} pour les courriels à lien, {commentaire} pour le refus.
  for (const id of ['lien', 'approuvee', 'panneau', 'resume']) {
    assert.match(erreurs(id, 'O', 'Sans le lien.').texte, /\{lien\}/, id);
    assert.match(erreurs(id, 'O', 'Avec {lien}.').texte, /seul sur sa ligne/, id);
    assert.deepEqual(erreurs(id, 'O', 'Avec :\n{lien}\net aussi {lien}.'), {}, id);
    // Dans l'objet, le lien ne compte pas et n'a pas sa place.
    assert.match(erreurs(id, 'O {lien}', 'Avec\n{lien}').objet, /\{lien\}/, id);
  }
  assert.match(erreurs('refusee', 'O', 'Sans raison.').texte, /\{commentaire\}/);
  assert.deepEqual(erreurs('refusee', 'O', 'Parce que : {commentaire}'), {});
  // Ce qui n'est pas un gabarit.
  for (const brut of [null, undefined, 'texte', [], {}, { objet: 'O' }, { objet: 1, texte: 'T' }, { objet: 'O', texte: ['T'] }]) {
    const v = G.valider('recue', brut);
    assert.equal(v.ok, false);
    assert.equal(v.gabarit, null);
    assert.ok(Object.keys(v.erreurs).length);
  }
  assert.equal(G.valider('inconnu', { objet: 'O', texte: 'T' }).ok, false);
  // Les caractères de commande sont retirés.
  assert.deepEqual(G.valider('recue', { objet: 'O\u0000\u0007', texte: 'T\u0000\u001b[0m' }).gabarit, { objet: 'O', texte: 'T[0m' });
});

test('le gabarit en vigueur : celui du panneau s\'il est valide, sinon le texte d\'origine', () => {
  const origine = G.origine('approuvee');
  const modifie = { objet: 'En ligne : {ressource}', texte: 'Bravo {nom} !\n\n{lien}' };
  assert.deepEqual(G.gabaritEnVigueur('approuvee', { etat: 'present', valeur: modifie }), { gabarit: modifie, modifie: true, ignore: null });
  // Enregistré mais devenu invalide : ignoré, pour qu'un courriel ne parte jamais sans son lien.
  for (const valeur of [{ objet: 'O', texte: 'Sans lien' }, { objet: 'O', texte: '{lien} {inconnu}' }, { objet: '', texte: '{lien}' }, 'texte', null, 12, { objet: 'O', texte: `{lien}${'x'.repeat(5000)}` }]) {
    assert.deepEqual(G.gabaritEnVigueur('approuvee', { etat: 'present', valeur }), { gabarit: origine, modifie: false, ignore: 'invalide' });
  }
  assert.deepEqual(G.gabaritEnVigueur('approuvee', { etat: 'illisible' }), { gabarit: origine, modifie: false, ignore: 'illisible' });
  for (const lecture of [{ etat: 'absent' }, { etat: 'inconnu' }, null, undefined]) assert.deepEqual(G.gabaritEnVigueur('approuvee', lecture), { gabarit: origine, modifie: false, ignore: null });
});

test('chaque courriel a des valeurs d\'exemple pour l\'aperçu et l\'essai, qui remplissent tous ses repères', () => {
  for (const c of G.COURRIELS) {
    const ex = G.exemple(c.id, 'https://carto.exemple');
    for (const r of c.reperes) assert.ok(typeof ex.valeurs[r] === 'string' && ex.valeurs[r], `${c.id} : ${r}`);
    if (c.reperes.includes('{lien}')) assert.ok(ex.valeurs['{lien}'].startsWith('https://carto.exemple/'), c.id);
    const rendu = G.rendre(c.id, G.origine(c.id), ex.valeurs, ex);
    assert.ok(!/\{[^{}]*\}/.test(rendu.objet + rendu.corps), `${c.id} : aucun repère ne reste`);
    assert.equal(liens(rendu.corps), c.bouton ? 1 : 0, c.id);
  }
  assert.ok(G.exemple('resume').propositions.length >= 2);
  assert.ok(G.exemple('lien').valeurs['{lien}'].startsWith('https://cartographie.rsn.quebec/'));
});

test('un courriel à bouton exige le repère {lien} seul sur sa ligne', () => {
  const { valider, origine, COURRIELS } = require('../public/js/gabarits');
  for (const c of COURRIELS.filter((x) => x.bouton)) {
    assert.equal(valider(c.id, origine(c.id)).ok, true, `le texte d'origine de ${c.id}`);
    for (const texte of ['Cliquez{lien}ici', 'Voici : {lien}', '{{lien}}']) {
      const v = valider(c.id, { objet: 'Objet', texte });
      assert.equal(v.ok, false, `${c.id} : ${texte}`);
      assert.match(v.erreurs.texte, /seul sur sa ligne/);
    }
    assert.equal(valider(c.id, { objet: 'Objet', texte: 'Bonjour,\n\n  {lien}  \n\nMerci' }).ok, true);
  }
});

test("objet : les caractères de commande et de sens d'écriture d'une valeur n'y entrent pas", () => {
  const rendu = G.rendre('recue', { objet: 'Reçu : {proposition}', texte: 'T' }, { '{proposition}': 'a\u0000b\u001bc‮d⁦e‏f' });
  assert.equal(rendu.objet, 'Reçu : abcdef');
});
