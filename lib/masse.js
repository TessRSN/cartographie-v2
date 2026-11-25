/**
 * Les gestes de masse du panneau : un même changement appliqué à plusieurs fiches (fusion de
 * porteurs, fusion de deux écritures d'une valeur). Le changement se fait une fiche à la fois,
 * sous le verrou de cette fiche, la fiche d'abord et sa version ensuite, et s'arrête à la
 * première erreur en disant combien de fiches sont faites et combien restent. Relancer le geste
 * reprend là où il s'est arrêté : une fiche déjà faite n'a plus rien à changer.
 */
const { cleVerrouFiche } = require('./versions');

const ESSAIS_VERROU = 8;
const PAUSE_VERROU_MS = 250;
// Le temps laissé au geste avant de s'arrêter proprement : la route s'éteint à trente secondes.
const BUDGET_MS = 18000;

/**
 * ids : les fiches à voir, dans l'ordre. changer(fiche) : ce qu'il faut écrire pour cette fiche,
 * relue sous son verrou ({ proprietes, changements }), ou null si elle n'a plus rien à changer.
 * Renvoie { ok: true, faites, historique }, ou { ok: false, code, faites, restantes } avec le code
 * 'interrompue' (erreur), 'occupee' (fiche prise par un autre geste) ou 'a-poursuivre' (temps écoulé).
 */
async function parFiche({
  ids, notion, versions, verrous, par, note = '', changer, maintenant = Date.now, journal = console.error,
  attendre = () => new Promise((suite) => setTimeout(suite, PAUSE_VERROU_MS)), budgetMs = BUDGET_MS,
}) {
  const debut = maintenant();
  let faites = 0; let vues = 0; let historique = true;
  const arret = (code, extra = {}) => ({ ok: false, code, faites, restantes: ids.length - vues, ...extra });
  for (const id of ids) {
    if (maintenant() - debut > budgetMs) return arret('a-poursuivre');
    const cle = cleVerrouFiche(id);
    let pris = false;
    try {
      for (let essai = 1; essai <= ESSAIS_VERROU && !pris; essai++) {
        pris = await verrous.prendreVerrou(cle);
        if (!pris && essai < ESSAIS_VERROU) await attendre();
      }
    } catch (err) {
      journal('[masse] verrou impossible :', err.message);
      return arret('interrompue');
    }
    if (!pris) return arret('occupee');
    try {
      // La fiche est relue sous le verrou : c'est elle qui dit s'il reste quelque chose à changer.
      const fiche = await notion.lireFiche(id);
      const changement = fiche ? changer(fiche) : null;
      if (changement) {
        await notion.mettreAJourFiche(id, changement.proprietes);
        faites += 1; vues += 1;
        const version = await ecrireVersion({ ficheId: id, nom: fiche.nom, source: 'qualite', par, changements: changement.changements, note });
        if (!version.ecrite && version.raison === 'absente') historique = false;
        // La fiche a changé sans laisser de version : on s'arrête et on le dit.
        else if (!version.ecrite) return arret('interrompue', { sansVersion: true });
      } else vues += 1;
    } catch (err) {
      journal('[masse] fiche non changée :', err.message);
      return arret('interrompue');
    } finally {
      try { await verrous.rendreVerrou(cle); } catch (err) { journal('[masse] verrou non rendu :', err.message); }
    }
  }
  return { ok: true, faites, historique };

  // Une version qui ne s'écrit pas du premier coup est essayée une seconde fois.
  async function ecrireVersion(version) {
    for (let essai = 1; essai <= 2; essai++) {
      try { return await versions.ecrire(version); } catch (err) { journal('[masse] version non écrite :', err.message); }
    }
    return { ecrite: false, raison: 'panne' };
  }
}

module.exports = { parFiche };
