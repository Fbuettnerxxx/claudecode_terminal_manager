const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

function createWatcher(sessionsDir, sessionStore) {
  fs.mkdirSync(sessionsDir, { recursive: true });

  const watcher = chokidar.watch(`${sessionsDir}/*.json`, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('add', filePath => _applyFile(filePath, sessionStore));
  watcher.on('change', filePath => _applyFile(filePath, sessionStore));

  return watcher;
}

function _applyFile(filePath, sessionStore) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.sessionId) sessionStore.applyEvent(data);
  } catch (_) {}
}

module.exports = { createWatcher };
