/**
 * torrid-footer layout — Footer rendering
 *
 * 這是 customize footer layout 的地方。所有視覺元素（顏色、bar glyph、
 * 左右排版、顯示格式）都在這個檔案；量測邏輯在 tok-speed.ts，
 * 事件接線在 index.ts。
 *
 * 兩行架構（加上原生 extension statuses）：
 *   Line 1: ~/path/to/project (branch)               (provider) model • level
 *   Line 2: session name            42 tok/s • 380ms ttft • ▊▌░ 5% (1.0M)
 *   Line 3: extension statuses (native passthrough)
 *
 * Line 1 對齊原生 footer 的 workspace/model 資訊（dim）；
 * Line 2 用我們自己的 tok/s + context window 視覺化取代原生的 ↑↓R CH 統計。
 * Context bar 用 3 格八分塊字元（U+258F–U+2588），每格 1/8，共 24 階精度。
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RgbColor } from "./tok-speed";

// ── Footer data (built by index.ts each render) ──

export interface FooterData {
  // Line 1 — workspace & model (native info)
  cwd: string;
  gitBranch: string | null;
  sessionName: string | undefined;
  model: string;
  provider: string;
  /** Number of providers with available models; > 1 → show `(provider)` prefix. */
  providerCount: number;
  reasoning: boolean;
  thinkingLevel: string;

  // Line 2 — metrics (our visualization)
  tokPerSec: number | undefined;
  ttftMs: number | undefined;
  contextPercent: number | undefined;
  contextWindow: number | undefined;

  // Line 3 — extension statuses (native passthrough)
  /** Entries of the native statuses map, unsorted. */
  statuses: [string, string][];
}

// ── Color helpers ──

function interpolateColor(t: number, stops: RgbColor[]): RgbColor {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (stops.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = stops[Math.min(i, stops.length - 1)]!;
  const b = stops[Math.min(i + 1, stops.length - 1)]!;
  return {
    r: Math.round(a.r + (b.r - a.r) * f),
    g: Math.round(a.g + (b.g - a.g) * f),
    b: Math.round(a.b + (b.b - a.b) * f),
  };
}

function colorRgb(text: string, c: RgbColor): string {
  return `\x1b[38;2;${c.r};${c.g};${c.b}m${text}\x1b[39m`;
}

function formatContextWindow(n: number | undefined): string {
  if (!n) return "";
  if (n >= 1_000_000) {
    const divisor = 1_000_000;
    const isExact = n % divisor === 0;
    return `${(n / divisor).toFixed(isExact ? 0 : 1)}M`;
  }
  if (n >= 1_000) {
    const divisor = 1_000;
    const isExact = n % divisor === 0;
    return `${(n / divisor).toFixed(isExact ? 0 : 1)}K`;
  }
  return `${n}`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Palette ──

// Context usage gradient: green → yellow → orange → red (the only state-colored element).
// Muted/darkened tones so the indicator doesn't shout; only high usage stands out.
const CONTEXT_STOPS: RgbColor[] = [
  { r: 62, g: 135, b: 77 },    // dim green
  { r: 148, g: 135, b: 35 },   // dark yellow
  { r: 170, g: 105, b: 35 },   // dark orange
  { r: 165, g: 62, b: 55 },    // dark red
];

// ── Line 1 sections (workspace & model) ──
// Coloring: neutral. pwd default (white), branch muted gray, provider muted,
// model default, level muted — only the context % (Line 2) carries state color.

function renderWorkspace(data: FooterData, theme: any): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  let pwd = data.cwd;
  if (home && pwd.startsWith(home)) {
    pwd = "~" + pwd.slice(home.length);
  }
  // pwd in default terminal color (reads as white on dark themes)
  let out = pwd;
  if (data.gitBranch) out += theme.fg("muted", ` (${data.gitBranch})`);
  return out;
}

function renderSessionName(data: FooterData, theme: any): string {
  return data.sessionName ? theme.fg("muted", data.sessionName) : "";
}

function renderModelInfo(data: FooterData, theme: any): string {
  const parts: string[] = [];

  if (data.providerCount > 1 && data.provider) {
    parts.push(theme.fg("muted", `(${data.provider}) `));
  }

  let modelStr = data.model;
  if (data.reasoning) {
    const level = data.thinkingLevel === "off" ? "thinking off" : data.thinkingLevel;
    modelStr += theme.fg("muted", ` • ${level}`);
  }
  parts.push(modelStr);

  return parts.join("");
}

// ── Line 2 sections (our metrics) ──

function renderTokSpeed(data: FooterData, theme: any): string {
  if (data.tokPerSec === undefined) return "";
  if (data.tokPerSec === 0) {
    // Placeholder before any measurement: dim zero
    return theme.fg("dim", "0 tok/s");
  }
  // Neutral: measured value in default foreground (color = state, tok/s has none)
  return `${Math.round(data.tokPerSec)} tok/s`;
}

function renderTtft(data: FooterData, theme: any): string {
  if (data.ttftMs === undefined) return "";
  return theme.fg("dim", `${formatMs(data.ttftMs)} ttft`);
}

function renderContextUsage(data: FooterData, theme: any): string {
  const pct = data.contextPercent ?? 0;
  const ctxColor = interpolateColor(pct / 100, CONTEXT_STOPS);

  // The only state-colored element in the footer: % turns green→red with usage.
  const pctStr = data.contextPercent !== undefined ? `${Math.round(pct)}%` : "?";
  const ctxWin = formatContextWindow(data.contextWindow);

  return colorRgb(pctStr, ctxColor) +
         (pct >= 75
           ? colorRgb(` (${ctxWin})`, ctxColor)
           : theme.fg("dim", ` (${ctxWin})`));
}

// ── Left/right layout helper ──

function joinLeftRight(left: string, right: string, width: number): string {
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);

  if (leftW + rightW <= width) {
    const pad = " ".repeat(width - leftW - rightW);
    return truncateToWidth(left + pad + right, width);
  }
  // Not enough room: two rows
  return truncateToWidth(left, width) + "\n" + truncateToWidth(right, width);
}

// ── Footer rendering (called every render cycle) ──

export function renderFooter(data: FooterData, width: number, theme: any): string[] {
  const lines: string[] = [];

  // Line 1 — workspace & model info (native-style, dim)
  lines.push(...joinLeftRight(renderWorkspace(data, theme), renderModelInfo(data, theme), width).split("\n"));

  // Line 2 — session name (left)  |  our metrics cluster (right)
  const tokSpeedStr = renderTokSpeed(data, theme);
  const ttftStr = renderTtft(data, theme);
  const sep = theme.fg("muted", " • ");
  const metricsRight = [tokSpeedStr, ttftStr, renderContextUsage(data, theme)]
    .filter(Boolean).join(sep);
  lines.push(...joinLeftRight(renderSessionName(data, theme), metricsRight, width).split("\n"));

  // Line 3 — extension statuses (sorted by key, like native)
  if (data.statuses.length > 0) {
    const statusLine = data.statuses
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, text]) => text)
      .join(" ");
    lines.push(truncateToWidth(statusLine, width));
  }

  return lines;
}
