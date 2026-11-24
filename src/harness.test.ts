import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./harness.ts";
import { loadGolden } from "./golden.ts";
import { VIBECODER } from "./profile.ts";
import { scriptedClient, countParsable } from "./scripted.ts";
import { buildRequest } from "./rank.ts";

describe("golden set", () => {
  it("loads, is consistent, and covers every rubric band", () => {
    const g = loadGolden();
    assert.ok(g.articles.length >= 30);
    const bands = new Set(g.articles.map((a) => (a.rating >= 9 ? "9-10" : a.rating >= 7 ? "7-8" : a.rating >= 5 ? "5-6" : "1-4")));
    assert.equal(bands.size, 4);
  });
});

describe("end to end with the scripted model", () => {
  const golden = loadGolden();
  it("v1 run produces metrics in range and some misses", async () => {
    const rec = await evaluate(scriptedClient(golden.articles), { model: "gpt-4o-mini", variant: "v1", chunkSize: 25 }, VIBECODER, golden);
    assert.equal(rec.metrics.n, golden.articles.length);
    assert.ok(rec.metrics.parseCoverage > 0.5 && rec.metrics.parseCoverage <= 1);
    assert.ok(rec.metrics.spearman > 0.5, `spearman ${rec.metrics.spearman}`);
    assert.ok(rec.costUsd > 0);
    assert.equal(rec.usage.calls, 2);
  });
  it("v2 run is fully aligned because the parser keys on position", async () => {
    const rec = await evaluate(scriptedClient(golden.articles), { model: "gpt-4o-mini", variant: "v2", chunkSize: 25 }, VIBECODER, golden);
    assert.equal(rec.metrics.parseCoverage, 1);
    assert.ok(rec.metrics.within1 >= 0.9, `within1 ${rec.metrics.within1}`);
  });
  it("scripted output is parseable by the production parser", async () => {
    const res = await scriptedClient(golden.articles)(buildRequest({ model: "gpt-4o-mini", variant: "v1", chunkSize: 25 }, VIBECODER, golden.articles.slice(0, 10)));
    assert.ok(countParsable(res.text) >= 8);
  });
  it("is deterministic for a given seed", async () => {
    const a = await evaluate(scriptedClient(golden.articles), { model: "claude-haiku-4-5", variant: "v1", chunkSize: 25 }, VIBECODER, golden);
    const b = await evaluate(scriptedClient(golden.articles), { model: "claude-haiku-4-5", variant: "v1", chunkSize: 25 }, VIBECODER, golden);
    assert.deepEqual(a.metrics, b.metrics);
  });
});
