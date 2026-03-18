const express = require('express');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const { SessionStore } = require('./sessions.js');
const { Stats } = require('./stats.js');
const { createWatcher } = require('./watcher.js');
const { createTokenMiddleware, verifyWsToken } = require('./auth.js');

const SESSIONS_DIR = path.join(process.env.HOME || require('os').homedir(), '.ccm', 'sessions');

function createServer({ port = 3000, token = null } = {}) {
  const app = express();
  const sessionStore = new SessionStore();
  const stats = new Stats();

  // Auth middleware (no-op in Tailscale mode)
  app.use(createTokenMiddleware(token));

  // Serve PWA
  app.use(express.static(path.join(__dirname, '../../public')));
  app.use(express.json());

  // REST: list sessions
  app.get('/api/sessions', (req, res) => res.json(sessionStore.getAll()));
  app.get('/api/stats', (req, res) => res.json(stats.today()));

  // Send input to a managed session
  app.post('/api/sessions/:id/input', (req, res) => {
    const { text } = req.body;
    const session = sessionStore.get(req.params.id);
    if (!session || session.managed === false) {
      return res.status(403).json({ error: 'Session is view-only' });
    }
    const { sendInput } = require('./tmux.js');
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

  wss.on('connection', (ws, req) => {
    // Verify token on WebSocket upgrade
    if (!verifyWsToken(token, req.url)) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    // Send current state immediately on connect
    ws.send(JSON.stringify({ type: 'snapshot', sessions: sessionStore.getAll(), stats: stats.today() }));

    // Forward session changes
    const onChange = (session) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'session_update', session, stats: stats.today() }));
      }
    };
    sessionStore.on('change', onChange);
    ws.on('close', () => sessionStore.off('change', onChange));
  });

  // Watch sessions dir
  createWatcher(SESSIONS_DIR, sessionStore);

  // Record tool use — deduplicated by sessionId+toolName+updatedAt to avoid double-counting
  // (PreToolUse and PostToolUse both set state=working; we only count when the key changes)
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

  // Flush stats on shutdown
  process.on('SIGTERM', () => { stats.flush(); server.close(); });
  process.on('SIGINT', () => { stats.flush(); server.close(); });

  return { server, sessionStore, stats };
}

module.exports = { createServer };
