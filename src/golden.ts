import { readFileSync } from "node:fs";
import type { GoldenSet } from "./types.ts";

export function loadGolden(path = new URL("../data/golden.json", import.meta.url)): GoldenSet {
  const g = JSON.parse(readFileSync(path, "utf8")) as GoldenSet;
  const ids = new Set<string>();
  for (const a of g.articles) {
    if (ids.has(a.id)) throw new Error(`golden: duplicate id ${a.id}`);
    ids.add(a.id);
    if (a.rating < 1 || a.rating > 10) throw new Error(`golden: ${a.id} rating out of range`);
    if (a.include !== a.rating >= g.minimumRating) throw new Error(`golden: ${a.id} include flag disagrees with rating`);
  }
  return g;
}
