const express = require('express');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const { SessionStore } = require('./sessions.js');
const { Stats } = require('./stats.js');
const { createWatcher } = require('./watcher.js');
const { createTokenMiddleware, verifyWsToken } = require('./auth.js');
const { sendInput, newWindow, killWindow, capturePane, getWindows } = require('./tmux.js');

const SESSIONS_DIR = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'sessions');

function pruneOldSessionFiles(sessionsDir) {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  let pruned = 0;
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      try {
        const { mtimeMs } = fs.statSync(filePath);
        if (now - mtimeMs > THIRTY_DAYS_MS) {
          fs.unlinkSync(filePath);
          pruned++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return pruned;
}

function createServer({ token = null } = {}) {
  const app = express();
  const sessionStore = new SessionStore();
  const stats = new Stats();
  pruneOldSessionFiles(SESSIONS_DIR);

  app.use(createTokenMiddleware(token));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  app.get('/api/sessions', (req, res) => res.json(sessionStore.getAll()));
  app.get('/api/stats', (req, res) => res.json(stats.today()));

  // Start a new managed session from the dashboard
  app.post('/api/sessions/new', (req, res) => {
    const { label, cwd } = req.body;
    if (!label || typeof label !== 'string' || label.length > 100) {
      return res.status(400).json({ error: 'label required (max 100 chars)' });
    }
    if (!cwd || typeof cwd !== 'string') {
      return res.status(400).json({ error: 'cwd required' });
    }
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch (err) {
      return res.status(400).json({ error: 'could not create directory: ' + err.message });
    }
    const windowName = label.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    try {
      newWindow({ windowName, cwd, label });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send input to a session by window name (used by REST clients)
  app.post('/api/sessions/:id/input', (req, res) => {
    const { text } = req.body;
    if (typeof text !== 'string' || text.length === 0 || text.length > 10000) {
      return res.status(400).json({ error: 'text must be a non-empty string ≤ 10000 chars' });
    }
    const session = sessionStore.get(req.params.id);
    if (!session || session.managed === false) {
      return res.status(403).json({ error: 'Session is view-only' });
    }
    try {
      sendInput({ windowName: session.windowName, text });
      stats.recordInputSent();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  // Terminal streaming state
  const watching = new Map();  // ws → windowName being watched
  const paneCache = new Map(); // windowName → last captured content
  let windowsCache = '[]';

  // Poll tmux every 300ms — broadcast window list changes, stream pane content to watchers
  const termPoll = setInterval(() => {
    if (wss.clients.size === 0) return;

    const windows = getWindows();
    const windowsJson = JSON.stringify(windows);
    if (windowsJson !== windowsCache) {
      windowsCache = windowsJson;
      const msg = JSON.stringify({ type: 'windows', windows });
      for (const ws of wss.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    }

    const watched = new Set(watching.values());
    for (const windowName of watched) {
      const content = capturePane(windowName);
      if (content !== paneCache.get(windowName)) {
        paneCache.set(windowName, content);
        const msg = JSON.stringify({ type: 'pane', window: windowName, content });
        for (const [ws, wn] of watching) {
          if (wn === windowName && ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
      }
    }
  }, 300);

  wss.on('connection', (ws, req) => {
    if (!verifyWsToken(token, req.url)) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Send current window list immediately
    ws.send(JSON.stringify({ type: 'windows', windows: getWindows() }));

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'select' && msg.window) {
          // Client wants to watch this window
          watching.set(ws, msg.window);
          const content = capturePane(msg.window);
          paneCache.set(msg.window, content);
          ws.send(JSON.stringify({ type: 'pane', window: msg.window, content }));

        } else if (msg.type === 'input' && msg.window && msg.text) {
          if (typeof msg.text !== 'string' || msg.text.length > 10000) return;
          sendInput({ windowName: msg.window, text: msg.text });
          stats.recordInputSent();

        } else if (msg.type === 'close' && msg.window) {
          try { killWindow(msg.window); } catch (_) {}
        }
      } catch (_) {}
    });

    ws.on('close', () => watching.delete(ws));
  });

  // Watch sessions dir (hook-based metadata — still works in background)
  createWatcher(SESSIONS_DIR, sessionStore);

  let _lastToolKey = {};
  sessionStore.on('change', s => {
    if (s.state === 'working' && s.lastToolName) {
      const key = `${s.sessionId}:${s.lastToolName}:${s.updatedAt}`;
      if (_lastToolKey[s.sessionId] !== key) {
        _lastToolKey[s.sessionId] = key;
        stats.recordToolUse();
        stats.recordSessionActive(s.sessionId);
      }
    }
  });

  process.once('SIGTERM', () => { stats.flush(); clearInterval(termPoll); server.close(); });
  process.once('SIGINT',  () => { stats.flush(); clearInterval(termPoll); server.close(); });

  return { server, sessionStore, stats, termPoll };
}

module.exports = { createServer, pruneOldSessionFiles };
