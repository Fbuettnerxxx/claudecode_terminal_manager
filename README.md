# ccm — Claude Code Manager

Your Mac terminal on your phone. See all your Claude Code sessions live, send input, start new ones — from anywhere.

![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## What it does

CCM runs a small server on your Mac that streams your terminal sessions to a clean mobile dashboard. Every session runs inside a tmux window — you see the actual terminal output in real time and can type and send input from your phone exactly as if you were at your keyboard.

- **Live terminal content** — actual output, not just status indicators
- **Tab per session** — switch between Claude Code sessions like browser tabs
- **Send input from your phone** — type a reply, hit send, Claude responds
- **Start new sessions remotely** — specify a label and project path, done
- **Access from anywhere** — Tailscale (private) or Cloudflare Tunnel (public HTTPS)

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

### 3. Open on your phone

On the same network: `http://<your-mac-ip>:3000`
With Tailscale: `ccm tunnel tailscale` prints the exact URL.

### 4. Start a Claude Code session

```bash
ccm new "my feature" /path/to/project
```

The session appears as a new tab on your phone within a second. You see the terminal output live and can send input from the input bar at the bottom.

---

## Requirements

| Requirement | Why | Install |
|-------------|-----|---------|
| Node.js 18+ | runs the server | [nodejs.org](https://nodejs.org) |
| tmux | all sessions run inside tmux | `brew install tmux` |
| Tailscale *(optional)* | private remote access | [tailscale.com/download](https://tailscale.com/download) |
| cloudflared *(optional)* | public HTTPS URL | `brew install cloudflared` |

---

## All Commands

```bash
ccm start                          # start server on port 3000
ccm start --port 3001              # custom port
ccm stop                           # stop server

ccm new "label"                    # new session in current directory
ccm new "label" /path/to/dir       # new session in specific directory

ccm list                           # list known sessions

ccm tunnel tailscale               # print Tailscale URL
ccm tunnel cloudflare              # start Cloudflare Tunnel, print public URL + token
```

---

## The Phone UI

```
┌─────────────────────────────────┐
│ ● │ auth-fix │ api-agent │ ＋   │  ← tab bar (swipe to switch)
├─────────────────────────────────┤
│                                 │
│  > claude                       │
│  ╭─────────────────────────── ╮ │
│  │ ● Working on your request  │ │  ← live terminal output
│  │   Writing src/auth.js...   │ │     updates every 300ms
│  ╰────────────────────────────╯ │
│                                 │
├─────────────────────────────────┤
│  Send input…             [  ↑ ] │  ← tap to type, Enter to send
└─────────────────────────────────┘
```

Tap **＋** to create a new session. The new tab appears automatically once Claude starts.

---

## Remote Access

### Tailscale (recommended)

1. Install Tailscale on Mac and phone — [tailscale.com/download](https://tailscale.com/download)
2. Sign in on both devices (same account)
3. `ccm start`, then `ccm tunnel tailscale` — opens your browser to the right URL
4. Copy that URL and open on your phone

No token needed. Tailscale handles auth at the network level.

### Cloudflare Tunnel (public HTTPS)

1. `brew install cloudflared`
2. `ccm start`
3. `ccm tunnel cloudflare` — prints a public `https://*.trycloudflare.com` URL with a token
4. Open `https://<url>?token=<token>` on your phone

The token is saved to `~/.ccm/config.json`. The URL changes each time you restart the tunnel; for a permanent URL, set up a named Cloudflare Tunnel with a custom domain.

---

## How It Works

### Sessions = tmux windows

All Claude Code sessions run as windows inside a single tmux session named `ccm`. When you run `ccm new`, it opens a new tmux window, sets environment variables for session tracking, and starts Claude.

### Real-time streaming

The server polls tmux every 300ms using `tmux capture-pane`, capturing the last 200 lines of each watched window. When content changes, it pushes the update to connected clients over WebSocket. ANSI escape codes are stripped server-side so the output renders cleanly.

### Input

The phone sends `{ type: "input", window: "name", text: "..." }` over WebSocket. The server calls `tmux send-keys` to inject the text into the target window — exactly as if you typed it in the terminal.

### Session tracking

Claude Code hooks (`PreToolUse`, `PostToolUse`, `Stop`) are registered in `~/.claude/settings.json` and run `ccm-hook` on every action, writing state to `~/.ccm/sessions/`. This powers background stats tracking. The hooks always exit 0 and never block Claude Code.

### Files on disk

```
~/.ccm/
  sessions/              session state files (one JSON per Claude session)
  stats-YYYY-MM-DD.json  daily stats (tools run, inputs sent)
  config.json            server config (port, auth token)
  server.pid             running server PID
  hook-errors.log        hook errors (written only if something goes wrong)
```

---

## Auto-Start on Login

To have ccm always running in the background so your phone dashboard is always ready:

```bash
# Create a launchd agent (runs ccm start automatically at login)
cat > ~/Library/LaunchAgents/com.ccm.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ccm.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/ccm</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.ccm.server.plist
```

To stop auto-start:
```bash
launchctl unload ~/Library/LaunchAgents/com.ccm.server.plist
```

> **Note:** If `ccm` is installed somewhere other than `/usr/local/bin/ccm`, find the path with `which ccm` and update the plist accordingly.

Once set up, the intended daily workflow is:
1. `ccm new "label" /path/to/project` to start any new Claude session (instead of a normal terminal tab)
2. Open the CCM dashboard on your phone — all sessions are there, always live
3. Switch between sessions, read output, send input — all from your phone

---

## About Existing Sessions

Sessions started in **Terminal.app before `ccm start`** cannot be streamed — they're not inside the `ccm` tmux session.

**Workaround:** start a fresh session with `ccm new`. Claude automatically picks up project context from `CLAUDE.md` and conversation history, so continuity is rarely a problem in practice.

---

## Troubleshooting

**No tabs showing on the dashboard**
- Make sure the server is running: `ccm start`
- Sessions only appear if they were started with `ccm new` (or manually inside the `ccm` tmux session)

**`ccm` command not found**
- Run `npm link` inside the project directory
- Or run directly: `node bin/ccm`

**`ccm new` fails**
- tmux must be installed: `brew install tmux`
- ccm creates its own tmux session named `ccm` — you don't need to be in tmux already

**Output looks garbled**
- ANSI codes are stripped automatically; if you still see garbage, file an issue

**Phone can't reach the dashboard**
- Same WiFi: use `ipconfig getifaddr en0` to find your Mac's IP
- For reliable access outside the house, use Tailscale

**Cloudflare URL not printing**
- Check `cloudflared` is installed: `brew install cloudflared`
- URL appears after ~5 seconds; check your internet connection if it hangs

---

## Development

```bash
npm test            # run all tests (33 tests, 7 suites)
npm test -- --watch # watch mode
```

---

## License

MIT
