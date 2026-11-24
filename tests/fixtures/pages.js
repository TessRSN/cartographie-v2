// Pages au format de l'API Notion (version 2022-06-28), réduites aux propriétés lues.
const txt = (...segments) => segments.map((s) => ({ type: 'text', plain_text: s, text: { content: s } }));
const rt = (...s) => ({ type: 'rich_text', rich_text: txt(...s) });
const sel = (n) => ({ type: 'select', select: n ? { name: n } : null });
const ms = (...n) => ({ type: 'multi_select', multi_select: n.map((name) => ({ name })) });
const url = (u) => ({ type: 'url', url: u || null });
const rel = (...ids) => ({ type: 'relation', relation: ids.map((id) => ({ id })) });
const coche = (b) => ({ type: 'checkbox', checkbox: !!b });

function pageRessource(id, nom, props = {}) {
  const segments = Array.isArray(nom) ? nom : [nom];
  return {
    object: 'page',
    id,
    properties: {
      'Nom': { type: 'title', title: txt(...segments) },
      'Sigle et autres noms': rt(),
      'Type principal': sel(null),
      'Second type': sel(null),
      'En une phrase': rt(),
      'Description': rt(),
      'Mots-clés': ms(),
      'Lien principal': url(null),
      'Autres liens': rt(),
      'État': sel(null),
      'Vérifiée le': { type: 'date', date: null },
      'Vérifiée par': sel(null),
      'Langues': ms(),
      "Mode d'accès": ms(),
      'Comment y accéder': url(null),
      'Frais': sel(null),
      'Environnement sécurisé': coche(false),
      'Réservé à': rt(),
      'Responsable': rt(),
      'Profil du responsable': url(null),
      'Contact': { type: 'email', email: null },
      'Porté par': rel(),
      'Portée': sel(null),
      'Financé par': ms(),
      'Population': rt(),
      'Période couverte': rt(),
      'Types de données': ms(),
      'Collecte': sel(null),
      'Jumelage possible': coche(false),
      'Dictionnaire ou catalogue détaillé': url(null),
      'Dépôt de code': url(null),
      'Licence': rt(),
      'Statut de la fiche': sel('Brouillon'),
      'Fait partie de': rel(),
      'Repose sur': rel(),
      'Donne accès à': rel(),
      'Remplace': rel(),
      // Champs internes : présents dans Notion, jamais lus par le site.
      'Notes de veille': rt('note interne'),
      'Remarque de recherche': rt('remarque interne'),
      'Référence de veille': rt('A1'),
      ...props,
    },
  };
}

function pagePorteur(id, nom, { latitude = null, longitude = null, adresse = '', siteWeb = null, institution = null } = {}) {
  return {
    object: 'page',
    id,
    properties: {
      'Nom': { type: 'title', title: txt(nom) },
      'Adresse': rt(...(adresse ? [adresse] : [])),
      'Latitude': { type: 'number', number: latitude },
      'Longitude': { type: 'number', number: longitude },
      'Site web': url(siteWeb),
      'Institution du bottin': rel(...(institution ? [institution] : [])),
    },
  };
}

const ressourceComplete = pageRessource('r-1', ['CARTa', 'GENE'], {
  'Sigle et autres noms': rt('CaG'),
  'Type principal': sel('Jeu de données ou cohorte ou biobanque'),
  'Second type': sel('Catalogue ou entrepôt de données'),
  'En une phrase': rt('Cohorte populationnelle du Québec.'),
  'Description': rt('Une cohorte. ', 'Deux phrases.'),
  'Mots-clés': ms('génomique', 'épidémiologie'),
  'Lien principal': url('https://www.cartagene.qc.ca/'),
  'État': sel('Actif'),
  'Vérifiée le': { type: 'date', date: { start: '2026-11-24' } },
  "Mode d'accès": ms('Sur demande évaluée'),
  'Comment y accéder': url('https://portail.cartagene.qc.ca/data-access-process'),
  'Frais': sel('Oui'),
  'Environnement sécurisé': coche(true),
  'Contact': { type: 'email', email: 'acces@exemple.org' },
  'Porté par': rel('p-1'),
  'Financé par': ms('Génome Québec'),
  'Donne accès à': rel('r-2'),
});

const ressourceMinimale = pageRessource('r-2', 'Ressource minimale');

const porteurAvecLieu = pagePorteur('p-1', 'CHU Sainte-Justine', {
  latitude: 45.503, longitude: -73.624, adresse: '3175, chemin de la Côte-Sainte-Catherine, Montréal', institution: 'i-1',
});
const porteurSansLieu = pagePorteur('p-2', 'Consortium sans adresse');

module.exports = { pageRessource, pagePorteur, ressourceComplete, ressourceMinimale, porteurAvecLieu, porteurSansLieu, rt, sel, ms, url, rel, coche };
