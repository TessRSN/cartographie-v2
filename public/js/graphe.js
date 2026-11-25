/**
 * Graphe des connexions, repris du bottin : mêmes options vis-network, même
 * physique (placement calculé hors écran, puis régime « calme » où le graphe
 * respire lentement), même rendu des nœuds et des traits, curseur de densité,
 * case « masquer les isolés », compteur et fenêtre d'explication.
 * Comme les photos du bottin, le logo d'une ressource est dessiné dans son rond
 * (forme circularImage), avec un contour épais de la couleur du type ; sans
 * logo, ou si l'image échoue, le rond est plein, de la couleur du type.
 * Le calcul des liens reste celui de connexions.js (calculerConnexions).
 * Les filtres masquent les ressources écartées ; la recherche estompe les
 * autres et centre le meilleur résultat.
 */
(function () {
'use strict';

const C = window.Cartographie;
const $ = (id) => document.getElementById(id);

// Deux régimes de physique (valeurs du bottin) :
//  - RAPIDE : pendant les calculs hors écran (stabilisation) ;
//  - CALME : à l'écran, vitesse plafonnée très bas, pour que le graphe respire
//    lentement sans jamais courir. Le pas de temps adaptatif est coupé : sinon
//    la bibliothèque accélère d'elle-même et le plafond ne tient plus.
const PHYSIQUE_RAPIDE = { enabled: true, maxVelocity: 50, minVelocity: 0.75, timestep: 0.25, adaptiveTimestep: true };
const PHYSIQUE_CALME = { enabled: true, maxVelocity: 0.8, minVelocity: 0.05, timestep: 0.15, adaptiveTimestep: false };
// Le plafond est en unités du graphe ; à l'écran, le zoom le multiplie. Il est
// recalculé à chaque zoom pour garder environ 6 px/s (4 dans le bottin).
const CALME_PX_PAR_S = 6;
// La vue de départ cadre les ressources reliées, puis rapproche (1,8 dans le bottin).
const ZOOM_DEPART = 2.0;
// Forces du placement. Par rapport au bottin : ressorts plus longs (150 → 190) et
// répulsion plus forte (-40 → -60), pour écarter les ronds, plus gros avec leur logo.
const FORCES = { gravitationalConstant: -60, centralGravity: 0.01, springLength: 190, springConstant: 0.05, damping: 0.95, avoidOverlap: 0.8 };
// Respiration : avec 140 ressources, le placement atteint l'équilibre et vis-network
// arrête alors la simulation (le bottin, plus gros, ne s'arrête jamais tout à fait).
// Pour que le graphe bouge dès l'arrivée et sans arrêt, la longueur des ressorts et
// la répulsion oscillent lentement autour de leur valeur : l'équilibre se déplace
// en continu et les points le suivent à la vitesse plafonnée du régime calme.
// Les forces sont modifiées en place, par petits pas rapprochés, sans rappeler
// setOptions : le rappeler toutes les secondes arrêtait puis relançait la
// simulation et rechargeait le rendu, d'où un clignotement.
const RESPIRATION = { intervalle: 120, pas: 0.03, ressort: 0.10, repulsion: 0.15 };
const GRIS = '#718096';

let reseau = null;
let g = null;              // { noeudsDS, liensDS, noeuds, liens, degre, source }
let calme = false;         // vrai en régime calme (pas pendant un calcul hors écran)
let minuterieZoom = null;
let derniereCle;           // signature filtres + recherche du dernier cadrage
let aCentrer = null;       // adresse à centrer dès que le graphe est posé
let affichageEnCours = false;
let mode = 'ressources';   // 'ressources' : traits entre ressources ; 'sujets' : chaque ressource reliée à ses sujets
let minuterieRespiration = null;
let phase = 0;
const pixels = new Map();  // images d'un pixel, une par couleur

// ─── Couleurs : lues dans la feuille de styles (--type-*), seule source ───
function couleurType(cle) {
  const valeur = getComputedStyle(document.documentElement).getPropertyValue(`--type-${cle}`).trim();
  return /^#[0-9a-f]{6}$/i.test(valeur) ? valeur : GRIS;
}
// ─── Icône du type, en pastille au coin de chaque point ───
// Le logo d'une ressource cache la couleur de son type : la pastille la redonne, avec une forme en plus.
const tracesIcones = new Map();   // tracés prêts à dessiner, par type
let couleursIcones = new Map();   // couleurs lues dans la feuille de styles, par type ; vidées à chaque construction du graphe
function tracesDe(cle) {
  if (!tracesIcones.has(cle)) tracesIcones.set(cle, (TRACES_ICONES[cle] || TRACES_ICONES.autre).map((d) => new Path2D(d)));
  return tracesIcones.get(cle);
}
function couleursDe(cle) {
  if (!couleursIcones.has(cle)) {
    const styles = getComputedStyle(document.documentElement);
    const sur = styles.getPropertyValue(`--type-${cle}-sur`).trim();
    couleursIcones.set(cle, { fond: couleurType(cle), sur: sur || '#ffffff', bord: styles.getPropertyValue('--rsn-card-bg').trim() || '#ffffff' });
  }
  return couleursIcones.get(cle);
}
function dessinerIcones(ctx) {
  if (!reseau || !g || !g.noeudsDS) return;
  const positions = reseau.getPositions();
  g.noeudsDS.forEach((n) => {
    const p = positions[n.id];
    if (n.hidden || !p || !n.cleType) return;
    const rayon = Number(n.size) || 12;
    const r = Math.max(7, rayon * 0.56);
    const cx = p.x + rayon * 0.74, cy = p.y + rayon * 0.74;
    const c = couleursDe(n.cleType);
    ctx.save();
    // Un point estompé (recherche, ressource choisie) garde une pastille estompée.
    ctx.globalAlpha = typeof n.opacity === 'number' ? n.opacity : 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = c.fond; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = c.bord; ctx.stroke();
    const echelle = (r * 1.25) / 24;
    ctx.translate(cx - 12 * echelle, cy - 12 * echelle); ctx.scale(echelle, echelle);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = c.sur;
    for (const trace of tracesDe(n.cleType)) ctx.stroke(trace);
    ctx.restore();
  });
}

// '#2b6cb0' + alpha → 'rgba(43,108,176,alpha)'
function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
// Disques pleins semi-transparents, sans bord, de la couleur du type ; un peu
// plus opaques en mode sombre. Survol ou sélection : le disque devient (presque) opaque.
function couleurNoeud(hex, sombre) {
  const a = sombre ? 0.65 : 0.55;
  return {
    background: rgba(hex, a), border: rgba(hex, a),
    highlight: { background: hex, border: hex },
    hover: { background: rgba(hex, 0.85), border: rgba(hex, 0.85) },
  };
}
function police(sombre) {
  return { size: 11, color: sombre ? '#f1f5f9' : '#1a202c', strokeWidth: 3, strokeColor: sombre ? '#0f172a' : '#ffffff' };
}
// Traits assez contrastés sur fond clair comme sur fond sombre.
function couleurTrait(sombre) { return sombre ? 'rgba(203,213,225,0.45)' : 'rgba(71,85,105,0.55)'; }
// Rayon de 16 à 36 px selon le nombre de liens (12 à 34 dans le bottin) ; un quart
// de plus avec un logo, pour qu'il se reconnaisse.
function tailleNoeud(degre, avecLogo) {
  const rayon = Math.min(Math.max(16 + Math.sqrt(degre) * 3.5, 14), 36);
  return avecLogo ? Math.round(rayon * 1.25) : rayon;
}
// Image d'une seule couleur : montrée à la place d'un logo qui ne se charge pas,
// elle remplit le rond de la couleur du type.
function pixel(hex) {
  if (!pixels.has(hex)) {
    const toile = document.createElement('canvas');
    toile.width = 4; toile.height = 4;
    const dessin = toile.getContext('2d');
    dessin.fillStyle = hex; dessin.fillRect(0, 0, 4, 4);
    pixels.set(hex, toile.toDataURL('image/png'));
  }
  return pixels.get(hex);
}
// Point d'un sujet : une étiquette, d'autant plus grande que le sujet réunit de ressources.
function formeSujet(s, sombre) {
  // Bulle en verre : un fond teinté translucide, un liseré clair à peine visible, une ombre douce.
  // Pas de contour foncé ni de texte noir. Un sujet est bleu, une norme ou un format violet.
  const teinte = s.norme
    ? (sombre ? { fond: 'rgba(91,60,160,0.78)', vif: 'rgba(124,92,200,0.92)', texte: '#ede9fe' } : { fond: 'rgba(237,233,254,0.86)', vif: 'rgba(221,214,254,0.96)', texte: '#5b21b6' })
    : (sombre ? { fond: 'rgba(42,67,101,0.78)', vif: 'rgba(59,98,150,0.92)', texte: '#dbeafe' } : { fond: 'rgba(226,238,252,0.86)', vif: 'rgba(199,222,247,0.96)', texte: '#1a365d' });
  const lisere = sombre ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)';
  return {
    id: s.id, shape: 'box', label: s.nom, title: `${s.nom} · ${TEXTES.graphe.ressourcesDuSujet(s.nombre)}`,
    margin: { top: 14, bottom: 14, left: 24, right: 24 }, borderWidth: 1.5, borderWidthSelected: 1.5, shapeProperties: { borderRadius: 40 },
    widthConstraint: { maximum: 460 }, mass: 4,
    // Au survol ou au clic, la bulle change de teinte mais son texte ne passe pas en gras : sa taille ne bouge pas.
    labelHighlightBold: false,
    color: { background: teinte.fond, border: lisere, highlight: { background: teinte.vif, border: lisere }, hover: { background: teinte.vif, border: lisere } },
    shadow: { enabled: true, color: sombre ? 'rgba(0,0,0,0.35)' : 'rgba(26,54,93,0.16)', size: 18, x: 0, y: 6 },
    // Le graphe est vu de loin : les étiquettes sont écrites gros pour rester lisibles.
    font: { size: Math.round(34 + Math.min(s.nombre, 26) * 1.5), color: teinte.texte },
    estSujet: true, nombre: s.nombre, norme: !!s.norme,
  };
}
// Logo entier dans son rond : vis-network remplit le cercle avec l'image, ce qui rogne un logo
// carré ou large. On redessine donc chaque logo, réduit et centré sur un fond blanc carré ; le
// cercle ne coupe plus que du blanc. Seuls les logos servis par le site peuvent être redessinés.
const logosRonds = new Map();   // adresse du logo → promesse de l'image redessinée
function logoRond(adresse) {
  if (!/^\/logos\//.test(adresse || '')) return Promise.resolve(null);
  if (!logosRonds.has(adresse)) {
    logosRonds.set(adresse, new Promise((resoudre) => {
      const image = new Image();
      image.onload = () => {
        try {
          const cote = 192, toile = document.createElement('canvas');
          toile.width = cote; toile.height = cote;
          const dessin = toile.getContext('2d');
          dessin.fillStyle = '#ffffff'; dessin.fillRect(0, 0, cote, cote);
          // Le carré inscrit dans le cercle fait 71 % du diamètre ; 66 % laisse un peu d'air.
          const boite = cote * 0.66, l = image.naturalWidth || 1, h = image.naturalHeight || 1;
          const echelle = Math.min(boite / l, boite / h);
          dessin.imageSmoothingQuality = 'high';
          dessin.drawImage(image, (cote - l * echelle) / 2, (cote - h * echelle) / 2, l * echelle, h * echelle);
          resoudre(toile.toDataURL('image/png'));
        } catch (err) { resoudre(null); }
      };
      image.onerror = () => resoudre(null);
      image.src = adresse;
    }));
  }
  return logosRonds.get(adresse);
}
// Rond d'une ressource qui a un logo : fond blanc, contour épais de la couleur du type.
function couleurLogo(hex) {
  return { background: '#ffffff', border: hex, highlight: { background: '#ffffff', border: hex }, hover: { background: '#ffffff', border: hex } };
}

// Les titres sont de simples chaînes : vis-network les affiche comme du texte, jamais comme du HTML.
function faireLien(l, couleur) {
  return {
    id: `${l.a}|${l.b}`, from: l.a, to: l.b, value: l.poids, mots: l.motsCommuns,
    title: mode === 'sujets' ? undefined : `${TEXTES.graphe.sujetsCommuns} : ${l.motsCommuns.join(' · ')}`,
    color: { color: couleur, highlight: '#a855f7', hover: '#a855f7' },
    // Le bottin divise par 6 des scores de 4 à 50 ; ici les scores vont de 1,6 à 16 environ.
    width: Math.min(0.5 + l.poids / 2.5, 4),
  };
}

function seuil() {
  const v = parseFloat($('densiteConnexions').value);
  return Number.isNaN(v) ? PARAMS_CONNEXIONS.SCORE_MIN : v;
}
function masquerIsoles() { return $('masquerIsoles').checked; }

// ─── Physique ───
function vitesseCalme() {
  const echelle = Math.max(0.05, reseau.getScale() || 0.19);
  return Math.max(0.06, Math.min(1.2, CALME_PX_PAR_S / (26 * echelle)));
}
function appliquerCalme() {
  if (!reseau) return;
  // Mouvement réduit demandé : le graphe est posé, rien ne bouge tout seul.
  if (C.mouvementReduit()) { arreterRespiration(); reseau.setOptions({ physics: { enabled: false } }); calme = true; calmeApplique = false; return; }
  calme = true;
  respirer();
  if (!minuterieRespiration) minuterieRespiration = setInterval(respirer, RESPIRATION.intervalle);
}
// Met le graphe en régime calme, une seule fois. minVelocity à 0 : la
// simulation ne se déclare jamais « stabilisée », donc ne s'arrête pas.
let calmeApplique = false;
function installerCalme() {
  reseau.setOptions({ physics: Object.assign({}, PHYSIQUE_CALME, {
    minVelocity: 0, maxVelocity: vitesseCalme(), forceAtlas2Based: Object.assign({}, FORCES),
  }) });
  reseau.startSimulation();
  calmeApplique = true;
}
// Un pas de respiration : déplace très légèrement l'équilibre. Les options de
// la physique sont retouchées en place (vis-network 9.1.9 les relit à chaque pas).
function respirer() {
  if (!reseau || !calme || document.hidden || C.etat.vue !== 'connexions') return;
  if (!calmeApplique) installerCalme();
  phase += RESPIRATION.pas;
  const options = reseau.physics && reseau.physics.options;
  const forces = options && options.forceAtlas2Based;
  if (!forces) return;
  forces.springLength = FORCES.springLength * (1 + RESPIRATION.ressort * Math.sin(phase));
  forces.gravitationalConstant = FORCES.gravitationalConstant * (1 + RESPIRATION.repulsion * Math.sin(phase * 0.6 + 1));
  options.maxVelocity = vitesseCalme();
  if (reseau.physics.stabilized) reseau.startSimulation();
}
function arreterRespiration() {
  clearInterval(minuterieRespiration);
  minuterieRespiration = null;
}
function auZoom() {
  if (!calme) return;
  clearTimeout(minuterieZoom);
  minuterieZoom = setTimeout(appliquerCalme, 150);
}
// Recalcule le placement hors écran puis repasse en régime calme : les points
// passent directement à leur nouvelle position, sans course visible.
function replacer(iterations) {
  if (!reseau) return;
  $('calculConnexions').classList.remove('hidden');
  calme = false; calmeApplique = false;
  arreterRespiration();
  reseau.setOptions({ physics: Object.assign({}, PHYSIQUE_RAPIDE, { forceAtlas2Based: FORCES }) });
  reseau.once('stabilizationIterationsDone', () => {
    if (!reseau) return;
    appliquerCalme();
    $('calculConnexions').classList.add('hidden');
    appliquerFiltres();
  });
  reseau.stabilize(iterations || 200);
}

// ─── Cadrage ───
function animation(duree) { return C.mouvementReduit() ? false : { duration: duree, easingFunction: 'easeInOutCubic' }; }

function ajusterTaille() {
  const r = $('graphe').getBoundingClientRect();
  if (reseau && r.width && r.height) reseau.setSize(r.width + 'px', r.height + 'px');
}

// Vue de départ : les ressources reliées et visibles, centrées sur leur point
// moyen (là où le graphe est dense), puis rapprochées.
function vueDepart(animee) {
  if (!reseau || !g) return;
  const options = { animation: false };
  const relies = new Set();
  g.liensDS.forEach((l) => { relies.add(l.from); relies.add(l.to); });
  const ids = g.noeudsDS.getIds().filter((id) => relies.has(id) && !g.noeudsDS.get(id).hidden);
  if (ids.length > 5) options.nodes = ids;
  ajusterTaille();
  reseau.fit(options);
  const deplacement = { scale: reseau.getScale() * ZOOM_DEPART, animation: animee ? animation(500) : false };
  const positions = reseau.getPositions(options.nodes || g.noeudsDS.getIds());
  let sx = 0, sy = 0, k = 0;
  for (const id in positions) { sx += positions[id].x; sy += positions[id].y; k++; }
  if (k) deplacement.position = { x: sx / k, y: sy / k };
  reseau.moveTo(deplacement);
}

function centrer(adresse, duree) {
  if (!reseau || !g || !g.noeudsDS.get(adresse)) return;
  reseau.once('animationFinished', appliquerCalme);
  reseau.focus(adresse, { scale: 1.2, animation: animation(duree || 500) });
  reseau.selectNodes([adresse]);
  if (C.mouvementReduit()) appliquerCalme();
}

// ─── Liens d'une ressource : panneau ouvert au clic sur un point ───
let choisie = null;   // adresse de la ressource (ou identifiant du sujet) dont on montre les liens

// Les liens affichés de cette ressource, du plus fort au plus faible, vers des ressources visibles.
function liensDe(adresse) {
  return g.liens
    .filter((l) => l.from === adresse || l.to === adresse)
    .map((l) => ({ lien: l, autre: g.noeudsDS.get(l.from === adresse ? l.to : l.from) }))
    .filter((v) => v.autre && !v.autre.hidden)
    .sort((x, y) => y.lien.value - x.lien.value);
}

function choisir(adresse) {
  if (!reseau || !g || !g.noeudsDS.get(adresse)) return;
  choisie = adresse;
  const voisines = liensDe(adresse);
  // Les autres points s'effacent : on ne voit plus que la ressource et celles qui lui sont reliées.
  const gardes = new Set([adresse, ...voisines.map((v) => v.autre.id)]);
  g.noeudsDS.update(g.noeuds.map((n) => ({ id: n.id, opacity: gardes.has(n.id) ? 1 : 0.18 })));
  reseau.selectNodes([adresse]);
  afficherPanneauLiens(adresse, voisines);
}

function relacher() {
  if (!choisie) return;
  choisie = null;
  $('panneauLiens').classList.add('hidden');
  if (reseau) reseau.unselectAll();
  appliquerFiltres();
}

// Construit par le DOM (textContent) : aucun texte de Notion n'est injecté comme HTML.
function afficherPanneauLiens(adresse, voisines) {
  const panneau = $('panneauLiens');
  const noeud = g.noeudsDS.get(adresse);
  const ressource = C.etat.ressources.find((r) => r.adresse === adresse) || {};
  panneau.textContent = '';
  const entete = document.createElement('div'); entete.className = `panneau-entete${noeud.estSujet ? '' : ` type-${noeud.cleType}`}`;
  const titre = document.createElement('h2');
  if (!noeud.estSujet) titre.innerHTML = puceType(noeud.cleType);
  const nom = document.createElement('span'); nom.textContent = ressource.nom || noeud.label;
  titre.appendChild(nom);
  const fermer = document.createElement('button');
  fermer.type = 'button'; fermer.className = 'member-modal-close'; fermer.textContent = '×';
  fermer.title = TEXTES.graphe.fermerLiens; fermer.setAttribute('aria-label', TEXTES.graphe.fermerLiens);
  fermer.addEventListener('click', relacher);
  entete.append(titre, fermer);
  const fiche = document.createElement('a');
  fiche.className = 'card-action'; fiche.href = `/ressource/${adresse}`; fiche.dataset.fiche = adresse; fiche.textContent = TEXTES.liste.voirFiche;
  const aide = document.createElement('p'); aide.className = 'panneau-aide';
  if (noeud.estSujet) { fiche.hidden = true; aide.textContent = TEXTES.graphe.ressourcesDuSujet(voisines.length); }
  else if (g.mode === 'sujets') aide.textContent = TEXTES.graphe.porteSur(voisines.length);
  else aide.textContent = voisines.length ? TEXTES.graphe.relieeA(voisines.length) : TEXTES.graphe.sansLien;
  const liste = document.createElement('ul');
  const normesChoisie = new Set((ressource.normes || []).map((n) => String(n).toLowerCase()));
  for (const { lien, autre } of voisines) {
    const li = document.createElement('li'); if (!autre.estSujet) li.className = `type-${autre.cleType}`;
    const bouton = document.createElement('button'); bouton.type = 'button';
    if (!autre.estSujet) bouton.innerHTML = puceType(autre.cleType); else bouton.className = 'sujet';
    const libelle = document.createElement('strong');
    libelle.textContent = (C.etat.ressources.find((r) => r.adresse === autre.id) || {}).nom || autre.label;
    bouton.appendChild(libelle);
    bouton.addEventListener('click', () => { choisir(autre.id); centrer(autre.id, 500); });
    const sujets = document.createElement('div'); sujets.className = 'card-chips-row';
    if (g.mode !== 'sujets') for (const mot of lien.mots || []) { const p = document.createElement('span'); p.className = normesChoisie.has(mot) ? 'axe-chip norme' : 'axe-chip'; p.textContent = mot; sujets.appendChild(p); }
    li.append(bouton, sujets);
    liste.appendChild(li);
  }
  panneau.append(entete, fiche, aide, liste);
  panneau.classList.remove('hidden');
  panneau.scrollTop = 0;
}

// ─── Filtres et recherche appliqués au graphe en place ───
function appliquerFiltres() {
  if (!reseau || !g) return;
  const etat = C.etat;
  const filtres = filtresActifs(etat.filtres);
  const retenues = new Set(etat.filtrees.map((r) => r.adresse));
  const trouvees = new Set(etat.visibles.map((r) => r.adresse));
  const sansLien = masquerIsoles();
  const majs = g.noeuds.filter((n) => !n.estSujet).map((n) => ({
    id: n.id,
    hidden: (filtres && !retenues.has(n.id)) || (g.mode !== 'sujets' && sansLien && !g.degre.get(n.id)),
    // La recherche estompe les ressources qui n'y répondent pas, sans les retirer.
    opacity: etat.requete ? (trouvees.has(n.id) ? 1 : 0.35) : 1,
  }));
  const montres = new Set(majs.filter((m) => !m.hidden).map((m) => m.id));
  const nets = new Set(majs.filter((m) => !m.hidden && m.opacity === 1).map((m) => m.id));
  // Un sujet n'est montré que si au moins une de ses ressources l'est ; il s'estompe avec elles.
  let sujetsMontres = 0;
  for (const n of g.noeuds) {
    if (!n.estSujet) continue;
    const siennes = g.liens.filter((l) => l.to === n.id).map((l) => l.from);
    const cache = !siennes.some((a) => montres.has(a));
    if (!cache) sujetsMontres++;
    majs.push({ id: n.id, hidden: cache, opacity: siennes.some((a) => nets.has(a)) ? 1 : 0.35 });
  }
  g.noeudsDS.update(majs);
  const liensMontres = g.liens.filter((l) => montres.has(l.from) && (montres.has(l.to) || g.mode === 'sujets')).length;
  $('compteConnexions').textContent = g.mode === 'sujets'
    ? TEXTES.graphe.compteSujets(montres.size, sujetsMontres, g.sansSujet)
    : TEXTES.graphe.compte(montres.size, liensMontres);
  // Une ressource choisie reste mise en avant tant qu'elle est affichée ; sinon son panneau se referme.
  if (choisie) { if (montres.has(choisie)) choisir(choisie); else { choisie = null; $('panneauLiens').classList.add('hidden'); } }

  // Aucun cadrage animé tant que le graphe est caché ou en cours de placement.
  const visible = !$('zoneConnexions').classList.contains('hidden');
  if (!visible || !calme) return;
  if (aCentrer) { const adresse = aCentrer; aCentrer = null; if (montres.has(adresse)) { centrer(adresse, 600); choisir(adresse); } derniereCle = cle(etat); return; }
  const signature = cle(etat);
  const change = derniereCle !== undefined && derniereCle !== signature;
  derniereCle = signature;
  if (etat.requete) {
    // Recherche : zoom sur le meilleur résultat présent dans le graphe.
    const meilleur = etat.visibles.find((r) => montres.has(r.adresse));
    if (meilleur && change) centrer(meilleur.adresse);
  } else if (change && montres.size) {
    reseau.unselectAll();
    reseau.once('animationFinished', appliquerCalme);
    if (filtres) reseau.fit({ nodes: [...montres], animation: animation(500) });
    else vueDepart(true);
    if (C.mouvementReduit()) appliquerCalme();
  }
}
function cle(etat) {
  const f = etat.filtres;
  return [etat.requete, f.type.join(','), f.modeAcces.join(','), f.porteur.join(','), f.etat.join(','), f.portee.join(','), f.langue.join(','), f.norme.join(','), f.horsCarte ? 'h' : ''].join('|');
}

// Curseur « Liens » : nouveau seuil, donc nouveaux liens et nouveau placement, calculé hors écran.
function appliquerDensite() {
  if (!reseau || !g || g.mode === 'sujets') return;
  const { liens } = calculerConnexions(C.etat.ressources, { SCORE_MIN: seuil() });
  const couleur = couleurTrait(C.modeSombre());
  g.liens = liens.map((l) => faireLien(l, couleur));
  g.liensDS.clear();
  g.liensDS.add(g.liens);
  compterDegres();
  g.noeudsDS.update(g.noeuds.map((n) => ({ id: n.id, size: tailleNoeud(g.degre.get(n.id) || 0, n.avecLogo) })));
  replacer(200);
  appliquerFiltres();
}
function compterDegres() {
  g.degre = new Map();
  for (const l of g.liens) { g.degre.set(l.from, (g.degre.get(l.from) || 0) + 1); g.degre.set(l.to, (g.degre.get(l.to) || 0) + 1); }
}

// Changement de mode clair ou sombre : libellés et traits changent de couleur, le placement reste.
function appliquerTheme() {
  legende();
  if (!reseau || !g) return;
  const sombre = C.modeSombre();
  const couleur = couleurTrait(sombre);
  g.noeudsDS.update(g.noeuds.map((n) => {
    if (n.estSujet) { const f = formeSujet({ id: n.id, nom: n.label, nombre: n.nombre, norme: n.norme }, sombre); return { id: n.id, font: f.font, color: f.color, shadow: f.shadow }; }
    const hex = couleurType(n.cleType);
    return { id: n.id, font: police(sombre), color: n.avecLogo ? couleurLogo(hex) : couleurNoeud(hex, sombre) };
  }));
  couleursIcones = new Map();
  g.liensDS.update(g.liens.map((l) => ({ id: l.id, color: { color: couleur, highlight: '#a855f7', hover: '#a855f7' } })));
}

// ─── Construction ───
function construire() {
  affichageEnCours = false;
  const etat = C.etat;
  if (etat.vue !== 'connexions') return;
  if (reseau && g && g.source === etat.ressources && g.mode === mode) {
    appliquerCalme();
    vueDepart(false);
    appliquerFiltres();
    return;
  }
  const sombre = C.modeSombre();
  const parSujets = mode === 'sujets' ? calculerSujets(etat.ressources) : null;
  const { noeuds: bruts, liens: liensBruts } = parSujets || calculerConnexions(etat.ressources, { SCORE_MIN: seuil() });
  const parAdresse = new Map(etat.ressources.map((r) => [r.adresse, r]));
  const couleur = couleurTrait(sombre);
  g = { source: etat.ressources, mode, liens: liensBruts.map((l) => faireLien(l, couleur)), sansSujet: parSujets ? parSujets.sansSujet.length : 0 };
  compterDegres();
  couleursIcones = new Map();
  choisie = null; $('panneauLiens').classList.add('hidden');
  g.noeuds = bruts.map((n) => {
    const cleDuType = cleType(n.type);
    const r = parAdresse.get(n.adresse) || {};
    const porteur = ((r.porteurs || [])[0] || {}).nom;
    const hex = couleurType(cleDuType);
    const logo = adresseLogo(r.logo);
    const forme = logo
      ? { shape: 'circularImage', image: logo, brokenImage: pixel(hex), borderWidth: 2, borderWidthSelected: 4, color: couleurLogo(hex) }
      : { shape: 'dot', borderWidth: 0, color: couleurNoeud(hex, sombre) };
    return Object.assign(forme, {
      id: n.adresse,
      label: n.nom.length > 30 ? n.nom.slice(0, 28) + '…' : n.nom,
      // Le porteur n'est pas répété quand il porte le même nom que la ressource.
      title: [n.nom, n.type ? TEXTES.typesCourts[cleDuType] || n.type : '', porteur && porteur !== n.nom ? porteur : ''].filter(Boolean).join(' · '),
      // En mode sujets, les ressources sont plus petites : ce sont les sujets qu'on lit d'abord.
      size: parSujets ? (logo ? 20 : 15) : tailleNoeud(g.degre.get(n.adresse) || 0, !!logo),
      font: police(sombre),
      cleType: cleDuType,
      avecLogo: !!logo,
    });
  });
  if (parSujets) g.noeuds = g.noeuds.concat(parSujets.sujets.map((s) => formeSujet(s, sombre)));
  arreterRespiration();
  if (reseau) { try { reseau.destroy(); } catch (err) { /* déjà détruit */ } reseau = null; }
  g.noeudsDS = new vis.DataSet(g.noeuds);
  // Les logos redessinés remplacent les originaux dès qu'ils sont prêts, sans attendre pour afficher le graphe.
  const jeu = g.noeudsDS;
  for (const n of g.noeuds) {
    if (!n.avecLogo) continue;
    logoRond(n.image).then((rond) => { if (rond && g && g.noeudsDS === jeu) jeu.update({ id: n.id, image: rond }); });
  }
  g.liensDS = new vis.DataSet(g.liens);
  // Options du bottin ; seules les forces (FORCES) sont réglées pour ce graphe.
  const options = {
    nodes: { shape: 'dot', borderWidth: 0, borderWidthSelected: 0 },
    edges: { smooth: { type: 'continuous', roundness: 0.2 }, scaling: { min: 0.5, max: 4 } },
    physics: {
      // Amortissement élevé : mouvement lent et calme après la stabilisation.
      forceAtlas2Based: FORCES,
      solver: 'forceAtlas2Based',
      // Le placement se calcule hors écran à pleine vitesse, puis la physique passe en régime calme.
      stabilization: { iterations: 400, fit: true, updateInterval: 50 },
      maxVelocity: 50, minVelocity: 0.75, timestep: 0.25, adaptiveTimestep: true,
    },
    interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragNodes: true },
  };
  const conteneur = $('graphe');
  reseau = new vis.Network(conteneur, { nodes: g.noeudsDS, edges: g.liensDS }, options);
  $('calculConnexions').classList.remove('hidden');
  calme = false; calmeApplique = false;
  derniereCle = undefined;
  reseau.once('stabilizationIterationsDone', () => {
    if (!reseau) return;
    vueDepart(false);
    appliquerCalme();
    $('calculConnexions').classList.add('hidden');
    // Recherche ou filtres déjà actifs à l'arrivée dans la vue : les appliquer maintenant.
    derniereCle = C.etat.requete || filtresActifs(C.etat.filtres) ? '' : cle(C.etat);
    appliquerFiltres();
  });
  reseau.on('zoom', auZoom);
  reseau.on('afterDrawing', dessinerIcones);
  // Un clic sur un point montre ce qui le relie aux autres ; un clic dans le vide referme le panneau.
  reseau.on('click', (p) => { if (p.nodes && p.nodes.length) choisir(p.nodes[0]); else if (!p.edges || !p.edges.length) relacher(); });
  reseau.on('hoverNode', () => { conteneur.style.cursor = 'pointer'; });
  reseau.on('blurNode', () => { conteneur.style.cursor = ''; });
  // La zone de dessin suit la taille réelle de son cadre une fois celui-ci affiché.
  setTimeout(() => { if (reseau) { ajusterTaille(); reseau.redraw(); } }, 50);
}

// Affiche la vue : message de calcul, puis le graphe une fois sa zone mesurable.
function afficher() {
  const zone = $('zoneConnexions');
  const attente = $('chargementConnexions');
  if (typeof vis === 'undefined' || !vis.Network) {
    zone.classList.add('hidden');
    attente.classList.remove('hidden');
    attente.firstElementChild.textContent = TEXTES.graphe.indisponible;
    return;
  }
  if (affichageEnCours) return;
  affichageEnCours = true;
  attente.firstElementChild.textContent = TEXTES.graphe.calcul;
  attente.classList.remove('hidden');
  zone.classList.add('hidden');
  // Délai maximal de 400 ms : sans lui, la suite attendrait un moment de repos du navigateur qui peut ne pas venir.
  const planifier = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 400 }) : (fn) => setTimeout(fn, 50);
  planifier(() => {
    if (C.etat.vue !== 'connexions') { affichageEnCours = false; attente.classList.add('hidden'); return; }
    attente.classList.add('hidden');
    zone.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(construire));
  });
}

function suivre(etat, motif) {
  const zone = $('zoneConnexions');
  if (motif === 'theme') { appliquerTheme(); return; }
  if (etat.vue !== 'connexions') {
    zone.classList.add('hidden');
    $('chargementConnexions').classList.add('hidden');
    // Graphe caché : la physique est coupée, elle reprend au retour dans la vue.
    arreterRespiration();
    if (reseau) { reseau.setOptions({ physics: { enabled: false } }); calme = false; calmeApplique = false; }
    return;
  }
  const pret = reseau && g && g.source === etat.ressources && !zone.classList.contains('hidden');
  if (pret) appliquerFiltres(); else afficher();
}

// ─── Légende, aide, réglages ───
function legende() {
  $('legendeGraphe').innerHTML = Object.values(CLES_TYPE).map((cleDuType) =>
    `<li class="type-${cleDuType}">${puceType(cleDuType)}${echapper(TEXTES.typesCourts[cleDuType])}</li>`).join('');
}

// Fenêtre d'explication : construite par le DOM (textContent), sans HTML injecté.
function ouvrirAide() {
  const boite = $('contenuAide');
  boite.textContent = '';
  const titre = document.createElement('h2'); titre.id = 'titreAide'; titre.className = 'aide-titre'; titre.textContent = TEXTES.aide.titre;
  const chapeau = document.createElement('p'); chapeau.className = 'aide-chapeau'; chapeau.textContent = TEXTES.aide.chapeau;
  boite.append(titre, chapeau);
  for (const [intertitre, texte] of TEXTES.aide.sections) {
    const h = document.createElement('h3'); h.className = 'aide-section'; h.textContent = intertitre;
    const p = document.createElement('p'); p.className = 'aide-texte'; p.textContent = texte;
    boite.append(h, p);
  }
  const fenetre = $('fenetreAide');
  if (typeof fenetre.showModal === 'function') fenetre.showModal(); else fenetre.setAttribute('open', '');
  $('fermerAide').focus();
}

// « Voir ses connexions » : centre la ressource dès que le placement est terminé.
C.centrerDansGraphe = function (adresse) {
  aCentrer = adresse;
  if (reseau && g && calme && !$('zoneConnexions').classList.contains('hidden')) appliquerFiltres();
};

// Croix de l'étiquette « Connexions de : … » ou « Tout réinitialiser » : plus de ressource centrée, retour à la vue de départ.
C.libererGraphe = function () {
  aCentrer = null;
  if (choisie) { choisie = null; $('panneauLiens').classList.add('hidden'); if (reseau && g) appliquerFiltres(); }
  if (!reseau || !g || !calme || $('zoneConnexions').classList.contains('hidden')) return;
  reseau.unselectAll();
  vueDepart(true);
};

// Choix du mode : traits entre ressources, ou ressources rattachées à leurs sujets.
function majMode() {
  document.querySelectorAll('[data-mode-graphe]').forEach((b) => {
    const actif = b.dataset.modeGraphe === mode;
    b.classList.toggle('active', actif); b.setAttribute('aria-pressed', actif ? 'true' : 'false');
  });
  $('zoneConnexions').classList.toggle('mode-sujets', mode === 'sujets');
  $('texteIntroConnexions').textContent = mode === 'sujets' ? TEXTES.graphe.introSujets : TEXTES.graphe.intro;
}
document.querySelectorAll('[data-mode-graphe]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.modeGraphe === mode) return;
  mode = b.dataset.modeGraphe === 'sujets' ? 'sujets' : 'ressources';
  majMode();
  if (C.etat.vue === 'connexions' && C.etat.pret) afficher();
}));
majMode();

legende();
$('boutonAide').addEventListener('click', ouvrirAide);
$('densiteConnexions').addEventListener('change', appliquerDensite);
$('masquerIsoles').addEventListener('change', appliquerFiltres);
document.querySelector('#zoneConnexions .js-recentrer').addEventListener('click', () => {
  if (!reseau) return;
  relacher();
  reseau.unselectAll();
  reseau.once('animationFinished', appliquerCalme);
  vueDepart(true);
  if (C.mouvementReduit()) appliquerCalme();
});
window.addEventListener('resize', () => { if (reseau && C.etat.vue === 'connexions') ajusterTaille(); });
C.surChangement(suivre);
})();
