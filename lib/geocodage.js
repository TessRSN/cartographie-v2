/**
 * Coordonnées d'une adresse, par Nominatim (OpenStreetMap). Service gratuit, sans clé :
 * une requête par seconde au plus, et un agent qui identifie le site.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AGENT = 'RSN-Cartographie/2.0 (https://cartographie.rsn.quebec, contact: rsn.gestion@rimuhc.ca)';

// Renvoie { latitude, longitude }, ou null si rien ne correspond. Lève si le service ne répond pas.
async function geocoder(adresse, { requete = fetch } = {}) {
  const q = String(adresse || '').trim();
  if (!q) return null;
  const parametres = new URLSearchParams({ q, format: 'json', limit: '1', addressdetails: '0' });
  const reponse = await requete(`${NOMINATIM}?${parametres}`, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } });
  if (!reponse.ok) throw new Error(`Nominatim a répondu ${reponse.status}`);
  const resultats = await reponse.json();
  if (!Array.isArray(resultats) || !resultats.length) return null;
  const latitude = parseFloat(resultats[0].lat);
  const longitude = parseFloat(resultats[0].lon);
  return Number.isNaN(latitude) || Number.isNaN(longitude) ? null : { latitude, longitude };
}

module.exports = { geocoder };
