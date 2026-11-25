/**
 * La qualité des données : ce qui est à corriger dans les fiches publiées.
 * pointsDeQualite est une fonction pure : elle ne lit rien, elle calcule à partir de ce qu'on lui
 * donne. creerQualite la branche sur Notion et porte les deux gestes de l'écran : fusionner deux
 * écritures d'un mot-clé ou d'une norme, et revisiter un lien qui ne répondait plus.
 * Rien de ce qui sort d'ici ne porte un identifiant Notion de fiche ou de porteur.
 */
const { PROP } = require('./notion');
const { indexReperes, opaqueDe } = require('./ressources');
const { parFiche } = require('./masse');

const STATUT_ECARTEE = 'Écartée';
const OUVERTS = ['attente', 'verification'];
const UN_AN_MS = 365 * 86400000;
// Les listes où deux écritures d'une même valeur sont cherchées, et celles où une proposition peut apporter une valeur nouvelle.
const LISTES_A_DOUBLONS = ['normes', 'motsCles'];
const LISTES_OUVERTES = ['motsCles', 'normes', 'outils', 'financePar'];
const SUJETS = ['aRevoir', 'sansContact', 'sansPorteur', 'sansLogo', 'liens', 'aVerifier', 'doublons', 'porteursDoubles', 'valeursNouvelles'];

const plier = (texte) => String(texte === null || texte === undefined ? '' : texte).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Un nom de porteur réduit à ce qui le distingue : sans parenthèses, « St » et « Ste » écrits au long.
const normNom = (nom) => plier(nom).replace(/\(.*?\)/g, '').replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/[^a-z0-9]+/g, ' ').trim();
// Une valeur de liste réduite à ses lettres et à ses chiffres.
const normVal = (valeur) => plier(valeur).replace(/[^a-z0-9]+/g, '');
const liste = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const publiee = (f) => f.statutFiche !== STATUT_ECARTEE && !!f.nom;

// Deux écritures : 'meme' si ce sont les mêmes lettres ; 'proche' si, pour les normes, l'une
// contient l'autre (« FHIR » et « HL7 FHIR », mais aussi « CIM-10 » et « CIM-10-CA », qui sont
// deux normes) : une ressemblance à vérifier, jamais une identité ; sinon null.
function memeValeur(cle, a, b) {
  const x = normVal(a); const y = normVal(b);
  if (!x || !y) return null;
  if (x === y) return 'meme';
  return cle === 'normes' && Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)) ? 'proche' : null;
}

/**
 * fiches, porteurs : tels que lib/notion.js les lit. propositions : celles à regarder, chacune avec
 * son contenu ({ id, ficheId, statut, titre, logoPropose, contenu }). connues : les valeurs déjà
 * dans les listes communes ({ cle: [valeurs] }). repereFiche, reperePorteur : ce qui désigne une
 * fiche ou un porteur à la place de son identifiant.
 */
function pointsDeQualite({
  fiches = [], porteurs = [], propositions = [], connues = {}, maintenant = Date.now(),
  repereFiche = (id) => id, reperePorteur = (id) => id,
} = {}) {
  const points = [];
  const publiees = fiches.filter(publiee).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || String(a.id).localeCompare(String(b.id)));
  const designerTot = (f) => ({ id: repereFiche(f.id), nom: f.nom });
  // Les fiches que l'équipe a marquées « à revoir », avec la note laissée.
  for (const f of publiees) if (f.aRevoir) points.push({ sujet: 'aRevoir', fiche: designerTot(f), note: f.noteARevoir || '' });
  const porteursConnus = new Set(porteurs.map((p) => p.id));
  const ouvertes = propositions.filter((p) => p && OUVERTS.includes(p.statut));
  const designer = (f) => ({ id: repereFiche(f.id), nom: f.nom });
  const propose = (p) => objet(objet(p.contenu).propose);

  for (const f of publiees) if (!f.contact) points.push({ sujet: 'sansContact', fiche: designer(f) });
  for (const f of publiees) {
    if (!(f.porteurIds || []).some((id) => porteursConnus.has(id))) points.push({ sujet: 'sansPorteur', fiche: designer(f) });
  }
  for (const f of publiees) {
    // Une image déposée est un logo, même sans adresse.
    if (f.logo || f.logoFichier) continue;
    const apporte = ouvertes.find((p) => p.ficheId === f.id && (p.logoPropose || (propose(p).logo && propose(p).logo.apres)));
    points.push({ sujet: 'sansLogo', fiche: designer(f), proposition: apporte ? apporte.id : null });
  }
  for (const f of publiees) {
    if (f.lien && f.lienEnPanneDepuis) points.push({ sujet: 'liens', fiche: designer(f), lien: f.lien, depuis: f.lienEnPanneDepuis });
  }
  for (const f of publiees) {
    const vieille = !f.verifieeLe || maintenant - Date.parse(f.verifieeLe) > UN_AN_MS;
    if (vieille) points.push({ sujet: 'aVerifier', fiche: designer(f), verifieeLe: f.verifieeLe || null });
  }

  for (const cle of LISTES_A_DOUBLONS) {
    const compter = (lesFiches) => {
      const comptes = new Map();
      for (const f of lesFiches) for (const v of new Set(liste(f[cle]))) comptes.set(v, (comptes.get(v) || 0) + 1);
      return comptes;
    };
    const publiques = compter(publiees); const toutes = compter(fiches);
    const valeurs = [...publiques.keys()];
    valeurs.forEach((a, i) => {
      for (const b of valeurs.slice(i + 1)) {
        const lien = memeValeur(cle, a, b);
        if (!lien) continue;
        // L'écriture la plus longue est proposée d'abord ; l'écran laisse garder l'une ou l'autre.
        const garder = a.length >= b.length ? a : b; const retirer = garder === a ? b : a;
        points.push({
          sujet: 'doublons', cle, garder, retirer,
          fiches: { garder: publiques.get(garder), retirer: publiques.get(retirer) },
          toutes: { garder: toutes.get(garder) || 0, retirer: toutes.get(retirer) || 0 },
          // Vrai seulement quand les deux écritures ont les mêmes lettres.
          sur: lien === 'meme',
        });
      }
    });
  }

  const vus = new Map();
  for (const p of porteurs) {
    const reduit = normNom(p.nom);
    if (!reduit) continue;
    if (vus.has(reduit)) {
      const autre = vus.get(reduit);
      points.push({ sujet: 'porteursDoubles', porteur: { id: reperePorteur(p.id), nom: p.nom }, autre: { id: reperePorteur(autre.id), nom: autre.nom } });
    } else vus.set(reduit, p);
  }

  const nomParFiche = new Map(fiches.map((f) => [f.id, f.nom]));
  for (const cle of LISTES_OUVERTES) {
    const deja = new Set([...fiches.flatMap((f) => liste(f[cle])), ...liste(connues[cle])].map((v) => v.trim().toLowerCase()));
    for (const p of ouvertes) {
      const changement = propose(p)[cle];
      const nomPropose = propose(p).nom && typeof propose(p).nom.apres === 'string' ? propose(p).nom.apres.trim() : '';
      const nom = (p.ficheId && nomParFiche.get(p.ficheId)) || nomPropose || String(p.titre || '').replace(/^[^:]{1,40} : /, '');
      const signalees = new Set();
      for (const valeur of liste(changement && changement.apres)) {
        const reduite = valeur.trim().toLowerCase();
        if (deja.has(reduite) || signalees.has(reduite)) continue;
        signalees.add(reduite);
        points.push({ sujet: 'valeursNouvelles', cle, valeur: valeur.trim(), proposition: { id: p.id, nom } });
      }
    }
  }
  return points;
}

const MESSAGES = {
  cle: 'Seuls les mots-clés et les normes se fusionnent.',
  valeurs: 'Il faut deux écritures différentes.',
  inconnue: (valeur) => `« ${valeur} » n'est sur aucune fiche : choisissez une écriture qui existe déjà.`,
  sansLien: "Cette fiche n'a pas de lien principal.",
};

function creerQualite({
  notion, versions, propositions, liens, verrous, viderMemoire = () => {}, secret = '',
  maintenant = Date.now, journal = console.error, attendre, budgetMs,
}) {
  const refus = (code, extra = {}) => ({ ok: false, code, ...extra });
  const reperePorteur = opaqueDe('porteur', secret);

  // La liste de l'écran, recalculée à chaque affichage, et les deux compteurs de la barre latérale.
  async function lire() {
    const [fiches, porteurs, options, ouvertes] = await Promise.all([
      notion.lireRessources(), notion.lirePorteurs(), notion.lireOptions(), propositions.listerPropositions({ statut: 'ouvertes' }),
    ]);
    const contenus = ouvertes.length ? await propositions.lireContenus(ouvertes.map((p) => p.id)) : new Map();
    const { repereDe } = indexReperes(fiches, porteurs, secret);
    const points = pointsDeQualite({
      fiches, porteurs, connues: options, maintenant: maintenant(), repereFiche: repereDe, reperePorteur,
      propositions: ouvertes.map((p) => ({ ...p, contenu: contenus.get(p.id) })),
    });
    // Les fiches à vérifier sont un état de fond (toutes le sont au départ) : elles restent dans la
    // liste, mais la pastille ne compte que ce qui est à corriger.
    const aVerifier = points.filter((p) => p.sujet === 'aVerifier').length;
    return { points, compteurs: { points: points.length - aVerifier, aVerifier, porteursAPlacer: porteurs.filter((p) => p.latitude === null || p.longitude === null).length } };
  }

  // Remplace une écriture par une autre dans toutes les fiches, publiées ou écartées, une fiche à
  // la fois : chaque fiche touchée reçoit une version. Relancer reprend là où le geste s'est arrêté.
  async function fusionnerValeurs({ cle, de, vers, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    if (!LISTES_A_DOUBLONS.includes(cle)) return refus('invalide', { erreurs: { _: MESSAGES.cle } });
    if (typeof de !== 'string' || typeof vers !== 'string' || !de.trim() || !vers.trim() || de === vers) return refus('invalide', { erreurs: { _: MESSAGES.valeurs } });
    let fiches;
    try { fiches = await notion.lireRessources(); } catch (err) { journal('[qualité] lecture de Notion impossible :', err.message); return refus('notion'); }
    // L'écriture gardée doit déjà exister : ce geste ne crée aucune valeur.
    if (!fiches.some((f) => liste(f[cle]).includes(vers))) return refus('invalide', { erreurs: { _: MESSAGES.inconnue(vers) } });
    const ids = fiches.filter((f) => liste(f[cle]).includes(de)).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr') || String(a.id).localeCompare(String(b.id))).map((f) => f.id);
    const retour = await parFiche({
      ids, notion, versions, verrous, par, maintenant, journal, attendre, budgetMs,
      note: `« ${de} » remplacé par « ${vers} »`,
      changer(fiche) {
        const avant = liste(fiche[cle]);
        if (!avant.includes(de)) return null;
        const apres = [...new Set(avant.map((v) => (v === de ? vers : v)))];
        const choix = (valeurs) => ({ [PROP[cle]]: { multi_select: valeurs.map((name) => ({ name })) } });
        return { proprietes: choix(apres), annulation: choix(avant), changements: { [cle]: { avant, apres } } };
      },
    });
    if (retour.faites) viderMemoire();
    return retour;
  }

  // « Essayer de nouveau » : revisite le lien principal d'une seule fiche et met la colonne à jour.
  async function revisiterLien({ repere, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    try {
      const [fiches, porteurs] = await Promise.all([notion.lireRessources(), notion.lirePorteurs()]);
      const fiche = indexReperes(fiches, porteurs, secret).trouver(repere);
      if (!fiche) return refus('introuvable');
      if (!fiche.lien) return refus('invalide', { erreurs: { _: MESSAGES.sansLien } });
      const resultat = await liens.visiter(fiche.lien);
      const { depuis } = await liens.noter(fiche, resultat);
      return { ok: true, etat: resultat.etat, enPanne: !!depuis, depuis: depuis || null };
    } catch (err) {
      journal('[qualité] visite du lien impossible :', err.message);
      return refus('notion');
    }
  }

  return { lire, fusionnerValeurs, revisiterLien };
}

module.exports = { pointsDeQualite, normNom, normVal, creerQualite, SUJETS, LISTES_A_DOUBLONS };
