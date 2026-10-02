# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5&title=` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` (AVANCÉ, facultatif — pagination Mongoose via `mongoose-aggregate-paginate-v2`, voir `backend/src/models/Track.js` et `backend/src/app.js`) contient `docs` (les pistes de la page), `totalDocs`, `limit`, `page`, `totalPages`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage` et `nextPage`. C'est la forme renvoyée nativement par le plugin ; elle remplace l'ancienne forme écrite à la main (`items`/`page`/`limit`/`total`/`pages`). Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

`title` (optionnel, sur `GET /tracks`) filtre par sous-chaîne du titre, insensible à la casse ; absent ou vide, aucun filtre n'est appliqué (comportement inchangé). Le filtre reste toujours restreint aux pistes du propriétaire authentifié.

`Track` inclut aussi `coverUrl` (`string | null`) : une pochette trouvée automatiquement à l'upload (AVANCÉ, facultatif) à partir des tags ID3 (artiste/titre) ou, à défaut, du nom de fichier, via l'API publique iTunes Search (aucune clé requise). `null` si aucune correspondance n'a été trouvée — l'upload réussit toujours même sans pochette. `coverUrl` pointe vers le CDN public d'Apple : contrairement à `/tracks/:id/audio`, aucun JWT n'est nécessaire pour la charger.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
