# image-zoom

放大檢視 pi 用 kitty graphics protocol 顯示的圖片。

## 使用

- **Alt+Z** 或 **/zoom**：直接進入放大檢視，從 session 中最新的一張圖開始
- 檢視中：
  - **←/→** 在整個 session 收集到的圖片之間循環（新 ↔ 舊）
  - **Esc** 離開（沒有 [X]，純鍵盤操作）

## 放大規則

圖片置中，取終端機寬／高**較小的那一邊**盡量填滿、維持原始比例
（依 kitty 的 cell 寬高比換算 rows/columns，與 pi-tui 內建演算法一致）。

## 背景圖片隱藏機制

進入檢視時，畫面裡既有的 kitty 圖片會疊在放大圖上面，因此：

1. 直接送 `a=d,d=y,y=<row>` 逐 row 刪除可視畫面上的 placements
   （只刪 placement、保留圖片資料，scrollback 裡的圖不受影響）
2. 暫時把 pi-tui 的 images capability 設為 `null` 並 invalidate 所有元件，
   讓 transcript 的 `Image` component 改 render 成文字 fallback，
   diff 重寫那些行時不會把舊圖貼回來
3. 離開時刪除放大圖、還原 capability、invalidate + requestRender，
   transcript 的圖會重新畫回來

放大圖用 `encodeKitty` 直接編碼（繞過 capability 檢查），整個檢視共用同一個
kitty image id；循環切換時先送 `deleteKittyImage(id)` 再重傳，確保乾淨替換。

## 運作原理

- 透過 `before_agent_start`（prompt 附圖）與 `tool_result`（`read` 讀圖、MCP 回圖）
  事件攔截圖片 base64，不影響 pi 原生渲染。
- `session_start` 時從 session 歷史回填（掃 branch 的 toolResult / user message
  中的 image blocks），所以 reload 前就顯示過的圖也能 zoom。
- 同一張圖以 mime + 大小 + 開頭內容去重，不會重複出現在循環清單。
- 檢視視窗用 `ctx.ui.custom` overlay，regular 與 fullscreen TUI 模式都能用。

## 限制

- 需要終端機支援 kitty graphics protocol（settings: `terminal.images: "kitty"`）。
- 滑鼠點擊在 regular 模式下 pi 收不到事件（pi 只有 fullscreen 模式會攔滑鼠），
  故採鍵盤觸發。
- Session 圖片 ring buffer 上限 30 張 / 300MB，避免記憶體失控。
- 快捷鍵寫死為 `alt+z`（pi 原生未使用）；要換鍵改 `index.ts` 最後的
  `pi.registerShortcut("alt+z", ...)`。
