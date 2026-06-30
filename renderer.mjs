import path from 'path';

// --- UI Styling Helpers ---

function getColorCode(percentage) {
  if (percentage >= 75) return '\x1b[38;2;87;202;255m';  // Sky blue
  if (percentage >= 50) return '\x1b[38;2;92;219;109m';  // Light green
  if (percentage >= 25) return '\x1b[38;2;255;212;39m';  // Yellow
  return '\x1b[38;2;255;125;175m';                        // Red/Pink
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '現在';
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) {
    return `${hours}h`;
  }
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
}

function renderProgressBar(percentage, width = 10) {
  const p = Math.min(100, Math.max(0, Math.round(percentage)));
  const filled = Math.round((p * width) / 100);
  const empty = width - filled;
  const color = getColorCode(p);
  if (width === 0) {
    return `${color}${p}%\x1b[0m`;
  }
  return `${color}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}${color} ${p}%\x1b[0m`;
}

function formatTokens(num) {
  if (num == null) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function formatTurnTokens(inTokens, outTokens) {
  const inStr = `+${formatTokens(inTokens)}`;
  const outStr = `-${formatTokens(outTokens)}`;
  
  // Decide input color
  let inColor = '\x1b[90m'; // Grey
  if (inTokens >= 50000) {
    inColor = '\x1b[38;2;255;125;175m\x1b[1m'; // Bold Pink/Red
  } else if (inTokens >= 20000) {
    inColor = '\x1b[38;2;255;212;39m\x1b[1m'; // Bold Yellow
  }
  
  // Decide output color
  let outColor = '\x1b[90m'; // Grey
  if (outTokens >= 10000) {
    outColor = '\x1b[38;2;255;125;175m\x1b[1m'; // Bold Pink/Red
  } else if (outTokens >= 4000) {
    outColor = '\x1b[38;2;255;212;39m\x1b[1m'; // Bold Yellow
  }

  return `\x1b[90mTurn: \x1b[0m${inColor}${inStr}\x1b[0m\x1b[90m/\x1b[0m${outColor}${outStr}\x1b[0m`;
}

function maskEmail(str) {
  if (!str) return '';
  const [local, domain] = str.split('@');
  if (!domain) return str;
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : local + '***';
  const maskedDomain = domain.length > 2 ? domain.slice(0, 2) + '***' : domain;
  return `${maskedLocal}@${maskedDomain}`;
}

// --- Main Layout Generator ---

export function renderStatus(data, gitInfo, isFastMode) {
  // 1. Model & General Info
  const modelName = data.model?.display_name || '未知模型';
  const isGemini = modelName.toLowerCase().includes('gemini') || 
                  modelName.toLowerCase().includes('flash') || 
                  modelName.toLowerCase().includes('pro');
  const agentState = data.agent_state || 'idle';
  const email = data.email || '';

  // 2. Context Window & Turn Tokens
  const ctxTotal = data.context_window?.context_window_size || 0;
  const ctxUsed = (data.context_window?.total_input_tokens || 0) + 
                  (data.context_window?.total_output_tokens || 0);
  const ctxRemainPct = data.context_window?.remaining_percentage != null ? 
                       data.context_window.remaining_percentage : 100;
  const turnIn = data.context_window?.current_usage?.input_tokens || 0;
  const turnOut = data.context_window?.current_usage?.output_tokens || 0;

  // 3. Background Telemetry
  const subagentsCount = Array.isArray(data.subagents) ? data.subagents.filter(s => {
    if (typeof s === 'object' && s.status) {
      return s.status !== 'completed' && s.status !== 'stopped' && s.status !== 'error';
    }
    return true;
  }).length : 0;
  const tasksCount = data.task_count || 0;
  const isSandboxOn = data.sandbox?.enabled !== false;
  const isNetOn = data.sandbox?.allow_network === true;

  // Terminal width adaptation
  const termWidth = data.terminal_width || process.stdout.columns || process.stderr.columns || 100;
  const hideCountdown = termWidth < 80;
  const progressBarWidth = termWidth < 70 ? 0 : (termWidth < 95 ? 3 : 5);

  // 4. API Quotas formatting
  const quotas = data.quota || {};
  let activeQuotas = [];
  if (isGemini) {
    if (quotas['gemini-5h']?.remaining_fraction != null) {
      activeQuotas.push({ label: 'Gemini (5h)', fraction: quotas['gemini-5h'].remaining_fraction, reset: quotas['gemini-5h'].reset_in_seconds });
    }
    if (quotas['gemini-weekly']?.remaining_fraction != null && termWidth >= 85) {
      activeQuotas.push({ label: 'Gemini (Week)', fraction: quotas['gemini-weekly'].remaining_fraction, reset: quotas['gemini-weekly'].reset_in_seconds });
    }
  } else {
    if (quotas['3p-5h']?.remaining_fraction != null) {
      activeQuotas.push({ label: '3rd-Party (5h)', fraction: quotas['3p-5h'].remaining_fraction, reset: quotas['3p-5h'].reset_in_seconds });
    }
    if (quotas['3p-weekly']?.remaining_fraction != null && termWidth >= 85) {
      activeQuotas.push({ label: '3rd-Party (Week)', fraction: quotas['3p-weekly'].remaining_fraction, reset: quotas['3p-weekly'].reset_in_seconds });
    }
  }

  const quotaStrs = activeQuotas.map(q => {
    const p = q.fraction * 100;
    let str = `${q.label} ${renderProgressBar(p, progressBarWidth)}`;
    if (q.reset > 0 && !hideCountdown) str += ` \x1b[90m(⏰${formatCountdown(q.reset)})\x1b[0m`;
    return str;
  });

  // --- Rendering Line 1 (with Responsive Truncation) ---
  const modelColor = isGemini ? '\x1b[38;2;87;202;255m' : '\x1b[38;2;255;125;175m';
  const modelStr = `${modelColor}[${modelName}]\x1b[0m`;
  const stateStr = agentState !== 'idle' ? ` \x1b[33m(${agentState})\x1b[0m` : '';
  
  // Highlight icons based on status
  const fastText = isFastMode ? '\x1b[38;2;87;202;255m\x1b[1m⚡Fast\x1b[0m\x1b[90m' : '⚡Fast';
  const planText = tasksCount > 0 ? '\x1b[38;2;87;202;255m\x1b[1m📋Plan\x1b[0m\x1b[90m' : '📋Plan';
  const teamText = subagentsCount > 0 ? '\x1b[38;2;87;202;255m\x1b[1m👥Team\x1b[0m\x1b[90m' : '👥Team';
  
  const isGrillActive = !!data.tool_confirmation_pending || 
                        (data.pending_input_count > 0) || 
                        (data.pending_input > 0) || 
                        (data.pending_inputs > 0);
  const grillText = isGrillActive ? '\x1b[38;2;87;202;255m\x1b[1m💬Grill\x1b[0m\x1b[90m' : '💬Grill';

  const cmdPart = `\x1b[90m[${fastText}/${planText}/${teamText}/${grillText}]\x1b[0m`;
  
  const folderName = path.basename(process.cwd());

  // Truncation calculations for workspace info
  const modelPlain = `[${modelName}]` + (agentState !== 'idle' ? ` (${agentState})` : '');
  const cmdPlain = `[⚡Fast/📋Plan/👥Team/💬Grill]`;
  const baseLen = modelPlain.length + 3 + cmdPlain.length + 3; // accounting for " │ " dividers
  
  let availWidth = termWidth - baseLen;
  if (availWidth < 15) availWidth = 15;

  let emailPart = email ? `👤 ${maskEmail(email)}` : '';
  let branchPart = gitInfo.isGit ? `git:(${gitInfo.branch}${gitInfo.isDirty ? '*' : ''})` : '';
  let folderPart = folderName;

  let combinedLen = folderPart.length + (branchPart ? 1 + branchPart.length : 0) + (emailPart ? 1 + emailPart.length : 0);
  
  if (combinedLen > availWidth && emailPart) {
    emailPart = `👤 ${email.split('@')[0]}`; // try username only
    combinedLen = folderPart.length + (branchPart ? 1 + branchPart.length : 0) + 1 + emailPart.length;
    if (combinedLen > availWidth) {
      emailPart = ''; // hide email
      combinedLen = folderPart.length + (branchPart ? 1 + branchPart.length : 0);
    }
  }

  if (combinedLen > availWidth && branchPart) {
    let branchName = gitInfo.branch;
    const maxBranchNameLen = Math.max(5, availWidth - folderPart.length - 7);
    if (branchName.length > maxBranchNameLen) {
      branchName = branchName.slice(0, maxBranchNameLen - 2) + '..';
    }
    branchPart = `git:(${branchName}${gitInfo.isDirty ? '*' : ''})`;
    combinedLen = folderPart.length + 1 + branchPart.length;
  }

  if (combinedLen > availWidth) {
    const maxFolderLen = Math.max(5, availWidth - (branchPart ? 1 + branchPart.length : 0));
    if (folderPart.length > maxFolderLen) {
      folderPart = folderPart.slice(0, maxFolderLen - 2) + '..';
    }
  }

  // Construct styled workspace components
  const gitColor = gitInfo.isDirty ? '\x1b[33m' : '\x1b[32m';
  const dirtyMarker = gitInfo.isDirty ? '*' : '';
  let branchPartStyled = '';
  if (gitInfo.isGit) {
    let branchName = gitInfo.branch;
    const maxBranchNameLen = Math.max(5, availWidth - folderPart.length - 7);
    if (branchName.length > maxBranchNameLen) {
      branchName = branchName.slice(0, maxBranchNameLen - 2) + '..';
    }
    branchPartStyled = ` \x1b[90mgit:(${gitColor}${branchName}${dirtyMarker}\x1b[90m)\x1b[0m`;
  }

  const emailPartStyled = emailPart ? ` \x1b[90m${emailPart}\x1b[0m` : '';

  const line1 = `${modelStr}${stateStr} │ ${cmdPart} │ ${folderPart}${branchPartStyled}${emailPartStyled}`;

  const showTurn = termWidth >= 95;
  let ctxStr = '';
  if (termWidth < 75) {
    ctxStr = `CTX: ${formatTokens(ctxUsed)}`;
  } else if (termWidth < 95) {
    ctxStr = `CTX: ${formatTokens(ctxUsed)}/${formatTokens(ctxTotal)}`;
  } else {
    ctxStr = `CTX: ${formatTokens(ctxUsed)}/${formatTokens(ctxTotal)} (\x1b[38;2;255;212;39m${Math.round(ctxRemainPct)}% left\x1b[0m)`;
  }

  // Line 2: API Quota (with colored formatting)
  const quotaLine = quotaStrs.length > 0 ? quotaStrs.join(' | ') : `No Quota Data`;
  const line2 = `API: ${quotaLine}`;

  // Line 3: System & Session Telemetry (CTX, Turn, Subagents, Tasks, Sandbox, Network)
  let sysInfo = [ctxStr];
  if (showTurn) {
    sysInfo.push(formatTurnTokens(turnIn, turnOut));
  }
  
  const showFullLabel = termWidth >= 80;
  if (subagentsCount > 0) {
    sysInfo.push(showFullLabel ? `🤖 Subagents: ${subagentsCount}` : `🤖 ${subagentsCount}`);
  }
  if (tasksCount > 0) {
    sysInfo.push(showFullLabel ? `⚙️ Tasks: ${tasksCount}` : `⚙️ ${tasksCount}`);
  }
  if (!isSandboxOn) {
    sysInfo.push(showFullLabel ? `🔓 \x1b[31mSandbox: OFF\x1b[0m` : `🔓 \x1b[31mOFF\x1b[0m`);
  }
  if (isNetOn) {
    sysInfo.push(showFullLabel ? `🌐 \x1b[33mNetwork: ON\x1b[0m` : `🌐 \x1b[33mON\x1b[0m`);
  }

  const line3 = `SYS: ${sysInfo.join(' │ ')}`;

  // Write outputs
  console.log(line1);
  console.log(line2);
  console.log(line3);
}
