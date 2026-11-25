/**
 * Le journal de l'équipe, dans la base Notion « Journal » : une ligne par geste fait dans le
 * panneau, avec qui, quand, quel geste et sur quoi. Rien n'y est jamais modifié ni effacé.
 * Le journal s'écrit après le geste et ne le fait jamais échouer : « noter » ne lève pas.
 * Sans le réglage NOTION_DB_JOURNAL, le journal est vide et rien ne s'écrit : le reste du
 * panneau continue de fonctionner.
 */
const { segments } = require('./notion');
const { normaliserCourriel } = require('./jetons');

const COLONNES = {
  titre: 'Titre',       // title : la phrase du geste
  faitLe: 'Fait le',    // date
  faitPar: 'Fait par',  // email
  geste: 'Geste',       // select
  sur: 'Sur',           // rich_text : le nom de la fiche, du porteur ou de la personne
};
// Les options de la colonne « Geste », telles qu'elles existent dans la base.
const GESTES = ['Approbation', 'Refus', 'Second regard', 'Fiche modifiée', 'Fiche créée', 'Version rétablie', 'Fiche écartée', 'Fiche republiée', 'Fiche vérifiée', 'Fiche à revoir',
  'Porteur créé', 'Porteur modifié', 'Porteurs fusionnés', 'Valeurs fusionnées', 'Invitation', 'Rôle changé', 'Personne retirée', 'Résumé réglé', 'Modification proposée'];
const PHRASE_MAX = 300;
const SUR_MAX = 200;
const LIMITE = 50;

const uneLigne = (texte, max) => String(texte === null || texte === undefined ? '' : texte).replace(/\s+/g, ' ').trim().slice(0, max);
const texteDe = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((s) => s.plain_text || '').join('');

function creerJournal(client, env = process.env, { maintenant = Date.now, journal = console.error } = {}) {
  const active = () => !!env.NOTION_DB_JOURNAL;

  return {
    active,

    // Écrit une ligne. Renvoie true si elle est écrite, false sinon ; ne lève jamais.
    async noter(ligne) {
      try {
        if (!active()) return false;
        const { geste, par, sur, phrase } = ligne || {};
        const texte = uneLigne(phrase, PHRASE_MAX);
        if (!GESTES.includes(geste) || !texte) {
          journal('[journal] ligne refusée :', String(geste), texte);
          return false;
        }
        const proprietes = {
          [COLONNES.titre]: { title: segments(texte) },
          [COLONNES.faitLe]: { date: { start: new Date(maintenant()).toISOString() } },
          [COLONNES.geste]: { select: { name: geste } },
          [COLONNES.sur]: { rich_text: segments(uneLigne(sur, SUR_MAX)) },
        };
        const courriel = normaliserCourriel(par);
        if (courriel) proprietes[COLONNES.faitPar] = { email: courriel };
        await client.pages.create({ parent: { database_id: env.NOTION_DB_JOURNAL }, properties: proprietes });
        return true;
      } catch (err) {
        try { journal('[journal] ligne non écrite :', err && err.message); } catch (e) { /* rien de plus à faire */ }
        return false;
      }
    },

    // Les dernières lignes, de la plus récente à la plus ancienne. Une panne de Notion remonte en erreur.
    async lire({ limite = LIMITE } = {}) {
      if (!active()) return [];
      const combien = Math.max(1, Math.min(100, Number(limite) || LIMITE));
      const reponse = await client.databases.query({
        database_id: env.NOTION_DB_JOURNAL, page_size: combien,
        sorts: [{ property: COLONNES.faitLe, direction: 'descending' }],
      });
      return (reponse.results || []).filter((page) => !page.archived && !page.in_trash).map((page) => {
        const p = page.properties || {};
        return {
          le: (p[COLONNES.faitLe] && p[COLONNES.faitLe].date && p[COLONNES.faitLe].date.start) || null,
          par: normaliserCourriel((p[COLONNES.faitPar] || {}).email) || null,
          geste: (p[COLONNES.geste] && p[COLONNES.geste].select && p[COLONNES.geste].select.name) || null,
          sur: texteDe(p[COLONNES.sur]),
          phrase: texteDe(p[COLONNES.titre]),
        };
      }).sort((a, b) => String(b.le || '').localeCompare(String(a.le || ''))).slice(0, combien);
    },
  };
}

module.exports = { creerJournal, COLONNES, GESTES };
