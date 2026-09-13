// ---- /console page: Telegram account linking + generated bots panel ----
// Runs only when the relevant elements exist (i.e. we're on /console).

(function () {
  const statusLine = document.getElementById('tgStatusLine');
  if (!statusLine) return; // not on the console page

  const stepPhone = document.getElementById('tgStepPhone');
  const stepCode = document.getElementById('tgStepCode');
  const stepPassword = document.getElementById('tgStepPassword');
  const authResponse = document.getElementById('tgAuthResponse');

  function showResponse(el, data, isError) {
    el.classList.add('show');
    el.classList.toggle('err', Boolean(isError));
    el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  // Browser requests are already authenticated via the site login session
  // (cookie), so no x-admin-token header is needed here — see requireAdmin
  // in routes/telegram.js.
  async function callAdmin(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    const data = await res.json();
    return { ok: res.ok, data };
  }

  async function refreshStatus() {
    try {
      const res = await fetch('/api/telegram/status', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status && data.result.linked) {
        statusLine.textContent = 'Linked ✓ — this server can message bots as your account.';
        stepPhone.style.display = 'none';
        stepCode.style.display = 'none';
        stepPassword.style.display = 'none';
      } else {
        statusLine.textContent = 'Not linked yet — enter your phone number to start.';
      }
    } catch (err) {
      statusLine.textContent = 'Could not check status: ' + err.message;
    }
  }

  document.getElementById('tgSendCodeBtn').addEventListener('click', async () => {
    const phone = document.getElementById('tgPhone').value.trim();
    if (!phone) return showResponse(authResponse, 'Enter a phone number first.', true);
    showResponse(authResponse, 'Sending code…', false);
    const { ok, data } = await callAdmin('/api/telegram/login/start', { phone });
    showResponse(authResponse, data, !ok);
    if (ok) stepCode.style.display = 'block';
  });

  document.getElementById('tgVerifyCodeBtn').addEventListener('click', async () => {
    const code = document.getElementById('tgCode').value.trim();
    if (!code) return showResponse(authResponse, 'Enter the code first.', true);
    showResponse(authResponse, 'Verifying…', false);
    const { ok, data } = await callAdmin('/api/telegram/login/verify', { code });
    showResponse(authResponse, data, !ok);
    if (ok) {
      refreshStatus();
    } else if (data.code === 'PASSWORD_REQUIRED') {
      stepPassword.style.display = 'block';
    }
  });

  document.getElementById('tgVerifyPasswordBtn').addEventListener('click', async () => {
    const password = document.getElementById('tgPassword').value;
    if (!password) return showResponse(authResponse, 'Enter your password first.', true);
    showResponse(authResponse, 'Verifying…', false);
    const { ok, data } = await callAdmin('/api/telegram/login/password', { password });
    showResponse(authResponse, data, !ok);
    if (ok) refreshStatus();
  });

  refreshStatus();

  // ---- Bot management ----

  const botResponse = document.getElementById('tgBotResponse');

  document.getElementById('tgAddBotBtn').addEventListener('click', async () => {
    const name = document.getElementById('tgBotName').value.trim();
    const botUsername = document.getElementById('tgBotUsername').value.trim();
    const inputType = document.getElementById('tgBotInputType').value;
    const description = document.getElementById('tgBotDescription').value.trim();

    if (!name || !botUsername) {
      return showResponse(botResponse, 'Display name and bot username are required.', true);
    }

    showResponse(botResponse, 'Adding…', false);
    const { ok, data } = await callAdmin('/api/telegram/bots', { name, botUsername, inputType, description });
    showResponse(botResponse, data, !ok);
    if (ok) setTimeout(() => window.location.reload(), 600);
  });

  document.querySelectorAll('.tgDeleteBotBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this bot API?')) return;
      const res = await fetch(`/api/telegram/bots/${btn.dataset.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const data = await res.json();
      showResponse(botResponse, data, !res.ok);
      if (res.ok) setTimeout(() => window.location.reload(), 400);
    });
  });
})();
