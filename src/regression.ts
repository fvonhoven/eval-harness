// Compares a run's metrics with a committed baseline and decides pass or fail. The tolerances
// are deliberate: a prompt or model change that moves a metric by less than the tolerance is
// noise on a golden set this size, anything more is a regression someone should look at.
import type { Metrics } from "./metrics.ts";

export type Baseline = {
  recordedAt: string;
  mode: string;
  runs: Record<string, Metrics>; // keyed by run id, e.g. "v1/gpt-4o-mini"
};

export type Tolerance = { key: keyof Metrics; maxDrop: number; label: string };

// "Higher is better" metrics and how much each may fall before the check fails.
export const TOLERANCES: Tolerance[] = [
  { key: "parseCoverage", maxDrop: 0.0, label: "parse coverage" },
  { key: "includeF1", maxDrop: 0.05, label: "include F1" },
  { key: "topKOverlap", maxDrop: 0.125, label: "top-k overlap" }, // one item of eight
  { key: "spearman", maxDrop: 0.1, label: "spearman" },
  { key: "within1", maxDrop: 0.05, label: "within 1" },
];

export type Verdict = { runId: string; ok: boolean; failures: string[]; missingBaseline: boolean };

export function compare(runId: string, current: Metrics, baseline: Baseline | null): Verdict {
  const prior = baseline?.runs[runId];
  if (!prior) return { runId, ok: true, failures: [], missingBaseline: true };
  const failures: string[] = [];
  for (const t of TOLERANCES) {
    const before = prior[t.key] as number;
    const after = current[t.key] as number;
    if (before - after > t.maxDrop + 1e-9) {
      failures.push(`${t.label} fell from ${before.toFixed(3)} to ${after.toFixed(3)} (allowed drop ${t.maxDrop})`);
    }
  }
  // MAE is "lower is better" and gets its own rule.
  if (current.mae - prior.mae > 0.25) {
    failures.push(`mae rose from ${prior.mae.toFixed(2)} to ${current.mae.toFixed(2)} (allowed rise 0.25)`);
  }
  return { runId, ok: failures.length === 0, failures, missingBaseline: false };
}
