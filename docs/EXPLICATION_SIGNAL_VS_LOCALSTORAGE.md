# Signal vs `localStorage` — différence

Ces deux mécanismes stockent tous les deux une donnée, mais à des niveaux très différents.

**Un Signal Angular** (ex. `AuthService.currentUser`, `AuthService.token`) est un conteneur de valeur **réactif, en mémoire, côté JavaScript**. Quand sa valeur change (`.set(...)`), Angular sait automatiquement quels bouts de template en dépendent et les rafraîchit — c'est ce qui fait qu'en modifiant le profil sur `/profile`, le nom affiché dans la nav (`AppComponent`) se met à jour instantanément sans rien recharger : les deux lisent le même Signal `auth.currentUser()`. Un Signal ne survit pas à un rechargement de page ni à la fermeture de l'onglet : il repart de zéro (`signal(null)` ou relu depuis `localStorage` au démarrage du service, selon le code).

**`localStorage`** est un stockage **persistant du navigateur**, propre à l'origine (domaine), qui survit aux rechargements de page et à la fermeture du navigateur. Il ne déclenche aucune mise à jour automatique de l'affichage : lire `localStorage.getItem('gpc_token')` renvoie une chaîne figée à l'instant de la lecture, pas une valeur observable. C'est un stockage passif, fait pour la persistance, pas pour la réactivité.

Dans ce projet, les deux sont utilisés ensemble et pour des raisons complémentaires :

- `localStorage['gpc_token']` conserve le JWT **entre deux visites** (l'utilisateur reste connecté après avoir fermé l'onglet).
- Le Signal `token` (initialisé depuis `localStorage` au démarrage de `AuthService`) sert de **source réactive pendant que l'app tourne** : c'est lui que lit l'`authInterceptor` à chaque requête, et lui que teste `authGuard` pour autoriser une route.
- Le Signal `currentUser` n'est, lui, jamais persisté : il est reconstruit à chaque connexion ou à chaque chargement de `/api/users/me`, donc perdu au rechargement de page tant que le profil n'a pas été rechargé — ce que fait justement l'auto-chargement ajouté dans `ProfilePageComponent`.

En résumé : `localStorage` répond à la question « qu'est-ce qui doit survivre à un rechargement ? », le Signal répond à la question « qu'est-ce que l'interface doit refléter en temps réel ? ». Les deux se complètent, ils ne sont pas interchangeables.
