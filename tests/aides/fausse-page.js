/**
 * Une fausse page pour essayer le script du panneau sans navigateur : un faux document dont chaque
 * élément garde ce qu'on y écrit (innerHTML, textContent), de fausses réponses du serveur, et les
 * écouteurs d'événements que le script pose, pour les déclencher à la main.
 * Ce n'est pas un navigateur : rien n'est analysé ni affiché. Cela vérifie que les écrans se
 * dessinent sans erreur et ce qu'ils écrivent dans la page.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPTS = ['texte.js', 'champs.js', 'comparaison.js', 'versions.js', 'fiche.js', 'gabarits.js', 'admin.js'];

function fauxElement(selecteur) {
  const el = {
    selecteur, innerHTML: '', textContent: '', hidden: false, value: '', checked: false, disabled: false, dataset: {}, style: {}, title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, addEventListener() {}, focus() {}, click() {}, remove() {}, scrollIntoView() {},
    contains() { return false; }, closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {},
  };
  return el;
}

// reponses : { action: (corps, query) => ({ code, donnees }) } ; hash : l'écran ouvert au départ.
function faussePage({ reponses = {}, hash = '' } = {}) {
  const elements = new Map(); const ecouteurs = {}; const appels = []; const telechargements = [];
  const element = (selecteur) => { if (!elements.has(selecteur)) elements.set(selecteur, fauxElement(selecteur)); return elements.get(selecteur); };
  const ecouter = (nom, f) => { (ecouteurs[nom] = ecouteurs[nom] || []).push(f); };
  const document = {
    documentElement: { getAttribute: () => 'light', setAttribute() {} }, activeElement: null, body: fauxElement('body'), title: '',
    querySelector: (s) => element(s), querySelectorAll: () => [], getElementById: (id) => element(`#${id}`), addEventListener: ecouter,
    createElement: () => { const a = fauxElement('a'); a.click = () => telechargements.push({ nom: a.download, href: a.href }); return a; },
  };
  const location = { hash, search: '', pathname: '/admin', origin: 'https://carto.exemple' };
  const fetch = async (adresse, options = {}) => {
    const url = new URL(adresse, 'https://carto.exemple');
    const action = url.pathname === '/api/admin' ? url.searchParams.get('action') : url.pathname;
    const corps = options.body ? JSON.parse(options.body) : undefined;
    appels.push({ action, corps, query: Object.fromEntries(url.searchParams) });
    const r = reponses[action] ? reponses[action](corps, Object.fromEntries(url.searchParams)) : { code: 404, donnees: {} };
    // Les données font l'aller-retour en JSON, comme sur le réseau.
    return { status: r.code, ok: r.code >= 200 && r.code < 300, json: async () => JSON.parse(JSON.stringify(r.donnees)), blob: async () => new Blob(['{}'], { type: 'application/json' }) };
  };
  const fenetre = {
    document, location, fetch, console, URL, URLSearchParams, Intl, Date, JSON, Math, Blob, clearTimeout,
    // Les minuteries de la page (le message qui s'efface) ne retiennent pas la fin des essais.
    setTimeout: (f, ms) => { const m = setTimeout(f, ms); if (m && m.unref) m.unref(); return m; },
    history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: {},
    matchMedia: () => ({ matches: false }), addEventListener: ecouter, scrollTo() {},
  };
  fenetre.window = fenetre; fenetre.globalThis = fenetre;
  const contexte = vm.createContext(fenetre);
  for (const script of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', script), 'utf8'), contexte, { filename: script });
  const tour = () => new Promise((suite) => setTimeout(suite, 0));
  const repos = async () => { for (let i = 0; i < 5; i += 1) await tour(); };
  const declencher = async (nom, evenement) => { for (const f of ecouteurs[nom] || []) await f(evenement); await repos(); };
  return {
    element, appels, telechargements, repos,
    html: (selecteur) => element(selecteur).innerHTML,
    aller: async (route) => { location.hash = `#${route}`; await declencher('hashchange', {}); },
    // Un clic sur un élément qui porte « data-act ».
    cliquer: (act, dataset = {}) => declencher('click', { target: { closest: () => ({ id: '', dataset: { act, ...dataset } }) }, stopPropagation() {}, preventDefault() {} }),
    saisir: (id, value) => declencher('input', { target: { id, value, dataset: {}, removeAttribute() {}, closest: () => null } }),
    changer: (id, proprietes) => declencher('change', { target: { id, dataset: {}, ...proprietes } }),
    toast: () => element('#toast').textContent,
  };
}

module.exports = { faussePage };
