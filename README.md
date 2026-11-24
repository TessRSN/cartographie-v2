# Cartographie du RSN, version 2

Catalogue des ressources en santé numérique au Québec : jeux de données, catalogues, plateformes, logiciels, services et initiatives. Pour chaque ressource : à quoi elle sert, comment y accéder, à qui écrire.

Le bottin des membres du RSN est un outil distinct : https://bottin.rsn.quebec

## Comment c'est fait

Une page HTML sans cadriciel ni étape de compilation, et deux fonctions hébergées chez Vercel qui lisent Notion. Cette version ne fait que lire : rien n'est écrit dans Notion.

| Fichier | Rôle |
|---|---|
| `public/gabarit.html` | la page (accueil et page d'une ressource) |
| `public/css/styles.css` | les styles, repris du bottin (mêmes noms de classes) |
| `public/js/app.js` | recherche, filtres à choix multiples, bandeau de chiffres, fiches, mode clair ou sombre |
| `public/js/recherche.js` | la recherche, les suggestions et les chiffres du bandeau (fonctions pures, avec essais) |
| `public/js/carte.js`, `public/js/graphe.js` | la carte et le graphe |
| `public/js/fiche.js` | le rendu d'une fiche, commun au navigateur et au serveur |
| `public/js/texte.js` | les textes de l'interface, l'échappement, les filtres |
| `public/js/mots-cles.js`, `public/js/connexions.js` | le rapprochement des ressources par mots-clés (repris du bottin) |
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

## Mettre à jour les logos

L'adresse du logo de chaque ressource est dans la colonne « Logo » de Notion. Le site n'affiche pas l'image depuis son site d'origine : il en sert une copie, rangée dans `public/logos/`. Après avoir ajouté ou changé un logo dans Notion :

```bash
node --env-file=.env.local scripts/copier-logos.js
```

Puis enregistrer et pousser les fichiers modifiés (`public/logos/` et `lib/logos.json`). Un logo pas encore copié est affiché depuis son adresse d'origine ; sans logo, la fiche porte une pastille avec ses initiales.

## Ouvrir le site aux moteurs de recherche

Mettre `INDEXATION=oui` dans le projet Vercel, redéployer, puis déclarer `/sitemap.xml` dans la Search Console.

## Licence

Ce projet est partagé librement pour que d'autres réseaux de recherche puissent s'en inspirer.
