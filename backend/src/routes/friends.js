import express from "express";
import mongoose, { Types } from "mongoose";
import { auth } from "../auth.js";
import { friendships } from "../friends.js";
import { Friendship, pairKey } from "../models/Friendship.js";
import { Media } from "../models/Media.js";
import { User } from "../models/User.js";

/** Champs publics d'un membre dans les listes d'escadrille (jamais l'email). */
const publicUser = (u) => ({ id: String(u._id ?? u.id), name: u.name, location: u.location ?? "", bio: u.bio ?? "" });

/**
 * Routes /api/friends : escadrille de l'utilisateur connecté.
 * Une invitation est un lien `pending` ; l'accepter le passe à `accepted`.
 * Refuser, annuler ou retirer un ami supprime le lien.
 */
export function createFriendsRouter() {
  const router = express.Router();

  /** Amis, invitations reçues et invitations envoyées. */
  router.get("/", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const links = await Friendship.find({ $or: [{ requesterId: me }, { recipientId: me }] }).sort({ updatedAt: -1 }).lean();
      const otherOf = (l) => (String(l.requesterId) === me ? l.recipientId : l.requesterId);
      const users = await User.find({ _id: { $in: links.map(otherOf) } }).select("name location bio").lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));

      const result = { friends: [], incoming: [], outgoing: [] };
      for (const link of links) {
        const user = byId.get(String(otherOf(link)));
        if (!user) continue;
        if (link.status === "accepted") {
          result.friends.push({ ...publicUser(user), since: link.updatedAt });
        } else {
          const list = String(link.requesterId) === me ? result.outgoing : result.incoming;
          list.push({ requestId: String(link._id), user: publicUser(user), createdAt: link.createdAt });
        }
      }
      result.friends.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      res.json(result);
    } catch (error) {
      console.error("[friends] Erreur de lecture de l'escadrille", error);
      next(error);
    }
  });

  /**
   * Invite un membre { userId }. Si ce membre m'avait déjà invité, l'invitation
   * est acceptée directement (200) ; sinon une invitation est créée (201).
   */
  router.post("/requests", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const userId = req.body?.userId;
      if (!mongoose.isValidObjectId(userId) || String(userId) === me) {
        return res.status(400).json({ message: "Membre invalide" });
      }
      if (!(await User.exists({ _id: userId }))) return res.status(404).json({ message: "Membre inconnu" });

      const existing = await friendships.between(me, userId);
      if (existing?.status === "accepted") return res.status(409).json({ message: "Déjà dans votre escadrille" });
      if (existing && String(existing.requesterId) === me) return res.status(409).json({ message: "Invitation déjà envoyée" });
      if (existing) {
        existing.status = "accepted";
        await existing.save();
        console.log(`[friends] Invitations croisées : ${me} et ${userId} sont amis`);
        return res.status(200).json({ status: "friend", requestId: existing.id });
      }

      try {
        const link = await Friendship.create({ requesterId: me, recipientId: userId, pairKey: pairKey(me, userId) });
        console.log(`[friends] Invitation ${link.id} : ${me} -> ${userId}`);
        return res.status(201).json({ status: "outgoing", requestId: link.id });
      } catch (error) {
        // Deux invitations simultanées : l'index unique sur pairKey n'en garde qu'une.
        if (error?.code === 11000) return res.status(409).json({ message: "Invitation déjà envoyée" });
        throw error;
      }
    } catch (error) {
      console.error("[friends] Erreur d'invitation", error);
      next(error);
    }
  });

  /** Accepte une invitation reçue (destinataire uniquement). */
  router.post("/requests/:id/accept", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Invitation inconnue" });
      const link = await Friendship.findOneAndUpdate(
        { _id: req.params.id, recipientId: req.auth.sub, status: "pending" },
        { $set: { status: "accepted" } },
        { new: true },
      );
      if (!link) return res.status(404).json({ message: "Invitation inconnue" });
      console.log(`[friends] Invitation ${link.id} acceptée`);
      res.json({ status: "friend", requestId: link.id });
    } catch (error) {
      console.error("[friends] Erreur d'acceptation", error);
      next(error);
    }
  });

  /** Refuse (destinataire) ou annule (expéditeur) une invitation en attente. */
  router.delete("/requests/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Invitation inconnue" });
      const me = req.auth.sub;
      const link = await Friendship.findOneAndDelete({
        _id: req.params.id,
        status: "pending",
        $or: [{ requesterId: me }, { recipientId: me }],
      });
      if (!link) return res.status(404).json({ message: "Invitation inconnue" });
      console.log(`[friends] Invitation ${link.id} refusée ou annulée`);
      res.status(204).end();
    } catch (error) {
      console.error("[friends] Erreur de refus d'invitation", error);
      next(error);
    }
  });

  /**
   * Retire un ami de l'escadrille. Les partages explicites entre les deux
   * membres sont arrêtés dans les deux sens : un ancien ami ne garde pas
   * l'accès aux médias qu'on lui avait partagés.
   */
  router.delete("/:userId", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const other = req.params.userId;
      if (!mongoose.isValidObjectId(other)) return res.status(404).json({ message: "Membre inconnu" });
      const link = await Friendship.findOneAndDelete({ pairKey: pairKey(me, other), status: "accepted" });
      if (!link) return res.status(404).json({ message: "Ce membre n'est pas dans votre escadrille" });

      const [mine, theirs] = await Promise.all([
        Media.updateMany({ ownerId: me, sharedWith: other }, { $pull: { sharedWith: new Types.ObjectId(other) } }),
        Media.updateMany({ ownerId: other, sharedWith: me }, { $pull: { sharedWith: new Types.ObjectId(me) } }),
      ]);
      console.log(`[friends] ${me} et ${other} ne sont plus amis (${mine.modifiedCount + theirs.modifiedCount} partage(s) arrêté(s))`);
      res.status(204).end();
    } catch (error) {
      console.error("[friends] Erreur de retrait d'un ami", error);
      next(error);
    }
  });

  return router;
}
