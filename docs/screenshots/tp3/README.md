# Captures TP3 — suppression, progression de l'upload, console

Captures réalisées le 02/10/2026 dans Chrome (frontend `http://localhost:4200`, backend `http://localhost:3000`, compte `demo@example.com`). Les pistes de test créées pour ces captures ont toutes été supprimées.

> Ces images montrent le contenu de l'onglet, pas le panneau DevTools. Pour les preuves Network, un petit script a été ajouté temporairement à la page. Il enregistrait chaque requête `XMLHttpRequest` (méthode, URL, headers avec le JWT masqué, champs multipart, événements `upload.progress`, statut de réponse) et le texte de `confirm()`. Les captures 03 et 09 affichent ce journal en bas de la page. Comme ce script répondait « OK » à `confirm()` automatiquement, la boîte de confirmation native n'apparaît sur aucune image : son texte figure dans le journal.

## Images

| Fichier | Ce qu'elle montre | Mission |
|---|---|---|
| `01-cards-bouton-supprimer.jpg` | Bouton « Supprimer » dans chaque card | 5 |
| `02-suppression-snackbar-succes.jpg` | SnackBar « « Upload TP3 - progression » a été supprimée. », la piste a disparu de la liste | 5 |
| `03-journal-suppressions-204-et-404.jpg` | `confirm()` → `DELETE /api/tracks/:id` avec `Authorization` → `204` → `GET /api/tracks?page=1&limit=5` (rechargement). Puis même enchaînement sur une piste déjà supprimée → `404` → rechargement | 5, vérification Network « DELETE après confirmation » |
| `04-snackbar-piste-deja-supprimee-404.jpg` | Piste supprimée entre-temps (appel `DELETE` envoyé à part, comme depuis un autre onglet), puis clic sur « Supprimer » → SnackBar « … n'existe plus ou ne vous appartient pas. La liste a été actualisée. » | 5 (cas piste disparue) |
| `05-upload-en-cours-0pct.jpg` | État `uploading` : barre de progression, « Envoi en cours : 0% », titre, fichier et bouton « Envoi… » désactivés | 6 |
| `06-upload-en-cours-100pct-attente-reponse.jpg` | « Envoi en cours : 100% » : le fichier est entièrement envoyé, mais la réponse `201` n'est pas encore arrivée (le serveur cherche la pochette, environ 3 s). Les contrôles restent désactivés | 6 (progression ≠ réponse finale) |
| `07-upload-reussi.jpg` | État `success` : message de réussite, formulaire vidé, nouvelle piste en tête de liste | 6 |
| `08-upload-echec-400.jpg` | État `error` : le fichier a été remplacé dans la requête par un `text/plain` (contournement volontaire du frontend) → `400` « Format audio non accepté », contrôles réactivés | 6 |
| `09-journal-upload-multipart-progression.jpg` | `POST /api/tracks` multipart avec `audio = song2.mp3 (audio/mpeg, 6 405 141 o)` et `title`, header `Authorization` → événement de progression 100 % (6 405 441 / 6 405 441 octets) → `201` (environ 3,1 s plus tard) → `GET` de la page 1 | Vérification Network « upload et ses événements de progression » |

## Chronologie relevée (extrait du journal)

| t (ms) | Événement |
|---|---|
| 96 473 | `POST /api/tracks` (multipart `audio` + `title`, XHR) |
| 96 577 | progression d'envoi : 100 % |
| 99 696 | `201` reçu, puis `GET /api/tracks?page=1&limit=5` → `200` |
| 117 584 | `confirm()` « Supprimer « Upload TP3 - progression » ? Cette action est irréversible. » |
| 117 585 | `DELETE /api/tracks/6abfcec7…` → `204` à 117 631, puis rechargement `GET` → `200` |
| 142 676 | `confirm()` sur la piste déjà supprimée |
| 142 678 | `DELETE /api/tracks/6abfcee6…` → `404`, puis rechargement `GET` → `200` |

## Console

20 messages relevés pendant toute la séance : des `[TracksPage] …` de niveau debug (pistes chargées, fichier sélectionné, piste envoyée ou supprimée avec son id) et 2 erreurs, toutes deux attendues :
- `[TracksPage] Suppression impossible 404` (cas de la capture 04) ;
- `[TracksPage] Envoi impossible …` (le `400` volontaire de la capture 08).

Aucun mot de passe ni JWT n'apparaît dans la console.

## Limites

- **Un seul événement de progression.** En local, 6 Mo partent en 0,1 s environ : le navigateur n'émet qu'un événement, à 100 %. Pour voir la progression monter de 0 à 100 %, il faut limiter le débit dans DevTools (Network → « Slow 4G »), ce que l'extension Chrome ne permet pas de faire.
- **Pas de capture du panneau Network ni de la console DevTools** : l'extension capture uniquement le contenu de l'onglet.
- Ces captures ne couvrent pas les tests automatisés ni `npm run build` : leurs résultats sont dans `docs/RAPPORT_TESTS_TP3.md`.
