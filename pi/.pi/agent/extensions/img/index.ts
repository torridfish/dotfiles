/**
 * img — 快速瀏覽 pi 顯示過的圖片（放大檢視 + session 內圖片切換）
 *
 * 用法：
 * - Alt+Z 或 /img：進入檢視，←/→ 在 session 收集到的圖片間循環，Esc 離開
 *
 * fullscreen TUI 模式（inline zoom）：
 * - 不用 overlay，而是把 transcript 中該圖所屬的訊息元件「原位置替換」成
 *   放大版的圖（置中、幾乎佔滿整個 viewport 高度），上下文字自然被擠開
 * - 並用 ScrollView.scrollTo() 把 transcript 捲到那個位置
 * - ←/→ 切換時會跳到下一張圖在對話中的原始位置
 * - Esc 還原：換回原元件、回到原本的捲動位置
 *
 * regular TUI 模式：
 * - transcript 直接渲染進 terminal scrollback，沒有可程式化的捲動；
 *   且 diff renderer 對 viewport 之上的變更會觸發破壞性的 full redraw
 *   （清空 scrollback）。因此只對「目前在畫面內」（transcript 尾端）的圖
 *   做 inline zoom；圖不在畫面內時退回 overlay 模式
 *
 * 背景圖片隱藏（兩種模式共用）：
 * 1. 直接送 `a=d,d=y,y=<row>` 逐 row 刪除可視畫面上的 placements
 *    （只刪 placement、保留圖片資料，scrollback 裡的圖不受影響）
 * 2. 暫時把 pi-tui 的 images capability 設為 null 並 invalidate 所有元件，
 *    讓 transcript 的 Image component 改 render 成文字 fallback，
 *    之後 diff 重寫那些行時不會再把舊圖貼回來
 * 3. 離開時：刪除放大的圖、還原 capability、invalidate + requestRender，
 *    transcript 的圖會重新畫回來
 *
 * 放大圖本身用 encodeKitty 直接編碼（繞過 capability 檢查），
 * 整個檢視 session 共用同一個 kitty image id，循環切換時同 id 重傳會自動替換。
 *
 * 圖片來源：
 * - before_agent_start（prompt 附圖）、tool_result（read 讀圖、MCP 回圖）
 * - session_start 回填：branch 中的 toolResult / user message image blocks，
 *   以及 mermaid-mmrs 的 custom entry（data.pngBase64）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	Image as TuiImage,
	Key,
	allocateImageId,
	deleteKittyImage,
	encodeKitty,
	getCapabilities,
	getCellDimensions,
	getImageDimensions,
	matchesKey,
	setCapabilities,
	type TerminalCapabilities,
} from "@earendil-works/pi-tui";

// ── 圖片收集 ──

interface CapturedImage {
	data: string; // base64
	mimeType: string;
	widthPx?: number;
	heightPx?: number;
}

const MAX_SESSION_IMAGES = 30;
const MAX_SESSION_BYTES = 300_000_000;

let sessionImages: CapturedImage[] = [];
const seenKeys = new Set<string>();

function captureImage(data: string, mimeType: string): void {
	if (!data || !mimeType) return;
	// 去重：同一張圖（同 mime + 長度 + 開頭雜湊）只收一次
	const key = `${mimeType}:${data.length}:${data.slice(0, 4096)}`;
	if (seenKeys.has(key)) return;
	seenKeys.add(key);

	const dims = getImageDimensions(data, mimeType) ?? undefined;
	sessionImages.push({
		data,
		mimeType,
		widthPx: dims?.widthPx,
		heightPx: dims?.heightPx,
	});

	// 限制記憶體用量
	if (sessionImages.length > MAX_SESSION_IMAGES) {
		sessionImages.splice(0, sessionImages.length - MAX_SESSION_IMAGES);
	}
	let bytes = sessionImages.reduce((sum, i) => sum + i.data.length, 0);
	while (sessionImages.length > 1 && bytes > MAX_SESSION_BYTES) {
		const dropped = sessionImages.shift();
		bytes -= dropped?.data.length ?? 0;
	}
}

function resetImages(): void {
	sessionImages = [];
	seenKeys.clear();
}

/**
 * 從 session 歷史回填圖片（extension 載入/reload 前就顯示過的圖也能 zoom）。
 * 掃描目前 branch 的：
 * - toolResult 與 user message 中的 image blocks
 * - mermaid-mmrs 的 custom entry（data.pngBase64，mermaid 渲染結果）
 */
function backfillFromSession(ctx: ExtensionContext): void {
	for (const entry of ctx.sessionManager.getBranch()) {
		const custom = entry as {
			type?: string;
			customType?: string;
			data?: { pngBase64?: string };
		};
		if (custom.type === "custom" && custom.customType === "mermaid-mmrs" && custom.data?.pngBase64) {
			captureImage(custom.data.pngBase64, "image/png");
			continue;
		}
		if (entry.type !== "message") continue;
		const msg = entry.message as {
			role?: string;
			content?: unknown;
		};
		if (msg.role === "toolResult" && Array.isArray(msg.content)) {
			for (const block of msg.content as Array<{ type?: string; data?: string; mimeType?: string }>) {
				if (block.type === "image" && block.data) {
					captureImage(block.data, block.mimeType ?? "image/png");
				}
			}
		} else if (msg.role === "user" && Array.isArray(msg.content)) {
			for (const block of msg.content as Array<{ type?: string; data?: string; mimeType?: string }>) {
				if (block.type === "image" && block.data) {
					captureImage(block.data, block.mimeType ?? "image/png");
				}
			}
		}
	}
}

// ── 背景圖片隱藏 / 還原 ──

interface TuiLike {
	requestRender(force?: boolean): void;
	renderNow?(force?: boolean): void;
	invalidate?(): void;
	mode?: string;
	terminal?: { rows: number; columns: number };
	children?: unknown[];
	layoutRoot?: unknown;
}

let savedCaps: TerminalCapabilities | null = null;
let zoomImageId: number | null = null;

// 放大比例（相對於「填滿可用寬高」的大小），檢視中可用 +/- 調整；
// 預設值可由 ~/.pi/agent/settings.json 的 imageDisplay.zoomScale 覆蓋
const ZOOM_SCALE_MIN = 0.4;
const ZOOM_SCALE_MAX = 1;
let zoomScale = 0.8;

function readZoomScaleDefault(): void {
	try {
		const raw = JSON.parse(
			readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8"),
		) as { imageDisplay?: { zoomScale?: number } };
		const v = raw.imageDisplay?.zoomScale;
		if (typeof v === "number" && v >= ZOOM_SCALE_MIN && v <= ZOOM_SCALE_MAX) zoomScale = v;
	} catch {
		// 沒有設定檔就用預設 0.8
	}
}

function adjustZoomScale(delta: number): void {
	zoomScale = Math.min(ZOOM_SCALE_MAX, Math.max(ZOOM_SCALE_MIN, Math.round((zoomScale + delta) * 10) / 10));
}

// ── transcript 圖片顯示強化（imageDisplay.center / scale）──
// 直接 patch pi-tui Image.prototype：pi 內建顯示的所有圖（tool result 圖、
// prompt 附圖）都會套用置中與縮放，且 pi 內部重建元件時也自動生效。
// mermaid-mmrs 自己管理顯示，會在它的 Image 上標 __imgNoEnhance 排除。

interface DisplayPrefs {
	center: boolean;
	scale: number;
}

const AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");
let displayPrefs: DisplayPrefs = { center: true, scale: 1 };
let displayPrefsMtime = -1;

function readDisplayPrefs(): DisplayPrefs {
	try {
		const mtime = statSync(AGENT_SETTINGS).mtimeMs;
		if (mtime === displayPrefsMtime) return displayPrefs;
		displayPrefsMtime = mtime;
		const raw = JSON.parse(readFileSync(AGENT_SETTINGS, "utf8")) as {
			imageDisplay?: { center?: boolean; scale?: number };
		};
		const d = raw.imageDisplay ?? {};
		displayPrefs = {
			center: typeof d.center === "boolean" ? d.center : true,
			scale: typeof d.scale === "number" && d.scale >= 0.2 && d.scale <= 3 ? d.scale : 1,
		};
	} catch {
		displayPrefs = { center: true, scale: 1 };
		displayPrefsMtime = -1;
	}
	return displayPrefs;
}

let imageProtoPatched = false;

function patchImagePrototype(): void {
	if (imageProtoPatched) return;
	imageProtoPatched = true;
	const proto = TuiImage.prototype as unknown as {
		render: (width: number) => string[];
	};
	const origRender = proto.render;
	proto.render = function (this: any, width: number): string[] {
		const prefs = readDisplayPrefs();
		if (this.__imgNoEnhance) return origRender.call(this, width);
		// 縮放：以第一次看到的 maxWidthCells 為基準（避免重複乘）
		if (typeof this.options?.maxWidthCells === "number") {
			if (this.__imgBaseWidth === undefined) this.__imgBaseWidth = this.options.maxWidthCells;
			if (this.__appliedScale !== prefs.scale) {
				this.options.maxWidthCells = Math.max(10, Math.floor(this.__imgBaseWidth * prefs.scale));
				this.__appliedScale = prefs.scale;
				// Image 的私有 cache，運行時可直接清掉強制重算
				this.cachedLines = undefined;
				this.cachedWidth = undefined;
			}
		}
		const lines = origRender.call(this, width);
		if (!prefs.center) return lines;
		// Image 實際渲染寬 = min(maxWidthCells, width - 2)，據此置中
		const cols =
			typeof this.options?.maxWidthCells === "number"
				? Math.min(this.options.maxWidthCells, Math.max(1, width - 2))
				: 0;
		const pad = cols > 0 ? Math.floor((width - cols) / 2) : 0;
		if (pad <= 0) return lines;
		const padStr = " ".repeat(pad);
		return lines.map((l) => (l.includes("\x1b_G") || l.includes("\x1b]1337;") ? padStr + l : l));
	};
}

/** 進入檢視：隱藏可視畫面上所有 kitty 圖片 */
function beginSuppress(tui: TuiLike, caps: TerminalCapabilities): void {
	if (savedCaps) return; // 已在 suppress 狀態
	savedCaps = caps;
	zoomImageId = allocateImageId();

	// 1. 逐 row 刪除可視畫面上的 placements（保留資料，不影響 scrollback）
	const rows = Math.max(1, tui.terminal?.rows ?? 24);
	let buf = "";
	for (let y = 0; y < rows; y++) {
		buf += `\x1b_Ga=d,d=y,y=${y},q=2\x1b\\`;
	}
	process.stdout.write(buf);

	// 2. 暫時停用圖片 capability，讓 transcript 元件改 render 文字 fallback
	setCapabilities({ ...caps, images: null });
	tui.invalidate?.();
}

/** 離開檢視：刪除放大圖、還原 transcript 圖片 */
function endSuppress(tui: TuiLike | null): void {
	if (!savedCaps) return;
	const caps = savedCaps;
	savedCaps = null;

	if (zoomImageId != null) {
		process.stdout.write(deleteKittyImage(zoomImageId));
		zoomImageId = null;
	}
	setCapabilities(caps);
	if (tui) {
		tui.invalidate?.();
		tui.requestRender();
	}
}

// ── transcript 定位（inline zoom 用）──

interface ScrollViewLike {
	scrollTop: number;
	isFollowingEnd: boolean;
	scrollTo(top: number, options?: { disableFollow?: boolean }): void;
	scrollToEnd(): void;
}

/**
 * 在物件圖裡找 ScrollView（鴨子型別：scrollTo + scrollTop + scrollToEnd）。
 * fullscreen 模式下 ScrollView 在 tui.layoutRoot 底下。
 */
function findScrollView(root: unknown, seen: Set<object> = new Set(), depth = 0): ScrollViewLike | null {
	if (!root || typeof root !== "object" || depth > 8 || seen.has(root)) return null;
	seen.add(root);
	const o = root as Record<string, unknown>;
	if (typeof o.scrollTo === "function" && typeof o.scrollTop === "number" && typeof o.scrollToEnd === "function") {
		return root as ScrollViewLike;
	}
	for (const v of Object.values(o)) {
		if (v && typeof v === "object") {
			const hit = findScrollView(v, seen, depth + 1);
			if (hit) return hit;
		}
	}
	return null;
}

/**
 * 找 transcript 容器。InteractiveMode 把 containers 依序掛在 tui.children：
 * [documentContainer, pendingMessages, status, widgetsAbove, editor, widgetsBelow, footer]
 * documentContainer = [header, loadedResources, chatContainer]
 */
function findTranscript(tui: TuiLike): { doc: { children: unknown[] }; chat: { children: unknown[] } } | null {
	const kids = tui.children;
	if (!Array.isArray(kids) || kids.length === 0) return null;
	const doc = kids[0] as { children?: unknown[] } | undefined;
	if (!doc || !Array.isArray(doc.children) || doc.children.length === 0) return null;
	const chat = doc.children[doc.children.length - 1] as { children?: unknown[] } | undefined;
	if (!chat || !Array.isArray(chat.children)) return null;
	return { doc: doc as { children: unknown[] }, chat: chat as { children: unknown[] } };
}

/** 深度掃描元件圖，找有沒有字串屬性以該圖 base64 開頭（Image.base64Data / data.pngBase64） */
function componentHoldsImage(comp: unknown, prefix: string, seen: Set<object>, depth = 0): boolean {
	if (!comp || typeof comp !== "object" || depth > 12 || seen.has(comp)) return false;
	seen.add(comp);
	for (const v of Object.values(comp as Record<string, unknown>)) {
		if (typeof v === "string") {
			if (v.length >= prefix.length && v.startsWith(prefix)) return true;
		} else if (Array.isArray(v)) {
			for (const item of v) {
				if (item && typeof item === "object" && componentHoldsImage(item, prefix, seen, depth + 1)) return true;
			}
		} else if (v && typeof v === "object" && componentHoldsImage(v, prefix, seen, depth + 1)) {
			return true;
		}
	}
	return false;
}

/** 找出每張圖在 chatContainer 的所屬 child index（-1 = 找不到） */
function locateOwners(chat: { children: unknown[] }, images: CapturedImage[]): number[] {
	return images.map((img) => {
		const prefix = img.data.slice(0, 1024);
		return chat.children.findIndex((c) => c && typeof c === "object" && componentHoldsImage(c, prefix, new Set()));
	});
}

/** 呼叫 component.render 只為了數行數（不看內容） */
function linesOf(comp: unknown, width: number): number {
	if (!comp || typeof comp !== "object") return 0;
	const r = (comp as { render?: (w: number) => string[] }).render;
	if (typeof r !== "function") return 0;
	try {
		return r.call(comp, width)?.length ?? 0;
	} catch {
		return 0;
	}
}

/** zoom 元件在整個 document 中的行 offset（前面前面所有元件的行數總和） */
function computeOffset(
	doc: { children: unknown[] },
	chat: { children: unknown[] },
	ownerIdx: number,
	width: number,
): number {
	let n = 0;
	const docChildren = doc.children;
	const chatIdx = docChildren.indexOf(chat);
	for (let i = 0; i < chatIdx; i++) n += linesOf(docChildren[i], width);
	for (let i = 0; i < ownerIdx && i < chat.children.length; i++) n += linesOf(chat.children[i], width);
	return n;
}

// ── inline zoom（fullscreen：原位置替換 + 捲動；regular：僅限畫面內的圖）──

let closeInlineZoom: (() => void) | null = null;

class InlineZoomViewer {
	private readonly images: CapturedImage[];
	index: number;
	private readonly tui: TuiLike;
	private cached?: { key: string; lines: string[] };

	constructor(tui: TuiLike, images: CapturedImage[], startIndex: number) {
		this.tui = tui;
		this.images = images;
		this.index = Math.max(0, Math.min(startIndex, images.length - 1));
	}

	invalidate(): void {
		this.cached = undefined;
	}

	render(width: number): string[] {
		const img = this.images[this.index];
		if (!img) return ["(no image)"];

		const rowsBudget = Math.max(1, Math.floor(((this.tui.terminal?.rows ?? 24) - 5) * zoomScale));
		const colsBudget = Math.max(1, Math.floor((width - 2) * zoomScale));
		const key = `${this.index}:${width}:${rowsBudget}:${zoomScale}`;
		if (this.cached?.key === key) return this.cached.lines;

		// 與 pi-tui calculateImageCellSize 相同的算法：取寬高小邊、等比例填滿
		const cell = getCellDimensions();
		const w = Math.max(1, img.widthPx ?? 800);
		const h = Math.max(1, img.heightPx ?? 600);
		const scale = Math.min((colsBudget * cell.widthPx) / w, (rowsBudget * cell.heightPx) / h);
		const columns = Math.max(1, Math.min(colsBudget, Math.ceil((w * scale) / cell.widthPx)));
		const rows = Math.max(1, Math.min(rowsBudget, Math.ceil((h * scale) / cell.heightPx)));

		// 直接用 encodeKitty（繞過 capability 檢查，因 suppress 期間 caps.images 是 null）
		const sequence = encodeKitty(img.data, {
			columns,
			rows,
			imageId: zoomImageId ?? undefined,
			moveCursor: false,
		});

		// kitty 圖錨定在當前游標位置，用空白 pad 置中；後面補空行保留高度
		const pad = Math.max(0, Math.floor((width - columns) / 2));
		const lines: string[] = [" ".repeat(pad) + sequence];
		for (let i = 1; i < rows; i++) lines.push("");
		const hint = "←/→ 切換 · +/− 縮放 · Esc 關閉";
		const hintPad = Math.max(0, Math.floor((width - hint.length * 1.4) / 2));
		lines.push(" ".repeat(hintPad) + hint);

		this.cached = { key, lines };
		return lines;
	}
}

/**
 * inline zoom 主流程。回傳 true 表示已跑完（使用者離開）；
 * 回傳 false 表示環境不允許 inline（交給 overlay fallback）。
 */
async function runInlineZoom(
	ctx: ExtensionContext,
	tui: TuiLike,
	caps: TerminalCapabilities,
	images: CapturedImage[],
): Promise<boolean> {
	const transcript = findTranscript(tui);
	if (!transcript) return false;
	const suppress = caps.images === "kitty";

	// 只有 fullscreen 有 transcript ScrollView（在 layoutRoot 底下）；
	// regular 模式 transcript 在 terminal scrollback 裡，無法程式化捲動
	const scroll = tui.mode === "fullscreen" ? findScrollView(tui.layoutRoot ?? tui) : null;
	if (!scroll && tui.mode === "fullscreen") return false;

	const width = Math.max(1, tui.terminal?.columns ?? 80);
	const rows = Math.max(1, tui.terminal?.rows ?? 24);

	// 先把所有圖定位到 chatContainer 的 child
	const owners = locateOwners(transcript.chat, images);
	let usable = images.map((img, i) => ({ img, owner: owners[i] })).filter((e) => e.owner >= 0);
	if (usable.length === 0) return false; // 全都找不到（折疊中 / 尚未 render）→ overlay

	// regular 模式：diff renderer 對 viewport 之上的變更會 full redraw（清 scrollback），
	// 所以只允許「目前在畫面內」的圖做 inline
	if (!scroll) {
		const zoomRows = rows - 4;
		let docTotal = 0;
		for (const c of transcript.doc.children) docTotal += linesOf(c, width);
		const visibleFrom = Math.max(0, docTotal - Math.max(1, rows - 12));
		usable = usable.filter((e) => {
			const off = computeOffset(transcript.doc, transcript.chat, e.owner, width);
			return off - 1 >= visibleFrom - 2 && off + zoomRows >= visibleFrom;
		});
		if (usable.length === 0) return false; // 圖都不在畫面內 → overlay
	}

	return await new Promise<boolean>((resolve) => {
		let index = usable.length - 1; // 從最新的圖開始
		let swapped: { comp: unknown } | null = null;
		let unsubscribe: (() => void) | null = null;
		const zoomComp = new InlineZoomViewer(tui, usable.map((e) => e.img), index);

		/** 以目前這張圖在對話中的位置為準重新捲動（圖片頂端留在 viewport 頂部附近） */
		function rescroll(): void {
			tui.renderNow?.(true); // 先 render 讓 ScrollView 的 contentHeight 更新（再 scrollTo 才不會被舊值 clamp）
			if (scroll) {
				const offset = computeOffset(transcript.doc, transcript.chat, usable[index].owner, width);
				scroll.scrollTo(Math.max(0, offset - 2), { disableFollow: true });
			}
			tui.requestRender();
		}

		const finish = (ok: boolean) => {
			closeInlineZoom = null;
			if (unsubscribe) unsubscribe();
			restoreSwap();
			endSuppress(tui);
			// 離開後停留在目前這張圖的位置（不回到 bottom、不還原進入前的捲動位置）
			try {
				rescroll();
			} catch {
				// 捲動失敗就維持原處
				tui.requestRender();
			}
			resolve(ok);
		};
		closeInlineZoom = () => finish(true);

		function restoreSwap(): void {
			if (!swapped) return;
			const chatChildren = transcript.chat.children;
			const cur = chatChildren.indexOf(zoomComp);
			if (cur >= 0) chatChildren[cur] = swapped.comp;
			swapped = null;
		}

		function swapIn(ownerIdx: number): void {
			const chatChildren = transcript.chat.children;
			if (swapped && chatChildren.indexOf(zoomComp) === ownerIdx) return; // 已在該位置
			restoreSwap();
			swapped = { comp: chatChildren[ownerIdx] };
			chatChildren[ownerIdx] = zoomComp;
		}

		function show(pos: number): void {
			index = (pos + usable.length) % usable.length;
			zoomComp.index = index;
			zoomComp.invalidate();
			swapIn(usable[index].owner);
			if (suppress) beginSuppress(tui, caps); // 冪等
			rescroll();
		}

		unsubscribe = ctx.ui.onTerminalInput((data) => {
			if (matchesKey(data, Key.escape) || data === "q") {
				finish(true);
				return { consume: true };
			}
			if (matchesKey(data, Key.left)) {
				show(index - 1);
				return { consume: true };
			}
			if (matchesKey(data, Key.right)) {
				show(index + 1);
				return { consume: true };
			}
			if (data === "+" || data === "=" || data === "-") {
				adjustZoomScale(data === "-" ? -0.1 : 0.1);
				zoomComp.invalidate();
				rescroll();
				return { consume: true };
			}
			// 讓 Ctrl+C / Ctrl+D 通過（維持 pi 原生行為）
			if (data === "\x03" || data === "\x04") return;
			// modal：其他按鍵吃掉，不讓 editor 收到
			return { consume: true };
		});

		try {
			show(index);
		} catch {
			finish(false);
		}
	});
}

// ── overlay zoom（fallback）──

class ZoomViewer {
	private readonly images: CapturedImage[];
	private index: number;
	private readonly tui: TuiLike;
	private readonly done: (value: string | null) => void;

	private cached?: { key: string; lines: string[] };

	constructor(tui: TuiLike, images: CapturedImage[], startIndex: number, done: (value: string | null) => void) {
		this.tui = tui;
		this.images = images;
		this.index = Math.max(0, Math.min(startIndex, images.length - 1));
		this.done = done;
	}

	invalidate(): void {
		this.cached = undefined;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.done(null);
			return;
		}
		const n = this.images.length;
		if (n > 1 && matchesKey(data, Key.left)) {
			this.cycle(-1);
		} else if (n > 1 && matchesKey(data, Key.right)) {
			this.cycle(1);
		}
	}

	private cycle(direction: number): void {
		const n = this.images.length;
		this.index = (this.index + direction + n) % n;
		// 同 id 重傳前先刪除舊 placement，確保替換乾淨不殘影
		if (zoomImageId != null) {
			process.stdout.write(deleteKittyImage(zoomImageId));
		}
		this.cached = undefined;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const img = this.images[this.index];
		if (!img) return ["(no image)"];

		const rowsBudget = Math.max(1, Math.floor(((this.tui.terminal?.rows ?? 24) - 2) * zoomScale));
		const colsBudget = Math.max(1, Math.floor((width - 2) * zoomScale));
		const key = `${this.index}:${width}:${rowsBudget}:${zoomScale}`;
		if (this.cached?.key === key) return this.cached.lines;

		// 與 pi-tui calculateImageCellSize 相同的算法：取寬高小邊、等比例填滿
		const cell = getCellDimensions();
		const w = Math.max(1, img.widthPx ?? 800);
		const h = Math.max(1, img.heightPx ?? 600);
		const scale = Math.min((colsBudget * cell.widthPx) / w, (rowsBudget * cell.heightPx) / h);
		const columns = Math.max(1, Math.min(colsBudget, Math.ceil((w * scale) / cell.widthPx)));
		const rows = Math.max(1, Math.min(rowsBudget, Math.ceil((h * scale) / cell.heightPx)));

		// 直接用 encodeKitty（繞過 capability 檢查，因 suppress 期間 caps.images 是 null）
		const sequence = encodeKitty(img.data, {
			columns,
			rows,
			imageId: zoomImageId ?? undefined,
			moveCursor: false,
		});

		// kitty 圖錨定在當前游標位置，用空白 pad 置中
		const pad = Math.max(0, Math.floor((width - columns) / 2));
		const lines: string[] = [" ".repeat(pad) + sequence];
		for (let i = 1; i < rows; i++) lines.push("");

		this.cached = { key, lines };
		return lines;
	}
}

// ── 進入點 ──

let viewerOpen = false;

async function openViewer(
	ctx: ExtensionContext,
	images: CapturedImage[],
	startIndex: number,
	caps: TerminalCapabilities,
): Promise<void> {
	if (viewerOpen) return;
	viewerOpen = true;
	const suppress = caps.images === "kitty";
	let tuiRef: TuiLike | null = null;
	try {
		await ctx.ui.custom<string | null>(
			(tui, _theme, _keybindings, done) => {
				tuiRef = tui as TuiLike;
				if (suppress) beginSuppress(tuiRef, caps);
				return new ZoomViewer(tuiRef, images, startIndex, (value) => {
					endSuppress(tuiRef);
					done(value);
				});
			},
			{
				overlay: true,
				overlayOptions: { anchor: "center", width: "100%" },
			},
		);
	} finally {
		viewerOpen = false;
		endSuppress(tuiRef); // 冪等：避免非正常關閉路徑漏掉還原
	}
}

async function zoomHandler(ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("img 只在互動模式可用", "warning");
		return;
	}
	const caps = getCapabilities();
	if (!caps.images) {
		ctx.ui.notify("此終端機不支援圖片顯示（kitty protocol）", "error");
		return;
	}
	// 重新掃一次 session 歷史，涵蓋 session_start 之後才出現的圖
	//（例如 session 途中 mermaid-mmrs render 出的圖）
	try {
		backfillFromSession(ctx);
	} catch {
		// 掃描失敗就用目前已收集的圖
	}
	if (sessionImages.length === 0) {
		ctx.ui.notify("這個 session 還沒有出現過圖片", "info");
		return;
	}
	if (viewerOpen || closeInlineZoom) return;

	// 探測 tui reference：custom 的工廠會同步呼叫，立即 done() 不會真的畫出 overlay
	let tui: TuiLike | null = null;
	await ctx.ui.custom<string | null>(
		(ref, _theme, _keybindings, done) => {
			tui = ref as TuiLike;
			done(null);
			return { render: () => [], invalidate() {} };
		},
		{
			overlay: true,
			overlayOptions: { width: 1, maxHeight: 1, nonCapturing: true },
			onHandle: (handle) => handle.hide(),
		},
	);

	// 優先嘗試 inline zoom（fullscreen 原位置替換 + 捲動；regular 僅限畫面內的圖）
	const probed = tui as TuiLike | null;
	if (probed) {
		try {
			const ran = await runInlineZoom(ctx, probed, caps, sessionImages);
			if (ran) return;
		} catch {
			// inline 失敗 → 掉回 overlay
		}
	}

	// overlay fallback：從最新的圖開始，←/→ 往舊圖循環
	await openViewer(ctx, sessionImages, sessionImages.length - 1, caps);
}

export default function (pi: ExtensionAPI) {
	readZoomScaleDefault();
	patchImagePrototype();

	// 記錄 prompt 附圖
	pi.on("before_agent_start", async (event) => {
		for (const block of event.images ?? []) {
			if (block.type === "image") {
				captureImage(block.data, block.mimeType);
			}
		}
	});

	// 攔截 tool result 中的圖片（read 讀圖、MCP 回圖等）
	pi.on("tool_result", async (event) => {
		for (const block of event.content ?? []) {
			if (block.type === "image" && block.data) {
				captureImage(block.data, block.mimeType);
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		closeInlineZoom?.(); // inline zoom 開著時換 session → 強制還原
		resetImages();
		try {
			backfillFromSession(ctx);
		} catch {
			// 回填失敗不影響正常運作，之後的圖仍會即時攔截
		}
	});
	pi.on("session_shutdown", async () => {
		closeInlineZoom?.();
		resetImages();
	});

	pi.registerCommand("img", {
		description: "快速瀏覽 session 中的圖片（←/→ 切換、+/− 縮放、Esc 離開）",
		handler: async (_args, ctx) => zoomHandler(ctx),
	});

	pi.registerShortcut("alt+z", {
		description: "Browse images from this session",
		handler: async (ctx) => zoomHandler(ctx),
	});
}
