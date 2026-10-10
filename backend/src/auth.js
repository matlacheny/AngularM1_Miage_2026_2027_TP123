import jwt from "jsonwebtoken";

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
export const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// Durée de vie d'une URL de lecture : assez longue pour démarrer une vidéo et
// s'y déplacer, assez courte pour qu'une URL copiée devienne vite inutile.
export const STREAM_TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
export function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/**
 * Crée un jeton de lecture limité à UN média et à la seule lecture du fichier.
 * Les balises <audio>, <video> et <img> ne peuvent pas envoyer d'en-tête
 * Authorization : le jeton passe donc dans l'URL (?token=...). Le champ
 * `scope` empêche de réutiliser ce jeton sur le reste de l'API.
 */
export function streamToken(userId, mediaId) {
  console.log(`[auth] Création d'un jeton de lecture pour le média ${mediaId}`);
  return jwt.sign({ sub: userId, mid: mediaId, scope: "stream" }, SECRET, {
    expiresIn: STREAM_TOKEN_TTL_SECONDS,
  });
}

/** Middleware Express qui protège les routes privées. */
export function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
  // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
  // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    const payload = jwt.verify(raw.slice(7), SECRET);

    // Un jeton de lecture (scope "stream") ne donne pas accès au reste de l'API.
    if (payload.scope) {
      console.warn(`[auth] Jeton à portée limitée refusé pour ${req.method} ${req.path}`);
      return res.status(401).json({ message: "Jeton invalide ou expiré" });
    }

    req.auth = payload;
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/**
 * Variante pour la lecture d'un fichier : accepte soit l'en-tête Authorization
 * habituel, soit un jeton de lecture `?token=` émis pour CE média précis.
 */
export function authOrStreamToken(req, res, next) {
  if (req.headers.authorization) return auth(req, res, next);

  const raw = typeof req.query.token === "string" ? req.query.token : "";
  if (!raw) {
    console.warn(`[auth] Ni Authorization ni jeton de lecture pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    const payload = jwt.verify(raw, SECRET);
    if (payload.scope !== "stream" || payload.mid !== req.params.id) {
      console.warn(`[auth] Jeton de lecture non valable pour le média ${req.params.id}`);
      return res.status(401).json({ message: "Jeton invalide ou expiré" });
    }

    req.auth = { sub: payload.sub };
    console.log(`[auth] Jeton de lecture accepté pour ${payload.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Jeton de lecture invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}
