import express from "express";
import mongoose, { Types } from "mongoose";
import { auth } from "../auth.js";
import { VISIBILITIES, accessFilter } from "../access.js";
import { Comment, publicCommentPipeline } from "../models/Comment.js";
import { Media } from "../models/Media.js";
import { Post, publicPostPipeline } from "../models/Post.js";
import { Vehicle } from "../models/Vehicle.js";
import { normalizeName } from "../wikipedia.js";
import { escapeRegExp, loadFriendIds, streamUrlFor } from "./media.js";

const MEDIA_KINDS = ["audio", "image", "video"];

const pageParams = (query, defaultLimit) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(20, Math.max(1, Number(query.limit) || defaultLimit)),
});

/** La plus ouverte de deux visibilités (private < friends < public). */
export function widest(a, b) {
  return VISIBILITIES.indexOf(a) >= VISIBILITIES.indexOf(b) ? a : b;
}

/** Filtre MongoDB « posts que ce lecteur a le droit de voir ». */
export async function visibleTo(viewerId) {
  const viewer = new Types.ObjectId(viewerId);
  const friends = [...(await loadFriendIds(viewerId))].map((id) => new Types.ObjectId(id));
  return accessFilter(viewer, friends);
}

/**
 * Recherche : identifiants des fiches véhicules dont le nom ou un alias
 * contient `q`. Un post est trouvé par le véhicule auquel il est rattaché,
 * pas par son texte. Les droits restent ceux du post (visibleTo).
 */
export function vehicleIdsMatching(q) {
  const regex = { $regex: escapeRegExp(q), $options: "i" };
  return Vehicle.distinct("_id", { $or: [{ name: regex }, { aliases: { $regex: escapeRegExp(normalizeName(q)) } }] });
}

/** Ajoute l'URL de lecture signée au média de chaque post. */
function withMediaUrl(post, viewerId) {
  return post.media ? { ...post, media: { ...post.media, url: streamUrlFor(viewerId, post.media.id) } } : post;
}

/** Post visible par le lecteur, mis en forme, ou null. */
async function findVisiblePost(id, viewerId) {
  if (!mongoose.isValidObjectId(id)) return null;
  const match = { _id: new Types.ObjectId(id), ...(await visibleTo(viewerId)) };
  const [post] = await Post.aggregate(publicPostPipeline(match, new Types.ObjectId(viewerId)));
  return post ? withMediaUrl(post, viewerId) : null;
}

/**
 * Routes /api/posts : fil d'actualité, publication, J'aime et commentaires.
 * Un post invisible pour le lecteur répond 404, comme un média.
 */
export function createPostsRouter() {
  const router = express.Router();

  /**
   * Fil : posts visibles par le lecteur, les plus récents d'abord.
   * `others=1` exclut ses propres posts ; `scope=friends` ne garde que ceux
   * de l'escadrille (colonne « Escadrille · posts récents », onglet du fil).
   * Recherche : `q` garde les posts rattachés à un véhicule correspondant
   * (voir vehicleIdsMatching) et `media=1` ne
   * garde que les posts avec un fichier.
   */
  router.get("/feed", auth, async (req, res, next) => {
    try {
      const { page, limit } = pageParams(req.query, 10);
      const viewer = new Types.ObjectId(req.auth.sub);
      const match = { ...(await visibleTo(req.auth.sub)) };
      if (req.query.others === "1") match.ownerId = { $ne: viewer };
      // Activité de l'escadrille : uniquement les posts de mes amis.
      if (req.query.scope === "friends") {
        const friends = [...(await loadFriendIds(req.auth.sub))].map((id) => new Types.ObjectId(id));
        match.ownerId = { $in: friends };
      }
      // Page profil : posts d'un auteur, éventuellement d'un seul type de média.
      if (typeof req.query.author === "string" && req.query.author) {
        if (!mongoose.isValidObjectId(req.query.author)) return res.status(400).json({ message: "Auteur invalide" });
        match.ownerId = new Types.ObjectId(req.query.author);
      }
      const kind = typeof req.query.kind === "string" ? req.query.kind : "";
      if (kind && !MEDIA_KINDS.includes(kind)) return res.status(400).json({ message: "Catégorie inconnue" });
      if (req.query.media === "1") match.mediaId = { $ne: null };
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
      if (q) match.vehicleId = { $in: await vehicleIdsMatching(q) };

      const pipeline = publicPostPipeline(match, viewer, kind || null);
      const result = await Post.aggregatePaginate(Post.aggregate(pipeline), { page, limit });
      console.log(`[posts] Fil : ${result.docs.length} post(s) pour ${req.auth.sub}${q ? `, recherche « ${q} »` : ""}`);
      res.json({ ...result, docs: result.docs.map((post) => withMediaUrl(post, req.auth.sub)) });
    } catch (error) {
      console.error("[posts] Erreur de lecture du fil", error);
      next(error);
    }
  });

  router.get("/:id", auth, async (req, res, next) => {
    try {
      const post = await findVisiblePost(req.params.id, req.auth.sub);
      if (!post) return res.status(404).json({ message: "Publication inconnue" });
      res.json(post);
    } catch (error) {
      console.error("[posts] Erreur de lecture d'un post", error);
      next(error);
    }
  });

  /**
   * Publie un post { text?, mediaId?, vehicleId?, visibility? }.
   * Le média doit appartenir à l'auteur ; s'il est moins visible que le
   * post, sa visibilité est élargie, sinon les lecteurs du post verraient
   * une carte sans pouvoir lire le fichier.
   */
  router.post("/", auth, async (req, res, next) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      const visibility = req.body?.visibility ?? "public";
      const { mediaId, vehicleId } = req.body ?? {};

      if (!VISIBILITIES.includes(visibility)) return res.status(400).json({ message: "Visibilité invalide" });
      if (text.length > 2000) return res.status(400).json({ message: "Texte trop long (2000 caractères maximum)" });
      if (!text && !mediaId) return res.status(400).json({ message: "Un texte ou un média est requis" });

      let media = null;
      if (mediaId) {
        media = mongoose.isValidObjectId(mediaId) ? await Media.findOne({ _id: mediaId, ownerId: req.auth.sub }) : null;
        if (!media) {
          console.warn(`[posts] Média ${mediaId} introuvable ou d'un autre utilisateur`);
          return res.status(400).json({ message: "Média inconnu" });
        }
      }

      let vehicle = vehicleId ?? media?.vehicleId ?? null;
      if (vehicle && (!mongoose.isValidObjectId(vehicle) || !(await Vehicle.exists({ _id: vehicle })))) {
        return res.status(400).json({ message: "Véhicule inconnu" });
      }

      if (media && widest(media.visibility, visibility) !== media.visibility) {
        console.log(`[posts] Visibilité du média ${media.id} élargie : ${media.visibility} -> ${visibility}`);
        media.visibility = visibility;
        await media.save();
      }

      const post = await Post.create({ ownerId: req.auth.sub, text, mediaId: media?._id ?? null, vehicleId: vehicle, visibility });
      console.log(`[posts] Post publié : ${post.id} (${visibility})`);
      res.status(201).json(await findVisiblePost(post.id, req.auth.sub));
    } catch (error) {
      console.error("[posts] Erreur de publication", error);
      next(error);
    }
  });

  /** Supprime un post et ses commentaires (auteur uniquement). Le média reste dans le hangar. */
  router.delete("/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Publication inconnue" });
      const post = await Post.findOneAndDelete({ _id: req.params.id, ownerId: req.auth.sub });
      if (!post) return res.status(404).json({ message: "Publication inconnue" });
      await Comment.deleteMany({ postId: post._id });
      console.log(`[posts] Post supprimé : ${post.id}`);
      res.status(204).end();
    } catch (error) {
      console.error("[posts] Erreur de suppression", error);
      next(error);
    }
  });

  /** J'aime (PUT) / retrait du J'aime (DELETE) : idempotents, un seul J'aime par personne. */
  const like = (operator) => async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Publication inconnue" });
      const viewer = new Types.ObjectId(req.auth.sub);
      const post = await Post.findOneAndUpdate(
        { _id: req.params.id, ...(await visibleTo(req.auth.sub)) },
        { [operator]: { likes: viewer } },
        { new: true },
      );
      if (!post) return res.status(404).json({ message: "Publication inconnue" });
      const likedByMe = post.likes.some((id) => id.equals(viewer));
      res.json({ likeCount: post.likes.length, likedByMe });
    } catch (error) {
      console.error("[posts] Erreur de J'aime", error);
      next(error);
    }
  };
  router.put("/:id/like", auth, like("$addToSet"));
  router.delete("/:id/like", auth, like("$pull"));

  router.get("/:id/comments", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Publication inconnue" });
      if (!(await Post.exists({ _id: req.params.id, ...(await visibleTo(req.auth.sub)) }))) {
        return res.status(404).json({ message: "Publication inconnue" });
      }
      const { page, limit } = pageParams(req.query, 20);
      const aggregate = Comment.aggregate(publicCommentPipeline(new Types.ObjectId(req.params.id)));
      res.json(await Comment.aggregatePaginate(aggregate, { page, limit }));
    } catch (error) {
      console.error("[posts] Erreur de lecture des commentaires", error);
      next(error);
    }
  });

  router.post("/:id/comments", auth, async (req, res, next) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!text || text.length > 1000) {
        return res.status(400).json({ message: "Commentaire requis (1000 caractères maximum)" });
      }
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Publication inconnue" });

      const post = await Post.findOneAndUpdate(
        { _id: req.params.id, ...(await visibleTo(req.auth.sub)) },
        { $inc: { commentCount: 1 } },
        { new: true },
      );
      if (!post) return res.status(404).json({ message: "Publication inconnue" });

      const comment = await Comment.create({ postId: post._id, ownerId: req.auth.sub, text });
      const [shaped] = await Comment.aggregate(publicCommentPipeline(post._id)).match({ id: comment.id });
      console.log(`[posts] Commentaire ${comment.id} sur ${post.id}`);
      res.status(201).json({ comment: shaped ?? null, commentCount: post.commentCount });
    } catch (error) {
      console.error("[posts] Erreur de commentaire", error);
      next(error);
    }
  });

  return router;
}
