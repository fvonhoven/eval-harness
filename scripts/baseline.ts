// Promotes runs/latest.json to data/baseline.json. Run it after a measure whose numbers you
// have looked at and accept as the new reference.
import { existsSync, readFileSync } from "node:fs";
import { BASELINE_PATH, RUNS_DIR, writeJson } from "./_setup.ts";

const latest = new URL("latest.json", RUNS_DIR);
if (!existsSync(latest)) {
  console.error("no runs/latest.json; run `npm run measure` first");
  process.exit(1);
}
const data = JSON.parse(readFileSync(latest, "utf8")) as { recordedAt: string; mode: string; runs: Record<string, unknown> };
writeJson(BASELINE_PATH, { recordedAt: data.recordedAt, mode: data.mode, runs: data.runs });
console.log(`baseline updated from a ${data.mode} run recorded ${data.recordedAt} (${Object.keys(data.runs).length} runs)`);
