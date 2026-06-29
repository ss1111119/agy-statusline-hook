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
export async function readSettings() {
  let isFastMode = false;
  try {
    const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.runningLightSpeed === 'off' || settings.runningLightSpeed === 'fast') {
      isFastMode = true;
    }
  } catch {
    // Graceful fallback if settings.json doesn't exist or is invalid
  }
  return isFastMode;
}
