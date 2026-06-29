# Antigravity CLI Statusline Hook (`my-status.mjs`)

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/ss1111119/agy-statusline-hook)](https://github.com/ss1111119/agy-statusline-hook/releases)
[![GitHub Repo stars](https://img.shields.io/github/stars/ss1111119/agy-statusline-hook)](https://github.com/ss1111119/agy-statusline-hook/stargazers)
[![License](https://img.shields.io/github/license/ss1111119/agy-statusline-hook)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)](#)

[English](#english) | [繁體中文](#chinese)

An advanced, zero-dependency, cross-platform statusline hook script tailored for [Google Antigravity CLI (`agy`)](https://github.com/google/antigravity). Built on the latest **Stdin Injection Architecture**, it provides **zero-latency** updates, **100% accurate active model tracking**, and comprehensive system telemetry including dual quota tracking (5h & Weekly), context window size, turn tokens, and sandbox security states.

---

## Visual Preview

![Visual Preview](preview.gif)

*(Actual output includes 24-bit TrueColor ANSI styling. The SYS line is dynamic and hides automatically when the system is normal to save space)*

---

## Features

* 🔌 **Zero Dependencies & Zero Latency**:
  * Abandons the slow local API polling of older versions, fully embracing AGY's native `stdin` injection mechanism.
  * Instant response times. No background PID hunting or localhost API requests required. 300% performance boost.
* 🎯 **True Active Model**: Directly captures the actual AI model being used in the current window from AGY's backend and highlights it in the top left corner (e.g., `[Gemini 3.1 Pro (High)]`).
* 📊 **Dual Quota Tracking**:
  * No more misleading 100% bars! Perfectly separates the **5-hour short-term quota** and the **Weekly long-term quota**.
  * Supports automatic detection and switching for 3rd-Party model quotas (Claude, GPT, etc.).
* 🧠 **Context Window Telemetry**:
  * `CTX: 12.5k/100k (88% left)`: Monitor AI memory capacity at all times to prevent context loss in long conversations.
  * `Turn: +2.1k/-318`: Accurately calculates token consumption for a single back-and-forth interaction.
* 🛡️ **Smart Background Telemetry**:
  * Dynamically displays the number of active **Subagents** and async **Tasks**.
  * Shows a red warning (`🔓 Sandbox: OFF`) if the Sandbox is disabled or network access is granted.
* 🖥️ **Cross-Platform**: Full support for macOS, Linux, and Windows PowerShell.
* 🌈 **TrueColor ANSI Gradient**:
  * $\ge$ 75%: **Sky Blue** (`#57CAFF`)
  * $\ge$ 50%: **Green** (`#5CDB6D`)
  * $\ge$ 25%: **Yellow** (`#FFD427`)
  * $<$ 25%: **Pink/Red** (`#FF7DAF`)

---

## Quick Installation

Run this single command in your terminal (macOS / Linux / Windows PowerShell). It will automatically download the script and configure your `settings.json` for you:

```bash
curl -fsSL https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/install.js | node
```

---

## Usage & Interactive Commands

### 🚀 Starting the Statusline
Once configured in your `settings.json`, simply launch the Antigravity CLI by running the following command in your terminal:
```bash
agy
```
The statusline will automatically render at the bottom of your terminal window during the session.

### 🔄 Toggling Visibility
Inside the `agy` interactive session, you can toggle the statusline display on or off at any time by typing the following slash command:
```text
/statusline
```

### 🧪 Local Testing & Development
Since the script processes JSON data piped through standard input (`stdin`), you can test the output rendering locally in your shell using mock data without running the full CLI:

* **macOS / Linux**:
  ```bash
  echo '{"model":{"display_name":"Gemini 3.5 Flash"},"agent_state":"thinking","email":"test@example.com","context_window":{"context_window_size":100000,"total_input_tokens":12000,"total_output_tokens":3000,"remaining_percentage":85,"current_usage":{"input_tokens":2100,"output_tokens":318}},"subagents":[{},{}],"task_count":1,"sandbox":{"enabled":false,"allow_network":true},"quota":{"gemini-5h":{"remaining_fraction":0.9,"reset_in_seconds":3600}}}' | node my-status.mjs
  ```
* **Windows (PowerShell)**:
  ```powershell
  $mock = '{"model":{"display_name":"Gemini 3.5 Flash"},"agent_state":"thinking","email":"test@example.com","context_window":{"context_window_size":100000,"total_input_tokens":12000,"total_output_tokens":3000,"remaining_percentage":85,"current_usage":{"input_tokens":2100,"output_tokens":318}},"subagents":[{},{}],"task_count":1,"sandbox":{"enabled":false,"allow_network":true},"quota":{"gemini-5h":{"remaining_fraction":0.9,"reset_in_seconds":3600}}}'
  $mock | node my-status.mjs
  ```

---

## Integration Guide

### 1. tmux Statusline
To integrate API quota information into your `tmux` statusline, edit your `~/.tmux.conf`:

```tmux
# Display the API quota progress bar (second output line) in the bottom right corner
set -g status-right-length 150
set -g status-right "#(node ~/.gemini/antigravity-cli/hooks/my-status.mjs | sed -n '2p')"
```

### 2. Zsh / Oh-My-Zsh Prompt
You can display the current status above your terminal prompt:

```zsh
# Add to the bottom of ~/.zshrc
show_agy_status() {
  # Extract the first line [Model | Command | Dir | Account]
  node ~/.gemini/antigravity-cli/hooks/my-status.mjs | head -n 1
}
precmd() {
  show_agy_status
}
```

---

<h2 id="chinese">繁體中文介紹與安裝</h2>

一個為 [Google Antigravity CLI (`agy`)](https://github.com/google/antigravity) 量身打造的輕量、零依賴、跨平台狀態列（Statusline）延伸腳本。採用 AGY 官方最新的 **Stdin 注入架構 (Stdin Injection Architecture)**，擁有 **0 網路延遲**、**100% 精準捕捉當前模型** 的極致效能，並支援豐富的系統監控數據。

### 一鍵安裝指令

無論您是使用 macOS、Linux 還是 Windows PowerShell，只要在終端機執行這行指令，它就會自動幫您下載腳本並設定好 `settings.json`：

```bash
curl -fsSL https://raw.githubusercontent.com/ss1111119/agy-statusline-hook/main/install.js | node
```

### 🚀 如何啟動與使用

1. **啟動狀態列**：
   在設定完成後，只需在終端機輸入以下指令啟動對話：
   ```bash
   agy
   ```
   狀態列將會自動顯示在對話視窗的最下方。

2. **切換顯示狀態**：
   在 `agy` 互動對話中，您可以隨時輸入以下指令來切換（開啟或關閉）狀態列的顯示：
   ```text
   /statusline
   ```

### 🧪 本機測試與開發

此腳本採用 `stdin` 標準輸入注入架構。若您在修改腳本時想要測試外觀，可以直接在終端機輸入模擬的 JSON 數據進行測試，不需啟動 `agy` 主程式：

* **macOS / Linux**:
  ```bash
  echo '{"model":{"display_name":"Gemini 3.5 Flash"},"agent_state":"thinking","email":"test@example.com","context_window":{"context_window_size":100000,"total_input_tokens":12000,"total_output_tokens":3000,"remaining_percentage":85,"current_usage":{"input_tokens":2100,"output_tokens":318}},"subagents":[{},{}],"task_count":1,"sandbox":{"enabled":false,"allow_network":true},"quota":{"gemini-5h":{"remaining_fraction":0.9,"reset_in_seconds":3600}}}' | node my-status.mjs
  ```
* **Windows (PowerShell)**:
  ```powershell
  $mock = '{"model":{"display_name":"Gemini 3.5 Flash"},"agent_state":"thinking","email":"test@example.com","context_window":{"context_window_size":100000,"total_input_tokens":12000,"total_output_tokens":3000,"remaining_percentage":85,"current_usage":{"input_tokens":2100,"output_tokens":318}},"subagents":[{},{}],"task_count":1,"sandbox":{"enabled":false,"allow_network":true},"quota":{"gemini-5h":{"remaining_fraction":0.9,"reset_in_seconds":3600}}}'
  $mock | node my-status.mjs
  ```

---

### 🔌 整合指南

#### 1. tmux 狀態列整合
將 API 配額進度條整合至您的 `tmux` 狀態列，請編輯您的 `~/.tmux.conf`：
```tmux
set -g status-right-length 150
set -g status-right "#(node ~/.gemini/antigravity-cli/hooks/my-status.mjs | sed -n '2p')"
```

#### 2. Zsh Prompt 整合
在終端機 Prompt 上方顯示當前狀態，請在 `~/.zshrc` 底部加入：
```zsh
show_agy_status() {
  node ~/.gemini/antigravity-cli/hooks/my-status.mjs | head -n 1
}
precmd() {
  show_agy_status
}
```

---

## Contributors & Acknowledgements

* **[Google Antigravity](https://deepmind.google/)** - Co-authored the script design, Stdin injection parsing, smart dual quota layout, context/turn telemetry tracking, and TrueColor progression bars.

---

## License

[MIT License](LICENSE)
