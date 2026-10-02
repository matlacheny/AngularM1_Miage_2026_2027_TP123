import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Échappe les caractères spéciaux d'une regex pour utiliser une recherche
 * texte libre (filtre par titre) sans risquer une injection dans la requête
 * MongoDB ni une regex dégénérée fournie par l'utilisateur.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * À défaut de tags ID3 exploitables, dérive un terme de recherche à partir
 * du nom de fichier original (ex. "Artist - Title.mp3" -> "Artist Title").
 */
function deriveSearchTermFromFilename(originalName) {
  const base = path.basename(originalName, path.extname(originalName));
  return base.replace(/[_\-]+/g, " ").trim();
}

/**
 * Recherche automatique de pochette (AVANCÉ, facultatif) : lit les tags ID3
 * du fichier audio via `music-metadata` (artiste/titre), et à défaut utilise
 * le nom de fichier ; interroge ensuite l'API publique iTunes Search (aucune
 * clé requise) pour trouver une image d'illustration correspondante.
 *
 * Ne doit jamais faire échouer l'upload : toute erreur (parsing, réseau,
 * aucun résultat) est capturée ici et se traduit simplement par `null`.
 */
async function findCoverUrl(filePath, originalName) {
  try {
    const metadata = await parseFile(filePath, { duration: false, skipCovers: true });
    const { artist, title } = metadata.common;
    const searchTerm = artist && title ? `${artist} ${title}` : deriveSearchTermFromFilename(originalName);

    if (!searchTerm) {
      console.log("[cover] Aucun terme de recherche exploitable, pochette ignorée");
      return null;
    }

    console.log(`[cover] Recherche de pochette pour "${searchTerm}"`);
    const url = `https://itunes.apple.com/search?media=music&limit=1&term=${encodeURIComponent(searchTerm)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[cover] Réponse iTunes Search inattendue : ${response.status}`);
      return null;
    }

    const data = await response.json();
    const artwork = data.results?.[0]?.artworkUrl100;

    if (!artwork) {
      console.log(`[cover] Aucune pochette trouvée pour "${searchTerm}"`);
      return null;
    }

    // iTunes ne renvoie qu'une vignette 100x100 par défaut ; remplacer ce
    // segment de l'URL est la façon documentée d'obtenir une résolution plus
    // grande depuis le même CDN public, sans appel supplémentaire.
    const highRes = artwork.replace("100x100bb", "600x600bb");
    console.log(`[cover] Pochette trouvée pour "${searchTerm}"`);
    return highRes;
  } catch (error) {
    console.error("[cover] Recherche de pochette impossible", error);
    return null;
  }
}

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
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
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // Seuls les types MIME audio demandés dans le sujet sont acceptés.
    if (allowed.has(file.mimetype)) {
      console.log(`[multer] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format audio non accepté");
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /**
   * Retourne une page des pistes appartenant exclusivement à l'utilisateur.
   * Le paramètre optionnel `title` filtre par sous-chaîne du titre,
   * insensible à la casse (amélioration facultative du TP2).
   */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const titleQuery = typeof req.query.title === "string" ? req.query.title.trim() : "";
      // Contrairement à Track.find(), une agrégation ($match) ne caste jamais
      // automatiquement une chaîne en ObjectId : il faut le faire explicitement,
      // sinon le filtre ne correspond à aucun document (ownerId est stocké en
      // ObjectId dans MongoDB, req.auth.sub est une chaîne issue du JWT).
      const filter = { ownerId: new Types.ObjectId(req.auth.sub) };

      if (titleQuery) {
        filter.title = { $regex: escapeRegExp(titleQuery), $options: "i" };
      }

      console.log(
        `[tracks] Lecture page=${page}, limit=${limit}, title=${titleQuery || "(aucun)"}, user=${req.auth.sub}`,
      );

      // AVANCÉ (facultatif, TP2) : la pagination est déléguée au plugin
      // mongoose-aggregate-paginate-v2 plutôt qu'à un couple .skip()/.limit()
      // + .countDocuments() écrit à la main (l'ancienne implémentation).
      // Track.aggregate(...) construit le pipeline (filtre + tri + mise en
      // forme des champs publics) ; Track.aggregatePaginate(...) l'exécute et
      // y ajoute lui-même les métadonnées de pagination (total, nombre de
      // pages, etc.), calculées côté MongoDB dans la même requête agrégée.
      const aggregateQuery = Track.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        {
          $addFields: {
            id: { $toString: "$_id" },
            ownerId: { $toString: "$ownerId" },
          },
        },
        // storedName ne doit jamais quitter le serveur (comme avec
        // .select("-storedName") dans l'ancienne implémentation) ; _id et
        // __v sont retirés car remplacés par le champ `id` ci-dessus.
        { $project: { _id: 0, __v: 0, storedName: 0 } },
      ]);

      const result = await Track.aggregatePaginate(aggregateQuery, { page, limit });

      console.log(`[tracks] ${result.docs.length} piste(s) envoyée(s) sur ${result.totalDocs}`);

      // Le plugin renvoie directement un objet complet (docs, totalDocs,
      // totalPages, hasNextPage, hasPrevPage, ...) : contrairement à l'ancien
      // format ({items, page, limit, total, pages}), il n'y a plus besoin de
      // construire la réponse à la main. Voir API_CONTRACT.md pour le détail.
      res.json(result);
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio et le champ texte title.
   * upload.single("audio") traite un seul fichier et le place dans req.file,
   * tandis que req.body.title contient le champ texte associé.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur. 
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Le middleware upload.single("audio") traite le fichier audio envoyé dans le champ "audio" du formulaire
   * ou de l'appel depuis le frontend avec un objet FormData.
   * Si le fichier est accepté, il est stocké sur le disque et ses métadonnées sont enregistrées 
   * dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || req.file.originalname,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });

        console.log(`[tracks] Upload enregistré : ${track.id}`);

        // La recherche de pochette se fait après coup, une fois le fichier
        // déjà écrit sur disque et la piste déjà créée : un échec ici ne doit
        // jamais transformer un upload par ailleurs réussi en erreur 500.
        const coverUrl = await findCoverUrl(
          path.join(UPLOADS, req.file.filename),
          req.file.originalname,
        );
        if (coverUrl) {
          track.coverUrl = coverUrl;
          await track.save();
        }

        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
            console.log(`[tracks] Fichier temporaire supprimé : ${uploadedPath}`);
          } catch (cleanupError) {
            console.error(
              `[tracks] Impossible de supprimer le fichier temporaire ${uploadedPath}`,
              cleanupError,
            );
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
