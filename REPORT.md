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
| 3 | Posts (fil d’actualité, J’aime, commentaires) + page profil | **Terminée** (sections 8 et 9) |
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

Résultats à la fin de l'étape 1. Les totaux actuels sont dans la section 10.

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

## 6. Refonte de l'interface

Faite avant l'étape 3, à la demande du projet.

**Thème noir et gris.** Toutes les couleurs sont regroupées dans des variables CSS (`--bg`, `--surface`, `--border`, `--text`, `--muted`, `--accent`…) dans `styles.css`. Les composants n'utilisent plus que ces variables, ce qui permet de changer de palette à un seul endroit.
- Fond quasi noir (`#0d0e10`), cartes et champs en gris anthracite de plus en plus clair.
- Boutons principaux gris clair à texte sombre.
- **Un seul accent ambre** (clin d'œil à la postcombustion), réservé à ce qui est actif : filtre sélectionné, son en cours, lien de menu actif, contour de focus clavier.
- `color-scheme: dark` pour que les contrôles natifs (champs, listes, lecteur audio) suivent le thème.
- L'en-tête et le titre de l'onglet affichent « Afterburner » au lieu de l'ancien nom des TP.

**Fiche véhicule** (`/vehicles/:id`), composée en grille CSS (`grid-template-areas`) :

```
┌──────────────┬───────────────────────┐
│ Photo        │ Catégorie, nom, pays  │
├──────────────┤ Résumé Wikipédia      │
│ Sons         │ Source + licence      │
│ (lecteur +   │                       │
│  liste)      │                       │
└──────────────┴───────────────────────┘
──────────────── séparation ────────────
Publications (photos et vidéos) + filtre
```

- **Lecteur de sons** sous la photo : le premier son de la fiche est préparé dans le lecteur, **sans lecture automatique**. S'il y en a plusieurs, une liste permet de changer. Ce panneau accueillera le lecteur WebAudio des étapes 7 et 8.
- **Publications** dans une section distincte, séparée par un filet. Elles affichent pour l'instant les photos et vidéos rattachées ; elles deviendront les posts de l'étape 3.
- Sur mobile, la grille passe sur une colonne : photo, résumé, sons.

**Backend.** Pour séparer les sons des publications, le filtre `kind` de `GET /api/vehicles/:id/media` accepte maintenant une liste (`image,video`). Chaque valeur est validée, et un test a été ajouté.

**Tests.** Ceux de la page fiche ont été réécrits pour la nouvelle structure :
- présence et position des zones (photo, résumé, sons, publications hors de la fiche) ;
- premier son préparé sans `autoplay` ;
- changement de son ;
- messages « aucun son » et « aucune publication » ;
- 404 ;
- filtre des publications ;
- ouverture d'une vidéo ;
- changement de fiche.

## 7. Refonte d'après les maquettes Figma

Les maquettes (structure générale, catalogue, création de fiche, fiche véhicule) ont été reproduites. Le principe visuel le plus important est le **drapeau du pays d'origine en fondu** derrière chaque véhicule.

### Ce qui a été fait

**Structure.**
- Barre latérale noire : logo, recherche (qui ouvre le catalogue filtré), navigation Accueil / Véhicules / Profil avec l'élément actif surligné en ambre, et carte utilisateur avec initiales, lien vers le profil et déconnexion.
- Fond béton tiré de la maquette (`public/textures/concrete.png`) et police Inter.
- Sans connexion, les pages de connexion et d'inscription s'affichent sur le même fond, sans barre latérale.

**Catalogue (`/vehicles`).**
- Recherche, menu de tri (Popularité, Nom, Plus récents), filtres par catégorie et bouton « Ajouter une fiche ».
- Cartes avec drapeau ondulé, silhouette de la catégorie, rang (#1 à #3 en ambre), catégorie, pays et nombre de médias.
- Quand une recherche ne donne rien, une carte « Aucune fiche pour « X » » apparaît. Elle propose les fiches proches (même premier mot) et la création.

**Création (`/vehicles/new`).** Les états de la maquette sont reproduits :
- saisie du nom ;
- confirmation avec les trois prérequis ;
- recherche en cours (barre de progression, étapes) avec « Annuler » ;
- « La fiche est en ligne ! », avec drapeau, liens « Voir la fiche » et « Ajouter un média » (fiche présélectionnée dans le hangar) ;
- « Création refusée » (422), avec « Modifier le nom ».

Deux états ont été ajoutés en plus de la maquette :
- **« Wikipédia indisponible »** (503), avec « Réessayer » ;
- **« Cette fiche existe déjà »**, quand le serveur répond 200.

**Fiche véhicule (`/vehicles/:id`).**
- Bandeau avec le drapeau, catégorie (« Aviation » / « Blindés »), nom en grand et pastilles.
- Carte Résumé (texte, origine, catégorie, nombre de publications, source).
- Carte Sons : lecteur avec bouton rond ambre et barres qui se colorent pendant la lecture (clic ou flèches pour se déplacer), et liste des sons.
- Publications filtrables (Tout / Sons / Photos / Vidéos), avec vignettes : l'image elle-même, ou la première image de la vidéo grâce à `#t=0.5`. Chaque carte affiche « par <auteur> ».

### L'effet de drapeau

Composant `FlagBackdropComponent` :
1. **Le drapeau vient de Wikidata.** La requête SPARQL de classification récupère aussi, pour chaque pays d'origine, le code ISO (P297) et l'image du drapeau (P41, Wikimedia Commons). Il n'y a ni table de correspondance à maintenir ni service tiers, et les États disparus fonctionnent aussi (T-34 : drapeau de l'URSS, vérifié en conditions réelles). Plusieurs pays (Tigre : Allemagne + France) donnent des drapeaux juxtaposés.
2. **Le tissu qui flotte** :
   - un filtre SVG `feTurbulence` + `feDisplacementMap` ondule légèrement le drapeau ;
   - un léger flou ;
   - un dégradé de bandes claires et sombres en `mix-blend-mode: overlay` simule les plis.
3. **Le fondu** : `mask-image` avec deux dégradés combinés (`mask-composite: intersect`) fait disparaître le drapeau vers la droite et/ou vers le bas, selon le contexte.
4. **Le drapeau sous la photo, visible en entier.** Dans le bandeau d'une fiche, le drapeau garde ses vraies proportions (3:2, ou 2 × 3:2 pour deux pays) et occupe toute la hauteur, à gauche. Son bord droit se fond dans le fond sombre. La photo Wikipédia est placée au-dessus, à droite, sans mélange de couleurs ; seul son bord gauche est fondu (`mask-image`), ce qui la fait apparaître progressivement par-dessus la fin du drapeau. Sans photo, une silhouette de la catégorie (avion, hélicoptère, char, blindé ; SVG dessinés pour le projet) prend la place.

   Une première version fusionnait la photo avec un drapeau pleine largeur (`mix-blend-mode: multiply`). Le drapeau semblait alors posé sur la photo et n'était presque pas visible. Elle a été abandonnée à la demande du projet.

### Backend

- `Vehicle.origins` (`[{ name, code, flagUrl }]`), rempli à la création.
- Script `npm run backfill:origins` : une requête SPARQL par lot de 20 fiches complète celles créées avant.
- Tri du catalogue (`sort`) et `mediaCount`, calculé par `$lookup` dans l'agrégation.
- Listes de médias enrichies avec `owner` (nom seulement) et `url` (lecture signée). Le lecteur et les vignettes n'ont donc plus besoin d'une requête `stream-url` par média.

### Pays introuvable (Mirage 2000)

La fiche « Dassault Mirage 2000 » a été créée sans pays : son élément Wikidata ne renseigne pas « pays d'origine » (P495), seulement « pays » (P17 = France) et le constructeur (P176 = Dassault Aviation). La requête SPARQL prend désormais, dans l'ordre, P495, sinon P17, sinon le pays du constructeur (`COALESCE`), toujours en une seule requête. Vérifié en conditions réelles : Mirage 2000 → France ; Rafale, Tigre (Allemagne + France) et T-34 (URSS) inchangés. Les fiches déjà créées sans pays se complètent avec `npm run backfill:origins`.

### Bug corrigé au passage

`index.html` n'avait pas de `<base href="/">`. En rechargeant une adresse imbriquée (`/vehicles/…`), le navigateur cherchait les scripts au mauvais endroit et la page restait vide. Le problème existait depuis l'étape 2 ; il a été repéré grâce aux captures d'écran.

### Vérification visuelle

Les pages ont été capturées avec Chrome sans interface, piloté par le protocole DevTools, sur un faux backend aux données fixes (la base MongoDB n'a pas été touchée). Ces captures ont servi à ajuster :
- la largeur de la barre latérale ;
- la photo du bandeau, qui masquait le drapeau ;
- le débordement du lecteur dans la carte Sons.

### Écarts assumés avec la maquette

| Élément de la maquette | Choix actuel | Pourquoi |
|---|---|---|
| Popularité en « J'aime » (♡ 2 431) | Nombre de médias publics | Les « J'aime » arrivent avec les posts (étape 3) |
| « Nombre de médias » dans le menu de tri | Fusionné avec Popularité | Même critère tant que les « J'aime » n'existent pas |
| Étapes de recherche en temps réel | Avancent toutes les 0,9 s pendant l'attente | Le serveur fait la recherche en une seule requête ; l'état final (réussite, refus) est toujours celui du serveur |
| Forme d'onde du son | Barres pseudo-aléatoires propres à chaque son | La vraie forme d'onde (WebAudio) est l'étape 7 |
| Page Profil (escadrille, amis en commun, véhicules préférés, fil de posts) | Inchangée | Dépend des posts (étape 3) et des amis (étape 5) |
| Accueil | Mène à « Mon hangar » | Le fil d'activité est l'étape 6 |

### Tests

- **Backend** (+5) :
  - URL de drapeau Commons (HTTPS + largeur, toute autre URL refusée) ;
  - origines avec code ISO et un seul drapeau par pays (y compris un État sans code) ;
  - tri par défaut, tri validé, compteur limité aux médias publics ;
  - URL de lecture valable pour le lecteur et pour ce média uniquement ;
  - auteur limité à son nom.
- **Frontend** (+25, 4 nouveaux fichiers) :
  - `FlagBackdropComponent` : image, filtre d'ondulation, deux drapeaux maximum, fond neutre, fondu, identifiant de filtre unique ;
  - `AudioPlayerComponent` : barres déterministes, format du temps, lecture/pause, progression, déplacement borné, remise à zéro ;
  - `VehicleCreatePageComponent` : chaque état, étapes avec minuteur simulé, 201 / 200 / 422 / 503, annulation qui abandonne la requête HTTP ;
  - `AppComponent` : barre latérale selon la connexion, initiales, recherche ;
  - catalogue et fiche réécrits pour la nouvelle structure ;
  - hangar : présélection `?vehicle=`.

## 8. Étape 3 — Fil d'actualité : posts, J'aime et commentaires

Réalisée d'après la maquette « Accueil ». Périmètre choisi : posts, J'aime et commentaires ; l'escadrille (amis) reste pour l'étape 5.

### Fonctionnalités

- **Accueil = fil d'actualité** (`/feed`, page par défaut). Il contient :
  - la zone « Partagez un son, une photo ou une vidéo… » : texte, boutons Son / Photo / Vidéo qui filtrent le sélecteur de fichiers, fiche véhicule facultative, visibilité, barre de progression ;
  - les posts visibles, du plus récent au plus ancien, avec « Voir les publications plus anciennes ».
- **Carte de post** :
  - auteur (avatar à initiales, couleur stable), date relative (« Il y a 2 h », « Hier à 18:42 ») et visibilité ;
  - texte, lien vers la fiche véhicule, type du média ;
  - média : photo, lecteur audio ou vidéo ;
  - compteurs, puis boutons J'aime, Commenter, Partager ;
  - menu « Supprimer » réservé à l'auteur.
- **J'aime** : bascule optimiste (l'interface change tout de suite et revient en arrière si le serveur refuse) ; cœur plein ambre quand on aime.
- **Commentaires** : ils se déplient sous la carte, se chargent à l'ouverture, et l'ajout met le compteur à jour.
- **Partager** : copie le lien permanent `/posts/:id`, qui ouvre la page d'un post seul.
- **Colonne de droite** :
  - « Véhicules recommandés » : les 4 fiches les plus populaires, avec drapeau et silhouette ;
  - « Posts récents » : derniers posts des autres membres ; heure en ambre s'ils ont moins de 24 h.
- « Mon hangar » reste accessible par un lien en haut du fil, pour gérer ses médias.

### Choix techniques

**Modèles.**
- `Post` : `ownerId`, `text`, `mediaId`, `vehicleId`, `visibility`, `likes[]`, `commentCount`.
- `Comment` : `postId`, `ownerId`, `text`.

**Droits identiques aux médias.** L'auteur du post s'appelle `ownerId`, comme pour les médias. Les posts réutilisent donc tels quels `accessFilter` (déjà vérifié équivalent à `canAccess`) : fil, post seul, J'aime et commentaires appliquent tous le même filtre. Un post invisible répond 404.

**Cohérence post / média.**
- On ne peut joindre qu'un média de son propre hangar.
- Si le média est moins visible que le post (média privé dans un post public), sa visibilité est élargie à la publication ; sinon les lecteurs verraient une carte sans pouvoir lire le fichier.
- Le post hérite de la fiche véhicule du média si aucune n'est précisée.
- Supprimer un post supprime ses commentaires, mais pas le média, qui reste dans le hangar.

**J'aime.**
- Un tableau `likes` avec `$addToSet` / `$pull` : un seul J'aime par personne. `PUT` et `DELETE` sont idempotents.
- La liste n'est jamais envoyée au navigateur : seuls `likeCount` (`$size`) et `likedByMe` (`$in`) sont calculés dans l'agrégation.

**Commentaires.** Le compteur `commentCount` est incrémenté (`$inc`) dans la même requête qui vérifie l'accès au post. Le fil évite ainsi un comptage par carte.

**Médias du fil.** Chaque post reçoit l'URL de lecture signée de son média, comme les autres listes.

**Publication avec fichier.** Le frontend enchaîne deux requêtes avec RxJS (`switchMap`) : upload dans le hangar (avec progression), puis création du post qui le référence. Un post texte seul ne fait qu'une requête.

### Vérification visuelle

Le fil a été capturé avec le faux backend utilisé pour les autres pages, puis comparé à la maquette. Les barres du lecteur ont été affinées après cette comparaison.

### Écarts avec la maquette

| Maquette | Actuel | Pourquoi |
|---|---|---|
| Titre « Les derniers médias de votre escadrille » | Conservé, mais le fil montre les posts publics et les siens | Les amis arrivent à l'étape 5 ; le titre deviendra exact |
| Colonne « Escadrille · posts récents » | « Posts récents » (derniers posts des autres membres) | Idem |
| Visibilité « Escadrille » | Proposée, se comporte comme « Privé » | Idem, comme pour les médias |
| Popularité du catalogue | Toujours le nombre de médias publics | Les J'aime existent maintenant ; les utiliser pour la popularité est une amélioration possible |

### Tests

**Backend** (+14, `test/posts.test.js`) :
- `widest` ;
- pipeline : compteur de J'aime sans exposer la liste, auteur limité à son nom ;
- fil : 401, règle d'accès du lecteur, URL de lecture signée par média, `others=1` ;
- publication :
  - texte ou média obligatoire, visibilité validée ;
  - média d'un autre refusé ;
  - héritage du véhicule et élargissement de la visibilité du média ;
  - auteur issu du JWT ;
- post invisible : 404 ;
- suppression réservée à l'auteur, avec ses commentaires ;
- J'aime et retrait (`$addToSet` / `$pull`, compteur), 404 sur un post invisible ;
- commentaire validé, compteur incrémenté, 404 sur un post invisible.

**Frontend** (+21, 4 nouveaux fichiers) :
- utilitaires de dates relatives, initiales, couleurs, pluriels ;
- `PostCardComponent` : affichage complet, son / vidéo, J'aime optimiste et annulation en cas d'erreur, commentaires, Partager, suppression réservée à l'auteur ;
- `PostComposerComponent` : types par bouton, post texte, post avec fichier (upload puis post), fichier invalide, erreur serveur ;
- `FeedPageComponent` : fil et colonnes, pagination « plus anciennes », ajout et suppression, fil vide.

Corrigé au passage : dans « Mon hangar », la ligne d'aide des tailles chevauchait le bouton « Envoyer ».

## 9. Page profil

Réalisée d'après la maquette « Profil ».

### Fonctionnalités

- `/profile` (son propre profil) et `/users/:id` (un autre membre). Le nom de l'auteur sur chaque carte de post mène à son profil.
- **Bandeau** : drapeau en fondu du pays le plus représenté parmi les véhicules préférés. Le profil n'a pas de champ « pays » : le bandeau reflète les goûts du membre ; à égalité, le premier favori l'emporte.
- **Identité** : avatar à cheval sur le bandeau, nom, ville, « Membre depuis mars 2025 », biographie.
- **Compteurs** : publications (visibles par le lecteur) et véhicules préférés.
- **Véhicules préférés** : cartes avec drapeau, silhouette et « Voir la fiche → ». On ajoute ou retire un favori avec l'étoile du bandeau de chaque fiche véhicule (6 au maximum).
- **Publications** : posts du membre, « Plus récentes en premier », onglets Tout / Sons / Photos / Vidéos, « Voir les publications plus anciennes ».
- **« Modifier le profil »** (sur son propre profil) : nom, ville, biographie.

### Choix techniques

- `User` gagne `bio`, `location` et `favoriteVehicleIds`.
- `GET /api/users/:id` renvoie un profil public **sans email**. Le nombre de publications applique les droits du lecteur : on ne devine pas l'existence de posts privés.
- **Favoris** : l'ajout est une seule requête conditionnelle (`favoriteVehicleIds.5` absent + `$addToSet`). La limite de 6 tient donc même avec deux clics simultanés.
- **Fil filtré** : `GET /api/posts/feed` accepte `author` et `kind`. Le filtre par type s'applique après la jointure du média (`media.kind`), dans le même pipeline que le fil, donc avec les mêmes droits.
- `PUT /api/users/me` ne modifie que les champs envoyés et refuse tout champ qui n'est pas une chaîne.

### Écarts avec la maquette

| Maquette | Actuel | Pourquoi |
|---|---|---|
| Colonne « Amis en commun », compteur d'amis, bouton « Dans votre escadrille » | Absents | Dépendent de l'escadrille (étape 5) |
| Bouton « … » du profil | Remplacé par « Modifier le profil » sur son propre profil | Les actions sur un autre membre (inviter, bloquer) viendront avec l'escadrille |

### Tests

- **Backend** (+8, `test/users.test.js`) :
  - schéma (bornes, favoris) ;
  - profil public sans email, compteur selon les droits du lecteur, favoris dans l'ordre ;
  - 404 pour un profil inconnu ;
  - mise à jour partielle et validée ;
  - ajout de favori conditionné à la limite, 400 quand elle est atteinte, 404 pour un véhicule inconnu ;
  - retrait de favori ;
  - fil filtré par auteur et par type, avec validation.
- **Frontend** (+7) :
  - `bannerOrigin` ;
  - profil d'un autre membre (bandeau, identité, compteurs, favoris) ;
  - son propre profil avec modification ;
  - onglets, pagination, profil inconnu ;
  - lien auteur sur les posts ;
  - étoile des favoris sur la fiche véhicule (ajout, retrait, erreur affichée).

## 10. Résultats actuels des tests

| Suite | Commande | Résultat |
|---|---|---|
| Backend | `cd backend && npm test` | **83 tests, 83 réussis** |
| Frontend | `cd frontend-starter && npm test` | **88 tests, 88 réussis** (17 fichiers) |
| Build | `cd frontend-starter && npx ng build` | OK, sans avertissement |
