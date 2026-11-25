/**
 * Dépôt et lecture de fichiers dans Notion (logos). Le dépôt se fait en deux appels :
 * on ouvre un dépôt, on y envoie le fichier, puis son identifiant s'attache à une colonne
 * de type fichier (dans l'heure qui suit).
 */
const { TAILLE_MAX } = require('./images');

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const ATTENTE_MS = 15000;

function creerFichiers({ env = process.env, requete = fetch } = {}) {
  const entetes = () => ({ Authorization: `Bearer ${env.NOTION_KEY}`, 'Notion-Version': VERSION });
  const delai = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(ATTENTE_MS) } : {});

  return {
    // Envoie un fichier à Notion et renvoie l'identifiant du dépôt.
    async deposer({ nom, type, octets }) {
      const ouverture = await requete(`${API}/file_uploads`, {
        method: 'POST', headers: { ...entetes(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: nom, content_type: type }), ...delai(),
      });
      if (!ouverture.ok) throw new Error(`Notion a refusé le dépôt (${ouverture.status})`);
      const { id } = await ouverture.json();
      const formulaire = new FormData();
      formulaire.append('file', new Blob([octets], { type }), nom);
      const envoi = await requete(`${API}/file_uploads/${id}/send`, { method: 'POST', headers: entetes(), body: formulaire, ...delai() });
      if (!envoi.ok) throw new Error(`Notion a refusé le fichier (${envoi.status})`);
      return id;
    },
    // Valeur à écrire dans une colonne de type fichier.
    proprieteFichier(id, nom) {
      return { files: [{ type: 'file_upload', file_upload: { id }, name: nom }] };
    },
    // Octets d'un fichier gardé par Notion (adresse temporaire).
    async telecharger(url) {
      const reponse = await requete(url, delai());
      if (!reponse.ok) throw new Error(`Fichier illisible (${reponse.status})`);
      const octets = Buffer.from(await reponse.arrayBuffer());
      if (octets.length > TAILLE_MAX) throw new Error('Fichier trop gros');
      return octets;
    },
  };
}

module.exports = { creerFichiers };
