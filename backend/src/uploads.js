import fs from "node:fs";
import path from "node:path";

// Les fichiers (audio, images, vidéos) restent sur le disque du serveur.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
export const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}
