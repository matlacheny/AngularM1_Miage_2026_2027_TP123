import express from "express";
import multer from "multer";
import mongoose, { Types } from "mongoose";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { auth, authOrStreamToken, streamToken, STREAM_TOKEN_TTL_SECONDS } from "../auth.js";
import { canAccess, VISIBILITIES } from "../access.js";
import { Media, MAX_UPLOAD_SIZE, SIZE_LIMITS, mediaKind, publicMediaPipeline } from "../models/Media.js";
import { Vehicle } from "../models/Vehicle.js";
import { UPLOADS } from "../uploads.js";
import { loadFriendIds } from "../friends.js";

const KIND_LABELS = { audio: "un son", image: "une photo", video: "une vidéo" };

/** Erreur métier transmise au gestionnaire central avec son code HTTP. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Multer reçoit un champ multipart "file". La limite globale correspond à la
 * plus grande catégorie (vidéo) ; la limite propre à chaque catégorie est
 * vérifiée juste après, une fois la taille réelle connue.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, UPLOADS),
    filename: (_request, file, callback) => {
      const filename = crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
      console.log(`[media] Nom de stockage généré pour ${file.originalname}`);
      callback(null, filename);
    },
  }),
  defParamCharset: "utf8",
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_request, file, callback) => {
    if (mediaKind(file.mimetype)) {
      console.log(`[media] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }
    const error = new HttpError(400, "Format de fichier non accepté");
    console.error(`[media] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/** Supprime un fichier du disque en journalisant un éventuel échec. */
async function removeStoredFile(storedName) {
  const filePath = path.join(UPLOADS, storedName);
  try {
    await fsPromises.unlink(filePath);
    console.log(`[media] Fichier supprimé : ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[media] Fichier non supprimé : ${filePath}`, error);
    return false;
  }
}

// Amis acceptés du lecteur (escadrille) : réexporté pour les autres routeurs.
export { loadFriendIds };

/**
 * Valide un vehicleId reçu du client : null/"" détache le média, sinon la
 * fiche doit exister. Retourne { ok, value }.
 */
async function parseVehicleId(raw) {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  if (!mongoose.isValidObjectId(raw) || !(await Vehicle.exists({ _id: raw }))) {
    console.warn(`[media] Véhicule inconnu : ${raw}`);
    return { ok: false };
  }
  return { ok: true, value: raw };
}

/** URL de lecture signée d'un média pour un lecteur donné. */
export function streamUrlFor(viewerId, mediaId) {
  return `/api/media/${mediaId}/file?token=${encodeURIComponent(streamToken(viewerId, mediaId))}`;
}

/**
 * Ajoute `url` (lecture signée) à chaque média d'une page déjà filtrée par
 * les droits du lecteur : l'interface affiche vignettes et lecteurs sans
 * une requête stream-url par carte.
 */
export function withStreamUrls(page, viewerId) {
  return { ...page, docs: page.docs.map((doc) => ({ ...doc, url: streamUrlFor(viewerId, doc.id) })) };
}

/** Retourne le média s'il existe ET si le lecteur y a droit, sinon null. */
async function findAccessible(id, viewerId) {
  if (!mongoose.isValidObjectId(id)) return null;
  const media = await Media.findById(id).select("+storedName");
  if (!media) return null;
  return canAccess(viewerId, media, await loadFriendIds(viewerId)) ? media : null;
}

/**
 * Routes /api/media. Un média inaccessible répond toujours 404 (et non 403)
 * pour ne jamais révéler l'existence d'un fichier privé.
 */
export function createMediaRouter() {
  const router = express.Router();

  /** Page des médias de l'utilisateur connecté, filtrable par titre et catégorie. */
  router.get("/", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
      const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
      const kind = typeof req.query.kind === "string" ? req.query.kind : "";
      const filter = { ownerId: new Types.ObjectId(req.auth.sub) };

      if (title) filter.title = { $regex: escapeRegExp(title), $options: "i" };
      if (kind) {
        if (!(kind in SIZE_LIMITS)) {
          console.warn(`[media] Catégorie de filtre inconnue : ${kind}`);
          return res.status(400).json({ message: "Catégorie inconnue" });
        }
        filter.kind = kind;
      }

      console.log(`[media] Lecture page=${page}, limit=${limit}, kind=${kind || "(toutes)"}, user=${req.auth.sub}`);

      const aggregate = Media.aggregate(publicMediaPipeline(filter));
      const result = await Media.aggregatePaginate(aggregate, { page, limit });

      console.log(`[media] ${result.docs.length} média(s) envoyé(s) sur ${result.totalDocs}`);
      res.json(withStreamUrls(result, req.auth.sub));
    } catch (error) {
      console.error("[media] Erreur de pagination", error);
      next(error);
    }
  });

  /** Upload d'un son, d'une photo ou d'une vidéo (champs file, title, visibility). */
  router.post("/", auth, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        console.warn(`[media] Upload sans fichier par ${req.auth.sub}`);
        return res.status(400).json({ message: "Fichier requis" });
      }

      const kind = mediaKind(req.file.mimetype);
      const visibility = req.body.visibility || "private";

      if (req.file.size > SIZE_LIMITS[kind]) {
        console.warn(`[media] ${kind} trop volumineux : ${req.file.size} octets`);
        await removeStoredFile(req.file.filename);
        return res.status(400).json({
          message: `Fichier trop volumineux : ${SIZE_LIMITS[kind] / 1024 / 1024} Mo maximum pour ${KIND_LABELS[kind]}`,
        });
      }

      if (!VISIBILITIES.includes(visibility)) {
        console.warn(`[media] Visibilité invalide : ${visibility}`);
        await removeStoredFile(req.file.filename);
        return res.status(400).json({ message: "Visibilité invalide" });
      }

      const vehicle = await parseVehicleId(req.body.vehicleId);
      if (!vehicle.ok) {
        await removeStoredFile(req.file.filename);
        return res.status(400).json({ message: "Véhicule inconnu" });
      }

      const media = await Media.create({
        ownerId: req.auth.sub,
        kind,
        title: req.body.title || req.file.originalname,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        visibility,
        vehicleId: vehicle.value ?? null,
      });
      if (media.vehicleId) await media.populate("vehicleId", "name");

      console.log(`[media] Upload enregistré : ${media.id} (${kind}, ${visibility})`);
      res.status(201).json(media.toPublic());
    } catch (error) {
      console.error("[media] Erreur après l'enregistrement du fichier", error);
      // MongoDB a échoué après l'écriture sur disque : on évite le fichier orphelin.
      if (req.file) await removeStoredFile(req.file.filename);
      next(error);
    }
  });

  /** Médias que d'autres membres ont explicitement partagés avec moi. */
  router.get("/shared-with-me", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
      const match = { sharedWith: new Types.ObjectId(req.auth.sub) };
      const result = await Media.aggregatePaginate(Media.aggregate(publicMediaPipeline(match)), { page, limit });
      res.json(withStreamUrls(result, req.auth.sub));
    } catch (error) {
      console.error("[media] Erreur de lecture des partages reçus", error);
      next(error);
    }
  });

  /** Membres avec qui le propriétaire a partagé ce média. */
  router.get("/:id/shares", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Média inconnu" });
      const media = await Media.findOne({ _id: req.params.id, ownerId: req.auth.sub }).populate("sharedWith", "name");
      if (!media) return res.status(404).json({ message: "Média inconnu" });
      res.json(media.sharedWith.map((u) => ({ id: String(u._id), name: u.name })));
    } catch (error) {
      console.error("[media] Erreur de lecture des partages", error);
      next(error);
    }
  });

  /**
   * Partage (PUT) ou arrête le partage (DELETE) d'un média avec un membre.
   * On ne partage qu'avec un membre de son escadrille. L'arrêt prend effet
   * immédiatement : les droits sont revérifiés à chaque lecture du fichier.
   */
  const share = (operator) => async (req, res, next) => {
    try {
      const { id, userId } = req.params;
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
        return res.status(404).json({ message: "Média inconnu" });
      }
      if (operator === "$addToSet" && !(await loadFriendIds(req.auth.sub)).has(String(userId))) {
        return res.status(400).json({ message: "Vous ne pouvez partager qu'avec un membre de votre escadrille" });
      }
      const media = await Media.findOneAndUpdate(
        { _id: id, ownerId: req.auth.sub },
        { [operator]: { sharedWith: new Types.ObjectId(userId) } },
        { new: true },
      ).populate("sharedWith", "name");
      if (!media) return res.status(404).json({ message: "Média inconnu" });
      console.log(`[media] Partage ${operator === "$addToSet" ? "ajouté" : "arrêté"} : ${id} / ${userId}`);
      res.json(media.sharedWith.map((u) => ({ id: String(u._id), name: u.name })));
    } catch (error) {
      console.error("[media] Erreur de partage", error);
      next(error);
    }
  };
  router.put("/:id/shares/:userId", auth, share("$addToSet"));
  router.delete("/:id/shares/:userId", auth, share("$pull"));

  /** Métadonnées d'un média accessible au lecteur. */
  router.get("/:id", auth, async (req, res, next) => {
    try {
      const media = await findAccessible(req.params.id, req.auth.sub);
      if (!media) {
        console.warn(`[media] Média introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Média inconnu" });
      }
      res.json(media.toPublic());
    } catch (error) {
      console.error("[media] Erreur de lecture des métadonnées", error);
      next(error);
    }
  });

  /** Modifie le titre et/ou la visibilité (propriétaire uniquement). */
  router.patch("/:id", auth, async (req, res, next) => {
    try {
      const update = {};
      const { title, visibility, vehicleId } = req.body || {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({ message: "Titre invalide" });
        }
        update.title = title.trim();
      }
      if (visibility !== undefined) {
        if (!VISIBILITIES.includes(visibility)) {
          return res.status(400).json({ message: "Visibilité invalide" });
        }
        update.visibility = visibility;
      }
      const vehicle = await parseVehicleId(vehicleId);
      if (!vehicle.ok) {
        return res.status(400).json({ message: "Véhicule inconnu" });
      }
      if (vehicle.value !== undefined) update.vehicleId = vehicle.value;
      if (!Object.keys(update).length) {
        return res.status(400).json({ message: "Rien à modifier" });
      }
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).json({ message: "Média inconnu" });
      }

      const media = await Media.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.sub },
        { $set: update },
        { new: true, runValidators: true },
      );
      if (!media) {
        console.warn(`[media] Modification impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Média inconnu" });
      }
      if (media.vehicleId) await media.populate("vehicleId", "name");

      console.log(`[media] Média modifié : ${media.id}`, update);
      res.json(media.toPublic());
    } catch (error) {
      console.error("[media] Erreur de modification", error);
      next(error);
    }
  });

  /**
   * Délivre une URL de lecture signée, utilisable directement dans
   * <audio src>, <video src> ou <img src> (qui n'envoient pas d'en-tête JWT).
   */
  router.post("/:id/stream-url", auth, async (req, res, next) => {
    try {
      const media = await findAccessible(req.params.id, req.auth.sub);
      if (!media) {
        console.warn(`[media] URL de lecture refusée : ${req.params.id}`);
        return res.status(404).json({ message: "Média inconnu" });
      }
      const url = streamUrlFor(req.auth.sub, media.id);
      res.json({ url, expiresIn: STREAM_TOKEN_TTL_SECONDS });
    } catch (error) {
      console.error("[media] Erreur de création d'URL de lecture", error);
      next(error);
    }
  });

  /**
   * Contenu binaire du média. res.sendFile gère nativement l'en-tête Range
   * (réponse 206 Partial Content) : indispensable pour avancer dans une vidéo
   * sans la re-télécharger entièrement. Les droits sont revérifiés à chaque
   * requête : un partage retiré prend effet immédiatement.
   */
  router.get("/:id/file", authOrStreamToken, async (req, res, next) => {
    try {
      const media = await findAccessible(req.params.id, req.auth.sub);
      if (!media) {
        console.warn(`[media] Fichier introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Média inconnu" });
      }

      res.type(media.mimeType);
      res.set("Cache-Control", "private, max-age=600");
      res.sendFile(path.join(UPLOADS, media.storedName), (error) => {
        if (error) {
          console.error(`[media] Erreur d'envoi du fichier ${media.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[media] Fichier envoyé : ${media.id} (${res.statusCode})`);
      });
    } catch (error) {
      console.error("[media] Erreur de préparation du flux", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier (propriétaire uniquement). */
  router.delete("/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).json({ message: "Média inconnu" });
      }
      const media = await Media.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!media) {
        console.warn(`[media] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Média inconnu" });
      }

      if (!(await removeStoredFile(media.storedName))) {
        return res.status(500).json({ message: "Métadonnée supprimée, mais fichier non supprimé" });
      }
      res.status(204).end();
    } catch (error) {
      console.error("[media] Erreur de suppression", error);
      next(error);
    }
  });

  return router;
}
