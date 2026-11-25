# Cartographie du RSN, version 2

Catalogue des ressources en santé numérique au Québec : jeux de données, catalogues, plateformes, logiciels et services. Pour chaque ressource : à quoi elle sert, comment y accéder, à qui écrire.

Le site est en ligne à l'adresse https://cartographie.rsn.quebec

Le bottin des membres du RSN est un outil distinct : https://bottin.rsn.quebec

## Comment c'est fait

Des pages HTML sans cadriciel ni étape de compilation, et des fonctions hébergées chez Vercel qui lisent Notion. Le site public ne fait que lire. Les contributions (proposer une ressource ou une modification, puis l'approuver) écrivent dans Notion ; elles restent fermées tant que le réglage `CONTRIBUTIONS` ne vaut pas `oui`.

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

### Les contributions

| Fichier | Rôle |
|---|---|
| `public/proposer.html` | le formulaire de proposition, ouvert par un lien reçu par courriel |
| `public/admin.html` | le panneau d'approbation |
| `public/js/proposer.js`, `public/js/admin.js` | le code du formulaire et du panneau |
| `public/js/champs.js` | le catalogue des champs et le calcul des changements, communs au navigateur et au serveur |
| `api/lien.js` | `/api/lien` : envoie le lien pour proposer, pour modifier une fiche ou pour entrer dans le panneau |
| `api/proposition.js` | `/api/proposition` : lit et enregistre une proposition |
| `api/admin.js` | `/api/admin` : la file des propositions, approuver, corriger, refuser |
| `api/logo.js` | `/api/logo` : sert le logo déposé pour une fiche |
| `api/resume.js` | `/api/resume` : le résumé hebdomadaire des propositions en attente, envoyé aux approbateurs le lundi |
| `lib/jetons.js` | les liens signés, valables un temps limité |
| `lib/courriels.js` | les courriels, envoyés par Resend |
| `lib/limites.js` | les limites d'envoi de liens et l'usage unique d'un lien |
| `lib/contributions.js` | ce que partagent les routes de contribution : le réglage qui les ouvre, l'origine sûre des liens |
| `lib/propositions.js` | la file des propositions et la liste des approbateurs, dans Notion |
| `lib/approbation.js` | approuver ou refuser une proposition ; le seul endroit où une fiche publique change |
| `lib/fichiers-notion.js`, `lib/images.js` | le dépôt et le contrôle des images de logo |
| `lib/geocodage.js` | les coordonnées d'un nouveau porteur, par Nominatim (OpenStreetMap) |

Une proposition n'est jamais appliquée à une fiche sans qu'une personne de la liste des approbateurs l'ait approuvée.

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
| `SITE_URL` | adresse officielle du site ; elle sert aux pages publiques et aux liens envoyés par courriel |
| `CONTRIBUTIONS` | `oui` pour ouvrir les contributions ; toute autre valeur les ferme |
| `JWT_SECRET` | signe les liens envoyés par courriel |
| `NOTION_DB_PROPOSITIONS` | identifiant de la base « Propositions » |
| `NOTION_DB_APPROBATEURS` | identifiant de la base « Approbateurs » |
| `CRON_SECRET` | protège le déclenchement du résumé hebdomadaire ; Vercel le joint lui-même à l'appel planifié |
| `RESEND_API_KEY` | envoi des courriels ; sans elle, rien ne part et le lien est écrit dans le journal du serveur |
| `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | expéditeur des courriels (facultatives) |
| `EMAIL_TEST_MODE`, `EMAIL_TEST_RECIPIENT` | mode d'essai : tous les courriels vont à une seule adresse |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | stockage clé-valeur de Vercel, pour les limites d'envoi ; sans lui, une limite en mémoire prend le relais |

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

Le site est alors à l'adresse http://localhost:3210. Le serveur local garde la page et les réglages en mémoire : le relancer après un changement de `public/gabarit.html` ou de `.env.local`.

Attention : en local, le site lit et écrit dans les mêmes bases Notion que le site en ligne.

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
