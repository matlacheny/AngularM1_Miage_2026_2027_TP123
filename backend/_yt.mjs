import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { isRealVideo, keyTokens } from "./scripts/more-media.js";
import { isSpottingVideo } from "./scripts/video-sounds.js";
const V = {
  "AMX-10 P": ["AMX-10P engine sound", "AMX-10P"], "AMX-10 RC": ["AMX-10RC sound", "AMX-10 RC"], "AMX-30": ["AMX-30 engine start", "AMX-30 tank"],
  "Airbus A400M Atlas": ["A400M flyby sound", "A400M takeoff"], "Airbus Helicopters H225M Caracal": ["H225M Caracal takeoff", "Caracal helicopter landing"],
  "B1 (char)": ["Char B1 bis running", "Char B1 Saumur"], "Boxer (véhicule)": ["Boxer 8x8 driving", "Boxer armoured vehicle sound"],
  "Breguet Atlantic": ["Atlantique 2 flyby", "Breguet Atlantic takeoff"], "Char M26 Pershing": ["M26 Pershing running", "Pershing tank driving"],
  "Char Renault FT": ["Renault FT running", "Renault FT-17 running"], "Dassault Mirage IV": ["Mirage IV flyby", "Mirage IV takeoff"],
  "Dassault Mystère IV": ["Mystere IV flyby", "Mystere IV airshow"], "De Havilland DH.98 Mosquito": ["Mosquito flyby sound", "de Havilland Mosquito airshow"],
  "Engin blindé de reconnaissance": ["Panhard EBR running", "Panhard EBR Saumur"], "Engin blindé de reconnaissance et de combat": ["EBRC Jaguar driving", "Jaguar EBRC Satory"],
  "Grumman F-14 Tomcat": ["F-14 Tomcat takeoff", "F-14 Tomcat flyby"], "Junkers Ju 87": ["Ju 87 Stuka flying", "Stuka flyby"],
  "Lockheed F-117 Nighthawk": ["F-117 flyby", "F-117 Nighthawk takeoff"], "Messerschmitt Me 262": ["Me 262 flyby", "Me 262 airshow"],
  "Mitsubishi A6M": ["A6M Zero flyby", "Zero fighter airshow"], "Morane-Saulnier MS.406": ["Morane D-3801 flyby", "Morane 406 airshow"],
  "Panhard AML": ["Panhard AML driving", "Panhard AML 90 firing"], "Soukhoï Su-27": ["Su-27 flyby", "Su-27 airshow display"],
  "Sud-Aviation SA316 Alouette III": ["Alouette III takeoff", "Alouette III flyby"], "Sud-Aviation SA321 Super Frelon": ["Super Frelon takeoff", "Super Frelon flyby"],
  "T-34": ["T-34 tank running", "T-34 engine start"], "T-72": ["T-72 engine start", "T-72 driving"], "T-90": ["T-90 driving", "T-90 tank parade"],
  "Westland Lynx": ["Lynx helicopter takeoff", "Westland Lynx display"],
};
const out = {};
for (const [name, queries] of Object.entries(V)) {
  const tokens = keyTokens(name);
  const seen = new Map();
  for (const q of queries) {
    try {
      const lines = execFileSync("data/tools/yt-dlp.exe", ["--js-runtimes", "node", "--flat-playlist", "--no-warnings", "--print", "%(id)s\t%(duration)s\t%(channel)s\t%(title)s", `ytsearch12:${q}`], { encoding: "utf8" }).trim().split("\n");
      for (const l of lines) { const [id, d, ch, ...t] = l.split("\t"); seen.set(id, { id, duration: Number(d) || 0, channel: ch, title: t.join("\t") }); }
    } catch (e) { console.error(name, q, e.message.slice(0, 80)); }
  }
  out[name] = [...seen.values()].filter((v) => isRealVideo(v, tokens) && isSpottingVideo(v.title) && v.duration <= 900);
  console.log(`\n## ${name}`); for (const v of out[name].slice(0, 5)) console.log(`  ${v.id} | ${v.duration}s | ${v.channel} | ${v.title}`);
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
