# Checkpoint Mission 1 — observations Network

Tests réalisés en direct dans le navigateur (frontend `http://localhost:4200`, backend `http://localhost:3000`, compte `demo@example.com`), le 2026-09-17. Session Network de l'onglet Network du navigateur.

## 1. Connexion refusée (mauvais mot de passe)

| Champ | Valeur |
|---|---|
| Méthode / URL | `POST /api/auth/login` |
| Corps envoyé | `{"email":"demo@example.com","password":"••• (mot de passe volontairement erroné)"}` |
| Authorization | absent (route publique, avant obtention d'un token) |
| Statut | `401 Unauthorized` |
| Réponse | `{"message":"Identifiants incorrects"}` |
| Effet côté UI | Message "Identifiants incorrects" affiché sous le formulaire (Signal `error` de `LoginPageComponent`) ; pas de redirection (l'`errorInterceptor` ignore les 401 sans header `Authorization`) |

## 2. Connexion réussie

*Capture d'écran : [`screenshots/login-network-headers.png`](screenshots/login-network-headers.png) · [`screenshots/login-network-body.png`](screenshots/login-network-body.png)*

| Champ | Valeur |
|---|---|
| Méthode / URL | `POST /api/auth/login` |
| Corps envoyé | `{"email":"demo@example.com","password":"Demo1234!"}` |
| Authorization | absent (c'est cette requête qui obtient le token) |
| Statut | `200 OK` |
| Réponse | `{"token":"<JWT>","user":{"id":"...","name":"Demo","email":"demo@example.com","createdAt":"..."}}` (token non journalisé, conformément à la consigne) |
| Effet côté UI | Redirection vers `/tracks` ; token stocké dans `localStorage['gpc_token']` ; Signals `token` et `currentUser` mis à jour ; nav affiche "Profil (Demo)" + "Se déconnecter" |
| Requête suivante déclenchée | `GET /api/tracks?page=1&limit=5` → `200 OK`, avec `Authorization: Bearer <token>` cette fois (ajouté par `authInterceptor`) |

## 3. Lecture puis modification de `/api/users/me`

| Champ | Valeur (GET) | Valeur (PUT) |
|---|---|---|
| Méthode / URL | `GET /api/users/me` | `PUT /api/users/me` |
| Corps envoyé | — | `{"name":"Demo Test TP1"}` |
| Authorization | présent (`Bearer <token>`) | présent (`Bearer <token>`) |
| Statut | `200 OK` | `200 OK` |
| Réponse | `User` (name, email, createdAt) | `User` mis à jour |
| Effet côté UI | Chargement automatique à l'arrivée sur `/profile` (sans clic) ; formulaire pré-rempli | Nom mis à jour instantanément dans la page ET dans la nav (Signal `currentUser` partagé) |

Nom remis à `Demo` après test pour ne pas polluer le compte de démo partagé.

## 4. Bonus — token invalide / expiré (gestion du 401 sur route protégée)

| Champ | Valeur |
|---|---|
| Scénario | Token remplacé par une valeur invalide (`localStorage.setItem('gpc_token', 'token.invalide.corrompu')`), puis navigation vers `/profile` |
| Méthode / URL | `GET /api/users/me` |
| Authorization | présent (`Bearer token.invalide.corrompu`) |
| Statut | `401 Unauthorized` |
| Effet côté UI | `errorInterceptor` détecte le 401 sur une requête authentifiée → `AuthService.logout()` (localStorage vidé, Signals remis à `null`) → redirection automatique vers `/login` |

## Résumé

Les trois observations minimales demandées par le Checkpoint (connexion réussie, connexion refusée, lecture/modification de `/api/users/me`) sont vérifiées et fonctionnelles, ainsi que le cas supplémentaire de gestion du token invalide (Mission 1, dernier point de la checklist).

**Note sur les captures d'écran** : les échanges ci-dessus ont été observés et vérifiés en direct par l'agent dans le navigateur (bridge vers l'ordinateur), mais l'outil de contrôle du navigateur ne permet pas d'exporter les copies d'écran sous forme de fichiers image exploitables dans le dépôt. Pour le livrable "capture Network" à proprement parler, reproduire rapidement le test n°2 ou n°3 et faire une capture d'écran (Win+Maj+S) de l'onglet Network des DevTools.
