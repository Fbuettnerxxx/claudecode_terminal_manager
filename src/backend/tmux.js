const { execSync, execFileSync } = require('child_process');

const CCM_SESSION = 'ccm';

// These build functions are used in unit tests to verify argument construction.
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

function newWindow({ windowName, cwd, label = '', sessionName = CCM_SESSION }) {
  ensureSession(sessionName);
  // -e sets env vars in the new window so the hook can mark the session as managed
  execFileSync('tmux', ['new-window', '-t', sessionName, '-n', windowName, '-c', cwd,
    '-e', `CCM_WINDOW_NAME=${windowName}`,
    '-e', `CCM_LABEL=${label}`,
  ]);
  execFileSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, 'claude', 'Enter']);
}

function sendInput({ windowName, text, sessionName = CCM_SESSION }) {
  execFileSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, text, 'Enter']);
}

// Strip ANSI escape sequences so pane content renders cleanly as plain text
function stripAnsi(str) {
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')   // CSI sequences (colors, cursor)
    .replace(/\x1b[()][0-9A-Za-z]/g, '')      // character set switching
    .replace(/\x1b[^[\]()]/g, '')              // other ESC sequences
    .replace(/\r/g, '');                       // carriage returns
}

// Capture the visible content + recent history of a tmux pane
function capturePane(windowName, sessionName = CCM_SESSION) {
  try {
    const raw = execFileSync(
      'tmux', ['capture-pane', '-t', `${sessionName}:${windowName}`, '-p', '-S', '-200'],
      { encoding: 'utf8' }
    );
    return stripAnsi(raw);
  } catch (_) { return ''; }
}

// List windows in a tmux session — returns [{ name, active }]
function getWindows(sessionName = CCM_SESSION) {
  try {
    const raw = execFileSync(
      'tmux', ['list-windows', '-t', sessionName, '-F', '#{window_name}\t#{window_active}'],
      { encoding: 'utf8' }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      const tab = line.lastIndexOf('\t');
      return { name: line.slice(0, tab), active: line.slice(tab + 1) === '1' };
    });
  } catch (_) { return []; }
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

module.exports = {
  buildNewWindowCmd, buildSendKeysCmd, buildListWindowsCmd,
  newWindow, sendInput, capturePane, getWindows, listWindows, isTmuxAvailable,
};
