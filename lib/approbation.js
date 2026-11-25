/**
 * Les gestes sur une proposition : demander un second regard, donner un avis, approuver, refuser.
 * Approuver est le seul endroit où une fiche publique change.
 * L'ordre des écritures évite les doublons : la fiche d'abord, puis la décision sur la
 * proposition (qui la sort de la file), puis le courriel. Tant que la décision n'est pas
 * enregistrée, la proposition reste ouverte et le geste peut être refait sans risque.
 * Tous les gestes passent par le même verrou, un seul à la fois par proposition.
 * Une approbation qui change des champs de la fiche écrit une version dans l'historique, juste
 * après la fiche. Si la version ne peut pas s'écrire, l'approbation réussit quand même.
 * Une « Modification de l'équipe » (genre « equipe ») est la modification d'une fiche faite dans
 * le panneau par une personne en Approbation : seule l'Administration l'approuve ou la refuse,
 * aucun courriel ne part, et elle ne marque jamais la fiche « vérifiée ». Les avis et le second
 * regard restent ouverts au rôle Approbation.
 */
const { PROP, proprietesDepuisValeurs, valeursDepuisFiche } = require('./notion');
const { nettoyer, fusionner, champsBouscules, calculerChangements } = require('../public/js/champs.js');
const { verifierOctets } = require('./images');
const { cleVerrouFiche } = require('./versions');

const STATUT_PUBLIEE = 'Publiée';
const STATUT_ECARTEE = 'Écartée';
const ETAT_ACTIF = 'Actif';
const VERIFIEE_PAR = { responsable: 'Responsable', 'jy-travaille': 'Contact' };
const MESSAGE_FICHE_INCONNUE = "Cette fiche n'existe pas dans la cartographie.";
// Une proposition « En attente » ou « En vérification » attend encore une décision.
const OUVERTS = ['attente', 'verification'];
const SENS_AVIS = ['favorable', 'defavorable'];
const MAX_COMMENTAIRE_AVIS = 1000;
// Un avis s'écrit en une seconde : s'il tombe pendant un autre geste, il patiente un peu au lieu d'échouer.
const ESSAIS_VERROU_AVIS = 10;
const PAUSE_VERROU_MS = 250;

// Date du jour au Québec, en AAAA-MM-JJ.
function jourAuQuebec(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}

// Verrou par défaut, en mémoire : suffisant en local et pour les essais. En production, le
// verrou du stockage clé-valeur (lib/limites.js) est partagé entre toutes les instances.
function verrousEnMemoire() {
  const pris = new Set();
  return {
    async prendreVerrou(nom) { if (pris.has(nom)) return false; pris.add(nom); return true; },
    async rendreVerrou(nom) { pris.delete(nom); },
  };
}

// Le contenu d'une proposition est lisible si chaque champ proposé porte une valeur « apres ».
function contenuLisible(contenu) {
  const propose = contenu && contenu.propose;
  if (!propose || typeof propose !== 'object' || Array.isArray(propose)) return false;
  return Object.values(propose).every((c) => c && typeof c === 'object' && Object.hasOwn(c, 'apres'));
}

function creerApprobation({ notion, propositions, courriels, geocoder, fichiers, versions = null, viderMemoire = () => {}, idParAdresse, maintenant = Date.now, journal = console.error, verrous = verrousEnMemoire(), attendre = () => new Promise((suite) => setTimeout(suite, PAUSE_VERROU_MS)) }) {
  const cleVerrou = (id) => `proposition:${id}`;

  // Charge la proposition si elle attend encore une décision et que cette personne peut agir.
  // Le rôle est relu ici aussi : une personne en lecture seule ne fait aucun geste, même si
  // l'appel ne passe pas par la route du panneau.
  async function ouvrir(propositionId, approbateur, { essais = 1 } = {}) {
    if (!(await propositions.peutDecider(approbateur))) return { echec: { ok: false, code: 'non-approbateur' } };
    // Un seul geste à la fois par proposition, toutes instances confondues.
    // « occupee » : un autre geste est en cours sur cette proposition ; elle n'est pas forcément tranchée.
    let pris = false;
    for (let essai = 1; essai <= essais && !pris; essai++) {
      pris = await verrous.prendreVerrou(cleVerrou(propositionId));
      if (!pris && essai < essais) await attendre();
    }
    if (!pris) return { echec: { ok: false, code: 'occupee' } };
    let proposition;
    try {
      proposition = await propositions.lireProposition(propositionId);
    } catch (err) {
      journal('[approbation] lecture de la proposition impossible :', err.message);
      return { echec: { ok: false, code: 'notion' }, verrou: true };
    }
    if (!proposition) return { echec: { ok: false, code: 'introuvable' }, verrou: true };
    if (!OUVERTS.includes(proposition.statut)) return { echec: { ok: false, code: 'deja-tranchee' }, verrou: true };
    return { proposition, verrou: true };
  }

  // Une modification de l'équipe ne se tranche qu'en Administration : le rôle est relu ici, pas
  // seulement dans la route. Renvoie le refus, ou null si la personne peut trancher.
  async function refusDeTrancher(proposition, approbateur) {
    if (proposition.genre !== 'equipe') return null;
    const qui = String(approbateur || '').trim().toLowerCase();
    const personne = (await propositions.equipe()).find((x) => x.courriel === qui);
    return personne && personne.role === 'administration' ? null : { ok: false, code: 'role' };
  }

  // Identifiants des porteurs nommés : les existants sont réutilisés, les nouveaux créés.
  async function resoudrePorteurs(noms, adresses) {
    const existants = new Map((await notion.lirePorteurs()).map((p) => [p.nom.trim().toLowerCase(), p.id]));
    const ids = [];
    for (const nom of noms) {
      const connu = existants.get(nom.trim().toLowerCase());
      if (connu) { ids.push(connu); continue; }
      const adresse = String((Object.hasOwn(adresses, nom) && adresses[nom]) || '').trim();
      const porteur = { nom, adresse };
      if (adresse) {
        try {
          const lieu = await geocoder(adresse);
          if (lieu) Object.assign(porteur, lieu);
        } catch (err) {
          journal('[approbation] géocodage impossible :', err.message);
        }
      }
      const id = await notion.creerPorteur(porteur);
      existants.set(nom.trim().toLowerCase(), id);
      ids.push(id);
    }
    return ids;
  }

  // Ce que valait la fiche avant l'écriture, dans la forme du catalogue, pour la version ;
  // null si cela n'a pas pu être lu (la version est alors sautée, jamais l'approbation).
  async function valeursAvant(ficheOuId, table) {
    try {
      const brute = typeof ficheOuId === 'string' ? await notion.lireFiche(ficheOuId) : ficheOuId;
      if (!brute) return null;
      const porteursParId = new Map((await notion.lirePorteurs()).map((p) => [p.id, p]));
      const adresseParId = new Map(Object.entries(table).map(([adresse, id]) => [id, adresse]));
      return valeursDepuisFiche(brute, porteursParId, adresseParId);
    } catch (err) {
      journal("[approbation] lecture de la fiche pour l'historique impossible :", err.message);
      return null;
    }
  }
  // Écrit la version d'une fiche qui vient de changer. Ne fait jamais échouer l'approbation.
  // Renvoie false seulement si une version devait s'écrire et ne l'a pas pu.
  async function noterVersion(version) {
    if (!Object.keys(version.changements).length) return true;
    try {
      await versions.ecrire(version);
      return true;
    } catch (err) {
      journal('[approbation] version non écrite :', err.message);
      return false;
    }
  }

  async function approuver({ propositionId, corrections = {}, porteursNouveaux = {}, sansLogo = false, approbateur, origine = '' }) {
    const { proposition, echec, verrou } = await ouvrir(propositionId, approbateur);
    let verrouFiche = null;
    try {
      if (echec) return echec;
      const deLEquipe = proposition.genre === 'equipe';
      const interdit = await refusDeTrancher(proposition, approbateur);
      if (interdit) return interdit;
      const contenu = proposition.contenu;
      if (!contenuLisible(contenu)) return { ok: false, code: 'invalide', erreurs: { _: 'Le contenu de cette proposition est illisible.' } };
      // Une modification de l'équipe vise une fiche, comme une modification du public.
      const modification = proposition.genre === 'modification' || deLEquipe;

      const { valeurs, erreurs } = nettoyer(fusionner(contenu.propose || {}, corrections), {
        role: 'approbateur', options: await notion.lireOptions(), genre: modification ? 'modification' : 'nouvelle',
      });

      // Liens entre fiches : des adresses du site vers les identifiants Notion.
      const ficheIds = {};
      const table = await idParAdresse();
      for (const cle of ['faitPartieDe', 'reposeSur', 'donneAccesA', 'remplace']) {
        if (!Object.hasOwn(valeurs, cle)) continue;
        if (valeurs[cle].some((adresse) => !Object.hasOwn(table, adresse))) erreurs[cle] = MESSAGE_FICHE_INCONNUE;
        else ficheIds[cle] = valeurs[cle].map((adresse) => table[adresse]);
      }
      if (Object.keys(erreurs).length) return { ok: false, code: 'invalide', erreurs };

      let fiche = null;
      if (modification) {
        // La fiche visée est verrouillée le temps de la lire, de l'écrire et d'écrire sa version :
        // un enregistrement fait au même moment dans le panneau attend son tour.
        if (versions && proposition.ficheId) {
          const cle = cleVerrouFiche(proposition.ficheId);
          for (let essai = 1; essai <= ESSAIS_VERROU_AVIS && !verrouFiche; essai++) {
            if (await verrous.prendreVerrou(cle)) verrouFiche = cle;
            else if (essai < ESSAIS_VERROU_AVIS) await attendre();
          }
          if (!verrouFiche) return { ok: false, code: 'occupee' };
        }
        fiche = proposition.ficheId ? await notion.lireFiche(proposition.ficheId) : null;
        if (!fiche || fiche.statutFiche === STATUT_ECARTEE) return { ok: false, code: 'fiche-introuvable' };
        // Le panneau ne voit que les fiches publiques : un lien vers une fiche qui ne l'est pas
        // (ou plus) est conservé, pour qu'une correction ne l'efface pas sans que personne l'ait vu.
        const publiques = new Set(Object.values(table));
        for (const cle of Object.keys(ficheIds)) {
          const caches = (fiche[cle] || []).filter((id) => !publiques.has(id) && !ficheIds[cle].includes(id));
          ficheIds[cle] = [...ficheIds[cle], ...caches];
        }
      }

      let ficheId; let historique = true;
      try {
        // Une tentative précédente a pu créer la fiche sans réussir à enregistrer la décision :
        // elle est alors déjà reliée à la proposition, et on la met à jour au lieu de la recréer.
        const dejaCreee = modification ? null : proposition.ficheId;
        if (!modification && !dejaCreee && await notion.trouverFiche({ nom: valeurs.nom, lien: valeurs.lien })) {
          return { ok: false, code: 'doublon' };
        }
        {
          const porteurIds = Object.hasOwn(valeurs, 'porteurs')
            ? await resoudrePorteurs(valeurs.porteurs, { ...(contenu.porteursNouveaux || {}), ...porteursNouveaux })
            : undefined;
          // Pour l'historique : l'état de la fiche avant cette écriture.
          const avant = versions && (modification || dejaCreee) ? await valeursAvant(modification ? fiche : dejaCreee, table) : null;
          const proprietes = proprietesDepuisValeurs(valeurs, { porteurIds, ficheIds });
          proprietes[PROP.statutFiche] = { select: { name: STATUT_PUBLIEE } };
          if (!modification && !Object.hasOwn(valeurs, 'etat')) proprietes[PROP.etat] = { select: { name: ETAT_ACTIF } };
          // « Vérifiée » : seulement quand la proposition vient de la ressource elle-même.
          // Jamais pour une modification de l'équipe, quoi que dise la proposition.
          const parQui = proposition.genre === 'rsn' || deLEquipe ? null : VERIFIEE_PAR[proposition.lienAvecRessource];
          if (parQui && !(await propositions.estApprobateur(proposition.courriel))) {
            proprietes[PROP.verifieeLe] = { date: { start: jourAuQuebec(maintenant()) } };
            proprietes[PROP.verifieePar] = { select: { name: parQui } };
          }
          // Le logo joint à la proposition est recopié dans la fiche : Notion ne déplace pas un
          // fichier d'une page à l'autre, on le relit donc pour le déposer de nouveau.
          if (proposition.logoPropose && !sansLogo) {
            const image = verifierOctets(await fichiers.telecharger(proposition.logoPropose.url));
            if (!image.ok) throw new Error('logo proposé illisible');
            proprietes[PROP.logoFichier] = fichiers.proprieteFichier(await fichiers.deposer(image), image.nom);
          } else if (modification && Object.hasOwn(valeurs, 'logo')) {
            // Une nouvelle adresse de logo (ou son retrait) remplace l'image déposée auparavant.
            proprietes[PROP.logoFichier] = { files: [] };
          }
          if (modification || dejaCreee) {
            ficheId = modification ? fiche.id : dejaCreee;
            await notion.mettreAJourFiche(ficheId, proprietes);
          } else {
            ficheId = await notion.creerFiche(proprietes);
            await propositions.lierFiche(propositionId, ficheId);
          }
          // La version suit la fiche, avant la décision : si la décision ne s'enregistre pas, la
          // tentative suivante ne trouve plus rien de changé et n'écrit pas une seconde version.
          if (versions) {
            const commun = { ficheId, nom: valeurs.nom || (fiche && fiche.nom) || proposition.titre, par: approbateur, propositionId };
            if (modification || dejaCreee) {
              historique = avant ? await noterVersion({ ...commun, source: 'proposition', changements: calculerChangements(avant, valeurs) }) : false;
            } else {
              const publiees = Object.hasOwn(valeurs, 'etat') ? valeurs : { ...valeurs, etat: ETAT_ACTIF };
              historique = await noterVersion({ ...commun, source: 'creation', changements: calculerChangements(null, publiees) });
            }
          }
        }
        await propositions.marquerDecision(propositionId, { statut: 'approuvee', approbateur, ficheId, applique: valeurs });
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }

      viderMemoire();
      const nom = valeurs.nom || (fiche && fiche.nom) || proposition.titre;
      // « genre » et « nom » : pour le journal de l'équipe.
      const dit = { genre: proposition.genre, nom };
      // Une modification de l'équipe ne prévient personne par courriel.
      if (deLEquipe) return { ok: true, ficheId, courriel: false, ...(versions ? { historique } : {}), ...dit };
      let lienFiche = origine;
      try {
        const adresse = Object.entries(await idParAdresse()).find(([, id]) => id === ficheId);
        if (adresse) lienFiche = `${origine}/ressource/${adresse[0]}`;
      } catch (err) { /* le lien retombe sur l'accueil */ }
      const envoi = await courriels.approuvee({ a: proposition.courriel, nom, lienFiche });
      // « historique » : faux si la fiche a changé sans que sa version ait pu s'écrire.
      return { ok: true, ficheId, courriel: !!(envoi && envoi.envoye), ...(versions ? { historique } : {}), ...dit };
    } finally {
      if (verrouFiche) await verrous.rendreVerrou(verrouFiche);
      if (verrou) await verrous.rendreVerrou(cleVerrou(propositionId));
    }
  }

  async function refuser({ propositionId, commentaire, approbateur }) {
    const motif = String(commentaire || '').trim();
    const { proposition, echec, verrou } = await ouvrir(propositionId, approbateur);
    try {
      if (echec) return echec;
      const interdit = await refusDeTrancher(proposition, approbateur);
      if (interdit) return interdit;
      if (!motif) return { ok: false, code: 'invalide', erreurs: { commentaire: 'Un commentaire est nécessaire pour refuser.' } };
      try {
        await propositions.marquerDecision(propositionId, { statut: 'refusee', approbateur, commentaire: motif });
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }
      const dit = { genre: proposition.genre, titre: proposition.titre };
      // Le refus d'une modification de l'équipe se lit dans le panneau : aucun courriel.
      if (proposition.genre === 'equipe') return { ok: true, courriel: false, ...dit };
      const envoi = await courriels.refusee({ a: proposition.courriel, titre: proposition.titre, commentaire: motif });
      return { ok: true, courriel: !!(envoi && envoi.envoye), ...dit };
    } finally {
      if (verrou) await verrous.rendreVerrou(cleVerrou(propositionId));
    }
  }

  // Second regard : la proposition passe « En vérification ». Rien d'autre ne change, aucun courriel ne part.
  async function mettreEnVerification({ propositionId, par }) {
    const { proposition, echec, verrou } = await ouvrir(propositionId, par);
    try {
      if (echec) return echec;
      if (proposition.statut === 'verification') return { ok: true, inchangee: true };
      try {
        await propositions.marquerVerification(propositionId);
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }
      return { ok: true, genre: proposition.genre, titre: proposition.titre };
    } finally {
      if (verrou) await verrous.rendreVerrou(cleVerrou(propositionId));
    }
  }

  // Avis d'une personne de l'équipe : favorable ou défavorable, avec un commentaire facultatif.
  // Un avis ne décide rien. Un seul avis par personne : le nouveau remplace le sien.
  async function donnerAvis({ propositionId, par, sens, commentaire }) {
    if (!(await propositions.peutDecider(par))) return { ok: false, code: 'non-approbateur' };
    const texte = String(typeof commentaire === 'string' ? commentaire : '').replace(/\s+/g, ' ').trim();
    if (!SENS_AVIS.includes(sens)) return { ok: false, code: 'invalide', erreurs: { sens: "Choisissez un avis favorable ou défavorable." } };
    if (texte.length > MAX_COMMENTAIRE_AVIS) return { ok: false, code: 'invalide', erreurs: { commentaire: `Ce commentaire dépasse ${MAX_COMMENTAIRE_AVIS} caractères.` } };
    const { echec, verrou } = await ouvrir(propositionId, par, { essais: ESSAIS_VERROU_AVIS });
    try {
      if (echec) return echec;
      try {
        const personne = (await propositions.equipe()).find((x) => x.courriel === String(par).trim().toLowerCase());
        const avis = await propositions.ecrireAvis(propositionId, {
          courriel: par, nom: (personne && personne.nom) || '', sens, commentaire: texte, le: new Date(maintenant()).toISOString(),
        });
        return { ok: true, avis };
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }
    } finally {
      if (verrou) await verrous.rendreVerrou(cleVerrou(propositionId));
    }
  }

  // Ce que le panneau montre : la proposition, les valeurs actuelles de la fiche visée
  // (champs du catalogue seulement) et les champs qui ont changé depuis la proposition.
  async function examiner(propositionId) {
    const proposition = await propositions.lireProposition(propositionId);
    if (!proposition) return null;
    let actuelle = null; let ficheDisparue = false;
    if (proposition.ficheId) {
      const fiche = await notion.lireFiche(proposition.ficheId);
      if (!fiche || fiche.statutFiche === STATUT_ECARTEE) ficheDisparue = true;
      else {
        const porteursParId = new Map((await notion.lirePorteurs()).map((p) => [p.id, p]));
        const adresseParId = new Map(Object.entries(await idParAdresse()).map(([adresse, id]) => [id, adresse]));
        actuelle = valeursDepuisFiche(fiche, porteursParId, adresseParId);
      }
    }
    const propose = (proposition.contenu && proposition.contenu.propose) || {};
    const bouscules = actuelle && OUVERTS.includes(proposition.statut) ? champsBouscules(propose, actuelle) : [];
    return { proposition, actuelle, bouscules, ficheDisparue };
  }

  return { approuver, refuser, mettreEnVerification, donnerAvis, examiner };
}

module.exports = { creerApprobation, verrousEnMemoire, jourAuQuebec };
