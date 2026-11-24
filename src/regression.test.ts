import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compare, type Baseline } from "./regression.ts";
import type { Metrics } from "./metrics.ts";

const m = (over: Partial<Metrics> = {}): Metrics => ({
  n: 40, parsed: 40, parseCoverage: 1, exact: 0.5, within1: 0.9, mae: 0.6, spearman: 0.85,
  includePrecision: 0.9, includeRecall: 0.9, includeF1: 0.9, topKOverlap: 0.875, k: 8, ...over,
});
const baseline: Baseline = { recordedAt: "2026-01-01", mode: "replay", runs: { "v1/m/chunk25": m() } };

describe("compare", () => {
  it("passes when nothing moved", () => {
    assert.equal(compare("v1/m/chunk25", m(), baseline).ok, true);
  });
  it("passes a small wobble inside tolerance", () => {
    assert.equal(compare("v1/m/chunk25", m({ includeF1: 0.86, spearman: 0.8 }), baseline).ok, true);
  });
  it("fails on any drop in parse coverage", () => {
    const v = compare("v1/m/chunk25", m({ parseCoverage: 0.975 }), baseline);
    assert.equal(v.ok, false);
    assert.match(v.failures[0]!, /parse coverage fell/);
  });
  it("fails when mae rises past the rule", () => {
    assert.equal(compare("v1/m/chunk25", m({ mae: 0.9 }), baseline).ok, false);
  });
  it("improvements never fail", () => {
    assert.equal(compare("v1/m/chunk25", m({ includeF1: 1, mae: 0 }), baseline).ok, true);
  });
  it("a run with no baseline passes and says so", () => {
    const v = compare("v2/other/chunk25", m(), baseline);
    assert.equal(v.ok, true);
    assert.equal(v.missingBaseline, true);
  });
});
