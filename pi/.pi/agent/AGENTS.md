# python 環境管理
執行任何 python 相關命令前，必須先用 `uv venv` 創建虛擬環境，若 `.venv` 已存在則跳過。之後的 package 一律用 `uv pip install` 安裝。

# 顯示圖片
當使用者要求要顯示圖片給它看時，你就要執行 `read` 這個 tool 來讀照片，這樣 Pi coding agent 就會把圖片顯示出來了。
