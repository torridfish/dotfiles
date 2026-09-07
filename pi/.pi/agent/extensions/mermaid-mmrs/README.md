# mermaid-mmrs

pi extension:用 [mmrs](https://github.com/cmwright/mermaid-rs)（mermaid-rs-cli，純 Rust）把 assistant 訊息中的 ` ```mermaid ` 區塊渲染成真正的圖片，並透過 kitty 圖形協議直接顯示在終端裡。

取代 pi 內建的 grok-mermaid Unicode 文字圖渲染（需在 `~/.pi/agent/settings.json` 設定 `"markdown": { "mermaid": "off" }`）。

## 行為

- **全自動**：任何 assistant 訊息只要含 ` ```mermaid ` 區塊就會在 message_end 自動渲染，agent 不需要呼叫任何工具
- **Backfill**：session_start 時掃描 session 中既有 assistant 訊息（extension 載入前產生的、或 resume 的舊 session），缺渲染的補渲染；entries 會附加在 branch 結尾
- **寬度自適應**：圖片自動貼合 transcript 可用寬度（`maxWidthCells` 可設上限）
- **改 theme 可回溯**：`/mermaid-theme` 會強制重渲染磁碟快取（hash 與 theme 無關）並 reload transcript，既有圖片全部換新 theme
- 渲染結果以內容 hash 為 key 快取在 `~/.cache/pi-mermaid/`（`.mmd` / `.svg` / `.png` / `.meta.json`，meta 記錄渲染時的 theme 以偵測過期）
- caption 顯示：`⬡ mmrs · dark · flowchart · 429×191 · 0.18s · 可點擊的 svg 路徑`
- 已渲染的 code fence 會折疊成一行 `⬡ rendered with mmrs · <theme>`（可關閉）
- 圖片顯示優先讀磁碟 PNG（現行 theme），快取消失時 fallback 到 entry 內嵌 base64
- 渲染失敗（如 mmrs 尚不支援的圖型）顯示錯誤訊息，展開可看原始碼
- 終端不支援圖片時自動退回純文字路徑顯示

## 需求

```sh
cargo install mermaid-rs-cli resvg
```

- `mmrs`、`resvg` 在 PATH 或 `~/.cargo/bin/`
- kitty / iTerm2 終端可顯示 inline 圖片；其他終端優雅退回
- `Hack-Regular.ttf`（MIT license）已內建於本目錄，供 resvg 使用

## 設定

`config.json`（與 index.ts 同目錄，首次變更主題時自動寫入）：

```json
{
  "theme": "dark",          // default | dark | forest | neutral
  "zoom": 2,                // resvg 縮放倍率（1-8）
  "maxWidthCells": 9999,    // 圖片最大寬度（終端格數）；預設極大值 = 自適應終端寬度
  "hideCode": true,         // 折疊已渲染的 mermaid code fence
  "mmrsPath": null,         // 覆寫 mmrs 路徑（選填）
  "resvgPath": null,        // 覆寫 resvg 路徑（選填）
  "fontPath": null,         // 覆寫字型路徑（選填）
  "cacheDir": "~/.cache/pi-mermaid"
}
```

環境變數 `PI_MERMAID_MMRS` / `PI_MERMAID_RESVG` 亦可覆寫二進位路徑。

## 指令

- `/mermaid-theme` — 顯示目前主題
- `/mermaid-theme <name>` — 切換主題（default / dark / forest / neutral）：寫入 config.json、強制重渲染 session 中所有已知圖片、reload transcript 讓舊圖立即換新主題
