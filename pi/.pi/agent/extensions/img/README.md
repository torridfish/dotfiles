# img

快速瀏覽 pi 顯示過的圖片（kitty graphics protocol）——放大檢視 + session 內圖片切換。

## 使用

- **Alt+Z** 或 **/img**：進入檢視，從 session 中最新的一張圖開始
- 檢視中：
  - **←/→** 在 session 收集到的圖片之間切換（新 ↔ 舊）
  - **+ / −**（`=` 同 `+`）調整放大比例（0.4–1.0，預設 0.8，記憶到下次）
  - **Esc**（或 `q`）離開；離開後 transcript 停留在目前那張圖的位置
    （不會跳回 bottom，也不會還原進入前的捲動位置）

平時圖片常駐在對話中（mermaid 圖的置中與顯示大小由 mermaid-mmrs 的
`config.json` 控制），`/img` 是瀏覽與臨時放大用的。

## 兩種檢視模式

### inline 檢視（優先，fullscreen TUI 模式）

不用 overlay 蓋住對話，而是：

1. 在 transcript 中找到該圖所屬的訊息元件，**原位置替換**成放大版
   （置中、幾乎佔滿 viewport 高度，上下文字自然被擠開）
2. 用 `ScrollView.scrollTo()` 把 transcript 捲到圖片原本的對話位置
3. **←/→** 切換時會跟著跳到下一張圖在對話中的原始位置；**+/-** 改變大小並留在原位置
4. **Esc** 還原：換回原元件，捲動位置停在該圖原本的對話位置

實作方式：透過 `tui.children` 找 `documentContainer` / `chatContainer`，
對每張收集到的圖做 deep-scan（比對 base64 前綴）定位它屬於哪個 child
（pi-tui `Image` 的 `base64Data`、mermaid-mmrs 元件的 `data.pngBase64`），
再把該 child 暫時換成 inline viewer component。

### overlay 模式（fallback）

以下情況退回 overlay 檢視（`ctx.ui.custom` overlay，置中放大）：

- regular TUI 模式且圖片不在目前畫面內（regular 模式 transcript 直接渲染進
  terminal scrollback、無法程式化捲動；且 diff renderer 對 viewport 之上的
  變更會觸發破壞性的 full redraw／清空 scrollback）
- transcript 結構找不到，或所有圖都定位不到（折疊中、尚未 render）

## 放大規則

圖片置中，以「填滿可用寬高」為基準乘上縮放比例、維持原始比例
（依 kitty 的 cell 寬高比換算 rows/columns，與 pi-tui 內建演算法一致）。
inline 模式會保留一行 hint（`←/→ 切換 · +/− 縮放 · Esc 關閉`）在圖片下方。

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
捲動造成的殘影由 pi-tui alt screen 的 placement 機制處理。

## 運作原理

- 透過 `before_agent_start`（prompt 附圖）與 `tool_result`（`read` 讀圖、MCP 回圖）
  事件攔截圖片 base64，不影響 pi 原生渲染。
- `session_start` 時從 session 歷史回填（掃 branch 的 toolResult / user message
  中的 image blocks，以及 **mermaid-mmrs 的 custom entry** `data.pngBase64`），
  每次 `/img` 時也會重掃一次，所以 session 途中才 render 的 mermaid 圖也瀏覽得到。
- 同一張圖以 mime + 大小 + 開頭內容去重，不會重複出現在循環清單。
- 檢視中的按鍵用 `ctx.ui.onTerminalInput` 攔截（modal，吃掉所有鍵；
  Ctrl+C / Ctrl+D 仍通過維持 pi 原生行為）。
- 換 session（session_start / session_shutdown）時 inline 檢視會強制還原。

## 限制

- 需要終端機支援 kitty graphics protocol（settings: `terminal.images: "kitty"`）。
- inline 檢視的定位依賴 pi 內部結構（`tui.children[0]` = documentContainer、
  chatContainer 為其最後一個 child、fullscreen 的 ScrollView 在 layoutRoot 底下），
  pi 改版時可能需要跟著調整；結構不合時自動退回 overlay 模式。
- regular 模式下 inline 檢視只對「畫面內」（transcript 尾端）的圖生效，
  舊圖會退回 overlay。
- Session 圖片 ring buffer 上限 30 張 / 300MB，避免記憶體失控。
- 快捷鍵寫死為 `alt+z`（pi 原生未使用）；要換鍵改 `index.ts` 最後的
  `pi.registerShortcut("alt+z", ...)`。
