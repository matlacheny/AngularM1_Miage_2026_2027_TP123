# Rapport d'usage de l'IA - TP2

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

Assistant utilisé pour cette entrée : Claude Sonnet 5 (`claude-sonnet-5`), dans l'extension VS Code de Claude Code.

## Mission 2 — Bibliothèque paginée

**Objectif** : implémenter/vérifier la bibliothèque paginée côté frontend — `TrackService.list(page, limit)` transmettant réellement `page` et `limit` au backend, Signals (`tracks`, `page`, `pages`, `loading`, erreur éventuelle), affichage avec `@for`/`@empty`/`@if`, boutons « Précédent »/« Suivant » désactivés aux bornes, et une nouvelle requête HTTP à chaque changement de page (pas de découpage local des données déjà chargées).

> **Mise à jour ultérieure** : la pagination `.skip()`/`.limit()`/`.countDocuments()` décrite dans cette section a depuis été **remplacée** côté backend par le plugin `mongoose-aggregate-paginate-v2` (option AVANCÉ de l'énoncé — voir la section « AVANCÉ » en fin de rapport). Le format de la réponse a changé (`docs`/`totalPages`/... au lieu de `items`/`pages`), mais tout ce qui est décrit ici au niveau du composant (Signals `tracks`/`page`/`pages`/`loading`/`error`, `@for`/`@empty`/`@if`, boutons désactivés aux bornes, une requête HTTP par changement de page) reste vrai et inchangé : seule la traduction de la réponse HTTP vers ces Signals, dans `load()`, a été adaptée au nouveau format.

**Échanges avec l'agent** *(dans l'ordre réel de la conversation)* :
1. « Commence à intégrer la mission 1 du fichier markdown, écrit tout tes changements dans un markdown rapport_ia_tp2.md » → l'agent lit `SUJET_ETUDIANT_TP2.md` en entier et constate qu'il n'y a pas de section « Mission 1 » dans ce fichier : la numérotation des missions est continue depuis `SUJET_ETUDIANT_TP1.md` (Mission 0 « Cartographier » et Mission 1 « Inscription Connexion et Profil » y figurent), donc TP2 commence directement à « Mission 2 — Bibliothèque paginée ». Plutôt que de deviner entre « la vraie Mission 1 (auth, dans TP1) » et « la première mission du fichier TP2 ouvert (Mission 2, pagination) », l'agent pose une question de clarification, les deux lectures menant à un travail très différent.
2. Réponse du binôme : « Mission 2 de TP2 (pagination) » → l'agent explore l'existant avant de modifier quoi que ce soit : `TrackService` (`frontend-starter/src/app/shared/services/track.service.ts`), `TracksPageComponent` (`.ts` et `.html`), `page.model.ts`, et la section pagination d'`API_CONTRACT.md`.
3. Constat de l'exploration : l'essentiel de la Mission 2 était déjà implémenté dans le starter — `TrackService.list(page, limit)` transmet bien les deux paramètres au backend, le composant expose déjà les Signals `tracks`, `page`, `pages`, `loading`, le template utilise déjà `@if`/`@for`/`@empty`, les boutons Précédent/Suivant sont déjà désactivés aux bornes (`page() === 1`, `page() === pages()`), et chaque changement de page redéclenche bien une requête HTTP via `go() → load()` (aucune récupération globale suivie d'un découpage local). Seuls deux manques réels par rapport à l'énoncé ont été identifiés : (a) le Signal « erreur éventuelle » explicitement demandé n'existait pas — les échecs de chargement n'étaient que loggués en console, sans retour visible pour l'utilisateur ; (b) `go(page)` ne validait pas les bornes côté client (un appel direct avec une page hors intervalle aurait déclenché une requête inutile/invalide).
4. L'agent implémente uniquement ces deux manques, sans toucher au reste du code ni au contrat HTTP (conforme à la consigne de `SUJET_ETUDIANT_TP2.md` : « le backend fournit déjà les endpoints nécessaires : ne le modifiez pas »).
5. Vérification : `npx tsc --noEmit -p tsconfig.json` (aucune erreur de type), puis `npm run build` (build Angular complet, voir preuve ci-dessous).
6. « pourquoi `go()` doit revalider les bornes côté client même si les boutons sont déjà désactivés dans le template » → question de compréhension sur le garde-fou ajouté à `go(page)` :
> Le `[disabled]` du template n'empêche que le clic sur ces deux boutons précis ; `go()` reste une méthode publique appelable autrement (futur Paginator Material, raccourci clavier, double-clic pendant que `loading()` est vrai et que le bouton n'a pas encore été redésactivé, ou simplement retrait du `disabled` via les DevTools). Le template ne garantit jamais l'intégrité de l'état — seule la logique dans la classe le peut ; la désactivation UI n'est que du confort (évite un aller-retour réseau inutile), la garde dans `go()` est la vraie garantie, indépendante du DOM.
7. « pourquoi la pagination doit rester côté serveur — `?page=&limit=` — plutôt que de charger toute la collection puis la découper dans Angular » → question sur la contrainte explicite de l'énoncé (`SUJET_ETUDIANT_TP2.md:44`) :
> Charger toute la collection pour n'en afficher qu'une page gonflerait inutilement le volume transféré (visible dans Network), la mémoire du Signal `tracks` côté navigateur, et la charge de la requête MongoDB (qui ne devrait remonter que les documents nécessaires via `.skip()`/`.limit()` ou `aggregate-paginate-v2`). Ça casserait aussi la cohérence multi-utilisateur : un découpage local fige un instantané, alors que changer de page avec la pagination serveur interroge la base à jour. C'est un chargement complet avec tout son coût, sans aucun des bénéfices d'une vraie pagination — d'où l'interdiction explicite du sujet.

**Plan proposé par l'agent** :
1. Lire `SUJET_ETUDIANT_TP2.md` en entier avant de coder, pour identifier précisément la mission demandée (et lever l'ambiguïté « Mission 1 » avec le binôme plutôt que de supposer).
2. Comparer la checklist de la Mission 2 au code déjà présent dans `frontend-starter` plutôt que de le réécrire.
3. N'ajouter que ce qui manque réellement : Signal d'erreur + affichage, garde-fou de bornes dans `go()`.
4. Vérifier la compilation (`tsc --noEmit`) puis le build Angular complet (`ng build`).

**Détail des ajouts** :
- `TracksPageComponent.error` : nouveau `signal('')`, réinitialisé au début de `load()`, rempli avec le message d'erreur du backend (`error.error?.message`) ou un message générique en cas d'échec HTTP, et remis à l'écran via `loading.set(false)`.
- `TracksPageComponent.go(page)` : ignore désormais les appels avec `page < 1` ou `page > pages()` (garde-fou redondant avec la désactivation des boutons dans le template, utile si `go()` était appelé autrement, ex. clavier ou futur Paginator Material).
- `tracks-page.html` : bloc `@if (error()) { <p class="error" role="alert">{{ error() }}</p> }` ajouté entre l'indicateur de chargement et la liste des pistes. La classe `.error` existait déjà globalement dans `styles.css` (réutilisée par login/register/profile-page), donc aucun CSS supplémentaire n'a été nécessaire.

**Erreurs ou propositions rejetées** : aucune — l'agent n'a pas eu à corriger d'erreur de compilation ni à revenir sur une proposition. Le seul point d'attention a été de ne pas réécrire ce qui fonctionnait déjà (transmission `page`/`limit`, Signals existants, template `@for`/`@empty`, désactivation des boutons), pour rester dans le périmètre réel de ce qui manquait.

**Vérifications réalisées par le binôme/l'agent** :
- `npx tsc --noEmit -p tsconfig.json` : aucune erreur.
- `npm run build` dans `frontend-starter/` : build réussi.

```
> gpc-angular-starter@1.0.0 build
> ng build

Application bundle generation complete. [2.066 seconds]
main.js  294.17 kB (raw)  |  77.82 kB (transfert estimé)
styles.css  1.28 kB (raw)  |  493 bytes (transfert estimé)
Output location: frontend-starter/dist/gpc
```

**Fichiers effectivement modifiés** :
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts`
- `frontend-starter/src/app/components/tracks-page/tracks-page.html`
- `rapport_ia_tp2.md` (ce fichier, nouveau)

**Preuve de fonctionnement** : build Angular ci-dessus (compilation complète sans erreur, aucune régression sur les Signals/templates existants). À compléter par le binôme, conformément aux livrables de `SUJET_ETUDIANT_TP2.md` :
- capture DevTools → Network montrant qu'un clic sur « Suivant »/« Précédent » modifie bien le paramètre `page` (et `limit`) de la requête `GET /api/tracks` ;
- capture ou test montrant le message d'erreur affiché (par ex. backend arrêté, ou requête `GET /api/tracks` renvoyant une erreur) ;
- vérification qu'aucune page « fantôme » ne peut être demandée (boutons désactivés en page 1 et en dernière page).

**Reste à traiter pour cette mission (non couvert ici)** :
- AVANCÉ — Paginator Angular Material (facultatif) ;
- AVANCÉ — pagination Mongoose via `aggregate-paginate-v2` (facultatif ; implique de modifier le backend, `API_CONTRACT.md` et le frontend en conséquence — hors périmètre de cette session, qui ne devait pas toucher au contrat HTTP) ;
- Mission 3 — upload/lecture audio (cards, validations frontend, indicateurs de chargement à l'upload, révocation de l'`ObjectURL` à la destruction du composant) : non traitée dans cette session.

**Ce que chaque membre sait maintenant expliquer sans l'agent** : Les boutons désactivés ne sont pas la seule porte d'entrée vers go(). Le [disabled] dans le template n'empêche que le clic sur ces deux boutons précis. Mais go(page: number) est une méthode publique de la classe — rien n'empêche qu'elle soit appelée autrement. découper côté client donnerait le même résultat visuel mais avec le pire des deux mondes — tout le coût réseau/mémoire/DB d'un chargement complet, sans aucun des avantages d'une vraie pagination.

---

## Mission 3 — Analyse et amélioration de l'upload et de la lecture audio

**Objectif** : analyser le mécanisme d'upload/lecture déjà fourni (composant → service → `HttpClient` → API, puis API → `Blob` → `ObjectURL` → lecteur), identifier les contrôles déjà faits côté backend, puis ne compléter que ce qui manque côté frontend : validations avant l'appel HTTP, retours visuels pendant l'envoi (chargement/erreur/succès), cards de présentation accessibles, affichage du morceau en cours, erreur de lecture compréhensible, et révocation de l'`ObjectURL` à la destruction du composant.

**Prompt principal** : « Commence l'intégration de la mission 3 maintenant en expliquant tes choix et en mettant bien à jour le rapport. »

### Analyse du flux existant (avant toute modification)

**Upload — composant → service → HttpClient → API** :
- Choix du fichier : `tracks-page.html` (`<input type="file" (change)="choose($event)">`) → `TracksPageComponent.choose()`.
- Construction du `FormData` : `TrackService.upload()` (`frontend-starter/src/app/shared/services/track.service.ts:17-22`) — `body.append('audio', file); body.append('title', title)`.
- Appel HTTP d'upload : même méthode, `this.http.post<Track>('/api/tracks', body)`. Aucun header `Content-Type` n'est fixé manuellement : le navigateur le fait lui-même avec le `boundary` multipart, ce que `HttpClient` respecte en laissant passer un `FormData` tel quel.

**Lecture — API → Blob → ObjectURL → lecteur** :
- Récupération du `Blob` : `TrackService.audio(id)` (`track.service.ts:24-28`) — `this.http.get(..., { responseType: 'blob' })`.
- Création de l'`ObjectURL` et affectation au lecteur : `TracksPageComponent.play()` — `URL.createObjectURL(blob)` puis `this.audioUrl.set(...)`, le template lie `<audio [src]="audioUrl()">`.
- Révocation de l'ancienne URL : déjà faite dans `play()` (`if (previousUrl) URL.revokeObjectURL(previousUrl)`) quand on change de piste — mais **pas** à la destruction du composant (ex. navigation vers une autre page) avant cette mission : c'est l'un des deux manques identifiés dans le mécanisme de lecture.

**Intercepteur JWT sur la requête audio** : `authInterceptor` (`shared/interceptors/auth.interceptor.ts`) est enregistré dans `provideHttpClient(withInterceptors([...]))` (`main.ts`) et s'exécute sur **toute** requête passant par `HttpClient` — y compris `GET /api/tracks/:id/audio` déclenché par `TrackService.audio()`. Il lit `AuthService.token()` et clone la requête en ajoutant `Authorization: Bearer <token>` avant qu'elle ne parte.

**Pourquoi une URL directement placée dans `src` ne reçoit pas ce header** : un `<audio src="/api/tracks/xxx/audio">` déclenche un chargement de ressource fait par le moteur du navigateur lui-même (comme `<img src>`), pas par `HttpClient`. Cette requête ne passe donc jamais par le pipeline d'intercepteurs Angular — `authInterceptor` ne la voit jamais — et il n'existe aucune API HTML standard pour attacher un header `Authorization` personnalisé à un attribut `src`. C'est précisément pour ça que le code récupère l'audio en `Blob` via `HttpClient` (qui, lui, passe par les intercepteurs) puis le convertit en `ObjectURL` — une URL `blob:` locale au navigateur que `<audio>` peut lire sans aucune requête réseau ni header supplémentaire.

### Contrôles déjà faits par le backend (identifiés, non dupliqués)

Dans `backend/src/app.js`, route `POST /api/tracks` (334-376) :
- présence du fichier : `upload.single("audio")` (Multer) place le fichier dans `req.file` ; s'il est absent, `if (!req.file) return res.status(400).json({ message: "Fichier audio requis" })` (ligne 340-343) ;
- lecture du titre : `req.body.title || req.file.originalname` (ligne 347) — champ facultatif, retombe sur le nom de fichier ;
- formats acceptés : `fileFilter` (lignes 109-120) compare `file.mimetype` à l'ensemble `allowed` (ligne 34-41 : `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`) et rejette avec une vraie `Error` sinon ;
- taille maximale : `limits: { fileSize: MAX_FILE_SIZE }` (25 Mo, lignes 31 et 106-108) — Multer refuse le fichier avant qu'il ne soit intégralement écrit sur disque ;
- ces deux derniers rejets remontent en `400` via le gestionnaire d'erreurs central (`multer.MulterError` ou message `"Format audio non accepté"`, lignes 445-450).

Vérification côté frontend : `TrackService.upload()` construit bien le `FormData` avec exactement les clés `audio` et `title` (aucun autre nom de champ), conforme au contrat.

### Manques identifiés et complétés (uniquement ceux-ci, rien de backend touché)

1. **Validations frontend avant l'appel HTTP** : `TracksPageComponent.choose()` vérifie désormais `selected.type` contre `ALLOWED_AUDIO_TYPES` et `selected.size` contre `MAX_AUDIO_SIZE` (nouvelles constantes ajoutées dans `shared/models/track.model.ts`, qui reproduisent *exactement* la liste et la limite du backend, avec un commentaire renvoyant vers `backend/src/app.js`). En cas d'échec, un message clair est affiché (`uploadError`) et le fichier est rejeté (`this.file` reste `undefined`, input réinitialisé) **avant** tout appel à `TrackService.upload()`.
2. **États pendant l'envoi** : nouveaux Signals `uploading`, `uploadError`, `uploadSuccess`. Le bouton « Envoyer » est désactivé et affiche « Envoi… » pendant la requête (`[disabled]="!file || uploading()"`), et `upload()` retourne immédiatement si `uploading()` est déjà vrai (double garde-fou, même logique que celle déjà argumentée pour `go()` en Mission 2 : le `[disabled]` du template n'est qu'un confort UX, la vraie garantie est dans la classe).
3. **Erreurs serveur affichées** : le `subscribe({ error })` de `upload()` remplit désormais `uploadError` avec `error.error?.message` du backend (ou un message générique), au lieu de seulement logger en console.
4. **Message de succès** : `uploadSuccess` affiché après un upload réussi, avant le vidage du formulaire.
5. **Vidage du formulaire** : en plus de la remise à zéro déjà existante (`title`, `this.file`, retour page 1, rechargement), l'input `<input type="file">` est maintenant réellement vidé visuellement via une référence de vue (`viewChild<ElementRef<HTMLInputElement>>('fileInputRef')`), sinon le nom du fichier précédent restait affiché dans le champ natif malgré la remise à zéro interne.
6. **Cards responsives/accessibles** : la liste `.track` (une ligne texte) est remplacée par une grille de `.track-card` (`display:grid; repeat(auto-fill, minmax(220px,1fr))`) affichant titre, nom original, format (`formatType(mimeType)` → « MP3 »/« WAV »/... plutôt que le MIME brut), taille lisible (`formatSize` — la version précédente affichait `{{ track.size }} Ko` alors que `size` est en **octets** côté backend/modèle : l'ancien affichage était donc faux d'un facteur 1024 ; corrigé avec un vrai formatage o/Ko/Mo) et date d'ajout (`formatDate`, `toLocaleDateString('fr-FR')`). Les métadonnées sont dans une `<dl>` (paires terme/valeur), sémantiquement correcte pour ce contenu, et le bouton de lecture garde son `aria-label` dynamique déjà présent.
7. **Morceau en cours** : nouveau Signal `playingTrack`, affiché (« Lecture en cours : *titre* ») au-dessus du lecteur, et la card correspondante reçoit la classe `.playing` (bordure/fond distincts) pour un repère visuel.
8. **Erreur de lecture compréhensible** : nouveau Signal `audioError`, rempli soit par l'échec de la requête `TrackService.audio()` (ex. 404 piste inconnue/pas propriétaire, 401 session expirée), soit par l'événement natif `(error)` de l'élément `<audio>` (`onAudioError()`) qui couvre les échecs *après* le chargement du Blob (ex. décodage impossible).
9. **Révocation finale de l'`ObjectURL`** : nouveau `ngOnDestroy()` (le composant implémente désormais `OnDestroy`) qui révoque `audioUrl()` s'il existe, pour ne pas fuiter la dernière URL active quand l'utilisateur quitte la page (Angular ne le fait jamais automatiquement).

**Ce qui n'a pas été touché** : la construction du `FormData`, l'appel `HttpClient.post`/`.get`, la récupération du `Blob`, la logique de pagination (Mission 2), le contrat HTTP, et tout le code backend — conformément à la consigne « Ne réimplémentez pas ce qui existe déjà et ne modifiez pas le contrat HTTP » de `SUJET_ETUDIANT_TP2.md`.

### Réponses aux questions mémoire, buffering et streaming

- **Le backend envoie-t-il le fichier entier en mémoire, ou progressivement depuis le disque ?** `GET /api/tracks/:id/audio` utilise `res.sendFile(audioPath, callback)` (`app.js:379-406`), qui s'appuie sur la librairie `send` d'Express : le fichier est diffusé en flux (stream) depuis le disque, pas chargé intégralement en mémoire serveur, et `send`/`sendFile` gère nativement les requêtes `Range` (lecture partielle par octets).
- **Avec `HttpClient` et `responseType: 'blob'`, à quel moment le composant reçoit-il le fichier ?** `HttpClient` avec `responseType: 'blob'` (sans `observe: 'events'`/`reportProgress`, ce qui est le cas ici) attend que **toute** la réponse HTTP soit arrivée avant d'émettre une seule fois le `Blob` complet dans le `subscribe`. Contrairement au flux serveur, côté client il n'y a pas de réception progressive exploitée par le code : `play()` ne reçoit le fichier qu'une fois entièrement téléchargé par le navigateur.
- **Avec 100 morceaux dans la bibliothèque, les 100 fichiers audio sont-ils chargés en mémoire à l'affichage de la liste ?** Non. `GET /api/tracks?page=&limit=` (utilisé par `load()`) ne renvoie que des métadonnées JSON (`items`) via `Track.find(...).select("-storedName")` — jamais les octets audio. Le `Blob` d'un morceau n'est récupéré que sur l'action explicite de l'utilisateur (`play(track)` sur clic), donc au plus **un seul** fichier audio est en mémoire à la fois côté client (et l'ancien est révoqué avant que le nouveau ne soit créé, cf. point 9 ci-dessus).
- **Quelle différence avec 100 éléments `<audio>` utilisant directement une URL HTTP ?** Deux différences majeures : (1) ces URLs n'auraient jamais le header `Authorization` (cf. section sur l'intercepteur ci-dessus) donc toutes échoueraient en 401 ; (2) même en supposant une route publique, le navigateur gère le chargement par élément `<audio>` selon son attribut `preload` (`none`/`metadata`/`auto`) et peut utiliser des requêtes `Range` pour ne charger que ce qui est nécessaire à la lecture/scrubbing — l'approche `Blob` actuelle, elle, télécharge toujours le fichier **en entier** avant que la lecture ne puisse commencer, ce qui est plus simple mais moins efficace pour un gros fichier ou une connexion lente.
- **Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?** Elle enregistre une entrée dans une table interne du navigateur qui garde une référence vivante vers le `Blob` en mémoire tant que l'URL n'est pas explicitement révoquée (ou que le document entier est déchargé) — retirer l'élément `<audio>` du DOM ne suffit pas à la libérer. Sans `URL.revokeObjectURL()`, chaque piste écoutée pendant une session laisserait son `Blob` en mémoire indéfiniment : une fuite mémoire qui grandit avec le nombre de pistes lues. Le code révoque déjà l'URL précédente à chaque changement de piste (`play()`) ; cette mission a ajouté la révocation de la **dernière** URL active, via `ngOnDestroy()`, qui n'était couverte par aucun code existant.

**Vérifications réalisées** :
- `npx tsc --noEmit -p tsconfig.json` : aucune erreur.
- `npm run build` : succès.

```
> gpc-angular-starter@1.0.0 build
> ng build

Application bundle generation complete. [2.079 seconds]
main.js  304.68 kB (raw)  |  80.66 kB (transfert estimé)
styles.css  1.85 kB (raw)  |  659 bytes (transfert estimé)
Output location: frontend-starter/dist/gpc
```

**Erreurs ou propositions rejetées** : aucune erreur de compilation. Un point corrigé au passage (pas une « proposition rejetée » à proprement parler, mais une incohérence trouvée en marge de la mission) : l'ancien template affichait `{{ track.size }} Ko` en utilisant directement la valeur en octets renvoyée par l'API — l'unité affichée était donc fausse d'un facteur ~1024. Corrigé par `formatSize()`.

**Fichiers effectivement modifiés** :
- `frontend-starter/src/app/shared/models/track.model.ts` (ajout de `ALLOWED_AUDIO_TYPES`, `MAX_AUDIO_SIZE`)
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (validations, Signals d'état d'upload/lecture, cards, `ngOnDestroy`)
- `frontend-starter/src/app/components/tracks-page/tracks-page.html` (cards, bannières erreur/succès, morceau en cours)
- `frontend-starter/src/styles.css` (`.success`, `.track-card`, `.tracks`)
- `rapport_ia_tp2.md` (cette section)

**Preuve de fonctionnement** : build Angular ci-dessus, sans erreur de type ni de template (les nouveaux Signals/bindings — `uploading()`, `uploadError()`, `playingTrack()`, etc. — compilent et sont correctement typés contre `Track`). À compléter par le binôme, conformément aux livrables de `SUJET_ETUDIANT_TP2.md` et au Checkpoint Network :
- capture Network montrant l'upload en `multipart/form-data` avec les champs `audio` et `title` ;
- capture d'une erreur `400` déclenchée en changeant volontairement le nom/l'extension d'un fichier texte en `.mp3` pour contourner la validation frontend (le backend doit quand même la refuser) — preuve concrète que la validation frontend ne remplace pas la validation serveur ;
- capture ou démonstration de la lecture audio authentifiée (`GET /api/tracks/:id/audio` avec header `Authorization`, réponse en flux audio) ;
- test qu'une piste ne peut être lue que par son propriétaire (401/404 avec le token d'un autre compte).

**Pourquoi la validation frontend améliore l'expérience mais ne remplace jamais la validation backend** : la validation dans `choose()` s'exécute *avant* toute requête réseau — elle donne un retour instantané à l'utilisateur (pas d'attente, pas de round-trip inutile pour un fichier manifestement invalide) et évite d'encombrer le serveur de requêtes vouées à l'échec. Mais elle s'exécute entièrement dans le navigateur, donc sous le contrôle total de l'utilisateur : `selected.type` est déclaré par le navigateur à partir de l'extension/metadata du fichier (falsifiable), et n'importe qui peut appeler l'API directement (`curl`, Postman, DevTools) en contournant complètement le code Angular. Seul le contrôle serveur (`fileFilter` + `limits.fileSize` dans `app.js`) constitue une garantie réelle, car il s'exécute sur une machine que l'utilisateur ne contrôle pas — c'est le même principe que `Validators.email` (frontend) vs la contrainte d'unicité en base avec erreur `409` (backend) déjà discuté pour la Mission 1 de TP1.

**Ce que chaque membre sait maintenant expliquer sans l'agent** : *(à remplir individuellement et honnêtement par chaque binôme, dans ses propres mots — notamment : pourquoi `<audio src="...">` ne peut pas porter le JWT et pourquoi c'est le vrai motif du détour par `Blob`/`ObjectURL` ; pourquoi une validation frontend ne protège jamais le backend contre un appel direct à l'API ; ce que fait concrètement `URL.revokeObjectURL` et pourquoi l'oublier constitue une fuite mémoire ; pourquoi le nombre de fichiers audio réellement en mémoire ne dépend pas du nombre de pistes affichées dans la liste mais du nombre de pistes effectivement lues.)*

---

## Améliorations facultatives (section « Améliorations facultatives » de `SUJET_ETUDIANT_TP2.md`)

**Objectif** : intégrer les points optionnels listés dans l'énoncé — barre de progression de l'upload, suppression avec confirmation, rafraîchissement après suppression, filtre par titre. Le formatage lisible de la taille et de la date était déjà fait en Mission 3 (`formatSize`/`formatDate`).

**Prompt principal** : « Intègre les optionnels de l'énoncé » (après une discussion listant les pistes d'amélioration possibles, dont ces 4 points).

**Choix assumés, expliqués avant codage** :
- Trois des quatre points (progression, suppression, rafraîchissement) sont purement frontend : la route `DELETE /api/tracks/:id` existait déjà côté backend, explicitement marquée « (bonus) » dans `API_CONTRACT.md`, donc aucune modification serveur n'était nécessaire pour la suppression.
- Le **filtre par titre** est le seul point qui touche le backend. Contrairement aux Missions 2/3 (« ne modifiez pas le backend/le contrat »), cette contrainte ne s'applique explicitement qu'« aux missions principales » (`SUJET_ETUDIANT_TP2.md`, en-tête). Deux options étaient possibles : (a) filtrer côté client les pistes déjà chargées, ou (b) ajouter un paramètre optionnel côté serveur. L'option (a) a été écartée : elle ne filtrerait que les 5 pistes de la page courante, pas l'ensemble de la bibliothèque de l'utilisateur, ce qui la rend trompeuse (« aucun résultat » alors que la piste existe juste sur une autre page) — et ça contredit le principe déjà établi en Mission 2 selon lequel les opérations de recherche/tri sur l'ensemble des données doivent rester côté serveur. L'option (b) a donc été retenue : nouveau paramètre `title` **optionnel** sur `GET /api/tracks`, rétrocompatible (absent = comportement inchangé), documenté dans `API_CONTRACT.md` et implémenté suivant les conventions déjà en place dans `backend/src/app.js` (middleware `auth`, filtre toujours restreint à `ownerId`, mêmes logs `console.log`/`console.warn`).

**Détail des ajouts** :

1. **Barre de progression de l'upload** — `TrackService.upload()` (`track.service.ts`) passe désormais `{ reportProgress: true, observe: 'events' }` à `HttpClient.post`, ce qui transforme l'Observable en flux de `HttpEvent<Track>` plutôt qu'une seule réponse finale. `TracksPageComponent.upload()` distingue `HttpEventType.UploadProgress` (met à jour un nouveau Signal `uploadProgress`, en pourcentage `event.loaded/event.total`) de `HttpEventType.Response` (traitement de succès identique à avant : titre vidé, page 1, rechargement). Le template affiche un `<progress [value]="uploadProgress()" max="100">` uniquement pendant `uploading()`.
2. **Suppression avec confirmation** — nouvelle méthode `TrackService.delete(id)` (`DELETE /api/tracks/:id`, déjà documentée comme bonus). `TracksPageComponent.remove(track)` demande confirmation via `confirm()` (choix volontairement simple : pas de dépendance UI supplémentaire pour un TP), puis appelle le service ; en cas de succès, si la piste supprimée était celle en cours de lecture, le lecteur est arrêté et son `ObjectURL` révoqué (`stopPlayback()`, nouvelle méthode privée) pour ne pas laisser un `<audio>` pointer vers une piste qui n'existe plus.
3. **Rafraîchissement après suppression** — après un `DELETE` réussi, `load()` est rappelée automatiquement. Cas limite traité explicitement : si la piste supprimée était la **seule** piste affichée sur une page qui n'est pas la première (`tracks().length === 1 && page() > 1`), le composant recule d'une page avant de recharger — sinon l'utilisateur atterrirait sur une page devenue vide alors que des pistes existent toujours juste avant.
4. **Filtre par titre** — backend : nouveau paramètre `req.query.title`, transformé en `filter.title = { $regex: escapeRegExp(titleQuery), $options: "i" }` (recherche insensible à la casse, sous-chaîne), ajouté à un `filter` qui reste toujours combiné à `ownerId` (aucune fuite de données entre utilisateurs). Une fonction `escapeRegExp()` a été ajoutée pour échapper les caractères spéciaux d'une regex avant de les injecter dans la requête MongoDB : sans ça, un titre contenant `.`, `*`, `(`, etc. produirait une regex invalide ou un comportement de recherche incorrect/dégénéré — cohérent avec la remarque de `backend/AGENTS.md` sur la protection contre l'injection NoSQL. Frontend : `TrackService.list(page, limit, title?)` ajoute `title` aux `params` seulement s'il est non vide ; `TracksPageComponent` expose un nouveau `FormControl search`, dont les `valueChanges` sont débattus (`debounceTime(300)`) et dédupliqués (`distinctUntilChanged()`) avant de remettre `page` à 1 et de relancer `load()` — évite une requête HTTP à chaque frappe.

**Erreurs ou propositions rejetées** :
- Filtrage 100 % client des pistes déjà chargées : rejeté avant implémentation (cf. « Choix assumés » ci-dessus), au profit du filtre serveur.
- Abonnement à `search.valueChanges` fait dans le constructeur : pour rester cohérent avec la rigueur déjà appliquée à `ObjectURL` (révocation dans `ngOnDestroy`), l'abonnement est stocké (`searchSubscription`) et explicitement désabonné dans `ngOnDestroy()`, plutôt que laissé actif sans référence.

**Vérifications réalisées** :
- `npx tsc --noEmit -p tsconfig.json` (frontend) : aucune erreur.
- `npm run build` (frontend) : succès (voir sortie ci-dessous).
- `node --check src/app.js` (backend) : aucune erreur de syntaxe.
- `npm test` (backend, `node --test`) : les 2 tests existants passent toujours (`health sans dépendre de MongoDB`, `schémas Mongoose et relation`) — aucun test n'appelle la vraie base MongoDB (`createApp()` ne se connecte pas à Mongo, seul `server.js` le fait), donc aucun risque d'avoir touché les données réelles du cluster Atlas en vérifiant.

```
> gpc-angular-starter@1.0.0 build
> ng build

Application bundle generation complete. [2.019 seconds]
main.js  309.02 kB (raw)  |  81.82 kB (transfert estimé)
styles.css  2.00 kB (raw)  |  692 bytes (transfert estimé)
Output location: frontend-starter/dist/gpc
```

```
> gpc-api@3.0.0 test
> node --test

✔ health sans dépendre de MongoDB
✔ schémas Mongoose et relation
ℹ tests 2, pass 2, fail 0
```

**Fichiers effectivement modifiés** :
- `backend/src/app.js` (fonction `escapeRegExp`, paramètre `title` sur `GET /api/tracks`)
- `API_CONTRACT.md` (documentation du paramètre optionnel `title`)
- `frontend-starter/src/app/shared/services/track.service.ts` (`upload()` en mode événements, `delete()`, `list()` avec `title` optionnel)
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (`uploadProgress`, `remove()`, `stopPlayback()`, `search` + désabonnement)
- `frontend-starter/src/app/components/tracks-page/tracks-page.html` (barre de progression, champ de recherche, bouton de suppression)
- `frontend-starter/src/styles.css` (`.track-card-actions`, `.danger`, `progress`)
- `rapport_ia_tp2.md` (cette section)

**Preuve de fonctionnement** : builds/tests ci-dessus, sans régression sur l'existant (Missions 2 et 3). À compléter par le binôme :
- capture Network d'un upload montrant plusieurs événements de progression (`HttpEventType.UploadProgress`) avant la réponse finale `201` ;
- capture d'une suppression (`DELETE /api/tracks/:id` → `204`) suivie du rechargement automatique de la liste ;
- capture d'une recherche par titre montrant le paramètre `?title=...` dans l'URL de `GET /api/tracks`, avec des résultats limités aux pistes correspondantes ;
- test qu'une suppression ou une recherche ne renvoie/n'affecte jamais les pistes d'un autre compte (toujours filtré par `ownerId` côté serveur).

**Ce que chaque membre sait maintenant expliquer sans l'agent** : *(à remplir individuellement et honnêtement par chaque binôme — notamment : pourquoi le filtre par titre devait rester côté serveur plutôt que d'être fait sur les données déjà chargées ; pourquoi `escapeRegExp` est nécessaire avant d'injecter une entrée utilisateur dans une regex MongoDB ; pourquoi `debounceTime`/`distinctUntilChanged` évitent une requête HTTP par frappe clavier ; pourquoi la suppression de la dernière piste d'une page non-1 doit reculer d'une page plutôt que de simplement recharger la même page.)*

---

## AVANCÉ — Pagination Mongoose, image de couverture, streaming réel

**Objectif** : traiter les trois pistes AVANCÉ évoquées en fin de discussion sur les améliorations possibles — pagination via `mongoose-aggregate-paginate-v2`, image de couverture automatique (ID3/service web), et streaming réel du lecteur (token signé + `<audio src>` direct).

**Prompt principal** : l'utilisateur a collé mes propres suggestions (issues d'une question précédente « quels sont les points qu'on pourrait améliorer ») et demandé « Intègre ceci aussi ». Comme ces trois pistes avaient chacune une réserve explicite dans mon texte d'origine (« pas forcément à implémenter », « à ne faire que si vous voulez creuser », « nécessite de concevoir... avant de coder »), j'ai posé deux questions de clarification avant de coder plutôt que de deviner, les trois options ayant des implications très différentes (documentation seule vs réécriture de code déjà testé vs dépendance à un service externe) :
1. Streaming réel : documenter seulement, ou implémenter réellement (ce qui contournerait le mécanisme Blob/ObjectURL déjà en place et expliqué dans le rapport) ? → réponse : **documenter seulement**.
2. Image de couverture : upload manuel (recommandé par moi, sans dépendance externe) ou recherche automatique via ID3/service web (plus fidèle à une vraie app, mais dépend d'un service tiers) ? → réponse : **recherche automatique**.

Une troisième clarification a été nécessaire une fois la pagination Mongoose entamée : ce n'est pas un ajout à côté de la pagination existante, mais un remplacement qui change le format de réponse (`docs`/`totalPages`/... au lieu de `items`/`pages`) et donc casse la pagination de Mission 2 déjà testée et documentée. → réponse : **remplacer**.

### 1. Streaming réel — documenté, non implémenté (décision du binôme)

**Analyse** (sans code) : la lecture actuelle télécharge tout le `Blob` avant de pouvoir jouer (cf. Mission 3). Une alternative plus proche du streaming natif consisterait à :
- générer un token à courte durée de vie (JWT dédié, distinct du token de session, ou le même JWT réutilisé) passé en query param (`GET /tracks/:id/audio?token=...`) ;
- faire vérifier ce token par le middleware `auth` de cette route spécifique, en plus (ou à la place) du header `Authorization` ;
- basculer le lecteur sur un `<audio [src]="service.audioUrl(track.id)">` direct plutôt que sur un `Blob`/`ObjectURL`.

**Pourquoi ce n'est finalement pas implémenté** : `res.sendFile()` (déjà utilisé côté backend) gère nativement les requêtes `Range`, donc un `<audio src>` direct profiterait immédiatement du scrubbing et du chargement progressif sans travail supplémentaire côté serveur sur ce point précis — l'intérêt technique est réel pour un gros fichier. Mais ce changement :
- déplace le secret d'authentification d'un header (jamais visible dans l'URL, jamais loggé par des proxys/serveurs intermédiaires par défaut) vers un query param (visible dans les logs d'accès, l'historique du navigateur, les en-têtes `Referer` de requêtes tierces déclenchées depuis la page) — une régression de sécurité qu'il faudrait au minimum documenter et mitiger (durée de vie très courte, token à usage unique, scope limité à cette seule piste) ;
- contourne entièrement le mécanisme Blob/ObjectURL qui est le point pédagogique central de la Mission 3 de ce TP (déjà implémenté, testé, et expliqué en détail dans la section Mission 3 de ce rapport) ;
- changerait le contrat d'authentification d'une route existante, avec un vrai arbitrage sécurité/performance qui dépasse le périmètre d'une simple « amélioration facultative ».

C'est donc resté un point de compréhension/discussion plutôt qu'un changement de code, conformément au choix du binôme.

### 2. Image de couverture automatique (ID3 + iTunes Search API)

**Choix d'implémentation** : à l'upload, le backend lit les tags ID3 du fichier (`artist`, `title`) via la librairie `music-metadata` ; à défaut de tags exploitables, il dérive un terme de recherche du nom de fichier original (`"Artist - Title.mp3"` → `"Artist Title"`). Ce terme est envoyé à l'API publique **iTunes Search** (`https://itunes.apple.com/search`, aucune clé requise), et l'`artworkUrl100` du premier résultat est retenu, avec un remplacement `100x100bb` → `600x600bb` dans l'URL pour obtenir une résolution plus grande depuis le même CDN. Le résultat (ou `null` si rien n'est trouvé) est stocké dans un nouveau champ `Track.coverUrl`.

**Pourquoi cette conception plutôt qu'extraire l'image embarquée dans les tags ID3 (frame `APIC`)** : `music-metadata` sait aussi extraire une pochette embarquée directement dans le fichier, mais l'exploiter aurait demandé de la stocker sur le disque serveur et d'ajouter une route authentifiée dédiée (`GET /tracks/:id/cover`) symétrique à celle de l'audio — une pochette externe publique (iTunes) est directement utilisable par le navigateur sans passer par notre serveur ni par le mécanisme Blob, ce qui est plus simple et reste cohérent avec le périmètre de cette amélioration facultative. Cette extraction ID3 embarquée reste une piste de suite possible, non traitée ici.

**Pourquoi la recherche ne bloque jamais l'upload** : `findCoverUrl()` est entourée d'un `try/catch` qui capture toute erreur (parsing ID3 impossible, réseau indisponible, aucun résultat iTunes) et renvoie simplement `null` — l'upload réussit toujours (`201`) même sans pochette, et la recherche a lieu **après** que `Track.create()` a déjà réussi, donc un échec de recherche ne peut jamais transformer un upload par ailleurs valide en erreur `500`.

**Sécurité et vie privée, à connaître** : la recherche est faite **côté serveur** (le navigateur de l'utilisateur ne contacte jamais Apple directement, donc son IP n'est jamais exposée à ce tiers) mais le **serveur**, lui, envoie systématiquement un extrait du contenu de chaque piste uploadée (artiste/titre ou nom de fichier) à un service tiers (Apple) sans consentement explicite affiché à l'utilisateur — un point à mentionner dans une vraie politique de confidentialité en production. Aucune clé API n'est utilisée ni stockée (endpoint public), donc rien de sensible dans `.env` pour cette fonctionnalité. Autre point à connaître : l'API iTunes Search est prévue pour un usage d'affichage lié à l'écosystème Apple (iTunes/App Store) — l'utiliser pour illustrer des pistes dans une application tierce non affiliée est courant en pédagogie/prototypage, mais mériterait une vérification des CGU avant un usage commercial réel.

**Détail des ajouts** :
- `backend/src/models/Track.js` : nouveau champ `coverUrl: { type: String, default: null }`, exposé par `toPublic()`.
- `backend/src/app.js` : import de `music-metadata` (`parseFile`), fonctions `deriveSearchTermFromFilename()` et `findCoverUrl()`, appel après `Track.create()` dans `POST /api/tracks`.
- `API_CONTRACT.md` : `coverUrl` documenté sur `Track` (nullable, pas de JWT nécessaire pour le charger — CDN public).
- `frontend-starter/src/app/shared/models/track.model.ts` : `coverUrl: string | null` ajouté à l'interface `Track`.
- `frontend-starter/src/app/components/tracks-page/tracks-page.html` : chaque card affiche `<img [src]="track.coverUrl">` si présent, sinon un placeholder visuel (♪) — jamais d'état cassé si `coverUrl` est `null`.
- `frontend-starter/src/styles.css` : `.track-card-cover` (image carrée, `object-fit: cover`) et son état `.placeholder`.

**Vérification réalisée** : upload réel d'un fichier de test (`frontend-starter/fichiers-audio-de-test/song1.mp3`, sans tags ID3 exploitables) contre la vraie base MongoDB Atlas (lecture/écriture strictement limitées à une piste de test, supprimée ensuite via `DELETE /api/tracks/:id`) : la recherche s'est bien déclenchée (`[cover] Recherche de pochette pour "song1"`), n'a trouvé aucun résultat pertinent pour ce nom générique, et a renvoyé `coverUrl: null` sans jamais faire échouer l'upload (`201` reçu). Confirme le comportement attendu dans le cas « pas de correspondance » ; le cas « correspondance trouvée » suit exactement le même chemin de code (seule la valeur de retour de l'appel iTunes change), déjà couvert par la lecture du code et par l'appel manuel à l'API iTunes Search effectué en amont (`resultCount: 1` obtenu lors du test de connectivité réseau).

### 3. Pagination Mongoose via `mongoose-aggregate-paginate-v2`

**Choix d'implémentation** : remplacement complet de la pagination `Track.find().sort().skip().limit()` + `Track.countDocuments()` (Mission 2) par `Track.aggregatePaginate(aggregateQuery, { page, limit })`, où `aggregateQuery` est un pipeline `Track.aggregate([...])` construit à la main :
1. `$match` : filtre `ownerId` (+ `title` optionnel, réutilisé tel quel depuis l'amélioration facultative précédente) ;
2. `$sort` : `createdAt: -1` (comportement inchangé) ;
3. `$addFields` : calcule `id` (`_id` converti en chaîne) et `ownerId` (idem), pour produire directement la forme publique attendue par le frontend ;
4. `$project` : retire `_id`, `__v` et `storedName` (jamais exposé, comme avant avec `.select("-storedName")`).

Le plugin exécute ce pipeline et y ajoute lui-même les métadonnées de pagination, calculées côté MongoDB : la réponse devient `{ docs, totalDocs, limit, page, totalPages, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage }` — vérifiée par un appel réel contre la base Atlas (voir « Vérifications » ci-dessous), plutôt que supposée depuis la documentation du plugin.

**Bug trouvé et corrigé en cours d'implémentation** : le premier essai renvoyait toujours `totalDocs: 0` alors qu'un upload de test venait de réussir. Cause : `Track.find(filter)` (Mongoose, ancienne implémentation) **caste automatiquement** une chaîne de caractères en `ObjectId` quand le schéma déclare le champ comme tel — mais `Track.aggregate([{ $match: filter }])` est une agrégation MongoDB **brute** exécutée directement par le driver, sans passer par cette couche de casting Mongoose. `req.auth.sub` (extrait du JWT) est une chaîne ; `ownerId` est stocké en `ObjectId` dans MongoDB. Résultat : `{ ownerId: "68f2..." }` (chaîne) ne correspondait jamais à aucun document. Corrigé en convertissant explicitement : `new Types.ObjectId(req.auth.sub)`. C'est un piège classique et bien connu du passage de `Model.find()` à `Model.aggregate()` en Mongoose — utile à retenir pour toute agrégation future dans ce projet (ex. si l'option image de couverture évolue vers des statistiques par utilisateur).

**Détail des ajouts** :
- `backend/src/models/Track.js` : import et `schema.plugin(aggregatePaginate)`.
- `backend/src/app.js` : import `mongoose-aggregate-paginate-v2` côté modèle, import `{ Types }` de `mongoose` côté route ; réécriture complète du handler `GET /api/tracks` (pipeline d'agrégation + `Track.aggregatePaginate()` + correction du cast `ObjectId`).
- `API_CONTRACT.md` : nouvelle description de `Page<Track>` (`docs`/`totalDocs`/`totalPages`/...), qui remplace l'ancienne (`items`/`total`/`pages`).
- `frontend-starter/src/app/shared/models/page.model.ts` : interface `Page<T>` réécrite pour correspondre exactement à la forme renvoyée par le plugin.
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` : `load()` lit désormais `response.docs`/`response.totalPages` au lieu de `response.items`/`response.pages`. Aucune autre partie du composant (Signals `tracks`/`page`/`pages`, `go()`, template) n'a dû changer : la traduction réponse HTTP → Signals internes reste isolée dans `load()`, ce qui a limité l'ampleur réelle de ce remplacement côté frontend.
- Mission 2 (plus haut dans ce rapport) : note ajoutée pour signaler explicitement ce remplacement sans réécrire l'historique de ce qui avait été testé à l'époque.

**Vérifications réalisées** (contre la vraie base MongoDB Atlas, en plus des vérifications habituelles) :
- `node --check src/app.js` : aucune erreur de syntaxe.
- `npm test` (backend) : les 2 tests existants passent toujours.
- Script temporaire (créé puis supprimé) interrogeant directement `Track.aggregatePaginate()` en lecture seule, pour confirmer les clés exactes de la réponse avant de les documenter (plutôt que de les supposer).
- Démarrage réel du backend sur un port de test dédié (3010, pour ne pas interrompre un serveur déjà lancé par ailleurs sur le port 3000), et test de bout en bout via `Invoke-RestMethod`/`curl.exe` : connexion `demo@example.com`, upload d'un fichier de test réel, `GET /api/tracks` (confirme `totalDocs: 0` avant le fix, puis les pistes correctement renvoyées avec `id` propre et sans `_id`/`storedName`/`__v` après le fix), `GET /api/tracks?title=test` (filtre toujours fonctionnel avec la nouvelle pagination), puis **suppression de la piste de test** via `DELETE /api/tracks/:id` pour ne rien laisser dans la base réelle.
- `npx tsc --noEmit` et `npm run build` (frontend) : succès.

```
> gpc-angular-starter@1.0.0 build
> ng build

Application bundle generation complete. [2.860 seconds]
main.js  309.38 kB (raw)  |  81.89 kB (transfert estimé)
styles.css  2.22 kB (raw)  |  746 bytes (transfert estimé)
Output location: frontend-starter/dist/gpc
```

**Erreurs ou propositions rejetées** :
- Extraction de la pochette embarquée dans les tags ID3 (frame `APIC`) plutôt que la recherche iTunes : envisagée puis écartée pour limiter la complexité (stockage disque + route authentifiée supplémentaire), au profit d'une solution reposant sur une URL publique directement utilisable par le navigateur.
- Bug `ObjectId` détaillé ci-dessus : trouvé par un test réel contre la base (pas seulement une lecture de code), corrigé, puis reconfirmé par un nouveau test réel avant de documenter le comportement final.

**Fichiers effectivement modifiés (section AVANCÉ)** :
- `backend/package.json` (dépendances `music-metadata`, `mongoose-aggregate-paginate-v2`)
- `backend/src/models/Track.js` (`coverUrl`, plugin `aggregatePaginate`)
- `backend/src/app.js` (`findCoverUrl`, `deriveSearchTermFromFilename`, réécriture de `GET /api/tracks`, import `Types`)
- `API_CONTRACT.md` (nouvelle forme de `Page<Track>`, champ `coverUrl`)
- `frontend-starter/src/app/shared/models/page.model.ts` (réécrit)
- `frontend-starter/src/app/shared/models/track.model.ts` (`coverUrl`)
- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (`load()` adapté au nouveau format)
- `frontend-starter/src/app/components/tracks-page/tracks-page.html` (affichage de la pochette)
- `frontend-starter/src/styles.css` (`.track-card-cover`)
- `rapport_ia_tp2.md` (cette section, + note dans la section Mission 2)

**Preuve de fonctionnement** : tests réels décrits ci-dessus (upload, pagination, filtre, suppression) contre la vraie base Atlas, données de test nettoyées après coup ; builds/tests automatisés au vert. À compléter par le binôme :
- capture Network de `GET /api/tracks` montrant la nouvelle forme de réponse (`docs`, `totalPages`, `hasNextPage`, ...) ;
- capture d'une piste affichant une vraie pochette trouvée automatiquement (upload d'un fichier avec des tags ID3 artiste/titre réalistes, ou un nom de fichier explicite type `"Artist - Title.mp3"`) ;
- capture d'une piste sans pochette (état de repli affiché correctement, sans erreur).

**Ce que chaque membre sait maintenant expliquer sans l'agent** : *(à remplir individuellement et honnêtement par chaque binôme — notamment : pourquoi `Track.aggregate()` ne caste pas automatiquement une chaîne en `ObjectId` alors que `Track.find()` le fait, et ce que ça implique pour toute future agrégation sur ce projet ; pourquoi la recherche de pochette ne doit jamais pouvoir faire échouer un upload par ailleurs valide ; pourquoi un token d'authentification en query param serait plus risqué qu'un header `Authorization`, et pourquoi ce risque n'était pas justifié ici ; ce qui, dans `load()`, a dû changer suite au remplacement de la pagination — et pourquoi le reste du composant n'a pas eu besoin d'être touché.)*
