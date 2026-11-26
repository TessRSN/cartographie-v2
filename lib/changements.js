/**
 * Ce qui a changé entre deux copies de sauvegarde : par base, les lignes nouvelles, modifiées et
 * retirées, reconnues par leur identifiant de page Notion.
 *
 * - Ne compte que ce qui change dans la donnée : les dates que Notion tient lui-même (création,
 *   dernière modification), les colonnes techniques, l'ordre des pages, des colonnes et des valeurs
 *   d'une liste, et une colonne vide ajoutée à la base ne comptent pas.
 * - Versions et journal ne font que grandir : seules leurs lignes nouvelles sont comptées.
 * - Les réglages sont reconnus par leur clé, pas par leur page : un réglage réécrit sans changer de
 *   valeur n'est pas un réglage changé.
 * - Le résumé complet (avec les noms des lignes, bornés) va dans le fichier de la copie, qui ne sort
 *   que par le panneau. Le résumé court (compteurs seulement) va dans la ligne Notion et à l'écran :
 *   il ne porte aucun nom de fiche ni de personne.
 * - La copie de comparaison doit être complète ; sinon, « impossible ». Une copie neuve incomplète,
 *   ou une base qui manque d'un côté, donne un résumé « partiel ».
 */
const FORMAT = 'cartographie-rsn/sauvegarde';
// Le plus de noms gardés par liste, et la longueur d'un nom.
const NOMS_MAX = 20;
const LONGUEUR_NOM = 120;
// Les bases comparées : la clé dans le fichier, la clé dans le résumé, et ce qui est compté.
const BASES = [
  { cle: 'ressources', nom: 'ressources', sorte: 'lignes' },
  { cle: 'porteurs', nom: 'porteurs', sorte: 'lignes' },
  { cle: 'propositions', nom: 'propositions', sorte: 'lignes' },
  { cle: 'approbateurs', nom: 'equipe', sorte: 'lignes' },
  { cle: 'versions', nom: 'versions', sorte: 'ajouts' },
  { cle: 'journal', nom: 'journal', sorte: 'ajouts' },
  { cle: 'reglages', nom: 'reglages', sorte: 'reglages' },
];
const COMPTEURS = { lignes: ['nouvelles', 'modifiees', 'retirees'], ajouts: ['nouvelles'], reglages: ['changes'] };
// Sans le nom de la colonne du titre dans le fichier (copie d'avant ce résumé), celles-ci servent.
const TITRES_PAR_DEFAUT = ['Nom', 'Titre', 'Clé'];

const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Une copie qui peut servir à comparer : le bon format, et des bases.
const estCopie = (c) => estObjet(c) && c.format === FORMAT && estObjet(c.bases);
const pagesDe = (base) => (estObjet(base) && !base.absente && Array.isArray(base.pages) ? base.pages.filter((p) => estObjet(p) && typeof p.id === 'string' && p.id) : null);
const proprietesDe = (page) => (estObjet(page.proprietes) ? page.proprietes : {});

// Une valeur sous une forme qui ne dépend pas de l'ordre de ses clés.
function canonique(v) {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (estObjet(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(',')}}`;
  return v === undefined ? 'null' : JSON.stringify(v);
}
// La valeur d'une colonne : rien, une case décochée, un texte vide et une liste vide se valent, et
// l'ordre des valeurs d'une liste ne compte pas.
function valeurDeColonne(v) {
  if (v === null || v === undefined || v === '' || v === false) return '';
  if (Array.isArray(v)) return v.length ? `[${v.map(canonique).sort().join(',')}]` : '';
  return canonique(v);
}
// Le contenu du corps d'une page, tel quel (l'ordre de ses listes compte) ; null s'il n'a pas été lu.
function contenuDe(page) {
  if (page.contenuNonLu) return null;
  return canonique([Object.hasOwn(page, 'contenu') ? page.contenu : null, Object.hasOwn(page, 'contenuBrut') ? page.contenuBrut : null]);
}
const techniquesDe = (base) => (estObjet(base) && Array.isArray(base.colonnesTechniques) ? base.colonnesTechniques.filter((c) => typeof c === 'string') : []);

function pageModifiee(avant, apres, techniques) {
  const a = proprietesDe(avant); const b = proprietesDe(apres);
  for (const colonne of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (techniques.has(colonne)) continue;
    if (valeurDeColonne(a[colonne]) !== valeurDeColonne(b[colonne])) return true;
  }
  const ca = contenuDe(avant); const cb = contenuDe(apres);
  // Un contenu qui n'a pas été lu d'un côté ne dit rien : il ne compte pas comme une modification.
  return ca !== null && cb !== null && ca !== cb;
}

// Le nom d'une ligne : sa colonne de titre, ou à défaut « Nom », « Titre » ou « Clé ». '' sans nom.
function nomDe(page, base) {
  const p = proprietesDe(page);
  const colonnes = [estObjet(base) && typeof base.colonneTitre === 'string' ? base.colonneTitre : null, ...TITRES_PAR_DEFAUT];
  for (const colonne of colonnes) {
    if (colonne && typeof p[colonne] === 'string' && p[colonne].trim()) return p[colonne].trim().slice(0, LONGUEUR_NOM);
  }
  return '';
}
function listeBornee() {
  const noms = [];
  return { noms, ajouter(nom) { if (nom && noms.length < NOMS_MAX) noms.push(nom); } };
}

function comparerLignes(baseAvant, baseApres, avant, apres) {
  const techniques = new Set([...techniquesDe(baseAvant), ...techniquesDe(baseApres)]);
  const anciennes = new Map(avant.map((p) => [p.id, p]));
  const vues = new Set();
  const compte = { nouvelles: 0, modifiees: 0, retirees: 0 };
  const listes = { nouvelles: listeBornee(), modifiees: listeBornee(), retirees: listeBornee() };
  for (const page of apres) {
    if (vues.has(page.id)) continue;
    vues.add(page.id);
    const ancienne = anciennes.get(page.id);
    const sorte = !ancienne ? 'nouvelles' : pageModifiee(ancienne, page, techniques) ? 'modifiees' : null;
    if (sorte) { compte[sorte] += 1; listes[sorte].ajouter(nomDe(page, baseApres)); }
  }
  for (const [id, page] of anciennes) {
    if (!vues.has(id)) { compte.retirees += 1; listes.retirees.ajouter(nomDe(page, baseAvant)); }
  }
  return { compte, noms: { nouvelles: listes.nouvelles.noms, modifiees: listes.modifiees.noms, retirees: listes.retirees.noms } };
}
function comparerAjouts(avant, apres) {
  const anciennes = new Set(avant.map((p) => p.id));
  return { compte: { nouvelles: new Set(apres.map((p) => p.id).filter((id) => !anciennes.has(id))).size } };
}
// Les réglages, par clé : ajouté, retiré, ou de valeur différente. Un réglage dont la valeur n'a
// pas été lue d'un côté n'est pas compté.
function comparerReglages(baseAvant, baseApres, avant, apres) {
  const parCle = (pages, base) => {
    const table = new Map();
    for (const page of pages) { const cle = nomDe(page, base); if (cle && !table.has(cle)) table.set(cle, contenuDe(page)); }
    return table;
  };
  const a = parCle(avant, baseAvant); const b = parCle(apres, baseApres);
  const changes = listeBornee(); let n = 0;
  for (const cle of new Set([...a.keys(), ...b.keys()])) {
    const va = a.get(cle); const vb = b.get(cle);
    if (va === null || vb === null) continue;
    if (!a.has(cle) || !b.has(cle) || va !== vb) { n += 1; changes.ajouter(cle); }
  }
  return { compte: { changes: n }, noms: changes.noms };
}

/**
 * Compare la copie neuve (apres) à la copie de comparaison (avant). depuis : la date de la copie de
 * comparaison. Rend { etat: 'impossible' } si la copie de comparaison ne vaut rien ou n'est pas
 * complète, sinon { etat: 'compare', depuis, partiel, bases: { compteurs }, noms: { listes bornées } }.
 */
function comparerCopies(avant, apres, { depuis = null } = {}) {
  if (!estCopie(avant) || avant.incomplete || !estCopie(apres)) return { etat: 'impossible' };
  let partiel = !!apres.incomplete;
  const bases = {}; const noms = {};
  for (const base of BASES) {
    const baseAvant = avant.bases[base.cle]; const baseApres = apres.bases[base.cle];
    const pagesAvant = pagesDe(baseAvant); const pagesApres = pagesDe(baseApres);
    if (!pagesAvant || !pagesApres) {
      // Absente des deux côtés (base non branchée) : rien à comparer. D'un seul côté : le résumé le dit.
      const absente = (b) => b === undefined || (estObjet(b) && !!b.absente);
      if (!(absente(baseAvant) && absente(baseApres))) partiel = true;
      continue;
    }
    const resultat = base.sorte === 'lignes' ? comparerLignes(baseAvant, baseApres, pagesAvant, pagesApres)
      : base.sorte === 'ajouts' ? comparerAjouts(pagesAvant, pagesApres)
        : comparerReglages(baseAvant, baseApres, pagesAvant, pagesApres);
    bases[base.nom] = resultat.compte;
    if (resultat.noms) noms[base.nom] = resultat.noms;
  }
  return { etat: 'compare', depuis, partiel, bases, noms };
}

// Le résumé sans aucun nom : l'état, la date de la copie de comparaison, et les compteurs.
function resumeCourt(changements) {
  if (!estObjet(changements)) return null;
  if (changements.etat === 'premiere' || changements.etat === 'impossible') return { etat: changements.etat };
  if (changements.etat !== 'compare') return null;
  return { etat: 'compare', depuis: changements.depuis, partiel: !!changements.partiel, bases: changements.bases };
}

const compteur = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const DATE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Relit le texte de la colonne « Changements ». Ne rend que des états et des compteurs connus : tout
 * le reste (noms, bases inconnues, valeurs qui ne sont pas des entiers positifs, date mal formée)
 * est écarté. null si le texte n'est pas un résumé.
 */
function lireResume(texte) {
  if (typeof texte !== 'string' || !texte.trim()) return null;
  let lu;
  try { lu = JSON.parse(texte); } catch (err) { return null; }
  if (!estObjet(lu)) return null;
  if (lu.etat === 'premiere' || lu.etat === 'impossible') return { etat: lu.etat };
  if (lu.etat !== 'compare') return null;
  const bases = {};
  for (const base of BASES) {
    const b = estObjet(lu.bases) ? lu.bases[base.nom] : null;
    if (!estObjet(b)) continue;
    bases[base.nom] = Object.fromEntries(COMPTEURS[base.sorte].map((c) => [c, compteur(b[c])]));
  }
  const depuis = typeof lu.depuis === 'string' && DATE_ISO.test(lu.depuis) && !Number.isNaN(Date.parse(lu.depuis)) ? lu.depuis : null;
  return { etat: 'compare', depuis, partiel: lu.partiel === true, bases };
}

module.exports = { comparerCopies, resumeCourt, lireResume, NOMS_MAX, FORMAT };
