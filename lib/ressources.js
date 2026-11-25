/**
 * Les fiches vues et modifiées depuis le panneau : le tableau de toutes les fiches (publiques et
 * écartées), une fiche avec son historique, et les gestes : enregistrer, rétablir une version,
 * marquer vérifiée, écarter, republier, ajouter une ressource.
 * Chaque changement des champs d'une fiche écrit une version : la fiche d'abord, la version
 * ensuite, sous le verrou partagé de la fiche. Rien ne s'écrit si rien n'a changé.
 * Rien de ce qui sort d'ici ne porte un identifiant Notion de fiche, une adresse de fichier Notion
 * ni un champ hors du catalogue : une fiche est désignée par son adresse publique, ou, si elle
 * n'en a pas (fiche écartée), par un repère opaque calculé à partir de son identifiant.
 */
const crypto = require('node:crypto');
const { PROP, proprietesDepuisValeurs, valeursDepuisFiche } = require('./notion');
const { assembler } = require('./fiches');
const { cleVerrouFiche, avecDepart, reconstituer } = require('./versions');
const { verrousEnMemoire, jourAuQuebec } = require('./approbation');
const { CHAMPS, nettoyer, egales, calculerChangements, departPanneau } = require('../public/js/champs.js');

const STATUT_PUBLIEE = 'Publiée';
const STATUT_ECARTEE = 'Écartée';
const ETAT_ACTIF = 'Actif';
// « Vérifiée par » quand c'est l'équipe qui marque la fiche vérifiée dans le panneau.
const VERIFIEE_PAR_EQUIPE = 'Équipe du RSN';
const OUVERTS = ['attente', 'verification'];
const RELATIONS = CHAMPS.filter((c) => c.saisie === 'fiches').map((c) => c.cle);
const CLES = new Set(CHAMPS.map((c) => c.cle));
const MESSAGES = {
  depart: 'La valeur de départ de chaque champ modifié est nécessaire.',
  porteur: (nom) => `« ${nom} » n'est pas dans le catalogue des porteurs. Choisissez un porteur existant.`,
  fiche: "Cette fiche n'existe pas dans la cartographie.",
  soiMeme: 'Une fiche ne peut pas être liée à elle-même.',
  version: "Cette version n'existe pas.",
  illisible: "Une version plus récente est illisible dans l'historique : rétablir donnerait une fiche mélangée. Corrigez plutôt la fiche à la main.",
  ecartee: 'Une fiche écartée ne se marque pas vérifiée.',
};
// Le verrou d'une fiche : s'il est pris, le geste patiente un peu avant de renoncer.
// Un nom ou un lien réduit à ce qui le distingue, pour repérer une fiche qui ressemble.
const lienReduit = (lien) => (typeof lien === 'string' ? lien.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/#?]+$/, '') : '');
const nomReduit = (nom) => (typeof nom === 'string' ? nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : '');
const ESSAIS_VERROU = 8;
const PAUSE_VERROU_MS = 250;
const FORME_REPERE = /^(~[0-9a-f]{24}|[a-z0-9-]{1,200})$/;

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const duCatalogue = (valeurs) => Object.fromEntries(Object.entries(objet(valeurs)).filter(([cle]) => CLES.has(cle)));
const repereValide = (repere) => typeof repere === 'string' && FORME_REPERE.test(repere);
// Un repère opaque : il désigne une fiche ou un porteur sans permettre de retrouver son identifiant Notion.
const opaqueDe = (sorte, secret) => (id) => `~${crypto.createHmac('sha256', `${sorte}:${secret}`).update(String(id)).digest('hex').slice(0, 24)}`;

// Pour les autres écrans du panneau : le repère de chaque fiche (son adresse publique, sinon un
// repère opaque) et la fiche que désigne un repère.
function indexReperes(fiches, porteurs, secret) {
  const opaque = opaqueDe('fiche', secret);
  const { idParAdresse } = assembler(fiches, porteurs);
  const adresseParId = new Map(Object.entries(idParAdresse).map(([adresse, id]) => [id, adresse]));
  return {
    repereDe: (id) => adresseParId.get(id) || opaque(id),
    trouver(repere) {
      if (!repereValide(repere)) return null;
      if (repere.startsWith('~')) return fiches.find((f) => opaque(f.id) === repere) || null;
      const id = Object.hasOwn(idParAdresse, repere) ? idParAdresse[repere] : null;
      return id ? fiches.find((f) => f.id === id) || null : null;
    },
  };
}

function creerRessources({
  notion, versions, propositions, verrous = verrousEnMemoire(), viderMemoire = () => {}, secret = '',
  maintenant = Date.now, journal = console.error, attendre = () => new Promise((suite) => setTimeout(suite, PAUSE_VERROU_MS)),
}) {
  // Le repère d'une fiche sans adresse publique : il ne permet pas de retrouver l'identifiant Notion.
  const opaque = opaqueDe('fiche', secret);

  // Les fiches et les porteurs, avec les tables qui servent à passer des identifiants aux adresses.
  function indexer(fiches, porteurs) {
    const { ressources: publiques, idParAdresse } = assembler(fiches, porteurs);
    const adresseParId = new Map(Object.entries(idParAdresse).map(([adresse, id]) => [id, adresse]));
    return {
      fiches, porteurs, idParAdresse, adresseParId,
      porteursParId: new Map(porteurs.map((p) => [p.id, p])),
      publiqueParAdresse: new Map(publiques.map((r) => [r.adresse, r])),
      fichesPubliques: publiques.map((r) => ({ adresse: r.adresse, nom: r.nom })),
      repereDe: (id) => adresseParId.get(id) || opaque(id),
    };
  }
  // Toujours une lecture fraîche de Notion : le panneau montre aussi les fiches écartées, que les
  // données publiques ne portent pas, et un geste ne doit pas partir d'une copie périmée.
  async function catalogue() {
    const [fiches, porteurs] = await Promise.all([notion.lireRessources(), notion.lirePorteurs()]);
    return indexer(fiches, porteurs);
  }
  // La fiche que désigne un repère : une adresse publique, ou un repère opaque (compris pour toute fiche).
  function trouver(cat, repere) {
    if (!repereValide(repere)) return null;
    if (repere.startsWith('~')) return cat.fiches.find((f) => opaque(f.id) === repere) || null;
    const id = Object.hasOwn(cat.idParAdresse, repere) ? cat.idParAdresse[repere] : null;
    return id ? cat.fiches.find((f) => f.id === id) || null : null;
  }
  // Le repère d'une fiche après une écriture : son nom, ses porteurs ou son statut ont pu changer.
  async function repereApres(cat, id) {
    let relue = null;
    try { relue = await notion.lireFiche(id); } catch (err) { journal('[ressources] relecture de la fiche impossible :', err.message); }
    if (!relue) return cat.repereDe(id);
    const fiches = cat.fiches.some((f) => f.id === id) ? cat.fiches.map((f) => (f.id === id ? relue : f)) : [...cat.fiches, relue];
    return indexer(fiches, cat.porteurs).repereDe(id);
  }

  const valeursDe = (cat, fiche) => valeursDepuisFiche(fiche, cat.porteursParId, cat.adresseParId);
  const statutDe = (fiche) => (fiche.statutFiche === STATUT_ECARTEE ? 'ecartee' : 'publiee');
  const nomsDesPorteurs = (cat) => cat.porteurs.map((p) => p.nom).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
  // Les listes de choix du formulaire : choix fermés, valeurs déjà connues des listes ouvertes, porteurs, fiches.
  async function choixPossibles(cat) {
    const options = await notion.lireOptions();
    const fermes = CHAMPS.filter((c) => c.saisie === 'choix' || c.saisie === 'choixMultiples');
    const ouvertes = CHAMPS.filter((c) => c.saisie === 'listeOuverte' && c.cle !== 'porteurs');
    return {
      options: Object.fromEntries(fermes.map((c) => [c.cle, options[c.cle] || []])),
      existantes: { ...Object.fromEntries(ouvertes.map((c) => [c.cle, options[c.cle] || []])), porteurs: nomsDesPorteurs(cat), fiches: cat.fichesPubliques },
    };
  }

  // ─── Lecture ───
  async function lister() {
    const [cat, ouvertes] = await Promise.all([catalogue(), propositions.listerPropositions({ statut: 'ouvertes' })]);
    let comptes = new Map(); let historique = versions.active();
    try { comptes = await versions.compter(); } catch (err) { historique = false; journal("[ressources] lecture de l'historique impossible :", err.message); }
    const attentes = new Map();
    for (const p of ouvertes) if (p.ficheId && OUVERTS.includes(p.statut)) attentes.set(p.ficheId, (attentes.get(p.ficheId) || 0) + 1);
    const ressources = cat.fiches.map((f) => {
      const v = valeursDe(cat, f); const c = comptes.get(f.id);
      return {
        id: cat.repereDe(f.id), adresse: cat.adresseParId.get(f.id) || null,
        nom: v.nom || '', autresNoms: v.autresNoms || '', typePrincipal: v.typePrincipal, secondType: v.secondType,
        porteurs: v.porteurs, motsCles: v.motsCles || [], lien: v.lien, contact: v.contact,
        statut: statutDe(f), verifieeLe: f.verifieeLe || null,
        versions: c ? c.nombre : 1, dernier: c && c.dernier ? { le: c.dernier.le, par: c.dernier.par, source: c.dernier.source } : null,
        enAttente: attentes.get(f.id) || 0,
      };
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id));
    return { ressources, historique };
  }

  function vueFiche(cat, fiche) {
    const adresse = cat.adresseParId.get(fiche.id) || null;
    const publique = adresse ? cat.publiqueParAdresse.get(adresse) : null;
    return {
      id: cat.repereDe(fiche.id), adresse, nom: fiche.nom || '', statut: statutDe(fiche),
      verifieeLe: fiche.verifieeLe || null, verifieePar: fiche.verifieePar || null,
      // Le logo tel que le site le sert déjà ; « logoDepose » dit seulement qu'une image a été déposée.
      logo: (publique && publique.logo) || null, logoDepose: !!fiche.logoFichier,
    };
  }

  // Une fiche, ses valeurs, son historique et les listes de choix ; null si le repère ne désigne rien.
  async function lire(repere) {
    const cat = await catalogue();
    const fiche = trouver(cat, repere);
    if (!fiche) return null;
    const [toutes, choix] = await Promise.all([propositions.listerPropositions({ statut: 'toutes' }), choixPossibles(cat)]);
    let lignes = []; let historique = versions.active();
    try { lignes = await versions.lister(fiche.id); } catch (err) { historique = false; journal("[ressources] lecture de l'historique impossible :", err.message); }
    const parId = new Map(toutes.map((p) => [p.id, p]));
    return {
      fiche: vueFiche(cat, fiche),
      valeurs: valeursDe(cat, fiche),
      versions: avecDepart(lignes).map((v) => {
        const p = v.propositionId ? parId.get(v.propositionId) : null;
        return {
          numero: v.numero, le: v.le, par: v.par, source: v.source, note: v.note, changements: v.changements, illisible: !!v.illisible,
          proposition: p ? { id: p.id, nomProposant: p.nomProposant || '', lien: p.lienAvecRessource || null } : null,
        };
      }),
      historique,
      enAttente: toutes.filter((p) => p.ficheId === fiche.id && OUVERTS.includes(p.statut)).map((p) => ({ id: p.id, genre: p.genre, nomProposant: p.nomProposant || '' })),
      ...choix,
    };
  }

  // Le formulaire d'une nouvelle ressource : tous les champs vides, et les listes de choix.
  async function neuve() {
    return { valeurs: departPanneau(null, null), ...(await choixPossibles(await catalogue())) };
  }

  // ─── Écriture ───
  const refus = (code, extra = {}) => ({ ok: false, code, ...extra });

  // Les porteurs nommés, ramenés à l'écriture exacte de leur nom dans le catalogue.
  // Aucun porteur n'est créé ici : un nom inconnu est une erreur.
  function rattacherPorteurs(cat, valeurs, erreurs) {
    if (!Object.hasOwn(valeurs, 'porteurs')) return;
    const parNom = new Map(cat.porteurs.filter((p) => p.nom).map((p) => [p.nom.trim().toLowerCase(), p]));
    const inconnu = valeurs.porteurs.find((nom) => !parNom.has(nom.trim().toLowerCase()));
    if (inconnu) erreurs.porteurs = MESSAGES.porteur(inconnu);
    else valeurs.porteurs = [...new Set(valeurs.porteurs.map((nom) => parNom.get(nom.trim().toLowerCase()).nom))];
  }
  const idsDesPorteurs = (cat, noms) => { const parNom = new Map(cat.porteurs.map((p) => [p.nom, p.id])); return noms.map((nom) => parNom.get(nom)); };
  // Liens entre fiches : des adresses du site vers les identifiants Notion. Un lien vers une fiche
  // que le panneau ne montre pas (écartée) est conservé : personne ne l'a vu, personne ne l'a retiré.
  function resoudreLiens(cat, fiche, valeurs, erreurs) {
    const ficheIds = {};
    for (const cle of RELATIONS) {
      if (!Object.hasOwn(valeurs, cle)) continue;
      if (valeurs[cle].some((adresse) => !Object.hasOwn(cat.idParAdresse, adresse))) { erreurs[cle] = MESSAGES.fiche; continue; }
      const ids = valeurs[cle].map((adresse) => cat.idParAdresse[adresse]);
      if (fiche && ids.includes(fiche.id)) { erreurs[cle] = MESSAGES.soiMeme; continue; }
      const caches = ((fiche && fiche[cle]) || []).filter((id) => !cat.adresseParId.has(id) && !ids.includes(id));
      ficheIds[cle] = [...ids, ...caches];
    }
    return ficheIds;
  }

  async function noterVersion(version) {
    try {
      return await versions.ecrire(version);
    } catch (err) {
      journal('[ressources] version non écrite :', err.message);
      return { ecrite: false, raison: 'panne' };
    }
  }

  // Le cadre commun des gestes sur une fiche : le rôle, la fiche désignée, le verrou, la relecture.
  async function surFiche({ repere, par }, geste) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    let cat;
    try { cat = await catalogue(); } catch (err) { journal('[ressources] lecture de Notion impossible :', err.message); return refus('notion'); }
    const designee = trouver(cat, repere);
    if (!designee) return refus('introuvable');
    const cle = cleVerrouFiche(designee.id);
    let pris = false;
    for (let essai = 1; essai <= ESSAIS_VERROU && !pris; essai++) {
      pris = await verrous.prendreVerrou(cle);
      if (!pris && essai < ESSAIS_VERROU) await attendre();
    }
    if (!pris) return refus('occupee');
    try {
      // La fiche est relue sous le verrou : c'est elle qui fait foi pour le conflit et pour l'« avant ».
      const fiche = await notion.lireFiche(designee.id);
      if (!fiche) return refus('introuvable');
      return await geste(cat, fiche);
    } catch (err) {
      journal('[ressources] geste impossible :', err.message);
      return refus('notion');
    } finally {
      await verrous.rendreVerrou(cle);
    }
  }

  // Applique à la fiche les valeurs qui diffèrent de ses valeurs actuelles, puis écrit la version.
  async function changer(cat, fiche, actuelle, propres, { source, par, note = '' }) {
    const erreurs = {};
    rattacherPorteurs(cat, propres, erreurs);
    const changements = calculerChangements(actuelle, propres);
    const aEcrire = Object.fromEntries(Object.keys(changements).map((cle) => [cle, propres[cle]]));
    const ficheIds = resoudreLiens(cat, fiche, aEcrire, erreurs);
    if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
    if (!Object.keys(changements).length) return { ok: true, inchangee: true, id: cat.repereDe(fiche.id) };
    const proprietes = proprietesDepuisValeurs(aEcrire, {
      porteurIds: Object.hasOwn(aEcrire, 'porteurs') ? idsDesPorteurs(cat, aEcrire.porteurs) : undefined, ficheIds,
    });
    // Une nouvelle adresse de logo (ou son retrait) saisie dans le panneau remplace l'image déposée,
    // comme à l'approbation. Un rétablissement, lui, laisse l'image déposée en place.
    // Vider l'adresse ne retire pas l'image : seule une nouvelle adresse la remplace.
    if (source === 'panneau' && Object.hasOwn(aEcrire, 'logo') && aEcrire.logo) proprietes[PROP.logoFichier] = { files: [] };
    await notion.mettreAJourFiche(fiche.id, proprietes);
    const version = await noterVersion({ ficheId: fiche.id, nom: Object.hasOwn(aEcrire, 'nom') ? aEcrire.nom : fiche.nom, source, par, changements, note });
    viderMemoire();
    return { ok: true, id: await repereApres(cat, fiche.id), numero: version.ecrite ? version.numero : null, historique: !!version.ecrite, champs: Object.keys(changements).length };
  }

  // valeurs : les champs modifiés ; depart : leur valeur quand la personne a ouvert la fiche.
  async function enregistrer({ repere, valeurs, depart, par }) {
    return surFiche({ repere, par }, async (cat, fiche) => {
      const saisie = duCatalogue(valeurs); const origine = objet(depart);
      if (Object.keys(saisie).some((cle) => !Object.hasOwn(origine, cle))) return refus('invalide', { erreurs: { _: MESSAGES.depart } });
      const { valeurs: propres, erreurs } = nettoyer(saisie, { role: 'approbateur', options: await notion.lireOptions(), genre: 'modification' });
      if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
      const actuelle = valeursDe(cat, fiche);
      // Conflit : un champ que la personne modifie a changé sur la fiche depuis qu'elle l'a ouverte.
      const conflits = {};
      for (const cle of Object.keys(propres)) {
        if (!egales(origine[cle], actuelle[cle]) && !egales(propres[cle], actuelle[cle])) conflits[cle] = actuelle[cle];
      }
      if (Object.keys(conflits).length) return refus('conflit', { conflits });
      return changer(cat, fiche, actuelle, propres, { source: 'panneau', par });
    });
  }

  // La fiche reprend les valeurs qu'elle avait à la version donnée. Rien n'est retiré de
  // l'historique : une version « Rétablissement » s'y ajoute.
  async function retablir({ repere, numero, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    if (!versions.active()) return refus('sans-historique');
    return surFiche({ repere, par }, async (cat, fiche) => {
      const liste = avecDepart(await versions.lister(fiche.id));
      if (!Number.isInteger(numero) || !liste.some((v) => v.numero === numero)) return refus('invalide', { erreurs: { _: MESSAGES.version } });
      // Une version plus récente illisible fausserait la reconstitution : on refuse plutôt que de mélanger.
      if (liste.some((v) => v.numero > numero && v.illisible)) return refus('invalide', { erreurs: { _: MESSAGES.illisible } });
      const actuelle = valeursDe(cat, fiche);
      const cible = reconstituer(actuelle, liste, numero);
      const differents = Object.keys(calculerChangements(actuelle, cible));
      if (!differents.length) return { ok: true, inchangee: true, id: cat.repereDe(fiche.id) };
      const { valeurs: propres, erreurs } = nettoyer(Object.fromEntries(differents.map((cle) => [cle, cible[cle]])), {
        role: 'approbateur', options: await notion.lireOptions(), genre: 'modification',
      });
      // Une valeur ancienne peut ne plus être valable (porteur renommé, fiche liée disparue, option
      // retirée). Ce champ est laissé de côté et nommé ; les autres reviennent.
      const essai = JSON.parse(JSON.stringify(propres));
      rattacherPorteurs(cat, essai, erreurs);
      resoudreLiens(cat, fiche, essai, erreurs);
      const laisses = Object.keys(erreurs).filter((cle) => cle !== '_');
      for (const cle of laisses) delete propres[cle];
      if (erreurs._ || !Object.keys(propres).length) return refus('invalide', { erreurs });
      const note = `Retour à la version ${numero}${laisses.length ? ` (sauf : ${laisses.join(', ')})` : ''}`;
      const retour = await changer(cat, fiche, actuelle, propres, { source: 'retablissement', par, note });
      return retour.ok && laisses.length ? { ...retour, laisses } : retour;
    });
  }

  // Marquer vérifiée, écarter, republier : ce ne sont pas des champs du catalogue, aucune version.
  async function verifier({ repere, par }) {
    return surFiche({ repere, par }, async (cat, fiche) => {
      if (fiche.statutFiche === STATUT_ECARTEE) return refus('invalide', { erreurs: { _: MESSAGES.ecartee } });
      const verifieeLe = jourAuQuebec(maintenant());
      await notion.mettreAJourFiche(fiche.id, { [PROP.verifieeLe]: { date: { start: verifieeLe } }, [PROP.verifieePar]: { select: { name: VERIFIEE_PAR_EQUIPE } } });
      viderMemoire();
      return { ok: true, id: cat.repereDe(fiche.id), verifieeLe, verifieePar: VERIFIEE_PAR_EQUIPE };
    });
  }
  function changerStatut(statut) {
    return ({ repere, par }) => surFiche({ repere, par }, async (cat, fiche) => {
      const dejaFait = statut === STATUT_ECARTEE ? fiche.statutFiche === STATUT_ECARTEE : fiche.statutFiche === STATUT_PUBLIEE;
      if (dejaFait) return { ok: true, id: cat.repereDe(fiche.id) };
      await notion.mettreAJourFiche(fiche.id, { [PROP.statutFiche]: { select: { name: statut } } });
      viderMemoire();
      return { ok: true, id: await repereApres(cat, fiche.id) };
    });
  }

  // Ajouter une ressource sans passer par le formulaire public : publiée tout de suite, non vérifiée.
  async function creer({ valeurs, par, malgreRessemblance = false }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    try {
      const { valeurs: propres, erreurs } = nettoyer(duCatalogue(valeurs), { role: 'approbateur', options: await notion.lireOptions(), genre: 'nouvelle' });
      const cat = await catalogue();
      rattacherPorteurs(cat, propres, erreurs);
      const ficheIds = resoudreLiens(cat, null, propres, erreurs);
      if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
      if (await notion.trouverFiche({ nom: propres.nom, lien: propres.lien })) return refus('doublon');
      // Même nom ou même lien à la casse, aux accents ou à une barre finale près, fiches écartées
      // comprises : la personne doit confirmer avant de publier.
      const proche = cat.fiches.find((f) => (nomReduit(f.nom) && nomReduit(f.nom) === nomReduit(propres.nom)) || (lienReduit(f.lien) && lienReduit(f.lien) === lienReduit(propres.lien)));
      if (proche && !malgreRessemblance) return refus('ressemble', { nom: proche.nom || '' });
      if (!propres.etat) propres.etat = ETAT_ACTIF;
      const proprietes = proprietesDepuisValeurs(propres, { porteurIds: Object.hasOwn(propres, 'porteurs') ? idsDesPorteurs(cat, propres.porteurs) : undefined, ficheIds });
      proprietes[PROP.statutFiche] = { select: { name: STATUT_PUBLIEE } };
      const ficheId = await notion.creerFiche(proprietes);
      const version = await noterVersion({ ficheId, nom: propres.nom, source: 'creation', par, changements: calculerChangements(null, propres) });
      viderMemoire();
      return { ok: true, id: await repereApres(cat, ficheId), numero: version.ecrite ? version.numero : null, historique: !!version.ecrite };
    } catch (err) {
      journal('[ressources] création impossible :', err.message);
      return refus('notion');
    }
  }

  return { lister, lire, neuve, enregistrer, retablir, verifier, ecarter: changerStatut(STATUT_ECARTEE), republier: changerStatut(STATUT_PUBLIEE), creer };
}

module.exports = { creerRessources, repereValide, opaqueDe, indexReperes };
