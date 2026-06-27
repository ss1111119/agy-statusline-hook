# Antigravity CLI Statusline Hook (`my-status.mjs`)

繁體中文 | [English](#english)

一個為 [Google Antigravity CLI (`agy`)](https://github.com/google/antigravity) 量身打造的輕量、零依賴、跨平台狀態列（Statusline）延伸腳本。它能動態擷取您目前在 IDE 中使用的 Google AI Pro 模型剩餘額度、倒數重置時間、登入帳號，並以高質感的 24-bit TrueColor 彩色進度條呈現在您的終端機狀態列（如 `tmux`、`zsh` 提示字元、`neovim` 狀態列等）上。

---

## 視覺效果 (Visual Preview)

```text
[Flash 3.5] │ 0627 git:(master) 👤 your.email@gmail.com
API: Flash(*M/H/L)/Pro(H/L) █████░░░░░ 48% (⏰ 3h 52m) | GPT-OSS/Opus/Sonnet ██████████ 100%
```
*(實際輸出包含 24-bit TrueColor ANSI 著色，能依據額度健康度顯示 天空藍 / 亮綠色 / 警示黃 / 亮粉紅)*

---

## 核心特色 (Features)

* 🔌 **零外部依賴 (Zero Dependencies)**：純 Node.js ESM 撰寫，僅使用內建核心模組，免去 `npm install`。
* 🖥️ **工作目錄與 Git 狀態偵測 (Workspace & Git Detection)**：自動輸出當前工作資料夾名稱與目前所屬的 Git 分支（例如 `[Flash 3.5] │ amis-moedict git:(master)`）。
* 🖥️ **雙行輸出設計 (Two-line Layout)**：將系統與 Git 資訊以及登入帳號至於第一行，第二行專注顯示 API 額度與進度條，更適合多行提示字元或分欄顯示。
* 🖥️ **完美跨平台支援 (Cross-Platform)**：
  * **macOS/Linux**：自動調用 `ps auxww` 與 `lsof`。
  * **Windows**：調用 `Get-CimInstance` 與 `netstat`（背景無感執行，**100% 阻絕 CMD 黑色視窗彈出**，並明確使用 UTF-8 輸出以防 cp950 中文亂碼）。
* 📦 **智慧共享額度分組 (Smart Deduplication & Grouping)**：
  * 自動偵測後台共享相同額度與重置時間的模型（如 Gemini Flash/Pro 家族），並將它們壓縮成如 `Flash(M/H/L)/Pro(H/L)` 格式。
  * 獨立額度模型（如 Claude Sonnet/Opus）會整合成一個群組，釋放狀態列寶貴空間。
* 🎯 **當前模型高亮 (Active Model Highlighting)**：自動與 IDE 當前選用模型比對，並在括號規格中精確標記星號（例如選用 Flash Medium 時標記為 `*M` $\rightarrow$ `Flash(*M/H/L)`），同時將該組別排序置前。
* ⏳ **重置倒數去重 (Reset Timer Deduplication)**：自動將 ISO 8601 時間轉換為人眼直覺的 `2h 30m` 倒數。**同一個共享額度池僅會顯示一次倒數**，不重複洗版。
* 📊 **精美雙色進度條 (Progress Bar)**：包含 `█████░░░░░` 10 段比例進度條，剩餘部分上色，已消耗部分以低調灰呈現。
* 🌈 **TrueColor 漸層著色 (TrueColor ANSI)**：
  * $\ge$ 75%：**天空藍** (Sky Blue, `#57CAFF`）
  * $\ge$ 50%：**安全綠** (Green, `#5CDB6D`）
  * $\ge$ 25%：**警示黃** (Yellow, `#FFD427`）
  * $<$ 25%：**危險紅/粉** (Pink/Red, `#FF7DAF`）
* 👤 **登入身分標示 (Account Display)**：於第一行右側顯示目前登入的 Google 帳號 Email，確保工作環境正確。

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

---

## 整合指南 (Integration Guide)

### 1. tmux 狀態列整合
如果您想在 `tmux` 狀態列中整合 API 額度資訊，可以編輯您的 `~/.tmux.conf`：

```tmux
# 將 API 額度進度條（輸出第二行）顯示在右下角
set -g status-right-length 100
set -g status-right "#(node ~/.gemini/antigravity-cli/hooks/my-status.mjs | tail -n 1)"
```

### 2. Zsh / Oh-My-Zsh 提示字元整合
您也可以在終端機提示字元（Prompt）的右側（`RPROMPT`）或上方顯示目前狀態：

```zsh
# 在 ~/.zshrc 最下方加入
show_agy_status() {
  # 僅取出第一行的 [模型 | 目錄 | 帳號]
  node ~/.gemini/antigravity-cli/hooks/my-status.mjs | head -n 1
}
# 在載入提示字元前動態顯示
precmd() {
  show_agy_status
}
```

---

## 如何貢獻 (Contributing)

歡迎提交您的想法與優化！不論是：
1. **修復 Bug**：回報或修正進程尋找、Port 監聽解析等問題。
2. **新增功能**：擴充狀態顯示、相容於其他終端機工具、優化 ANSI 著色等。
3. **改進文件**：提供更豐富的 Shell / tmux / Neovim 配置整合教學。

請直接 Fork 本專案並發起 Pull Request (PR)。

---

<h2 id="english">English Introduction & Quick Install</h2>

A lightweight, zero-dependency, cross-platform statusline hook script tailored for [Google Antigravity CLI (`agy`)]. It dynamically fetches your active Google AI Pro model remaining quotas, reset countdown timers, and logged-in account, presenting them in a beautiful 24-bit TrueColor progress bar on your terminal statuslines.

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

* **[Google Antigravity](https://deepmind.google/)** - Co-authored the script design, cross-platform process snooping, smart quota deduplication, TrueColor progression bars, and layout configuration.

---

## 授權條款 (License)

[MIT License](LICENSE)
