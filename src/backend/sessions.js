const EventEmitter = require('events');

const STALE_TIMEOUT_MS = 60_000;
const REMOVE_TIMEOUT_MS = 10 * 60_000;

class SessionStore extends EventEmitter {
  constructor({ staleTimeoutMs = STALE_TIMEOUT_MS } = {}) {
    super();
    this._sessions = new Map();
    this._staleTimers = new Map();
    this._removeTimers = new Map();
    this._staleTimeoutMs = staleTimeoutMs;
  }

  bootstrap({ sessionId, label, cwd }) {
    const session = { sessionId, label, cwd, state: 'bootstrapping', createdAt: new Date().toISOString() };
    this._sessions.set(sessionId, session);
    this.emit('change', session);
    return session;
  }

  applyEvent(event) {
    const { sessionId, state } = event;
    const existing = this._sessions.get(sessionId) || {};
    const session = { ...existing, ...event };
    this._sessions.set(sessionId, session);

    if (state === 'working') {
      this._resetStaleTimer(sessionId);
    } else {
      this._clearStaleTimer(sessionId);
    }

    this.emit('change', session);
    return session;
  }

  _resetStaleTimer(sessionId) {
    this._clearStaleTimer(sessionId);
    const t = setTimeout(() => {
      const s = this._sessions.get(sessionId);
      if (s && s.state === 'working') {
        const updated = { ...s, state: 'unknown' };
        this._sessions.set(sessionId, updated);
        this.emit('change', updated);
        // Remove from display after REMOVE_TIMEOUT_MS
        const rt = setTimeout(() => {
          this._sessions.delete(sessionId);
          this._removeTimers.delete(sessionId);
        }, REMOVE_TIMEOUT_MS);
        this._removeTimers.set(sessionId, rt);
      }
    }, this._staleTimeoutMs);
    this._staleTimers.set(sessionId, t);
  }

  _clearStaleTimer(sessionId) {
    const t = this._staleTimers.get(sessionId);
    if (t) { clearTimeout(t); this._staleTimers.delete(sessionId); }
  }

  get(sessionId) { return this._sessions.get(sessionId); }

  getAll() { return Array.from(this._sessions.values()); }

  destroy() {
    for (const t of this._staleTimers.values()) clearTimeout(t);
    this._staleTimers.clear();
    for (const t of this._removeTimers.values()) clearTimeout(t);
    this._removeTimers.clear();
  }
}

module.exports = { SessionStore };
