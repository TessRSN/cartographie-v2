const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { faussePage } = require('./aides/fausse-page');
const { TEXTES } = require('../public/js/texte.js');

const RG = TEXTES.panneau.reglages; const SV = TEXTES.panneau.sauvegardes;
const lirePublic = (...morceaux) => fs.readFileSync(path.join(__dirname, '..', 'public', ...morceaux), 'utf8');
const PIEGE = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'';
const moi = (role) => () => ({ code: 200, donnees: { nom: 'Tess Berthier', courriel: 'tess@exemple.ca', role, permis: { decider: role !== 'lecture', administrer: role === 'administration' } } });
const installation = (extra = {}) => ({
  site: 'https://carto.exemple', expedition: 'cartographie@cartographie.rsn.quebec', reponse: 'rsn.gestion@rimuhc.ca',
  bases: [{ nom: 'Ressources', definie: true }, { nom: 'Sauvegardes', definie: false }],
  cleNotion: true, serviceEnvoi: true, adresseEssai: false, compteur: false, secretLiens: true, secretTaches: true, indexation: false,
  durees: { proposer: { n: 24, unite: 'h' }, panneau: { n: 1, unite: 'h' }, session: { n: 7, unite: 'j' } }, plafonds: { parCourriel: 3, parIp: 10, parJour: 80 },
  taches: { resume: 'lundi', liens: 'mercredi' }, ...extra,
});
const ORIGINE = TEXTES.contribuer.conditions;
const vueReglages = (extra = {}) => ({
  reglages: { actifs: true, lus: true, perime: false },
  contributions: { ouvertes: true, choix: true, source: 'defaut', modifieLe: null, modifiePar: null },
  messageFerme: { texte: TEXTES.contribuer.fermees, origine: TEXTES.contribuer.fermees, modifie: false, ecarte: false, modifieLe: null, modifiePar: null },
  conditions: { texte: ORIGINE, origine: ORIGINE, modifie: false, ecarte: false, modifieLe: null, modifiePar: null },
  limites: { messageFerme: 300, conditions: 2000 }, installation: installation(), sauvegardes: { actives: true },
  vu: { ouvertes: null, messageFerme: null, conditions: '2026-11-20T10:00:00.000Z' }, ...extra,
});
const sansBalise = (html) => { assert.ok(!/<script|<img|onerror=alert\(2\)>"/.test(html), 'rien de ce qui vient des données ne devient du HTML'); };

async function page({ role = 'administration', reponses = {}, hash = 'reglages' } = {}) {
  const p = faussePage({ hash: `#${hash}`, reponses: { moi: moi(role), ...reponses } });
  await p.repos();
  return p;
}

test('la page : « Réglages » et « Sauvegardes » sont dans la barre latérale, et leurs actions sont appelées', () => {
  const source = lirePublic('js', 'admin.js');
  assert.match(source, /const ROUTES = \[[^\]]*'reglages', 'sauvegardes'\]/);
  assert.deepEqual([TEXTES.panneau.routes.reglages, TEXTES.panneau.routes.sauvegardes], ['Réglages', 'Sauvegardes']);
  for (const action of ['enregistrer-reglages', 'sauvegarder', "action: 'sauvegarde'"]) assert.ok(source.includes(action), action);
  assert.match(source, /reglages: 'reglages', sauvegardes: 'sauvegardes'/);
});

test('la page : chaque texte des deux écrans que le script demande existe, sans tiret cadratin', () => {
  const source = lirePublic('js', 'admin.js');
  for (const [prefixe, textes, minimum] of [['RG', RG, 12], ['SV', SV, 15], ['I', RG.installation, 25], ['C', RG.contributions, 8], ['K', RG.conditions, 5]]) {
    const bloc = source.slice(source.indexOf('// ─── Réglages : contributions'), source.indexOf('// ─── Export en CSV'));
    const demandes = [...bloc.matchAll(new RegExp(`\\b${prefixe}\\.([A-Za-z]+(?:\\.[A-Za-z]+)*)`, 'g'))].map((m) => m[1]);
    assert.ok(demandes.length >= minimum, `${prefixe} : ${demandes.length}`);
    for (const chemin of new Set(demandes)) {
      let v = textes;
      for (const cle of chemin.split('.')) {
        if (typeof v === 'function' || typeof v === 'string') break;
        assert.ok(v && Object.hasOwn(v, cle), `${prefixe}.${chemin}`);
        v = v[cle];
      }
    }
  }
  const tout = JSON.stringify([RG, SV], (cle, v) => (typeof v === 'function' ? v(3, 'b', 'c') : v));
  assert.ok(!/—/.test(tout));
  assert.ok(!/—/.test(TEXTES.contribuer.fermees + TEXTES.contribuer.indisponibles));
});

test('écran Réglages, Administration : l\'état, les textes et le bloc « Fixé à l\'installation » ; tout ce qui vient des données est échappé', async () => {
  const p = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages({
    contributions: { ouvertes: false, choix: false, source: 'panneau', modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: PIEGE },
    messageFerme: { texte: PIEGE, origine: TEXTES.contribuer.fermees, modifie: true, ecarte: false, modifieLe: null, modifiePar: null },
    conditions: { texte: `Mes conditions ${PIEGE}`, origine: ORIGINE, modifie: true, ecarte: false, modifieLe: '2026-11-21T10:00:00.000Z', modifiePar: PIEGE },
    installation: installation({ site: `https://carto.exemple/${PIEGE}`, expedition: PIEGE, reponse: PIEGE, bases: [{ nom: PIEGE, definie: true }] }),
  }) }) } });
  const html = p.html('#gbody');
  sansBalise(html);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  for (const texte of [RG.enregistrer, RG.contributions.interrupteur, RG.contributions.fermees, RG.conditions.origine, RG.installation.titre, RG.installation.nonDefini, RG.installation.enMemoire, 'Mes conditions']) {
    assert.ok(html.includes(texte.replace(/'/g, '&#39;')) || html.includes(texte), texte);
  }
  assert.ok(!/provisoire/i.test(html), 'les conditions ne portent plus de mention « provisoire »');
  assert.match(html, /id="rgOuvertes"[^>]*(?<! checked)>/);
  assert.ok(!/id="rgOuvertes"[^>]* checked/.test(html), 'l\'interrupteur suit le choix enregistré');
  assert.ok(!/readonly/.test(html));
  // Les tâches, les durées et les limites sont dites en clair.
  assert.ok(html.includes('Chaque lundi') && html.includes('24 heures') && html.includes('7 jours') && html.includes('80 par jour'));
});

test('écran Réglages : enregistrer n\'envoie que ce qui a changé, avec la date vue pour chacun, puis l\'écran montre ce que le serveur a gardé', async () => {
  const p = await page({ reponses: {
    reglages: () => ({ code: 200, donnees: vueReglages() }),
    'enregistrer-reglages': (corps) => ({ code: 200, donnees: { ok: true, change: { contributions: 'fermees', messageFerme: true, conditions: false }, reglages: {
      ...vueReglages({ contributions: { ouvertes: false, choix: false, source: 'panneau', modifieLe: '2026-11-26T15:00:00.000Z', modifiePar: 'Tess Berthier' }, messageFerme: { texte: corps.messageFerme, origine: TEXTES.contribuer.fermees, modifie: true, ecarte: false, modifieLe: null, modifiePar: null } }),
      installation: undefined, sauvegardes: undefined,
    } } }),
  } });
  assert.match(p.html('#gbody'), /id="rgOuvertes"[^>]* checked/);
  await p.changer('rgOuvertes', { checked: false });
  await p.saisir('rgMessage', 'De retour en janvier.');
  await p.cliquer('g-enregistrer');
  const envoi = p.appels.find((a) => a.action === 'enregistrer-reglages');
  assert.deepEqual(envoi.corps, { ouvertes: false, messageFerme: 'De retour en janvier.', vu: { ouvertes: null, messageFerme: null } }, 'les conditions, pas touchées, ne partent pas');
  assert.equal(p.toast(), RG.enregistre);
  const html = p.html('#gbody');
  assert.ok(html.includes('value="De retour en janvier."') && html.includes(RG.contributions.fermees) && html.includes('Tess Berthier'));
  assert.ok(html.includes(RG.installation.titre), 'le bloc d\'installation reste affiché');
});

test('écran Réglages : une saisie refusée montre ses erreurs ; un refus de rôle le dit ; sans changement, rien n\'est perdu', async () => {
  let reponse = { code: 400, donnees: { code: 'invalide', erreurs: { conditions: 'Le texte des conditions ne peut pas être vide.' } } };
  const p = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages() }), 'enregistrer-reglages': () => reponse } });
  await p.saisir('rgConditions', '   ');
  await p.cliquer('g-enregistrer');
  assert.ok(p.html('#gbody').includes('Le texte des conditions ne peut pas être vide.'));
  assert.equal(p.toast(), RG.aCorriger);
  assert.ok(p.html('#gbody').includes('>   </textarea>'), 'la saisie reste à l\'écran');
  reponse = { code: 409, donnees: { code: 'reglages-absents' } };
  await p.cliquer('g-enregistrer');
  assert.equal(p.toast(), RG.sansBaseCourt);
  reponse = { code: 403, donnees: { code: 'role' } };
  await p.cliquer('g-enregistrer');
  assert.equal(p.toast(), TEXTES.panneau.reserveAdministration);
  // « Remettre le texte d'origine » puis « Annuler mes modifications » ne demandent rien au serveur.
  const avant = p.appels.length;
  await p.saisir('rgConditions', 'Autre texte.');
  await p.cliquer('g-origine');
  await p.cliquer('g-abandonner');
  assert.equal(p.appels.length, avant);
});

test('écran Réglages, Lecture seule ou Approbation : tout se lit, rien ne se modifie, et « Sauvegardes » n\'est pas dans la barre', async () => {
  for (const role of ['lecture', 'approbation']) {
    const p = await page({ role, reponses: { reglages: () => ({ code: 200, donnees: vueReglages() }) } });
    const html = p.html('#gbody');
    assert.ok(html.includes(RG.lectureSeule) && html.includes(RG.installation.titre));
    assert.ok(!html.includes(RG.enregistrer) && !html.includes('data-act="g-'));
    assert.match(html, /id="rgOuvertes"[^>]* disabled/);
    assert.match(html, /id="rgConditions"[^>]* readonly/);
    await p.changer('rgOuvertes', { checked: false });
    await p.saisir('rgConditions', 'Piraté');
    await p.cliquer('g-enregistrer');
    assert.ok(!p.appels.some((a) => a.action === 'enregistrer-reglages'));
    assert.ok(!p.html('#gbody').includes('Piraté'));
    assert.ok(!p.html('#nav').includes('#sauvegardes') && p.html('#nav').includes('#reglages'));
    // L'écran des sauvegardes, atteint par son adresse : il dit qu'il est réservé, sans rien demander au serveur.
    await p.aller('sauvegardes');
    assert.ok(p.html('#main').includes(SV.reserve));
    await p.cliquer('s-faire'); await p.cliquer('s-telecharger', { id: 'x' });
    assert.ok(!p.appels.some((a) => ['sauvegardes', 'sauvegarder', 'sauvegarde'].includes(a.action)));
  }
});

test('écran Réglages : sans la base, ou base illisible, l\'écran le dit', async () => {
  const sans = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages({ reglages: { actifs: false, lus: true, perime: false } }) }) } });
  assert.ok(sans.html('#gbody').includes(RG.sansBase) && !sans.html('#gbody').includes('data-act="g-enregistrer"'));
  const panne = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages({ reglages: { actifs: true, lus: false, perime: false }, contributions: { ouvertes: false, choix: false, source: 'precaution', modifieLe: null, modifiePar: null } }) }) } });
  assert.ok(panne.html('#gbody').includes(RG.illisible) && panne.html('#gbody').includes(RG.contributions.parPrecaution.replace(/’/g, '’')));
});

const COPIES = [
  { id: '10000000-0000-4000-8000-000000000001', faiteLe: '2026-11-26T15:00:00.000Z', origine: 'demande', par: PIEGE, taille: 1300000, fichier: true, incomplete: false },
  { id: '10000000-0000-4000-8000-000000000002', faiteLe: '2026-11-23T13:00:00.000Z', origine: 'automatique', par: null, taille: 900, fichier: true, incomplete: true },
  { id: '10000000-0000-4000-8000-000000000003', faiteLe: '2026-11-16T13:00:00.000Z', origine: 'automatique', par: null, taille: null, fichier: false, incomplete: false },
];
test('écran Sauvegardes, Administration : la liste, « Faire une copie maintenant » et le téléchargement par le serveur', async () => {
  const p = await page({ hash: 'sauvegardes', reponses: {
    sauvegardes: () => ({ code: 200, donnees: { actives: true, copies: COPIES, jour: 'lundi', semaines: 12 } }),
    sauvegarder: () => ({ code: 200, donnees: { ok: true, copie: { id: '10000000-0000-4000-8000-000000000009', faiteLe: '2026-11-26T16:00:00.000Z', origine: 'demande', par: 'Tess Berthier', taille: 2048, fichier: true, incomplete: false } } }),
    sauvegarde: () => ({ code: 200, donnees: {} }),
  } });
  let html = p.html('#sbody');
  sansBalise(html);
  for (const texte of [SV.faire, SV.horsNotion, SV.automatique, SV.incomplete, SV.sansFichier, SV.telecharger, '1,2 Mo', '1 ko', 'chaque lundi', '12 semaines']) assert.ok(html.includes(texte), texte);
  assert.equal((html.match(/data-act="s-telecharger"/g) || []).length, 2, 'pas de bouton pour une copie sans fichier');
  assert.ok(!/https?:\/\//.test(html), 'aucune adresse dans la liste');
  await p.cliquer('s-faire');
  assert.deepEqual(p.appels.find((a) => a.action === 'sauvegarder').corps, {});
  assert.equal(p.toast(), SV.faite);
  html = p.html('#sbody');
  assert.ok(html.indexOf('000000000009') < html.indexOf('000000000001') && html.includes('2 ko'), 'la nouvelle copie est en tête');
  await p.cliquer('s-telecharger', { id: COPIES[0].id });
  assert.deepEqual(p.appels.find((a) => a.action === 'sauvegarde').query, { action: 'sauvegarde', id: COPIES[0].id });
  assert.deepEqual(p.telechargements.map((t) => t.nom), ['sauvegarde-cartographie-2026-11-26.json']);
  // Une copie sans fichier, ou un identifiant qui n'est pas dans la liste : rien n'est demandé.
  const avant = p.appels.length;
  await p.cliquer('s-telecharger', { id: COPIES[2].id });
  await p.cliquer('s-telecharger', { id: 'https://ailleurs.exemple/x' });
  assert.equal(p.appels.length, avant);
});

test('écran Sauvegardes : pas activées, copie occupée, copie en panne, fichier introuvable', async () => {
  const inactives = await page({ hash: 'sauvegardes', reponses: { sauvegardes: () => ({ code: 200, donnees: { actives: false, copies: [], jour: 'lundi', semaines: 12 } }) } });
  assert.ok(inactives.html('#sbody').includes(SV.inactives.replace(/’/g, '’')) && !inactives.html('#sbody').includes('data-act="s-faire"'));
  await inactives.cliquer('s-faire');
  assert.ok(!inactives.appels.some((a) => a.action === 'sauvegarder'));
  let reponse = { code: 409, donnees: { code: 'occupee' } };
  const p = await page({ hash: 'sauvegardes', reponses: { sauvegardes: () => ({ code: 200, donnees: { actives: true, copies: COPIES, jour: 'lundi', semaines: 12 } }), sauvegarder: () => reponse, sauvegarde: () => reponse } });
  await p.cliquer('s-faire');
  assert.equal(p.toast(), SV.occupee);
  reponse = { code: 502, donnees: { code: 'notion' } };
  await p.cliquer('s-faire');
  assert.equal(p.toast(), SV.echec);
  await p.cliquer('s-telecharger', { id: COPIES[0].id });
  assert.equal(p.toast(), SV.echecTelechargement);
  reponse = { code: 404, donnees: { code: 'introuvable' } };
  await p.cliquer('s-telecharger', { id: COPIES[0].id });
  assert.equal(p.toast(), SV.introuvable);
  assert.equal(p.telechargements.length, 0);
  assert.ok(p.html('#sbody').includes(SV.faire), 'les boutons ne restent pas figés');
});

// ─── Le formulaire public ───
test('le formulaire : le texte des conditions et l\'état viennent du serveur, échappés, et le message de fermeture s\'affiche', () => {
  const source = lirePublic('js', 'proposer.js');
  assert.match(source, /etat\.donnees && etat\.donnees\.conditions/);
  assert.match(source, /<span class="f-conditions">\$\{e\(texteConditions\(\)\)\}<\/span>/);
  assert.ok(!source.includes('${e(T.conditions)}'), 'le texte du code n\'est plus écrit en dur dans la case');
  assert.match(source, /\/api\/proposition\?etat=1/);
  assert.match(source, /messageDeFermeture\(reponse\.status, corps\)/);
  assert.match(source, /afficherMessage\(ferme\)/);
  assert.match(lirePublic('css', 'formulaires.css'), /\.f-conditions \{ white-space: pre-line/);
  // La fenêtre « Recevoir un lien » du site montre aussi le message de l'équipe.
  const site = lirePublic('js', 'app.js');
  assert.match(site, /rep\.status === 403 \|\| rep\.status === 503/);
  assert.match(site, /messageLien\(corps\.erreur, 'error'\)/);
});

// ─── Corrections après relecture ───
test('écran Réglages : sans rien changer, rien ne part ; un seul réglage changé part seul', async () => {
  const p = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages() }), 'enregistrer-reglages': () => ({ code: 200, donnees: { ok: true, change: {}, reglages: vueReglages() } }) } });
  await p.cliquer('g-enregistrer');
  assert.ok(!p.appels.some((a) => a.action === 'enregistrer-reglages'));
  assert.equal(p.toast(), RG.inchange);
  await p.saisir('rgConditions', 'Mes conditions.');
  await p.cliquer('g-enregistrer');
  assert.deepEqual(p.appels.find((a) => a.action === 'enregistrer-reglages').corps, { conditions: 'Mes conditions.', vu: { conditions: '2026-11-20T10:00:00.000Z' } });
});

test('écran Réglages : contributions tenues fermées par précaution, l\'interrupteur part même sans avoir bougé', async () => {
  const p = await page({ reponses: {
    reglages: () => ({ code: 200, donnees: vueReglages({ contributions: { ouvertes: false, choix: false, source: 'precaution', modifieLe: '2026-11-20T10:00:00.000Z', modifiePar: null }, vu: { ouvertes: '2026-11-20T10:00:00.000Z', messageFerme: null, conditions: null } }) }),
    'enregistrer-reglages': () => ({ code: 200, donnees: { ok: true, change: {}, reglages: vueReglages() } }),
  } });
  await p.cliquer('g-enregistrer');
  assert.deepEqual(p.appels.find((a) => a.action === 'enregistrer-reglages').corps, { ouvertes: false, vu: { ouvertes: '2026-11-20T10:00:00.000Z' } });
});

test('écran Réglages : conflit avec une autre personne ; l\'écran le dit, se recharge, et garde ce qui n\'est pas en conflit', async () => {
  let lectures = 0;
  const deB = vueReglages({
    contributions: { ouvertes: false, choix: false, source: 'panneau', modifieLe: '2026-11-26T11:00:00.000Z', modifiePar: 'Maxime Lafrenière' },
    messageFerme: { texte: 'Pause de B.', origine: TEXTES.contribuer.fermees, modifie: true, ecarte: false, modifieLe: '2026-11-26T11:00:00.000Z', modifiePar: 'Maxime Lafrenière' },
    vu: { ouvertes: '2026-11-26T11:00:00.000Z', messageFerme: '2026-11-26T11:00:00.000Z', conditions: '2026-11-20T10:00:00.000Z' },
  });
  const p = await page({ reponses: {
    reglages: () => { lectures += 1; return { code: 200, donnees: lectures === 1 ? vueReglages() : deB }; },
    'enregistrer-reglages': () => ({ code: 409, donnees: { code: 'conflit', champs: ['messageFerme'] } }),
  } });
  await p.saisir('rgMessage', 'Message de A.');
  await p.saisir('rgConditions', 'Conditions de A.');
  await p.cliquer('g-enregistrer');
  assert.equal(lectures, 2, 'l\'écran a été rechargé');
  assert.equal(p.toast(), RG.conflit([RG.noms.messageFerme]));
  assert.ok(/autre personne/.test(p.toast()) && p.toast().includes('message de fermeture'));
  const html = p.html('#gbody');
  assert.ok(html.includes('value="Pause de B."'), 'le réglage en conflit montre ce que l\'autre personne a enregistré');
  assert.ok(html.includes('>Conditions de A.</textarea>'), 'ce qui n\'est pas en conflit reste à l\'écran');
  assert.ok(!/id="rgOuvertes"[^>]* checked/.test(html), 'l\'interrupteur, pas touché par A, suit la base');
  // Le nouvel enregistrement n'envoie que ce qui reste à A, avec les dates rechargées.
  await p.cliquer('g-enregistrer');
  assert.deepEqual(p.appels.filter((a) => a.action === 'enregistrer-reglages')[1].corps, { conditions: 'Conditions de A.', vu: { conditions: '2026-11-20T10:00:00.000Z' } });
});

test('écran Réglages : des valeurs qui datent (base en panne après une lecture réussie) sont annoncées comme telles', async () => {
  const p = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages({ reglages: { actifs: true, lus: true, perime: true } }) }) } });
  assert.ok(p.html('#gbody').includes(RG.perime));
  assert.ok(/ne sont peut-être plus à jour/.test(RG.perime));
  const frais = await page({ reponses: { reglages: () => ({ code: 200, donnees: vueReglages() }) } });
  assert.ok(!frais.html('#gbody').includes(RG.perime));
});

test('accueil, Administration : la dernière copie complète, avec un avertissement si elle date ou manque', async () => {
  const E = TEXTES.panneau.envois;
  const accueil = (sauvegardes) => () => ({ code: 200, donnees: { compteurs: { nouvelles: 0, verification: 0 }, activite: [], envois: { resume: { jour: 'lundi', destinataires: 1 }, contributions: true, essaiCourriels: false }, ...(sauvegardes ? { sauvegardes } : {}) } });
  const html = async (sauvegardes) => (await page({ hash: 'accueil', reponses: { accueil: accueil(sauvegardes) } })).html('#main');
  const recente = await html({ lue: true, derniere: '2026-11-23T13:00:00.000Z', alerte: false });
  assert.ok(recente.includes(E.sauvegarde) && recente.includes('23 novembre') && !recente.includes(E.sauvegardeAncienne) && recente.includes('href="#sauvegardes"'));
  const vieille = await html({ lue: true, derniere: '2026-11-01T13:00:00.000Z', alerte: true });
  assert.ok(vieille.includes(E.sauvegardeAncienne) && vieille.includes('p-warn'));
  const aucune = await html({ lue: true, derniere: null, alerte: true });
  assert.ok(aucune.includes(E.sauvegardeAucune));
  assert.ok((await html({ lue: false, derniere: null, alerte: false })).includes(E.sauvegardeIllisible));
  assert.ok(!(await html(null)).includes(E.sauvegarde), 'rien quand le serveur n\'en dit rien');
});

test('écran Sauvegardes : l\'introduction dit ce qui est copié et ce qui ne l\'est pas (les images des logos)', () => {
  const intro = SV.intro('lundi', 12);
  assert.ok(!/copie complète/.test(intro));
  assert.match(intro, /images des logos ne sont pas copiées/);
});
