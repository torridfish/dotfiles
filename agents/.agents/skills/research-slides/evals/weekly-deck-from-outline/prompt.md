---
tags: [research-slides]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

幫我做 11/05 的 Progress Report 投影片（Woven Anypoint Project）。內容：
1. Section: KV cache ablation（issue 連結 https://github.com/torridfish/just3d/issues/17）
2. Experiment / Category C: KV cache ablation — lead: Does reusing the stage-1 KV cache change ScanRefer accuracy? 圖先用 placeholder，檔名 figures/kv_ablation.png（請自己生一張 placeholder PNG）
3. Benchmark / ScanRefer — 表格：reference 2-92 (0.5505, 0.4969)，ours 4-20 (0.5311, 0.4802)、4-21 (0.5402, 0.4877)，baseline Qwen3D-3B (0.65, 0.62)；欄位 Name, Acc@0.25, Acc@0.50，4-21 的 Acc@0.25 是我們最好的
4. TODO：合併 KV cache 分支、跑 Multi3DRefer、11/10–11/12 HPC 維護
輸出 pptx 和 build script 放在 2026-11-05/。
