const KEY = process.env.FREESOUND_API_KEY;
for (const q of process.argv.slice(2)) {
  const p = new URLSearchParams({ token: KEY, query: q, page_size: "8", fields: "id,name,license,duration" });
  const d = await (await fetch(`https://freesound.org/apiv2/search/text/?${p}`)).json();
  console.log(`== ${q} (${d.count})`, d.results.map((s) => `${s.id}:${s.name}`).join(" | ").slice(0, 400));
  await new Promise((r) => setTimeout(r, 1100));
}
