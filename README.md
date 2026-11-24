# Cartographie du RSN, version 2

Catalogue des ressources en santé numérique au Québec : jeux de données, catalogues, plateformes, logiciels, services et initiatives. Pour chaque ressource : à quoi elle sert, comment y accéder, à qui écrire.

Le bottin des membres du RSN est un outil distinct : https://bottin.rsn.quebec

## Comment c'est fait

Une page HTML sans cadriciel ni étape de compilation, et deux fonctions hébergées chez Vercel qui lisent Notion. Cette version ne fait que lire : rien n'est écrit dans Notion.

| Fichier | Rôle |
|---|---|
| `gabarit.html` | la page (accueil et page d'une ressource) |
| `css/styles.css` | les styles |
| `js/app.js` | recherche, filtres, fiches |
| `js/carte.js`, `js/graphe.js` | la carte et le graphe |
| `js/fiche.js` | le rendu d'une fiche, commun au navigateur et au serveur |
| `js/texte.js` | les textes de l'interface, l'échappement, les filtres |
| `js/mots-cles.js`, `js/connexions.js` | le rapprochement des ressources par mots-clés (repris du bottin) |
| `lib/notion.js` | la lecture des bases Notion ; seul fichier qui connaît les noms de colonnes |
| `lib/fiches.js` | le passage des lignes Notion aux fiches publiques |
| `lib/page-publique.js` | les pages pour les moteurs de recherche |
| `api/export.js` | `/api/export` : les fiches publiques, en JSON |
| `api/ressource.js` | `/`, `/ressource/<adresse>`, `/sitemap.xml`, `/robots.txt` |

Une fiche dont le « Statut de la fiche » est « Écartée » n'est jamais publiée. Les champs internes de Notion (notes de veille, remarques de recherche, sources) ne sont jamais lus.

## Réglages

Variables d'environnement, dans `.env.local` en local et dans le projet Vercel en ligne. Aucune n'est dans le dépôt.

| Variable | Rôle |
|---|---|
| `NOTION_KEY` | clé de l'intégration Notion « RSN cartographie » |
| `NOTION_DB_RESSOURCES` | identifiant de la base « Ressources » |
| `NOTION_DB_PORTEURS` | identifiant de la base « Porteurs » |
| `CARTO_BASEMAP_KEY` | clé du fond de carte CARTO ; sans elle, la carte utilise OpenStreetMap |
| `INDEXATION` | `oui` pour ouvrir le site aux moteurs de recherche ; toute autre valeur le ferme |
| `SITE_URL` | adresse officielle du site (facultative) ; sinon l'adresse de la requête est utilisée |

## En local

```bash
npm install
```

```bash
npm test
```

```bash
node --env-file=.env.local scripts/serveur-local.js
```

Le site est alors à l'adresse http://localhost:3210.

## Ouvrir le site aux moteurs de recherche

Mettre `INDEXATION=oui` dans le projet Vercel, redéployer, puis déclarer `/sitemap.xml` dans la Search Console.
