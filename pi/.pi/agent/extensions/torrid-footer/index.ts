/**
 * torrid-footer — Custom footer extension
 *
 * 用 /footer 開關。
 *
 * 檔案分工：
 * - index.ts     事件接線（streaming events → tracker）、組 FooterData、/footer 指令
 * - tok-speed.ts tok/s 與 TTFT 量測（tiktoken 計數、streaming 統計）
 * - layout.ts    footer 版面與視覺（customize layout 改這裡）
 *
 * 版面：
 *   Line 1: workspace (branch)               (provider) model • level   ← 原生資訊
 *   Line 2: session name   tok/s • ttft • ▊▌░ 5% (1M)                   ← 我們的視覺化
 *   Line 3: extension statuses（原生 passthrough，例如 pi-token-speed）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TokSpeedTracker } from "./tok-speed";
import { renderFooter, type FooterData } from "./layout";

// ── Footer state ──

let tuiRef: { requestRender(): void } | null = null;
let sessionCtxRef: any = null;  // Captured session context
// Native footer data provider (getGitBranch / getExtensionStatuses / getAvailableProviderCount)
let footerDataProviderRef: any = null;
let footerEnabled = false;

const tracker = new TokSpeedTracker();

function keepFresh(): void {
  tuiRef?.requestRender();
}

tracker.onChange = keepFresh;

/** Build the plain data consumed by layout.renderFooter each render cycle. */
function buildFooterData(ctx: any): FooterData {
  const model = ctx?.model?.id || "unknown";
  const provider = (ctx?.model as any)?.provider || "";
  const usage = ctx?.getContextUsage?.();
  const stats = tracker.getStats();

  // Native statuses map → entries array (layout sorts and joins)
  let statuses: [string, string][] = [];
  try {
    const map = footerDataProviderRef?.getExtensionStatuses?.();
    if (map) statuses = Array.from(map.entries());
  } catch {
    // provider not ready yet
  }

  return {
    // Line 1 — workspace & model
    cwd: ctx?.sessionManager?.getCwd?.() ?? "",
    gitBranch: footerDataProviderRef?.getGitBranch?.() ?? null,
    sessionName: ctx?.sessionManager?.getSessionName?.(),
    model,
    provider,
    providerCount: footerDataProviderRef?.getAvailableProviderCount?.() ?? 1,
    reasoning: !!(ctx?.model as any)?.reasoning,
    thinkingLevel: ctx?.thinkingLevel ?? "off",

    // Line 2 — metrics (0 placeholders before any measurement)
    tokPerSec: stats.tokPerSec ?? 0,
    ttftMs: stats.ttftMs ?? 0,
    contextPercent: usage?.percent,
    contextWindow: (ctx?.model as any)?.contextWindow,

    // Line 3 — statuses
    statuses,
  };
}

// ── Footer factory ──

function makeFooter(tui: any, theme: any, footerDataProvider: any) {
  tuiRef = tui;
  footerDataProviderRef = footerDataProvider;

  return {
    dispose() {
      tuiRef = null;
      footerDataProviderRef = null;
    },
    invalidate() {
      tuiRef?.requestRender();
    },
    render(width: number): string[] {
      return renderFooter(buildFooterData(sessionCtxRef), width, theme);
    },
  };
}

// ── Extension entry ──

export default function (pi: ExtensionAPI) {
  // /footer command to toggle
  pi.registerCommand("footer", {
    description: "Toggle tok-speed footer",
    handler: async (_args, ctx) => {
      footerEnabled = !footerEnabled;
      if (footerEnabled) {
        ctx.ui.setFooter(makeFooter);
        ctx.ui.notify("✅ Footer enabled", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("❌ Footer disabled", "info");
      }
    },
  });

  // ── Streaming event handlers ──
  // NOTE: registered once at extension load. session_start fires again on
  // /new, /resume and /fork — handlers registered inside it would stack up
  // and double-count deltas.

  pi.on("message_start", async (event) => {
    if (event.message.role === "user") {
      tracker.beginTtft();
    } else if (event.message.role === "assistant") {
      tracker.start();
    }
  });

  pi.on("message_update", async (event) => {
    if (event.message.role === "assistant" && event.assistantMessageEvent) {
      // Count incrementally from the delta itself (text/thinking/toolcall);
      // re-tokenizing the whole message parts per delta was O(n²).
      tracker.update(event.assistantMessageEvent);
    }
  });

  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant") {
      tracker.end((event.message as any).usage);
    }
  });

  // turn_end normally fires after message_end (freeze() is a no-op then);
  // it only matters as a freeze point when a stream was interrupted.
  pi.on("turn_end", async () => {
    tracker.freeze();
  });

  // Safety net: if a stream is aborted (Esc/Ctrl-C) or errors, message_end may
  // not fire for that message — agent_end always does.
  pi.on("agent_end", async () => {
    tracker.freeze();
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionCtxRef = ctx;
    footerEnabled = true;

    ctx.ui.setFooter(makeFooter);
  });
}
