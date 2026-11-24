// Runs the matrix over the golden set, prints the tables, writes runs/latest.json, and with
// --check compares every run with data/baseline.json and exits 1 on a regression.
import { existsSync, readFileSync } from "node:fs";
import { loadGolden } from "../src/golden.ts";
import { evaluate, type RunRecord } from "../src/harness.ts";
import { VIBECODER } from "../src/profile.ts";
import { compare, type Baseline } from "../src/regression.ts";
import { fmt, renderTable } from "../src/table.ts";
import { BASELINE_PATH, MATRIX, REPLAY_PATH, RUNS_DIR, pickClient, writeJson } from "./_setup.ts";

const check = process.argv.includes("--check");
const golden = loadGolden();
const { mode, client, entries, note } = pickClient();
const today = new Date().toISOString().slice(0, 10);

console.log(`eval-harness  mode: ${mode}  (${note})  date: ${today}`);
console.log(`golden set: ${golden.name}, ${golden.articles.length} articles, minimum rating ${VIBECODER.minimumRating}, k = ${VIBECODER.maxItems}\n`);

const records: RunRecord[] = [];
for (const opts of MATRIX) records.push(await evaluate(client, opts, VIBECODER, golden));

console.log("Ranking quality against the labels");
console.log(
  renderTable(
    ["run", "parsed", "exact", "within 1", "MAE", "spearman", "incl P", "incl R", "incl F1", "top-8"],
    records.map((r) => [
      r.id,
      `${r.metrics.parsed}/${r.metrics.n}`,
      fmt.pct(r.metrics.exact),
      fmt.pct(r.metrics.within1),
      fmt.num(r.metrics.mae),
      fmt.num(r.metrics.spearman),
      fmt.pct(r.metrics.includePrecision),
      fmt.pct(r.metrics.includeRecall),
      fmt.pct(r.metrics.includeF1),
      fmt.pct(r.metrics.topKOverlap),
    ]),
    ["l", "r", "r", "r", "r", "r", "r", "r", "r", "r"],
  ),
);

console.log("\nCost and calls");
console.log(
  renderTable(
    ["run", "calls", "errors", "input tok", "output tok", "cost", "latency"],
    records.map((r) => [r.id, String(r.usage.calls), String(r.usage.errors), fmt.int(r.usage.inputTokens), fmt.int(r.usage.outputTokens), fmt.usd(r.costUsd), `${fmt.int(r.usage.latencyMs)} ms`]),
    ["l", "r", "r", "r", "r", "r", "r"],
  ),
);

const worst = records.reduce((a, b) => (a.misses.length >= b.misses.length ? a : b));
if (worst.misses.length) {
  console.log(`\nLargest misses in ${worst.id} (label vs model, off by more than one point)`);
  console.log(renderTable(["id", "label", "got", "title"], worst.misses.slice(0, 8).map((m) => [m.id, String(m.label), String(m.got), m.title.slice(0, 70)]), ["l", "r", "r", "l"]));
}

writeJson(new URL("latest.json", RUNS_DIR), { recordedAt: today, mode, runs: Object.fromEntries(records.map((r) => [r.id, r.metrics])), records });
if (mode === "live" && entries.length) {
  writeJson(REPLAY_PATH, { synthetic: false, note: "live responses", recordedAt: today, entries });
  console.log(`\nrecorded ${entries.length} live responses to data/replay/golden.json`);
}

if (check) {
  const baseline = existsSync(BASELINE_PATH) ? (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline) : null;
  console.log(`\nRegression check against data/baseline.json${baseline ? ` (recorded ${baseline.recordedAt}, ${baseline.mode})` : " (no baseline on disk)"}`);
  let failed = false;
  for (const r of records) {
    const v = compare(r.id, r.metrics, baseline);
    if (v.missingBaseline) console.log(`  ${r.id}: no baseline, skipped`);
    else if (v.ok) console.log(`  ${r.id}: ok`);
    else {
      failed = true;
      console.log(`  ${r.id}: REGRESSION`);
      for (const f of v.failures) console.log(`    - ${f}`);
    }
  }
  if (failed) {
    console.log("\nregression detected; run `npm run baseline` only if the change is intended");
    process.exit(1);
  }
}
