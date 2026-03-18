let socket;
let windows = [];
let activeWindow = null;

function getToken() {
  return new URLSearchParams(location.search).get('token') || '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = getToken();
  socket = new WebSocket(`${proto}://${location.host}${token ? '?token=' + token : ''}`);

  socket.onopen = () => setDot(true);
  socket.onclose = () => { setDot(false); setTimeout(connect, 3000); };

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'windows') {
      const names = msg.windows.map(w => w.name);
      windows = msg.windows;
      renderTabs();
      // Auto-select first window; if active window was removed, switch to first
      if (!activeWindow || !names.includes(activeWindow)) {
        if (windows.length > 0) selectWindow(windows[0].name);
        else showPlaceholder();
      }
    } else if (msg.type === 'pane') {
      if (msg.window === activeWindow) updateTerminal(msg.content);
    }
  };
}

function setDot(on) {
  const d = document.getElementById('conn-dot');
  d.className = 'dot ' + (on ? 'on' : 'off');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function renderTabs() {
  const el = document.getElementById('tabs');
  if (windows.length === 0) {
    el.innerHTML = '<span style="font-size:12px;color:#555;padding:6px 4px">No sessions</span>';
    return;
  }
  el.innerHTML = windows.map(w =>
    `<div class="tab${w.name === activeWindow ? ' active' : ''}">
      <span onclick="selectWindow('${escapeHtml(w.name)}')">${escapeHtml(w.name)}</span>
      <button class="tab-close" onclick="closeWindow('${escapeHtml(w.name)}')" title="Close">×</button>
    </div>`
  ).join('');
  // Scroll active tab into view
  const active = el.querySelector('.tab.active');
  if (active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function closeWindow(name) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'close', window: name }));
}

function selectWindow(name) {
  activeWindow = name;
  renderTabs();
  document.getElementById('terminal-out').textContent = '';
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'select', window: name }));
  }
}

// ── Terminal ──────────────────────────────────────────────────────────────────

function updateTerminal(content) {
  const wrap = document.getElementById('terminal-wrap');
  const pre  = document.getElementById('terminal-out');
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 60;
  pre.textContent = content;
  if (atBottom) wrap.scrollTop = wrap.scrollHeight;
}

function showPlaceholder() {
  document.getElementById('terminal-out').innerHTML =
    '<span class="placeholder">No active sessions.\nTap ＋ to start one.</span>';
}

// ── Input ─────────────────────────────────────────────────────────────────────

function doSend() {
  const input = document.getElementById('term-input');
  const text = input.value;
  if (!text || !activeWindow || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'input', window: activeWindow, text }));
  input.value = '';
  input.style.height = '';
}

document.getElementById('send-btn').addEventListener('click', doSend);

document.getElementById('term-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
});

document.getElementById('term-input').addEventListener('input', function () {
  this.style.height = '';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// ── New session modal ─────────────────────────────────────────────────────────

document.getElementById('new-tab-btn').addEventListener('click', showModal);

function showModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('m-label').focus(), 50);
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('m-label').value = '';
  document.getElementById('m-cwd').value = '';
  document.getElementById('m-error').classList.add('hidden');
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) hideModal();
}

async function submitNew() {
  const label  = document.getElementById('m-label').value.trim();
  const cwd    = document.getElementById('m-cwd').value.trim();
  const errEl  = document.getElementById('m-error');
  const btn    = document.getElementById('m-submit');

  errEl.classList.add('hidden');
  if (!label) { errEl.textContent = 'Label required'; errEl.classList.remove('hidden'); return; }
  if (!cwd)   { errEl.textContent = 'Directory required'; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  btn.textContent = 'Starting…';

  const token = getToken();
  try {
    const res  = await fetch(`/api/sessions/new${token ? '?token=' + token : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, cwd }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Error starting session';
      errEl.classList.remove('hidden');
    } else {
      hideModal();
      // New window will appear in the tab bar via the next WebSocket poll (≤300ms)
    }
  } catch (_) {
    errEl.textContent = 'Network error';
    errEl.classList.remove('hidden');
  }

  btn.disabled = false;
  btn.textContent = 'Start Session →';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
connect();
