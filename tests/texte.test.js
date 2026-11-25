const test = require('node:test');
const assert = require('node:assert/strict');
const { echapper, filtrer, filtresActifs, comptesDeFiltre, cleAcces, TEXTES, valeursDeFiltre, initiales, nomCourt, decouperAutresLiens, CLES_TYPE } = require('../public/js/texte.js');
const { htmlFiche, htmlCarteFiche, htmlLogo } = require('../public/js/fiche.js');

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

test('filtrer accepte plusieurs valeurs par filtre : une suffit dans un filtre, les filtres se combinent', () => {
  const liste = [
    fiche('A', { typePrincipal: 'Plateforme ou infrastructure', modesAcces: ['Ouvert'], porteurs: [{ nom: 'Mila' }], etat: 'Actif' }),
    fiche('B', { typePrincipal: 'Logiciel ou application', modesAcces: ['Sur inscription'], porteurs: [{ nom: 'ISQ' }], etat: 'Archivé' }),
    fiche('C', { typePrincipal: 'Service ou accompagnement', secondType: 'Logiciel ou application', modesAcces: ['Ouvert'], porteurs: [{ nom: 'ISQ' }], etat: 'Actif' }),
  ];
  assert.deepEqual(filtrer(liste, { type: ['Plateforme ou infrastructure', 'Logiciel ou application'] }).map((f) => f.nom), ['A', 'B', 'C']);
  assert.deepEqual(filtrer(liste, { type: ['Logiciel ou application'], modeAcces: ['Ouvert'] }).map((f) => f.nom), ['C']);
  assert.deepEqual(filtrer(liste, { porteur: ['Mila', 'ISQ'], etat: ['Actif'] }).map((f) => f.nom), ['A', 'C']);
  assert.deepEqual(filtrer(liste, { type: [], modeAcces: [], porteur: [], etat: [] }).map((f) => f.nom), ['A', 'B', 'C']);
  assert.equal(filtresActifs({ type: [], modeAcces: [], porteur: [], etat: [], horsCarte: false }), false);
  assert.equal(filtresActifs({ type: [], porteur: ['Mila'] }), true);
  assert.equal(filtresActifs({ horsCarte: true }), true);
});

test('comptesDeFiltre compte les fiches par valeur, de la plus fréquente à la moins fréquente', () => {
  const liste = [
    fiche('A', { secondType: 'Plateforme ou infrastructure', porteurs: [{ nom: 'Mila' }, { nom: 'IVADO' }], modesAcces: ['Ouvert'], etat: 'Actif' }),
    fiche('B', { porteurs: [{ nom: 'Mila' }], modesAcces: ['Ouvert', 'Ouvert'], etat: 'Actif' }),
  ];
  const c = comptesDeFiltre(liste);
  assert.deepEqual(c.type, [{ valeur: 'Logiciel ou application', nombre: 2 }, { valeur: 'Plateforme ou infrastructure', nombre: 1 }]);
  assert.deepEqual(c.porteur, [{ valeur: 'Mila', nombre: 2 }, { valeur: 'IVADO', nombre: 1 }]);
  assert.deepEqual(c.modeAcces, [{ valeur: 'Ouvert', nombre: 2 }]);
  assert.deepEqual(c.etat, [{ valeur: 'Actif', nombre: 2 }]);
});

test('initiales : deux lettres, sans les petits mots, jamais vide', () => {
  assert.equal(initiales('Banque de cerveaux Douglas-Bell Canada'), 'BC');
  assert.equal(initiales('CARTaGENE'), 'CA');
  assert.equal(initiales('AxonDeepSeg'), 'AD');
  assert.equal(initiales('Mila'), 'MI');
  assert.equal(initiales("Alliance de recherche numérique du Canada"), 'AR');
  assert.equal(initiales('Étude sur la santé'), 'ÉS');
  assert.equal(initiales(''), '?');
  assert.equal(initiales(null), '?');
  assert.equal(initiales('<b>x</b>').includes('<'), false);
});

test('nomCourt ne garde la parenthèse finale que si c\'est un sigle', () => {
  assert.equal(nomCourt('Centre de recherche du CHUM (CRCHUM)'), 'CRCHUM');
  assert.equal(nomCourt('McGill Centre for Integrative Neuroscience (MCIN)'), 'MCIN');
  assert.equal(nomCourt('NeuroPoly (Polytechnique Montréal)'), 'NeuroPoly (Polytechnique Montréal)');
  assert.equal(nomCourt('Mila'), 'Mila');
  assert.equal(nomCourt(null), '');
});

test('decouperAutresLiens sépare les libellés des adresses et refuse ce qui n\'est pas http(s)', () => {
  assert.deepEqual(decouperAutresLiens("processus d'accès : https://exemple.org/acces ; catalogue : https://exemple.org/cat"), [
    { libelle: "processus d'accès", adresse: 'https://exemple.org/acces' },
    { libelle: 'catalogue', adresse: 'https://exemple.org/cat' },
  ]);
  assert.deepEqual(decouperAutresLiens('https://exemple.org/seul'), [{ libelle: 'https://exemple.org/seul', adresse: 'https://exemple.org/seul' }]);
  assert.deepEqual(decouperAutresLiens('piège : javascript:alert(1)'), [{ libelle: 'piège : javascript:alert(1)', adresse: null }]);
  assert.deepEqual(decouperAutresLiens('simple note'), [{ libelle: 'simple note', adresse: null }]);
  assert.deepEqual(decouperAutresLiens(''), []);
  assert.deepEqual(decouperAutresLiens(null), []);
});

test('htmlFiche affiche les autres liens : texte échappé, lien seulement pour une adresse http(s)', () => {
  const html = htmlFiche(fiche('X', { autresLiens: 'portail : https://exemple.org/p ; <b>piège</b> : javascript:alert(1)' }));
  assert.ok(html.includes(TEXTES.fiche.autresLiens));
  assert.ok(html.includes('href="https://exemple.org/p"'));
  assert.ok(html.includes('>portail</a>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&lt;b&gt;piège&lt;/b&gt;'));
  assert.ok(!htmlFiche(fiche('X')).includes(TEXTES.fiche.autresLiens));
});

test('htmlFiche écrit « Oui » depuis les textes de l\'interface', () => {
  const html = htmlFiche(fiche('X', { jumelage: true }));
  assert.ok(html.includes(echapper(TEXTES.fiche.jumelage)));
  assert.ok(html.includes(`<dd>${TEXTES.oui}</dd>`));
});

test('le logo : une image seulement pour une adresse http(s), sinon les initiales', () => {
  const sans = htmlLogo(fiche('CARTaGENE', { typePrincipal: 'Jeu de données, cohorte ou biobanque' }));
  assert.ok(!sans.includes('<img'));
  assert.ok(sans.includes('>CA</span>'));
  assert.ok(sans.includes('type-jeu'));
  assert.ok(!sans.includes('avec-logo'));
  const avec = htmlLogo(fiche('Mila', { logo: 'https://exemple.org/logo.png?a=1&b="2"' }));
  assert.ok(avec.includes('src="https://exemple.org/logo.png?a=1&amp;b=&quot;2&quot;"'));
  assert.ok(avec.includes('loading="lazy"'));
  assert.ok(avec.includes('referrerpolicy="no-referrer"'));
  assert.ok(avec.includes('alt=""'));
  assert.ok(avec.includes('avec-logo'));
  assert.ok(avec.includes('MI<img'), 'les initiales restent sous l\'image, pour le cas où elle ne se charge pas');
  for (const hostile of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//exemple.org/x.png', '']) {
    const html = htmlLogo(fiche('Mila', { logo: hostile }));
    assert.ok(!html.includes('<img'), hostile);
  }
  assert.ok(htmlFiche(fiche('Mila', { logo: 'https://exemple.org/logo.png' })).includes('src="https://exemple.org/logo.png"'));
});

test('htmlCarteFiche : logo ou initiales, lien vers la fiche, tout est échappé, pas de bande de couleur', () => {
  const html = htmlCarteFiche(fiche('<i>Nom</i>', {
    adresse: 'nom', phrase: '<script>alert(1)</script>', porteurs: [{ nom: '<u>P1</u>' }, { nom: 'P2' }, { nom: 'P3' }],
    modesAcces: ['<s>Ouvert</s>'], logo: 'javascript:alert(1)',
  }));
  for (const interdit of ['<i>', '<script', '<u>', '<s>', '<img', 'javascript:']) assert.ok(!html.includes(interdit), interdit);
  assert.ok(html.includes('href="/ressource/nom"'));
  assert.ok(html.includes('data-fiche="nom"'));
  assert.ok(html.includes('data-graphe="nom"'));
  assert.ok(html.includes('<span class="card-porteur">&lt;u&gt;P1&lt;/u&gt;</span>'), 'un seul porteur est écrit');
  assert.ok(html.includes('<span class="card-plus">+2'), 'les autres porteurs sont comptés');
  assert.ok(html.includes('title="&lt;u&gt;P1&lt;/u&gt; · P2 · P3"'), 'tous les porteurs sont dans l\'infobulle');
  assert.ok(html.includes('title="&lt;i&gt;Nom&lt;/i&gt;"'), 'le nom complet est dans l\'infobulle');
  assert.ok(html.includes('class="member-card"'), 'la carte ne porte pas de classe de type, donc pas de bande de couleur');
  assert.ok(htmlCarteFiche(fiche('A', { logo: 'https://exemple.org/a.png' })).includes('<img src="https://exemple.org/a.png"'));
});

test('chaque type a un nom court dans les textes', () => {
  for (const cle of Object.values(CLES_TYPE).concat(['autre'])) assert.equal(typeof TEXTES.typesCourts[cle], 'string', cle);
});

test('cleAcces : une teinte par mode d\'accès, neutre pour le reste', () => {
  assert.equal(cleAcces('Ouvert'), 'ouvert');
  assert.equal(cleAcces('Sur inscription'), 'inscription');
  assert.equal(cleAcces('Sur demande évaluée'), 'demande');
  assert.equal(cleAcces('Réservé ou interne'), 'reserve');
  assert.equal(cleAcces('Non précisé par la ressource'), 'neutre');
  assert.equal(cleAcces('Sans objet'), 'neutre');
  assert.equal(cleAcces('"><b>'), 'neutre');
  assert.equal(TEXTES.acces('Ouvert'), 'Accès : Ouvert');
  assert.equal(TEXTES.acces('Non précisé par la ressource'), 'Accès : non précisé par la ressource');
});

test('htmlCarteFiche : l\'accès est précédé de son libellé et porte sa teinte ; deux sujets cliquables, puis « +n »', () => {
  const html = htmlCarteFiche(fiche('A', {
    modesAcces: ['Ouvert', 'Non précisé par la ressource'],
    motsCles: ['génomique', '<b>IA</b>', 'cohorte', 'oncologie', 'imagerie'],
  }));
  assert.ok(html.includes('<span class="axe-chip acces acces-ouvert">Accès : Ouvert</span>'));
  assert.ok(html.includes('<span class="axe-chip acces acces-neutre">Accès : non précisé par la ressource</span>'));
  assert.equal((html.match(/data-mot-cle=/g) || []).length, 2);
  assert.ok(html.includes('href="/?q=g%C3%A9nomique" data-mot-cle="génomique"'));
  assert.ok(html.includes('data-mot-cle="&lt;b&gt;IA&lt;/b&gt;"'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('title="cohorte · oncologie · imagerie">+3'));
  const sans = htmlCarteFiche(fiche('B', { motsCles: ['un', 'deux'] }));
  assert.ok(!sans.includes('chip-more'));
  assert.ok(!sans.includes('Accès'));
  // Dans la fiche, la ligne s'appelle déjà « Mode d'accès » : la teinte, sans le libellé.
  assert.ok(htmlFiche(fiche('C', { modesAcces: ['Sur demande évaluée'] })).includes('<span class="axe-chip acces acces-demande">Sur demande évaluée</span>'));
});

test('adresseLogo accepte une copie locale ou une adresse http(s), rien d\'autre', () => {
  const { adresseLogo } = require('../public/js/texte.js');
  assert.equal(adresseLogo('/logos/0123456789abcdef.png'), '/logos/0123456789abcdef.png');
  assert.equal(adresseLogo('https://exemple.org/a.png'), 'https://exemple.org/a.png');
  assert.equal(adresseLogo('/logos/../../etc/passwd'), null);
  assert.equal(adresseLogo('javascript:alert(1)'), null);
  assert.equal(adresseLogo('//exemple.org/a.png'), null);
  assert.equal(adresseLogo(null), null);
});

// ─── Filtres Portée et Langue ───

test('filtrer par portée et langue, en intersection avec les autres filtres', () => {
  const liste = [
    fiche('A', { portee: 'Le Québec', langues: ['Français', 'Anglais'], etat: 'Actif' }),
    fiche('B', { portee: 'International', langues: ['Anglais'], etat: 'Actif' }),
    fiche('C', { portee: 'Le Québec', langues: ['Français'], etat: 'Archivé' }),
    fiche('D', { portee: null, langues: [] }),
  ];
  assert.deepEqual(filtrer(liste, { portee: 'Le Québec' }).map((f) => f.nom), ['A', 'C']);
  assert.deepEqual(filtrer(liste, { portee: ['Le Québec', 'International'] }).map((f) => f.nom), ['A', 'B', 'C']);
  assert.deepEqual(filtrer(liste, { langue: ['Français'] }).map((f) => f.nom), ['A', 'C']);
  assert.deepEqual(filtrer(liste, { langue: ['Français', 'Anglais'] }).map((f) => f.nom), ['A', 'B', 'C']);
  assert.deepEqual(filtrer(liste, { portee: ['Le Québec'], langue: ['Français'], etat: ['Actif'] }).map((f) => f.nom), ['A']);
  assert.deepEqual(filtrer(liste, { portee: [], langue: [] }).map((f) => f.nom), ['A', 'B', 'C', 'D']);
});

test('portée et langue comptent parmi les filtres actifs et ont leurs comptes', () => {
  assert.equal(filtresActifs({ portee: ['Le Québec'] }), true);
  assert.equal(filtresActifs({ langue: ['Anglais'] }), true);
  assert.equal(filtresActifs({ portee: [], langue: [] }), false);
  const liste = [
    fiche('A', { portee: 'Le Québec', langues: ['Français', 'Anglais'] }),
    fiche('B', { portee: 'Le Québec', langues: ['Anglais', 'Anglais'] }),
    fiche('C', { portee: null, langues: [] }),
  ];
  const c = comptesDeFiltre(liste);
  assert.deepEqual(c.portee, [{ valeur: 'Le Québec', nombre: 2 }]);
  assert.deepEqual(c.langue, [{ valeur: 'Anglais', nombre: 2 }, { valeur: 'Français', nombre: 1 }]);
  assert.deepEqual(valeursDeFiltre(liste).langue, ['Anglais', 'Français']);
  assert.equal(TEXTES.filtres.portee, 'Portée');
  assert.equal(TEXTES.filtres.langue, 'Langue');
  // Pas de filtre « Frais » : trop de fiches ne le précisent pas.
  assert.equal(c.frais, undefined);
});

// ─── Icônes des types ───

test('chaque type a son icône, tracée dans une grille de 24', () => {
  const { iconeType, puceType, TRACES_ICONES } = require('../public/js/texte.js');
  for (const cle of [...Object.values(CLES_TYPE), 'autre']) {
    assert.ok(Array.isArray(TRACES_ICONES[cle]) && TRACES_ICONES[cle].length > 0, cle);
    for (const d of TRACES_ICONES[cle]) assert.match(d, /^M[\d.\- ]/, `${cle} : ${d}`);
  }
  const svg = iconeType('logiciel');
  assert.match(svg, /^<svg class="icone-type" viewBox="0 0 24 24" aria-hidden="true">(<path d="[^"<>]+"\/>)+<\/svg>$/);
  assert.equal(iconeType('inconnu'), iconeType('autre'));
  assert.notEqual(iconeType('jeu'), iconeType('catalogue'));
  assert.equal(puceType('jeu'), `<span class="puce-type">${iconeType('jeu')}</span>`);
});

// ─── Normes, outils, et cinq types ───

test('htmlFiche affiche les normes et formats, et les outils, quand la fiche en a', () => {
  const avec = htmlFiche(fiche('CODA', { normes: ['HL7 FHIR', 'CIM-10'], outils: ['Docker'] }));
  assert.ok(avec.includes(TEXTES.fiche.normes) && avec.includes('HL7 FHIR') && avec.includes('CIM-10'));
  assert.ok(avec.includes(TEXTES.fiche.outils) && avec.includes('Docker'));
  const sans = htmlFiche(fiche('Vide', { normes: [], outils: [] }));
  assert.ok(!sans.includes(TEXTES.fiche.normes) && !sans.includes(TEXTES.fiche.outils));
  const hostile = htmlFiche(fiche('H', { normes: ['<b>x</b>'] }));
  assert.ok(!hostile.includes('<b>x</b>'));
});

test('le site ne connaît plus que cinq types : « Initiative » est retiré', () => {
  assert.deepEqual(Object.values(CLES_TYPE), ['jeu', 'catalogue', 'plateforme', 'logiciel', 'service']);
  assert.equal(TEXTES.typesCourts.initiative, undefined);
  assert.equal(TEXTES.typesAides.initiative, undefined);
  assert.equal(require('../public/js/texte.js').TRACES_ICONES.initiative, undefined);
});

test('filtre « Normes et formats » : une norme cochée suffit, en intersection avec les autres', () => {
  const liste = [
    fiche('A', { normes: ['BIDS', 'NIfTI'], portee: 'Le Québec' }), fiche('B', { normes: ['DICOM'], portee: 'Le Québec' }),
    fiche('C', { normes: [], outils: ['Docker'] }), fiche('D', {}),
  ];
  assert.deepEqual(filtrer(liste, { norme: ['BIDS'] }).map((f) => f.nom), ['A']);
  assert.deepEqual(filtrer(liste, { norme: ['BIDS', 'DICOM'] }).map((f) => f.nom), ['A', 'B']);
  assert.deepEqual(filtrer(liste, { norme: ['DICOM'], portee: ['Le Québec'] }).map((f) => f.nom), ['B']);
  assert.deepEqual(filtrer(liste, { norme: [] }).map((f) => f.nom), ['A', 'B', 'C', 'D']);
  assert.equal(filtresActifs({ norme: ['BIDS'] }), true);
  assert.deepEqual(comptesDeFiltre(liste).norme, [{ valeur: 'BIDS', nombre: 1 }, { valeur: 'DICOM', nombre: 1 }, { valeur: 'NIfTI', nombre: 1 }]);
  assert.equal(TEXTES.filtres.norme, 'Normes et formats');
});

test('la carte d\'une fiche montre ses normes et ses outils, distincts des sujets', () => {
  const html = htmlCarteFiche(fiche('CODA', { motsCles: ['oncologie'], normes: ['HL7 FHIR', 'DICOM'], outils: ['Docker'] }));
  assert.ok(html.includes('<span class="axe-chip norme">HL7 FHIR</span>'));
  assert.ok(html.includes('<span class="axe-chip norme">DICOM</span>'));
  assert.ok(html.includes('<span class="axe-chip outil">Docker</span>'));
  assert.ok(!htmlCarteFiche(fiche('Vide', {})).includes('card-reperes'));
  // Au-delà de quatre, le reste est compté.
  const beaucoup = htmlCarteFiche(fiche('N', { normes: ['A1', 'B2', 'C3', 'D4', 'E5'], outils: ['F6'] }));
  assert.ok(beaucoup.includes('>+2<') && !beaucoup.includes('>E5<'));
  assert.ok(!htmlCarteFiche(fiche('H', { normes: ['<i>x</i>'] })).includes('<i>x</i>'));
});

test('la fiche affiche le DOI comme un lien, écrit sans le préfixe doi.org', () => {
  const html = htmlFiche(fiche('BALSAC', { doi: 'https://doi.org/10.5683/SP3/BW7DIG' }));
  assert.ok(html.includes('href="https://doi.org/10.5683/SP3/BW7DIG"'));
  assert.ok(html.includes('>10.5683/SP3/BW7DIG<'));
  assert.ok(!htmlFiche(fiche('Sans', {})).includes('>DOI<'));
  // Une adresse qui n'est pas celle d'un DOI n'est pas affichée.
  assert.ok(!htmlFiche(fiche('Faux', { doi: 'javascript:alert(1)' })).includes('alert(1)'));
});

test('la mention du bas dit seulement d\'où vient la fiche', () => {
  assert.equal(TEXTES.fiche.nonConfirmee, "Fiche préparée par l'équipe du RSN à partir de sources publiques.");
});

test('la carte porte un bandeau de type, avec son icône', () => {
  const html = htmlCarteFiche(fiche('X', { typePrincipal: 'Logiciel ou application' }));
  assert.match(html, /<div class="card-bandeau type-logiciel" title="Logiciel ou application"><span class="puce-type"><svg class="icone-type"/);
});

// ─── Carte plus complète : site, portée ───

test('la carte donne le lien vers le site de la ressource et sa portée', () => {
  const html = htmlCarteFiche(fiche('CODA', { lien: 'https://www.coda-platform.com/', portee: 'Le Québec', motsCles: ['a1', 'b2', 'c3', 'd4'] }));
  assert.ok(html.includes('<a class="card-site" href="https://www.coda-platform.com/" target="_blank" rel="noopener noreferrer">'));
  assert.ok(html.includes(TEXTES.fiche.visiter));
  assert.ok(html.includes('<span class="axe-chip portee">Portée : Le Québec</span>'));
  // Deux sujets visibles, les autres comptés : la carte ne s'allonge pas.
  assert.ok(html.includes('>a1<') && html.includes('>b2<') && !html.includes('>c3<') && html.includes('>+2<'));
});

test('sans lien sûr ni portée, la carte n\'affiche ni bouton ni étiquette vide', () => {
  const html = htmlCarteFiche(fiche('X', { lien: 'javascript:alert(1)', portee: null }));
  assert.ok(!html.includes('card-site') && !html.includes('alert(1)') && !html.includes('axe-chip portee'));
});

// ─── Carte : une information par ligne, bouton « Voir la fiche » mis en avant ───

test('la carte sépare l\'accès et la portée, et met en avant « Voir la fiche »', () => {
  const html = htmlCarteFiche(fiche('CODA', { modesAcces: ['Ouvert'], portee: 'Le Québec', lien: 'https://exemple.org/' }));
  // L'accès et la portée sont sur deux rangées distinctes.
  assert.match(html, /<div class="card-chips-row card-acces"><span class="axe-chip acces acces-ouvert">Accès : Ouvert<\/span><\/div>/);
  assert.match(html, /<div class="card-chips-row card-portee"><span class="axe-chip portee">Portée : Le Québec<\/span><\/div>/);
  // « Voir la fiche » est le bouton principal, précédé d'un « + » décoratif.
  assert.match(html, /<a class="card-action principale" href="\/ressource\/[^"]+" data-fiche="[^"]+"><span class="plus" aria-hidden="true">\+<\/span>Voir la fiche/);
});

test('textes du formulaire de contribution', () => {
  const { TEXTES: T, CLES_TYPE: TYPES } = require('../public/js/texte.js');
  const { CHAMPS } = require('../public/js/champs.js');
  const C = T.contribuer;
  for (const cle of Object.values(TYPES)) {
    assert.ok(C.types[cle].definition.length > 10, cle);
    assert.equal(C.types[cle].exemples.length, 2, cle);
  }
  for (const champ of CHAMPS.filter((c) => c.role === 'proposant')) assert.ok(C.champs[champ.cle] && C.champs[champ.cle].libelle, champ.cle);
  for (const lien of ['responsable', 'jy-travaille', 'aucun']) assert.ok(C.liens[lien], lien);
  const tout = JSON.stringify(C, (cle, v) => (typeof v === 'function' ? v('X') : v));
  assert.ok(!tout.includes('—'), 'pas de tiret cadratin');
});

test('le profil du responsable suit le nom du responsable dans le formulaire', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/proposer.js'), 'utf8');
  assert.match(source, /\['contact', \['contact', 'responsable', 'profilResponsable'\]\]/);
});
