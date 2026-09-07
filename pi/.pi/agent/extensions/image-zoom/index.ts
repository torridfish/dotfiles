/**
 * image-zoom — 放大檢視 pi 用 kitty protocol 顯示的圖片
 *
 * 用法：
 * - Alt+Z 或 /zoom：直接進入放大檢視，←/→ 在整個 session 收集到的圖片間循環
 * - Esc 離開
 *
 * 進入檢視時會隱藏背景裡既有的 kitty 圖片（避免疊在放大圖上面）：
 * 1. 直接送 `a=d,d=y,y=<row>` 逐 row 刪除可視畫面上的 placements
 *    （只刪 placement、保留圖片資料，scrollback 裡的圖不受影響）
 * 2. 暫時把 pi-tui 的 images capability 設為 null 並 invalidate 所有元件，
 *    讓 transcript 的 Image component 改 render 成文字 fallback，
 *    之後 diff 重寫那些行時不會再把舊圖貼回來
 * 3. 離開時：刪除放大的圖、還原 capability、invalidate + requestRender，
 *    transcript 的圖會重新畫回來
 *
 * 放大圖本身用 encodeKitty 直接編碼（繞過 capability 檢查），
 * 整個檢視 session 共用同一個 kitty image id，循環切換時同 id 重傳會自動替換，
 * 並在切換前先送 delete 確保乾淨。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
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
	requestRender(): void;
	invalidate?(): void;
	terminal?: { rows: number };
}

let savedCaps: TerminalCapabilities | null = null;
let zoomImageId: number | null = null;

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

// ── 放大檢視 component ──

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

		const rowsBudget = Math.max(1, (this.tui.terminal?.rows ?? 24) - 2);
		const colsBudget = Math.max(1, width - 2);
		const key = `${this.index}:${width}:${rowsBudget}`;
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
		ctx.ui.notify("image-zoom 只在互動模式可用", "warning");
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

	// 從最新（最後一張）的圖開始，←/→ 往舊圖循環
	await openViewer(ctx, sessionImages, sessionImages.length - 1, caps);
}

export default function (pi: ExtensionAPI) {
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
		resetImages();
		try {
			backfillFromSession(ctx);
		} catch {
			// 回填失敗不影響正常運作，之後的圖仍會即時攔截
		}
	});
	pi.on("session_shutdown", async () => resetImages());

	pi.registerCommand("zoom", {
		description: "放大檢視 session 中的圖片（←/→ 切換、Esc 離開）",
		handler: async (_args, ctx) => zoomHandler(ctx),
	});

	pi.registerShortcut("alt+z", {
		description: "Zoom images from this session",
		handler: async (ctx) => zoomHandler(ctx),
	});
}
