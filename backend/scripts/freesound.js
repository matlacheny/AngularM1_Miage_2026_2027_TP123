/*
 * Sons Freesound (https://freesound.org/docs/api/) pour les scripts de démonstration.
 * La clé (FREESOUND_API_KEY) suffit pour lire les fiches et télécharger l'aperçu
 * OGG haute qualité (~192 kbit/s) ; le fichier original exigerait OAuth2.
 */

const API = "https://freesound.org/apiv2";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** « http://creativecommons.org/licenses/by/4.0/ » → « CC BY 4.0 ». Null si la licence n'est pas libre (NC…). */
export function licenseName(url) {
  const zero = url.match(/publicdomain\/zero\/([\d.]+)/);
  if (zero) return `CC0 ${zero[1]}`;
  const by = url.match(/licenses\/by\/([\d.]+)/);
  return by ? `CC BY ${by[1]}` : null;
}

/**
 * Fiches des sons demandés, au format des fichiers Commons des scripts :
 * { id, vehicle, title, originalName, artist, license, pageUrl, src, mime, ext, kind }. Sans clé : liste vide.
 */
export async function freesoundFiles(sounds, key = process.env.FREESOUND_API_KEY) {
  if (!key) {
    console.log("[freesound] FREESOUND_API_KEY absente : sons Freesound ignorés");
    return [];
  }
  const files = [];
  for (const sound of sounds) {
    const params = new URLSearchParams({ token: key, fields: "id,name,username,license,url,previews" });
    const response = await fetch(`${API}/sounds/${sound.id}/?${params}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      console.log(`[freesound] Son ${sound.id} indisponible (${response.status})`);
      continue;
    }
    const data = await response.json();
    const license = licenseName(data.license);
    if (!license) {
      console.log(`[freesound] Son ${sound.id} ignoré : licence non libre (${data.license})`);
      continue;
    }
    files.push({
      ...sound, originalName: `freesound-${data.id}.ogg`, artist: data.username, license, pageUrl: data.url,
      src: data.previews["preview-hq-ogg"], mime: "audio/ogg", ext: "ogg", kind: "audio",
    });
    await sleep(1100); // limite de l'API : 60 requêtes par minute
  }
  return files;
}
