import express from "express";
import mongoose, { Types } from "mongoose";
import { auth } from "../auth.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { Vehicle } from "../models/Vehicle.js";
import { visibleTo } from "./posts.js";
import { escapeRegExp } from "./media.js";
import { friendships, relationTo } from "../friends.js";
import { Friendship, pairKey } from "../models/Friendship.js";

export const MAX_FAVORITES = 6;

/**
 * Routes /api/users (hors /me, défini dans app.js) : profil public et
 * véhicules préférés. L'email n'apparaît jamais dans un profil public.
 */
export function createUsersRouter() {
  const router = express.Router();

  /** Ajoute (PUT) ou retire (DELETE) un véhicule des favoris de l'utilisateur connecté. */
  router.put("/me/favorites/:vehicleId", auth, async (req, res, next) => {
    try {
      const { vehicleId } = req.params;
      if (!mongoose.isValidObjectId(vehicleId) || !(await Vehicle.exists({ _id: vehicleId }))) {
        return res.status(404).json({ message: "Véhicule inconnu" });
      }
      // Ajout conditionnel atomique : seulement s'il reste de la place et s'il n'y est pas déjà.
      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, [`favoriteVehicleIds.${MAX_FAVORITES - 1}`]: { $exists: false } },
        { $addToSet: { favoriteVehicleIds: new Types.ObjectId(vehicleId) } },
        { new: true },
      );
      if (!user) {
        const current = await User.findById(req.auth.sub);
        if (current?.favoriteVehicleIds.some((id) => id.equals(vehicleId))) return res.json(current.toPublic());
        return res.status(400).json({ message: `${MAX_FAVORITES} véhicules préférés au maximum` });
      }
      console.log(`[users] Favori ajouté : ${vehicleId} pour ${req.auth.sub}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[users] Erreur d'ajout de favori", error);
      next(error);
    }
  });

  router.delete("/me/favorites/:vehicleId", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.vehicleId)) return res.status(404).json({ message: "Véhicule inconnu" });
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $pull: { favoriteVehicleIds: new Types.ObjectId(req.params.vehicleId) } },
        { new: true },
      );
      if (!user) return res.status(404).json({ message: "Utilisateur inconnu" });
      res.json(user.toPublic());
    } catch (error) {
      console.error("[users] Erreur de retrait de favori", error);
      next(error);
    }
  });

  /**
   * Recherche de membres par nom (pour les inviter), avec la relation de
   * chacun envers le lecteur. Exclut le lecteur lui-même.
   */
  router.get("/", auth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) return res.json([]);
      const users = await User.find({ _id: { $ne: req.auth.sub }, name: { $regex: escapeRegExp(q), $options: "i" } })
        .select("name location bio")
        .sort({ name: 1 })
        .limit(10)
        .lean();

      const keys = users.map((u) => pairKey(req.auth.sub, u._id));
      const links = await Friendship.find({ pairKey: { $in: keys } }).lean();
      const byKey = new Map(links.map((l) => [l.pairKey, l]));
      res.json(
        users.map((u) => {
          const link = byKey.get(pairKey(req.auth.sub, u._id));
          const status = !link
            ? "none"
            : link.status === "accepted"
              ? "friend"
              : String(link.requesterId) === req.auth.sub
                ? "outgoing"
                : "incoming";
          return { id: String(u._id), name: u.name, location: u.location ?? "", bio: u.bio ?? "", relation: { status, requestId: link ? String(link._id) : null } };
        }),
      );
    } catch (error) {
      console.error("[users] Erreur de recherche de membres", error);
      next(error);
    }
  });

  /**
   * Profil public : nom, ville, biographie, date d'inscription, nombre de
   * publications visibles par le lecteur et véhicules préférés (avec drapeaux).
   */
  router.get("/:id", auth, async (req, res, next) => {
    try {
      const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
      if (!user) return res.status(404).json({ message: "Utilisateur inconnu" });

      const [postCount, vehicles, theirFriends, myFriends, relation] = await Promise.all([
        Post.countDocuments({ ownerId: user._id, ...(await visibleTo(req.auth.sub)) }),
        Vehicle.find({ _id: { $in: user.favoriteVehicleIds } }),
        friendships.idsOf(user.id),
        friendships.idsOf(req.auth.sub),
        relationTo(req.auth.sub, user.id),
      ]);
      // Son propre profil : toute son escadrille ; un autre : les amis en commun.
      const shownIds = relation.status === "self" ? [...theirFriends] : [...theirFriends].filter((id) => myFriends.has(id));
      const shown = shownIds.length
        ? await User.find({ _id: { $in: shownIds } }).select("name location bio").sort({ name: 1 }).limit(12).lean()
        : [];
      // Garde l'ordre choisi par l'utilisateur.
      const byId = new Map(vehicles.map((v) => [v.id, v]));
      const favorites = user.favoriteVehicleIds.map((id) => byId.get(String(id))).filter(Boolean);

      res.json({
        id: user.id,
        name: user.name,
        bio: user.bio ?? "",
        location: user.location ?? "",
        createdAt: user.createdAt,
        postCount,
        friendCount: theirFriends.size,
        relation,
        mutualFriendCount: shownIds.length,
        mutualFriends: shown.map((u) => ({ id: String(u._id), name: u.name, location: u.location ?? "", bio: u.bio ?? "" })),
        favorites: favorites.map((v) => {
          const { id, name, category, countries, origins, imageUrl } = v.toPublic();
          return { id, name, category, countries, origins, imageUrl };
        }),
      });
    } catch (error) {
      console.error("[users] Erreur de lecture du profil", error);
      next(error);
    }
  });

  return router;
}
