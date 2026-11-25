/**
 * Les porteurs vus et tenus depuis le panneau : la liste, le volet d'un porteur, ajouter,
 * modifier (nom, adresse, place sur la carte), retrouver une adresse, et fusionner un doublon
 * dans un autre porteur.
 * Un porteur est désigné par un repère opaque et stable, calculé à partir de son identifiant :
 * rien de ce qui sort d'ici ne porte un identifiant Notion.
 * Renommer un porteur ne réécrit aucune fiche : elles y sont rattachées par relation.
 */
const { PROP } = require('./notion');
const { opaqueDe, indexReperes } = require('./ressources');
const { verrousEnMemoire } = require('./approbation');
const { parFiche } = require('./masse');
const { LIBELLES_TYPE } = require('./fiches');

const STATUT_ECARTEE = 'Écartée';
const NOM_MAX = 200;
const ADRESSE_MAX = 300;
const ESSAIS_VERROU = 8;
const PAUSE_VERROU_MS = 250;
// La lecture du nom de l'institution liée ne doit pas ralentir le volet.
const ATTENTE_BOTTIN_MS = 2500;
const FORME_REPERE = /^~[0-9a-f]{24}$/;
const MESSAGES = {
  nom: 'Un porteur doit avoir un nom.',
  nomLong: `Le nom ne peut pas dépasser ${NOM_MAX} caractères.`,
  pris: (nom) => `Un porteur porte déjà ce nom : « ${nom} ».`,
  adresse: `L'adresse ne peut pas dépasser ${ADRESSE_MAX} caractères.`,
  coordonnees: 'Les coordonnées vont par deux : une latitude entre -90 et 90, une longitude entre -180 et 180.',
  adresseVide: "Entrez d'abord une adresse.",
  soiMeme: 'Un porteur ne se fusionne pas dans lui-même.',
};

const reperePorteurValide = (repere) => typeof repere === 'string' && FORME_REPERE.test(repere);
const nomReduit = (nom) => (typeof nom === 'string' ? nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : '');
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const place = (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number';
const parNom = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr') || String(a.id).localeCompare(String(b.id));

// Les valeurs saisies pour un porteur, nettoyées. Seules les clés données sont rendues.
function nettoyerPorteur(brut, { nomRequis = false } = {}) {
  const saisie = objet(brut); const valeurs = {}; const erreurs = {};
  if (nomRequis || Object.hasOwn(saisie, 'nom')) {
    const nom = typeof saisie.nom === 'string' ? saisie.nom.replace(/\s+/g, ' ').trim() : '';
    if (!nom) erreurs.nom = MESSAGES.nom;
    else if (nom.length > NOM_MAX) erreurs.nom = MESSAGES.nomLong;
    else valeurs.nom = nom;
  }
  if (Object.hasOwn(saisie, 'adresse')) {
    const adresse = typeof saisie.adresse === 'string' ? saisie.adresse.replace(/\s+/g, ' ').trim() : '';
    if (adresse.length > ADRESSE_MAX) erreurs.adresse = MESSAGES.adresse;
    else valeurs.adresse = adresse;
  }
  if (Object.hasOwn(saisie, 'latitude') || Object.hasOwn(saisie, 'longitude')) {
    const { latitude = null, longitude = null } = saisie;
    const nombre = (v, borne) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= borne;
    if (latitude === null && longitude === null) Object.assign(valeurs, { latitude: null, longitude: null });
    else if (nombre(latitude, 90) && nombre(longitude, 180)) Object.assign(valeurs, { latitude, longitude });
    else erreurs.coordonnees = MESSAGES.coordonnees;
  }
  return { valeurs, erreurs };
}

function creerPorteurs({
  notion, versions, propositions, geocoder, verrous = verrousEnMemoire(), viderMemoire = () => {}, secret = '',
  maintenant = Date.now, journal = console.error, attendre = () => new Promise((suite) => setTimeout(suite, PAUSE_VERROU_MS)), budgetMs,
}) {
  const repereDe = opaqueDe('porteur', secret);
  const refus = (code, extra = {}) => ({ ok: false, code, ...extra });
  const cleVerrou = (id) => `porteur:${id}`;
  const trouver = (porteurs, repere) => (reperePorteurValide(repere) ? porteurs.find((p) => repereDe(p.id) === repere) || null : null);
  const fichesDe = (fiches, id) => fiches.filter((f) => (f.porteurIds || []).includes(id));
  const ecartee = (f) => f.statutFiche === STATUT_ECARTEE;
  const dejaPris = (porteurs, nom, saufId) => porteurs.find((p) => p.id !== saufId && nomReduit(p.nom) === nomReduit(nom));

  async function catalogue() {
    const [fiches, porteurs] = await Promise.all([notion.lireRessources(), notion.lirePorteurs()]);
    return { fiches, porteurs };
  }
  async function prendre(cle) {
    for (let essai = 1; essai <= ESSAIS_VERROU; essai++) {
      if (await verrous.prendreVerrou(cle)) return true;
      if (essai < ESSAIS_VERROU) await attendre();
    }
    return false;
  }

  // ─── Lecture ───
  // Le lien avec le bottin n'est ici qu'un oui ou un non : aucune lecture de plus par porteur.
  async function lister() {
    const { fiches, porteurs } = await catalogue();
    return {
      porteurs: porteurs.map((p) => {
        const siennes = fichesDe(fiches, p.id);
        const ecartees = siennes.filter(ecartee).length;
        return {
          id: repereDe(p.id), nom: p.nom || '', adresse: p.adresse || '', latitude: p.latitude, longitude: p.longitude, place: place(p),
          ressources: siennes.length - ecartees, ecartees, bottin: !!p.institutionBottinId,
        };
      }).sort(parNom),
    };
  }

  // Le nom de l'institution du bottin liée, s'il se lit sans erreur et sans attendre ; sinon null.
  async function nomInstitution(id) {
    let minuterie;
    const limite = new Promise((suite) => { minuterie = setTimeout(() => suite(null), ATTENTE_BOTTIN_MS); });
    try {
      const nom = await Promise.race([notion.lireTitrePage(id).catch(() => null), limite]);
      return typeof nom === 'string' && nom.trim() ? nom.trim().slice(0, 300) : null;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(minuterie);
    }
  }

  // Un porteur, ses ressources (publiées et écartées) et les autres porteurs ; null si le repère ne désigne rien.
  async function lire(repere) {
    const { fiches, porteurs } = await catalogue();
    const p = trouver(porteurs, repere);
    if (!p) return null;
    const index = indexReperes(fiches, porteurs, secret);
    return {
      porteur: {
        id: repereDe(p.id), nom: p.nom || '', adresse: p.adresse || '', latitude: p.latitude, longitude: p.longitude, place: place(p),
        // Montré seulement, jamais modifié ici. Sans nom lisible : « Lié à une institution du bottin ».
        bottin: p.institutionBottinId ? { nom: await nomInstitution(p.institutionBottinId) } : null,
      },
      ressources: fichesDe(fiches, p.id).sort((a, b) => Number(ecartee(a)) - Number(ecartee(b)) || parNom(a, b)).map((f) => ({
        id: index.repereDe(f.id), nom: f.nom || '', typePrincipal: f.typePrincipal ? (LIBELLES_TYPE[f.typePrincipal] || f.typePrincipal) : null, statut: ecartee(f) ? 'ecartee' : 'publiee',
      })),
      autres: porteurs.filter((x) => x.id !== p.id && x.nom).sort(parNom).map((x) => ({ id: repereDe(x.id), nom: x.nom })),
    };
  }

  // ─── Écriture ───
  async function creer({ valeurs, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    const { valeurs: propres, erreurs } = nettoyerPorteur(valeurs, { nomRequis: true });
    if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
    try {
      const pris = dejaPris(await notion.lirePorteurs(), propres.nom, null);
      if (pris) return refus('doublon', { erreurs: { nom: MESSAGES.pris(pris.nom) } });
      const id = await notion.creerPorteur({ nom: propres.nom, adresse: propres.adresse || '', latitude: propres.latitude, longitude: propres.longitude });
      viderMemoire();
      return { ok: true, id: repereDe(id) };
    } catch (err) {
      journal('[porteurs] création impossible :', err.message);
      return refus('notion');
    }
  }

  // Seul ce qui diffère du porteur d'aujourd'hui est écrit. Aucune fiche n'est touchée.
  async function enregistrer({ repere, valeurs, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    const { valeurs: propres, erreurs } = nettoyerPorteur(valeurs);
    if (Object.keys(erreurs).length) return refus('invalide', { erreurs });
    let porteurs;
    try { porteurs = await notion.lirePorteurs(); } catch (err) { journal('[porteurs] lecture de Notion impossible :', err.message); return refus('notion'); }
    const designe = trouver(porteurs, repere);
    if (!designe) return refus('introuvable');
    if (Object.hasOwn(propres, 'nom')) {
      const pris = dejaPris(porteurs, propres.nom, designe.id);
      if (pris) return refus('doublon', { erreurs: { nom: MESSAGES.pris(pris.nom) } });
    }
    const cle = cleVerrou(designe.id);
    if (!(await prendre(cle))) return refus('occupee');
    try {
      const actuel = await notion.lirePorteur(designe.id);
      if (!actuel) return refus('introuvable');
      const pareil = (c) => (c === 'adresse' ? (actuel.adresse || '') === propres.adresse : actuel[c] === propres[c]);
      const aEcrire = Object.fromEntries(Object.entries(propres).filter(([c]) => !pareil(c)));
      // Les coordonnées s'écrivent toujours ensemble.
      if (Object.hasOwn(aEcrire, 'latitude') || Object.hasOwn(aEcrire, 'longitude')) Object.assign(aEcrire, { latitude: propres.latitude, longitude: propres.longitude });
      if (!Object.keys(aEcrire).length) return { ok: true, id: repere, inchange: true };
      await notion.mettreAJourPorteur(designe.id, aEcrire);
      viderMemoire();
      return { ok: true, id: repere };
    } catch (err) {
      journal('[porteurs] enregistrement impossible :', err.message);
      return refus('notion');
    } finally {
      await verrous.rendreVerrou(cle);
    }
  }

  // « Retrouver l'adresse sur la carte » : rien n'est écrit, la personne enregistre ensuite.
  async function retrouver({ adresse, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    const texte = typeof adresse === 'string' ? adresse.replace(/\s+/g, ' ').trim().slice(0, ADRESSE_MAX) : '';
    if (!texte) return refus('invalide', { erreurs: { adresse: MESSAGES.adresseVide } });
    try {
      const lieu = await geocoder(texte);
      if (!lieu || typeof lieu.latitude !== 'number' || typeof lieu.longitude !== 'number') return refus('adresse-introuvable');
      return { ok: true, latitude: lieu.latitude, longitude: lieu.longitude };
    } catch (err) {
      journal('[porteurs] géocodage impossible :', err.message);
      return refus('notion');
    }
  }

  // Fusionne un doublon dans le porteur gardé : chaque fiche du doublon, publiée ou écartée,
  // est rattachée au porteur gardé, avec une version. Le doublon n'est mis à la corbeille de
  // Notion que si plus aucune fiche ne lui est rattachée, d'après une relecture de toutes les fiches.
  async function fusionner({ doublon, garde, par }) {
    if (!(await propositions.peutDecider(par))) return refus('non-approbateur');
    let cat;
    try { cat = await catalogue(); } catch (err) { journal('[porteurs] lecture de Notion impossible :', err.message); return refus('notion'); }
    const de = trouver(cat.porteurs, doublon); const vers = trouver(cat.porteurs, garde);
    if (!de || !vers) return refus('introuvable');
    if (de.id === vers.id) return refus('invalide', { erreurs: { _: MESSAGES.soiMeme } });
    const ids = fichesDe(cat.fiches, de.id).sort(parNom).map((f) => f.id);
    // Une seule fusion à la fois sur ces deux porteurs.
    const cles = [cleVerrou(de.id), cleVerrou(vers.id)].sort();
    const prises = [];
    let faites = 0; let archive = false;
    try {
      for (const cle of cles) {
        if (!(await verrous.prendreVerrou(cle))) return refus('occupee', { faites: 0, restantes: ids.length });
        prises.push(cle);
      }
      const nomDe = new Map(cat.porteurs.map((p) => [p.id, p.nom]));
      const noms = (liste) => liste.map((id) => nomDe.get(id)).filter(Boolean);
      const retour = await parFiche({
        ids, notion, versions, verrous, par, maintenant, journal, attendre, budgetMs,
        note: `Fusion du porteur « ${de.nom} » dans « ${vers.nom} »`,
        changer(fiche) {
          const avant = fiche.porteurIds || [];
          if (!avant.includes(de.id)) return null;
          const apres = [...new Set(avant.map((id) => (id === de.id ? vers.id : id)))];
          return { proprietes: { [PROP.porteurs]: { relation: apres.map((id) => ({ id })) } }, changements: { porteurs: { avant: noms(avant), apres: noms(apres) } } };
        },
      });
      faites = retour.faites;
      if (!retour.ok) return retour;
      // Relecture de toutes les fiches : une fiche rattachée entre-temps garde le doublon en vie.
      const restantes = fichesDe(await notion.lireRessources(), de.id).length;
      if (restantes) return refus('interrompue', { faites, restantes });
      await notion.archiverPorteur(de.id);
      archive = true;
      return { ok: true, faites, historique: retour.historique, archive: true };
    } catch (err) {
      journal('[porteurs] fusion impossible :', err.message);
      return refus('interrompue', { faites, restantes: Math.max(0, ids.length - faites) });
    } finally {
      // Ce qui est fait paraît sur le site, même si le geste s'est arrêté en route.
      if (faites || archive) viderMemoire();
      for (const cle of prises) await verrous.rendreVerrou(cle);
    }
  }

  return { lister, lire, creer, enregistrer, geocoder: retrouver, fusionner };
}

module.exports = { creerPorteurs, reperePorteurValide, nettoyerPorteur };
