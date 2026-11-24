// Plain-text tables. No box drawing characters, so the output pastes cleanly into a README.

export type Align = "l" | "r";

export function renderTable(headers: string[], rows: string[][], align?: Align[]): string {
  const widths = headers.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]?.length ?? 0)));
  const pad = (s: string, c: number) => ((align?.[c] ?? "l") === "r" ? s.padStart(widths[c]!) : s.padEnd(widths[c]!));
  const line = (cells: string[]) => cells.map((s, c) => pad(s, c)).join("  ").trimEnd();
  const rule = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(headers), rule, ...rows.map(line)].join("\n");
}

export const fmt = {
  usd: (v: number, digits = 4): string => "$" + v.toFixed(digits),
  pct: (v: number): string => (v * 100).toFixed(1) + "%",
  num: (v: number, digits = 2): string => v.toFixed(digits),
  int: (v: number): string => Math.round(v).toLocaleString("en-US"),
};
