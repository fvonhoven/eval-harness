// One readable pass: a six article batch through v1, the raw model text, what the parser made
// of it, and the score. Then the same batch through v2 so the alignment difference is visible.
import { loadGolden } from "../src/golden.ts";
import { score } from "../src/metrics.ts";
import { VIBECODER } from "../src/profile.ts";
import { assign, buildRequest } from "../src/rank.ts";
import { scriptedClient } from "../src/scripted.ts";
import { pickClient } from "./_setup.ts";

const golden = loadGolden();
const picked = pickClient();
// The replay fixture only holds the full golden set batches, so the demo uses the scripted
// model unless API keys make a live call possible.
const mode = picked.mode === "live" ? "live" : "scripted";
const client = mode === "live" ? picked.client : scriptedClient(golden.articles);
const batch = golden.articles.slice(0, 6);
console.log(`demo  mode: ${mode}${mode === "scripted" ? " (synthetic answers from src/scripted.ts)" : ""}\n`);

for (const variant of ["v1", "v2"] as const) {
  const opts = { model: "gpt-4o-mini", variant, chunkSize: 25 };
  const req = buildRequest(opts, VIBECODER, batch);
  const res = await client(req);
  const rated = assign(variant, batch, res.text, VIBECODER.minimumRating);
  console.log(`--- ${variant}: prompt is ${req.messages[0]!.content.length} chars, model answered:`);
  console.log(res.text.split("\n").map((l) => "    " + l).join("\n"));
  console.log("  parsed as:");
  for (const r of rated) {
    const label = golden.articles.find((g) => g.id === r.id)!.rating;
    console.log(`    ${r.id}  label ${String(label).padStart(2)}  got ${String(r.rating).padStart(2)}  ${r.include ? "include" : "skip   "}  ${r.title.slice(0, 60)}`);
  }
  const m = score(rated, batch, 3);
  console.log(`  parse coverage ${m.parsed}/${m.n}, within 1: ${(m.within1 * 100).toFixed(0)}%, include F1 ${m.includeF1.toFixed(2)}\n`);
}
