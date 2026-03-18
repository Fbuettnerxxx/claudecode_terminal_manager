# Remote Terminal Manager

Your Mac terminal on your phone. All your Claude Code sessions, live, from anywhere via Tailscale. Also start new sessions, make new projects or terminate unwanted ones.

![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## What it does

CCM runs a small server on your Mac that streams your Claude Code terminal sessions to a mobile dashboard. Every session runs inside a tmux window — you see the actual terminal output live and can type and send input from your phone exactly as if you were at your keyboard.

- **Live terminal content** — see exactly what's on screen, updated every 300ms
- **Tab per session** — switch between Claude Code sessions like browser tabs
- **Send input from your phone** — type a reply, hit send, Claude responds
- **Start new sessions remotely** — give it a label and a project path, done
- **Close sessions** — tap × on a tab to kill it
- **Access from anywhere** — private and secure via Tailscale

---

## Requirements

| Requirement | Install |
|-------------|---------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| tmux | `brew install tmux` |
| Tailscale | [tailscale.com/download](https://tailscale.com/download) — install on both Mac and phone |

---

## Installation

```bash
git clone https://github.com/Fbuettnerxxx/claudecode_terminal_manager.git
cd claudecode_terminal_manager
npm install
npm link
```

`npm link` makes `ccm` available as a global command. Find the installed path with `which ccm` if needed.

---

## Setup (one time)

### 1. Install Tailscale on your Mac and phone

Download from [tailscale.com/download](https://tailscale.com/download) and sign in with the same account on both devices.

### 2. Start the server

```bash
ccm start
```

Returns immediately — the server runs in the background. Logs go to `~/.ccm/server.log`.

### 3. Get your phone URL

```bash
ccm tunnel
```

Copy the printed URL and open it on your phone. Bookmark it — it stays the same as long as your Tailscale hostname doesn't change.

---

## Daily Workflow

```bash
ccm new "label" /path/to/project   # open a new terminal tab
```

The new tab appears on your phone within a second. From there you can read output, type commands, and close tabs — all from your phone while your Mac keeps running.

To stop the server:
```bash
ccm stop
```

---

## Auto-Start on Login

To have ccm always running so your phone dashboard is always ready:

```bash
# Find your ccm path first
which ccm   # e.g. /usr/local/bin/ccm

# Create the launchd agent (replace the path if different)
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

To disable auto-start:
```bash
launchctl unload ~/Library/LaunchAgents/com.ccm.server.plist
```

---

## All Commands

```bash
ccm start                   # start server in background (port 3000)
ccm start --port 3001       # custom port
ccm stop                    # stop server and deregister hooks

ccm new "label"             # new terminal tab in current directory
ccm new "label" /path       # new terminal tab in specific directory (created if needed)

ccm list                    # list known sessions

ccm tunnel                  # print your Tailscale URL for phone access
```

---

## The Phone UI

```
┌─────────────────────────────────┐
│ ● │ auth-fix │ api-agent │ ＋   │  ← tap a tab to switch, × to close
├─────────────────────────────────┤
│                                 │
│  > Writing src/auth.js...       │
│  > Running tests...             │  ← live terminal output
│  > All tests passed             │
│                                 │
├─────────────────────────────────┤
│  Send input…             [  ↑ ] │  ← type here, Enter or ↑ to send
└─────────────────────────────────┘
```

---

## How It Works

### Sessions = tmux windows

All Claude Code sessions run as windows inside a tmux session named `ccm`. `ccm new` opens a new window, sets environment variables for session tracking, and starts Claude.

### Streaming

The server polls `tmux capture-pane` every 300ms. When content changes it pushes the update over WebSocket. Input from the phone goes back via `tmux send-keys`.

### Hooks

Claude Code hooks (`PreToolUse`, `PostToolUse`, `Stop`) are registered globally in `~/.claude/settings.json` and run `ccm-hook` on every action for background stats tracking. The hooks always exit 0 and never block Claude Code.

### Network security

Tailscale handles all authentication — only devices on your Tailscale network can reach the server. No tokens or passwords needed.

---

## About Existing Sessions

Sessions started in Terminal.app before `ccm start` are not inside the `ccm` tmux session and cannot be streamed. Start a fresh session with `ccm new` — Claude picks up project context automatically from conversation history and `CLAUDE.md`.

---

## Troubleshooting

**No tabs on the dashboard**
Start sessions with `ccm new` — only sessions inside the `ccm` tmux session are visible.

**`ccm` command not found**
Run `npm link` inside the project directory, or use `node bin/ccm` directly.

**`ccm new` fails**
tmux must be installed: `brew install tmux`

**Phone can't reach the dashboard**
Make sure Tailscale is running and connected on both devices, then run `ccm tunnel` to get the current URL.

**Server not starting**
Check logs: `cat ~/.ccm/server.log`

---

## Development

```bash
npm test            # run all tests
npm test -- --watch # watch mode
```

---

## License

MIT
