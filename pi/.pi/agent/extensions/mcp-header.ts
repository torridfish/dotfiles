/**
 * mcp-header — Appends an [MCP] section to pi's startup resource listing.
 *
 * v1 replaced the whole header with a replica; that forced header-style
 * spacing (two blank lines) before [Context] and reordered sections.
 * v2 instead installs a one-time prototype patch on the LIVE InteractiveMode
 * class (imported from the same bundle chunk the running process uses) so
 * an [MCP] section is appended AFTER [Themes]/[Extensions] — same style,
 * same 1-blank spacing as core sections, and included in the Ctrl+O
 * expand/collapse toggle.
 *
 * v3 reads pi's NATIVE MCP config instead of the retired pi-mcp-adapter:
 * - Server list from ~/.pi/agent/mcp.json (global) and .pi/mcp.json
 *   (project, overrides same-name global entries), without servers marked
 *   `enabled: false`.
 * - Tool counts are live, from `pi.getAllTools()` grouped by the
 *   `mcp__<server>` namespace the built-in MCP support registers — so they
 *   reflect what actually connected this session, including servers added
 *   via `pi.registerMcpServer()`. A server that hasn't finished connecting
 *   at header-render time simply shows without a count.
 *
 * Failure modes are non-fatal: if the chunk can't be located or its shape
 * changed upstream, the extension degrades to a no-op.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";

// ── Locate the bundle chunk that defines the LIVE InteractiveMode ──

function findInteractiveModeChunk(): string | undefined {
  // argv[1] is pi's entry script (bin/pi or dist/bundle/cli.js); the bundle
  // lives next to it (symlink-resolved) under chunks/.
  const candidates: string[] = [];
  try {
    const entry = realpathSync(process.argv[1] ?? "");
    candidates.push(join(dirname(entry), "chunks"));
    candidates.push(join(dirname(entry), "..", "chunks"));
  } catch {
    /* argv[1] missing or unreadable */
  }
  for (const dir of candidates) {
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".js")) continue;
        const path = join(dir, file);
        try {
          const src = readFileSync(path, "utf-8");
          // Match the minified definitions of both the class and the method
          // we wrap, so a renamed method in a future pi version bails out.
          if (src.includes("showLoadedResources") && /InteractiveMode\s*=\s*class/.test(src)) {
            return path;
          }
        } catch {
          /* unreadable chunk, skip */
        }
      }
    } catch {
      /* chunks dir missing, try next */
    }
  }
  return undefined;
}

// ── MCP data (mtime-cached reads + live tool query) ──

interface McpInfo {
  /** Alphabetically sorted enabled server names, project entries overriding global ones. */
  names: string[];
  /** Defining config file and configured exposure per server, for the expanded view. */
  sources: Map<string, { file: string; exposure?: string }>;
}

interface CachedRead<T> {
  mtimeMs: number;
  missing: boolean;
  data: T;
}

// Re-read when mtime changes so a mid-session mcp.json edit is picked up on
// the next paint without polling.
const fileCache = new Map<string, CachedRead<unknown>>();

function readJsonCached(path: string): unknown {
  try {
    const mtimeMs = statSync(path).mtimeMs;
    const cached = fileCache.get(path);
    if (!cached || cached.missing || cached.mtimeMs !== mtimeMs) {
      fileCache.set(path, { mtimeMs, missing: false, data: JSON.parse(readFileSync(path, "utf-8")) });
    }
    return fileCache.get(path)!.data;
  } catch {
    fileCache.set(path, { mtimeMs: Number.NaN, missing: true, data: undefined });
    return undefined;
  }
}

function getMcpInfo(): McpInfo | undefined {
  const configFiles: Array<{ path: string; label: string }> = [
    { path: join(getAgentDir(), "mcp.json"), label: "global" },
  ];
  const projectPath = join(process.cwd(), ".pi", "mcp.json");
  try {
    if (statSync(projectPath).isFile()) configFiles.push({ path: projectPath, label: "project" });
  } catch {
    /* no project config */
  }

  // Project entries replace global entries with the same name (native rule).
  const servers = new Map<string, { file: string; exposure?: string }>();
  for (const { path, label } of configFiles) {
    const config = readJsonCached(path) as { mcpServers?: Record<string, any> } | undefined;
    for (const [name, def] of Object.entries(config?.mcpServers ?? {})) {
      if (def == null || def.enabled === false || def.disabled === true) continue;
      servers.set(name, {
        file: `${path} (${label})`,
        exposure: typeof def.exposure === "string" ? def.exposure : undefined,
      });
    }
  }
  if (servers.size === 0) return undefined;

  const names = [...servers.keys()].sort((a, b) => a.localeCompare(b));
  return { names, sources: servers };
}

// ── Live tool counts (query the running session, not a cache file) ──

// Set in the extension entry so render-time code can ask pi what actually
// connected. MCP tools are registered as `mcp__<server>__<tool>` with a
// namespace named exactly `mcp__<server>`.
let liveApi: { getAllTools(): Array<{ name?: string; namespace?: { name?: string } }> } | undefined;

function countTools(server: string): number | undefined {
  if (!liveApi || typeof liveApi.getAllTools !== "function") return undefined;
  let tools: Array<{ name?: string; namespace?: { name?: string } }>;
  try {
    tools = liveApi.getAllTools();
  } catch {
    return undefined;
  }
  const ns = `mcp__${server}`;
  const prefix = `${ns}__`;
  let count = 0;
  for (const tool of tools) {
    if (tool?.namespace?.name === ns || (!tool?.namespace?.name && typeof tool?.name === "string" && tool.name.startsWith(prefix))) {
      count++;
    }
  }
  return count;
}

// ── Theme (pi shares its Theme instance via globalThis across loaders) ──

function getSharedTheme(): any {
  try {
    return globalThis[Symbol.for("@earendil-works/pi-coding-agent:theme") as any] ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Section component (core-section look: [MCP] + dim list, Ctrl+O aware) ──

function makeMcpSection(info: McpInfo, initialExpanded: boolean) {
  let isExpanded = initialExpanded;
  const heading = () => {
    const t = getSharedTheme();
    return typeof t?.fg === "function" ? t.fg("mdHeading", "[MCP]") : "[MCP]";
  };
  const dim = (s: string) => {
    const t = getSharedTheme();
    return typeof t?.fg === "function" ? t.fg("dim", s) : s;
  };
  const formatServer = (name: string) => {
    const tools = countTools(name);
    return tools ? `${name} (${tools} tools)` : name;
  };
  return {
    setExpanded(expanded: boolean) {
      isExpanded = expanded;
    },
    invalidate() {},
    render(_width: number): string[] {
      if (isExpanded) {
        return [
          heading(),
          ...info.names.map((name) => {
            const source = info.sources.get(name);
            const tools = countTools(name);
            const parts = [tools !== undefined ? `${tools} tools` : undefined, source?.exposure].filter(Boolean);
            const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
            return dim(`  ${name}${detail} — ${source?.file ?? "native mcp.json"}`);
          }),
        ];
      }
      // Compact: single line like core sections.
      return [heading(), dim(`  ${info.names.map(formatServer).join(", ")}`)];
    },
  };
}

// ── Patch installation ──

const PATCH_MARKER = "__mcpSectionPatched";

function appendMcpSection(instance: any, options: any): void {
  const container = instance.loadedResourcesContainer;
  if (!container || typeof container.addChild !== "function") return;
  // Mirror the core's own showListing condition so [MCP] hides whenever the
  // other sections are hidden.
  const showListing =
    options?.force || instance.options?.verbose || !instance.settingsManager?.getQuietStartup?.();
  if (!showListing) return;

  const info = getMcpInfo();
  if (!info) return;

  const expanded = instance.options?.verbose || instance.toolOutputExpanded === true;
  container.addChild(makeMcpSection(info, expanded));
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Spacer } = require("@earendil-works/pi-tui");
    if (Spacer) container.addChild(new Spacer(1));
  } catch {
    /* trailing spacer is cosmetic; skip if pi-tui can't be resolved */
  }
}

function installPatch(Proto: any): boolean {
  const proto = Proto?.prototype;
  const current = proto?.showLoadedResources;
  if (typeof current !== "function") return false;
  if (current[PATCH_MARKER]) return true; // already patched on this class

  const wrapped = function wrappedShowLoadedResources(this: any, options?: unknown) {
    const result = current.apply(this, arguments as any);
    try {
      appendMcpSection(this, options);
    } catch {
      // Never let the cosmetic section break the real startup render.
    }
    return result;
  } as any;
  wrapped[PATCH_MARKER] = true;
  wrapped.__origShowLoadedResources = current;
  proto.showLoadedResources = wrapped;
  return true;
}

// ── Extension entry ──

export default function (pi: any) {
  // Keep the ExtensionAPI around so section rendering can query the CURRENTLY
  // connected MCP tools (getAllTools) instead of relying on a cache file.
  liveApi = pi;
  // Factory runs before the first session init, so patching here guarantees
  // the first showLoadedResources call already appends [MCP]. Async factory
  // is fine: pi awaits it during extension loading.
  (async () => {
    try {
      const chunk = findInteractiveModeChunk();
      if (!chunk) return;
      const mod: any = await import(chunk);
      installPatch(mod.InteractiveMode);
    } catch {
      // Silent no-op: cosmetic feature only.
    }
  })();
}
