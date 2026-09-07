/**
 * tok-speed — Streaming token speed measurement
 *
 * Pure measurement module, no rendering concerns:
 * - tiktoken-based token counting (with char-estimate fallback)
 * - streaming state tracking (start / update / end / reset)
 * - learned output-token estimate ratio (real usage vs captured content)
 *
 * The footer layout consumes only `getStats()`.
 */

import { get_encoding } from "tiktoken";

type RgbColor = { r: number; g: number; b: number };
export type { RgbColor };

// ── Tiktoken tokenizer (lazy init) ──
// NOTE: initialized on first encode; the original file defined init but never
// called it, so tiktoken was silently never used (always the ÷3 fallback).

let tiktokenInstance: Awaited<ReturnType<typeof get_encoding>> | null = null;

function getTiktoken(): Awaited<ReturnType<typeof get_encoding>> | null {
  if (tiktokenInstance) return tiktokenInstance;
  try {
    tiktokenInstance = get_encoding("cl100k_base");
    return tiktokenInstance;
  } catch {
    try {
      tiktokenInstance = get_encoding("p50k_base");
      return tiktokenInstance;
    } catch {
      return null;
    }
  }
}

function encodeWithFallback(text: string): number {
  if (!text) return 0;
  const tiktokenInstance = getTiktoken();
  if (tiktokenInstance) {
    try {
      return tiktokenInstance.encode(text).length;
    } catch {
      return Math.round(text.length / 3.0);
    }
  }
  return Math.round(text.length / 3.0);
}

/** Count tokens from a plain text string (already extracted by countAllContentText). */
function countTextTokens(text: string): number {
  return encodeWithFallback(text);
}

process.on("exit", () => tiktokenInstance?.free());

// ── Content extraction ──

// Structural fields that appear in message parts but are NOT model content.
// These are skipped by the catch-all to avoid false token captures.
const STRUCTURAL_FIELDS = new Set([
  "type",        // Block type (text, tool_use, thinking, etc.)
  "id",          // Tool call ID
  "name",        // Tool name
  "status",      // Tool status
  "cache_control", // EBSI cache control
  "cachePriority", // Experimental cache priority
]);

// Known content fields handled by specific type checks.
// Prevents the catch-all from re-adding these.
const CONTENT_FIELDS = new Set(["text", "thinking", "message", "content"]);

/**
 * Concatenate all content from message parts into one string.
 * Handles text, thinking, tool_use (input), file_write (content),
 * error (message), and any other string-valued fields.
 * This captures tokens from ALL content types the model streams.
 */
function countAllContentText(parts: any[]): string {
  let result = "";
  for (const p of parts) {
    if (p.type === "text" && typeof p.text === "string") {
      result += p.text;
    } else if (p.type === "thinking" && typeof p.thinking === "string") {
      result += p.thinking;
    } else if (p.type === "tool_use" && typeof p.input === "object" && p.input !== null) {
      result += JSON.stringify(p.input);
    } else if (p.type === "file_write" && typeof p.content === "string") {
      result += p.content;
    } else if (p.type === "error" && typeof p.message === "string") {
      result += p.message;
    }

    // Catch-all: add any other string fields. Skip structural and content fields.
    for (const key of Object.keys(p)) {
      if (!STRUCTURAL_FIELDS.has(key) && !CONTENT_FIELDS.has(key) && typeof p[key] === "string") {
        result += p[key];
      }
    }
  }
  return result;
}

// ── Estimate ratio ──

// Estimated ratio of actual output tokens vs captured content tokens.
// Helps estimate total during streaming when usage.output is not yet available.
let tokenEstimateHistory: number[] = [];
function getTokenEstimateRatio(): number {
  if (tokenEstimateHistory.length < 2) return 1.0;
  const avg = tokenEstimateHistory.reduce((a, b) => a + b, 0) / tokenEstimateHistory.length;
  return Math.max(1.0, avg);
}

// ── Tracker ──

export interface TokSpeedStats {
  /** True while an assistant message is streaming. */
  isStreaming: boolean;
  /** Token count so far (accurate after message_end, estimated while streaming). */
  tokens: number;
  /** Tokens per second while streaming, or undefined (not streaming / not enough data / noise). */
  tokPerSec: number | undefined;
  /** Time from user message to first streamed delta, in ms. undefined until measured. */
  ttftMs: number | undefined;
}

export class TokSpeedTracker {
  /** Called whenever stats change and a re-render would be useful. */
  onChange: (() => void) | null = null;

  private isStreaming = false;
  private streamingFullText = "";
  private streamingRealTokens = 0;
  private streamingStartTime = 0;  // When generation starts (message_start)
  private frozenEndTime = 0;       // When the turn ended; keeps the final tok/s displayable

  private ttftStart = 0;  // When the user message arrives
  private ttftEnd = 0;    // First streamed delta

  /** message_start (role=user) — begin TTFT measurement. */
  beginTtft(): void {
    this.ttftStart = Date.now();
    this.ttftEnd = 0;
  }

  /** message_start — begin timing a new assistant message (replaces frozen values). */
  start(): void {
    this.streamingFullText = "";
    this.streamingRealTokens = 0;
    this.streamingStartTime = Date.now();
    this.frozenEndTime = 0;
    this.isStreaming = true;
    this.onChange?.();
  }

  /** message_update — feed the current assistant message parts. */
  update(parts: any[]): void {
    if (this.ttftStart > 0 && this.ttftEnd === 0) {
      this.ttftEnd = Date.now();
      this.onChange?.();
    }
    const full = countAllContentText(parts);
    if (full !== this.streamingFullText) {
      this.streamingFullText = full;
      this.onChange?.();
    }
  }

  /** message_end — feed final usage to lock in the accurate token count. */
  end(usage: any): void {
    if (usage?.output) {
      this.streamingRealTokens = usage.output;

      // Track ratio: actual output tokens / captured content tokens.
      // Captured content may miss some tokens (structural, whitespace, special tokens),
      // so the ratio helps us estimate total during streaming.
      const contentTokens = countTextTokens(this.streamingFullText);
      if (contentTokens > 0 && usage.output > contentTokens) {
        tokenEstimateHistory.push(usage.output / contentTokens);
        // Keep last 10 samples
        if (tokenEstimateHistory.length > 10) tokenEstimateHistory.shift();
      }
    }
    this.onChange?.();
  }

  /** turn_end — freeze the final numbers so the footer keeps showing them. */
  reset(): void {
    this.isStreaming = false;
    if (this.streamingStartTime > 0 && this.frozenEndTime === 0) {
      this.frozenEndTime = Date.now();
    }
    this.onChange?.();
  }

  getStats(): TokSpeedStats {
    // Elapsed: live while streaming, frozen after turn_end (final average stays visible)
    let elapsedSec = 0;
    if (this.streamingStartTime > 0) {
      elapsedSec = this.isStreaming
        ? (Date.now() - this.streamingStartTime) / 1000
        : (this.frozenEndTime - this.streamingStartTime) / 1000;
    }

    let tokens: number;
    if (this.streamingRealTokens > 0) {
      // Final accurate count from usage
      tokens = this.streamingRealTokens;
    } else if (this.streamingFullText.length > 0) {
      // Estimate total tokens: captured content tokens * learned ratio
      const contentTokens = countTextTokens(this.streamingFullText);
      const ratio = getTokenEstimateRatio();
      tokens = Math.round(contentTokens * ratio);
    } else {
      tokens = 0;
    }

    let tokPerSec: number | undefined;
    if (this.streamingStartTime > 0 && elapsedSec > 0.1) {
      tokPerSec = tokens / elapsedSec;
      if (this.isStreaming && tokPerSec > 500) tokPerSec = undefined; // cap: treat as noise
    }

    return {
      isStreaming: this.isStreaming,
      tokens,
      tokPerSec,
      ttftMs: this.ttftEnd > 0 ? this.ttftEnd - this.ttftStart : undefined,
    };
  }
}
