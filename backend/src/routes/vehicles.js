import express from "express";
import mongoose, { Types } from "mongoose";
import { auth } from "../auth.js";
import { accessFilter } from "../access.js";
import { Media, SIZE_LIMITS, publicMediaPipeline } from "../models/Media.js";
import { Vehicle } from "../models/Vehicle.js";
import { CATEGORIES, WikiUnavailableError, normalizeName, wikipedia } from "../wikipedia.js";
import { escapeRegExp, loadFriendIds } from "./media.js";

const pageParams = (query, defaultLimit) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(20, Math.max(1, Number(query.limit) || defaultLimit)),
});

/** Routes /api/vehicles : fiches véhicules et médias qui leur sont rattachés. */
export function createVehiclesRouter() {
  const router = express.Router();

  /** Recherche locale (déjà créées) par nom ou alias, filtrable par catégorie. */
  router.get("/", auth, async (req, res, next) => {
    try {
      const { page, limit } = pageParams(req.query, 10);
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const category = typeof req.query.category === "string" ? req.query.category : "";
      const filter = {};

      if (q) {
        const regex = { $regex: escapeRegExp(q), $options: "i" };
        filter.$or = [{ name: regex }, { aliases: { $regex: escapeRegExp(normalizeName(q)) } }];
      }
      if (category) {
        if (!CATEGORIES.includes(category)) {
          return res.status(400).json({ message: "Catégorie inconnue" });
        }
        filter.category = category;
      }

      console.log(`[vehicles] Recherche q=${q || "(aucun)"}, category=${category || "(toutes)"}`);
      const aggregate = Vehicle.aggregate([
        { $match: filter },
        { $sort: { name: 1 } },
        { $addFields: { id: { $toString: "$_id" } } },
        { $project: { _id: 0, __v: 0, aliases: 0, createdBy: 0, updatedAt: 0 } },
      ]);
      res.json(await Vehicle.aggregatePaginate(aggregate, { page, limit }));
    } catch (error) {
      console.error("[vehicles] Erreur de recherche", error);
      next(error);
    }
  });

  /**
   * Crée la fiche correspondant à un nom saisi, après validation Wikipédia.
   * 201 : fiche créée ; 200 : fiche déjà existante (même nom déjà saisi, ou
   * même élément Wikidata) ; 422 : ce n'est pas un véhicule ; 503 : Wikipédia
   * indisponible (rien n'est créé).
   */
  router.post("/", auth, async (req, res, next) => {
    try {
      const raw = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (raw.length < 2 || raw.length > 80) {
        return res.status(400).json({ message: "Nom de véhicule requis (2 à 80 caractères)" });
      }
      const alias = normalizeName(raw);

      // Nom déjà saisi : aucun appel externe.
      const known = await Vehicle.findOne({ aliases: alias });
      if (known) {
        console.log(`[vehicles] "${raw}" déjà connu : ${known.id}`);
        return res.status(200).json(known.toPublic());
      }

      let resolved;
      try {
        resolved = await wikipedia.resolveVehicle(raw);
      } catch (error) {
        if (error instanceof WikiUnavailableError) {
          console.error("[vehicles] Wikipédia indisponible", error);
          return res.status(503).json({
            message: "Wikipédia est momentanément indisponible, réessayez dans un instant",
          });
        }
        throw error;
      }

      if (!resolved) {
        return res.status(422).json({
          message: `« ${raw} » ne correspond à aucun avion, hélicoptère, char ou blindé connu de Wikipédia`,
        });
      }

      // Même véhicule saisi sous un autre nom ("Dassault Rafale" puis "Rafale").
      const existing = await Vehicle.findOneAndUpdate(
        { wikidataId: resolved.wikidataId },
        { $addToSet: { aliases: alias } },
        { new: true },
      );
      if (existing) {
        console.log(`[vehicles] "${raw}" rattaché à la fiche existante ${existing.id}`);
        return res.status(200).json(existing.toPublic());
      }

      try {
        const vehicle = await Vehicle.create({
          wikidataId: resolved.wikidataId,
          name: resolved.name,
          category: resolved.category,
          countries: resolved.countries,
          summary: resolved.summary,
          imageUrl: resolved.imageUrl,
          wikipediaUrl: resolved.wikipediaUrl,
          aliases: [...new Set([alias, normalizeName(resolved.name)])],
          createdBy: req.auth.sub,
        });
        console.log(`[vehicles] Fiche créée : ${vehicle.id} (${vehicle.name})`);
        return res.status(201).json(vehicle.toPublic());
      } catch (error) {
        // Deux créations simultanées du même véhicule : l'index unique en
        // garde une seule, l'autre requête renvoie la fiche gagnante.
        if (error?.code === 11000) {
          const winner = await Vehicle.findOne({ wikidataId: resolved.wikidataId });
          if (winner) return res.status(200).json(winner.toPublic());
        }
        throw error;
      }
    } catch (error) {
      console.error("[vehicles] Erreur de création de fiche", error);
      next(error);
    }
  });

  router.get("/:id", auth, async (req, res, next) => {
    try {
      const vehicle = mongoose.isValidObjectId(req.params.id) ? await Vehicle.findById(req.params.id) : null;
      if (!vehicle) {
        console.warn(`[vehicles] Fiche inconnue : ${req.params.id}`);
        return res.status(404).json({ message: "Véhicule inconnu" });
      }
      res.json(vehicle.toPublic());
    } catch (error) {
      console.error("[vehicles] Erreur de lecture de fiche", error);
      next(error);
    }
  });

  /** Médias rattachés à la fiche ET visibles par le lecteur (même règle que canAccess). */
  router.get("/:id/media", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).json({ message: "Véhicule inconnu" });
      }
      const { page, limit } = pageParams(req.query, 12);
      const kind = typeof req.query.kind === "string" ? req.query.kind : "";
      if (kind && !(kind in SIZE_LIMITS)) {
        return res.status(400).json({ message: "Catégorie inconnue" });
      }

      const viewer = new Types.ObjectId(req.auth.sub);
      const friends = [...(await loadFriendIds(req.auth.sub))].map((id) => new Types.ObjectId(id));
      const match = {
        vehicleId: new Types.ObjectId(req.params.id),
        ...(kind && { kind }),
        ...accessFilter(viewer, friends),
      };

      const result = await Media.aggregatePaginate(Media.aggregate(publicMediaPipeline(match)), { page, limit });
      console.log(`[vehicles] ${result.docs.length} média(s) pour la fiche ${req.params.id}`);
      res.json(result);
    } catch (error) {
      console.error("[vehicles] Erreur de lecture des médias", error);
      next(error);
    }
  });

  return router;
}
