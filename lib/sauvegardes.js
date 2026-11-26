/**
 * Les copies de sauvegarde. Une copie est un seul fichier JSON avec le contenu des bases Notion du
 * site : Ressources, Porteurs, Propositions (avec leur contenu), Approbateurs, Versions (avec leur
 * contenu), Journal et Réglages (avec leur valeur). Elle est déposée comme fichier dans la base
 * Notion « Sauvegardes » (réglage NOTION_DB_SAUVEGARDES), une ligne par copie : titre, date,
 * origine (Automatique ou À la demande), personne, taille, fichier.
 *
 * - Une copie automatique part chaque semaine, dans la tâche planifiée du résumé (api/resume.js) ;
 *   les copies automatiques de plus de douze semaines vont alors à la corbeille de Notion. Les
 *   copies faites à la demande ne sont jamais retirées.
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
 * Sans le réglage NOTION_DB_SAUVEGARDES, rien n'est copié et rien ne casse.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');

const COLONNES = {
  titre: 'Titre',       // title
  faiteLe: 'Faite le',  // date
  origine: 'Origine',   // select : Automatique, À la demande
  par: 'Par',           // email
  taille: 'Taille',     // number, en octets
  fichier: 'Fichier',   // files
};
const ORIGINES = { automatique: 'Automatique', demande: 'À la demande' };
const FORMAT = 'cartographie-rsn/sauvegarde';
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
const VERROU = 'sauvegarde';
const DUREE_VERROU_S = 120;
const MARQUE_INCOMPLETE = 'incomplète';

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
function creerSauvegardes({ client, env = process.env, fichiers, roleDe, verrous = null, maintenant = Date.now, journal = console.error, budgetMs = BUDGET_CONTENUS_MS }) {
  const active = () => !!(env && env.NOTION_DB_SAUVEGARDES);
  const dire = (...texte) => { try { journal(...texte); } catch (err) { /* rien de plus à faire */ } };
  const administre = async (par) => !!par && (await roleDe(par)) === 'administration';

  async function pagesDe(baseId, requete = {}) {
    const pages = []; let curseur;
    do {
      const reponse = await client.databases.query({ database_id: baseId, page_size: 100, start_cursor: curseur, ...requete });
      pages.push(...(reponse.results || []));
      curseur = reponse.has_more ? reponse.next_cursor : undefined;
    } while (curseur);
    return pages.filter((page) => !page.archived && !page.in_trash);
  }
  // Le bloc de code du corps d'une page : { contenu } s'il est du JSON, { contenuBrut } sinon, {} s'il n'y en a pas.
  async function contenuDe(pageId) {
    const reponse = await client.blocks.children.list({ block_id: pageId, page_size: 100 });
    const blocs = (reponse.results || []).filter((b) => b.type === 'code');
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
      const pages = (await pagesDe(baseId)).map((page) => ({
        id: page.id,
        ...(page.created_time ? { creeLe: page.created_time } : {}),
        ...(page.last_edited_time ? { modifieLe: page.last_edited_time } : {}),
        proprietes: Object.fromEntries(Object.entries(page.properties || {}).map(([nom, prop]) => [nom, valeurSimple(prop)])),
      }));
      const entree = { pages };
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

  // Fait une copie et l'inscrit dans la base « Sauvegardes ». Lève si Notion ou le dépôt échoue.
  async function copier(origine, par) {
    const faiteLe = new Date(maintenant()).toISOString();
    const copie = await composer(origine, faiteLe);
    const octets = Buffer.from(JSON.stringify(copie), 'utf8');
    if (octets.length > TAILLE_MAX) throw new Error(`copie trop grosse pour le dépôt de Notion (${octets.length} octets)`);
    const horodatage = `${faiteLe.slice(0, 10)}-${faiteLe.slice(11, 16).replace(':', '')}`;
    const nom = `sauvegarde-cartographie-${horodatage}.json`;
    const depot = await fichiers.deposer({ nom, type: 'application/json', octets });
    const titre = `Sauvegarde du ${faiteLe.slice(0, 10)} ${faiteLe.slice(11, 16)} UTC${copie.incomplete ? ` (${MARQUE_INCOMPLETE})` : ''}`;
    const courriel = normaliserCourriel(par);
    const page = await client.pages.create({
      parent: { database_id: env.NOTION_DB_SAUVEGARDES },
      properties: {
        [COLONNES.titre]: { title: segments(titre) },
        [COLONNES.faiteLe]: { date: { start: faiteLe } },
        [COLONNES.origine]: { select: { name: ORIGINES[origine] } },
        [COLONNES.taille]: { number: octets.length },
        ...(courriel ? { [COLONNES.par]: { email: courriel } } : {}),
        [COLONNES.fichier]: fichiers.proprieteFichier(depot, nom),
      },
    });
    return { ok: true, id: page.id, faiteLe, taille: octets.length, incomplete: copie.incomplete, comptes: copie.comptes };
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
    };
  }
  async function lignes() {
    return (await pagesDe(env.NOTION_DB_SAUVEGARDES, { sorts: [{ property: COLONNES.faiteLe, direction: 'descending' }] }))
      .map(ligneDe).sort((a, b) => String(b.faiteLe || '').localeCompare(String(a.faiteLe || '')));
  }
  // Les copies automatiques de plus de douze semaines vont à la corbeille. Renvoie leur nombre ; ne lève pas.
  async function menage() {
    let retirees = 0;
    try {
      const seuil = new Date(maintenant() - SEMAINES_GARDEES * 7 * 86400000).toISOString();
      for (const l of await lignes()) {
        if (l.origine !== 'automatique' || !l.faiteLe || l.faiteLe >= seuil) continue;
        try { await client.pages.update({ page_id: l.id, archived: true }); retirees += 1; } catch (err) { dire('[sauvegardes] ancienne copie non retirée :', err && err.message); }
      }
    } catch (err) { dire('[sauvegardes] ménage impossible :', err && err.message); }
    return retirees;
  }

  return {
    active,

    // Les copies, de la plus récente à la plus ancienne : { ok: true, actives, copies }, ou
    // { ok: false, code: 'role' }. Une panne de Notion remonte en erreur.
    async lister({ par } = {}) {
      if (!(await administre(par))) return { ok: false, code: 'role' };
      if (!active()) return { ok: true, actives: false, copies: [] };
      return { ok: true, actives: true, copies: await lignes() };
    },

    // « Faire une copie maintenant », au nom d'une personne en Administration.
    // { ok: true, id, faiteLe, taille, incomplete, comptes }, ou { ok: false, code } : 'role',
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
      let page;
      try { page = await client.pages.retrieve({ page_id: id }); } catch (err) {
        if (err && (err.code === 'object_not_found' || err.status === 404)) return introuvable;
        throw err;
      }
      const parent = page && page.parent && page.parent.database_id;
      if (!page || page.archived || page.in_trash || sansTirets(parent) !== sansTirets(env.NOTION_DB_SAUVEGARDES)) return introuvable;
      const fichier = ((((page.properties || {})[COLONNES.fichier] || {}).files) || [])[0];
      // Seulement un fichier gardé par Notion (« file ») : un lien « externe » mis à la main dans la
      // base ferait lire au serveur une adresse arbitraire.
      const adresse = fichier && fichier.type === 'file' && fichier.file ? fichier.file.url : null;
      if (typeof adresse !== 'string' || !/^https:\/\//i.test(adresse)) return introuvable;
      const octets = await fichiers.telecharger(adresse, { max: TAILLE_MAX });
      let lu = null;
      try { lu = JSON.parse(Buffer.from(octets).toString('utf8')); } catch (err) { lu = null; }
      if (!lu || typeof lu !== 'object' || lu.format !== FORMAT) return { ok: false, code: 'invalide' };
      const l = ligneDe(page);
      const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(l.faiteLe || '')) ? `${l.faiteLe.slice(0, 10)}-${l.faiteLe.slice(11, 16).replace(':', '')}` : 'sans-date';
      return { ok: true, octets: Buffer.from(octets), nom: `sauvegarde-cartographie-${instant}.json`, faiteLe: l.faiteLe };
    },

    // La copie de la semaine, appelée par la tâche planifiée : une copie « Automatique », puis le
    // ménage des anciennes. Ne lève jamais : { etat: 'inactive' }, { etat: 'echec' }, ou
    // { etat: 'faite', taille, incomplete, retirees }. Rien n'est retiré si la copie a échoué.
    async hebdomadaire() {
      if (!active()) return { etat: 'inactive' };
      try {
        const retour = await sousVerrou(() => copier('automatique', null));
        if (!retour.ok) { dire('[sauvegardes] copie de la semaine non faite : une autre copie est en cours'); return { etat: 'echec' }; }
        return { etat: 'faite', taille: retour.taille, incomplete: retour.incomplete, retirees: await menage() };
      } catch (err) {
        dire('[sauvegardes] copie de la semaine impossible :', err && err.message);
        return { etat: 'echec' };
      }
    },
  };
}

module.exports = { creerSauvegardes, valeurSimple, COLONNES, ORIGINES, FORMAT, SEMAINES_GARDEES, TAILLE_MAX };
