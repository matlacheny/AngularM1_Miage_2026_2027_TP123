import express from "express";
import mongoose, { Types } from "mongoose";
import { auth } from "../auth.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { Vehicle } from "../models/Vehicle.js";
import { visibleTo } from "./posts.js";

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
   * Profil public : nom, ville, biographie, date d'inscription, nombre de
   * publications visibles par le lecteur et véhicules préférés (avec drapeaux).
   */
  router.get("/:id", auth, async (req, res, next) => {
    try {
      const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
      if (!user) return res.status(404).json({ message: "Utilisateur inconnu" });

      const [postCount, vehicles] = await Promise.all([
        Post.countDocuments({ ownerId: user._id, ...(await visibleTo(req.auth.sub)) }),
        Vehicle.find({ _id: { $in: user.favoriteVehicleIds } }),
      ]);
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
        favorites: favorites.map((v) => {
          const { id, name, category, countries, origins } = v.toPublic();
          return { id, name, category, countries, origins };
        }),
      });
    } catch (error) {
      console.error("[users] Erreur de lecture du profil", error);
      next(error);
    }
  });

  return router;
}
