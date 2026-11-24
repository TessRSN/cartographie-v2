/**
 * Carte des ressources : chaque ressource visible est placée chez son premier
 * porteur qui a des coordonnées. Les ressources sans lieu, ou placées hors du
 * Québec, forment le groupe « En ligne ou hors Québec ».
 */
(function () {
'use strict';

let carte = null;
let groupe = null;

function fond(cle) {
  // CARTO Voyager avec clé, sinon OpenStreetMap (les tuiles CARTO sans clé portent un filigrane).
  if (cle) {
    return L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(cle), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 19,
    });
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
  });
}

function initialiser(etat) {
  carte = L.map('carte', { zoomControl: false, scrollWheelZoom: false }).setView([47.0, -71.5], 6);
  L.control.zoom({ position: 'bottomleft' }).addTo(carte);
  carte.on('click', () => carte.scrollWheelZoom.enable());
  carte.on('mouseout', () => carte.scrollWheelZoom.disable());
  fond(etat.carte && etat.carte.cle).addTo(carte);
}

function dessiner(etat) {
  if (typeof L === 'undefined' || !L.markerClusterGroup) return;
  if (!carte) initialiser(etat);
  if (groupe) carte.removeLayer(groupe);
  groupe = L.markerClusterGroup({
    maxClusterRadius: 45,
    iconCreateFunction(grappe) {
      const n = grappe.getAllChildMarkers().reduce((s, m) => s + (m.options.nombre || 1), 0);
      const taille = n < 10 ? 36 : n < 30 ? 44 : 52;
      return L.divIcon({ html: `<div style="width:${taille - 8}px;height:${taille - 8}px;">${n}</div>`, className: 'marker-cluster-custom', iconSize: L.point(taille, taille) });
    },
  });

  const lieux = new Map();
  let horsCarte = 0;
  for (const r of etat.visibles) {
    if (!surLaCarte(r)) { horsCarte++; continue; }
    const cle = `${r.lieu.latitude},${r.lieu.longitude}`;
    if (!lieux.has(cle)) lieux.set(cle, { lieu: r.lieu, ressources: [] });
    lieux.get(cle).ressources.push(r);
  }
  for (const { lieu, ressources } of lieux.values()) {
    const n = ressources.length;
    const taille = n < 10 ? 28 : 34;
    const marqueur = L.marker([lieu.latitude, lieu.longitude], {
      nombre: n, title: lieu.porteur,
      icon: L.divIcon({ html: String(n), className: 'marqueur', iconSize: L.point(taille, taille) }),
    });
    const liste = ressources.map((r) => `<li><a href="/ressource/${echapper(r.adresse)}" data-fiche="${echapper(r.adresse)}">${echapper(r.nom)}</a></li>`).join('');
    marqueur.bindPopup(`<div class="infobulle"><h4>${echapper(lieu.porteur)}</h4><ul>${liste}</ul></div>`, { maxWidth: 280 });
    groupe.addLayer(marqueur);
  }
  carte.addLayer(groupe);

  // Le bouton compte les fiches hors carte parmi celles que les autres filtres retiennent.
  const bouton = document.getElementById('boutonHorsCarte');
  const actif = etat.filtres.horsCarte;
  bouton.setAttribute('aria-pressed', actif ? 'true' : 'false');
  bouton.textContent = actif ? TEXTES.carte.horsCarteActif : TEXTES.carte.horsCarte(horsCarte);
  bouton.hidden = !actif && horsCarte === 0;
}

document.getElementById('boutonHorsCarte').addEventListener('click', () => {
  const C = window.Cartographie;
  C.definirFiltre('horsCarte', !C.etat.filtres.horsCarte);
});
window.Cartographie.surChangement(dessiner);
// La carte calcule sa taille à l'affichage : la recalculer si la fenêtre change.
window.addEventListener('resize', () => { if (carte) carte.invalidateSize(); });
})();
