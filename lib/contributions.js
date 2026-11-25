/**
 * Ce que partagent les routes de contribution (api/lien, api/proposition, api/admin) :
 * le réglage qui les ouvre, l'origine sûre des liens, et l'assemblage des modules.
 */
const { Client } = require('@notionhq/client');
const { ecriture, lirePorteurs, lireRessources } = require('./notion');
const { creerLimites } = require('./limites');
const { creerCourriels } = require('./courriels');
const { creerPropositions } = require('./propositions');
const { creerApprobation } = require('./approbation');
const { creerVersions } = require('./versions');
const { creerRessources } = require('./ressources');
const { creerPorteurs } = require('./porteurs');
const { creerQualite } = require('./qualite');
const { creerLiens } = require('./liens');
const { geocoder } = require('./geocodage');
const { creerFichiers } = require('./fichiers-notion');

// Les routes n'existent que si CONTRIBUTIONS vaut « oui ».
const ouvertes = (env) => env.CONTRIBUTIONS === 'oui';

// Origine à mettre dans les liens envoyés par courriel. Elle ne suit jamais l'en-tête Host
// hors du poste local : un lien magique ne doit pas pouvoir pointer vers un autre site.
function origineSure(req, env = process.env) {
  const fixe = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(fixe)) return fixe;
  const hoteVercel = (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) || env.VERCEL_URL;
  if (/^[a-z0-9.-]+$/i.test(hoteVercel || '')) return `https://${hoteVercel}`;
  const hote = String((req.headers && req.headers.host) || '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hote) ? `http://${hote}` : '';
}

// Une demande d'écriture venue d'un autre site est refusée (l'en-tête Origin est posé par le navigateur).
function memeOrigine(req) {
  const origine = req.headers && req.headers.origin;
  if (!origine) return true;
  try { return new URL(origine).host === String(req.headers.host || ''); } catch (err) { return false; }
}

// Version stricte, pour les routes ouvertes par un témoin de session : le navigateur doit dire
// d'où vient la demande (Origin, sinon Sec-Fetch-Site), et le corps doit être du JSON, ce qu'un
// formulaire d'un autre site ne peut pas envoyer.
function memeOrigineStricte(req) {
  const h = req.headers || {};
  if (!/^application\/json\b/i.test(String(h['content-type'] || ''))) return false;
  if (h.origin) {
    try { return new URL(h.origin).host === String(h.host || ''); } catch (err) { return false; }
  }
  return h['sec-fetch-site'] === 'same-origin';
}

// Adresse du visiteur, telle que Vercel la pose.
function ipDe(req) {
  const h = req.headers || {};
  return String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim();
}

// Le corps JSON d'une requête, ou null s'il n'est pas un objet.
function corpsDe(req) {
  let corps = req.body;
  if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch (err) { return null; } }
  return corps && typeof corps === 'object' && !Array.isArray(corps) ? corps : null;
}

// Les modules réels, assemblés une fois par instance.
let assemblage = null;
function modules() {
  if (assemblage) return assemblage;
  const env = process.env;
  const client = new Client({ auth: env.NOTION_KEY, timeoutMs: 8000 });
  const { donneesPubliques } = require('../api/export');
  const limites = creerLimites({ env });
  const courriels = creerCourriels({ env });
  const propositions = creerPropositions(client, env);
  const notion = { ...ecriture(client, env), lirePorteurs, lireRessources };
  // L'historique des versions : sans le réglage NOTION_DB_VERSIONS, il reste vide et rien ne s'y écrit.
  const versions = creerVersions(client, env);
  const fichiers = creerFichiers({ env });
  const approbation = creerApprobation({
    notion, propositions, courriels, geocoder, fichiers, versions, verrous: limites,
    viderMemoire: () => donneesPubliques.vider(),
    idParAdresse: async () => (await donneesPubliques()).idParAdresse,
  });
  const ressources = creerRessources({
    notion, versions, propositions, verrous: limites, secret: env.JWT_SECRET,
    viderMemoire: () => donneesPubliques.vider(),
  });
  // Les porteurs, la qualité des données et la vérification des liens partagent les verrous des fiches.
  const commun = { notion, versions, propositions, verrous: limites, secret: env.JWT_SECRET, viderMemoire: () => donneesPubliques.vider() };
  const liens = creerLiens({ notion });
  const porteurs = creerPorteurs({ ...commun, geocoder });
  const qualite = creerQualite({ ...commun, liens });
  assemblage = { env, journal: console.error, limites, courriels, propositions, notion, fichiers, approbation, versions, ressources, porteurs, qualite, liens, source: donneesPubliques };
  return assemblage;
}

// Les dépendances d'un gestionnaire : celles qu'on lui a données (essais), sinon les réelles.
function dependances(donnees) {
  return donnees && donnees.limites ? donnees : { ...modules(), ...(donnees || {}) };
}

module.exports = { ouvertes, origineSure, memeOrigine, memeOrigineStricte, ipDe, corpsDe, dependances };
