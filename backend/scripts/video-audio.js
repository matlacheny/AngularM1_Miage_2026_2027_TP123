import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/*
 * Extraction de la bande son d'une vidéo (scripts de démonstration) : la vidéo est
 * téléchargée dans un dossier temporaire, ffmpeg en tire au plus 2 minutes en OGG
 * Vorbis, et une piste muette (vidéo sans son) est refusée.
 */

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_SECONDS = 120;
const SILENCE_DB = -55; // volume moyen en dessous duquel la piste est considérée muette

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(stderr.trim().split("\n").at(-1) || `ffmpeg ${code}`))));
  });
}

/** true si ffmpeg est utilisable. */
export async function ffmpegAvailable() {
  try {
    await run(["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Volume moyen (dB) lu dans la sortie du filtre volumedetect, ou null. */
export function meanVolume(stderr) {
  const match = stderr.match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
  if (!match) return null;
  return match[1] === "-inf" ? -Infinity : Number(match[1]);
}

/**
 * Télécharge `url`, écrit la bande son dans `outDir` et retourne { storedName, size }.
 * Lève une erreur si la vidéo n'a pas de son exploitable.
 */
export async function extractAudio(url, outDir, fetchOptions = {}) {
  const tmp = path.join(os.tmpdir(), `afterburner-${crypto.randomUUID()}`);
  const storedName = `${crypto.randomUUID()}.ogg`;
  const out = path.join(outDir, storedName);
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`téléchargement ${response.status}`);
    await fs.writeFile(tmp, Buffer.from(await response.arrayBuffer()));
    await run(["-y", "-v", "error", "-i", tmp, "-vn", "-t", String(MAX_SECONDS), "-ac", "2", "-c:a", "libvorbis", "-q:a", "5", out]);
    const volume = meanVolume(await run(["-i", out, "-af", "volumedetect", "-f", "null", "-"]));
    if (volume === null || volume < SILENCE_DB) throw new Error(`piste muette (${volume} dB)`);
    return { storedName, size: (await fs.stat(out)).size };
  } catch (error) {
    await fs.rm(out, { force: true });
    throw new Error(/does not contain any stream|Output file .* does not contain/.test(error.message) ? "vidéo sans piste audio" : error.message);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
