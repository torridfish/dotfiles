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
 * Pair with `settings.mcpFooterStatus: "off"` in mcp-adapter.json, which
 * clears the persistent footer status — MCP info then lives only here.
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

// ── MCP data (mtime-cached reads) ──

interface McpInfo {
  /** Alphabetically sorted enabled server names. */
  names: string[];
  /** Tool counts from the adapter metadata cache, if present. */
  toolCounts: Map<string, number>;
  /** Path of the user-global adapter config, for the expanded view. */
  configPath: string;
}

interface CachedRead<T> {
  mtimeMs: number;
  missing: boolean;
  data: T;
}

// Re-read when mtime changes so a mid-session adapter update (which refreshes
// mcp-cache.json) is picked up on the next paint without polling.
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
  const agentDir = getAgentDir();
  const configPath = join(agentDir, "mcp-adapter.json");
  const config = readJsonCached(configPath) as { mcpServers?: Record<string, any> } | undefined;
  const cacheJson = readJsonCached(join(agentDir, "mcp-cache.json")) as
    | { servers?: Record<string, { tools?: unknown[] }> }
    | undefined;

  const servers = config?.mcpServers ?? {};
  const names = Object.entries(servers)
    // Server definitions are objects; disabled ones carry disabled: true.
    .filter(([, def]) => def != null && def.disabled !== true)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return undefined;

  const toolCounts = new Map<string, number>();
  if (cacheJson?.servers) {
    for (const [name, entry] of Object.entries(cacheJson.servers)) {
      if (Array.isArray(entry?.tools)) toolCounts.set(name, entry.tools.length);
    }
  }
  return { names, toolCounts, configPath };
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
    const tools = info.toolCounts.get(name);
    return tools ? `${name} (${tools} tools)` : name;
  };
  return {
    setExpanded(expanded: boolean) {
      isExpanded = expanded;
    },
    invalidate() {},
    render(_width: number): string[] {
      if (isExpanded) {
        return [heading(), ...info.names.map((name) => dim(`  ${formatServer(name)} — ${info.configPath}`))];
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
