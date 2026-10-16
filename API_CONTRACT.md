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

Dans les **listes** (`GET /media` et `GET /vehicles/:id/media`), chaque média contient en plus :
- `owner` : `{ id, name }` de l'auteur (jamais son email) ;
- `url` : une URL de lecture signée, identique à celle de `stream-url` et valable 10 minutes. L'interface affiche ainsi vignettes et lecteurs sans une requête par média. La liste étant déjà filtrée par les droits du lecteur, aucune autorisation n'est accordée en plus.

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
| GET | `/vehicles?q=&category=&sort=popular&page=1&limit=10` | JWT | `Page<Vehicle>` (fiches déjà créées) |
| POST | `/vehicles` | `{name}` + JWT | `201 Vehicle` (créée) ou `200 Vehicle` (déjà existante) |
| GET | `/vehicles/:id` | JWT | `200 Vehicle` |
| GET | `/vehicles/:id/media?kind=&page=1&limit=12` | JWT | `Page<Media>` (médias de la fiche **visibles par le lecteur**) |

`Vehicle` : `{ id, wikidataId, name, category, countries, origins, summary, imageUrl, wikipediaUrl, createdAt }`, plus `mediaCount` dans `GET /vehicles`.

- `category` : `aircraft` (avion), `helicopter`, `tank` (char) ou `armored` (blindé). Toute autre valeur dans le filtre → `400 Catégorie inconnue`.
- `origins` : `[{ name, code, flagUrl }]`, les pays d'origine issus de Wikidata : pays d'origine (P495), à défaut pays (P17), à défaut pays du constructeur (P176 → P17). `code` est le code ISO 3166-1 en minuscules (P297, `null` pour un État disparu comme l'URSS). `flagUrl` est l'image du drapeau (P41) servie par Wikimedia Commons en PNG de 640 px, ou `null`. Les fiches créées avant cet ajout se complètent avec `cd backend && npm run backfill:origins`.
- `mediaCount` : nombre de médias **publics** rattachés à la fiche.
- `sort` : `popular` (par défaut ; nombre de médias publics décroissant, puis nom), `name` (A → Z) ou `recent` (dernières fiches créées). Toute autre valeur → `400 Tri inconnu`.
- `q` cherche dans le nom et dans les noms déjà saisis pour la fiche. Cette recherche est locale : elle n'interroge pas Wikipédia.
- `POST /vehicles` : le serveur cherche `name` sur Wikipédia FR (10 meilleurs articles), puis garde le premier dont l'élément Wikidata est une sous-classe (P279, transitivement) d'hélicoptère (Q34486), d'aéronef (Q11436), de char (Q12876) ou de véhicule blindé de combat (Q1184840). Nom, catégorie, pays d'origine (P495), résumé, image et lien viennent de Wikipédia/Wikidata ; tout autre champ envoyé par le client est ignoré. Un nom déjà saisi est servi sans rappeler Wikipédia. Deux noms qui désignent le même élément Wikidata donnent la même fiche (`200`).
- `imageUrl` (ou `null`) pointe vers le CDN public de Wikimedia : aucun JWT n'est nécessaire. Texte et image sont sous licence CC BY-SA ; l'interface affiche la source.
- `GET /vehicles/:id/media` applique la même règle d'accès que `GET /media/:id` : médias publics, les siens, et ceux partagés avec le lecteur. `kind` accepte un type (`audio`) ou une liste séparée par des virgules (`image,video`) ; une seule valeur inconnue → `400 Catégorie inconnue`. Chaque média contient en plus `postId` : l'identifiant du post le plus récent qui le publie et que le lecteur peut voir (même règle d'accès), ou `null`. La fiche ouvre ainsi la publication entière (`/posts/:id`).

Erreurs :
- `400` : `Nom de véhicule requis (2 à 80 caractères)`, `Catégorie inconnue`.
- `401` : JWT absent, invalide ou expiré.
- `404 Véhicule inconnu` : identifiant inexistant ou mal formé.
- `422` : `« X » ne correspond à aucun avion, hélicoptère, char ou blindé connu de Wikipédia` (aucune fiche créée).
- `503` : `Wikipédia est momentanément indisponible, réessayez dans un instant` (réseau, délai de 8 s dépassé ou limitation de débit ; aucune fiche créée).

## Fil d'actualité : posts, J'aime, commentaires (TP4, étape 3)

Toutes les routes exigent `Authorization: Bearer <token>`. Un post invisible pour le lecteur répond toujours `404 Publication inconnue` (même règle d'accès que les médias).

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/posts/feed?page=1&limit=10&others=` | JWT | `Page<Post>` (posts visibles, plus récents d'abord) |
| GET | `/posts/:id` | JWT | `200 Post` |
| POST | `/posts` | `{text?, mediaId?, vehicleId?, visibility?}` + JWT | `201 Post` |
| DELETE | `/posts/:id` | JWT | `204` (auteur uniquement ; supprime aussi les commentaires, pas le média) |
| PUT | `/posts/:id/like` | JWT | `200 {likeCount, likedByMe}` |
| DELETE | `/posts/:id/like` | JWT | `200 {likeCount, likedByMe}` |
| GET | `/posts/:id/comments?page=1&limit=20` | JWT | `Page<Comment>` (plus anciens d'abord) |
| POST | `/posts/:id/comments` | `{text}` + JWT | `201 {comment, commentCount}` |

`Post` : `{ id, ownerId, owner, text, media, vehicle, visibility, likeCount, likedByMe, commentCount, createdAt }` :
- `owner` vaut `{ id, name }` ;
- `media` vaut `{ id, kind, title, mimeType, url }` ou `null`, où `url` est une URL de lecture signée valable 10 minutes ;
- `vehicle` vaut `{ id, name, category }` ou `null`.

La liste des personnes qui aiment un post n'est jamais exposée.

`Comment` : `{ id, postId, ownerId, owner, text, createdAt }`.

- `others=1` exclut les posts du lecteur (colonne « posts récents »).
- `POST /posts` :
  - il faut un `text` (2000 caractères maximum) ou un `mediaId` ;
  - `visibility` vaut `public` par défaut ;
  - le média doit appartenir à l'auteur, sinon `400 Média inconnu`. S'il est moins visible que le post, sa visibilité est élargie à celle du post ;
  - sans `vehicleId`, le post reprend la fiche du média ;
  - l'auteur est toujours celui du JWT.
- `PUT` et `DELETE /like` sont idempotents : un seul J'aime par utilisateur.
- `POST /comments` : texte de 1 à 1000 caractères.

Erreurs :
- `400` : `Un texte ou un média est requis`, `Texte trop long (2000 caractères maximum)`, `Visibilité invalide`, `Média inconnu`, `Véhicule inconnu`, `Commentaire requis (1000 caractères maximum)`.
- `401` : JWT absent, invalide ou expiré.
- `404 Publication inconnue` : identifiant inexistant, mal formé ou post non visible.

## Profils et véhicules préférés (TP4, étape 3)

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name?, location?, bio?}` + JWT | `200 User` (seuls les champs envoyés sont modifiés) |
| GET | `/users/:id` | JWT | `200 UserProfile` |
| PUT | `/users/me/favorites/:vehicleId` | JWT | `200 User` (ajoute la fiche aux préférés) |
| DELETE | `/users/me/favorites/:vehicleId` | JWT | `200 User` (la retire) |

`User` (le sien uniquement) : `{ id, name, email, bio, location, favoriteVehicleIds, createdAt }`.

`UserProfile` (profil public, **sans email**) : `{ id, name, bio, location, createdAt, postCount, favorites }` :
- `postCount` compte les posts de ce membre **visibles par le lecteur** ;
- `favorites` vaut `[{ id, name, category, countries, origins, imageUrl }]`, dans l'ordre choisi.

- `bio` : 300 caractères maximum ; `location` : 80 caractères maximum ; un champ qui n'est pas une chaîne → `400 Champ X invalide`.
- 6 véhicules préférés au maximum. L'ajout est conditionnel et atomique. Ajouter une fiche déjà présente est sans effet (`200`).
- `GET /posts/feed` accepte aussi `author=<id>` (posts d'un membre) et `kind=audio|image|video` (posts dont le média est de ce type). Les droits du lecteur s'appliquent toujours.
- `GET /posts/feed` accepte aussi `q=<texte>` (recherche, TP4 étape 4) et `media=1` (posts avec un fichier uniquement). `q` (100 caractères au plus, insensible à la casse, cherché littéralement) trouve les posts rattachés à un véhicule dont le nom ou un alias le contient, ou dont l'auteur a un nom qui le contient ; le texte du post n'est pas cherché. Les droits du lecteur s'appliquent toujours ; `q` se combine avec `kind`, `author` et `scope`.

Erreurs :
- `400` : `6 véhicules préférés au maximum`, `Champ X invalide`, `Auteur invalide`, `Catégorie inconnue`.
- `404` : `Utilisateur inconnu`, `Véhicule inconnu`.

## Escadrille : amis, invitations et partages (TP4, étape 5)

Toutes les routes exigent `Authorization: Bearer <token>`. Les listes de membres n'exposent jamais l'email.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/friends` | JWT | `200 {friends, incoming, outgoing}` |
| POST | `/friends/requests` | `{userId}` + JWT | `201 {status: "outgoing", requestId}` ou `200 {status: "friend"}` si ce membre m'avait déjà invité |
| POST | `/friends/requests/:id/accept` | JWT | `200 {status: "friend", requestId}` (destinataire uniquement) |
| DELETE | `/friends/requests/:id` | JWT | `204` (refus par le destinataire ou annulation par l'expéditeur) |
| DELETE | `/friends/:userId` | JWT | `204` (retire un ami ; les partages entre les deux membres sont arrêtés dans les deux sens) |
| GET | `/users?q=` | JWT | `200 [{id, name, location, bio, relation}]` (10 au plus ; `q` d'au moins 2 caractères, sinon `[]`) |
| GET | `/media/shared-with-me?page=1&limit=10` | JWT | `Page<Media>` (médias qu'on m'a partagés, avec `url`) |
| GET | `/media/:id/shares` | JWT | `200 [{id, name}]` (propriétaire uniquement) |
| PUT | `/media/:id/shares/:userId` | JWT | `200 [{id, name}]` (partage avec un **ami** uniquement) |
| DELETE | `/media/:id/shares/:userId` | JWT | `200 [{id, name}]` (arrête le partage, effet immédiat) |

Formes des réponses :
- `friends` : `[{ id, name, location, bio, since }]`.
- `incoming` / `outgoing` : `[{ requestId, user: { id, name, location, bio }, createdAt }]`.
- `relation` : `{ status, requestId }`, avec `status` parmi `self`, `friend`, `outgoing` (invitation envoyée), `incoming` (invitation reçue) ou `none`.

Effets sur les autres routes :
- La visibilité `friends` est maintenant réelle : les membres de l'escadrille du propriétaire y ont accès (médias, posts, fiches, profils, comptages).
- `GET /users/:id` renvoie en plus :
  - `friendCount` ;
  - `relation` ;
  - `mutualFriendCount` et `mutualFriends` (`[{id, name, location, bio}]`, 12 au plus). Sur son propre profil, ce sont tous ses amis ; sur celui d'un autre membre, les amis en commun.
- `GET /posts/feed` accepte `scope=friends` : uniquement les posts de l'escadrille.

Erreurs :
- `400` : `Membre invalide` (soi-même ou identifiant invalide), `Vous ne pouvez partager qu'avec un membre de votre escadrille`.
- `404` : `Membre inconnu`, `Invitation inconnue`, `Ce membre n'est pas dans votre escadrille`, `Média inconnu`.
- `409` : `Déjà dans votre escadrille`, `Invitation déjà envoyée`.
