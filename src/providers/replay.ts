// Replay client: serves recorded responses keyed by the hash of the request.
// Recorded errors are re-thrown so the harness sees the same failure it would have seen live.
import { hashRequest } from "../hash.ts";
import type { ChatClient, ChatRequest, ChatResponse } from "./types.ts";

export type ReplayEntry = {
  requestHash: string;
  response?: { text: string; inputTokens: number; outputTokens: number; latencyMs: number; stopReason: string };
  error?: { message: string; latencyMs: number };
};

export type ReplayFile = { synthetic: boolean; note: string; recordedAt: string; entries: ReplayEntry[] };

export class ReplayError extends Error {
  latencyMs: number;
  constructor(message: string, latencyMs: number) {
    super(message);
    this.latencyMs = latencyMs;
  }
}

export function replayClient(file: ReplayFile): ChatClient {
  const queues = new Map<string, ReplayEntry[]>();
  for (const e of file.entries) {
    const q = queues.get(e.requestHash) ?? [];
    q.push(e);
    queues.set(e.requestHash, q);
  }
  return async (req: ChatRequest): Promise<ChatResponse> => {
    const key = hashRequest(req);
    const q = queues.get(key);
    if (!q || q.length === 0) throw new Error(`replay: no recording for request ${key} (model ${req.model})`);
    const entry = q.length > 1 ? (q.shift() as ReplayEntry) : q[0]!;
    if (entry.error) throw new ReplayError(entry.error.message, entry.error.latencyMs);
    const r = entry.response!;
    return {
      text: r.text,
      toolCalls: [],
      usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens },
      latencyMs: r.latencyMs,
      model: req.model,
      stopReason: r.stopReason,
    };
  };
}

// Wraps a client so every call is captured into a ReplayFile's entries.
export function recordingClient(inner: ChatClient, entries: ReplayEntry[]): ChatClient {
  return async (req) => {
    const requestHash = hashRequest(req);
    const started = performance.now();
    try {
      const res = await inner(req);
      entries.push({
        requestHash,
        response: {
          text: res.text,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          latencyMs: res.latencyMs,
          stopReason: res.stopReason,
        },
      });
      return res;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      entries.push({ requestHash, error: { message: String(err), latencyMs } });
      throw err;
    }
  };
}
