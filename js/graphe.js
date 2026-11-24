/**
 * Graphe des ressources proches : deux ressources visibles sont reliées quand
 * elles partagent des sujets distinctifs (voir connexions.js).
 * vis-network est chargé à la demande, comme dans le bottin.
 */
(function () {
'use strict';

const SOURCE_VIS = 'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';
const COULEURS = { jeu: '#2b6cb0', catalogue: '#2c7a7b', plateforme: '#6b46c1', logiciel: '#c05621', service: '#2f855a', initiative: '#b83280', autre: '#718096' };
let reseau = null;
let chargement = null;
let dernier = null;

function chargerVis() {
  if (typeof vis !== 'undefined' && vis.Network) return Promise.resolve();
  if (!chargement) {
    chargement = new Promise((resoudre, rejeter) => {
      const s = document.createElement('script');
      s.src = SOURCE_VIS; s.onload = resoudre; s.onerror = () => rejeter(new Error('vis-network'));
      document.head.appendChild(s);
    });
  }
  return chargement;
}

function legende() {
  const ul = document.getElementById('legendeGraphe');
  ul.innerHTML = Object.entries(CLES_TYPE).map(([libelle, cle]) =>
    `<li><i style="background:${COULEURS[cle]}"></i>${echapper(libelle.split(/,| ou /)[0])}</li>`).join('');
}

function bulle(html) {
  const div = document.createElement('div');
  div.className = 'bulle-graphe';
  div.innerHTML = html;
  return div;
}

function dessiner(etat) {
  dernier = etat;
  const aide = document.getElementById('aideGraphe');
  chargerVis().then(() => {
    if (dernier !== etat) return;
    const { noeuds, liens } = calculerConnexions(etat.visibles);
    const relies = new Set();
    for (const l of liens) { relies.add(l.a); relies.add(l.b); }
    // Les ressources sans lien ne sont affichées que si la sélection est petite.
    const montres = noeuds.filter((n) => relies.has(n.adresse) || noeuds.length <= 40);
    const donnees = {
      nodes: montres.map((n) => ({
        id: n.adresse, label: n.nom.length > 28 ? n.nom.slice(0, 26) + '…' : n.nom,
        title: bulle(`<strong>${echapper(n.nom)}</strong>${n.type ? '<br>' + echapper(n.type) : ''}`),
        color: { background: COULEURS[cleType(n.type)], border: '#ffffff', highlight: { background: COULEURS[cleType(n.type)], border: '#1a365d' } },
      })),
      edges: liens.map((l, i) => ({
        id: i, from: l.a, to: l.b, width: Math.min(1 + l.poids / 3, 6),
        title: bulle(`<strong>${echapper(TEXTES.graphe.sujetsCommuns)}</strong><br>${l.motsCommuns.map(echapper).join(', ')}`),
      })),
    };
    const options = {
      nodes: { shape: 'dot', size: 11, borderWidth: 2, font: { size: 12, color: '#2d3748', strokeWidth: 3, strokeColor: '#ffffff' } },
      edges: { color: { color: '#cbd5e0', highlight: '#2b6cb0', hover: '#2b6cb0' }, smooth: false },
      interaction: { hover: true, tooltipDelay: 120, zoomView: true, dragView: true },
      physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -45, springLength: 90, avoidOverlap: 0.4 }, stabilization: { iterations: 180 } },
      layout: { improvedLayout: false },
    };
    const conteneur = document.getElementById('graphe');
    if (reseau) reseau.destroy();
    reseau = new vis.Network(conteneur, donnees, options);
    reseau.once('stabilizationIterationsDone', () => { reseau.setOptions({ physics: false }); reseau.fit({ animation: false }); });
    reseau.on('click', (p) => { if (p.nodes.length) window.Cartographie.ouvrirFiche(p.nodes[0]); });
    reseau.on('hoverNode', () => { conteneur.style.cursor = 'pointer'; });
    reseau.on('blurNode', () => { conteneur.style.cursor = ''; });
    aide.textContent = liens.length ? TEXTES.graphe.aide : TEXTES.graphe.vide;
  }).catch(() => { aide.textContent = TEXTES.graphe.indisponible; });
}

legende();
window.Cartographie.surChangement(dessiner);
})();
