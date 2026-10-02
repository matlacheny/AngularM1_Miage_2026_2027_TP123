# Rapport des tests — TP3

Exécution du 02/10/2026. Aucun test ne dépend d'un backend lancé ni d'une base MongoDB.

## Commandes

| Commande | Dossier | Résultat observé |
|---|---|---|
| `npm test` (`ng test --watch=false`, Vitest + jsdom) | `frontend-starter` | **5 fichiers, 15 tests, 15 réussis** |
| `npm test` (`node --test`) | `backend` | **11 tests, 11 réussis** (2 existants + 9 ajoutés) |
| `npm run build` | `frontend-starter` | build réussi, `main.js` 422 kB (104 kB transférés) |

## Tests frontend

Les réponses HTTP sont simulées avec `HttpTestingController` (`provideHttpClientTesting()`) : aucune requête ne sort du test. Chaque test vérifie l'URL, la méthode, les paramètres, le corps ou les headers, puis l'effet de la réponse simulée.

| Fichier | Test | Résultat attendu | Observé |
|---|---|---|---|
| `shared/services/auth.service.spec.ts` | `login()` envoie `POST /api/auth/login` avec `{ email, password }` | méthode `POST`, corps exact, token stocké dans le Signal et `localStorage` | ✔ |
| | `login()` refusé (401) | erreur 401 transmise, aucun token stocké | ✔ |
| `shared/services/track.service.spec.ts` | `list()` transmet `page` et `limit` | `GET /api/tracks?page=3&limit=5`, pas de `title` | ✔ |
| | `delete()` | `DELETE /api/tracks/abc123` | ✔ |
| | `upload()` | `POST` multipart avec exactement `audio` puis `title`, `reportProgress` activé, événements `UploadProgress` et `Response` émis | ✔ |
| `shared/interceptors/auth.interceptor.spec.ts` | token présent | header `Authorization: Bearer jwt-simule` | ✔ |
| | token absent | aucun header `Authorization` | ✔ |
| `shared/guards/auth.guard.spec.ts` | sans token | `UrlTree` vers `/login` | ✔ |
| | avec token | `true` | ✔ |
| `components/tracks-page/tracks-page.spec.ts` | échec HTTP du chargement (500) | Signal `error` = message serveur, affiché dans un `role="alert"` | ✔ |
| | suppression confirmée | `DELETE /api/tracks/t1`, un 2ᵉ clic n'envoie pas de 2ᵉ requête, SnackBar de succès, nouvelle requête `GET /api/tracks?page=1` | ✔ |
| | suppression annulée | aucune requête `DELETE` | ✔ |
| | piste déjà supprimée (404) | SnackBar « n'existe plus ou ne vous appartient pas », liste rechargée | ✔ |
| | upload en erreur | état `uploading`, progression 25 % puis 75 %, 2ᵉ soumission ignorée, puis état `error`, message du serveur, contrôles réactivés | ✔ |
| | upload réussi | état `success`, fichier réinitialisé, rechargement de la page 1 | ✔ |

**Vérification que les tests sont utiles** : la protection contre le double clic dans `remove()` a été retirée temporairement. Le test de suppression a alors échoué (`Expected one matching request for criteria "Match URL: /api/tracks/t1", found 2 requests`), puis le code a été restauré.

## Tests backend (extension facultative) — `backend/test/contract.test.js`

Le serveur Express est lancé par `createApp()`, qui ne se connecte pas à MongoDB. Les méthodes `Track.aggregatePaginate`, `Track.findOne` et `Track.findOneAndDelete` sont remplacées par des faux pendant un test, puis restaurées.

| Test | Attendu | Observé |
|---|---|---|
| `GET /api/tracks` sans JWT | `401` « Authentification requise » | ✔ |
| JWT signé avec un autre secret | `401` « Jeton invalide ou expiré » | ✔ |
| JWT expiré | `401` | ✔ |
| `POST /api/tracks` sans fichier | `400` « Fichier audio requis » | ✔ |
| `POST /api/tracks` avec `text/plain` | `400` « Format audio non accepté » | ✔ |
| `GET /api/tracks?page=2&limit=3` | plugin appelé avec `{ page: 2, limit: 3 }`, `$match.ownerId` = utilisateur du JWT, réponse avec les clés du contrat | ✔ |
| `GET /api/tracks?page=-4&limit=500` | bornes appliquées : `{ page: 1, limit: 20 }` | ✔ |
| lecture et suppression de la piste d'un autre utilisateur | `404` « Piste inconnue », filtre `{ _id, ownerId }` construit depuis le JWT | ✔ |
| `DELETE /api/tracks/:id` sans JWT | `401` | ✔ |

## Limites

- Les tests de composant appellent les méthodes de la classe et vérifient les Signals. Seul le test d'erreur vérifie aussi le DOM affiché.
- La vraie progression d'upload (via `XMLHttpRequest`, grâce à `withXhr()`) n'est pas testée : `HttpTestingController` simule les événements. La preuve réelle reste la capture Network.
- Le test « autre utilisateur » remplace MongoDB : il vérifie que la route filtre sur `ownerId` issu du JWT, pas que MongoDB applique ce filtre.
