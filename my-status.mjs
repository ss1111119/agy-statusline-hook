import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

// ---------------------------------------------------------------------------
// 讀取 stdin 狀態資料
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

    // 解析我們需要的欄位
    const modelName = data.model?.display_name || '未知模型';
    const isGemini = modelName.toLowerCase().includes('gemini') || modelName.toLowerCase().includes('flash') || modelName.toLowerCase().includes('pro');
    const agentState = data.agent_state || 'idle';
    const email = data.email || '';
    
    // 取得配額
    const quotas = data.quota || {};
    let activeQuotas = [];

    // 依據模型決定顯示哪一組 quota
    if (isGemini) {
      if (quotas['gemini-5h'] && quotas['gemini-5h'].remaining_fraction != null) {
        activeQuotas.push({
          label: 'Gemini (5h)',
          fraction: quotas['gemini-5h'].remaining_fraction,
          reset: quotas['gemini-5h'].reset_in_seconds
        });
      }
      if (quotas['gemini-weekly'] && quotas['gemini-weekly'].remaining_fraction != null) {
        activeQuotas.push({
          label: 'Gemini (Week)',
          fraction: quotas['gemini-weekly'].remaining_fraction,
          reset: quotas['gemini-weekly'].reset_in_seconds
        });
      }
    } else {
      if (quotas['3p-5h'] && quotas['3p-5h'].remaining_fraction != null) {
        activeQuotas.push({
          label: '3rd-Party (5h)',
          fraction: quotas['3p-5h'].remaining_fraction,
          reset: quotas['3p-5h'].reset_in_seconds
        });
      }
      if (quotas['3p-weekly'] && quotas['3p-weekly'].remaining_fraction != null) {
        activeQuotas.push({
          label: '3rd-Party (Week)',
          fraction: quotas['3p-weekly'].remaining_fraction,
          reset: quotas['3p-weekly'].reset_in_seconds
        });
      }
    }

    // 格式化 Quota 字串
    const quotaStrs = activeQuotas.map(q => {
      const p = q.fraction * 100;
      let str = `${q.label} ${renderProgressBar(p)}`;
      if (q.reset > 0) {
        str += ` \x1b[90m(⏰ ${formatCountdown(q.reset)})\x1b[0m`;
      }
      return str;
    });

    // 抓 Git 和目錄
    const folderName = path.basename(process.cwd());
    const gitBranch = await getGitBranch();
    const gitPart = gitBranch ? ` git:(${gitBranch})` : '';

    // 抓 Fast Mode
    let isFastMode = false;
    try {
      const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.runningLightSpeed === 'off' || settings.runningLightSpeed === 'fast') {
        isFastMode = true;
      }
    } catch { }

    const fastText = isFastMode ? '\x1b[38;2;87;202;255m\x1b[1m⚡Fast\x1b[0m\x1b[90m' : '⚡Fast';
    const cmdPart = `\x1b[90m[${fastText}/📋Plan/👥Team/💬Grill]\x1b[0m`;
    const accountStr = email ? ` \x1b[90m👤 ${email}\x1b[0m` : '';

    // 組合第一行
    // 例如: [Gemini 3.1 Pro (High)] | ⚡Fast... | 0627 git:(main) 👤 email
    // 💡 標記當前模型，取代舊版的打 API 推測
    const modelStr = `\x1b[38;2;92;219;109m[${modelName}]\x1b[0m`;
    const stateStr = agentState !== 'idle' ? ` \x1b[33m(${agentState})\x1b[0m` : '';
    const line1 = `${modelStr}${stateStr} │ ${cmdPart} │ ${folderName}${gitPart}${accountStr}`;

    // 組合第二行
    const line2 = quotaStrs.length > 0 ? `API: ${quotaStrs.join(' | ')}` : `API: 無可用額度資料`;

    console.log(`${line1}\n${line2}`);

  } catch (err) {
    console.log(`API: Hook 錯誤 (${err.message})`);
  }
}

main();
