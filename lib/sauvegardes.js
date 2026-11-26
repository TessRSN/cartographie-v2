/**
 * Les copies de sauvegarde. Une copie est un seul fichier JSON avec le contenu des bases Notion du
 * site : Ressources, Porteurs, Propositions (avec leur contenu), Approbateurs, Versions (avec leur
 * contenu), Journal et Réglages (avec leur valeur). Elle est déposée comme fichier dans la base
 * Notion « Sauvegardes » (réglage NOTION_DB_SAUVEGARDES), une ligne par copie : titre, date,
 * origine (Automatique ou À la demande), personne, taille, fichier.
 *
 * - Une copie automatique part chaque semaine, dans la tâche planifiée du résumé (api/resume.js) ;
 *   les copies automatiques de plus de douze semaines vont alors à la corbeille de Notion. Les
 *   copies faites à la demande ne sont jamais retirées, la dernière copie complète non plus, et
 *   rien n'est retiré après une copie incomplète.
 * - Notion qui répond « trop de demandes » ou qui dépasse son délai est rappelé une fois, après
 *   une courte attente. Un contenu qui ne se lit pas en entier n'est pas gardé à moitié : la copie
 *   est alors marquée incomplète.
 * - Les images des logos ne sont pas copiées : seulement leur nom.
 * - Une copie à la demande, la liste et le téléchargement sont réservés à l'Administration : le
 *   rôle est relu ici, pas seulement par la route du panneau.
 * - Le téléchargement ne lit que le fichier, gardé par Notion, d'une ligne de la base
 *   « Sauvegardes » : jamais une adresse donnée par la page, ni un fichier « externe » qu'on aurait
 *   mis dans la base. Ce qui est rendu doit être une copie de la cartographie.
 * - Une copie ne contient aucun réglage de l'hébergeur : ni clé, ni jeton, ni secret, ni identifiant
 *   de base, ni adresse temporaire de fichier. Elle contient les courriels de l'équipe et des
 *   personnes qui ont proposé : c'est pour cela qu'elle ne sort que par le panneau.
 * - Les copies sont gardées DANS Notion : elles protègent d'une erreur de manipulation, pas de la
 *   perte de l'espace Notion. Le téléchargement sert à garder une copie ailleurs.
 * - Chaque copie résume ce qui a changé depuis la dernière copie complète (lib/changements.js) : le
 *   résumé complet, avec les noms des lignes, est dans le fichier ; la colonne « Changements » de la
 *   ligne n'en porte que les compteurs. Cette comparaison ne fait jamais échouer une copie : si le
 *   fichier précédent ne se lit pas, ou pas à temps, le résumé dit « impossible » ; si la colonne
 *   « Changements » manque dans la base, la ligne est inscrite sans elle.
 * Sans le réglage NOTION_DB_SAUVEGARDES, rien n'est copié et rien ne casse.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');
const { comparerCopies, resumeCourt, lireResume, FORMAT } = require('./changements');

const COLONNES = {
  titre: 'Titre',       // title
  faiteLe: 'Faite le',  // date
  origine: 'Origine',   // select : Automatique, À la demande
  par: 'Par',           // email
  taille: 'Taille',     // number, en octets
  fichier: 'Fichier',   // files
  changements: 'Changements', // rich_text : le résumé court (compteurs seulement), en JSON compact
};
const ORIGINES = { automatique: 'Automatique', demande: 'À la demande' };
const VERSION = 1;
// Les bases copiées, dans l'ordre du fichier. contenu : le bloc de code du corps de chaque page est lu aussi.
const BASES = [
  { cle: 'ressources', variable: 'NOTION_DB_RESSOURCES' },
  { cle: 'porteurs', variable: 'NOTION_DB_PORTEURS' },
  { cle: 'propositions', variable: 'NOTION_DB_PROPOSITIONS', contenu: true },
  { cle: 'approbateurs', variable: 'NOTION_DB_APPROBATEURS' },
  { cle: 'versions', variable: 'NOTION_DB_VERSIONS', contenu: true },
  { cle: 'journal', variable: 'NOTION_DB_JOURNAL' },
  { cle: 'reglages', variable: 'NOTION_DB_REGLAGES', contenu: true },
];
const SEMAINES_GARDEES = 12;
// Ce que le dépôt de Notion accepte en un seul envoi.
const TAILLE_MAX = 20 * 1024 * 1024;
// Le temps accordé à la lecture des contenus : au-delà, la copie part sans ceux qui restent, et le dit.
const BUDGET_CONTENUS_MS = 30000;
// Le temps accordé à la comparaison avec la copie précédente (la retrouver, lire son fichier) : au-delà,
// la copie part avec « comparaison impossible ». Et le temps qu'une copie peut avoir déjà pris pour
// que la comparaison soit encore tentée : la fonction de l'hébergeur s'arrête à 60 secondes.
const BUDGET_COMPARAISON_MS = 10000;
const DUREE_AVANT_COMPARAISON_MS = 30000;
// Les colonnes que Notion tient lui-même : elles bougent sans que la donnée change.
const SORTES_TECHNIQUES = ['created_time', 'last_edited_time', 'created_by', 'last_edited_by'];
const technique = (prop) => !!prop && typeof prop === 'object' && SORTES_TECHNIQUES.some((sorte) => prop.type === sorte || Object.hasOwn(prop, sorte));
const colonneTitreDe = (page) => (Object.entries((page && page.properties) || {}).find(([, prop]) => prop && typeof prop === 'object' && (prop.type === 'title' || Array.isArray(prop.title))) || [])[0];
// Notion refuse la demande elle-même (par exemple une colonne qui n'existe pas dans la base).
const refusee = (err) => !!err && (err.code === 'validation_error' || err.status === 400);
const VERROU = 'sauvegarde';
const DUREE_VERROU_S = 120;
const MARQUE_INCOMPLETE = 'incomplète';
// Au-delà, l'accueil du panneau prévient que la dernière copie complète date.
const JOURS_ALERTE = 8;
const ATTENTE_REPRISE_MS = 1500;
const PAGES_DE_CONTENU_MAX = 20;
// Une panne qui passe d'elle-même : « trop de demandes », ou le délai du client dépassé.
const passagere = (err) => !!err && (err.status === 429 || err.code === 'rate_limited' || err.code === 'notionhq_client_request_timeout' || err.name === 'RequestTimeoutError' || /timed out|ETIMEDOUT/i.test(String(err.message || '')));

const sansTirets = (id) => String(id || '').replace(/-/g, '').toLowerCase();
const idValide = (id) => typeof id === 'string' && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id);
const texteDe = (morceaux) => (Array.isArray(morceaux) ? morceaux : []).map((s) => (s && (s.plain_text !== undefined ? s.plain_text : (s.text && s.text.content))) || '').join('');
const cleDe = (table, valeur) => Object.keys(table).find((cle) => table[cle] === valeur) || null;

/**
 * La valeur d'une colonne Notion, réduite à ce qui se relit : un texte, un nombre, un booléen, une
 * liste. Un fichier gardé par Notion n'a que son nom : son adresse est temporaire et signée.
 */
function valeurSimple(prop) {
  if (!prop || typeof prop !== 'object') return null;
  if (Array.isArray(prop.title)) return texteDe(prop.title);
  if (Array.isArray(prop.rich_text)) return texteDe(prop.rich_text);
  if (Object.hasOwn(prop, 'select')) return prop.select ? prop.select.name : null;
  if (Object.hasOwn(prop, 'status')) return prop.status ? prop.status.name : null;
  if (Array.isArray(prop.multi_select)) return prop.multi_select.map((o) => o.name);
  if (Array.isArray(prop.relation)) return prop.relation.map((r) => r.id);
  if (Array.isArray(prop.people)) return prop.people.map((x) => x.id);
  if (Object.hasOwn(prop, 'date')) {
    if (!prop.date) return null;
    return prop.date.end ? { debut: prop.date.start, fin: prop.date.end } : prop.date.start;
  }
  for (const sorte of ['checkbox', 'number', 'url', 'email', 'phone_number', 'created_time', 'last_edited_time']) {
    if (Object.hasOwn(prop, sorte)) return prop[sorte] === undefined ? null : prop[sorte];
  }
  if (Array.isArray(prop.files)) {
    return prop.files.map((f) => (f && f.type === 'external' && f.external ? { nom: f.name || '', adresse: f.external.url } : { nom: (f && f.name) || '' }));
  }
  if (prop.formula && typeof prop.formula === 'object') {
    const v = prop.formula[prop.formula.type];
    return v === undefined || (v && typeof v === 'object') ? valeurSimple({ [prop.formula.type]: v }) : v;
  }
  return null;
}

// roleDe : async (courriel) → le rôle de cette personne si elle est inscrite et active, sinon null.
// verrous : { prendreVerrou, rendreVerrou }, pour qu'une seule copie se fasse à la fois.
// attendre : la courte attente avant de rappeler Notion après une panne passagère.
function creerSauvegardes({ client, env = process.env, fichiers, roleDe, verrous = null, maintenant = Date.now, journal = console.error, budgetMs = BUDGET_CONTENUS_MS, budgetComparaisonMs = BUDGET_COMPARAISON_MS, attendre = () => new Promise((suite) => setTimeout(suite, ATTENTE_REPRISE_MS)) }) {
  const active = () => !!(env && env.NOTION_DB_SAUVEGARDES);
  const dire = (...texte) => { try { journal(...texte); } catch (err) { /* rien de plus à faire */ } };
  const administre = async (par) => !!par && (await roleDe(par)) === 'administration';

  // Un appel à Notion, repris une seule fois après une panne passagère.
  async function avecReprise(appeler) {
    try { return await appeler(); } catch (err) {
      if (!passagere(err)) throw err;
      await attendre();
      return appeler();
    }
  }
  async function pagesDe(baseId, requete = {}) {
    const pages = []; let curseur;
    do {
      const depuis = curseur;
      const reponse = await avecReprise(() => client.databases.query({ database_id: baseId, page_size: 100, start_cursor: depuis, ...requete }));
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    return pages.filter((page) => !page.archived && !page.in_trash);
  }
  // Le bloc de code du corps d'une page : { contenu } s'il est du JSON, { contenuBrut } sinon, {} s'il n'y en a pas.
  // Le corps est lu en entier, page après page ; s'il ne peut pas l'être, l'appel lève.
  async function contenuDe(pageId) {
    const blocs = []; let curseur; let tours = 0;
    do {
      const depuis = curseur;
      const reponse = await avecReprise(() => client.blocks.children.list({ block_id: pageId, page_size: 100, ...(depuis ? { start_cursor: depuis } : {}) }));
      blocs.push(...(reponse.results || []).filter((b) => b.type === 'code'));
      tours += 1;
      if (reponse.has_more && (!reponse.next_cursor || tours >= PAGES_DE_CONTENU_MAX)) throw new Error('contenu trop long ou suite illisible');
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    if (!blocs.length) return {};
    const brut = blocs.map((b) => texteDe(b.code && b.code.rich_text)).join('');
    try { return { contenu: JSON.parse(brut) }; } catch (err) { return { contenuBrut: brut }; }
  }

  // Lit toutes les bases. Une base réglée qui ne se lit pas fait échouer la copie entière : une
  // copie à qui il manquerait une base sans le dire serait pire que pas de copie.
  async function composer(origine, faiteLe) {
    const bases = {}; const comptes = {}; let incomplete = false;
    const limite = Date.now() + budgetMs;
    for (const base of BASES) {
      const baseId = env[base.variable];
      if (!baseId) { bases[base.cle] = { absente: true, pages: [] }; comptes[base.cle] = 0; continue; }
      const lues = await pagesDe(baseId);
      // Pour les comparaisons à venir : la colonne du titre, et les colonnes que Notion tient lui-même.
      const colonneTitre = colonneTitreDe(lues[0]);
      const colonnesTechniques = [...new Set(lues.flatMap((page) => Object.entries(page.properties || {}).filter(([, prop]) => technique(prop)).map(([nom]) => nom)))];
      const pages = lues.map((page) => ({
        id: page.id,
        ...(page.created_time ? { creeLe: page.created_time } : {}),
        ...(page.last_edited_time ? { modifieLe: page.last_edited_time } : {}),
        proprietes: Object.fromEntries(Object.entries(page.properties || {}).map(([nom, prop]) => [nom, valeurSimple(prop)])),
      }));
      const entree = { ...(colonneTitre ? { colonneTitre } : {}), ...(colonnesTechniques.length ? { colonnesTechniques } : {}), pages };
      if (base.contenu) {
        let nonLus = 0;
        const file = pages.slice();
        // Trois lectures à la fois, pour ménager Notion.
        const ouvrier = async () => {
          while (file.length) {
            const page = file.shift();
            if (Date.now() >= limite) { page.contenuNonLu = true; nonLus += 1; continue; }
            try { Object.assign(page, await contenuDe(page.id)); } catch (err) { page.contenuNonLu = true; nonLus += 1; }
          }
        };
        await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
        if (nonLus) { entree.contenusNonLus = nonLus; incomplete = true; }
      }
      bases[base.cle] = entree; comptes[base.cle] = pages.length;
    }
    return { format: FORMAT, version: VERSION, faiteLe, origine, incomplete, comptes, bases };
  }

  // Le fichier d'une ligne de la base « Sauvegardes » : { page, octets }, ou null si ce n'est pas une
  // ligne de la base ou si elle n'a pas de fichier gardé par Notion. Une panne remonte en erreur.
  async function fichierDe(id) {
    let page;
    try { page = await client.pages.retrieve({ page_id: id }); } catch (err) {
      if (err && (err.code === 'object_not_found' || err.status === 404)) return null;
      throw err;
    }
    const parent = page && page.parent && page.parent.database_id;
    if (!page || page.archived || page.in_trash || sansTirets(parent) !== sansTirets(env.NOTION_DB_SAUVEGARDES)) return null;
    const fichier = ((((page.properties || {})[COLONNES.fichier] || {}).files) || [])[0];
    // Seulement un fichier gardé par Notion (« file ») : un lien « externe » mis à la main dans la
    // base ferait lire au serveur une adresse arbitraire.
    const adresse = fichier && fichier.type === 'file' && fichier.file ? fichier.file.url : null;
    if (typeof adresse !== 'string' || !/^https:\/\//i.test(adresse)) return null;
    return { page, octets: await fichiers.telecharger(adresse, { max: TAILLE_MAX }) };
  }

  // Ce qui a changé depuis la dernière copie complète : { etat: 'premiere' } s'il n'y a aucune copie,
  // { etat: 'sans-reference' } si aucune n'est complète,
  // { etat: 'impossible' } si elle ne se lit pas, sinon le résumé complet. Lève en cas de panne.
  async function comparer(copie) {
    const toutes = await lignes();
    const reference = toutes.find(complete);
    // Aucune copie du tout : la première. Des copies, mais aucune complète avec son fichier : rien à quoi comparer.
    if (!reference) return { etat: toutes.length ? 'sans-reference' : 'premiere' };
    const lu = await fichierDe(reference.id);
    if (!lu) return { etat: 'impossible' };
    let avant = null;
    try { avant = JSON.parse(Buffer.from(lu.octets).toString('utf8')); } catch (err) { avant = null; }
    return comparerCopies(avant, copie, { depuis: reference.faiteLe });
  }
  // La même chose, sans jamais lever ni attendre au-delà du budget : la copie passe avant son résumé.
  async function changementsDe(copie, debut) {
    const impossible = (raison) => { dire('[sauvegardes] comparaison impossible avec la copie précédente :', raison); return { etat: 'impossible' }; };
    const budget = Math.min(budgetComparaisonMs, DUREE_AVANT_COMPARAISON_MS - (Date.now() - debut));
    if (!(budget > 0)) return impossible('la copie a déjà pris trop de temps');
    let minuterie;
    const delai = new Promise((suite) => { minuterie = setTimeout(() => suite(null), budget); });
    try {
      const travail = comparer(copie);
      // Si le délai gagne, la lecture abandonnée ne doit pas laisser un rejet sans suite.
      travail.catch(() => {});
      const resultat = await Promise.race([travail, delai]);
      return resultat || impossible('fichier précédent trop long à lire');
    } catch (err) {
      return impossible(err && err.message);
    } finally { clearTimeout(minuterie); }
  }

  // Fait une copie et l'inscrit dans la base « Sauvegardes ». Lève si Notion ou le dépôt échoue.
  async function copier(origine, par) {
    const debut = Date.now();
    const faiteLe = new Date(maintenant()).toISOString();
    const { bases, ...entete } = await composer(origine, faiteLe);
    const changements = await changementsDe({ ...entete, bases }, debut);
    // Le résumé complet, avec les noms, reste dans le fichier ; les bases viennent en dernier.
    const copie = { ...entete, changements, bases };
    const octets = Buffer.from(JSON.stringify(copie), 'utf8');
    if (octets.length > TAILLE_MAX) throw new Error(`copie trop grosse pour le dépôt de Notion (${octets.length} octets)`);
    const horodatage = `${faiteLe.slice(0, 10)}-${faiteLe.slice(11, 16).replace(':', '')}`;
    const nom = `sauvegarde-cartographie-${horodatage}.json`;
    const depot = await fichiers.deposer({ nom, type: 'application/json', octets });
    const titre = `Sauvegarde du ${faiteLe.slice(0, 10)} ${faiteLe.slice(11, 16)} UTC${copie.incomplete ? ` (${MARQUE_INCOMPLETE})` : ''}`;
    const courriel = normaliserCourriel(par);
    const properties = {
      [COLONNES.titre]: { title: segments(titre) },
      [COLONNES.faiteLe]: { date: { start: faiteLe } },
      [COLONNES.origine]: { select: { name: ORIGINES[origine] } },
      [COLONNES.taille]: { number: octets.length },
      ...(courriel ? { [COLONNES.par]: { email: courriel } } : {}),
      [COLONNES.fichier]: fichiers.proprieteFichier(depot, nom),
    };
    const parent = { database_id: env.NOTION_DB_SAUVEGARDES };
    // La ligne ne porte que les compteurs, jamais un nom. Si Notion refuse la demande (la colonne
    // « Changements » n'est pas encore dans la base), la ligne est inscrite sans son résumé.
    let court = resumeCourt(changements);
    let page;
    try {
      page = await client.pages.create({ parent, properties: { ...properties, [COLONNES.changements]: { rich_text: segments(JSON.stringify(court)) } } });
    } catch (err) {
      if (!refusee(err)) throw err;
      dire(`[sauvegardes] ligne inscrite sans la colonne « ${COLONNES.changements} » (à ajouter à la base « Sauvegardes ») :`, err && err.message);
      court = null;
      page = await client.pages.create({ parent, properties });
    }
    return { ok: true, id: page.id, faiteLe, taille: octets.length, incomplete: copie.incomplete, comptes: copie.comptes, changements: court };
  }
  // Une seule copie à la fois, toutes instances confondues.
  async function sousVerrou(faire) {
    if (verrous && !(await verrous.prendreVerrou(VERROU, DUREE_VERROU_S))) return { ok: false, code: 'occupee' };
    try { return await faire(); } finally {
      if (verrous) { try { await verrous.rendreVerrou(VERROU); } catch (err) { dire('[sauvegardes] verrou non rendu :', err && err.message); } }
    }
  }

  // Une ligne de la base, telle que la liste la montre. fichier : la ligne porte un fichier gardé par Notion.
  function ligneDe(page) {
    const p = page.properties || {};
    const fichier = (((p[COLONNES.fichier] || {}).files) || [])[0];
    return {
      id: page.id,
      faiteLe: (p[COLONNES.faiteLe] && p[COLONNES.faiteLe].date && p[COLONNES.faiteLe].date.start) || null,
      origine: cleDe(ORIGINES, p[COLONNES.origine] && p[COLONNES.origine].select && p[COLONNES.origine].select.name) || 'demande',
      par: normaliserCourriel((p[COLONNES.par] || {}).email) || null,
      taille: typeof (p[COLONNES.taille] || {}).number === 'number' ? p[COLONNES.taille].number : null,
      fichier: !!fichier && fichier.type === 'file',
      incomplete: texteDe((p[COLONNES.titre] || {}).title).includes(MARQUE_INCOMPLETE),
      // Le résumé court des changements, relu avec méfiance : des états et des compteurs, ou null.
      changements: lireResume(texteDe((p[COLONNES.changements] || {}).rich_text)),
    };
  }
  async function lignes() {
    return (await pagesDe(env.NOTION_DB_SAUVEGARDES, { sorts: [{ property: COLONNES.faiteLe, direction: 'descending' }] }))
      .map(ligneDe).sort((a, b) => String(b.faiteLe || '').localeCompare(String(a.faiteLe || '')));
  }
  const complete = (l) => !l.incomplete && l.fichier && !!l.faiteLe;
  // Les copies automatiques de plus de douze semaines vont à la corbeille, sauf la dernière copie
  // complète, toujours gardée. Renvoie leur nombre ; ne lève pas.
  async function menage() {
    let retirees = 0;
    try {
      const seuil = new Date(maintenant() - SEMAINES_GARDEES * 7 * 86400000).toISOString();
      const toutes = await lignes();
      const derniere = toutes.find(complete);
      for (const l of toutes) {
        if (l.origine !== 'automatique' || !l.faiteLe || l.faiteLe >= seuil || (derniere && l.id === derniere.id)) continue;
        try { await client.pages.update({ page_id: l.id, archived: true }); retirees += 1; } catch (err) { dire('[sauvegardes] ancienne copie non retirée :', err && err.message); }
      }
    } catch (err) { dire('[sauvegardes] ménage impossible :', err && err.message); }
    return retirees;
  }

  return {
    active,
    menage,

    // La dernière copie complète : { faiteLe (ou null), ancienne } ; ancienne : elle a plus de huit
    // jours, ou il n'y en a aucune. Pour l'accueil du panneau. Une panne de Notion remonte en erreur.
    async derniereComplete() {
      const derniere = (await lignes()).find(complete);
      const faiteLe = derniere ? derniere.faiteLe : null;
      const age = faiteLe ? maintenant() - Date.parse(faiteLe) : Infinity;
      return { faiteLe, ancienne: !(age <= JOURS_ALERTE * 86400000) };
    },

    // Les copies, de la plus récente à la plus ancienne : { ok: true, actives, copies }, ou
    // { ok: false, code: 'role' }. Une panne de Notion remonte en erreur.
    async lister({ par } = {}) {
      if (!(await administre(par))) return { ok: false, code: 'role' };
      if (!active()) return { ok: true, actives: false, copies: [] };
      return { ok: true, actives: true, copies: await lignes() };
    },

    // « Faire une copie maintenant », au nom d'une personne en Administration.
    // { ok: true, id, faiteLe, taille, incomplete, comptes, changements }, ou { ok: false, code } : 'role',
    // 'sauvegardes-absentes' ou 'occupee'. Une panne de Notion ou du dépôt remonte en erreur.
    async faire({ par } = {}) {
      if (!(await administre(par))) return { ok: false, code: 'role' };
      if (!active()) return { ok: false, code: 'sauvegardes-absentes' };
      return sousVerrou(() => copier('demande', par));
    },

    // Le fichier d'une copie : { ok: true, octets, nom, faiteLe }, ou { ok: false, code } : 'role',
    // 'sauvegardes-absentes', 'introuvable' (pas une ligne de la base, ou sans fichier gardé par
    // Notion) ou 'invalide' (le fichier n'est pas une copie de la cartographie).
    async telecharger({ id, par } = {}) {
      if (!(await administre(par))) return { ok: false, code: 'role' };
      if (!active()) return { ok: false, code: 'sauvegardes-absentes' };
      const introuvable = { ok: false, code: 'introuvable' };
      if (!idValide(id)) return introuvable;
      const trouve = await fichierDe(id);
      if (!trouve) return introuvable;
      const { page, octets } = trouve;
      let lu = null;
      try { lu = JSON.parse(Buffer.from(octets).toString('utf8')); } catch (err) { lu = null; }
      if (!lu || typeof lu !== 'object' || lu.format !== FORMAT) return { ok: false, code: 'invalide' };
      const l = ligneDe(page);
      const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(l.faiteLe || '')) ? `${l.faiteLe.slice(0, 10)}-${l.faiteLe.slice(11, 16).replace(':', '')}` : 'sans-date';
      return { ok: true, octets: Buffer.from(octets), nom: `sauvegarde-cartographie-${instant}.json`, faiteLe: l.faiteLe };
    },

    // La copie de la semaine, appelée par la tâche planifiée : une copie « Automatique », puis le
    // ménage des anciennes. Ne lève jamais : { etat: 'inactive' }, { etat: 'echec' }, ou
    // { etat: 'faite', taille, incomplete, retirees }. Rien n'est retiré si la copie a échoué ou
    // si elle est incomplète.
    async hebdomadaire() {
      if (!active()) return { etat: 'inactive' };
      try {
        const retour = await sousVerrou(() => copier('automatique', null));
        if (!retour.ok) { dire('[sauvegardes] copie de la semaine non faite : une autre copie est en cours'); return { etat: 'echec' }; }
        return { etat: 'faite', taille: retour.taille, incomplete: retour.incomplete, retirees: retour.incomplete ? 0 : await menage() };
      } catch (err) {
        dire('[sauvegardes] copie de la semaine impossible :', err && err.message);
        return { etat: 'echec' };
      }
    },
  };
}

module.exports = { creerSauvegardes, valeurSimple, COLONNES, ORIGINES, FORMAT, SEMAINES_GARDEES, TAILLE_MAX, DUREE_AVANT_COMPARAISON_MS };
