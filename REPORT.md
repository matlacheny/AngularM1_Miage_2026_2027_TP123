# Rapport — Mini-projet TP4 : « Afterburner »

## 1. Le projet

**Afterburner** est un réseau social de partage de médias autour de l'aviation militaire et des blindés. Il réunit deux pistes du sujet :

- **le partage multimédia** : sons, photos et vidéos, en public, pour ses amis (« escadrille ») ou en privé, avec des posts sur son profil et un fil d'activité ;
- **la piste audio** : un lecteur WebAudio pour les sons de moteurs (forme d'onde, spectrogramme, vu-mètres, comparaison A/B, effets « radio cockpit »).

Chaque média peut être rattaché à une **fiche véhicule** (Rafale, Leclerc, Tigre…). Un utilisateur crée une fiche si elle n'existe pas encore. Les informations du véhicule sont récupérées automatiquement via Wikipedia, et **la fiche est refusée si l'article ne correspond pas à un véhicule**.

## 2. Découpage

| Étape | Contenu | État |
|---|---|---|
| 1 | Modèle `Media` multi-types (audio/image/vidéo), visibilité, règle d'accès `canAccess`, lecture en streaming (Range) | **Terminée** |
| 2 | Fiches véhicules + enrichissement et validation via Wikipedia/Wikidata | **Terminée** |
| 3 | Posts + page profil (miniature vidéo générée dans le navigateur) | À faire |
| 4 | Recherche avec filtres + « derniers ajouts » | À faire |
| 5 | Escadrille (amis) + partage ciblé révocable | À faire |
| 6 | Fil d'activité de l'escadrille | À faire |
| 7 | Lecteur WebAudio : forme d'onde, spectrogramme, vu-mètres | À faire |
| 8 | Effets audio + comparaison A/B de deux moteurs | À faire |

Ce rapport est complété à la fin de chaque étape.

## 3. Étape 1 — Médias, visibilité et streaming

### Fonctionnalités implémentées

- Upload d'un **son, d'une photo ou d'une vidéo** avec un titre et une visibilité (`private` par défaut, `friends`, `public`).
- Page **« Mon hangar »** (`/hangar`) :
  - liste paginée de mes médias, avec un filtre Tous / Sons / Photos / Vidéos ;
  - lecture dans la balise adaptée (`<img>`, `<video>`, `<audio>`) ;
  - changement de visibilité directement sur la carte ;
  - suppression avec confirmation ;
  - barre de progression pendant l'upload.
- Nouvelles routes `/api/media`, documentées dans `API_CONTRACT.md`. Les routes `/api/tracks` existantes n'ont pas été modifiées pendant cette étape ; elles ont été retirées ensuite (voir « Retrait des pistes »).

### Choix techniques

**Un nouveau modèle `Media` plutôt que de modifier `Track`.**
Les pistes existantes, leurs tests et la page « Backing tracks » continuent de fonctionner. La catégorie (`kind`) est **déduite du type MIME par le serveur**, jamais fournie par le client.

**Limites de taille par catégorie** : 25 Mo pour un son, 10 Mo pour une photo, 100 Mo pour une vidéo.
Multer ne connaît qu'une seule limite (`limits.fileSize`). Elle est donc fixée à la plus grande (100 Mo), et la limite propre à chaque catégorie est vérifiée juste après la réception du fichier. Si elle est dépassée, le fichier est supprimé du disque et la requête répond 400. Les mêmes règles existent côté Angular (`validateMediaFile`), mais uniquement pour le confort de l'utilisateur : c'est le backend qui fait autorité.

**Une seule règle d'accès : `canAccess(viewerId, media, friendIds)`** (`backend/src/access.js`).
C'est une fonction pure, testée unitairement. Toutes les lectures (métadonnées, URL de lecture, fichier) passent par elle :
- le propriétaire voit toujours son média ;
- un partage explicite (`sharedWith`) ouvre l'accès ;
- `public` est visible par tout utilisateur connecté ;
- `friends` exige que le propriétaire soit un ami du lecteur ;
- dans tous les autres cas, l'accès est refusé.

En attendant l'étape 5, la liste d'amis est vide, donc `friends` se comporte comme `private`. C'est le choix sûr par défaut. Un média non accessible répond **404 et non 403**, pour ne pas révéler qu'un média privé existe.

**Lecture vidéo : URL signée + requêtes Range.**
Les balises `<video>`, `<audio>` et `<img>` ne peuvent pas envoyer l'en-tête `Authorization`. L'approche de la page tracks (télécharger le fichier en Blob puis le lire) obligerait à charger une vidéo de 100 Mo en entier avant de pouvoir la lire et s'y déplacer. La solution retenue fonctionne en deux temps :
1. `POST /api/media/:id/stream-url` (authentifié) renvoie une URL `/api/media/:id/file?token=…`. Ce jeton de lecture expire au bout de 10 minutes et est **limité à ce média** (`mid`) et à la seule lecture du fichier (`scope: "stream"`).
2. Le middleware `auth` **refuse** tout jeton qui porte un `scope`. Un jeton de lecture qui fuiterait ne donne donc pas accès au reste de l'API. Inversement, un JWT de session passé dans l'URL est refusé par la route de lecture.
3. `res.sendFile` gère nativement l'en-tête `Range` : il répond `206 Partial Content` avec `Content-Range`. Le navigateur lit donc la vidéo progressivement et peut sauter à n'importe quel moment.
4. Les droits sont **revérifiés à chaque requête**. Repasser un média en privé coupe immédiatement l'accès, même avec une URL déjà distribuée.
5. Le logger HTTP masque le paramètre `token` (`redactUrl`), parce qu'un jeton écrit dans les logs permettrait de lire le média.

**Petite refactorisation du backend.**
`auth`, `token` et le secret JWT ont été déplacés dans `src/auth.js`, et le dossier d'uploads dans `src/uploads.js`. Ils sont ainsi partagés entre `app.js` et le nouveau routeur `src/routes/media.js` sans import circulaire. Le gestionnaire d'erreurs central reconnaît maintenant les erreurs qui portent leur propre code HTTP (`HttpError`).

**Stockage.** Les fichiers restent sur le disque du serveur (`backend/data/uploads`), comme dans les TP précédents. Avec des vidéos, ce dossier grossit vite. En production, on utiliserait un stockage objet (S3 ou équivalent) avec des URL pré-signées, ce qui correspond exactement au mécanisme `stream-url` mis en place ici.

### Fichiers

| Backend | Frontend |
|---|---|
| `src/models/Media.js` (nouveau) | `shared/models/media.model.ts` (nouveau) |
| `src/access.js` (nouveau) | `shared/services/media.service.ts` (nouveau) |
| `src/auth.js` (nouveau, extrait de `app.js`) | `components/hangar-page/*` (nouveau) |
| `src/uploads.js` (nouveau, extrait de `app.js`) | `routes.ts`, `components/app/app.html` (route + lien) |
| `src/routes/media.js` (nouveau) | |
| `src/app.js` (imports, montage du routeur, logs, erreurs) | |

### Tests

Résultats à la fin de l'étape 1. Les totaux actuels sont dans la section 6.

**Backend** (`cd backend && npm test`, Node test runner, sans MongoDB : le modèle est remplacé par des doublures) : **38 tests, 38 réussis**. Il y avait 11 tests existants et 27 nouveaux dans `test/media.test.js` :
- `canAccess` : propriétaire, public, privé, `friends` avec et sans ami, partage explicite, entrées manquantes ;
- catégorie déduite du MIME, limites par catégorie, visibilité `private` par défaut et valeur invalide refusée par le schéma ;
- masquage du jeton dans les logs ;
- 401 sans JWT ; jeton de lecture refusé sur `/api/media` et `/api/tracks` ;
- upload :
  - 400 sans fichier ;
  - 400 pour un type refusé ;
  - 400 pour une photo de plus de 10 Mo, **avec vérification que le fichier a bien été supprimé du disque** ;
  - 400 pour une visibilité invalide (fichier supprimé lui aussi) ;
  - 201 avec la catégorie déduite et le propriétaire issu du JWT, même quand le client tente d'envoyer un autre `ownerId` ;
- métadonnées : 404 pour le média privé d'un autre utilisateur, 200 pour un média public (sans `storedName`), 404 pour un identifiant mal formé ;
- liste filtrée sur le propriétaire du JWT, filtre `kind` validé ;
- PATCH et DELETE limités au propriétaire ;
- **streaming** :
  - fichier complet en 200 avec `Accept-Ranges`, puis `Range: bytes=2-5` en **206** avec `Content-Range: bytes 2-5/10` ;
  - jeton refusé sur un autre média ;
  - JWT de session refusé dans l'URL ;
  - média repassé en privé : 404 même avec un jeton encore valide.

**Frontend** (`cd frontend-starter && npm test`, Vitest) : **26 tests, 26 réussis** (7 fichiers), dont 11 nouveaux :
- `validateMediaFile` : formats acceptés et refusés, limite propre à chaque catégorie ;
- `HangarPageComponent` :
  - chargement de la liste ;
  - filtre `kind` qui repart à la page 1 ;
  - fichier invalide refusé sans appel HTTP ;
  - upload (contenu du FormData, progression, double clic ignoré, rechargement) ;
  - erreur serveur affichée ;
  - URL signée placée dans `<video src>` ;
  - changement de visibilité par PATCH ;
  - suppression confirmée.

`ng build` passe sans erreur.

## 4. Retrait des pistes (« Backing tracks »)

À la demande du projet, l'ancienne fonctionnalité des TP1 à TP3 a été retirée, puisque `/api/media` la remplace entièrement :

- **Backend** : routes `/api/tracks` supprimées, ainsi que le modèle `Track`, la recherche de pochette iTunes (`findCoverUrl`) et la dépendance `music-metadata` qui ne servait qu'à elle. `app.js` ne contient plus que l'authentification, le profil et le montage des routeurs.
- **Frontend** : page `tracks-page`, `TrackService` et `track.model` supprimés. La route par défaut et la redirection après connexion mènent maintenant à `/hangar`. Les classes CSS `track-card` sont renommées `media-card`.
- **Tests** : `contract.test.js` vérifie désormais l'authentification JWT sur `/api/media`, et que `/api/tracks` répond 404. Les tests propres aux pistes ont été supprimés ; leurs équivalents existent pour les médias.
- **Données existantes** : les documents `tracks` déjà présents dans MongoDB et leurs fichiers dans `backend/data/uploads` ne sont ni migrés ni supprimés. Ils ne sont simplement plus accessibles par l'API.

## 5. Étape 2 — Fiches véhicules validées par Wikipédia

### Fonctionnalités implémentées

- Page **« Véhicules »** (`/vehicles`) :
  - catalogue des fiches avec image, catégorie et pays ;
  - recherche par nom et filtre Avions / Hélicoptères / Chars / Blindés ;
  - formulaire « Ajouter une fiche ».
- Page **fiche** (`/vehicles/:id`) :
  - photo, catégorie, pays d'origine et résumé, avec la source Wikipédia et la licence CC BY-SA ;
  - sons, photos et vidéos rattachés, filtrables par type et lisibles sur place.
- **Rattachement d'un média à une fiche** depuis « Mon hangar » : un sélecteur propose les fiches existantes au fil de la frappe et, sinon, un bouton « Trouver « … » sur Wikipédia ». Chaque carte de média affiche un lien vers sa fiche.
- **Création contrôlée** : si un nom ne correspond pas à un véhicule (« Paris », « Renault Rafale »…), la fiche est refusée avec un message explicite.

### Choix techniques

**Comment savoir si un article est un véhicule ?**
Chercher des mots-clés dans le résumé serait fragile. On utilise plutôt **Wikidata**, la base structurée derrière Wikipédia, où chaque type de véhicule est rangé dans une hiérarchie (« sous-classe de », propriété P279). Par exemple : Dassault Rafale → avion de combat polyvalent → … → aéronef.

1. Recherche Wikipédia FR : 10 meilleurs articles, avec résumé, image et identifiant Wikidata, **en une seule requête**.
2. Une seule requête **SPARQL** sur Wikidata vérifie, pour ces 10 identifiants, lesquels descendent (`wdt:P279+`) d'une des quatre familles : hélicoptère (Q34486), aéronef (Q11436), char (Q12876), véhicule blindé de combat (Q1184840). La même requête récupère les pays d'origine (P495).
3. On garde le **premier résultat de recherche qui est un véhicule**. « Leclerc » renvoie d'abord l'hypermarché et le général, puis le char, qui est retenu.
4. Un hélicoptère est aussi un aéronef, et un char aussi un blindé : on retient la catégorie la plus précise.

Ces identifiants ont été **vérifiés en conditions réelles** :

| Saisie | Résultat |
|---|---|
| Leclerc | Char Leclerc, char |
| Tigre | Eurocopter EC665 Tigre, hélicoptère |
| VBCI | Véhicule blindé de combat d'infanterie, blindé |
| AMX-10 RC | Blindé |
| Rafale | Dassault Rafale, avion |
| Paris | Refusé |

Avec 5 candidats seulement, « Tigre » était refusé (seul l'animal apparaissait). On est donc passé à 10, ce qui ne coûte aucune requête supplémentaire.

**Sécurité de la requête SPARQL.** Les identifiants insérés dans la requête sont filtrés par l'expression `^Q\d+$`, ce qui empêche toute injection. Un test le vérifie.

**Pas de doublons, et peu d'appels à Wikipédia.**
- Chaque fiche correspond à un élément Wikidata unique (index unique sur `wikidataId`).
- Chaque nom saisi est mémorisé sous forme normalisée (minuscules, sans accents) dans `aliases`. Ressaisir « rafale » sert la fiche immédiatement, sans appel externe.
- Saisir « Dassault Rafale » après « Rafale » renvoie la même fiche et ajoute l'alias.
- Si deux créations simultanées du même véhicule arrivent, l'index unique n'en garde qu'une ; l'autre requête renvoie la fiche gagnante.

**Wikipédia indisponible.**
Pendant le développement, Wikimedia a effectivement limité nos requêtes (« You are making too many requests »). Le backend distingue donc deux cas :
- **422** : on sait que ce n'est pas un véhicule ;
- **503** : Wikipédia ne répond pas (réseau, délai de 8 s, limitation de débit), donc on ne sait pas. Dans ce cas, **rien n'est créé** et l'utilisateur peut réessayer.

Un `User-Agent` identifiable est envoyé, comme l'exige Wikimedia ; il est configurable via `WIKI_USER_AGENT`.

**Les données viennent du serveur, pas du client.** Le nom, la catégorie, les pays et l'image viennent de Wikidata/Wikipédia. Un client qui enverrait `category: "tank"` ou un autre `createdBy` est ignoré, et un test le vérifie.

**Règle d'accès en liste.** La page d'une fiche liste des médias de plusieurs propriétaires. La règle `canAccess` (JavaScript, un seul document) a donc été traduite en filtre MongoDB `accessFilter`. Pour garantir que les deux disent toujours la même chose, un test les compare sur les 18 combinaisons possibles (3 propriétaires × 3 visibilités × partagé ou non).

**Tests sans réseau.** Les fonctions de `wikipedia.js` reçoivent `fetch` en paramètre et sont testées avec un faux `fetch`. Les routes utilisent `wikipedia.resolveVehicle`, remplacé par une doublure. `npm test` n'appelle donc jamais Wikimedia.

**Frontend.**
- `withComponentInputBinding()` transmet le `:id` de la route à un `input()` de la page fiche. Un `effect` recharge la fiche quand on passe d'un véhicule à un autre.
- Le lecteur de média est extrait dans un composant partagé, `MediaViewerComponent`, utilisé par le hangar et par les fiches.
- Le sélecteur de véhicule est un composant autonome, utilisé avec `[(selected)]` grâce à `model()`.

### Fichiers

| Backend | Frontend |
|---|---|
| `src/wikipedia.js` (nouveau) | `shared/models/vehicle.model.ts`, `shared/services/vehicle.service.ts` (nouveaux) |
| `src/models/Vehicle.js` (nouveau) | `components/vehicles-page/*`, `components/vehicle-page/*` (nouveaux) |
| `src/routes/vehicles.js` (nouveau) | `components/vehicle-picker/*`, `components/media-viewer/*` (nouveaux) |
| `src/models/Media.js` (`vehicleId`, pipeline de liste commun) | `components/hangar-page/*` (sélecteur, lien vers la fiche) |
| `src/routes/media.js` (`vehicleId` à l'upload et en PATCH) | `shared/models/media.model.ts`, `shared/services/media.service.ts` (`vehicle`) |
| `src/access.js` (`accessFilter`) | `routes.ts`, `main.ts`, `app.html`, `styles.css` |

### Tests de l'étape 2

**Backend** : 20 nouveaux tests dans `test/vehicles.test.js` :
- `normalizeName` ;
- recherche Wikipédia (ordre de pertinence, pages sans Wikidata ignorées, `User-Agent` envoyé) ;
- requête SPARQL protégée contre l'injection ;
- classification (catégorie la plus précise, pays regroupés) ;
- résolution « Leclerc » → char ; aucun véhicule → `null` ; réseau en échec ou 429 → `WikiUnavailableError` ;
- concordance `accessFilter` / `canAccess` ;
- `POST /api/vehicles` :
  - 401 et 400 ;
  - nom déjà saisi servi sans appeler Wikipédia ;
  - 422 et 503 sans aucune création ;
  - fiche existante retrouvée avec ajout de l'alias ;
  - 201 avec catégorie et créateur imposés par le serveur ;
- `GET /api/vehicles` : regex échappée, catégorie validée ;
- `GET /api/vehicles/:id` : 404 ;
- `GET /api/vehicles/:id/media` : filtre fiche + règle d'accès du lecteur ;
- upload avec un véhicule inconnu : 400, et le fichier est supprimé du disque ;
- PATCH `vehicleId: null` ;
- `toPublic` avec et sans véhicule.

Les tests d'upload de `media.test.js` et `vehicles.test.js` utilisent chacun leur propre extension de fichier. Sans cela, les fichiers de test, exécutés en parallèle par `node --test`, se gênaient en observant le même dossier d'uploads ; la suite a ensuite été lancée trois fois de suite sans échec.

**Frontend** : 15 nouveaux tests :
- `VehiclePickerComponent` : pas de recherche sous 2 caractères, suggestions puis choix, création par POST avec double clic ignoré, refus 422 affiché, `clear()` ;
- `VehiclesPageComponent` : liens vers les fiches, filtre catégorie, création puis navigation, 503 affiché ;
- `VehiclePageComponent` : fiche et médias affichés avec la source Wikipédia, 404, filtre par type, ouverture d'une vidéo signée, rechargement lors d'un changement de fiche ;
- `HangarPageComponent` : `vehicleId` envoyé à l'upload et lien vers la fiche sur la carte.

## 6. Résultats actuels des tests

| Suite | Commande | Résultat |
|---|---|---|
| Backend | `cd backend && npm test` | **54 tests, 54 réussis** |
| Frontend | `cd frontend-starter && npm test` | **32 tests, 32 réussis** (8 fichiers) |
| Build | `cd frontend-starter && npx ng build` | OK, sans avertissement |
