/**
 * GET /api/logo?adresse=<adresse de la fiche>&v=<version>
 * Sert le logo qu'une ressource a déposé. Notion donne à ses fichiers des adresses qui
 * expirent après une heure : ce relais va chercher l'image et laisse le CDN la garder un jour
 * (la version change quand la fiche change, donc un nouveau logo a une nouvelle adresse).
 */
const { verifierOctets } = require('../lib/images');

function modules() {
  const { ecriture } = require('../lib/notion');
  const { creerFichiers } = require('../lib/fichiers-notion');
  const { donneesPubliques } = require('./export');
  return { source: donneesPubliques, notion: ecriture(), fichiers: creerFichiers(), journal: console.error };
}

function creerGestionnaire(donnees) {
  return async function gestionnaire(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).send('Méthode non permise'); }
    const d = donnees || modules();
    const introuvable = () => { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300'); return res.status(404).send(''); };
    try {
      const adresse = String((req.query && req.query.adresse) || '');
      if (!/^[a-z0-9-]{1,200}$/.test(adresse)) return introuvable();
      const table = (await d.source()).idParAdresse || {};
      if (!Object.hasOwn(table, adresse)) return introuvable();
      const fichier = await d.notion.lireFichierLogo(table[adresse]);
      if (!fichier) return introuvable();
      const image = verifierOctets(await d.fichiers.telecharger(fichier.url));
      if (!image.ok) return introuvable();
      res.setHeader('Content-Type', image.type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Un SVG ouvert seul dans un onglet ne doit rien pouvoir exécuter sur le site.
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).send(image.octets);
    } catch (err) {
      d.journal('[logo] lecture impossible :', err.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).send('');
    }
  };
}

module.exports = creerGestionnaire();
module.exports.creerGestionnaire = creerGestionnaire;
