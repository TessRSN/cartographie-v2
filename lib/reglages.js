/**
 * Les réglages que l'équipe change depuis le panneau, dans la base Notion « Réglages » : une ligne
 * par réglage, avec sa clé, la date et la personne du dernier changement. La valeur est du JSON
 * dans un bloc de code du corps de la page, comme pour les propositions et les versions.
 * Clés : « modeEssai » (vrai ou faux), « contributionsOuvertes », « messageFerme », « conditions »,
 * et « courriel.<id> » pour le texte de chaque courriel ({ objet, texte }).
 *
 * La lecture ne lève jamais, parce qu'elle sert à chaque envoi de courriel et aux pages publiques :
 * - sans le réglage NOTION_DB_REGLAGES, tout est « absent » et rien ne s'écrit ;
 * - les réglages sont gardés en mémoire une minute par instance, et la mémoire est vidée à chaque écriture ;
 * - une panne de lecture rend la dernière valeur connue de l'instance, sinon « inconnu » ;
 * - les pages publiques lisent par lireTousVite, qui n'attend pas Notion longtemps ;
 * - le mode d'essai fait exception : « coupé » ne vaut que relu dans la base à l'instant (lireModeEssai).
 * L'écriture, elle, remonte ses pannes : la personne qui change un réglage doit savoir s'il est gardé.
 * La liste d'une base Notion peut retarder de quelques secondes sur une écriture : pendant une
 * minute, l'instance qui vient d'écrire un réglage garde ce qu'elle a écrit, quoi que dise la liste.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');

const COLONNES = {
  cle: 'Clé',                 // title
  modifieLe: 'Modifié le',    // date
  modifiePar: 'Modifié par',  // email
};
const CLES = { modeEssai: 'modeEssai', contributionsOuvertes: 'contributionsOuvertes', messageFerme: 'messageFerme', conditions: 'conditions' };
const cleCourriel = (id) => `courriel.${id}`;
const FORME_CLE = /^[A-Za-z][A-Za-z0-9.]{0,59}$/;
const cleValide = (cle) => typeof cle === 'string' && FORME_CLE.test(cle);
const DUREE_MEMOIRE_MS = 60000;
// Après une lecture en panne, la base n'est pas rappelée avant ce délai : un envoi de courriel ou
// une page publique n'attend pas Notion à chaque demande.
const PAUSE_APRES_PANNE_MS = 15000;
// Ce qu'une page publique attend de Notion avant de se contenter des dernières valeurs connues ;
// et, quand rien n'est connu (instance neuve), avant de renoncer.
const ATTENTE_PUBLIQUE_MS = 2500;
const ATTENTE_SANS_RIEN_MS = 8000;

const texteDe = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.plain_text || '').join('');
const instantDe = (iso) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? 0 : t; };

/**
 * Le mode d'essai des courriels en vigueur. « lecture » : ce que rend lire('modeEssai').
 * - le panneau a une valeur (vrai ou faux) : elle décide ;
 * - une ligne existe mais ne dit ni vrai ni faux : le mode d'essai est ACTIF ;
 * - rien dans le panneau, ou pas de base « Réglages » : la variable EMAIL_TEST_MODE, comme avant ;
 * - rien de connu (base illisible) : la variable si elle dit « true » ou « false »,
 *   et sinon le mode d'essai est ACTIF : on n'écrit pas au public par accident.
 * Renvoie { actif, source } ; source : 'panneau', 'vercel' ou 'precaution'.
 * Ce n'est que la première lecture : voir lireModeEssai, qui ne croit « coupé » que relu à l'instant.
 */
function modeEssaiEnVigueur(lecture, env = process.env) {
  const variable = env ? env.EMAIL_TEST_MODE : undefined;
  const etat = lecture && lecture.etat;
  if (etat === 'present' && typeof lecture.valeur === 'boolean') return { actif: lecture.valeur, source: 'panneau' };
  if (etat === 'present' || etat === 'illisible') return { actif: true, source: 'precaution' };
  if (etat === 'absent') return { actif: variable === 'true', source: 'vercel' };
  if (variable === 'true' || variable === 'false') return { actif: variable === 'true', source: 'vercel' };
  return { actif: true, source: 'precaution' };
}

// Le mode d'essai en vigueur d'après un socle de réglages (ou sans socle : la variable seule).
// Ne lève jamais : un socle qui ne répond pas vaut « rien de connu ».
// « Actif » peut venir de la mémoire de l'instance. « Coupé » envoie des courriels aux vraies
// personnes : avec une base « Réglages », il ne vaut que si la base, relue à l'instant, le confirme.
// - la relecture échoue : actif ;
// - une des lignes du réglage dit vrai, ou ne se lit pas : actif (deux lignes contraires : la plus sûre gagne) ;
// - toutes disent faux : coupé ; aucune ligne : la variable EMAIL_TEST_MODE décide.
async function lireModeEssai(reglages, env = process.env) {
  let lecture = { etat: 'absent' };
  if (reglages) {
    try { lecture = (await reglages.lire(CLES.modeEssai)) || { etat: 'inconnu' }; } catch (err) { lecture = { etat: 'inconnu' }; }
  }
  const premiere = modeEssaiEnVigueur(lecture, env);
  if (premiere.actif || !reglages || typeof reglages.lignesALInstant !== 'function') return premiere;
  let lignes;
  try {
    if (!reglages.active()) return premiere;
    lignes = await reglages.lignesALInstant(CLES.modeEssai);
  } catch (err) { return { actif: true, source: 'precaution' }; }
  if (!Array.isArray(lignes)) return { actif: true, source: 'precaution' };
  if (!lignes.length) return { actif: (env ? env.EMAIL_TEST_MODE : undefined) === 'true', source: 'vercel' };
  if (lignes.some((l) => !l.illisible && l.valeur === true)) return { actif: true, source: 'panneau' };
  if (lignes.every((l) => !l.illisible && l.valeur === false)) return { actif: false, source: 'panneau' };
  return { actif: true, source: 'precaution' };
}

function creerReglages(client, env = process.env, { maintenant = Date.now, journal = console.error } = {}) {
  const active = () => !!(env && env.NOTION_DB_REGLAGES);
  let memoire = null;       // { le, donnees } : la dernière lecture, valable une minute
  let derniere = null;      // la dernière lecture réussie, sans limite d'âge
  let enVol = null;         // la lecture en cours, partagée par les demandes simultanées
  let panneLe = -Infinity;
  let generation = 0;       // une lecture commencée avant une écriture ne remplit pas la mémoire
  // Ce que cette instance vient d'écrire : clé → { entree (null si retirée), pageId, retirees, fin }.
  const recentes = new Map();
  const dire = (...texte) => { try { journal(...texte); } catch (err) { /* rien de plus à faire */ } };

  async function pagesDeLaBase() {
    const pages = []; let curseur;
    do {
      const reponse = await client.databases.query({ database_id: env.NOTION_DB_REGLAGES, page_size: 100, start_cursor: curseur });
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    return pages.filter((page) => !page.archived && !page.in_trash).map((page) => {
      const p = page.properties || {};
      return {
        pageId: page.id, cle: texteDe(p[COLONNES.cle]).trim(),
        modifieLe: (p[COLONNES.modifieLe] && p[COLONNES.modifieLe].date && p[COLONNES.modifieLe].date.start) || null,
        modifiePar: normaliserCourriel((p[COLONNES.modifiePar] || {}).email) || null,
      };
    }).filter((l) => cleValide(l.cle));
  }
  // Le bloc de code d'une ligne : sa valeur, ou « illisible » s'il manque ou n'est pas du JSON.
  async function lireBloc(pageId) {
    const reponse = await client.blocks.children.list({ block_id: pageId, page_size: 50 });
    const bloc = (reponse.results || []).find((b) => b.type === 'code');
    if (!bloc) return { blocId: null, valeur: undefined, illisible: true };
    try {
      return { blocId: bloc.id, valeur: JSON.parse((bloc.code.rich_text || []).map((s) => s.plain_text || '').join('')), illisible: false };
    } catch (err) { return { blocId: bloc.id, valeur: undefined, illisible: true }; }
  }
  // Toute la base : clé → { valeur, illisible, modifieLe, modifiePar }. Deux lignes pour une même
  // clé : la plus récente compte, et l'entrée porte « contradictoire: true » si les lignes ne disent
  // pas toutes la même chose ou si l'une d'elles est illisible (à qui lit de choisir le plus sûr).
  async function charger() {
    const parCle = new Map(); const autres = new Map();
    for (const l of await pagesDeLaBase()) {
      const deja = parCle.get(l.cle);
      if (!deja) { parCle.set(l.cle, l); continue; }
      const gagne = instantDe(l.modifieLe) >= instantDe(deja.modifieLe);
      autres.set(l.cle, [...(autres.get(l.cle) || []), gagne ? deja : l]);
      if (gagne) parCle.set(l.cle, l);
    }
    const donnees = new Map();
    const file = [...parCle.values()];
    // Trois lectures à la fois, pour ménager Notion.
    const ouvrier = async () => {
      while (file.length) {
        const l = file.shift();
        const { valeur, illisible } = await lireBloc(l.pageId);
        const entree = { valeur, illisible, modifieLe: l.modifieLe, modifiePar: l.modifiePar };
        for (const double of autres.get(l.cle) || []) {
          const autre = await lireBloc(double.pageId);
          if (illisible || autre.illisible || JSON.stringify(autre.valeur) !== JSON.stringify(valeur)) entree.contradictoire = true;
        }
        donnees.set(l.cle, entree);
      }
    };
    await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
    return donnees;
  }

  // Ce que l'instance vient d'écrire passe devant ce que la base a rendu.
  function avecRecentes(donnees) {
    const t = maintenant();
    const vue = new Map(donnees);
    for (const [cle, r] of recentes) {
      if (r.fin <= t) { recentes.delete(cle); continue; }
      if (r.entree) vue.set(cle, r.entree); else vue.delete(cle);
    }
    return vue;
  }
  // { etat: 'lus' | 'absente' | 'inconnu', perime, donnees }. Ne lève jamais.
  async function etatDesReglages() {
    if (!active()) return { etat: 'absente', perime: false, donnees: new Map() };
    const t = maintenant();
    if (memoire && t - memoire.le < DUREE_MEMOIRE_MS) return { etat: 'lus', perime: false, donnees: avecRecentes(memoire.donnees) };
    if (t - panneLe >= PAUSE_APRES_PANNE_MS) {
      if (!enVol) {
        const depart = generation;
        enVol = charger().then((donnees) => {
          derniere = donnees;
          if (depart === generation) memoire = { le: maintenant(), donnees };
          return donnees;
        }, (err) => {
          panneLe = maintenant();
          dire('[réglages] base « Réglages » illisible :', err && err.message);
          return null;
        }).finally(() => { enVol = null; });
      }
      const donnees = await enVol;
      if (donnees) return { etat: 'lus', perime: false, donnees: avecRecentes(donnees) };
    }
    if (derniere) return { etat: 'lus', perime: true, donnees: avecRecentes(derniere) };
    return { etat: 'inconnu', perime: false, donnees: avecRecentes(new Map()) };
  }
  function vider() { memoire = null; generation += 1; panneLe = -Infinity; }
  function retenir(cle, quoi) { recentes.set(cle, { retirees: new Set(), ...quoi, fin: maintenant() + DUREE_MEMOIRE_MS }); }

  // Les lignes d'une clé, relues à l'instant, de la plus récente à la plus ancienne.
  async function lignesDe(cle) {
    const r = recentes.get(cle);
    const retirees = r && r.fin > maintenant() ? r.retirees : new Set();
    return (await pagesDeLaBase()).filter((l) => l.cle === cle && !retirees.has(l.pageId))
      .map((l, rang) => ({ ...l, rang })).sort((a, b) => instantDe(b.modifieLe) - instantDe(a.modifieLe) || b.rang - a.rang);
  }
  const exigerCle = (cle) => { if (!cleValide(cle)) throw new Error('réglage invalide : clé mal formée'); };

  // Un réglage : { etat, valeur, modifieLe, modifiePar }.
  // etat : 'present', 'absent' (la valeur d'origine vaut), 'illisible' (une ligne existe, sa valeur
  // n'est pas du JSON), ou 'inconnu' (base illisible et rien de connu).
  async function lire(cle) {
    const rien = (etat) => ({ etat, valeur: undefined, modifieLe: null, modifiePar: null });
    if (!cleValide(cle)) return rien('absent');
    const { etat, donnees } = await etatDesReglages();
    const entree = donnees.get(cle);
    if (entree) return { etat: entree.illisible ? 'illisible' : 'present', valeur: entree.illisible ? undefined : entree.valeur, modifieLe: entree.modifieLe, modifiePar: entree.modifiePar };
    // Un réglage que cette instance vient de retirer est absent, même si la base ne répond plus.
    const r = recentes.get(cle);
    if (etat === 'inconnu' && !(r && r.fin > maintenant())) return rien('inconnu');
    return rien('absent');
  }

  const socle = {
    active,
    vider,
    lire,

    // Toutes les lignes d'une clé, relues dans la base à l'instant, sans mémoire et sans ce que
    // l'instance vient d'écrire : [{ valeur, illisible, modifieLe, modifiePar }]. Lève si Notion ne répond pas.
    async lignesALInstant(cle) {
      exigerCle(cle);
      if (!active()) return [];
      const lignes = (await pagesDeLaBase()).filter((l) => l.cle === cle);
      return Promise.all(lignes.map(async (l) => {
        const { valeur, illisible } = await lireBloc(l.pageId);
        return { valeur, illisible, modifieLe: l.modifieLe, modifiePar: l.modifiePar };
      }));
    },

    // Tous les réglages d'un coup : { etat, perime, reglages: { clé: { valeur, illisible, modifieLe, modifiePar } } }.
    // etat : 'lus', 'absente' (pas de base), ou 'inconnu' (base illisible et rien de connu).
    // perime : vrai si la base n'a pas pu être relue et que ce sont les dernières valeurs connues.
    async lireTous() {
      const { etat, perime, donnees } = await etatDesReglages();
      return { etat, perime, reglages: Object.fromEntries(donnees) };
    },

    // Comme lireTous, pour les pages publiques : elles n'attendent pas Notion longtemps.
    // - mémoire de moins d'une minute : servie tout de suite ;
    // - sinon la base est relue, mais au bout de « attenteMs » ce sont les dernières valeurs connues
    //   qui sont servies (perime: vrai), et la lecture finit seule pour la demande suivante ;
    // - rien de connu : l'attente va jusqu'à « attenteSansRienMs », puis l'état est « inconnu ».
    async lireTousVite({ attenteMs = ATTENTE_PUBLIQUE_MS, attenteSansRienMs = ATTENTE_SANS_RIEN_MS } = {}) {
      let minuterie;
      const tropLong = new Promise((suite) => { minuterie = setTimeout(() => suite(null), derniere ? attenteMs : attenteSansRienMs); });
      try {
        const lu = await Promise.race([etatDesReglages(), tropLong]);
        const { etat, perime, donnees } = lu || (derniere
          ? { etat: 'lus', perime: true, donnees: avecRecentes(derniere) }
          : { etat: 'inconnu', perime: false, donnees: avecRecentes(new Map()) });
        return { etat, perime, reglages: Object.fromEntries(donnees) };
      } finally { clearTimeout(minuterie); }
    },

    // Le mode d'essai des courriels en vigueur : { actif, source }. Ne lève jamais.
    async modeEssai() {
      return lireModeEssai(socle, env);
    },

    // Écrit un réglage : met sa ligne à jour, ou la crée. Renvoie { ok: true }, ou
    // { ok: false, code: 'absente' } sans la base. Une panne de Notion remonte en erreur.
    async ecrire(cle, valeur, par) {
      exigerCle(cle);
      const json = valeur === undefined ? undefined : JSON.stringify(valeur);
      if (json === undefined) throw new Error('réglage invalide : valeur sans forme JSON');
      if (!active()) return { ok: false, code: 'absente' };
      const instant = new Date(maintenant()).toISOString();
      const courriel = normaliserCourriel(par);
      const proprietes = { [COLONNES.modifieLe]: { date: { start: instant } } };
      if (courriel) proprietes[COLONNES.modifiePar] = { email: courriel };
      const code = { rich_text: segments(json), language: 'json' };
      const lignes = await lignesDe(cle);
      // La ligne que cette instance vient de créer, si la liste de la base ne la montre pas encore.
      const r = recentes.get(cle);
      let pageId = lignes.length ? lignes[0].pageId : (r && r.entree && r.pageId && r.fin > maintenant() ? r.pageId : null);
      if (pageId) {
        const { blocId } = await lireBloc(pageId);
        if (blocId) await client.blocks.update({ block_id: blocId, code });
        else await client.blocks.children.append({ block_id: pageId, children: [{ object: 'block', type: 'code', code }] });
        await client.pages.update({ page_id: pageId, properties: proprietes });
        // Les lignes en double pour cette clé sont rangées : une seule reste.
        for (const autre of lignes.slice(1)) {
          try { await client.pages.update({ page_id: autre.pageId, archived: true }); } catch (err) { dire('[réglages] ligne en double non rangée :', err && err.message); }
        }
      } else {
        const page = await client.pages.create({
          parent: { database_id: env.NOTION_DB_REGLAGES },
          properties: { [COLONNES.cle]: { title: segments(cle) }, ...proprietes },
          children: [{ object: 'block', type: 'code', code }],
        });
        pageId = page.id;
      }
      retenir(cle, { entree: { valeur: JSON.parse(json), illisible: false, modifieLe: instant, modifiePar: courriel || null }, pageId });
      vider();
      return { ok: true };
    },

    // Retire un réglage : sa ligne va à la corbeille de Notion, la valeur d'origine revient.
    // { ok: true, inchange: true } s'il n'y avait rien à retirer.
    async retirer(cle) {
      exigerCle(cle);
      if (!active()) return { ok: false, code: 'absente' };
      const lignes = await lignesDe(cle);
      const r = recentes.get(cle);
      const creee = !lignes.length && r && r.entree && r.pageId && r.fin > maintenant() ? [{ pageId: r.pageId }] : [];
      const aRetirer = [...lignes, ...creee];
      if (!aRetirer.length) return { ok: true, inchange: true };
      for (const l of aRetirer) await client.pages.update({ page_id: l.pageId, archived: true });
      retenir(cle, { entree: null, pageId: null, retirees: new Set(aRetirer.map((l) => l.pageId)) });
      vider();
      return { ok: true };
    },
  };
  return socle;
}

module.exports = { creerReglages, modeEssaiEnVigueur, lireModeEssai, cleCourriel, cleValide, CLES, COLONNES, DUREE_MEMOIRE_MS };
