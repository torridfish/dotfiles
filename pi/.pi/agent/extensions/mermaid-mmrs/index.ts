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
 * Inside tmux (kitty/ghostty/wezterm outer terminal + `allow-passthrough on`),
 * pi-tui disables its native Image component, so diagrams are displayed with
 * the kitty graphics protocol's Unicode placeholders instead: the PNG is
 * uploaded once (a=t) wrapped in tmux DCS passthrough, a virtual placement
 * (a=p,U=1) defines the render rectangle, and U+10EEEE placeholder cells make
 * the image grid-resident text — tmux scrolls, splits and clips it correctly.
 * Vendored from safurrier/pi-tmux-images (MIT).
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

import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	allocateImageId,
	Box,
	getCapabilities,
	getCellDimensions,
	Image,
	Text,
	hyperlink,
	type Component,
} from "@earendil-works/pi-tui";

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
	/** Center diagrams horizontally in the transcript. */
	center: boolean;
	/** Display size multiplier relative to natural/fit size (0.2–3, 1 = natural). */
	scale: number;
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
	center: true,
	scale: 1,
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
		if (typeof raw.center === "boolean") config.center = raw.center;
		if (typeof raw.scale === "number" && raw.scale >= 0.2 && raw.scale <= 3) {
			config.scale = raw.scale;
		}
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

function assistantText(message: { content?: unknown }): string {
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
// kitty graphics over tmux (Unicode placeholders)
//
// Vendored from safurrier/pi-tmux-images (MIT). See:
// https://github.com/safurrier/pi-tmux-images
//
// How it works: the PNG is uploaded once with the transmit-only action (a=t),
// a virtual placement (a=p,U=1) defines the render rectangle, and U+10EEEE
// placeholder cells — image id in the foreground colour, row/column/`high-byte`
// in combining diacritics — make the image grid-resident text. tmux scrolls,
// splits and clips the cells correctly without knowing anything about the
// graphics protocol. Kitty sequences are wrapped in tmux DCS passthrough
// (`\ePtmux;...\e\\`, ESC doubled) which requires `allow-passthrough on`.
// ---------------------------------------------------------------------------

const KITTY_ESC = "\x1b";
const KITTY_PLACEHOLDER_GLYPH = "\u{10eeee}";
const ROW_COLUMN_DIACRITICS = [
	"\u{305}", "\u{30D}", "\u{30E}", "\u{310}", "\u{312}", "\u{33D}",
	"\u{33E}", "\u{33F}", "\u{346}", "\u{34A}", "\u{34B}", "\u{34C}",
	"\u{350}", "\u{351}", "\u{352}", "\u{357}", "\u{35B}", "\u{363}",
	"\u{364}", "\u{365}", "\u{366}", "\u{367}", "\u{368}", "\u{369}",
	"\u{36A}", "\u{36B}", "\u{36C}", "\u{36D}", "\u{36E}", "\u{36F}",
	"\u{483}", "\u{484}", "\u{485}", "\u{486}", "\u{487}", "\u{592}",
	"\u{593}", "\u{594}", "\u{595}", "\u{597}", "\u{598}", "\u{599}",
	"\u{59C}", "\u{59D}", "\u{59E}", "\u{59F}", "\u{5A0}", "\u{5A1}",
	"\u{5A8}", "\u{5A9}", "\u{5AB}", "\u{5AC}", "\u{5AF}", "\u{5C4}",
	"\u{610}", "\u{611}", "\u{612}", "\u{613}", "\u{614}", "\u{615}",
	"\u{616}", "\u{617}", "\u{657}", "\u{658}", "\u{659}", "\u{65A}",
	"\u{65B}", "\u{65D}", "\u{65E}", "\u{6D6}", "\u{6D7}", "\u{6D8}",
	"\u{6D9}", "\u{6DA}", "\u{6DB}", "\u{6DC}", "\u{6DF}", "\u{6E0}",
	"\u{6E1}", "\u{6E2}", "\u{6E4}", "\u{6E7}", "\u{6E8}", "\u{6EB}",
	"\u{6EC}", "\u{730}", "\u{732}", "\u{733}", "\u{735}", "\u{736}",
	"\u{73A}", "\u{73D}", "\u{73F}", "\u{740}", "\u{741}", "\u{743}",
	"\u{745}", "\u{747}", "\u{749}", "\u{74A}", "\u{7EB}", "\u{7EC}",
	"\u{7ED}", "\u{7EE}", "\u{7EF}", "\u{7F0}", "\u{7F1}", "\u{7F3}",
	"\u{816}", "\u{817}", "\u{818}", "\u{819}", "\u{81B}", "\u{81C}",
	"\u{81D}", "\u{81E}", "\u{81F}", "\u{820}", "\u{821}", "\u{822}",
	"\u{823}", "\u{825}", "\u{826}", "\u{827}", "\u{829}", "\u{82A}",
	"\u{82B}", "\u{82C}", "\u{82D}", "\u{951}", "\u{953}", "\u{954}",
	"\u{F82}", "\u{F83}", "\u{F86}", "\u{F87}", "\u{135D}", "\u{135E}",
	"\u{135F}", "\u{17DD}", "\u{193A}", "\u{1A17}", "\u{1A75}", "\u{1A76}",
	"\u{1A77}", "\u{1A78}", "\u{1A79}", "\u{1A7A}", "\u{1A7B}", "\u{1A7C}",
	"\u{1B6B}", "\u{1B6D}", "\u{1B6E}", "\u{1B6F}", "\u{1B70}", "\u{1B71}",
	"\u{1B72}", "\u{1B73}", "\u{1CD0}", "\u{1CD1}", "\u{1CD2}", "\u{1CDA}",
	"\u{1CDB}", "\u{1CE0}", "\u{1DC0}", "\u{1DC1}", "\u{1DC3}", "\u{1DC4}",
	"\u{1DC5}", "\u{1DC6}", "\u{1DC7}", "\u{1DC8}", "\u{1DC9}", "\u{1DCB}",
	"\u{1DCC}", "\u{1DD1}", "\u{1DD2}", "\u{1DD3}", "\u{1DD4}", "\u{1DD5}",
	"\u{1DD6}", "\u{1DD7}", "\u{1DD8}", "\u{1DD9}", "\u{1DDA}", "\u{1DDB}",
	"\u{1DDC}", "\u{1DDD}", "\u{1DDE}", "\u{1DDF}", "\u{1DE0}", "\u{1DE1}",
	"\u{1DE2}", "\u{1DE3}", "\u{1DE4}", "\u{1DE5}", "\u{1DE6}", "\u{1DFE}",
	"\u{20D0}", "\u{20D1}", "\u{20D4}", "\u{20D5}", "\u{20D6}", "\u{20D7}",
	"\u{20DB}", "\u{20DC}", "\u{20E1}", "\u{20E7}", "\u{20E9}", "\u{20F0}",
	"\u{2CEF}", "\u{2CF0}", "\u{2CF1}", "\u{2DE0}", "\u{2DE1}", "\u{2DE2}",
	"\u{2DE3}", "\u{2DE4}", "\u{2DE5}", "\u{2DE6}", "\u{2DE7}", "\u{2DE8}",
	"\u{2DE9}", "\u{2DEA}", "\u{2DEB}", "\u{2DEC}", "\u{2DED}", "\u{2DEE}",
	"\u{2DEF}", "\u{2DF0}", "\u{2DF1}", "\u{2DF2}", "\u{2DF3}", "\u{2DF4}",
	"\u{2DF5}", "\u{2DF6}", "\u{2DF7}", "\u{2DF8}", "\u{2DF9}", "\u{2DFA}",
	"\u{2DFB}", "\u{2DFC}", "\u{2DFD}", "\u{2DFE}", "\u{2DFF}", "\u{A66F}",
	"\u{A67C}", "\u{A67D}", "\u{A6F0}", "\u{A6F1}", "\u{A8E0}", "\u{A8E1}",
	"\u{A8E2}", "\u{A8E3}", "\u{A8E4}", "\u{A8E5}",
] as const;

/** Wrap a sequence in tmux DCS passthrough (ESC doubled inside). */
function tmuxWrap(sequence: string): string {
	return `${KITTY_ESC}Ptmux;${sequence.replaceAll(KITTY_ESC, KITTY_ESC + KITTY_ESC)}${KITTY_ESC}\\`;
}

/** A kitty graphics APC command, passthrough-wrapped when inside tmux. */
function kittyApc(command: string, inTmux: boolean): string {
	const sequence = `${KITTY_ESC}_G${command}${KITTY_ESC}\\`;
	return inTmux ? tmuxWrap(sequence) : sequence;
}

/** Transmit-only upload (a=t) of base64 PNG data in 4096-byte chunks. */
function kittyUploadChunks(base64: string, imageId: number, inTmux: boolean): string[] {
	const chunks = base64.match(/.{1,4096}/gu) ?? [""];
	return chunks.map((chunk, index) =>
		kittyApc(
			`${index ? "" : `a=t,f=100,i=${imageId},q=2,`}m=${index + 1 < chunks.length ? 1 : 0};${chunk}`,
			inTmux,
		),
	);
}

function placementIdFor(imageId: number): number {
	return imageId & 0xffffff || 1;
}

/** Create a virtual placement (U=1) that defines the render rectangle. */
function kittyPlacement(imageId: number, columns: number, rows: number, inTmux: boolean): string {
	return kittyApc(`a=p,i=${imageId},p=${placementIdFor(imageId)},U=1,c=${columns},r=${rows},q=2;`, inTmux);
}

/** Delete one virtual placement while retaining its uploaded image data. */
function kittyDeletePlacement(imageId: number, inTmux: boolean): string {
	return kittyApc(`a=d,d=i,i=${imageId},p=${placementIdFor(imageId)},q=2;`, inTmux);
}

/** Delete an uploaded image and free its data. */
function kittyDeleteImage(imageId: number, inTmux: boolean): string {
	return kittyApc(`a=d,d=I,i=${imageId},q=2;`, inTmux);
}

function diacriticMark(index: number): string {
	const value = ROW_COLUMN_DIACRITICS[index];
	if (!value) throw new Error(`Kitty placeholder index ${index} exceeds supported diacritic table`);
	return value;
}

function sgrTrueColor(code: 38 | 58, value: number): string {
	return `${KITTY_ESC}[${code};2;${(value >>> 16) & 255};${(value >>> 8) & 255};${value & 255}m`;
}

/** Kitty Unicode placeholder: foreground is image ID, underline is placement ID. */
function placeholderCell(column: number, row: number, imageId: number): string {
	const high = imageId >>> 24;
	return (
		`${sgrTrueColor(38, imageId & 0xffffff)}` +
		`${sgrTrueColor(58, imageId & 0xffffff || 1)}` +
		KITTY_PLACEHOLDER_GLYPH +
		diacriticMark(row) +
		diacriticMark(column) +
		(high ? diacriticMark(high) : "") +
		`${KITTY_ESC}[39;59m`
	);
}

/** The grid of placeholder cells that kitty composites the image over. */
function placeholderGrid(columns: number, rows: number, imageId: number): string[] {
	return Array.from({ length: rows }, (_, row) =>
		Array.from({ length: columns }, (_, column) => placeholderCell(column, row, imageId)).join(""),
	);
}

// --- centering ---------------------------------------------------------------

/** 在每個含圖的行（kitty APC / iTerm2 OSC / placeholder 字元）前加上置中用的空白。 */
function centerImageLines(lines: string[], width: number, columns: number): string[] {
	const pad = Math.max(0, Math.floor((width - columns) / 2));
	if (pad === 0) return lines;
	const padStr = " ".repeat(pad);
	return lines.map((line) =>
		line.includes("\x1b_G") || line.includes("\x1b]1337;") || line.includes("\u10EEEE") ? padStr + line : line,
	);
}

// --- capability detection ---------------------------------------------------

type DisplayMode = "kitty-placeholder" | "image" | "text";

function isTmuxEnv(): boolean {
	return Boolean(process.env.TMUX || process.env.TERM?.toLowerCase().startsWith("tmux"));
}

function outerKittyCapable(): boolean {
	const program = process.env.TERM_PROGRAM?.toLowerCase();
	const emulator = process.env.TERMINAL_EMULATOR?.toLowerCase();
	return Boolean(
		process.env.KITTY_WINDOW_ID ||
			process.env.GHOSTTY_RESOURCES_DIR ||
			process.env.WEZTERM_PANE ||
			program === "kitty" ||
			program === "ghostty" ||
			program === "wezterm" ||
			emulator === "ghostty" ||
			emulator === "wezterm",
	);
}

/** Fail closed: only an explicit tmux `allow-passthrough on` enables DCS wrapping. */
function tmuxPassthroughEnabled(): boolean {
	try {
		const result = spawnSync("tmux", ["show-options", "-gv", "allow-passthrough"], {
			encoding: "utf8",
			timeout: 1_000,
		});
		return result.status === 0 && /^(on|yes|true|1)$/i.test(result.stdout.trim());
	} catch {
		return false;
	}
}

function detectDisplayMode(): DisplayMode {
	if (isTmuxEnv()) {
		return outerKittyCapable() && tmuxPassthroughEnabled() ? "kitty-placeholder" : "text";
	}
	return getCapabilities().images ? "image" : "text";
}

// --- PNG bytes / intrinsic size ----------------------------------------------

function pngBufferFor(data: RenderOk): Buffer | undefined {
	const pngPath = join(config.cacheDir ?? DEFAULTS.cacheDir!, `${data.hash}.png`);
	try {
		return readFileSync(pngPath);
	} catch {
		try {
			const buf = Buffer.from(data.pngBase64, "base64");
			return buf.length > 0 ? buf : undefined;
		} catch {
			return undefined;
		}
	}
}

function pngDimensions(buf: Buffer): { width: number; height: number } | undefined {
	if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return undefined;
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- placeholder runtime state -----------------------------------------------

/** Render geometry limits for placeholder images (terminal cells). */
const MAX_PLACEHOLDER_ROWS = 50;

/** hash → kitty image id (stable per diagram). */
const terminalIds = new Map<string, number>();
/** id → base64 currently uploaded (dedupe across redraws). */
const uploadedPngs = new Map<number, string>();
/** id → "cols:rows" (resize handling: a=p does not replace an existing placement). */
const placementGeom = new Map<number, string>();

function terminalIdFor(hash: string): number {
	let id = terminalIds.get(hash);
	if (id) return id;
	const taken = new Set(terminalIds.values());
	do {
		id = allocateImageId() >>> 0;
	} while (!id || taken.has(id));
	terminalIds.set(hash, id);
	return id;
}

/** Upload (once) + place the PNG, returning placeholder grid lines for the TUI. */
function emitPlaceholder(data: RenderOk, availableWidth: number): string[] {
	const png = pngBufferFor(data);
	if (!png) return [];
	const intrinsic = pngDimensions(png);
	const widthPx = data.widthPx || intrinsic?.width || 0;
	const heightPx = data.heightPx || intrinsic?.height || 0;
	if (!widthPx || !heightPx) return [];

	const id = terminalIdFor(data.hash);
	const base64 = png.toString("base64");
	const inTmux = isTmuxEnv();
	if (uploadedPngs.get(id) !== base64) {
		for (const sequence of kittyUploadChunks(base64, id, inTmux)) process.stdout.write(sequence);
		uploadedPngs.set(id, base64);
	}

	// Fit the diagram into the available width, aspect preserved, rows capped.
	// config.scale 再乘上顯示倍率（可 >1 放大，但寬不超過可用寬度）。
	const cell = getCellDimensions();
	const maxColumns = Math.max(8, Math.min(config.maxWidthCells, Math.max(8, availableWidth)));
	const fit = Math.min(
		(maxColumns * cell.widthPx) / widthPx,
		(MAX_PLACEHOLDER_ROWS * cell.heightPx) / heightPx,
		1,
	);
	const displayScale = fit * config.scale;
	const columns = Math.max(1, Math.min(maxColumns, Math.ceil((widthPx * displayScale) / cell.widthPx)));
	const rows = Math.max(1, Math.ceil((heightPx * displayScale) / cell.heightPx));

	const geometry = `${columns}:${rows}`;
	if (placementGeom.get(id) !== geometry) {
		if (placementGeom.has(id)) process.stdout.write(kittyDeletePlacement(id, inTmux));
		process.stdout.write(kittyPlacement(id, columns, rows, inTmux));
		placementGeom.set(id, geometry);
	}
	const grid = placeholderGrid(columns, rows, id);
	return config.center ? centerImageLines(grid, availableWidth, columns) : grid;
}

/** Delete all uploaded kitty images and reset placeholder runtime state. */
function clearKittyImages(): void {
	const inTmux = isTmuxEnv();
	for (const id of new Set([...terminalIds.values(), ...uploadedPngs.keys()])) {
		try {
			process.stdout.write(kittyDeleteImage(id, inTmux));
		} catch {
			// ignore
		}
	}
	terminalIds.clear();
	uploadedPngs.clear();
	placementGeom.clear();
}

// ---------------------------------------------------------------------------
// extension
// ---------------------------------------------------------------------------

/** How diagrams are displayed: kitty placeholders inside tmux, pi-tui Image
 * outside tmux (when the terminal supports images), caption-only otherwise. */
let displayMode: DisplayMode = "text";

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
		if (displayMode === "kitty-placeholder") {
			// tmux + kitty-capable outer terminal + allow-passthrough on: render
			// via kitty Unicode placeholders (grid-resident, tmux-safe).
			const placeholder: Component = {
				render: (width: number) => emitPlaceholder(data, width),
				invalidate: () => {},
			};
			box.addChild(placeholder);
		} else {
			const pngBase64 = pngFor(data);
			if (pngBase64 && displayMode === "image") {
				// pi-tui Image scales the image up/down to fill maxWidthCells, so a
				// large cap (e.g. 9999 = auto-fit) stretches every diagram to the
				// full transcript width. Cap at the diagram's natural SVG width so
				// it renders at original size, still bounded by the config cap.
				// config.scale 再乘上顯示倍率（Image 會填滿 maxWidthCells，縮小它即可縮放）。
				const cell = getCellDimensions();
				const naturalColumns = data.widthPx
					? Math.max(10, Math.ceil(data.widthPx / cell.widthPx))
					: config.maxWidthCells;
				const baseColumns = Math.min(config.maxWidthCells, naturalColumns);
				const displayColumns = Math.max(10, Math.floor(baseColumns * config.scale));
				const image = new Image(
					pngBase64,
					"image/png",
					{ fallbackColor: (s) => theme.fg("toolOutput", s) },
					{
						maxWidthCells: displayColumns,
						filename: path,
					},
				);
				if (config.center) {
					// Image 實際渲染寬 = min(maxWidthCells, width - 2)，據此置中
					box.addChild({
						render: (width: number) =>
							centerImageLines(
								image.render(width),
								width,
								Math.min(displayColumns, Math.max(1, width - 2)),
							),
						invalidate: () => image.invalidate(),
					});
				} else {
					box.addChild(image);
				}
			}
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
		displayMode = detectDisplayMode();
		// Re-render after a reload/session switch: drop images uploaded for the
		// previous session so entry renderers re-upload cleanly.
		clearKittyImages();
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

	pi.on("session_shutdown", async () => {
		// Free the uploaded kitty images before the extension is reloaded or the
		// session is replaced; renderers re-upload after the next session_start.
		clearKittyImages();
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
