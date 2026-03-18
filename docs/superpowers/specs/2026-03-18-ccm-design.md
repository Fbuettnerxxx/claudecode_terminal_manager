# CCM — Claude Code Manager: Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

`ccm` is an open-source tool that lets you monitor and control multiple Claude Code terminal sessions from a gamified web dashboard — accessible from your phone, from anywhere. Sessions can be started through `ccm` for full control, or detected automatically from existing Terminal sessions for read-only monitoring.

---

## Goals

- See all running Claude Code sessions in one place with real-time status (working / waiting for input / view-only)
- Label and identify sessions at a glance
- Send input to sessions directly from a phone dashboard
- Access the dashboard remotely via Tailscale (private VPN) or Cloudflare Tunnel (public URL)
- Publish as an open-source GitHub project with minimal setup friction

## Non-Goals

- Native iOS/Android app
- Cloud hosting or managed backend
- Support for non-Claude Code terminal sessions

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│  Mac                                                 │
│                                                      │
│  ┌──────────┐   hooks    ┌───────────────────────┐  │
│  │  Claude   │ ─────────▶│  ~/.ccm/sessions/*.json│  │
│  │ sessions  │           └──────────┬────────────┘  │
│  │ (tmux or  │                      │ fs.watch       │
│  │ Terminal) │           ┌──────────▼────────────┐  │
│  └──────────┘           │   ccm backend          │  │
│                          │   Node.js + Express    │  │
│  ┌──────────┐  send-keys │   + WebSocket (ws)     │  │
│  │   tmux   │ ◀──────────│                        │  │
│  └──────────┘           └──────────┬────────────┘  │
│                                     │ HTTP + WS      │
│                          ┌──────────▼────────────┐  │
│                          │   PWA Dashboard        │  │
│                          │   Vanilla JS + CSS     │  │
│                          └───────────────────────┘  │
└──────────────────────────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Tunnel (user's choice)      │
                    │  A) Tailscale (private VPN)  │
                    │  B) Cloudflare Tunnel        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Phone browser (PWA)         │
                    └─────────────────────────────┘
```

### Data Flow

1. A Claude Code session fires a hook (`PreToolUse`, `PostToolUse`, `Stop`) → writes state to `~/.ccm/sessions/<session-id>.json`
2. The ccm backend watches `~/.ccm/sessions/` via `chokidar` and pushes updates over WebSocket to all connected clients
3. The PWA receives the update and re-renders the session card in real time
4. When the user types in the dashboard input and taps send → WebSocket message → backend → `tmux send-keys -t <session> "<input>" Enter`

---

## Session Types

| Type | Status detection | Send input | Notes |
|---|---|---|---|
| Managed (via ccm) | Hooks + tmux pane | ✅ via tmux | Full control |
| Existing (Terminal.app) | Hooks only | ❌ view-only | Can be "adopted" |

**Adopting an existing session:** the user clicks "Adopt" in the dashboard. ccm reads the `cwd` field from the session's state file (`ccm-hook` writes the process `cwd` alongside every event via `process.cwd()` in Node or `$PWD` in shell). ccm then opens a new tmux window at that directory and starts a fresh `claude` session there. The original Terminal.app tab is left intact and continues running independently — its old session ID remains in the state directory as view-only. If two sessions share the same cwd simultaneously, their IDs remain distinct (they are process-level IDs) and do not collide.

---

## Session State Machine

```
bootstrapping ──▶ working ──▶ waiting ──▶ working
                          ↘           ↗
                           unknown (stale) ──▶ offline
```

State is derived from hook events:
- Session created via `ccm new` → backend writes bootstrap JSON `{ state: "bootstrapping", label, cwd, createdAt }` immediately; dashboard shows a "Starting…" card
- First `PreToolUse` fires → `working` (bootstrap file is updated in place)
- `PostToolUse` → still `working` (updates last tool name in card)
- `Stop` → `waiting`
- No hook event for 60s after entering `working` → backend marks as `unknown` (shown as stale; handles hard crashes like SIGKILL where `Stop` never fires)
- Session removed from dashboard after 10 min of no events; state file is kept on disk but not displayed

**`idle` state is not used** — sessions are only known to the backend after a hook fires or `ccm new` creates the bootstrap file. There is no ambiguous pre-hook idle state.

---

## Hook Registration

On `ccm start`, the tool merges into `~/.claude/settings.json` (non-destructively — existing hooks are preserved):

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "ccm-hook pre-tool  \"$CLAUDE_SESSION_ID\" \"$CLAUDE_TOOL_NAME\"" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "ccm-hook post-tool \"$CLAUDE_SESSION_ID\" \"$CLAUDE_TOOL_NAME\"" }] }],
    "Stop":        [{ "matcher": "*", "hooks": [{ "type": "command", "command": "ccm-hook stop       \"$CLAUDE_SESSION_ID\"" }] }]
  }
}
```

**`$CLAUDE_SESSION_ID`** is an environment variable injected by Claude Code itself into every hook invocation. It is a stable string identifier for the running session (persists across tool calls within a session, changes when a new `claude` process starts). `ccm-hook` uses it as the filename key: `~/.ccm/sessions/<id>.json`.

**Hook lifecycle:**
- `ccm start` registers hooks (merges, does not duplicate if already present)
- `ccm stop` removes the ccm-injected hooks from `~/.claude/settings.json` and leaves other hooks intact
- If the backend is stopped but hooks remain registered (e.g. after a crash), `ccm-hook` still writes state files; they accumulate until the backend restarts and reads them. `ccm-hook` always exits with code 0 so Claude Code is never blocked by a hook failure. All `ccm-hook` errors are appended to `~/.ccm/hook-errors.log`.

**`ccm-hook` behavior when `~/.ccm/sessions/` does not exist:** creates the directory before writing, exits 0.

---

## CLI Interface

```bash
ccm start                          # Start the backend server + open dashboard URL
ccm new "label" [path]             # Create a new managed session (tmux window)
ccm list                           # List all sessions and their states
ccm tunnel tailscale               # Print Tailscale access URL
ccm tunnel cloudflare              # Start cloudflared tunnel, print public URL
ccm stop                           # Stop backend server
```

---

## Dashboard (PWA)

**Layout (mobile-first):**
- Header: app name, session count summary
- Stats row: working count, waiting count, total tools run today
- Session cards (one per session, sorted: waiting first, then working, then view-only)
- "+ New session" button at bottom of list
- Bottom nav: Sessions / Settings / Tunnel

**Session card states:**
- **Waiting:** green top border, inline text input + send button, last activity summary
- **Working:** animated amber/red shimmer top border, pulsing dot, active tool chips, last action text
- **View-only:** grey top border, "Adopt →" button, last hook event timestamp
- **Offline:** red top border, timestamp of last seen

**Gamification elements:**
- Animated top border on working sessions (shimmer effect)
- Tool chip history per session (Edit, Read, Bash, etc.)
- Daily stats: tools run, sessions active, inputs sent
- Session emoji badges (auto-assigned, user-editable)

---

## Remote Access

Two modes, configured in `~/.ccm/config.json`:

```json
{ "tunnel": "tailscale", "port": 3000 }
// or
{ "tunnel": "cloudflare", "port": 3000 }
```

Default port: **3000** (overridable via config).

- **Tailscale:** backend binds to `0.0.0.0`, user accesses via Tailscale IP. Setup: install Tailscale on Mac + iPhone, done. Traffic is end-to-end encrypted, peer-to-peer. No authentication token needed — Tailscale's network layer provides access control.
- **Cloudflare Tunnel:** `ccm` spawns `cloudflared tunnel --url http://localhost:<port>`, prints the public URL. No account needed. URL changes on restart unless user configures a named tunnel.

**Security — Cloudflare Tunnel mode:** because the dashboard URL is publicly accessible, the backend requires a shared secret token in Cloudflare mode. On first `ccm start --tunnel cloudflare`, a random token is generated, stored in `~/.ccm/config.json`, and displayed once. The dashboard URL becomes `https://<tunnel-url>?token=<secret>`.

Token enforcement applies at two layers:
1. **HTTP GET for dashboard page:** the server checks the `token` query param before serving the HTML. An invalid or missing token returns HTTP 401 with a plain-text error — the UI never loads.
2. **WebSocket connections:** the `token` query param must be present on the WebSocket upgrade request. Invalid token → connection refused with HTTP 401.

This ensures that neither the UI nor the real-time session feed is accessible without the token.

Both modes are documented in the README with step-by-step setup.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | Node.js + Express | Zero install friction, widely known |
| WebSocket | `ws` library | Lightweight, no framework needed |
| File watching | `chokidar` | Reliable cross-platform fs.watch wrapper; handles macOS FSEvents quirks and rapid successive writes |
| Frontend | Vanilla JS + CSS | No build step — clone and run |
| Session management | tmux | Standard, scriptable, macOS + Linux |
| State storage | JSON files in `~/.ccm/` | No database needed |
| Hook runner | `ccm-hook` (Node.js CLI) | Installed via npm |
| Tunnel | Tailscale or cloudflared CLI | Both free tier, user installs |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Session hard-crashes (SIGKILL etc.) | `Stop` hook does NOT fire; 60s staleness timeout marks session as `unknown`; auto-removed after 10 min |
| `ccm-hook` fails | Always exits 0 so Claude Code is not blocked; errors logged to `~/.ccm/hook-errors.log` |
| Hook binary not found | Backend detects no events for new sessions, shows "hooks not configured" warning in dashboard |
| Tunnel disconnects | Dashboard WebSocket shows reconnecting spinner; auto-retries every 3s with exponential backoff |
| tmux not installed | `ccm start` detects absence and prints: `brew install tmux` |
| Input sent to view-only session | Dashboard disables input field; shows tooltip "Adopt session to send input" |
| Cloudflare token missing/wrong | Backend returns HTTP 401; dashboard shows "Invalid access token" screen |

---

## Testing

- **Unit:** Hook state parser, session state machine transitions, config reader/writer, token auth middleware
- **Integration:** Spawn a real Claude Code process in a tmux pane (using `--dangerously-skip-permissions` flag), assert state transitions fire correctly via hooks
- **E2E:** Playwright test driving the dashboard, verifying card state updates on hook events

**Stats persistence:** The backend maintains an in-memory daily stats object `{ toolsRun: number, sessionsActive: Set, inputsSent: number }` per calendar day. On each hook event write, the backend checks if `new Date().toDateString()` differs from the current stats date; if so, it flushes the current stats to `~/.ccm/stats-<YYYY-MM-DD>.json` and resets the in-memory object. This handles midnight rollovers for long-running backends without a separate timer. On startup, today's stats file is loaded if present. State files older than 30 days in `~/.ccm/sessions/` are pruned on startup to prevent unbounded accumulation.

---

## Open Source Considerations

- MIT license
- Single `npm install && npm start` setup
- README covers: requirements, Tailscale setup, Cloudflare Tunnel setup, hook registration
- All runtime state is stored in `~/.ccm/` (outside the repo) — session files may contain prompt text and are never committed
- No telemetry, no cloud accounts required for core functionality
- `ccm list` output example:
  ```
  ID               LABEL            STATE    CWD
  abc123-def456    API Agent        waiting  ~/API_agent
  789xyz-uvw012    Hoinka Website   working  ~/hoinka_website
  old999-aaa111    biohack-backend  unknown  ~/biohack-backend  [view-only]
  ```
