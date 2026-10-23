import express from "express";
import { Types } from "mongoose";
import { auth } from "../auth.js";
import { Notification, publicNotificationPipeline } from "../models/Notification.js";

/**
 * Routes /api/notifications : J'aime et commentaires reçus sur mes posts.
 * Chacun ne voit que les siennes (destinataire = JWT).
 */
export function createNotificationsRouter() {
  const router = express.Router();

  /** Interactions récentes (20 par défaut, 50 au plus) et nombre de non lues. */
  router.get("/", auth, async (req, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const me = new Types.ObjectId(req.auth.sub);
      const [items, unreadCount] = await Promise.all([
        Notification.aggregate(publicNotificationPipeline(me, limit)),
        Notification.countDocuments({ recipientId: me, read: false }),
      ]);
      res.json({ items, unreadCount });
    } catch (error) {
      console.error("[notifications] Erreur de lecture", error);
      next(error);
    }
  });

  /** Marque toutes mes notifications comme lues. */
  router.post("/read", auth, async (req, res, next) => {
    try {
      const result = await Notification.updateMany({ recipientId: req.auth.sub, read: false }, { $set: { read: true } });
      console.log(`[notifications] ${result.modifiedCount} notification(s) lue(s) par ${req.auth.sub}`);
      res.status(204).end();
    } catch (error) {
      console.error("[notifications] Erreur de marquage", error);
      next(error);
    }
  });

  return router;
}
