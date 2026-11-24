// Scores a rated run against the golden labels. Every number here answers one question a
// reviewer of the ranking stage would ask; the README names them.
import type { Labeled, Rated } from "./types.ts";

export type Metrics = {
  n: number;
  parsed: number; // positions that received a rating (rating > 0)
  parseCoverage: number; // parsed / n
  exact: number; // rating == label
  within1: number; // |rating - label| <= 1
  mae: number; // mean absolute error over parsed positions
  spearman: number; // rank correlation over parsed positions, -1..1
  includePrecision: number;
  includeRecall: number;
  includeF1: number;
  topKOverlap: number; // |model top k ∩ label top k| / k
  k: number;
};

function rankVector(values: number[]): number[] {
  // Average ranks for ties, 1-based.
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]![1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const ra = rankVector(a);
  const rb = rankVector(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i]! - ma;
    const y = rb[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export function score(rated: Rated[], golden: Labeled[], k = 8): Metrics {
  const byId = new Map(golden.map((g) => [g.id, g]));
  const pairs = rated.map((r) => ({ r, g: byId.get(r.id) }));
  if (pairs.some((p) => !p.g)) throw new Error("rated article not in golden set");
  const n = pairs.length;
  const parsedPairs = pairs.filter((p) => p.r.rating > 0);
  const parsed = parsedPairs.length;
  const exact = parsedPairs.filter((p) => p.r.rating === p.g!.rating).length;
  const within1 = parsedPairs.filter((p) => Math.abs(p.r.rating - p.g!.rating) <= 1).length;
  const mae = parsed ? parsedPairs.reduce((s, p) => s + Math.abs(p.r.rating - p.g!.rating), 0) / parsed : 0;
  const rho = spearman(parsedPairs.map((p) => p.r.rating), parsedPairs.map((p) => p.g!.rating));

  const tp = pairs.filter((p) => p.r.include && p.g!.include).length;
  const fp = pairs.filter((p) => p.r.include && !p.g!.include).length;
  const fn = pairs.filter((p) => !p.r.include && p.g!.include).length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  const topModel = new Set([...pairs].sort((a, b) => b.r.rating - a.r.rating).slice(0, k).map((p) => p.r.id));
  const topLabel = [...pairs].sort((a, b) => b.g!.rating - a.g!.rating).slice(0, k).map((p) => p.r.id);
  const overlap = topLabel.filter((id) => topModel.has(id)).length / Math.min(k, n);

  return {
    n,
    parsed,
    parseCoverage: n ? parsed / n : 0,
    exact: parsed ? exact / parsed : 0,
    within1: parsed ? within1 / parsed : 0,
    mae,
    spearman: rho,
    includePrecision: precision,
    includeRecall: recall,
    includeF1: f1,
    topKOverlap: overlap,
    k,
  };
}
