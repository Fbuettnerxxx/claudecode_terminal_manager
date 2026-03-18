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
2. The ccm backend watches `~/.ccm/sessions/` via `fs.watch` and pushes updates over WebSocket to all connected clients
3. The PWA receives the update and re-renders the session card in real time
4. When the user types in the dashboard input and taps send → WebSocket message → backend → `tmux send-keys -t <session> "<input>" Enter`

---

## Session Types

| Type | Status detection | Send input | Notes |
|---|---|---|---|
| Managed (via ccm) | Hooks + tmux pane | ✅ via tmux | Full control |
| Existing (Terminal.app) | Hooks only | ❌ view-only | Can be "adopted" |

**Adopting an existing session:** the user clicks "Adopt" in the dashboard. ccm re-launches the session in a new tmux window at the same working directory, carrying over the label. The old Terminal tab is left intact.

---

## Session State Machine

```
idle ──▶ working ──▶ waiting ──▶ working
                 ↘           ↗
                  offline (crash/exit)
```

State is derived from hook events:
- `PreToolUse` → `working`
- `Stop` → `waiting`
- No hook event for 60s after `working` → backend marks as `unknown` (shown as stale)
- Session process gone → `offline`

---

## Hook Registration

On `ccm start`, the tool appends to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "ccm-hook pre-tool $CLAUDE_SESSION_ID $CLAUDE_TOOL_NAME" }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "ccm-hook stop $CLAUDE_SESSION_ID" }] }]
  }
}
```

`ccm-hook` is a tiny CLI binary (installed alongside `ccm`) that writes a JSON event to `~/.ccm/sessions/<id>.json`.

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
{ "tunnel": "tailscale" }
// or
{ "tunnel": "cloudflare" }
```

- **Tailscale:** backend binds to `0.0.0.0`, user accesses via Tailscale IP. Setup: install Tailscale on Mac + iPhone, done. Traffic is end-to-end encrypted, peer-to-peer.
- **Cloudflare Tunnel:** `ccm` spawns `cloudflared tunnel --url http://localhost:<port>`, prints the public URL. No account needed. URL changes on restart unless user configures a named tunnel.

Both modes are documented in the README with step-by-step setup.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | Node.js + Express | Zero install friction, widely known |
| WebSocket | `ws` library | Lightweight, no framework needed |
| Frontend | Vanilla JS + CSS | No build step — clone and run |
| Session management | tmux | Standard, scriptable, macOS + Linux |
| State storage | JSON files in `~/.ccm/` | No database needed |
| Hook runner | `ccm-hook` (Node.js CLI) | Installed via npm |
| Tunnel | Tailscale or cloudflared CLI | Both free tier, user installs |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Session process crashes | `Stop` hook fires regardless; card shows `offline` |
| Hook binary not found | ccm-hook missing → backend detects no events, shows "hooks not configured" warning in dashboard |
| Tunnel disconnects | Dashboard WebSocket shows reconnecting spinner; auto-retries every 3s |
| tmux not installed | `ccm start` prints instructions: `brew install tmux` |
| Input sent to view-only session | Dashboard disables input field; shows tooltip "Adopt session to send input" |

---

## Testing

- **Unit:** Hook state parser, session state machine transitions, config reader/writer
- **Integration:** Spawn a real Claude Code process in a tmux pane (using `--dangerously-skip-permissions` flag), assert state transitions fire correctly via hooks
- **E2E:** Playwright test driving the dashboard, verifying card state updates on hook events

---

## Open Source Considerations

- MIT license
- Single `npm install && npm start` setup
- README covers: requirements, Tailscale setup, Cloudflare Tunnel setup, hook registration
- `.gitignore` excludes `~/.ccm/sessions/` (may contain prompt text) — tool stores state outside the repo
- No telemetry, no cloud accounts required for core functionality
