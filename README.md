# Antigravity CLI Statusline Hook (`my-status.mjs`)

繁體中文 | [English](#english)

一個為 [Google Antigravity CLI (`agy`)](https://github.com/google/antigravity) 量身打造的輕量、零依賴、跨平台狀態列（Statusline）延伸腳本。採用 AGY 官方最新的 **Stdin 注入架構 (Stdin Injection Architecture)**，擁有 **0 網路延遲**、**100% 精準捕捉當前模型** 的極致效能，並支援豐富的系統監控數據。

---

## 視覺效果 (Visual Preview)

```text
[Gemini 3.1 Pro (High)] (thinking) │ [⚡Fast/📋Plan/👥Team/💬Grill] │ agy-statusline-hook git:(main) 👤 your.email@gmail.com
API: Gemini (5h) ██████████ 100% (⏰ 5h 0m) | Gemini (Week) █████████░ 85% (⏰ 100h 0m) | CTX: 12.5k/100k (88% 剩餘) | Turn: +2.1k/-318
SYS: 🤖 探員: 2 │ ⚙️ 任務: 1 │ 🔓 Sandbox: OFF │ 🌐 Network: ON
```
*(實際輸出包含 24-bit TrueColor ANSI 著色。SYS 列為動態顯示，當系統狀態正常時會自動隱藏不佔版面)*

---

## 核心特色 (Features)

* 🔌 **零外部依賴與零延遲 (Zero Dependencies & Zero Latency)**：
  * 放棄舊版緩慢的本地 API Polling，全面擁抱 AGY 原生的 `stdin` 注入機制。
  * 瞬間反應，無須在背景抓取 PID 或戳 localhost API，效能提升 300%。
* 🎯 **真實當前模型 (True Active Model)**：直接從 AGY 底層捕獲當下視窗真正發送請求的 AI 模型，並高亮顯示於左上角（例如 `[Gemini 3.1 Pro (High)]`）。
* 📊 **雙重 Quota 精準追蹤 (Dual Quota Tracking)**：
  * 不再被錯誤的 100% 誤導！完美分離顯示 **5 小時短期額度 (5h)** 與 **單週長期額度 (Weekly)**。
  * 支援第三方模型 (3rd-Party) 額度自動切換偵測（Claude, GPT 等）。
* 🧠 **上下文視窗監控 (Context Window Telemetry)**：
  * `CTX: 12.5k/100k (88% 剩餘)`：隨時監控 AI 記憶體容量，防止對話過長導致遺忘。
  * `Turn: +2.1k/-318`：精準計算單次來回的 Token 消耗量。
* 🛡️ **隱藏式背景監控 (Smart Background Telemetry)**：
  * 動態顯示 **背景探員 (Subagents)** 與 **異步任務 (Tasks)** 數量。
  * 若 **沙盒 (Sandbox)** 遭關閉或連網權限被開啟，會亮起紅燈警告 (`🔓 Sandbox: OFF`)。
* 🖥️ **完美跨平台支援 (Cross-Platform)**：支援 macOS, Linux, 與 Windows PowerShell。
* 🌈 **TrueColor 漸層著色 (TrueColor ANSI)**：
  * $\ge$ 75%：**天空藍** (Sky Blue, `#57CAFF`）
  * $\ge$ 50%：**安全綠** (Green, `#5CDB6D`）
  * $\ge$ 25%：**警示黃** (Yellow, `#FFD427`）
  * $<$ 25%：**危險紅/粉** (Pink/Red, `#FF7DAF`）

---

## 快速安裝 (Quick Installation)

請在您的終端機複製並執行對應作業系統的**「一鍵安裝指令」**：

### 🍎 macOS / 🐧 Linux (Bash/Zsh)
```bash
mkdir -p ~/.gemini/antigravity-cli/hooks && curl -fsSL https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/my-status.mjs -o ~/.gemini/antigravity-cli/hooks/my-status.mjs
```

### 🪟 Windows (PowerShell)
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.gemini\antigravity-cli\hooks"; Invoke-RestMethod -Uri "https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/my-status.mjs" -OutFile "$HOME\.gemini\antigravity-cli\hooks\my-status.mjs"
```

### ⚙️ 設定檔配置
安裝後，請確保您的全域設定檔 (`~/.gemini/antigravity-cli/settings.json`) 中有啟用此腳本：
```json
{
  "statusLine": {
    "enabled": true,
    "type": "command",
    "command": "node ~/.gemini/antigravity-cli/hooks/my-status.mjs"
  }
}
```

---

## 整合指南 (Integration Guide)

### 1. tmux 狀態列整合
如果您想在 `tmux` 狀態列中整合 API 額度資訊，可以編輯您的 `~/.tmux.conf`：

```tmux
# 將 API 額度進度條（輸出第二行）顯示在右下角
set -g status-right-length 150
set -g status-right "#(node ~/.gemini/antigravity-cli/hooks/my-status.mjs | sed -n '2p')"
```

### 2. Zsh / Oh-My-Zsh 提示字元整合
您也可以在終端機提示字元（Prompt）上方顯示目前狀態：

```zsh
# 在 ~/.zshrc 最下方加入
show_agy_status() {
  # 取出第一行的 [模型 | 指令 | 目錄 | 帳號]
  node ~/.gemini/antigravity-cli/hooks/my-status.mjs | head -n 1
}
precmd() {
  show_agy_status
}
```

---

<h2 id="english">English Introduction & Quick Install</h2>

An advanced, zero-dependency, cross-platform statusline hook script tailored for [Google Antigravity CLI (`agy`)]. Built on the latest **Stdin Injection Architecture**, it provides **zero-latency** updates, **100% accurate active model tracking**, and comprehensive system telemetry including dual quota tracking (5h & Weekly), context window size, turn tokens, and sandbox security states.

### One-liner Installation

#### macOS / Linux:
```bash
mkdir -p ~/.gemini/antigravity-cli/hooks && curl -fsSL https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/my-status.mjs -o ~/.gemini/antigravity-cli/hooks/my-status.mjs
```

#### Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.gemini\antigravity-cli\hooks"; Invoke-RestMethod -Uri "https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/my-status.mjs" -OutFile "$HOME\.gemini\antigravity-cli\hooks\my-status.mjs"
```

---

## Contributors & Acknowledgements

* **[Google Antigravity](https://deepmind.google/)** - Co-authored the script design, Stdin injection parsing, smart dual quota layout, context/turn telemetry tracking, and TrueColor progression bars.

---

## 授權條款 (License)

[MIT License](LICENSE)
