// Rating parser, ported line for line from the production stage. The model is asked for one
// integer per line; anything else (preamble, markdown, "8/10", commentary) has to be survived.
// A rating is a 1 or 2 digit integer at the start of a non-empty line, inside [lo, hi].

export function parseRatings(text: string, lo = 1, hi = 10): number[] {
  const ratings: number[] = [];
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,2})\b/.exec(line);
    if (!m) continue;
    const val = Number(m[1]);
    if (val >= lo && val <= hi) ratings.push(val);
  }
  return ratings;
}

// Stricter variant used by prompt v2: the line must be exactly "<n>. <rating>" so a dropped
// article cannot silently shift every rating after it. Returns a sparse map by position.
export function parseNumberedRatings(text: string, lo = 1, hi = 10): Map<number, number> {
  const out = new Map<number, number>();
  for (const raw of (text ?? "").split("\n")) {
    const m = /^\s*(\d{1,3})\s*[.:)\-]\s*(\d{1,2})\b/.exec(raw);
    if (!m) continue;
    const n = Number(m[1]);
    const val = Number(m[2]);
    if (val >= lo && val <= hi && !out.has(n)) out.set(n, val);
  }
  return out;
}
