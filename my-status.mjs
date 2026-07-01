import { readInputData, readSettings } from './input.mjs';
import { getGitInfo } from './git.mjs';
import { renderStatus } from './renderer.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    // 1. Gather input telemetry
    const data = await readInputData();
    if (!data) {
      console.log('API: 尚未就緒 (等待 stdin)');
      return;
    }

    // Check if data already contains a valid quota from the backend (newer agy CLI version)
    const hasIncomingQuota = data.quota && 
      (data.quota['gemini-5h']?.remaining_fraction != null || 
       data.quota['3p-5h']?.remaining_fraction != null);

    let cachedQuota = null;
    let shouldUpdate = !hasIncomingQuota;

    if (!hasIncomingQuota) {
      // 1.1 Read cached quota if available
      const homeDir = os.homedir();
      const cacheFile = path.join(homeDir, '.gemini', 'antigravity-cli', 'quota-cache.json');
      const currentSessionId = data?.session_id || '';
      const currentPpid = process.ppid;

      try {
        if (fs.existsSync(cacheFile)) {
          const stats = fs.statSync(cacheFile);
          const ageInSeconds = (Date.now() - stats.mtimeMs) / 1000;
          const content = fs.readFileSync(cacheFile, 'utf8');
          cachedQuota = JSON.parse(content);

          // 新 session 進入時，強制刷新（不受 60 秒 TTL 限制）
          const lastSessionId = cachedQuota?._session_id || '';
          const lastPpid = cachedQuota?._ppid || 0;

          let isNewSession = false;
          if (currentSessionId && lastSessionId && currentSessionId !== lastSessionId) {
            isNewSession = true;
          } else if (currentPpid && lastPpid && currentPpid !== lastPpid) {
            isNewSession = true;
          } else if (!lastSessionId && !lastPpid) {
            isNewSession = true;
          }

          if (!isNewSession && ageInSeconds < 60) {
            shouldUpdate = false;
          }
        }
      } catch (e) {
        // Ignore reading errors
      }

      if (cachedQuota && data) {
        // 不把內部欄位 _session_id 和 _ppid 傳進去污染 quota 資料
        const { _session_id, _ppid, ...quotaOnly } = cachedQuota;
        data.quota = quotaOnly;
      }
    }

    if (shouldUpdate && data) {
      const updaterPath = path.join(__dirname, 'quota-updater.mjs');
      const ppid = process.ppid;
      const sessionId = data.session_id || '';
      const homeDir = os.homedir();
      const cacheFile = path.join(homeDir, '.gemini', 'antigravity-cli', 'quota-cache.json');

      // Immediately write the new session_id and ppid to cache to act as a lock and prevent concurrent spawns
      try {
        let cacheData = {};
        if (fs.existsSync(cacheFile)) {
          try {
            cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          } catch {}
        }
        cacheData._session_id = sessionId;
        cacheData._ppid = ppid;
        fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
      } catch (e) {
        // Ignore lock errors
      }

      const child = spawn(process.execPath, [updaterPath, ppid, sessionId], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }
    
    // 2. Fetch Git status & Settings (in parallel for low latency)
    const [gitInfo, isFastMode] = await Promise.all([
      getGitInfo(),
      readSettings(data?.workspace?.project_dir || data?.cwd)
    ]);

    // 3. Render
    renderStatus(data, gitInfo, isFastMode);

  } catch (err) {
    console.log(`API: Hook 錯誤 (${err.message})`);
  }
}

main();
