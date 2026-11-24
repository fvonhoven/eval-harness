// Shared by the scripts: picks the client (live, replay, or scripted) and the run matrix.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadGolden } from "../src/golden.ts";
import { anthropicClient } from "../src/providers/anthropic.ts";
import { openaiClient } from "../src/providers/openai.ts";
import { recordingClient, replayClient, type ReplayEntry, type ReplayFile } from "../src/providers/replay.ts";
import type { ChatClient } from "../src/providers/types.ts";
import type { RankOptions } from "../src/rank.ts";
import { scriptedClient } from "../src/scripted.ts";

export const ROOT = new URL("../", import.meta.url);
export const REPLAY_PATH = new URL("data/replay/golden.json", ROOT);
export const BASELINE_PATH = new URL("data/baseline.json", ROOT);
export const RUNS_DIR = new URL("runs/", ROOT);

export const MATRIX: RankOptions[] = [
  { model: "gpt-4o-mini", variant: "v1", chunkSize: 25 },
  { model: "gpt-4o-mini", variant: "v2", chunkSize: 25 },
  { model: "claude-haiku-4-5", variant: "v1", chunkSize: 25 },
  { model: "claude-haiku-4-5", variant: "v2", chunkSize: 25 },
];

export type Mode = "live" | "replay" | "scripted";

export function pickClient(): { mode: Mode; client: ChatClient; entries: ReplayEntry[]; note: string } {
  const golden = loadGolden();
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const entries: ReplayEntry[] = [];
  if (openai && anthropic) {
    const oa = openaiClient(openai);
    const an = anthropicClient(anthropic);
    const live: ChatClient = (req) => (req.model.startsWith("claude") ? an(req) : oa(req));
    return { mode: "live", client: recordingClient(live, entries), entries, note: "live calls, recording a fresh replay file" };
  }
  if (existsSync(REPLAY_PATH)) {
    const file = JSON.parse(readFileSync(REPLAY_PATH, "utf8")) as ReplayFile;
    return { mode: "replay", client: replayClient(file), entries, note: file.synthetic ? `replay of a SYNTHETIC fixture (${file.note})` : `replay of live responses recorded ${file.recordedAt}` };
  }
  return { mode: "scripted", client: scriptedClient(golden.articles), entries, note: "scripted model, no fixture on disk" };
}

export function writeJson(url: URL, value: unknown): void {
  mkdirSync(new URL("./", url), { recursive: true });
  writeFileSync(url, JSON.stringify(value, null, 2) + "\n");
}
