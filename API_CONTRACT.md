# Contrat HTTP — Afterburner

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers (sons, photos, vidéos) restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |

`Page<T>` (pagination Mongoose via `mongoose-aggregate-paginate-v2`) contient `docs` (les éléments de la page), `totalDocs`, `limit`, `page`, `totalPages`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage` et `nextPage`.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

Les anciennes routes `/tracks` (TP1 à TP3) ont été retirées au TP4 : elles sont remplacées par `/media`.

## Médias (TP4, étape 1)

Sons, photos et vidéos avec visibilité. Toutes les routes exigent `Authorization: Bearer <token>`, sauf `GET /media/:id/file` qui accepte aussi un jeton de lecture `?token=`.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/media?page=1&limit=10&title=&kind=` | JWT | `Page<Media>` (mes médias uniquement) |
| POST | `/media` | multipart : `file`, `title?`, `visibility?`, `vehicleId?` + JWT | `201 Media` |
| GET | `/media/:id` | JWT | `200 Media` |
| PATCH | `/media/:id` | `{title?, visibility?, vehicleId?}` + JWT | `200 Media` (propriétaire uniquement) |
| POST | `/media/:id/stream-url` | JWT | `200 {url, expiresIn}` |
| GET | `/media/:id/file` | JWT **ou** `?token=<jeton de lecture>`, en-tête `Range` facultatif | `200` ou `206 Partial Content` (flux binaire) |
| DELETE | `/media/:id` | JWT | `204` (propriétaire uniquement) |

`Media` : `{ id, ownerId, kind, title, originalName, mimeType, size, visibility, vehicle, createdAt }`, où `vehicle` vaut `{ id, name }` (fiche rattachée) ou `null`. `vehicleId` (upload ou PATCH) doit désigner une fiche existante ; en PATCH, `null` détache le média de sa fiche.

- `kind` est déduit du type MIME par le serveur : `audio` (MP3, WAV, OGG, M4A — 25 Mo), `image` (JPEG, PNG, WebP — 10 Mo), `video` (MP4, WebM — 100 Mo).
- `visibility` : `private` (défaut), `friends` (amis de l'escadrille — traité comme `private` tant que l'étape « escadrille » n'existe pas) ou `public` (tout utilisateur connecté).
- `kind` (filtre de `GET /media`) : `audio`, `image` ou `video` ; toute autre valeur → `400 Catégorie inconnue`. `limit` est borné à 20.
- Le propriétaire est toujours celui du JWT : un champ `ownerId` envoyé par le client est ignoré.
- `stream-url` renvoie une URL relative `/api/media/:id/file?token=...` valable `expiresIn` secondes (600). Ce jeton est limité à **ce** média et à la seule lecture du fichier : il est refusé (`401`) sur toute autre route et sur un autre média. Il sert pour `<video src>`, `<audio src>` et `<img src>`, qui ne peuvent pas envoyer d'en-tête `Authorization`. Il est masqué dans les logs du serveur.
- `GET /media/:id/file` gère `Range` (`Accept-Ranges: bytes`, `206`, `Content-Range`) pour lire et parcourir une vidéo progressivement. Les droits sont revérifiés à chaque requête.

Erreurs :
- `400` : `Véhicule inconnu`, `Fichier requis`, `Format de fichier non accepté`, `Fichier trop volumineux : N Mo maximum pour …`, `Visibilité invalide`, `Titre invalide`, `Rien à modifier`, `Catégorie inconnue`, ou dépassement de la limite Multer globale (100 Mo).
- `401` : JWT absent, invalide ou expiré ; jeton de lecture utilisé hors de son média.
- `404 Média inconnu` : identifiant inexistant ou mal formé, **ou média non accessible au lecteur** (on ne révèle jamais l'existence d'un média privé).
- `500` : métadonnée supprimée mais fichier non supprimé du disque.

## Fiches véhicules (TP4, étape 2)

Toutes les routes exigent `Authorization: Bearer <token>`.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/vehicles?q=&category=&page=1&limit=10` | JWT | `Page<Vehicle>` (fiches déjà créées, triées par nom) |
| POST | `/vehicles` | `{name}` + JWT | `201 Vehicle` (créée) ou `200 Vehicle` (déjà existante) |
| GET | `/vehicles/:id` | JWT | `200 Vehicle` |
| GET | `/vehicles/:id/media?kind=&page=1&limit=12` | JWT | `Page<Media>` (médias de la fiche **visibles par le lecteur**) |

`Vehicle` : `{ id, wikidataId, name, category, countries, summary, imageUrl, wikipediaUrl, createdAt }`.

- `category` : `aircraft` (avion), `helicopter`, `tank` (char) ou `armored` (blindé). Toute autre valeur dans le filtre → `400 Catégorie inconnue`.
- `q` cherche dans le nom et dans les noms déjà saisis pour la fiche. Cette recherche est locale : elle n'interroge pas Wikipédia.
- `POST /vehicles` : le serveur cherche `name` sur Wikipédia FR (10 meilleurs articles), puis garde le premier dont l'élément Wikidata est une sous-classe (P279, transitivement) d'hélicoptère (Q34486), d'aéronef (Q11436), de char (Q12876) ou de véhicule blindé de combat (Q1184840). Nom, catégorie, pays d'origine (P495), résumé, image et lien viennent de Wikipédia/Wikidata ; tout autre champ envoyé par le client est ignoré. Un nom déjà saisi est servi sans rappeler Wikipédia. Deux noms qui désignent le même élément Wikidata donnent la même fiche (`200`).
- `imageUrl` (ou `null`) pointe vers le CDN public de Wikimedia : aucun JWT n'est nécessaire. Texte et image sont sous licence CC BY-SA ; l'interface affiche la source.
- `GET /vehicles/:id/media` applique la même règle d'accès que `GET /media/:id` : médias publics, les siens, et ceux partagés avec le lecteur.

Erreurs :
- `400` : `Nom de véhicule requis (2 à 80 caractères)`, `Catégorie inconnue`.
- `401` : JWT absent, invalide ou expiré.
- `404 Véhicule inconnu` : identifiant inexistant ou mal formé.
- `422` : `« X » ne correspond à aucun avion, hélicoptère, char ou blindé connu de Wikipédia` (aucune fiche créée).
- `503` : `Wikipédia est momentanément indisponible, réessayez dans un instant` (réseau, délai de 8 s dépassé ou limitation de débit ; aucune fiche créée).
