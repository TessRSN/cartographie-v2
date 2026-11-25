/**
 * Une fausse base « Approbateurs » pour les essais : des lignes posées dans le faux Notion, dans
 * la forme où Notion les garde.
 */
const BASE = 'base-approbateurs';

// Pose une ligne dans la base ; renvoie l'identifiant de la page.
function inscrire(faux, { id, nom = '', courriel, role = 'Approbation', actif = true, sansResume = false }) {
  const properties = {
    Nom: { title: nom ? [{ type: 'text', text: { content: nom } }] : [] },
    Courriel: { email: courriel },
    Actif: { checkbox: actif },
    'Sans résumé hebdomadaire': { checkbox: sansResume },
  };
  if (role) properties['Rôle'] = { select: { name: role } };
  faux.pages.set(id, { id, parent: { database_id: BASE }, properties });
  return id;
}
// Les lignes de la base telles qu'elles sont maintenant, en clair.
function lignes(faux) {
  return [...faux.pages.values()].filter((p) => p.parent.database_id === BASE).map((p) => ({
    id: p.id,
    nom: (p.properties.Nom.title || []).map((s) => s.text.content).join(''),
    courriel: p.properties.Courriel.email,
    role: p.properties['Rôle'] && p.properties['Rôle'].select ? p.properties['Rôle'].select.name : null,
    actif: !!p.properties.Actif.checkbox,
    sansResume: !!(p.properties['Sans résumé hebdomadaire'] || {}).checkbox,
  }));
}

module.exports = { inscrire, lignes, BASE };
