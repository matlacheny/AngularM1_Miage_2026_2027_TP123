# Rapport d'usage de l'IA - TP3

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

Assistant utilisé : Claude Opus 5.5 (`claude-opus-5-5`), dans l'extension VS Code de Claude Code.

**Prompt principal (commun aux trois missions)** : « Intègre les features demandés dans le td3 ».

**Plan proposé par l'agent** :
1. Lire `SUJET_ETUDIANT_TP3.md` et comparer avec l'existant. Une partie avait déjà été faite en améliorations facultatives du TP2 : bouton de suppression avec `confirm()`, barre de progression, `withXhr()`.
2. Compléter uniquement les manques : SnackBar Angular Material, état de suppression, cas 404, état d'upload explicite.
3. Ajouter les tests frontend (Vitest, via le builder `@angular/build:unit-test` déjà configuré) et les tests backend facultatifs.
4. Vérifier avec `npm test` (frontend et backend) et `npm run build`.

Le backend n'a pas été modifié pour le TP3 (seuls des tests ont été ajoutés).

---

## Mission 5 — Suppression d'une piste

**Objectif** : action « Supprimer » par card, confirmation, état de suppression (pas de double clic), message de succès ou d'erreur par SnackBar, mise à jour de la page, gestion d'une piste disparue ou appartenant à un autre utilisateur.

**Composant et service concernés** : `TracksPageComponent.remove()` (`components/tracks-page/tracks-page.ts`) appelle `TrackService.delete(id)` (`shared/services/track.service.ts`), qui seul utilise `HttpClient.delete('/api/tracks/:id')`. Le composant n'injecte pas `HttpClient`.

**Ce qui existait déjà (TP2)** : bouton, `confirm()`, appel `DELETE`, rechargement, recul d'une page si la page devient vide, arrêt de la lecture si la piste supprimée était en cours.

**Ce qui a été ajouté** :
- **SnackBar** : installation de `@angular/material` et `@angular/cdk` 22.1, thème `azure-blue` ajouté dans `angular.json`. Le message d'erreur sous la liste est remplacé par `MatSnackBar.open(...)`, pour le succès comme pour l'erreur.
- **État de suppression** : Signal `deletingId`. Pendant une suppression, tous les boutons « Supprimer » sont désactivés, celui de la piste concernée affiche « Suppression… » (`aria-busy`), et son bouton de lecture est désactivé. `remove()` vérifie aussi `deletingId()` au début : le `[disabled]` du template n'est qu'un confort, la vraie garantie est dans la classe.
- **Piste disparue ou d'un autre utilisateur** : le backend répond `404` dans les deux cas, sans révéler si la piste existe chez quelqu'un d'autre. Le composant affiche « n'existe plus ou ne vous appartient pas », arrête la lecture si besoin et recharge la liste (méthode `refreshAfterRemoval()`, partagée avec le cas de succès).
- Le bouton affiche désormais le texte « Supprimer » au lieu de l'icône seule.
- Le `401` n'est pas traité ici : `errorInterceptor` s'en charge déjà (déconnexion et redirection vers `/login`).

**Pourquoi le guard et l'interface ne suffisent pas** : tout le code Angular s'exécute dans le navigateur de l'utilisateur. Le guard ne fait que masquer une route ; un bouton désactivé se réactive dans les DevTools ; et n'importe qui peut appeler `DELETE /api/tracks/:id` avec `curl` sans passer par Angular. La protection réelle est côté backend : le middleware `auth` vérifie la signature et l'expiration du JWT (`401` sinon), puis `Track.findOneAndDelete({ _id, ownerId: req.auth.sub })` ne supprime que si la piste appartient à l'utilisateur du token (`404` sinon). L'identité vient du JWT signé, jamais d'un paramètre envoyé par le client.

## Mission 6 — Progression de l'upload

**Objectif** : distinguer l'absence d'upload, l'upload en cours avec pourcentage, la réussite et l'échec ; désactiver les contrôles ; empêcher une seconde soumission.

**Ce qui existait déjà (TP2)** : `reportProgress: true` et `observe: 'events'` dans `TrackService.upload()`, `<progress>`, contrôles désactivés, `withXhr()` (le backend `fetch` par défaut d'Angular 22 n'émet pas d'événements de progression d'upload).

**Ce qui a été ajouté** : un état explicite `uploadStatus = signal<'idle' | 'uploading' | 'success' | 'error'>`, avec `uploading` dérivé par `computed()`. Le template utilise `@switch (uploadStatus())` pour afficher un seul état à la fois. La progression passe à 100 % en cas de succès et repart à 0 en cas d'échec.

**Calcul du pourcentage** : pendant l'envoi, `XMLHttpRequest` émet des événements `progress`, qu'Angular transforme en `HttpEventType.UploadProgress` avec `loaded` (octets envoyés) et `total` (taille totale, si connue). Le composant calcule `Math.round(100 * loaded / total)` et ignore l'événement si `total` est inconnu.

**Pourquoi ce n'est pas une requête « réponse finale » classique** : avec `observe: 'events'`, l'Observable émet plusieurs valeurs de types différents (`Sent`, `UploadProgress` plusieurs fois, `ResponseHeader`, puis `Response` avec le corps). Le `next` doit donc tester `event.type` et ne traiter le succès que sur `HttpEventType.Response`. Avec un `post()` simple, `next` ne reçoit qu'une fois le corps JSON. L'état de l'interface évolue pendant la requête, et pas seulement à la fin.

**Données sensibles** : vérification par recherche de tous les `console.*` du frontend. Aucun log ne contient le mot de passe ou le JWT. L'erreur de suppression ne journalise plus que le statut HTTP.

## Mission 7 — Tests automatisés

**Objectif** : au moins trois tests frontend, qui vérifient URL, méthode, paramètres, headers et résultats, sans backend ni MongoDB. Extension backend facultative.

**Ce qui a été fait** : 15 tests frontend couvrant les 7 cas proposés par le sujet, et 9 tests backend couvrant les 6 cas de l'extension. Le détail des résultats attendus et observés est dans [`docs/RAPPORT_TESTS_TP3.md`](docs/RAPPORT_TESTS_TP3.md).

**Configuration ajoutée** : `tsconfig.spec.json` (types `vitest/globals`), options `buildTarget` et `tsConfig` de la cible `test` dans `angular.json` (sans quoi `ng test` cherchait une configuration `development` absente), `jsdom` en dépendance de développement, et exclusion des `*.spec.ts` dans `tsconfig.app.json` pour qu'ils n'entrent pas dans le build de l'application.

**Pourquoi les tests HTTP n'ont pas besoin de MongoDB** : côté frontend, `provideHttpClientTesting()` remplace le backend HTTP d'Angular : les requêtes sont interceptées par `HttpTestingController`, et le test fournit lui-même la réponse (`flush`, `event`). Rien ne sort sur le réseau. Côté backend, `createApp()` construit l'application Express sans se connecter à MongoDB, et les quelques méthodes du modèle `Track` sollicitées sont remplacées par des faux le temps d'un test.

**Ce que vérifie un test d'intercepteur ou de guard** : le test d'intercepteur vérifie que la requête qui part réellement (`req.request.headers`) porte `Authorization: Bearer <token>` quand un token existe, et aucun header sinon. Le test de guard l'exécute dans un contexte d'injection et vérifie qu'il renvoie un `UrlTree` vers `/login` sans token, et `true` avec.

**Test unitaire ou test d'intégration** : un test unitaire isole une seule unité (`TrackService`, `authGuard`) et simule tout le reste, ici le HTTP. Il est rapide et indique précisément ce qui casse. Un test d'intégration fait travailler plusieurs couches réelles ensemble. Les tests de `contract.test.js` en sont un exemple partiel : vraie application Express, vrais middlewares `auth` et Multer, vraie requête HTTP, seule la base est simulée. Ils détectent des erreurs d'assemblage (ordre des middlewares, gestionnaire d'erreurs) qu'un test unitaire ne voit pas.

**Erreurs ou propositions rejetées** :
- La première exécution de `ng test` échouait (configuration `development` absente) : corrigé dans `angular.json`.
- La fixture de test contenait un champ `ownerId` qui n'existe pas dans l'interface `Track` du frontend : TypeScript l'a refusé, le champ a été retiré.
- Utilité des tests vérifiée : en retirant temporairement la protection contre le double clic, le test de suppression échoue bien.

---

## Fichiers effectivement modifiés

- `frontend-starter/src/app/components/tracks-page/tracks-page.ts` et `.html` (SnackBar, `deletingId`, 404, `uploadStatus`, `@switch`)
- `frontend-starter/angular.json` (thème Material, options de test)
- `frontend-starter/package.json`, `package-lock.json` (`@angular/material`, `@angular/cdk`, `jsdom`)
- `frontend-starter/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` (nouveau)
- 5 fichiers `*.spec.ts` (nouveaux) : `auth.service`, `track.service`, `auth.interceptor`, `auth.guard`, `tracks-page`
- `backend/test/contract.test.js` (nouveau, `api.test.js` inchangé)
- `docs/RAPPORT_TESTS_TP3.md`, `rapport_ia_tp3.md` (nouveaux)

## Preuve de fonctionnement

- `npm test` frontend : 15 tests sur 15 réussis. `npm test` backend : 11 sur 11.
- `npm run build` : succès.
- **À compléter par le binôme** : capture Network d'un `DELETE /api/tracks/:id` (204) après confirmation, et d'un `POST /api/tracks` avec la progression visible (limiter le débit dans DevTools, « Slow 4G »). Vérifier aussi la console : pas d'erreur inattendue, pas de donnée sensible. Ces vérifications dans le navigateur n'ont pas été faites par l'agent.

## Ce que chaque membre sait maintenant expliquer sans l'agent

*(À remplir individuellement par chaque membre du binôme, avec ses propres mots, à partir des 6 points de la restitution orale.)*
