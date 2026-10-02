# Captures TP2 — bibliothèque, upload et lecture audio

Captures réalisées le 02/10/2026 dans Chrome (frontend `http://localhost:4200`, backend `http://localhost:3000`, compte `demo@example.com`).

> Ces images montrent le contenu de l'onglet, pas le panneau DevTools. Pour les preuves réseau, on a relevé les requêtes de l'onglet (méthode, URL, statut). Elles sont consignées dans le tableau ci-dessous. La capture 04 affiche aussi ces requêtes dans un panneau ajouté temporairement à la page (lu via l'API Performance du navigateur).

## Images

| Fichier | Ce qu'elle montre | Livrable / checkpoint |
|---|---|---|
| `01-upload-succes.jpg` | Message « … envoyée avec succès », formulaire vidé, nouvelle piste en tête de liste avec pochette trouvée automatiquement | Upload, cards, pochette |
| `02-pagination-page1.jpg` | « Page 1 / 3 », bouton « Précédent » désactivé | Pagination serveur |
| `03-pagination-page2.jpg` | « Page 2 / 3 » après clic sur « Suivant », autres pistes | Pagination serveur |
| `04-journal-reseau-pagination-et-lecture.jpg` | Requêtes `GET /api/tracks?page=1…2…3…2…1&limit=5` (une requête HTTP par changement de page), puis `GET /api/tracks/:id/audio` ; lecteur en cours (0:48 / 5:20) | Checkpoint « chaque changement de page modifie `page` » + lecture authentifiée |
| `05-validation-frontend-format-refuse.jpg` | Fichier `.txt` choisi → « Format non supporté (text/plain) », aucun appel HTTP | Validation frontend |
| `06-erreur-400-backend-affichee.jpg` | Requête modifiée pour envoyer un `text/plain` en contournant le contrôle Angular → le backend répond `400` « Format audio non accepté », message affiché | Checkpoint « erreur 400 affichée » |
| `07-url-audio-sans-jwt-401.jpg` | URL `/api/tracks/:id/audio` ouverte directement dans un onglet → `401 {"message":"Authentification requise"}` | Pourquoi `<audio src>` ne suffit pas (pas de header `Authorization`) |
| `08a-suppression-avant.jpg` / `08b-suppression-apres-rechargement.jpg` | Piste supprimée (`DELETE` → `204`), liste rechargée automatiquement | Suppression + rafraîchissement |
| `09-filtre-par-titre.jpg` | Filtre « blues » → `GET /api/tracks?page=1&limit=5&title=blues`, 1 seul résultat, « Page 1 / 1 » | Filtre par titre |
| `10-piste-sans-pochette.jpg` | Piste sans pochette → repli « ♪ » affiché sans erreur | Pochette (état de repli) |
| `11-erreur-lecture-audio.jpg` | Lecture d'un fichier qui n'est pas de l'audio → « Erreur de lecture du fichier audio. » | Erreur audio compréhensible |

## Observations réseau relevées

| Scénario | Requête | Statut | Détail |
|---|---|---|---|
| Connexion | `POST /api/auth/login` | 200 | |
| Pagination | `GET /api/tracks?page=1&limit=5`, puis `page=2`, `page=3` | 200 | une requête par clic, rien n'est découpé côté Angular |
| Forme de la réponse | `GET /api/tracks` | 200 | clés : `docs, totalDocs, limit, page, totalPages, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage` |
| Upload valide | `POST /api/tracks` (multipart, champs `audio` + `title`) | 201 | suivi de `GET /api/tracks?page=1&limit=5` |
| Upload `text/plain` (frontend contourné) | `POST /api/tracks` | 400 | `{"message":"Format audio non accepté"}` |
| Lecture avec JWT | `GET /api/tracks/:id/audio` + `Authorization: Bearer …` | 200 | `Content-Type: audio/mpeg`, `Content-Length: 6405141`, `Accept-Ranges: bytes` ; Blob reçu : 6 405 141 octets, `audio/mpeg` |
| Lecture sans JWT | même URL, sans header | 401 | `{"message":"Authentification requise"}` |
| Lecture par un autre compte | même URL, JWT d'un autre utilisateur | 404 | `{"message":"Piste inconnue"}` ; l'autre compte voit `totalDocs: 0` |
| Suppression | `DELETE /api/tracks/:id` | 204 | suivi de `GET /api/tracks?page=1&limit=5` |
| Filtre | `GET /api/tracks?page=1&limit=5&title=blues` | 200 | |

## Points relevés pendant les tests

- **Un fichier texte renommé en `.mp3` est accepté (201).** Le navigateur annonce alors `audio/mpeg`, et `fileFilter` (dans `backend/src/app.js`) ne vérifie que ce type MIME déclaré. Le `400` n'apparaît que si le type envoyé est lui-même invalide (capture 06). Pour refuser vraiment ce cas, il faudrait vérifier le contenu du fichier côté serveur (signature/« magic bytes », ou `music-metadata`, déjà présent dans le projet).
- **Accents dans `originalName`** : `Für Elise.mp3` est stocké en `FÃ¼r Elise.mp3` (nom de fichier multipart lu en latin1 par Multer). **Corrigé depuis** : `defParamCharset: "utf8"` dans la configuration Multer (`backend/src/app.js`). Les pistes uploadées avant la correction gardent le nom corrompu.
- **Barre de progression** : dans cette version, Angular envoie les requêtes via `fetch` (initiateur « fetch » dans le journal). Avec `fetch`, Angular ne fournit en général pas d'événements `UploadProgress` ; en local, l'upload est de toute façon instantané. Pour capturer une progression visible, ajouter `withXhr()` à `provideHttpClient` (si disponible dans ta version d'Angular) et limiter le débit dans DevTools. **Corrigé depuis** : la cause est confirmée (le `FetchBackend` d'Angular 22 ne gère pas la progression d'upload), et `withXhr()` a été ajouté dans `frontend-starter/src/main.ts`. Ce n'est pas encore vérifié dans le navigateur.
