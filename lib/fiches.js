/**
 * Passe des lignes lues dans Notion aux fiches publiques du site :
 * retire les fiches écartées et les champs internes, attribue une adresse
 * lisible à chaque fiche, résout les porteurs, le lieu et les liens.
 */

const STATUT_ECARTEE = 'Écartée';

// Notion refuse les virgules dans une option : le libellé public est rétabli ici.
const LIBELLES_TYPE = {
  'Jeu de données ou cohorte ou biobanque': 'Jeu de données, cohorte ou biobanque',
};

// Ordre d'affichage des liens entre fiches.
const NATURES = [
  ['faitPartieDe', 'fait partie de'],
  ['reposeSur', 'repose sur'],
  ['donneAccesA', 'donne accès à'],
  ['remplace', 'remplace'],
];

function nomLisible(texte) {
  return String(texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function libelleType(type) {
  return type ? (LIBELLES_TYPE[type] || type) : null;
}

// Attribue une adresse unique à chaque fiche. L'ordre de traitement est fixé
// (nom, puis identifiant) pour que l'adresse ne dépende pas de l'ordre de lecture.
function attribuerAdresses(fiches, porteursParId) {
  const triees = [...fiches].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id));
  const parBase = new Map();
  for (const f of triees) {
    const base = nomLisible(f.nom) || 'ressource';
    if (!parBase.has(base)) parBase.set(base, []);
    parBase.get(base).push(f);
  }
  const prises = new Set();
  const adresses = new Map();
  const reserver = (souhaitee) => {
    let adresse = souhaitee;
    for (let n = 2; prises.has(adresse); n++) adresse = `${souhaitee}-${n}`;
    prises.add(adresse);
    return adresse;
  };
  // Les noms uniques passent d'abord : un homonyme ne peut pas leur prendre leur adresse.
  for (const [base, groupe] of parBase) {
    if (groupe.length === 1) adresses.set(groupe[0].id, reserver(base));
  }
  for (const [base, groupe] of parBase) {
    if (groupe.length === 1) continue;
    for (const f of groupe) {
      const premier = f.porteurIds.map((id) => porteursParId.get(id)).find(Boolean);
      const suffixe = premier ? nomLisible(premier.nom) : '';
      adresses.set(f.id, reserver(suffixe ? `${base}-${suffixe}` : base));
    }
  }
  return adresses;
}

function assembler(fichesBrutes, porteurs) {
  const porteursParId = new Map(porteurs.map((p) => [p.id, p]));
  const publiques = fichesBrutes.filter((f) => f.statutFiche !== STATUT_ECARTEE && f.nom);
  const adresses = attribuerAdresses(publiques, porteursParId);
  const parId = new Map(publiques.map((f) => [f.id, f]));
  const porteursUtiles = new Map();

  const ressources = publiques.map((f) => {
    const {
      id, statutFiche, porteurIds, faitPartieDe, reposeSur, donneAccesA, remplace, ...publics
    } = f;
    const sesPorteurs = porteurIds.map((pid) => porteursParId.get(pid)).filter(Boolean);
    for (const p of sesPorteurs) porteursUtiles.set(p.id, p);
    const place = sesPorteurs.find((p) => p.latitude !== null && p.longitude !== null);
    const liens = [];
    for (const [champ, nature] of NATURES) {
      for (const cibleId of f[champ]) {
        const cible = parId.get(cibleId);
        if (cible && cibleId !== id) liens.push({ nature, adresse: adresses.get(cibleId), nom: cible.nom });
      }
    }
    return {
      ...publics,
      adresse: adresses.get(id),
      typePrincipal: libelleType(f.typePrincipal),
      secondType: libelleType(f.secondType),
      porteurs: sesPorteurs.map((p) => ({ nom: p.nom, institutionBottin: !!p.institutionBottinId })),
      lieu: place ? { latitude: place.latitude, longitude: place.longitude, porteur: place.nom } : null,
      liens,
    };
  });

  ressources.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.adresse.localeCompare(b.adresse));
  const porteursPublics = [...porteursUtiles.values()]
    .map((p) => ({ nom: p.nom, latitude: p.latitude, longitude: p.longitude }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { ressources, porteurs: porteursPublics };
}

module.exports = { nomLisible, assembler, LIBELLES_TYPE };
