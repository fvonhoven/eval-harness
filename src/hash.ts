import { createHash } from "node:crypto";
import type { ChatRequest } from "./providers/types.ts";

export function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

// Hash of everything that determines the prompt: model, system text and messages.
export function hashRequest(req: ChatRequest): string {
  return shortHash(JSON.stringify({ model: req.model, system: req.system ?? "", messages: req.messages }));
}
