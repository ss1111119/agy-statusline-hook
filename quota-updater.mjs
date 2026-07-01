import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';

function getPortsWindows(ppid) {
  return new Promise((resolve) => {
    // Prioritize the agy process instance in our process tree (ppid or its parent).
    // This prevents showing stale/wrong quota information from other concurrent agy sessions.
    const query =
      `$targetPids = @(${ppid}); ` +
      `$parent = (Get-CimInstance Win32_Process -Filter 'ProcessId = ${ppid}' -ErrorAction SilentlyContinue).ParentProcessId; ` +
      `if ($parent) { $targetPids += $parent }; ` +
      `$agypids = (Get-Process -Name agy -ErrorAction SilentlyContinue | Where-Object { $_.Id -in $targetPids } | Select-Object -ExpandProperty Id); ` +
      `if (-not $agypids) { $agypids = (Get-Process -Name agy -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) }; ` +
      `if ($agypids) { ` +
      `  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $agypids } | Select-Object -ExpandProperty LocalPort -Unique ` +
      `}`;
    
    exec(`powershell.exe -NoProfile -Command "${query}"`, { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const ports = stdout.split(/\r?\n/).map(p => parseInt(p.trim())).filter(p => !isNaN(p));
      resolve(ports);
    });
  });
}

function getPortsUnix(ppid) {
  return new Promise((resolve) => {
    // Prioritize the agy process instance in our process tree (ppid or its parent)
    // to prevent showing stale/wrong quota information from other concurrent agy sessions.
    const cmd = `candidates="${ppid}"; ` +
      `parent=$(ps -o ppid= -p ${ppid} 2>/dev/null | tr -d ' '); ` +
      `if [ -n "$parent" ]; then candidates="$candidates,$parent"; fi; ` +
      `matched_pids=""; ` +
      `for pid in $(echo "$candidates" | tr ',' ' '); do ` +
      `  if ps -p "$pid" -o comm= 2>/dev/null | grep -q "agy"; then ` +
      `    matched_pids="$matched_pids,$pid"; ` +
      `  fi; ` +
      `done; ` +
      `matched_pids=$(echo "$matched_pids" | sed 's/^,//;s/,$//'); ` +
      `if [ -z "$matched_pids" ]; then ` +
      `  matched_pids=$(pgrep -f "agy" 2>/dev/null | tr '\\n' ',' | sed 's/,$//'); ` +
      `fi; ` +
      `if [ -n "$matched_pids" ]; then ` +
      `  lsof -nP -a -p "$matched_pids" -iTCP -sTCP:LISTEN; ` +
      `fi`;

    exec(cmd, (err, stdout) => {
      if (!err && stdout) {
        const ports = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          const match = line.match(/:(\d+)\s+\(LISTEN\)/);
          if (match) {
            ports.push(parseInt(match[1]));
          }
        }
        if (ports.length > 0) return resolve(ports);
      }
      
      // Fallback to netstat with prioritized candidate PIDs
      const fallbackCmd = `candidates="${ppid}"; ` +
        `parent=$(ps -o ppid= -p ${ppid} 2>/dev/null | tr -d ' '); ` +
        `if [ -n "$parent" ]; then candidates="$candidates|$parent"; fi; ` +
        `matched_pids=""; ` +
        `for pid in $(echo "$candidates" | tr '|' ' '); do ` +
        `  if ps -p "$pid" -o comm= 2>/dev/null | grep -q "agy"; then ` +
        `    matched_pids="$matched_pids|$pid"; ` +
        `  fi; ` +
        `done; ` +
        `matched_pids=$(echo "$matched_pids" | sed 's/^|//;s/|$//'); ` +
        `if [ -z "$matched_pids" ]; then ` +
        `  matched_pids=$(pgrep -f "agy" 2>/dev/null | tr '\\n' '|' | sed 's/|$//'); ` +
        `fi; ` +
        `if [ -n "$matched_pids" ]; then ` +
        `  netstat -anp 2>/dev/null | grep -E "$matched_pids"; ` +
        `fi`;

      exec(fallbackCmd, (err2, stdout2) => {
        if (err2 || !stdout2) return resolve([]);
        const ports = [];
        const lines = stdout2.split('\n');
        for (const line of lines) {
          if (line.includes('LISTEN')) {
            const match = line.match(/:(\d+)\s+/);
            if (match) {
              ports.push(parseInt(match[1]));
            }
          }
        }
        resolve(ports);
      });
    });
  });
}

function getPorts(ppid) {
  if (process.platform === 'win32') {
    return getPortsWindows(ppid);
  }
  return getPortsUnix(ppid);
}

function makeRequest(port, useHttps) {
  return new Promise((resolve, reject) => {
    const lib = useHttps ? https : http;
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1'
      },
      timeout: 1500
    };
    if (useHttps) {
      options.agent = new https.Agent({ rejectUnauthorized: false });
    }

    const req = lib.request(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Status code: ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write('{}');
    req.end();
  });
}

async function tryFetchQuota(ports) {
  for (const port of ports) {
    // Try HTTP first
    try {
      const res = await makeRequest(port, false);
      if (res) return res;
    } catch (e) {
      // Ignore and try HTTPS
    }
    // Try HTTPS
    try {
      const res = await makeRequest(port, true);
      if (res) return res;
    } catch (e) {
      // Ignore
    }
  }
  throw new Error('All ports failed');
}

function mapQuotaResponse(rawResponse) {
  const quota = {};
  const groups = rawResponse?.response?.groups || [];
  for (const group of groups) {
    const buckets = group.buckets || [];
    for (const bucket of buckets) {
      const id = bucket.bucketId;
      if (!id) continue;
      const frac = bucket.remainingFraction;
      const resetTime = bucket.resetTime;
      
      let resetInSeconds = 0;
      if (resetTime) {
        try {
          const diffMs = new Date(resetTime) - new Date();
          resetInSeconds = Math.max(0, Math.floor(diffMs / 1000));
        } catch {}
      }

      quota[id] = {
        remaining_fraction: frac,
        reset_time: resetTime,
        reset_in_seconds: resetInSeconds
      };
    }
  }
  return quota;
}

async function main() {
  const ppid = process.argv[2];
  const sessionId = process.argv[3] || '';
  const homeDir = os.homedir();
  const logFile = path.join(homeDir, '.gemini', 'antigravity-cli', 'quota-updater-error.log');

  if (!ppid) {
    try {
      fs.writeFileSync(logFile, `${new Date().toISOString()}: Error - No PPID argument provided\n`, { flag: 'a' });
    } catch {}
    process.exit(1);
  }

  try {
    let ports = [];
    let retries = 5;
    
    while (retries > 0) {
      try {
        ports = await getPorts(ppid);
        if (ports && ports.length > 0) {
          break;
        }
      } catch (e) {
        // Ignore and retry
      }
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!ports || ports.length === 0) {
      try {
        fs.writeFileSync(logFile, `${new Date().toISOString()}: Error - No ports found for PPID ${ppid} after retries\n`, { flag: 'a' });
      } catch {}
      process.exit(1);
    }

    let rawResponse = null;
    let fetchRetries = 3;
    while (fetchRetries > 0) {
      try {
        rawResponse = await tryFetchQuota(ports);
        if (rawResponse) break;
      } catch (e) {
        fetchRetries--;
        if (fetchRetries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw e;
        }
      }
    }

    const mappedQuota = mapQuotaResponse(rawResponse);

    if (Object.keys(mappedQuota).length > 0) {
      const cacheFile = path.join(homeDir, '.gemini', 'antigravity-cli', 'quota-cache.json');
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      // 把 session_id 和 ppid 也存入 cache，供下次 render 偵測新 session
      const cacheData = { ...mappedQuota, _session_id: sessionId, _ppid: parseInt(ppid) };
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } else {
      try {
        fs.writeFileSync(logFile, `${new Date().toISOString()}: Error - Empty mapped quota for ports ${ports.join(', ')}\n`, { flag: 'a' });
      } catch {}
    }
  } catch (err) {
    try {
      fs.writeFileSync(logFile, `${new Date().toISOString()}: Exception - ${err.message}\n${err.stack}\n`, { flag: 'a' });
    } catch {}
    process.exit(1);
  }
}

main();
