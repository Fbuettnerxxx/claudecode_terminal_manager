const { spawn, execSync } = require('child_process');

function startCloudflareTunnel(port, onUrl) {
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let urlReported = false;
  const capture = (data) => {
    if (urlReported) return;
    const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) { urlReported = true; onUrl(match[0]); }
  };

  proc.stdout.on('data', capture);
  proc.stderr.on('data', capture);

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('cloudflared not found. Install with: brew install cloudflared');
    }
  });

  return proc;
}

function isCloudflareAvailable() {
  try { execSync('which cloudflared 2>/dev/null'); return true; } catch (_) { return false; }
}

module.exports = { startCloudflareTunnel, isCloudflareAvailable };
