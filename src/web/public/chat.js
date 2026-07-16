// --- identity: a stable per-browser client id owns any number of chat threads ---
function getOrCreate(key) {
  let v = localStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(key, v);
  }
  return v;
}
const clientId = getOrCreate('androg-client-id');
let currentChatId = localStorage.getItem('androg-current-chat-id') || null;

// --- setup gate ---
const setupPage = document.getElementById('setup-page');
const shellEl = document.getElementById('shell');
const setupForm = document.getElementById('setup-form');
const setupKey = document.getElementById('setup-key');
const setupError = document.getElementById('setup-error');

function showApp() {
  setupPage.hidden = true;
  shellEl.hidden = false;
}
function showSetup() {
  setupPage.hidden = false;
  shellEl.hidden = true;
}

async function checkSetup() {
  try {
    const res = await fetch('/api/setup/status');
    const data = await res.json();
    if (data.configured) {
      showApp();
      initChat();
      navigateTo(location.hash.slice(1) || 'chat');
    } else {
      showSetup();
    }
  } catch {
    showApp();
    initChat();
    navigateTo(location.hash.slice(1) || 'chat');
  }
}

setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKey = setupKey.value.trim();
  if (!apiKey) return;
  setupError.hidden = true;
  const button = setupForm.querySelector('button');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    if (data.ok) {
      showApp();
      initChat();
      navigateTo(location.hash.slice(1) || 'chat');
    } else {
      setupError.textContent = data.error || 'Something went wrong.';
      setupError.hidden = false;
    }
  } catch (err) {
    setupError.textContent = `Network error: ${err.message}`;
    setupError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Save key';
  }
});

// ============================== ROUTER ==============================

const PAGES = ['chat', 'practice', 'dashboard', 'whatsapp', 'help'];

function navigateTo(page) {
  if (!PAGES.includes(page)) page = 'chat';
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  if (page === 'dashboard') loadDashboard();
  if (page === 'whatsapp') loadWhatsApp();
}

window.addEventListener('hashchange', () => navigateTo(location.hash.slice(1)));

// ============================== CHAT ==============================

const chatEl = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const chatListEl = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const chatSidebar = document.getElementById('chat-sidebar');
const chatDrawerToggle = document.getElementById('chat-drawer-toggle');
const chatDrawerBackdrop = document.getElementById('chat-drawer-backdrop');

function openDrawer() {
  chatSidebar.classList.add('open');
  chatDrawerBackdrop.classList.add('open');
}
function closeDrawer() {
  chatSidebar.classList.remove('open');
  chatDrawerBackdrop.classList.remove('open');
}
chatDrawerToggle.addEventListener('click', () => {
  chatSidebar.classList.contains('open') ? closeDrawer() : openDrawer();
});
chatDrawerBackdrop.addEventListener('click', closeDrawer);

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

async function refreshChatList() {
  const res = await fetch(`/api/chats?clientId=${clientId}`);
  const { chats } = await res.json();
  chatListEl.innerHTML = '';
  for (const c of chats) {
    const item = document.createElement('div');
    item.className = 'chat-list-item' + (c.id === currentChatId ? ' active' : '');
    item.textContent = c.title;
    item.addEventListener('click', () => {
      switchChat(c.id);
      closeDrawer();
    });
    chatListEl.appendChild(item);
  }
  return chats;
}

async function switchChat(chatId) {
  currentChatId = chatId;
  localStorage.setItem('androg-current-chat-id', chatId);
  chatEl.innerHTML = '';
  const res = await fetch(`/api/history?sessionId=${chatId}`);
  const { history } = await res.json();
  for (const turn of history) addMessage(turn.content, turn.role === 'user' ? 'user' : 'bot');
  await refreshChatList();
}

newChatBtn.addEventListener('click', async () => {
  const res = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  const { id } = await res.json();
  await switchChat(id);
  closeDrawer();
});

async function initChat() {
  const chats = await refreshChatList();
  if (currentChatId && chats.some((c) => c.id === currentChatId)) {
    await switchChat(currentChatId);
  } else if (chats.length) {
    await switchChat(chats[0].id);
  } else {
    newChatBtn.click();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message || !currentChatId) return;
  input.value = '';
  autoGrow();
  addMessage(message, 'user');

  const status = addMessage('…thinking', 'status');
  const button = form.querySelector('button');
  button.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentChatId, message }),
    });
    const data = await res.json();
    status.remove();
    if (data.error) {
      addMessage(`Error: ${data.error}`, 'bot');
    } else {
      for (const m of data.messages) addMessage(m, 'bot');
    }
    refreshChatList(); // title/order may have changed
  } catch (err) {
    status.remove();
    addMessage(`Network error: ${err.message}`, 'bot');
  } finally {
    button.disabled = false;
    input.focus();
  }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}
input.addEventListener('input', autoGrow);

// ============================== PRACTICE ==============================

const practiceIdle = document.getElementById('practice-idle');
const practiceActive = document.getElementById('practice-active');
const practiceResult = document.getElementById('practice-result');
const practiceStartBtn = document.getElementById('practice-start-btn');
const practiceSubmitBtn = document.getElementById('practice-submit-btn');
const practiceAgainBtn = document.getElementById('practice-again-btn');

function practiceShow(which) {
  practiceIdle.hidden = which !== 'idle';
  practiceActive.hidden = which !== 'active';
  practiceResult.hidden = which !== 'result';
}

async function startPracticeChallenge() {
  practiceStartBtn.disabled = true;
  practiceStartBtn.textContent = 'Thinking of one…';
  try {
    const res = await fetch('/api/practice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentChatId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    document.getElementById('practice-lang-badge').textContent = data.challenge.language;
    document.getElementById('practice-title').textContent = data.challenge.title;
    document.getElementById('practice-prompt').textContent = data.challenge.prompt;
    document.getElementById('practice-code').value = data.challenge.starterCode || '';
    practiceShow('active');
  } catch (err) {
    alert(`Couldn't start a challenge: ${err.message}`);
  } finally {
    practiceStartBtn.disabled = false;
    practiceStartBtn.textContent = 'Start a challenge';
  }
}

practiceStartBtn.addEventListener('click', startPracticeChallenge);
practiceAgainBtn.addEventListener('click', () => {
  practiceShow('idle');
});

practiceSubmitBtn.addEventListener('click', async () => {
  const code = document.getElementById('practice-code').value;
  practiceSubmitBtn.disabled = true;
  practiceSubmitBtn.textContent = 'Running…';
  try {
    const res = await fetch('/api/practice/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentChatId, code }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const r = data.result;
    const status = r.timedOut ? 'timed out' : r.exitCode === 0 ? 'success' : `exit code ${r.exitCode}`;
    document.getElementById('practice-output').textContent =
      `Result: ${status}\n\n${r.stdout ? 'STDOUT:\n' + r.stdout : ''}${r.stderr ? '\nSTDERR:\n' + r.stderr : ''}`.trim();
    document.getElementById('practice-feedback').textContent = data.feedback;
    practiceShow('result');
  } catch (err) {
    alert(`Couldn't run/grade that: ${err.message}`);
  } finally {
    practiceSubmitBtn.disabled = false;
    practiceSubmitBtn.textContent = 'Run & grade';
  }
});

// ============================== DASHBOARD ==============================

function bar(label, value, max) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.innerHTML = `<div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-value">${value}</div>`;
  return row;
}

async function loadDashboard() {
  const res = await fetch('/api/stats');
  const stats = await res.json();

  const tiles = document.getElementById('dashboard-tiles');
  const successRate = stats.totalSnippetsRun ? Math.round((stats.runsSucceeded / stats.totalSnippetsRun) * 100) : 0;
  tiles.innerHTML = '';
  const tileData = [
    ['Messages', stats.totalMessages],
    ['Snippets run', stats.totalSnippetsRun],
    ['Success rate', `${successRate}%`],
    ['Chars read', stats.charsDelivered.toLocaleString()],
  ];
  for (const [label, value] of tileData) {
    const t = document.createElement('div');
    t.className = 'tile';
    t.innerHTML = `<div class="tile-value">${value}</div><div class="tile-label">${label}</div>`;
    tiles.appendChild(t);
  }

  const langChart = document.getElementById('lang-chart');
  langChart.innerHTML = '';
  const langEntries = Object.entries(stats.languageCounts).sort((a, b) => b[1] - a[1]);
  const langMax = Math.max(1, ...langEntries.map(([, v]) => v));
  if (!langEntries.length) langChart.innerHTML = '<p class="muted">No code run yet.</p>';
  for (const [lang, count] of langEntries) langChart.appendChild(bar(lang, count, langMax));

  const activityChart = document.getElementById('activity-chart');
  activityChart.innerHTML = '';
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const dayMax = Math.max(1, ...days.map((d) => stats.dailyActivity[d]?.messages || 0));
  for (const day of days) {
    const count = stats.dailyActivity[day]?.messages || 0;
    activityChart.appendChild(bar(day.slice(5), count, dayMax));
  }
}

// ============================== WHATSAPP ==============================

const waStatusEl = document.getElementById('wa-status');
const waStatusDot = document.getElementById('wa-status-dot');
const waPairing = document.getElementById('wa-pairing');
const waConnected = document.getElementById('wa-connected');
const waModeCard = document.getElementById('wa-mode-card');
const waGroupsCard = document.getElementById('wa-groups-card');
const waQrPanel = document.getElementById('wa-qr-panel');
const waCodePanel = document.getElementById('wa-code-panel');

document.querySelectorAll('#wa-pair-tabs .segmented-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#wa-pair-tabs .segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    waQrPanel.hidden = btn.dataset.method !== 'qr';
    waCodePanel.hidden = btn.dataset.method !== 'pairing';
    if (btn.dataset.method === 'qr') connectWhatsApp('qr');
  });
});

const waRequestCodeBtn = document.getElementById('wa-request-code-btn');
waRequestCodeBtn.addEventListener('click', async () => {
  const raw = document.getElementById('wa-phone').value.trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    waStatusDot.className = 'status-dot error';
    waStatusEl.textContent = 'That phone number looks off — country code + number, digits only, e.g. 15551234567.';
    return;
  }
  waRequestCodeBtn.disabled = true;
  waRequestCodeBtn.textContent = 'Requesting…';
  waStatusDot.className = 'status-dot';
  waStatusEl.textContent = 'Requesting a pairing code…';
  await connectWhatsApp('pairing', digits);
  waRequestCodeBtn.disabled = false;
  waRequestCodeBtn.textContent = 'Get code';
});

async function connectWhatsApp(method, phoneNumber) {
  // /api/whatsapp/connect only resolves once the state has actually moved past
  // "connecting" (QR/code ready, or failed) — so its response is already fresh and
  // rendering it directly means the very first display is never stale/expired.
  const res = await fetch('/api/whatsapp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, phoneNumber }),
  });
  applyWhatsAppStatus(await res.json());
}

document.getElementById('wa-logout-btn').addEventListener('click', async () => {
  await fetch('/api/whatsapp/logout', { method: 'POST' });
  renderWhatsAppStatus();
});

document.querySelectorAll('input[name="wa-mode"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    await fetch('/api/whatsapp/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: radio.value }),
    });
  });
});

document.getElementById('wa-group-add-btn').addEventListener('click', async () => {
  const groupJid = document.getElementById('wa-group-jid').value.trim();
  if (!groupJid) return;
  await fetch('/api/whatsapp/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupJid, allowed: true }),
  });
  document.getElementById('wa-group-jid').value = '';
  renderWhatsAppSettings();
});

async function removeGroup(groupJid) {
  await fetch('/api/whatsapp/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupJid, allowed: false }),
  });
  renderWhatsAppSettings();
}

async function renderWhatsAppSettings() {
  const res = await fetch('/api/whatsapp/settings');
  const settings = await res.json();
  document.querySelectorAll('input[name="wa-mode"]').forEach((r) => (r.checked = r.value === settings.mode));
  const list = document.getElementById('wa-group-list');
  list.innerHTML = '';
  for (const jid of settings.allowedGroups) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${jid}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => removeGroup(jid));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

let waPollTimer = null;
const WA_POLL_MS = 1200; // fast: a pairing code is only valid briefly, don't sit on a stale one

async function renderWhatsAppStatus() {
  const res = await fetch('/api/whatsapp/status');
  applyWhatsAppStatus(await res.json());
}

function applyWhatsAppStatus(status) {
  if (status.state === 'connected') {
    waStatusDot.className = 'status-dot live';
    waStatusEl.textContent = 'Connected';
    waPairing.hidden = true;
    waConnected.hidden = false;
    waModeCard.hidden = false;
    waGroupsCard.hidden = false;
    document.getElementById('wa-phone-display').textContent = status.phoneNumber || '(unknown)';
    renderWhatsAppSettings();
    clearInterval(waPollTimer);
    waPollTimer = null;
    return;
  }

  waConnected.hidden = true;
  waModeCard.hidden = true;
  waGroupsCard.hidden = true;
  waPairing.hidden = false;
  document.getElementById('wa-code-help').hidden = true;

  if (status.state === 'qr_pending' && status.qrDataUrl) {
    waStatusDot.className = 'status-dot';
    waStatusEl.textContent = 'Scan the QR code below.';
    document.getElementById('wa-qr-img').src = status.qrDataUrl;
  } else if (status.state === 'pairing_code_pending' && status.pairingCode) {
    waStatusDot.className = 'status-dot';
    waStatusEl.textContent = 'Enter this code in WhatsApp — now, before it expires.';
    document.getElementById('wa-pairing-code').textContent = status.pairingCode;
    document.getElementById('wa-code-help').hidden = false;
  } else if (status.state === 'connecting') {
    waStatusDot.className = 'status-dot';
    waStatusEl.textContent = 'Connecting…';
  } else if (status.lastError) {
    waStatusDot.className = 'status-dot error';
    waStatusEl.textContent = status.lastError;
  } else {
    waStatusDot.className = 'status-dot';
    waStatusEl.textContent = 'Not connected. Pick a pairing method below.';
  }

  if (!waPollTimer) waPollTimer = setInterval(renderWhatsAppStatus, WA_POLL_MS);
}

async function loadWhatsApp() {
  const activeTab = document.querySelector('#wa-pair-tabs .segmented-btn.active')?.dataset.method || 'qr';
  await renderWhatsAppStatus();
  const res = await fetch('/api/whatsapp/status');
  const status = await res.json();
  if (status.state === 'disconnected' && activeTab === 'qr') connectWhatsApp('qr');
}

checkSetup();
