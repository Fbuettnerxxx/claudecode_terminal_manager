# ccm — Claude Code Manager

Manage all your Claude Code sessions from your phone.

![session states: working, waiting, unknown](https://img.shields.io/badge/sessions-working%20%7C%20waiting%20%7C%20unknown-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## What it does

CCM is a small Node.js server + PWA dashboard that gives you a real-time view of every Claude Code session running on your Mac — and lets you send input to them from your phone.

- **Real-time state** — see which sessions are working, waiting for input, or idle
- **Send input from your phone** — type a reply and hit send, it goes straight to the tmux window
- **Auto-detects all Claude Code sessions** — any session you run anywhere on your machine shows up automatically
- **Remote access** — Tailscale (private, no auth) or Cloudflare Tunnel (public HTTPS URL)
- **Gamified dashboard** — daily stats, tool counters, session activity

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/Fbuettnerxxx/claudecode_terminal_manager.git
cd claudecode_terminal_manager
npm install
npm link
```

`npm link` makes `ccm` and `ccm-hook` available as global commands.

### 2. Start the server

```bash
ccm start
```

This registers Claude Code hooks and starts the dashboard on port 3000.

### 3. Open the dashboard

On your Mac: [http://localhost:3000](http://localhost:3000)

On your phone (same WiFi / Tailscale): `http://<your-mac-ip>:3000`

### 4. Start a Claude Code session

```bash
ccm new "my feature" /path/to/project
```

This opens a new tmux window, starts Claude, and the session appears on the dashboard immediately.

### 5. Control from your phone

When Claude finishes and shows `waiting`, an input box appears on the dashboard card. Type your reply and hit send — it goes straight to the terminal.

---

## Requirements

| Requirement | Why | Install |
|-------------|-----|---------|
| Node.js 18+ | runs the server | [nodejs.org](https://nodejs.org) |
| tmux | manages terminal sessions | `brew install tmux` |
| Tailscale *(optional)* | phone access on private network | [tailscale.com/download](https://tailscale.com/download) |
| cloudflared *(optional)* | public HTTPS URL | `brew install cloudflared` |

tmux is only required for `ccm new`. Monitoring existing Claude Code sessions works without it.

---

## All Commands

```bash
ccm start                          # start server (port 3000)
ccm start --port 3001              # custom port
ccm start --tunnel cloudflare      # start + open Cloudflare Tunnel immediately
ccm stop                           # stop server, deregister hooks

ccm new "label"                    # new session in current directory
ccm new "label" /path/to/dir       # new session in specific directory

ccm list                           # list all known sessions

ccm tunnel tailscale               # print Tailscale URL for phone access
ccm tunnel cloudflare              # start Cloudflare Tunnel, print public URL + token
```

---

## Remote Access

### Tailscale (recommended — private network, no auth required)

1. Install Tailscale on your Mac and phone — [tailscale.com/download](https://tailscale.com/download)
2. Sign in on both devices (same account)
3. Run `ccm tunnel tailscale` — it prints your Mac's Tailscale URL
4. Open that URL on your phone

No token needed. Tailscale handles authentication at the network level.

### Cloudflare Tunnel (public HTTPS URL — use for external access)

1. Install cloudflared: `brew install cloudflared`
2. Run `ccm tunnel cloudflare`
3. A public `https://*.trycloudflare.com` URL is printed along with a token
4. Open `https://<url>?token=<token>` on your phone

The token is generated once and saved to `~/.ccm/config.json`. All requests are verified against it.

> **Note:** The Cloudflare URL changes every time you restart the tunnel. For a permanent URL, use a named Cloudflare Tunnel with a custom domain.

---

## How It Works

### Session monitoring

`ccm start` injects three hooks into `~/.claude/settings.json`:

```
PreToolUse  → ccm-hook pre-tool  $CLAUDE_SESSION_ID $CLAUDE_TOOL_NAME
PostToolUse → ccm-hook post-tool $CLAUDE_SESSION_ID $CLAUDE_TOOL_NAME
Stop        → ccm-hook stop      $CLAUDE_SESSION_ID
```

These run automatically on every Claude Code action across all your sessions. The `ccm-hook` binary writes a small state file to `~/.ccm/sessions/<sessionId>.json`. The server watches that directory with chokidar and pushes updates to the dashboard over WebSocket.

`ccm stop` removes the hooks.

### Session states

| State | Meaning |
|-------|---------|
| `working` | Claude is actively using a tool |
| `waiting` | Claude finished and is waiting for your input |
| `unknown` | No activity for 60 seconds — session may have ended |

### Managed vs view-only sessions

| Type | How created | Dashboard input |
|------|-------------|-----------------|
| Managed | `ccm new` | ✅ Can send input |
| View-only | Existing terminal sessions | 👁 State visible only |

### Files on disk

```
~/.ccm/
  sessions/          session state files (one JSON per session)
  stats-YYYY-MM-DD.json  daily stats (tools run, inputs sent)
  config.json        server config (token, port)
  server.pid         running server PID
  hook-errors.log    hook error log (only written on errors)
```

---

## Troubleshooting

**Sessions don't appear on the dashboard**

- Make sure the server is running: `ccm start`
- Check that hooks are registered: look for `_ccm` entries in `~/.claude/settings.json`
- Restart Claude Code after `ccm start` — hooks are read when Claude starts

**`ccm` command not found**

- Run `npm link` inside the project directory
- Or use `node bin/ccm` directly from the project root

**`ccm new` fails**

- tmux must be installed: `brew install tmux`
- You don't need to be in a tmux session — ccm creates its own session named `ccm`

**Dashboard shows a session as `unknown`**

- The session hasn't had any hook activity for 60 seconds
- It may still be running — open the terminal to check
- Sessions are removed from the dashboard after 10 minutes of no activity

**Cloudflare Tunnel URL not printed**

- Make sure cloudflared is installed: `brew install cloudflared`
- The URL appears in the terminal after ~5 seconds
- If it hangs, check your internet connection

**Phone can't reach the dashboard**

- On same WiFi: use your Mac's local IP (`ipconfig getifaddr en0`) + port 3000
- For reliable phone access, use Tailscale (`ccm tunnel tailscale`)

---

## Development

```bash
npm test            # run all tests (33 tests, 7 suites)
npm test -- --watch # watch mode
```

Test coverage: hook state writing, hooks-config registration/deregistration, session store state machine, stats tracking, auth middleware, tmux arg builder, server input validation, file pruning.

---

## License

MIT
