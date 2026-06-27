import { spawn, exec } from 'child_process';
import https from 'https';
import os from 'os';
import path from 'path';

function runPowerShell(script) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      encoding: 'utf8'
    });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.on('close', () => resolve(stdout));
    child.on('error', () => resolve(''));
  });
}

function runSpawn(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      encoding: 'utf8'
    });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.on('close', () => resolve(stdout));
    child.on('error', () => resolve(''));
  });
}

function runUnixCmd(cmd) {
  return new Promise((resolve) => {
    const child = exec(cmd, {
      windowsHide: true,
      encoding: 'utf8'
    });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
    }
    child.on('close', () => resolve(stdout));
    child.on('error', () => resolve(''));
  });
}

function getGitBranch() {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      windowsHide: true,
      encoding: 'utf8'
    });
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', chunk => stdout += chunk);
    }
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else resolve('');
    });
    child.on('error', () => resolve(''));
  });
}

function shortenLabel(label) {
  if (label.includes('Gemini 3.5 Flash (Medium)')) return 'Flash(M)';
  if (label.includes('Gemini 3.5 Flash (High)')) return 'Flash(H)';
  if (label.includes('Gemini 3.5 Flash (Low)')) return 'Flash(L)';
  if (label.includes('Gemini 3.1 Pro (Low)')) return 'Pro(L)';
  if (label.includes('Gemini 3.1 Pro (High)')) return 'Pro(H)';
  if (label.includes('Claude Sonnet')) return 'Sonnet';
  if (label.includes('Claude Opus')) return 'Opus';
  if (label.includes('GPT-OSS')) return 'GPT-OSS';
  return label;
}

function parseLabel(label, isCurrent) {
  const mark = isCurrent ? '*' : '';
  if (label.includes('Gemini 3.5 Flash (Medium)')) return { base: 'Flash', suffix: mark + 'M' };
  if (label.includes('Gemini 3.5 Flash (High)')) return { base: 'Flash', suffix: mark + 'H' };
  if (label.includes('Gemini 3.5 Flash (Low)')) return { base: 'Flash', suffix: mark + 'L' };
  if (label.includes('Gemini 3.1 Pro (Low)')) return { base: 'Pro', suffix: mark + 'L' };
  if (label.includes('Gemini 3.1 Pro (High)')) return { base: 'Pro', suffix: mark + 'H' };
  if (label.includes('Claude Sonnet')) return { base: mark + 'Sonnet', suffix: '' };
  if (label.includes('Claude Opus')) return { base: mark + 'Opus', suffix: '' };
  if (label.includes('GPT-OSS')) return { base: mark + 'GPT-OSS', suffix: '' };
  return { base: mark + label, suffix: '' };
}

function formatActiveModel(label) {
  let cleaned = label.replace(/\s*\(.*\)/g, '').trim();
  cleaned = cleaned.replace(/Gemini\s+([\d.]+)\s+(\w+)/g, '$2 $1');
  cleaned = cleaned.replace(/Claude\s+/g, '');
  return cleaned;
}

function getColorCode(percentage) {
  if (percentage >= 75) {
    return '\x1b[38;2;87;202;255m'; // Sky blue
  } else if (percentage >= 50) {
    return '\x1b[38;2;92;219;109m';  // Light green
  } else if (percentage >= 25) {
    return '\x1b[38;2;255;212;39m';  // Yellow
  } else {
    return '\x1b[38;2;255;125;175m'; // Red/Pink
  }
}

async function main() {
  try {
    let pid = null;
    let csrfToken = '';
    const ports = [];

    if (process.platform === 'win32') {
      const psScript = 'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*--csrf_token=*" -and $_.Name -ne "powershell.exe" -and $_.Name -ne "pwsh.exe" -and $_.Name -ne "node.exe" -and $_.Name -ne "cmd.exe" } | ForEach-Object { $_.ProcessId.ToString() + "::" + $_.CommandLine }';
      const psOutput = await runPowerShell(psScript);
      const lines = psOutput.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('::');
        if (parts.length >= 2) {
          const p = parseInt(parts[0].trim(), 10);
          const cmdLine = parts[1];
          const match = cmdLine.match(/--csrf_token=([^\s"']+)/);
          if (p && match) {
            pid = p;
            csrfToken = match[1];
            break;
          }
        }
      }

      if (!pid) {
        const fallbackScript = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "agy.exe" } | ForEach-Object { $_.ProcessId }';
        const fallbackOutput = await runPowerShell(fallbackScript);
        const p = parseInt(fallbackOutput.trim(), 10);
        if (p) {
          pid = p;
        }
      }

      if (pid) {
        const netstatOutput = await runSpawn('netstat.exe', ['-ano']);
        const nsLines = netstatOutput.split(/\r?\n/);
        for (const line of nsLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5 && parts[0].toUpperCase() === 'TCP' && parts[3].toUpperCase() === 'LISTENING' && parts[4] === String(pid)) {
            const addressPort = parts[1];
            const lastColonIdx = addressPort.lastIndexOf(':');
            if (lastColonIdx !== -1) {
              const portNum = parseInt(addressPort.substring(lastColonIdx + 1), 10);
              if (portNum && !ports.includes(portNum)) {
                ports.push(portNum);
              }
            }
          }
        }
      }
    } else {
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
        const lsofOutput = await runUnixCmd("lsof -nP -a -p " + pid + " -iTCP -sTCP:LISTEN");
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
            res.on('data', chunk => data += chunk);
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
          req.setTimeout(2000);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
          });

          req.write(payload);
          req.end();
        });
        if (userStatus) break;
      } catch (e) {
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

    // Get active model details
    let activeModelLabel = '';
    for (const config of configs) {
      if (config && config.modelOrAlias?.model === defaultModel) {
        activeModelLabel = formatActiveModel(config.label || '');
        break;
      }
    }

    // Group configs by unique quota (fraction + resetTime)
    const groups = {};
    for (const config of configs) {
      if (config && config.quotaInfo && typeof config.quotaInfo.remainingFraction === 'number') {
        const fraction = config.quotaInfo.remainingFraction;
        const resetTime = config.quotaInfo.resetTime || '';
        const key = `${fraction}_${resetTime}`;
        if (!groups[key]) {
          groups[key] = {
            fraction,
            resetTime,
            configs: []
          };
        }
        groups[key].configs.push(config);
      }
    }

    const groupParts = [];
    for (const key in groups) {
      const group = groups[key];
      
      const parsedModels = group.configs.map(config => {
        const isCurrent = config.modelOrAlias?.model === defaultModel;
        return {
          isCurrent,
          parsed: parseLabel(config.label || 'Unknown', isCurrent)
        };
      });

      const bases = {};
      let groupHasCurrent = false;
      for (const m of parsedModels) {
        if (m.isCurrent) {
          groupHasCurrent = true;
        }
        const base = m.parsed.base;
        if (!bases[base]) {
          bases[base] = {
            hasCurrent: false,
            suffixes: []
          };
        }
        if (m.isCurrent) {
          bases[base].hasCurrent = true;
        }
        if (m.parsed.suffix) {
          bases[base].suffixes.push(m.parsed.suffix);
        }
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
          
          const suffixStr = b.suffixes.join('/');
          baseLabel = `${baseLabel}(${suffixStr})`;
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
      const percentage = Math.round(group.fraction * 100);
      
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
            if (hours > 0) {
              resetStr = `${hours}h ${mins}m`;
            } else {
              resetStr = `${mins}m`;
            }
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
      if (resetStr) {
        groupStatus += ` (⏰ ${resetStr})`;
      }

      const coloredStatus = `${color}${groupStatus}\x1b[0m`;

      groupParts.push({
        status: coloredStatus,
        hasCurrent: groupHasCurrent
      });
    }

    groupParts.sort((x, y) => {
      if (x.hasCurrent && !y.hasCurrent) return -1;
      if (!x.hasCurrent && y.hasCurrent) return 1;
      return 0;
    });

    const finalParts = groupParts.map(g => g.status);
    
    // Get account info (email or name)
    const email = status.email || status.name || '';
    const accountStr = email ? ` \x1b[90m👤 ${email}\x1b[0m` : '';

    // Fetch folder and git info
    const folderName = path.basename(process.cwd());
    const gitBranch = await getGitBranch();
    const activeModelPart = activeModelLabel ? `[${activeModelLabel}] ` : '';
    const gitPart = gitBranch ? ` git:(${gitBranch})` : '';
    
    // Line 1: [Model] │ folder git:(branch) 👤 email
    const line1 = `${activeModelPart}│ ${folderName}${gitPart}${accountStr}`;

    if (finalParts.length > 0) {
      console.log(`${line1}\nAPI: ` + finalParts.join(' | '));
    } else {
      console.log(`${line1}\nAPI: --`);
    }
  } catch (err) {
    console.log('API: --');
  }
}

main();
