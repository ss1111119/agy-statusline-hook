import { execFile } from 'child_process';

/**
 * Safely executes git status --porcelain -b.
 * If git is not installed or current path is not a git repo, returns success: false.
 */
function runGitStatus() {
  return new Promise((resolve) => {
    // execFile avoids spawning a shell, providing better performance and security
    execFile(
      'git',
      ['status', '--porcelain', '-b'],
      { windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          // Captures git not installed (ENOENT) and non-git directories (exit code 128)
          resolve({ success: false, stdout: '' });
        } else {
          resolve({ success: true, stdout });
        }
      }
    );
  });
}

/**
 * Parses the stdout from git status --porcelain -b.
 * @param {string} stdout 
 * @returns {{isGit: boolean, branch: string, isDirty: boolean}}
 */
export function parseGitStatus(stdout) {
  if (!stdout) {
    return { isGit: false, branch: '', isDirty: false };
  }

  // Split and sanitize lines
  const lines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { isGit: false, branch: '', isDirty: false };
  }

  // Line 1 is always the branch header
  const header = lines[0];
  let branch = '';

  if (header.startsWith('##')) {
    const branchPart = header.slice(2).trim();
    
    if (branchPart.includes('...')) {
      branch = branchPart.split('...')[0];
    } else if (branchPart.startsWith('No commits yet on')) {
      branch = branchPart.replace('No commits yet on', '').trim();
    } else if (branchPart.startsWith('Initial commit on')) {
      branch = branchPart.replace('Initial commit on', '').trim();
    } else if (branchPart.includes('(')) {
      // Handles detached HEAD "HEAD (no branch)"
      branch = branchPart.split(' ')[0];
    } else {
      branch = branchPart;
    }
  }

  // Any output lines after the header indicate modified or untracked changes
  const isDirty = lines.length > 1;

  return {
    isGit: true,
    branch,
    isDirty
  };
}

/**
 * Returns branch name and dirty/clean status. Safe from crashes.
 */
export async function getGitInfo() {
  const result = await runGitStatus();
  if (!result.success) {
    return { isGit: false, branch: '', isDirty: false };
  }
  return parseGitStatus(result.stdout);
}
