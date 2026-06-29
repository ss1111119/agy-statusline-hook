import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Reads and parses JSON from stdin.
 * @returns {Promise<Object|null>}
 */
export async function readInputData() {
  let inputJson = '';
  for await (const chunk of process.stdin) {
    inputJson += chunk;
  }
  if (!inputJson || inputJson.trim().length === 0) {
    return null;
  }
  return JSON.parse(inputJson);
}

/**
 * Reads the AGY settings file to check for lightspeed status.
 * @returns {Promise<boolean>} Resolves to true if fast mode is enabled, false otherwise.
 */
export async function readSettings(projectDir = process.cwd()) {
  let isFastMode = false;
  try {
    const homeDir = os.homedir();
    const cliPath = path.join(homeDir, '.gemini', 'antigravity-cli', 'settings.json');
    const projectPath = projectDir ? path.join(projectDir, '.gemini', 'settings.json') : null;
    const globalPath = path.join(homeDir, '.gemini', 'settings.json');

    let runningLightSpeed = undefined;

    const getLightSpeed = (p) => {
      try {
        if (p && fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const settings = JSON.parse(content.replace(/^\uFEFF/, '')); // strip UTF-8 BOM if present
          return settings.runningLightSpeed;
        }
      } catch {}
      return undefined;
    };

    runningLightSpeed = getLightSpeed(cliPath);
    if (runningLightSpeed === undefined && projectPath) {
      runningLightSpeed = getLightSpeed(projectPath);
    }
    if (runningLightSpeed === undefined) {
      runningLightSpeed = getLightSpeed(globalPath);
    }

    if (runningLightSpeed === 'off' || runningLightSpeed === 'fast') {
      isFastMode = true;
    }
  } catch {
    // Graceful fallback if settings.json doesn't exist or is invalid
  }
  return isFastMode;
}
