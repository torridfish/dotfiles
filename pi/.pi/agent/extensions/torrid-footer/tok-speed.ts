/**
 * tok-speed — Streaming token speed measurement
 *
 * Pure measurement module, no rendering concerns:
 * - tiktoken-based token counting (with char/4 fallback)
 * - streaming state tracking (start / update / end / freeze / reset)
 * - learned output-token estimate ratio (real usage vs streamed deltas)
 *
 * Methodology (aligned with vskrch/pi-tps-meter):
 * - Rate is measured from the FIRST streamed delta, not from message_start,
 *   so TTFT (prompt upload / queueing / hidden reasoning) doesn't drag the
 *   reported speed down.
 * - Tokens are counted incrementally per delta (text / thinking / toolcall),
 *   O(1) per update — the full message is never re-encoded on the render path.
 * - message_end locks in the provider's real usage.output and freezes the
 *   rate window (first delta → message_end). turn_end / agent_end are abort
 *   safety nets only.
 *
 * The footer layout consumes only `getStats()`.
 */

import { get_encoding } from "tiktoken";

type RgbColor = { r: number; g: number; b: number };
export type { RgbColor };

// ── Tiktoken tokenizer (lazy init) ──

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

/** Count tokens of a single streamed delta (tiktoken, ceil(chars/4) fallback). */
function countDeltaTokens(text: string): number {
  if (!text) return 0;
  const tiktokenInstance = getTiktoken();
  if (tiktokenInstance) {
    try {
      return tiktokenInstance.encode(text).length;
    } catch {
      // fall through to the estimate
    }
  }
  return Math.ceil(text.length / 4);
}

process.on("exit", () => tiktokenInstance?.free());

// ── Stream delta events ──

/** Subset of pi's AssistantMessageEvent that carries streamed content. */
export interface StreamDeltaEvent {
  type: string;
  delta?: string;
}

// Deltas that contain model-generated content worth counting. toolcall_delta
// matters: file writes / commands stream their content as tool-call arguments
// and are a large share of output tokens (the old parts-based capture missed
// them — pi uses `toolCall`/`arguments`, not `tool_use`/`input`).
const CONTENT_DELTA_TYPES = new Set(["text_delta", "thinking_delta", "toolcall_delta"]);

// ── Estimate ratio ──

// Estimated ratio of actual output tokens vs streamed-delta tokens.
// Helps the live estimate when providers report output tokens that never
// streamed (e.g. hidden reasoning).
// Robustness guards: only learn from substantial samples, and clamp so one
// compressible message (base64, runs of spaces) can't skew the live number.
const RATIO_MIN_SAMPLE_TOKENS = 50;
const RATIO_MIN = 1.0;
const RATIO_MAX = 3.0;
let tokenEstimateHistory: number[] = [];
function getTokenEstimateRatio(): number {
  if (tokenEstimateHistory.length < 2) return 1.0;
  const avg = tokenEstimateHistory.reduce((a, b) => a + b, 0) / tokenEstimateHistory.length;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, avg));
}

// ── Tracker ──

export interface TokSpeedStats {
  /** True while an assistant message is streaming. */
  isStreaming: boolean;
  /** Token count so far (provider's real usage after message_end, estimated while streaming). */
  tokens: number;
  /** Tokens per second measured from the first streamed delta, or undefined (no data / too little elapsed time). */
  tokPerSec: number | undefined;
  /** Time from user message to first streamed delta, in ms. undefined until measured. */
  ttftMs: number | undefined;
}

export class TokSpeedTracker {
  /** Called whenever stats change and a re-render would be useful. */
  onChange: (() => void) | null = null;

  private isStreaming = false;
  private streamEstTokens = 0;   // tiktoken sum over streamed deltas
  private realOutputTokens = 0;  // provider usage.output (set at message_end)
  private streamStartMs = 0;     // message_start (assistant)
  private firstDeltaMs = 0;      // first content delta — the rate is measured from here
  private frozenEndTime = 0;     // message_end / freeze time; keeps the final tok/s displayable

  private ttftStart = 0;  // When the user message arrives
  private ttftEnd = 0;    // First streamed delta

  /** message_start (role=user) — begin TTFT measurement. */
  beginTtft(): void {
    this.ttftStart = Date.now();
    this.ttftEnd = 0;
  }

  /** message_start (assistant) — begin timing a new message (replaces frozen values). */
  start(): void {
    this.isStreaming = true;
    this.streamEstTokens = 0;
    this.realOutputTokens = 0;
    this.streamStartMs = Date.now();
    this.firstDeltaMs = 0;
    this.frozenEndTime = 0;
    this.onChange?.();
  }

  /** message_update — feed the assistantMessageEvent (text/thinking/toolcall deltas). */
  update(event: StreamDeltaEvent): void {
    if (!this.isStreaming || !event) return;
    if (!CONTENT_DELTA_TYPES.has(event.type)) return;
    const delta = event.delta;
    if (typeof delta !== "string" || delta.length === 0) return;

    if (this.firstDeltaMs === 0) {
      this.firstDeltaMs = Date.now();
      if (this.ttftStart > 0 && this.ttftEnd === 0) {
        this.ttftEnd = this.firstDeltaMs;
        this.onChange?.();
      }
    }
    this.streamEstTokens += countDeltaTokens(delta);
    this.onChange?.();
  }

  /** message_end — feed final usage, lock in the accurate token count, freeze the rate window. */
  end(usage: any): void {
    if (!this.isStreaming) return;
    this.isStreaming = false;
    this.frozenEndTime = Date.now();

    const output = usage?.output;
    if (typeof output === "number" && output > 0) {
      this.realOutputTokens = output;

      // Track ratio: real output tokens / streamed-delta tokens, so the live
      // estimate can correct for tokens providers report but never streamed.
      if (this.streamEstTokens >= RATIO_MIN_SAMPLE_TOKENS && output > this.streamEstTokens) {
        tokenEstimateHistory.push(output / this.streamEstTokens);
        // Keep last 10 samples
        if (tokenEstimateHistory.length > 10) tokenEstimateHistory.shift();
      }
    }
    this.onChange?.();
  }

  /** turn_end / agent_end — abort safety: if message_end never fired (Esc/Ctrl-C,
   *  stream error), freeze whatever we have so the number stops decaying. */
  freeze(): void {
    if (!this.isStreaming) return;
    this.isStreaming = false;
    this.frozenEndTime = Date.now();
    this.onChange?.();
  }

  /** Full reset (new session). */
  reset(): void {
    this.isStreaming = false;
    this.streamEstTokens = 0;
    this.realOutputTokens = 0;
    this.streamStartMs = 0;
    this.firstDeltaMs = 0;
    this.frozenEndTime = 0;
    this.ttftStart = 0;
    this.ttftEnd = 0;
    this.onChange?.();
  }

  getStats(): TokSpeedStats {
    const tokens =
      this.realOutputTokens > 0
        ? this.realOutputTokens
        : Math.round(this.streamEstTokens * getTokenEstimateRatio());

    let tokPerSec: number | undefined;
    if (this.firstDeltaMs > 0) {
      // Rate window: first streamed delta → now (live) or → message_end (frozen).
      // Excludes TTFT, and — crucially — stops at message_end, so tool execution
      // time between assistant messages never dilutes the rate.
      const endMs = this.isStreaming ? Date.now() : this.frozenEndTime;
      const elapsedSec = (endMs - this.firstDeltaMs) / 1000;
      if (elapsedSec > 0.3) {
        tokPerSec = tokens / elapsedSec;
      }
    }

    return {
      isStreaming: this.isStreaming,
      tokens,
      tokPerSec,
      ttftMs: this.ttftEnd > 0 ? this.ttftEnd - this.ttftStart : undefined,
    };
  }
}
