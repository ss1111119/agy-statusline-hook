import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// 輔助函式
// ---------------------------------------------------------------------------

function spawnProcess(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, encoding: 'utf8', ...opts });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.on('close', () => resolve(stdout));
    child.on('error', () => resolve(''));
  });
}

const getGitBranch = () =>
  spawnProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD']).then((out) => out.trim());

function getColorCode(percentage) {
  if (percentage >= 75) return '\x1b[38;2;87;202;255m';  // Sky blue
  if (percentage >= 50) return '\x1b[38;2;92;219;109m';  // Light green
  if (percentage >= 25) return '\x1b[38;2;255;212;39m';  // Yellow
  return '\x1b[38;2;255;125;175m';                        // Red/Pink
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '現在';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function renderProgressBar(percentage) {
  const p = Math.min(100, Math.max(0, Math.round(percentage)));
  const filled = Math.round(p / 10);
  const empty = 10 - filled;
  const color = getColorCode(p);
  return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}${color} ${p}%\x1b[0m`;
}

function formatTokens(num) {
  if (num == null) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

// ---------------------------------------------------------------------------
// 主程式
// ---------------------------------------------------------------------------

async function main() {
  try {
    // 讀取 stdin
    let inputJson = '';
    for await (const chunk of process.stdin) {
      inputJson += chunk;
    }

    if (!inputJson || inputJson.trim().length === 0) {
      console.log('API: 尚未就緒 (等待 stdin)');
      return;
    }

    const data = JSON.parse(inputJson);

    // 基本資訊
    const modelName = data.model?.display_name || '未知模型';
    const isGemini = modelName.toLowerCase().includes('gemini') || modelName.toLowerCase().includes('flash') || modelName.toLowerCase().includes('pro');
    const agentState = data.agent_state || 'idle';
    const email = data.email || '';
    
    // 進階數據 (Context & Turn)
    const ctxTotal = data.context_window?.context_window_size || 0;
    const ctxUsed = (data.context_window?.total_input_tokens || 0) + (data.context_window?.total_output_tokens || 0);
    const ctxRemainPct = data.context_window?.remaining_percentage != null ? data.context_window.remaining_percentage : 100;
    
    const turnIn = data.context_window?.current_usage?.input_tokens || 0;
    const turnOut = data.context_window?.current_usage?.output_tokens || 0;

    // 背景與安全狀態
    const subagentsCount = Array.isArray(data.subagents) ? data.subagents.length : 0;
    const tasksCount = data.task_count || 0;
    const isSandboxOn = data.sandbox?.enabled !== false;
    const isNetOn = data.sandbox?.allow_network === true;

    // 取得配額
    const quotas = data.quota || {};
    let activeQuotas = [];

    if (isGemini) {
      if (quotas['gemini-5h'] && quotas['gemini-5h'].remaining_fraction != null) {
        activeQuotas.push({ label: 'Gemini (5h)', fraction: quotas['gemini-5h'].remaining_fraction, reset: quotas['gemini-5h'].reset_in_seconds });
      }
      if (quotas['gemini-weekly'] && quotas['gemini-weekly'].remaining_fraction != null) {
        activeQuotas.push({ label: 'Gemini (Week)', fraction: quotas['gemini-weekly'].remaining_fraction, reset: quotas['gemini-weekly'].reset_in_seconds });
      }
    } else {
      if (quotas['3p-5h'] && quotas['3p-5h'].remaining_fraction != null) {
        activeQuotas.push({ label: '3rd-Party (5h)', fraction: quotas['3p-5h'].remaining_fraction, reset: quotas['3p-5h'].reset_in_seconds });
      }
      if (quotas['3p-weekly'] && quotas['3p-weekly'].remaining_fraction != null) {
        activeQuotas.push({ label: '3rd-Party (Week)', fraction: quotas['3p-weekly'].remaining_fraction, reset: quotas['3p-weekly'].reset_in_seconds });
      }
    }

    const quotaStrs = activeQuotas.map(q => {
      const p = q.fraction * 100;
      let str = `${q.label} ${renderProgressBar(p)}`;
      if (q.reset > 0) str += ` \x1b[90m(⏰ ${formatCountdown(q.reset)})\x1b[0m`;
      return str;
    });

    // 抓 Git 和目錄
    const folderName = path.basename(process.cwd());
    const gitBranch = await getGitBranch();
    const gitPart = gitBranch ? ` git:(${gitBranch})` : '';

    let isFastMode = false;
    try {
      const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.runningLightSpeed === 'off' || settings.runningLightSpeed === 'fast') isFastMode = true;
    } catch { }

    // -----------------------------------------------------------------------
    // 排版邏輯
    // -----------------------------------------------------------------------
    
    // 第一行: 模型、狀態、指令、Git、使用者
    const modelColor = isGemini ? '\x1b[38;2;87;202;255m' : '\x1b[38;2;255;125;175m';
    const modelStr = `${modelColor}[${modelName}]\x1b[0m`;
    const stateStr = agentState !== 'idle' ? ` \x1b[33m(${agentState})\x1b[0m` : '';
    const fastText = isFastMode ? '\x1b[38;2;87;202;255m\x1b[1m⚡Fast\x1b[0m\x1b[90m' : '⚡Fast';
    const cmdPart = `\x1b[90m[${fastText}/📋Plan/👥Team/💬Grill]\x1b[0m`;
    const maskEmail = (str) => {
      if (!str) return '';
      const [local, domain] = str.split('@');
      if (!domain) return str;
      const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : local + '***';
      const maskedDomain = domain.length > 2 ? domain.slice(0, 2) + '***' : domain;
      return `${maskedLocal}@${maskedDomain}`;
    };
    const accountStr = email ? ` \x1b[90m👤 ${maskEmail(email)}\x1b[0m` : '';
    const line1 = `${modelStr}${stateStr} │ ${cmdPart} │ ${folderName}${gitPart}${accountStr}`;

    // 第二行: API 配額與 Token
    const ctxStr = `CTX: ${formatTokens(ctxUsed)}/${formatTokens(ctxTotal)} (\x1b[38;2;255;212;39m${Math.round(ctxRemainPct)}% left\x1b[0m)`;
    const turnStr = `\x1b[90mTurn: +${formatTokens(turnIn)}/-${formatTokens(turnOut)}\x1b[0m`;
    const quotaLine = quotaStrs.length > 0 ? quotaStrs.join(' | ') : `No Quota Data`;
    const line2 = `API: ${quotaLine} | ${ctxStr} | ${turnStr}`;

    // 第三行: (有需要才顯示) 背景任務與沙盒
    let line3 = null;
    let bgInfo = [];
    if (subagentsCount > 0) bgInfo.push(`🤖 Subagents: ${subagentsCount}`);
    if (tasksCount > 0) bgInfo.push(`⚙️ Tasks: ${tasksCount}`);
    if (!isSandboxOn) bgInfo.push(`🔓 \x1b[31mSandbox: OFF\x1b[0m`);
    if (isNetOn) bgInfo.push(`🌐 \x1b[33mNetwork: ON\x1b[0m`);
    
    if (bgInfo.length > 0) {
      line3 = `SYS: ${bgInfo.join(' │ ')}`;
    }

    // 輸出
    console.log(line1);
    console.log(line2);
    if (line3) console.log(line3);

  } catch (err) {
    console.log(`API: Hook 錯誤 (${err.message})`);
  }
}

main();
