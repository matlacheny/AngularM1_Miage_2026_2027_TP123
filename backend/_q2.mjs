import { licenseName } from "./scripts/freesound.js";
const KEY = process.env.FREESOUND_API_KEY;
const Q = {
  "AMX-10 RC": ["amx-10", "amx 10"], "AMX-30": ["amx-30", "amx 30 tank"], "Airbus A400M Atlas": ["a400m"], "H225M Caracal": ["caracal helicopter", "h225"],
  "AS332 Super Puma": ["super puma", "puma helicopter"], "B1 (char)": ["char b1"], "Breguet Atlantic": ["breguet atlantic", "atlantique 2"],
  "M26 Pershing": ["pershing tank"], "Renault FT": ["renault ft"], "Mirage III": ["mirage iii", "mirage 3"], "Mirage IV": ["mirage iv"], "Mystère IV": ["mystere"],
  "Super-Étendard": ["etendard"], "Mosquito": ["mosquito aircraft", "de havilland mosquito"], "Panhard EBR": ["panhard"], "EBRC Jaguar": ["ebrc jaguar"],
  "Challenger 2": ["challenger tank"], "F-14": ["f-14 tomcat", "tomcat jet"], "Hurricane": ["hawker hurricane", "hurricane merlin"], "Ju 87": ["stuka"],
  "F-117": ["f-117", "nighthawk"], "M2 Bradley": ["bradley fighting", "bradley vehicle"], "Me 262": ["me 262", "me262"], "MiG-21": ["mig-21", "mig 21"],
  "MiG-29": ["mig-29", "mig 29", "fulcrum"], "Mi-24": ["mi-24", "hind helicopter", "mi 24"], "A6M Zero": ["zero fighter", "a6m"], "MS.406": ["morane"],
  "B-2 Spirit": ["b-2 bomber", "b2 spirit", "stealth bomber"], "Panhard AML": ["panhard aml"], "Su-27": ["su-27", "flanker"], "Su-57": ["su-57"],
  "Stryker": ["stryker vehicle"], "Alouette III": ["alouette helicopter", "alouette iii"], "Super Frelon": ["super frelon"], "Gazelle": ["gazelle helicopter", "sa342"],
  "T-34": ["t-34 tank", "t34 tank"], "T-72": ["t-72 tank", "t72"], "T-90": ["t-90 tank", "t90"], "Westland Lynx": ["lynx helicopter"], "Hurricane2": [],
};
for (const [v, qs] of Object.entries(Q)) {
  const seen = new Map();
  for (const q of qs) {
    const p = new URLSearchParams({ token: KEY, query: q, page_size: "15", filter: "duration:[3 TO 400]", fields: "id,name,username,license,duration,description,tags" });
    const r = await fetch(`https://freesound.org/apiv2/search/text/?${p}`);
    if (r.ok) for (const s of (await r.json()).results) if (licenseName(s.license)) seen.set(s.id, s);
    await new Promise((res) => setTimeout(res, 1100));
  }
  if (!seen.size) continue;
  console.log(`\n## ${v}`);
  for (const s of [...seen.values()].slice(0, 9)) console.log(`${s.id}|${Math.round(s.duration)}s|${licenseName(s.license)}|${s.username}|${s.name}|${s.description.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").slice(0, 150)}`);
}
