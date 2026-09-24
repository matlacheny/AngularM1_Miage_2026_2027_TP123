# Rapport d'usage de l'IA - TP1

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.


## Préparation — Fork, environnement et MongoDB Atlas

**Objectif** : forker le dépôt du TP, installer les dépendances, et faire fonctionner le backend en local avec une base MongoDB Atlas.

**Échanges avec l'agent** *(prompt principal découpé en étapes, dans l'ordre réel de la conversation)* :
1. « Installe-moi git, et fait moi un fork du github [...] » → l'agent constate que git est déjà installé, demande comment procéder pour le fork (accès au compte GitHub requis), puis clone le fork dans le dossier indiqué une fois l'URL du fork fournie.
2. « Lis ce fichier [ATLAS_SETUP.md] et fait les étapes demandées » → l'agent prépare `backend/.env` depuis `.env.example`, lance `npm install`, et refuse explicitement de demander l'URI/mot de passe MongoDB dans le chat (consigne de sécurité du fichier), en renvoyant la création du compte/cluster Atlas au binôme.
3. « Installe Node pour moi » → clarification nécessaire (Node déjà présent côté agent, mais pas sur la machine Windows) puis limite technique expliquée (contrôle d'ordinateur restreint : pas de frappe possible dans un terminal) ; installation manuelle guidée à la place.
4. Erreur PowerShell « exécution de scripts désactivée » collée par l'étudiant → résolue avec `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.
5. Erreur `MONGODB_URI manque` collée → diagnostic du BOM UTF-8 dans `.env`, corrigé par script.
6. Erreur `ETIMEDOUT` sur le port 27017 collée → série de questions/tests (VPN ? réseau universitaire ? pare-feu ? partage de connexion ?) pour isoler la cause par élimination.
7. « Le vpn ne tourne pas » puis « Je suis en partage de connexion » → réoriente le diagnostic vers le pare-feu Windows et les services de sécurité locaux (`Get-Service`, `Test-NetConnection`).
8. Résultats des tests collés par l'étudiant → confirmation que ni le pare-feu ni un agent tiers n'est en cause ; capture d'écran du cluster Atlas (actif) fournie en complément.
9. « J'ai changé de partage de connexion » + nouvelle erreur `querySrv EBADRESP`/`ECONNREFUSED` → diagnostic du DNS SRV mal supporté par l'opérateur, proposition de contourner via une URI `mongodb://` standard (hôtes explicites) plutôt que `mongodb+srv://`.
10. Deux allers-retours supplémentaires (BOM revenu après un nouvel enregistrement du `.env`, oubli du changement de schéma `mongodb+srv://` → `mongodb://`) corrigés directement par l'agent.

**Plan proposé par l'agent** : cloner le fork dans le dossier du projet, préparer `backend/.env` à partir de `.env.example`, installer les dépendances npm, puis guider la création manuelle du cluster Atlas (compte, projet, cluster gratuit, Network Access) — sans jamais demander l'URI/mot de passe MongoDB dans le chat.

**Erreurs rencontrées et corrigées** :
- `.env` sauvegardé avec un BOM UTF-8 (éditeur type Notepad) → Node lisait la clé comme préfixée d'un caractère invisible, jugée « manquante ». Corrigé à plusieurs reprises par script, avec recommandation de passer par VS Code plutôt que Notepad.
- Erreur PowerShell « l'exécution de scripts est désactivée » → résolue avec `Set-ExecutionPolicy`.
- `ETIMEDOUT` sur le port 27017 → diagnostic par élimination (VPN, réseau universitaire, pare-feu Windows, agents de sécurité tiers) confirmant un blocage réseau au niveau TCP, indépendant de Node/Mongoose.
- Changement de partage de connexion → `querySrv EBADRESP` puis `ECONNREFUSED` : DNS de l'opérateur gérant mal les enregistrements SRV et bloquant les DNS externes. Contournement par URI `mongodb://` standard avec hôtes explicites.
- Erreur `mongodb+srv URI cannot have multiple service names` : oubli de changer le schéma en même temps que la liste d'hôtes — corrigé.

**Vérifications réalisées par le binôme** : backend démarré sans erreur après le dernier correctif (schéma `mongodb://`) ; `npm install`/`npm start` exécutés par l'étudiant dans son propre terminal PowerShell (l'agent a explicitement évité de lancer `npm install` via son propre accès à l'ordinateur, ce dossier étant monté en réseau, ce qui aurait été anormalement lent et aurait installé des binaires Linux inutilisables sous Windows).

**Fichiers effectivement modifiés** : `backend/.env` (créé puis corrigé, jamais transmis à l'agent en clair).

**Preuve de fonctionnement** : `npm start` du backend démarré sans erreur de connexion MongoDB (confirmé indirectement par les tests Mission 1 ci-dessous, qui dépendent tous d'un backend connecté à Atlas : `/api/auth/login`, `/api/users/me`, `/api/tracks` répondent tous `200`/`401` selon le cas, jamais une erreur 500/backend indisponible). Capture de `GET /api/health` à ajouter par l'étudiant.

**Ce que chaque membre sait maintenant expliquer sans l'agent** : *(à remplir individuellement et honnêtement par chaque binôme — par exemple : pourquoi `mongodb+srv://` dépend d'une requête DNS SRV, pourquoi un `.env` avec BOM casse `--env-file`, comment lire une chaîne de connexion MongoDB standard).*

---

## Mission 1 — Inscription, connexion et profil

**Objectif** : compléter la partie utilisateur du frontend Angular (inscription, connexion, profil, déconnexion, gestion du 401), le code de base (formulaires, service, guard, interceptor JWT) étant déjà fourni dans `frontend-starter`.

**Échanges avec l'agent**  :
1. « Quelles sont les étapes qui restent à faire maintenant que MongoDB est configuré ? » → l'agent lit `SUJET_ETUDIANT_TP1.md` et résume la préparation restante et le contenu des Missions 0/1.
2. « Fait le travail présent dans le TP » → l'agent explore l'existant (routes, guard, interceptor, service, pages, `AGENTS.md`/`best-practices.md`/`API_CONTRACT.md`) avant de modifier quoi que ce soit, identifie les manques réels par rapport à la checklist de la Mission 1, puis implémente uniquement ces manques.
3. « Pourquoi la commande met-elle autant de temps à se lancer ? » (pendant une tentative de `npm install` lancée par l'agent lui-même via son accès à l'ordinateur) → l'agent explique la lenteur du dossier monté en réseau et le risque de binaires Linux incompatibles, et redirige l'installation vers le terminal de l'étudiant.
4. « J'ai buildé le frontend » + sortie de `npm run build` collée → confirmation du build réussi.
5. « Pense à noter les tokens utilisés dans le rapport.md » / « Pense à rajouter les détails que tu as fait dans un fichier rapport.md » → mise à jour de `RAPPORT_IA_MODELE.md` avec le détail des missions et un graphique de répartition des tokens de la session.
6. « Fait les étapes de capture d'écrans et de test. » → tests fonctionnels réalisés directement dans le navigateur (bridge vers l'ordinateur de l'étudiant), résultats consignés dans `docs/CHECKPOINT_MISSION1.md`
7. « Pourquoi Angular n'appelle-t-il jamais MongoDB directement, et qu'est-ce que ça implique pour la sécurité si on comparait avec une app qui le ferait ? » → question sur l'architecture générale (cf. Mission 0), posée pour vérifier la compréhension du flux composant → service → API → MongoDB :
> Angular s'exécute entièrement dans le navigateur de l'utilisateur, donc tout son code et toute requête réseau qu'il émet sont inspectables par cet utilisateur (DevTools, etc.). Une connexion MongoDB nécessite des identifiants (URI + mot de passe) donnant un accès large à la base ; si ce code tournait côté Angular, ces identifiants devraient être embarqués dans le bundle JS envoyé à **chaque** visiteur — n'importe qui pourrait alors les extraire et se connecter directement à la base avec les mêmes droits, en contournant entièrement l'authentification et l'autorisation de l'API (lire/modifier les données de n'importe quel utilisateur). En gardant MongoDB derrière Express, les identifiants restent uniquement côté serveur (`backend/.env`, jamais transmis au navigateur — exactement ce que rappelle `ATLAS_SETUP.md`), et le backend peut vérifier le JWT, n'autoriser un utilisateur qu'à agir sur ses propres données (`/api/users/me` s'appuie sur l'identité du token, pas sur un id fourni par le client), et valider les entrées avant qu'elles n'atteignent une requête MongoDB (protection contre l'injection NoSQL, cf. `backend/AGENTS.md`).
8. « Que se passe-t-il concrètement dans `authInterceptor` : à quel moment le header `Authorization` est-il ajouté, et pourquoi ne l'est-il jamais sur `/auth/login` ? » → question sur le mécanisme JWT ajouté en Mission 1 :
> `authInterceptor` est enregistré dans `provideHttpClient(withInterceptors([...]))` (`main.ts`) et s'exécute donc sur **chaque** requête HTTP sortante. Son fonctionnement est simple : il lit `AuthService.token()` (le Signal), et si une valeur existe, il clone la requête en ajoutant `Authorization: Bearer <token>` ; sinon il laisse la requête inchangée. Il n'y a **aucune exclusion explicite** de `/auth/login` dans le code — le header est absent sur cette route simplement parce qu'au moment où l'utilisateur soumet le formulaire de connexion, le Signal `token` vaut encore `null` (pas de session en cours). C'est donc une conséquence du flux d'usage (on ne visite `/login` que déconnecté), pas une règle codée en dur — un point à garder en tête si l'app évoluait (ex. reconnexion sous un autre compte sans déconnexion préalable enverrait le vieux token par erreur).
9. « Pourquoi `errorInterceptor` vérifie-t-il la présence du header `Authorization` avant de rediriger sur un 401, plutôt que de rediriger sur n'importe quel 401 ? » → suite logique sur la gestion du 401, l'un des points requis par la checklist de la Mission 1 :
> Parce qu'un `401` peut survenir dans deux situations très différentes : (1) un identifiant/mot de passe invalide sur `/auth/login` ou `/auth/register` — ces requêtes ne portent jamais de header `Authorization`, puisqu'il n'y a pas encore de session ; (2) un token expiré ou invalide sur une route protégée (`/api/users/me`, `/api/tracks`, ...) — ces requêtes portent toujours le header, ajouté par `authInterceptor`. Rediriger sur *tout* 401 confondrait ces deux cas : une simple erreur de mot de passe déclencherait une déconnexion/redirection inutile, alors que ce cas est déjà géré proprement par le `subscribe({error})` du composant de connexion (message "Identifiants incorrects"). Vérifier `request.headers.has('Authorization')` permet de ne déclencher la déconnexion globale que pour le cas (2), le seul qui corresponde réellement à une session compromise.
10. « Où est stocké le JWT côté navigateur, et quel risque de sécurité ça pose (XSS) comparé à un cookie `httpOnly` ? » → question de sécurité sur le choix `localStorage` fait par le code fourni :
> Le token est stocké dans `localStorage`, sous la clé `gpc_token` (`AuthService.storeAuthentication` / lecture initiale du Signal `token`). `localStorage` est lisible par **n'importe quel script JavaScript** exécuté sur la page — donc si l'application était vulnérable à une faille XSS (injection de script via une entrée utilisateur mal échappée, par exemple), un script malveillant pourrait faire `localStorage.getItem('gpc_token')` et exfiltrer le token vers un serveur tiers. Un cookie `httpOnly`, à l'inverse, est totalement invisible pour JavaScript (ni `document.cookie` ni aucune API ne peut le lire) : même en cas de XSS, le token resterait inaccessible au script injecté. En contrepartie, un cookie `httpOnly` est envoyé automatiquement par le navigateur à chaque requête vers le même domaine, ce qui ouvre un autre risque (CSRF) nécessitant sa propre protection (`SameSite`, jeton CSRF...). Pour ce TP, le choix `localStorage` + header `Authorization` est plus simple à mettre en œuvre et suffisant pédagogiquement, mais ce compromis de sécurité mérite d'être identifié.
11. « Que renvoie `Validators.email`, et est-ce suffisant pour garantir qu'un email est valide côté métier ? » → question sur la validation des formulaires réactifs (inscription/connexion) :
> `Validators.email` est une fonction de validation Reactive Forms qui teste la valeur du contrôle contre une expression régulière approximant la syntaxe d'une adresse email ; si ça ne correspond pas, le contrôle reçoit une erreur `{ email: true }` et devient invalide. Ce n'est **pas suffisant** côté métier : c'est une vérification purement syntaxique — elle accepte par exemple `test@domaine-qui-nexiste-pas.test` sans vérifier qu'un tel domaine ou une telle boîte existe réellement, et elle ne sait absolument rien de l'unicité en base. C'est justement pour ça que le contrat prévoit une erreur `409` côté backend (« email déjà utilisé ») : cette règle métier ne peut être vérifiée que côté serveur, puisqu'elle dépend des données déjà présentes dans MongoDB. `Validators.email` sert donc de premier filtre UX (retour immédiat sans requête réseau), pas de garantie de validité.
12. « Pourquoi le contrat distingue-t-il `POST /tracks` (multipart) des autres routes en JSON — qu'est-ce que ça change dans le code Angular pour l'upload ? » → question sur une route du contrat (`API_CONTRACT.md`) non couverte par la Mission 1 elle-même mais utile pour la suite du projet :
> Les routes JSON échangent des objets simples (chaînes, nombres) qu'`HttpClient` sérialise automatiquement en `application/json`. Un fichier audio est une donnée binaire : l'encoder en JSON (base64) gonflerait sa taille d'environ 33 % et compliquerait le traitement côté serveur. Le format standard pour envoyer un fichier accompagné d'autres champs est `multipart/form-data`, qui empaquette plusieurs « parties » (une pour le fichier, une pour le titre) dans une seule requête. Côté Angular, ça change concrètement le code d'appel : au lieu de passer un objet JS, `TrackService.upload()` construit un `FormData` (`body.append('audio', file); body.append('title', title)`) et le passe tel quel à `HttpClient.post`. Point important : on ne fixe **jamais** manuellement le header `Content-Type` sur cette requête — c'est le navigateur qui le fait, car il doit y inclure un `boundary` (délimiteur) généré dynamiquement que l'app ne peut pas connaître à l'avance ; le fixer soi-même casserait le parsing côté backend (Multer, mentionné dans `backend/AGENTS.md`).

**Plan proposé par l'agent** :
1. Explorer l'existant et les consignes avant de modifier quoi que ce soit.
2. Comparer l'existant à la checklist de la Mission 1 pour repérer ce qui manquait réellement : gestion globale du 401, navigation conditionnelle + bouton de déconnexion, chargement automatique du profil.
3. Implémenter uniquement les manques, en conservant le style et les conventions déjà en place (Signals, `inject()`, blocs `subscribe({next, error})` explicites, pas de `any`).
4. Vérifier avec `npm run build`, puis tester manuellement dans le navigateur.

**Détail des ajouts** :
- `src/app/shared/interceptors/error.interceptor.ts` (nouveau) : intercepte les réponses `401` ; si la requête portait un header `Authorization` (donc token invalide/expiré), déconnecte l'utilisateur (`AuthService.logout()`) et redirige vers `/login` ; sinon laisse l'erreur remonter telle quelle (cas d'un login/register refusé, déjà géré par le composant).
- `src/main.ts` : enregistrement du nouvel interceptor à côté de `authInterceptor`.
- `src/app/components/app/app.ts` et `app.html` : navigation conditionnelle — liens Connexion/Inscription si non connecté, lien Profil (avec le nom si chargé) + bouton « Se déconnecter » si connecté, basé sur les Signals `auth.token()` / `auth.currentUser()`.
- `src/app/components/profile-page/profile-page.ts` : chargement de `/api/users/me` déclenché automatiquement à l'arrivée sur la page (dans le constructeur, comme `TracksPageComponent`), en plus du bouton de rechargement manuel.

**Erreurs ou propositions rejetées** : aucune proposition rejetée à ce stade — l'implémentation suit strictement les conventions déjà présentes dans le dépôt (`AGENTS.md`/`best-practices.md`), sans modifier le contrat HTTP ni le backend.

**Vérifications réalisées par le binôme** : `npm run build` exécuté par l'étudiant — build réussi sans erreur (« Application bundle generation complete »). Tests fonctionnels complets réalisés dans le navigateur (voir `docs/CHECKPOINT_MISSION1.md`) : connexion refusée (401 + message d'erreur), connexion réussie (redirection + nav mise à jour), chargement automatique du profil, modification du nom (PUT, propagation instantanée via Signal), déconnexion, et redirection automatique sur token invalide.

**Fichiers effectivement modifiés** :
- `frontend-starter/src/app/shared/interceptors/error.interceptor.ts` (nouveau)
- `frontend-starter/src/main.ts`
- `frontend-starter/src/app/components/app/app.ts`
- `frontend-starter/src/app/components/app/app.html`
- `frontend-starter/src/app/components/profile-page/profile-page.ts`
- [`docs/MISSION0_CARTOGRAPHIE.md`](docs/MISSION0_CARTOGRAPHIE.md), [`docs/mission0-schema-connexion.svg`](docs/mission0-schema-connexion.svg) (Mission 0)
- [`docs/CHECKPOINT_MISSION1.md`](docs/CHECKPOINT_MISSION1.md) (preuves de test Mission 1)
- [`docs/EXPLICATION_SIGNAL_VS_LOCALSTORAGE.md`](docs/EXPLICATION_SIGNAL_VS_LOCALSTORAGE.md) (livrable « différence Signal / localStorage »)

**Preuve de fonctionnement** : sortie de `npm run build` (bundle généré, 295 kB, 7.4s). Tests Network détaillés dans `docs/CHECKPOINT_MISSION1.md` : les 3 observations minimales du Checkpoint (connexion réussie, connexion refusée, lecture/modification de `/api/users/me`) plus le cas du token invalide, tous vérifiés avec méthode/URL/statut/réponse/présence d'`Authorization`. Capture d'écran de la requête d'authentification fournie par l'étudiant (DevTools → Network → `POST /api/auth/login` → 200) : [`docs/screenshots/login-network-headers.png`](docs/screenshots/login-network-headers.png) (en-têtes, statut 200) et [`docs/screenshots/login-network-body.png`](docs/screenshots/login-network-body.png) (corps de la requête JSON). Captures des autres scénarios (401, profil, déconnexion, token invalide) non fournies en image : couvertes textuellement dans `docs/CHECKPOINT_MISSION1.md`, à compléter en image si le rendu l'exige.

**Ce que chaque membre sait maintenant expliquer sans l'agent** :
Je comprends désormais l'architecture générale du projet, c'est-à-dire le flux qui va du composant Angular au service, puis à l'API Express, puis à MongoDB. Je sais expliquer pourquoi Angular ne se connecte jamais directement à la base de données, puisque son code tourne dans le navigateur et serait donc visible par n'importe qui si les identifiants MongoDB y étaient embarqués. Je comprends également le rôle d'authInterceptor, qui ajoute automatiquement le header Authorization à chaque requête sortante dès qu'un token est présent dans le signal AuthService, ainsi que la raison pour laquelle errorInterceptor ne redirige vers /login que lorsque la requête en échec portait déjà ce header, ce qui permet de distinguer une simple erreur d'identifiants d'une session réellement expirée. Je sais où est stocké le JWT côté navigateur (localStorage) et quel risque de sécurité cela représente en cas de faille XSS, par comparaison avec un cookie httpOnly. Je peux également expliquer que Validators.email n'effectue qu'une vérification syntaxique côté frontend, insuffisante pour garantir l'unicité d'un email, ce qui justifie la vérification finale côté serveur via une erreur 409. Enfin, je comprends pourquoi l'upload d'une piste audio passe par multipart/form-data plutôt que par du JSON classique, notamment pour éviter le surcoût d'un encodage base64 et pour laisser le navigateur gérer lui-même le boundary du header Content-Type.
---

## Suivi de consommation (assistant IA)

Pour cette session (fork + dépannage MongoDB + Mission 1 + tests), répartition approximative de la consommation, pondérée par coût réel (tokens régénérés/relus comptant plus lourd que le contexte simplement mis en cache) :

| Catégorie | Part |
|---|---|
| Instructions système de l'agent (relues à chaque tour) | ~65 % |
| Conversation et dépannage (lecture des erreurs, réponses) | ~28 % |
| Actions sur l'ordinateur (commandes, navigateur) | ~6 % |
| Lecture/écriture des fichiers du projet | ~1 % |


