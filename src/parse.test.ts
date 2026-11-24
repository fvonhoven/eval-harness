import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRatings, parseNumberedRatings } from "./parse.ts";

describe("parseRatings (production parser)", () => {
  it("reads one integer per line", () => {
    assert.deepEqual(parseRatings("8\n3\n10\n"), [8, 3, 10]);
  });
  it("skips blank lines and preamble", () => {
    assert.deepEqual(parseRatings("Here are the ratings:\n\n7\n\n9"), [7, 9]);
  });
  it("accepts '8/10' and '8 - strong' because the leading integer wins", () => {
    assert.deepEqual(parseRatings("8/10\n8 - strong tutorial"), [8, 8]);
  });
  it("drops out-of-range and non-numeric lines", () => {
    assert.deepEqual(parseRatings("0\n11\n- 7\nseven\n5"), [5]);
  });
  it("is fooled by a numbered list: '1. 8' reads as 1", () => {
    // This is the misalignment the harness exists to catch, so the test documents it.
    assert.deepEqual(parseRatings("1. 8\n2. 3"), [1, 2]);
  });
});

describe("parseNumberedRatings (v2 parser)", () => {
  it("maps position to rating and ignores order", () => {
    const m = parseNumberedRatings("2. 3\n1: 8\n3) 10");
    assert.deepEqual([...m.entries()].sort((a, b) => a[0] - b[0]), [[1, 8], [2, 3], [3, 10]]);
  });
  it("keeps the first value when a position repeats", () => {
    assert.equal(parseNumberedRatings("1. 8\n1. 2").get(1), 8);
  });
  it("ignores bare integers so a dropped line leaves a gap instead of shifting", () => {
    const m = parseNumberedRatings("1. 8\n3. 6");
    assert.equal(m.has(2), false);
    assert.equal(m.get(3), 6);
  });
});
