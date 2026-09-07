/**
 * mermaid-mmrs — render mermaid code blocks as real images with mmrs.
 *
 * Replaces pi's built-in grok-mermaid Unicode-art rendering (set
 * `markdown.mermaid: "off"` in settings.json) with actual SVG renders from
 * mmrs (mermaid-rs-cli, pure Rust — no browser/Puppeteer), rasterized with
 * resvg (with the bundled Hack font) and displayed inline in the terminal
 * via the kitty graphics protocol.
 *
 * Pipeline:
 *   assistant ```mermaid block
 *     → mmrs  -i x.mmd -o x.svg -t <theme>        (SVG)
 *     → resvg --zoom N --use-font-file Hack.ttf   (PNG @2x for crisp cells)
 *     → pi.appendEntry + pi-tui Image component   (kitty graphics protocol)
 *
 * Behavior:
 *   - Fully automatic: any assistant message containing ```mermaid is
 *     rendered on message_end. The agent calls no tools.
 *   - Backfill: on session_start, assistant messages already in the session
 *     (created before the extension was loaded, or in resumed sessions) are
 *     rendered too; entries append at the end of the branch.
 *   - Width auto-fit: images scale to the full transcript width (capped by
 *     maxWidthCells for those who want a smaller cap).
 *   - Theme changes are retroactive: /mermaid-theme force-re-renders the
 *     on-disk cache (hashes are theme-independent) and reloads the transcript,
 *     so existing diagrams pick up the new theme.
 *   - Entry renderers prefer the on-disk PNG (current theme) and fall back to
 *     the base64 stored in the entry (e.g. after cache eviction).
 *   - Rendered fences collapse to a one-liner in the assistant message
 *     (config: hideCode); unknown sources keep their code.
 *
 * Requires: mmrs + resvg (cargo install mermaid-rs-cli resvg), kitty/iterm2
 * terminal for inline images. Anything else degrades gracefully.
 *
 * Command: /mermaid-theme [default|dark|forest|neutral]
 * Config:  config.json next to this file (theme, zoom, maxWidthCells,
 *          hideCode, mmrsPath, resvgPath, fontPath, cacheDir)
 * Env:     PI_MERMAID_MMRS / PI_MERMAID_RESVG override binary paths.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Image, Text, hyperlink } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);

const CUSTOM_TYPE = "mermaid-mmrs";
const THEMES = ["default", "dark", "forest", "neutral"] as const;
type MmrsTheme = (typeof THEMES)[number];

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(EXTENSION_DIR, "config.json");
const BUNDLED_FONT = join(EXTENSION_DIR, "Hack-Regular.ttf");

interface MermaidMmrsConfig {
	theme: MmrsTheme;
	/** Raster scale factor for resvg (higher = crisper on hidpi, bigger PNG). */
	zoom: number;
	/** Max image width in terminal cells. Large values auto-fit the width. */
	maxWidthCells: number;
	/** Collapse rendered ```mermaid fences in the assistant message. */
	hideCode: boolean;
	mmrsPath?: string;
	resvgPath?: string;
	fontPath?: string;
	cacheDir?: string;
}

const DEFAULTS: MermaidMmrsConfig = {
	theme: "dark",
	zoom: 2,
	maxWidthCells: 9999, // auto-fit: Image caps at available width - 2 cells
	hideCode: true,
	cacheDir: join(homedir(), ".cache", "pi-mermaid"),
};

interface RenderOk {
	ok: true;
	hash: string;
	source: string;
	svgPath: string;
	pngBase64: string;
	theme: MmrsTheme;
	widthPx: number;
	heightPx: number;
	ms: number;
	cached: boolean;
	diagramType: string;
}

interface RenderErr {
	ok: false;
	hash: string;
	error: string;
	source: string;
	theme: MmrsTheme;
}

type RenderData = RenderOk | RenderErr;

let config: MermaidMmrsConfig = { ...DEFAULTS };
let mmrsBin = "mmrs";
let resvgBin = "resvg";
let fontPath = BUNDLED_FONT;
/** True when binaries + font are usable; gates rendering and code collapsing. */
let ready = false;
/** Render results (success + failure) keyed by source hash. Drives code collapsing. */
const resultsByHash = new Map<string, RenderData>();

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

function loadConfig(): void {
	config = { ...DEFAULTS };
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<MermaidMmrsConfig>;
		if (raw.theme && (THEMES as readonly string[]).includes(raw.theme)) config.theme = raw.theme;
		if (typeof raw.zoom === "number" && raw.zoom >= 1 && raw.zoom <= 8) config.zoom = raw.zoom;
		if (typeof raw.maxWidthCells === "number" && raw.maxWidthCells >= 10 && raw.maxWidthCells <= 9999) {
			config.maxWidthCells = Math.floor(raw.maxWidthCells);
		}
		if (typeof raw.hideCode === "boolean") config.hideCode = raw.hideCode;
		if (typeof raw.mmrsPath === "string" && raw.mmrsPath) config.mmrsPath = raw.mmrsPath;
		if (typeof raw.resvgPath === "string" && raw.resvgPath) config.resvgPath = raw.resvgPath;
		if (typeof raw.fontPath === "string" && raw.fontPath) config.fontPath = raw.fontPath;
		if (typeof raw.cacheDir === "string" && raw.cacheDir.startsWith("/")) config.cacheDir = raw.cacheDir;
	} catch {
		// no config file yet — defaults
	}
}

function saveConfig(): void {
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// binary / font resolution
// ---------------------------------------------------------------------------

function firstExisting(paths: Array<string | undefined>): string | undefined {
	for (const p of paths) {
		if (!p) continue;
		try {
			if (existsSync(p)) return p;
		} catch {
			// ignore
		}
	}
	return undefined;
}

function resolveBinary(kind: "mmrs" | "resvg"): string {
	const override = kind === "mmrs" ? config.mmrsPath : config.resvgPath;
	const envPath = kind === "mmrs" ? process.env.PI_MERMAID_MMRS : process.env.PI_MERMAID_RESVG;
	return (
		firstExisting([override, envPath, join(homedir(), ".cargo", "bin", kind), `/usr/local/bin/${kind}`, `/usr/bin/${kind}`]) ??
		kind // bare name: rely on PATH, errors surface at render time
	);
}

async function which(name: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("which", [name], { timeout: 5000 });
		return stdout.trim().split("\n")[0] || undefined;
	} catch {
		return undefined;
	}
}

async function binaryUsable(path: string): Promise<boolean> {
	if (path.includes("/")) return existsSync(path);
	return (await which(path)) !== undefined;
}

function rebind(): void {
	loadConfig();
	mmrsBin = resolveBinary("mmrs");
	resvgBin = resolveBinary("resvg");
	fontPath = firstExisting([config.fontPath, BUNDLED_FONT]) ?? BUNDLED_FONT;
}

// ---------------------------------------------------------------------------
// mermaid fence extraction
// ---------------------------------------------------------------------------

interface MermaidRange {
	/** Char offset of the opening fence line. */
	start: number;
	/** Char offset just past the closing fence line. */
	end: number;
	source: string;
}

/**
 * Find ```mermaid fenced blocks. Line-based scanner that respects fence
 * length and fence character (backtick/tilde), like CommonMark.
 */
function findMermaidRanges(text: string): MermaidRange[] {
	const ranges: MermaidRange[] = [];
	const lines = text.split("\n");
	let offset = 0;
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const open = /^\s*(`{3,}|~{3,})[ \t]*mermaid(?:[ \t]+[^\n]*)?$/i.exec(line);
		if (!open) {
			offset += line.length + 1;
			i++;
			continue;
		}
		const fence = open[1];
		const closeRe = new RegExp(`^\\s*\\${fence[0]}{${fence.length},}\\s*$`);
		const body: string[] = [];
		let j = i + 1;
		let closed = false;
		while (j < lines.length) {
			if (closeRe.test(lines[j])) {
				closed = true;
				break;
			}
			body.push(lines[j]);
			j++;
		}
		if (!closed) {
			// unterminated fence — skip (streaming tail, malformed)
			offset += line.length + 1;
			i++;
			continue;
		}
		const blockLength = lines.slice(i, j + 1).join("\n").length;
		ranges.push({ start: offset, end: offset + blockLength, source: body.join("\n") });
		offset += blockLength;
		// consume the trailing newline of the closing fence line, if present
		if (text[offset] === "\n") offset += 1;
		i = j + 1;
	}
	return ranges;
}

/**
 * Hash of the rendered artifact. Theme is deliberately NOT part of the hash so
 * that changing the theme re-renders into the same cache files and existing
 * entries pick it up on the next transcript render.
 */
function hashOf(source: string): string {
	return createHash("sha1")
		.update(`${source}\n${config.zoom}`)
		.digest("hex")
		.slice(0, 16);
}

function assistantText(message: { content: unknown }): string {
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
			const text = (block as { text?: unknown }).text;
			if (typeof text === "string") parts.push(text);
		}
	}
	return parts.join("\n");
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function isAbort(err: unknown): boolean {
	return (err as { name?: string } | null)?.name === "AbortError";
}

function firstMeaningfulLine(text: string | undefined): string {
	const line = (text ?? "")
		.split("\n")
		.map((l) => l.trim())
		.find(Boolean);
	return (line ?? "").slice(0, 300);
}

function execErrorMessage(err: unknown, tool: string): string {
	const e = err as { message?: string; stderr?: string; stdout?: string; code?: number | string } | null;
	if (e?.code === "ENOENT") {
		const pkg = tool === "mmrs" ? "mermaid-rs-cli" : "resvg";
		return `${tool} not found — install with: cargo install ${pkg}`;
	}
	const detail = firstMeaningfulLine(e?.stderr) || firstMeaningfulLine(e?.stdout) || e?.message || "unknown error";
	return `${tool}: ${detail}`;
}

async function renderMermaid(
	source: string,
	options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<RenderData> {
	const theme = config.theme;
	const hash = hashOf(source);
	const cacheDir = config.cacheDir ?? DEFAULTS.cacheDir!;
	const svgPath = join(cacheDir, `${hash}.svg`);
	const pngPath = join(cacheDir, `${hash}.png`);
	const metaPath = join(cacheDir, `${hash}.meta.json`);
	const started = Date.now();
	const fail = (error: string): RenderErr => ({ ok: false, hash, error, source, theme });

	try {
		mkdirSync(cacheDir, { recursive: true });
		// Cache is theme-independent by design; the meta sidecar records which
		// theme produced the current files so a stale cache re-renders.
		let cachedTheme: string | undefined;
		try {
			cachedTheme = (JSON.parse(readFileSync(metaPath, "utf8")) as { theme?: string }).theme;
		} catch {
			// no meta — treat as stale
		}
		let cached = existsSync(svgPath) && existsSync(pngPath) && cachedTheme === theme;
		if (!cached || options.force) {
			const mmdPath = join(cacheDir, `${hash}.mmd`);
			writeFileSync(mmdPath, source, "utf8");
			try {
				await execFileAsync(mmrsBin, ["-i", mmdPath, "-o", svgPath, "-t", theme], {
					timeout: 30_000,
					signal: options.signal,
					maxBuffer: 16 * 1024 * 1024,
				});
			} catch (err) {
				if (isAbort(err)) throw err;
				// mmrs exits 0 on some parse errors without writing the SVG;
				// only surface the exec error when no SVG appeared.
				if (!existsSync(svgPath)) throw new Error(execErrorMessage(err, "mmrs"));
			}
			if (!existsSync(svgPath)) {
				throw new Error("mmrs produced no SVG (unsupported diagram type or parse error)");
			}
			try {
				await execFileAsync(
					resvgBin,
					["--zoom", String(config.zoom), "--use-font-file", fontPath, "--quiet", svgPath, pngPath],
					{ timeout: 30_000, signal: options.signal, maxBuffer: 16 * 1024 * 1024 },
				);
			} catch (err) {
				if (isAbort(err)) throw err;
				if (!existsSync(pngPath)) throw new Error(execErrorMessage(err, "resvg"));
			}
			if (!existsSync(pngPath)) throw new Error("resvg produced no PNG");
			writeFileSync(metaPath, JSON.stringify({ theme, zoom: config.zoom }), "utf8");
			cached = false;
		}

		const svgText = readFileSync(svgPath, "utf8");
		const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
		const pngBase64 = readFileSync(pngPath).toString("base64");
		const diagramType = (source.trim().split(/\s+/)[0] ?? "").toLowerCase();
		return {
			ok: true,
			hash,
			source,
			svgPath,
			pngBase64,
			theme,
			widthPx: viewBox ? Math.round(Number(viewBox[1])) : 0,
			heightPx: viewBox ? Math.round(Number(viewBox[2])) : 0,
			ms: Date.now() - started,
			cached,
			diagramType,
		};
	} catch (err) {
		if (isAbort(err)) throw err;
		return fail(err instanceof Error ? err.message : String(err));
	}
}

// ---------------------------------------------------------------------------
// display helpers
// ---------------------------------------------------------------------------

function displayPath(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function captionFor(data: RenderOk): string {
	const dim = data.widthPx && data.heightPx ? `${data.widthPx}×${data.heightPx}` : "?×?";
	const time = data.cached ? "cached" : `${(data.ms / 1000).toFixed(2)}s`;
	const path = displayPath(data.svgPath);
	return `${dim} · ${time} · ${path}`;
}

/** Prefer the on-disk PNG (current theme) over the base64 stored in the entry. */
function pngFor(data: RenderOk): string {
	const pngPath = join(config.cacheDir ?? DEFAULTS.cacheDir!, `${data.hash}.png`);
	try {
		return readFileSync(pngPath).toString("base64");
	} catch {
		return data.pngBase64;
	}
}

// ---------------------------------------------------------------------------
// extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	pi.registerEntryRenderer<RenderData>(CUSTOM_TYPE, (entry, options, theme) => {
		const data = entry.data;
		if (!data) return undefined;

		const box = new Box(1, 0);

		if (data.ok === false) {
			box.addChild(new Text(theme.fg("warning", `⬡ mmrs render failed — ${data.error}`), 0, 0));
			if (options.expanded) {
				box.addChild(new Text(theme.fg("muted", data.source), 0, 0));
			}
			return box;
		}

		const path = displayPath(data.svgPath);
		const caption =
			theme.fg("accent", `⬡ mmrs · ${config.theme}${data.diagramType ? ` · ${data.diagramType}` : ""}`) +
			theme.fg("muted", `  ${captionFor(data)}`);
		box.addChild(new Text(caption, 0, 0));
		const pngBase64 = pngFor(data);
		if (pngBase64) {
			box.addChild(
				new Image(
					pngBase64,
					"image/png",
					{ fallbackColor: (s) => theme.fg("toolOutput", s) },
					{ maxWidthCells: config.maxWidthCells, filename: path },
				),
			);
		}
		if (options.expanded) {
			box.addChild(new Text(theme.fg("muted", data.source), 0, 0));
		}
		return box;
	});

	/**
	 * Collapse ```mermaid fences that have a render result (image entry shows
	 * below the message instead). Only applies to finalized assistant markdown,
	 * and only when this instance produced a result for that exact source —
	 * unknown sources (old sessions, failed binary lookup) keep their code.
	 */
	pi.registerMarkdownTransformer((markdown, context) => {
		if (!ready || !config.hideCode) return markdown;
		if (context.isStreaming || context.messageType !== "assistant") return markdown;
		if (!markdown.includes("mermaid")) return markdown;
		const ranges = findMermaidRanges(markdown);
		if (ranges.length === 0) return markdown;

		let out = "";
		let cursor = 0;
		let replaced = 0;
		for (const range of ranges) {
			if (!range.source.trim()) continue;
			if (!resultsByHash.has(hashOf(range.source))) continue;
			out += markdown.slice(cursor, range.start);
			out += `\`⬡ rendered with mmrs · ${config.theme}\``;
			cursor = range.end;
			replaced++;
		}
		if (replaced === 0) return markdown;
		out += markdown.slice(cursor);
		return out;
	});

	pi.on("session_start", async (event, ctx) => {
		rebind();
		resultsByHash.clear();
		// Prefill results from existing session entries so resumed/forked
		// sessions keep their fences collapsed (image entries already exist).
		try {
			for (const entry of ctx.sessionManager.getEntries()) {
				const e = entry as { type?: string; customType?: string; data?: RenderData };
				if (e?.type === "custom" && e.customType === CUSTOM_TYPE && e.data && typeof e.data.hash === "string") {
					resultsByHash.set(e.data.hash, e.data);
				}
			}
		} catch {
			// ignore
		}

		{
			const [mmrsOk, resvgOk] = await Promise.all([binaryUsable(mmrsBin), binaryUsable(resvgBin)]);
			ready = mmrsOk && resvgOk && existsSync(fontPath);
			if (!ready && (event.reason === "startup" || event.reason === "reload")) {
				const missing = [
					!mmrsOk && "mmrs",
					!resvgOk && "resvg",
					!existsSync(fontPath) && "Hack font",
				].filter(Boolean);
				ctx.ui.notify(
					`mermaid-mmrs disabled — missing: ${missing.join(", ")}. Install with: cargo install mermaid-rs-cli resvg`,
					"warning",
				);
			}
		}

		// Backfill: render mermaid blocks in already-persisted assistant messages
		// (created before the extension loaded, or in resumed sessions) that have
		// no render entry yet. Entries append at the end of the branch.
		if (ready) {
			try {
				for (const entry of ctx.sessionManager.getBranch()) {
					const e = entry as { type?: string; message?: { role?: string; stopReason?: string; content?: unknown } };
					if (e?.type !== "message" || e.message?.role !== "assistant") continue;
					if (e.message.stopReason === "error" || e.message.stopReason === "aborted") continue;
					const text = assistantText(e.message);
					if (!text.includes("mermaid")) continue;
					for (const range of findMermaidRanges(text)) {
						const source = range.source;
						if (!source.trim()) continue;
						if (resultsByHash.has(hashOf(source))) continue; // already rendered
						try {
							const data = await renderMermaid(source);
							resultsByHash.set(data.hash, data);
							pi.appendEntry(CUSTOM_TYPE, data);
						} catch (err) {
							if (isAbort(err)) break;
						}
					}
				}
			} catch {
				// ignore
			}
		}
	});

	pi.on("message_end", async (event, ctx) => {
		const message = event.message as { role?: string; stopReason?: string; content?: unknown } | undefined;
		if (!message || message.role !== "assistant") return;
		if (message.stopReason === "error" || message.stopReason === "aborted") return;
		if (!ready) return;

		const text = assistantText(message);
		if (!text.includes("mermaid")) return;
		const ranges = findMermaidRanges(text);
		if (ranges.length === 0) return;

		for (const range of ranges) {
			const source = range.source;
			if (!source.trim()) continue;
			try {
				const data = await renderMermaid(source, { signal: ctx.signal });
				resultsByHash.set(data.hash, data);
				// message_end fires BEFORE the assistant message is persisted;
				// defer the entry append so it lands after the message.
				setTimeout(() => {
					try {
						pi.appendEntry(CUSTOM_TYPE, data);
					} catch {
						// session replaced/reloaded between render and append — drop
					}
				}, 0);
			} catch (err) {
				if (isAbort(err)) return;
				const data: RenderErr = {
					ok: false,
					hash: hashOf(source),
					error: err instanceof Error ? err.message : String(err),
					source,
					theme: config.theme,
				};
				resultsByHash.set(data.hash, data);
				setTimeout(() => {
					try {
						pi.appendEntry(CUSTOM_TYPE, data);
					} catch {
						// ignore
					}
				}, 0);
			}
		}
	});

	pi.registerCommand("mermaid-theme", {
		description: "Set the mmrs theme for mermaid rendering (default | dark | forest | neutral)",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (!arg) {
				ctx.ui.notify(`mermaid-mmrs theme: ${config.theme} (options: ${THEMES.join(", ")})`, "info");
				return;
			}
			if (!(THEMES as readonly string[]).includes(arg)) {
				ctx.ui.notify(`Unknown theme "${arg}" — options: ${THEMES.join(", ")}`, "error");
				return;
			}
			config.theme = arg as MmrsTheme;
			try {
				saveConfig();
			} catch (err) {
				ctx.ui.notify(`Theme set for this session, but config.json could not be written: ${err}`, "warning");
			}

			// Force re-render all known diagrams so the theme-independent cache
			// files reflect the new theme, then reload so the transcript repaints.
			const sources = new Set<string>();
			try {
				for (const entry of ctx.sessionManager.getBranch()) {
					const e = entry as { type?: string; customType?: string; data?: RenderData };
					if (e?.type === "custom" && e.customType === CUSTOM_TYPE && e.data?.ok === true && e.data.source) {
						sources.add(e.data.source);
					}
				}
			} catch {
				// ignore
			}
			let rendered = 0;
			for (const source of sources) {
				try {
					await renderMermaid(source, { force: true });
					rendered++;
				} catch {
					// keep going; entries fall back to their stored png
				}
			}
			ctx.ui.notify(
				`mermaid-mmrs theme → ${arg} · re-rendered ${rendered} diagram${rendered === 1 ? "" : "s"} · reloading…`,
				"info",
			);
			await ctx.reload();
			return;
		},
	});
}
