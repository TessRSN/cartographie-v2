/**
 * Carte des ressources, reprise du bottin : ronds mauves dont la taille suit le
 * nombre de ressources, grappes mauves, fenêtres en verre. Chaque ressource
 * visible est placée chez son porteur (r.lieu) quand surLaCarte(r) dit vrai ;
 * les autres forment le groupe « En ligne ou hors Québec » : un bouton en verre
 * posé sur la carte ouvre un panneau qui les liste (la carte garde ses ronds, la
 * liste du bas ne montre plus qu'elles).
 */
(function () {
'use strict';

const C = window.Cartographie;
const MAUVE = '#a855f7';
let carte = null;
let groupe = null;
let vueEnsemble = null;   // cadrage repris par le bouton « Recentrer »
let dessinEnAttente = false;
let derniereSignature = null;

function couche(cle) {
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

// La carte n'est créée qu'une fois les données arrivées : la clé du fond de carte vient avec elles.
function initialiser(etat) {
  const zone = document.getElementById('carte');
  zone.textContent = '';
  // La carte est en haut de page : la molette ne zoome qu'après un clic sur la
  // carte, pour ne pas bloquer le défilement ; le zoom est en bas à gauche.
  carte = L.map('carte', { zoomControl: false, scrollWheelZoom: false }).setView([47.0, -71.5], 6);
  L.control.zoom({ position: 'bottomleft' }).addTo(carte);
  carte.on('click', () => carte.scrollWheelZoom.enable());
  carte.on('mouseout', () => carte.scrollWheelZoom.disable());
  couche(etat.carte && etat.carte.cle).addTo(carte);
}

// Décalage stable de quelques dizaines de mètres, pour séparer deux porteurs logés à la même adresse.
function empreinte(texte) { let h = 0; for (let i = 0; i < texte.length; i++) { h = ((h << 5) - h) + texte.charCodeAt(i); h |= 0; } return h; }

// Contenu de la fenêtre d'un lieu : le porteur, le nombre de ressources, leur
// répartition par type, puis la liste ; chaque nom ouvre la fiche.
function htmlFenetre(porteur, ressources) {
  const e = echapper;
  const n = ressources.length;
  const parType = new Map();
  for (const r of ressources) { const cle = cleType(r.typePrincipal); parType.set(cle, (parType.get(cle) || 0) + 1); }
  const types = [...parType.entries()].sort((a, b) => b[1] - a[1])
    .map(([cle, nombre]) => `<span class="type-${cle} popup-type">${puceType(cle)}${nombre} ${e(TEXTES.typesCourts[cle])}</span>`).join(' · ');
  const liste = [...ressources].sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'))
    .map((r) => { const cle = cleType(r.typePrincipal); return `<li class="type-${cle}">${puceType(cle)}<span><a class="map-member-link" href="/ressource/${e(r.adresse)}" data-fiche="${e(r.adresse)}">${e(r.nom)}</a><small>${e(TEXTES.typesCourts[cle])}</small></span></li>`; }).join('');
  return `<div class="popup-inst-name">${e(porteur)}</div>`
    + `<div class="popup-count">${n} <span>${e(TEXTES.carte.ressources(n))}</span></div>`
    + `<div class="popup-type-row">${types}</div>`
    + `<ul class="popup-names">${liste}</ul>`
    + `<button type="button" class="popup-see" data-porteur="${e(porteur)}">${e(TEXTES.carte.voirFiches)}</button>`;
}

function majBoutons(etat, surCarte, horsCarte) {
  const pastille = document.getElementById('pastilleCarte');
  pastille.classList.remove('hidden');
  document.getElementById('compteCarte').textContent = TEXTES.carte.surLaCarte(surCarte);
  // Le bouton compte les fiches hors carte parmi celles que les autres filtres retiennent.
  const bouton = document.getElementById('boutonHorsCarte');
  const actif = etat.filtres.horsCarte;
  bouton.setAttribute('aria-pressed', actif ? 'true' : 'false');
  bouton.setAttribute('aria-expanded', actif ? 'true' : 'false');
  document.getElementById('texteHorsCarte').textContent = TEXTES.carte.horsCarte(horsCarte.length);
  bouton.classList.toggle('hidden', !actif && horsCarte.length === 0);
  majPanneau(actif, horsCarte);
}

// Panneau en verre : les ressources en ligne ou hors Québec, chacune ouvrant sa fiche.
function majPanneau(actif, horsCarte) {
  const e = echapper;
  const panneau = document.getElementById('panneauHorsCarte');
  panneau.classList.toggle('hidden', !actif);
  document.getElementById('vueHaut').classList.toggle('avec-panneau', actif);
  if (!actif) return;
  document.getElementById('comptePanneau').textContent = `(${horsCarte.length})`;
  document.getElementById('listeHorsCarte').innerHTML = horsCarte.map((r) => {
    const cle = cleType(r.typePrincipal);
    const porteur = ((r.porteurs || [])[0] || {}).nom;
    const detail = [porteur, r.typePrincipal ? TEXTES.typesCourts[cle] || r.typePrincipal : ''].filter(Boolean).map(e).join(' · ');
    return `<li><a class="type-${cle}" href="/ressource/${e(r.adresse)}" data-fiche="${e(r.adresse)}">${puceType(cle)}<span><strong>${e(r.nom)}</strong>${detail ? `<small>${detail}</small>` : ''}</span></a></li>`;
  }).join('');
}

function dessiner(etat, motif) {
  const zone = document.getElementById('zoneCarte');
  zone.classList.toggle('hidden', etat.vue !== 'carte');
  if (motif === 'theme') return;
  // Carte cachée (vue Connexions) : elle sera redessinée à son retour, à sa vraie taille.
  if (etat.vue !== 'carte') { dessinEnAttente = true; return; }
  if (typeof L === 'undefined' || !L.markerClusterGroup) {
    const message = document.createElement('p');
    message.className = 'carte-message'; message.textContent = TEXTES.carte.indisponible;
    document.getElementById('carte').replaceChildren(message);
    return;
  }
  if (!carte) initialiser(etat);
  if (motif === 'vue') {
    carte.invalidateSize();
    if (!dessinEnAttente) return;
  }
  dessinEnAttente = false;

  const lieux = new Map();
  let surCarte = 0;
  const horsCarte = [];
  // etat.pourCarte : les fiches retenues, sans tenir compte du filtre « En ligne ou hors Québec ».
  for (const r of etat.pourCarte) {
    if (!surLaCarte(r)) { horsCarte.push(r); continue; }
    surCarte++;
    const porteur = r.lieu.porteur || ((r.porteurs || [])[0] || {}).nom || r.nom;
    const cle = `${porteur}|${r.lieu.latitude},${r.lieu.longitude}`;
    if (!lieux.has(cle)) lieux.set(cle, { porteur, lieu: r.lieu, ressources: [] });
    lieux.get(cle).ressources.push(r);
  }
  // Mêmes ronds qu'au dessin précédent (on a seulement ouvert ou fermé le panneau
  // « En ligne ou hors Québec ») : la carte reste telle quelle, zoom compris.
  const signature = [...lieux.values()].map((l) => `${l.porteur}:${l.ressources.map((r) => r.adresse).join(',')}`).join('|');
  if (groupe && signature === derniereSignature) { majBoutons(etat, surCarte, horsCarte); return; }
  derniereSignature = signature;

  if (groupe) carte.removeLayer(groupe);
  groupe = L.markerClusterGroup({
    maxClusterRadius: 45,
    iconCreateFunction(grappe) {
      // La grappe affiche le nombre de ressources, pas le nombre de lieux.
      const n = grappe.getAllChildMarkers().reduce((s, m) => s + (m.options.nombre || 1), 0);
      const taille = n < 10 ? 36 : n < 30 ? 44 : n < 80 ? 52 : 60;
      return L.divIcon({ html: `<div style="width:${taille - 8}px;height:${taille - 8}px;">${n}</div>`, className: 'marker-cluster-custom', iconSize: L.point(taille, taille) });
    },
  });

  for (const { porteur, lieu, ressources } of lieux.values()) {
    const n = ressources.length;
    const h = empreinte(porteur);
    const latitude = lieu.latitude + ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.004;
    const longitude = lieu.longitude + (((Math.abs(h) >> 10) % 1000) / 1000 - 0.5) * 0.004;
    // Ronds mauves translucides du bottin ; le rayon suit le nombre de ressources du lieu.
    const marqueur = L.circleMarker([latitude, longitude], {
      nombre: n,
      radius: Math.min(7 + Math.sqrt(n) * 2.5, 22),
      fillColor: MAUVE, color: MAUVE, weight: 1, opacity: 0.7, fillOpacity: 0.4,
    });
    marqueur.bindPopup(htmlFenetre(porteur, ressources), { maxWidth: 300 });
    // Leaflet insère ce texte comme du HTML : il est échappé.
    marqueur.bindTooltip(`${echapper(porteur)} (${n})`, { direction: 'top' });
    groupe.addLayer(marqueur);
  }
  carte.addLayer(groupe);
  majBoutons(etat, surCarte, horsCarte);

  if (groupe.getLayers().length > 0) {
    vueEnsemble = groupe.getBounds().pad(0.1);
    setTimeout(() => { carte.invalidateSize(); carte.fitBounds(vueEnsemble, { maxZoom: 12 }); }, 150);
  }
}

document.getElementById('boutonHorsCarte').addEventListener('click', () => {
  const ouvrir = !C.etat.filtres.horsCarte;
  C.definirFiltre('horsCarte', ouvrir);
  if (ouvrir) document.getElementById('fermerHorsCarte').focus();
});
// Fermer le panneau retire le filtre : la liste du bas retrouve toutes les ressources.
document.getElementById('fermerHorsCarte').addEventListener('click', () => {
  C.definirFiltre('horsCarte', false);
  document.getElementById('boutonHorsCarte').focus();
});
// Bouton « Recentrer » de la carte : retour à la vue d'ensemble des ronds affichés.
document.querySelector('#zoneCarte .js-recentrer').addEventListener('click', () => {
  if (!carte || !vueEnsemble) return;
  carte.closePopup();
  carte.fitBounds(vueEnsemble, { maxZoom: 12 });
});
C.surChangement(dessiner);
// La carte calcule sa taille à l'affichage : la recalculer si la fenêtre change.
window.addEventListener('resize', () => { if (carte && C.etat.vue === 'carte') carte.invalidateSize(); });
})();
