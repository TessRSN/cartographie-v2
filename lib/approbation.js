/**
 * Approuver ou refuser une proposition. C'est le seul endroit où une fiche publique change.
 * L'ordre des écritures évite les doublons : la fiche d'abord, puis la décision sur la
 * proposition (qui la sort de la file), puis le courriel. Tant que la décision n'est pas
 * enregistrée, la proposition reste « En attente » et le geste peut être refait sans risque.
 */
const { PROP, proprietesDepuisValeurs, valeursDepuisFiche } = require('./notion');
const { nettoyer, fusionner, champsBouscules } = require('../public/js/champs.js');

const STATUT_PUBLIEE = 'Publiée';
const STATUT_ECARTEE = 'Écartée';
const ETAT_ACTIF = 'Actif';
const VERIFIEE_PAR = { responsable: 'Responsable', 'jy-travaille': 'Contact' };
const MESSAGE_FICHE_INCONNUE = "Cette fiche n'existe pas dans la cartographie.";

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

function creerApprobation({ notion, propositions, courriels, geocoder, viderMemoire = () => {}, idParAdresse, maintenant = Date.now, journal = console.error, verrous = verrousEnMemoire() }) {
  const cleVerrou = (id) => `proposition:${id}`;

  // Charge la proposition si elle peut encore être tranchée par cette personne.
  async function ouvrir(propositionId, approbateur) {
    if (!(await propositions.estApprobateur(approbateur))) return { echec: { ok: false, code: 'non-approbateur' } };
    // Un seul geste à la fois par proposition, toutes instances confondues.
    if (!(await verrous.prendreVerrou(cleVerrou(propositionId)))) return { echec: { ok: false, code: 'deja-tranchee' } };
    let proposition;
    try {
      proposition = await propositions.lireProposition(propositionId);
    } catch (err) {
      journal('[approbation] lecture de la proposition impossible :', err.message);
      return { echec: { ok: false, code: 'notion' }, verrou: true };
    }
    if (!proposition) return { echec: { ok: false, code: 'introuvable' }, verrou: true };
    if (proposition.statut !== 'attente') return { echec: { ok: false, code: 'deja-tranchee' }, verrou: true };
    return { proposition, verrou: true };
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

  async function approuver({ propositionId, corrections = {}, porteursNouveaux = {}, approbateur, origine = '' }) {
    const { proposition, echec, verrou } = await ouvrir(propositionId, approbateur);
    try {
      if (echec) return echec;
      const contenu = proposition.contenu;
      if (!contenuLisible(contenu)) return { ok: false, code: 'invalide', erreurs: { _: 'Le contenu de cette proposition est illisible.' } };
      const modification = proposition.genre === 'modification';

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
        fiche = proposition.ficheId ? await notion.lireFiche(proposition.ficheId) : null;
        if (!fiche || fiche.statutFiche === STATUT_ECARTEE) return { ok: false, code: 'fiche-introuvable' };
      }

      let ficheId;
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
          const proprietes = proprietesDepuisValeurs(valeurs, { porteurIds, ficheIds });
          proprietes[PROP.statutFiche] = { select: { name: STATUT_PUBLIEE } };
          if (!modification && !Object.hasOwn(valeurs, 'etat')) proprietes[PROP.etat] = { select: { name: ETAT_ACTIF } };
          // « Vérifiée » : seulement quand la proposition vient de la ressource elle-même.
          const parQui = proposition.genre === 'rsn' ? null : VERIFIEE_PAR[proposition.lienAvecRessource];
          if (parQui && !(await propositions.estApprobateur(proposition.courriel))) {
            proprietes[PROP.verifieeLe] = { date: { start: jourAuQuebec(maintenant()) } };
            proprietes[PROP.verifieePar] = { select: { name: parQui } };
          }
          if (modification || dejaCreee) {
            ficheId = modification ? fiche.id : dejaCreee;
            await notion.mettreAJourFiche(ficheId, proprietes);
          } else {
            ficheId = await notion.creerFiche(proprietes);
            await propositions.lierFiche(propositionId, ficheId);
          }
        }
        await propositions.marquerDecision(propositionId, { statut: 'approuvee', approbateur, ficheId, applique: valeurs });
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }

      viderMemoire();
      let lienFiche = origine;
      try {
        const adresse = Object.entries(await idParAdresse()).find(([, id]) => id === ficheId);
        if (adresse) lienFiche = `${origine}/ressource/${adresse[0]}`;
      } catch (err) { /* le lien retombe sur l'accueil */ }
      const envoi = await courriels.approuvee({ a: proposition.courriel, nom: valeurs.nom || (fiche && fiche.nom) || proposition.titre, lienFiche });
      return { ok: true, ficheId, courriel: !!(envoi && envoi.envoye) };
    } finally {
      if (verrou) await verrous.rendreVerrou(cleVerrou(propositionId));
    }
  }

  async function refuser({ propositionId, commentaire, approbateur }) {
    const motif = String(commentaire || '').trim();
    const { proposition, echec, verrou } = await ouvrir(propositionId, approbateur);
    try {
      if (echec) return echec;
      if (!motif) return { ok: false, code: 'invalide', erreurs: { commentaire: 'Un commentaire est nécessaire pour refuser.' } };
      try {
        await propositions.marquerDecision(propositionId, { statut: 'refusee', approbateur, commentaire: motif });
      } catch (err) {
        journal('[approbation] écriture dans Notion impossible :', err.message);
        return { ok: false, code: 'notion' };
      }
      const envoi = await courriels.refusee({ a: proposition.courriel, titre: proposition.titre, commentaire: motif });
      return { ok: true, courriel: !!(envoi && envoi.envoye) };
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
    const bouscules = actuelle && proposition.statut === 'attente' ? champsBouscules(propose, actuelle) : [];
    return { proposition, actuelle, bouscules, ficheDisparue };
  }

  return { approuver, refuser, examiner };
}

module.exports = { creerApprobation };
