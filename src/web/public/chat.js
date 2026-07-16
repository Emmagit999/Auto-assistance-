const chatEl = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const setupSection = document.getElementById('setup');
const setupForm = document.getElementById('setup-form');
const setupKey = document.getElementById('setup-key');
const setupError = document.getElementById('setup-error');

const sessionId = (() => {
  let id = localStorage.getItem('androg-session-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('androg-session-id', id);
  }
  return id;
})();

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function showChat() {
  setupSection.hidden = true;
  chatEl.hidden = false;
  form.hidden = false;
}

function showSetup() {
  setupSection.hidden = false;
  chatEl.hidden = true;
  form.hidden = true;
}

async function checkSetup() {
  try {
    const res = await fetch('/api/setup/status');
    const data = await res.json();
    if (data.configured) showChat();
    else showSetup();
  } catch {
    showChat(); // don't block the UI if the check itself fails
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
      showChat();
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

checkSetup();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  addMessage(message, 'user');

  const status = addMessage('…thinking', 'status');
  const button = form.querySelector('button');
  button.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    });
    const data = await res.json();
    status.remove();
    if (data.error) {
      addMessage(`Error: ${data.error}`, 'bot');
    } else {
      for (const m of data.messages) addMessage(m, 'bot');
    }
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
