import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { score, spearman } from "./metrics.ts";
import type { Labeled, Rated } from "./types.ts";

const golden: Labeled[] = [
  { id: "a", title: "a", description: "", link: "", source: "s", rating: 10, include: true },
  { id: "b", title: "b", description: "", link: "", source: "s", rating: 8, include: true },
  { id: "c", title: "c", description: "", link: "", source: "s", rating: 5, include: false },
  { id: "d", title: "d", description: "", link: "", source: "s", rating: 2, include: false },
];
const rate = (rs: number[]): Rated[] => golden.map((g, i) => ({ ...g, rating: rs[i]!, include: rs[i]! >= 7 }));

describe("spearman", () => {
  it("is 1 for identical order and -1 for reversed", () => {
    assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
    assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  });
  it("handles ties with average ranks", () => {
    assert.ok(Math.abs(spearman([1, 1, 2], [1, 2, 3]) - 0.866) < 0.01);
  });
});

describe("score", () => {
  it("perfect run scores 1 everywhere", () => {
    const m = score(rate([10, 8, 5, 2]), golden, 2);
    assert.equal(m.parseCoverage, 1);
    assert.equal(m.exact, 1);
    assert.equal(m.includeF1, 1);
    assert.equal(m.topKOverlap, 1);
    assert.equal(m.spearman, 1);
    assert.equal(m.mae, 0);
  });
  it("unparsed positions reduce coverage but not accuracy of the rest", () => {
    const m = score(rate([10, 0, 5, 0]), golden, 2);
    assert.equal(m.parseCoverage, 0.5);
    assert.equal(m.exact, 1);
    assert.equal(m.includeRecall, 0.5); // b was includable and got dropped
  });
  it("right decision, wrong number: include F1 stays high while exact falls", () => {
    const m = score(rate([9, 7, 6, 1]), golden, 2);
    assert.equal(m.includeF1, 1);
    assert.equal(m.exact, 0);
    assert.equal(m.within1, 1);
  });
  it("rejects a rated id missing from the golden set", () => {
    assert.throws(() => score([{ ...golden[0]!, id: "zzz" }], golden), /not in golden set/);
  });
});
