import { readInputData, readSettings } from './input.mjs';
import { getGitInfo } from './git.mjs';
import { renderStatus } from './renderer.mjs';

async function main() {
  try {
    // 1. Gather input telemetry
    const data = await readInputData();
    if (!data) {
      console.log('API: 尚未就緒 (等待 stdin)');
      return;
    }

    // 2. Fetch Git status & Settings (in parallel for low latency)
    const [gitInfo, isFastMode] = await Promise.all([
      getGitInfo(),
      readSettings()
    ]);

    // 3. Render
    renderStatus(data, gitInfo, isFastMode);

  } catch (err) {
    console.log(`API: Hook 錯誤 (${err.message})`);
  }
}

main();
