const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SESSIONS_DIR = path.join(process.env.HOME, '.ccm', 'sessions');
const ERROR_LOG = path.join(process.env.HOME, '.ccm', 'hook-errors.log');

function deriveSyntheticId() {
  const base = `${process.env.CLAUDE_PROJECT_ID || 'unknown'}-${process.ppid || process.pid}`;
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 12);
}

function writeEvent({ sessionId, event, toolName, sessionsDir = DEFAULT_SESSIONS_DIR }) {
  const id = sessionId || deriveSyntheticId();
  fs.mkdirSync(sessionsDir, { recursive: true });

  const filePath = path.join(sessionsDir, `${id}.json`);

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) {}

  const stateMap = { 'pre-tool': 'working', 'post-tool': 'working', 'stop': 'waiting' };
  const state = stateMap[event] || 'unknown';

  const updated = {
    ...existing,
    sessionId: id,
    state,
    cwd: process.env.PWD || process.cwd(),
    updatedAt: new Date().toISOString(),
    ...(toolName ? { lastToolName: toolName } : {}),
  };

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

// CLI entry point
if (require.main === module) {
  try {
    const [, , event, sessionId, toolName] = process.argv;
    const envSessionId = process.env.CLAUDE_SESSION_ID || sessionId || '';
    if (!envSessionId) {
      logError(`WARN: CLAUDE_SESSION_ID not set, using synthetic ID`);
    }
    writeEvent({ sessionId: envSessionId, event, toolName });
  } catch (err) {
    logError(err.message);
  }
  process.exit(0); // Always exit 0 so Claude Code is never blocked
}

module.exports = { writeEvent };
