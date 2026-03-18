const { execSync } = require('child_process');

const CCM_SESSION = 'ccm';

function buildNewWindowCmd({ sessionName = CCM_SESSION, windowName, cwd }) {
  return `tmux new-window -t ${sessionName} -n "${windowName}" -c "${cwd}"`;
}

function buildSendKeysCmd({ sessionName = CCM_SESSION, windowName, text }) {
  const escaped = text.replace(/"/g, '\\"');
  return `tmux send-keys -t ${sessionName}:${windowName} "${escaped}" Enter`;
}

function buildListWindowsCmd(sessionName = CCM_SESSION) {
  return `tmux list-windows -t ${sessionName} -F "#{window_name}"`;
}

function ensureSession(sessionName = CCM_SESSION) {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
  } catch (_) {
    execSync(`tmux new-session -d -s ${sessionName}`);
  }
}

function newWindow({ windowName, cwd }) {
  ensureSession();
  execSync(buildNewWindowCmd({ windowName, cwd }));
  // Start claude in the new window
  execSync(buildSendKeysCmd({ windowName, text: 'claude' }));
}

function sendInput({ windowName, text }) {
  execSync(buildSendKeysCmd({ windowName, text }));
}

function listWindows() {
  try {
    const out = execSync(buildListWindowsCmd()).toString().trim();
    return out ? out.split('\n') : [];
  } catch (_) { return []; }
}

function isTmuxAvailable() {
  try { execSync('which tmux'); return true; } catch (_) { return false; }
}

module.exports = { buildNewWindowCmd, buildSendKeysCmd, buildListWindowsCmd, newWindow, sendInput, listWindows, isTmuxAvailable };
