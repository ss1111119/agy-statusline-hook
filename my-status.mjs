import { spawn, exec } from 'child_process';
import https from 'https';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// 統一的子進程工廠 (Unified subprocess factory)
// ---------------------------------------------------------------------------

/**
 * 以 spawn 啟動進程並收集 stdout，出錯時回傳空字串。
 * @param {string} cmd
 * @param {string[]} [args=[]]
 * @param {{ shell?: boolean }} [opts={}]
 */
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

/** PowerShell 捷徑 */
const runPowerShell = (script) =>
  spawnProcess('powershell.exe', ['-NoProfile', '-Command', script]);

/** exec (Unix shell 指令) 捷徑 */
function runUnixCmd(cmd) {
  return new Promise((resolve) => {
    const child = exec(cmd, { windowsHide: true, encoding: 'utf8' });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.on('close', () => resolve(stdout));
    child.on('error', () => resolve(''));
  });
}

/** 取得目前 git 分支名稱 */
const getGitBranch = () =>
  spawnProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD']).then((out) => out.trim());

// ---------------------------------------------------------------------------
// 模型標籤解析 (Model label parsing) — 宣告式查找表
// ---------------------------------------------------------------------------

const MODEL_MAP = [
  { match: 'Gemini 3.5 Flash (Medium)', base: 'Flash', suffix: 'M' },
  { match: 'Gemini 3.5 Flash (High)',   base: 'Flash', suffix: 'H' },
  { match: 'Gemini 3.5 Flash (Low)',    base: 'Flash', suffix: 'L' },
  { match: 'Gemini 3.1 Pro (Low)',      base: 'Pro',   suffix: 'L' },
  { match: 'Gemini 3.1 Pro (High)',     base: 'Pro',   suffix: 'H' },
  { match: 'Claude Sonnet',             base: 'Sonnet', suffix: '' },
  { match: 'Claude Opus',               base: 'Opus',   suffix: '' },
  { match: 'GPT-OSS',                   base: 'GPT-OSS', suffix: '' },
];

function parseLabel(label, isCurrent) {
  const mark = isCurrent ? '*' : '';
  const entry = MODEL_MAP.find((e) => label.includes(e.match));
  if (!entry) return { base: mark + label, suffix: '' };
  return entry.suffix
    ? { base: entry.base, suffix: mark + entry.suffix }
    : { base: mark + entry.base, suffix: '' };
}

// ---------------------------------------------------------------------------
// 顏色工具
// ---------------------------------------------------------------------------

function getColorCode(percentage) {
  if (percentage >= 75) return '\x1b[38;2;87;202;255m';  // Sky blue
  if (percentage >= 50) return '\x1b[38;2;92;219;109m';  // Light green
  if (percentage >= 25) return '\x1b[38;2;255;212;39m';  // Yellow
  return '\x1b[38;2;255;125;175m';                        // Red/Pink
}

// ---------------------------------------------------------------------------
// PID 存活檢查 (PID alive check)
// ---------------------------------------------------------------------------

/**
 * 以低成本方式確認 PID 仍在運行。
 * Windows: tasklist；Unix: kill -0
 */
async function isPidAlive(pid) {
  if (!pid) return false;
  try {
    if (process.platform === 'win32') {
      const out = await spawnProcess('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']);
      return out.includes(`"${pid}"`);
    } else {
      // kill -0 只做存在性檢查，不發送實際信號
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 快取 (Cache) — 以 username 隔離，避免多使用者衝突
// ---------------------------------------------------------------------------

const _username = (() => { try { return os.userInfo().username; } catch { return 'default'; } })();
const CACHE_FILE = path.join(os.tmpdir(), `.agy-statusline-cache-${_username}.json`);
const CACHE_TTL_MS = 45000; // 45 seconds

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - raw.ts < CACHE_TTL_MS && raw.pid && raw.ports?.length) {
        return raw;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function saveCache(pid, csrfToken, ports) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ pid, csrfToken, ports, ts: Date.now() }));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 主程式
// ---------------------------------------------------------------------------

async function main() {
  try {
    let pid = null;
    let csrfToken = '';
    const ports = [];

    // --- 嘗試快取，並驗證 PID 仍存活 ---
    const cached = loadCache();
    if (cached && await isPidAlive(cached.pid)) {
      pid = cached.pid;
      csrfToken = cached.csrfToken || '';
      ports.push(...cached.ports);
    }

    if (process.platform === 'win32' && ports.length === 0) {
      const psScript = 'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*--csrf_token=*" -and $_.Name -ne "powershell.exe" -and $_.Name -ne "pwsh.exe" -and $_.Name -ne "node.exe" -and $_.Name -ne "cmd.exe" } | ForEach-Object { $_.ProcessId.ToString() + "::" + $_.CommandLine }';
      const psOutput = await runPowerShell(psScript);
      const lines = psOutput.split(/\r?\n/);
      for (const line of lines) {
        // 以首個 '::' 為分隔符，避免 CommandLine 內含 '::' 被截斷
        const colonIdx = line.indexOf('::');
        if (colonIdx === -1) continue;
        const p = parseInt(line.slice(0, colonIdx).trim(), 10);
        const cmdLine = line.slice(colonIdx + 2);
        const match = cmdLine.match(/--csrf_token=([^\s"']+)/);
        if (p && match) {
          pid = p;
          csrfToken = match[1];
          break;
        }
      }

      if (!pid) {
        const fallbackScript = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "agy.exe" } | ForEach-Object { $_.ProcessId }';
        const fallbackOutput = await runPowerShell(fallbackScript);
        const p = parseInt(fallbackOutput.trim(), 10);
        if (p) pid = p;
      }

      if (pid) {
        const netTcpScript = `Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalPort }`;
        const netTcpOutput = await runPowerShell(netTcpScript);
        for (const line of netTcpOutput.split(/\r?\n/)) {
          const portNum = parseInt(line.trim(), 10);
          if (portNum && !ports.includes(portNum)) ports.push(portNum);
        }
        if (ports.length) saveCache(pid, csrfToken, ports);
      }
    } else if (process.platform !== 'win32' && ports.length === 0) {
      const psOutput = await runUnixCmd('ps auxww');
      const lines = psOutput.split('\n');
      for (const line of lines) {
        if (line.includes('grep') || line.includes('node') || line.includes('ps ') || line.includes('bash') || line.includes('sh ')) {
          continue;
        }
        const match = line.trim().match(/^\s*\S+\s+(\d+)\s+.*--csrf_token=([^\s"']+)/);
        if (match) {
          pid = parseInt(match[1], 10);
          csrfToken = match[2];
          break;
        }
      }

      if (!pid) {
        for (const line of lines) {
          if (line.includes('agy') && !line.includes('grep') && !line.includes('node') && !line.includes('ps ')) {
            const match = line.trim().match(/^\s*\S+\s+(\d+)/);
            if (match) {
              pid = parseInt(match[1], 10);
              break;
            }
          }
        }
      }

      if (pid) {
        const lsofOutput = await runUnixCmd('lsof -nP -a -p ' + pid + ' -iTCP -sTCP:LISTEN');
        const lsofLines = lsofOutput.split('\n');
        for (const line of lsofLines) {
          const match = line.match(/TCP\s+\S+:(\d+)\s+\(LISTEN\)/i);
          if (match) {
            const portNum = parseInt(match[1], 10);
            if (portNum && !ports.includes(portNum)) {
              ports.push(portNum);
            }
          }
        }
      }
    }

    if (ports.length === 0) {
      console.log('API: --');
      return;
    }

    let userStatus = null;
    for (const port of ports) {
      try {
        userStatus = await new Promise((resolve, reject) => {
          const payload = JSON.stringify({ metadata: { ideName: 'antigravity' } });
          const options = {
            hostname: '127.0.0.1',
            port: port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Connect-Protocol-Version': '1',
              'Content-Length': Buffer.byteLength(payload)
            },
            rejectUnauthorized: false
          };

          if (csrfToken) {
            options.headers['X-Codeium-Csrf-Token'] = csrfToken;
          }

          const req = https.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(e);
                }
              } else {
                reject(new Error(`HTTP status ${res.statusCode}`));
              }
            });
          });

          req.on('error', reject);
          req.setTimeout(1500);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });

          req.write(payload);
          req.end();
        });
        if (userStatus) break;
      } catch {
        // Try next port
      }
    }

    if (!userStatus) {
      console.log('API: --');
      return;
    }

    const status = userStatus.userStatus || userStatus;
    const configs = status?.cascadeModelConfigData?.clientModelConfigs || [];
    const defaultModel = status?.cascadeModelConfigData?.defaultOverrideModelConfig?.modelOrAlias?.model;

    // Note: GetUserStatus only reflects global default model, not per-conversation overrides.
    // Active model label is intentionally omitted.

    // Group configs by unique quota (fraction + resetTime)
    const groups = {};
    for (const config of configs) {
      if (config && config.quotaInfo && typeof config.quotaInfo.remainingFraction === 'number') {
        const fraction = config.quotaInfo.remainingFraction;
        const resetTime = config.quotaInfo.resetTime || '';
        const key = `${fraction}_${resetTime}`;
        if (!groups[key]) {
          groups[key] = { fraction, resetTime, configs: [] };
        }
        groups[key].configs.push(config);
      }
    }

    const groupParts = [];
    for (const key in groups) {
      const group = groups[key];

      const parsedModels = group.configs.map((config) => {
        const isCurrent = config.modelOrAlias?.model === defaultModel;
        return {
          isCurrent,
          parsed: parseLabel(config.label || 'Unknown', isCurrent)
        };
      });

      const bases = {};
      let groupHasCurrent = false;
      for (const m of parsedModels) {
        if (m.isCurrent) groupHasCurrent = true;
        const base = m.parsed.base;
        if (!bases[base]) bases[base] = { hasCurrent: false, suffixes: [] };
        if (m.isCurrent) bases[base].hasCurrent = true;
        if (m.parsed.suffix) bases[base].suffixes.push(m.parsed.suffix);
      }

      const baseLabels = [];
      for (const base in bases) {
        const b = bases[base];
        let baseLabel = base;
        if (b.suffixes.length > 0) {
          b.suffixes.sort((x, y) => {
            const xIsCurrent = x.startsWith('*');
            const yIsCurrent = y.startsWith('*');
            if (xIsCurrent && !yIsCurrent) return -1;
            if (!xIsCurrent && yIsCurrent) return 1;
            return x.localeCompare(y);
          });
          baseLabel = `${baseLabel}(${b.suffixes.join('/')})`;
        }
        baseLabels.push(baseLabel);
      }

      baseLabels.sort((x, y) => {
        const xIsCurrent = x.includes('*');
        const yIsCurrent = y.includes('*');
        if (xIsCurrent && !yIsCurrent) return -1;
        if (!xIsCurrent && yIsCurrent) return 1;
        return x.localeCompare(y);
      });

      const groupLabel = baseLabels.join('/');

      // NaN 防護：fraction 若為非法值，強制落在 [0, 100]
      const percentage = Math.min(100, Math.max(0, Math.round((group.fraction ?? 0) * 100)));

      let resetStr = '';
      if (group.resetTime && group.fraction < 1) {
        const diffMs = new Date(group.resetTime).getTime() - Date.now();
        if (!isNaN(diffMs)) {
          if (diffMs <= 0) {
            resetStr = '現在';
          } else {
            const diffMinutes = Math.floor(diffMs / 1000 / 60);
            const hours = Math.floor(diffMinutes / 60);
            const mins = diffMinutes % 60;
            resetStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          }
        }
      }

      // Generate progress bar (10 characters total)
      const filled = Math.round(percentage / 10);
      const empty = 10 - filled;
      const filledBar = '█'.repeat(filled);
      const emptyBar = '░'.repeat(empty);

      // Color coding
      const color = getColorCode(percentage);

      // Build group status string with visual bar
      let groupStatus = `${groupLabel} ${color}${filledBar}\x1b[90m${emptyBar}${color} ${percentage}%`;
      if (resetStr) groupStatus += ` (⏰ ${resetStr})`;

      groupParts.push({
        status: `${color}${groupStatus}\x1b[0m`,
        hasCurrent: groupHasCurrent
      });
    }

    groupParts.sort((x, y) => {
      if (x.hasCurrent && !y.hasCurrent) return -1;
      if (!x.hasCurrent && y.hasCurrent) return 1;
      return 0;
    });

    const finalParts = groupParts.map((g) => g.status);

    // Get account info (email or name)
    const email = status.email || status.name || '';
    const accountStr = email ? ` \x1b[90m👤 ${email}\x1b[0m` : '';

    // Fetch folder and git info
    const folderName = path.basename(process.cwd());
    const gitBranch = await getGitBranch();

    // Read settings.json to detect fast mode
    let isFastMode = false;
    try {
      const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.runningLightSpeed === 'off' || settings.runningLightSpeed === 'fast') {
          isFastMode = true;
        }
      }
    } catch {
      // ignore
    }

    const fastText = isFastMode ? '\x1b[38;2;87;202;255m\x1b[1m⚡Fast\x1b[0m\x1b[90m' : '⚡Fast';
    const cmdPart = `\x1b[90m[${fastText}/📋Plan/👥Team/💬Grill]\x1b[0m `;
    const gitPart = gitBranch ? ` git:(${gitBranch})` : '';

    // Line 1: [⚡Fast/📋Plan/👥Team/💬Grill] │ folder git:(branch) 👤 email
    const line1 = `│ ${cmdPart}│ ${folderName}${gitPart}${accountStr}`;

    if (finalParts.length > 0) {
      console.log(`${line1}\nAPI: ` + finalParts.join(' | '));
    } else {
      console.log(`${line1}\nAPI: --`);
    }
  } catch {
    console.log('API: --');
  }
}

main();
