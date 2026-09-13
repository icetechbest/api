// Mobile sidebar toggle
document.getElementById('menuBtn')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// Sections search filter
const sectionSearch = document.getElementById('sectionSearch');
if (sectionSearch) {
  sectionSearch.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#sectionList .section-card').forEach((card) => {
      card.style.display = card.dataset.name.includes(q) ? 'flex' : 'none';
    });
  });
}

// Endpoint accordion
function toggleEndpoint(i) {
  document.getElementById(`ep-${i}`)?.classList.toggle('open');
}

// Copy endpoint path — navigator.clipboard only exists on HTTPS/localhost,
// so on a plain HTTP origin (e.g. an IP:port server) it's simply undefined
// and writeText() silently does nothing. Fall back to the older
// execCommand('copy') trick, which still works over HTTP, and always give
// visible feedback so a real failure isn't mistaken for "nothing happened".
// Includes "?param=" at the end so pasting a link/value right after the
// copy is all that's needed — no manual "?url=" typing required.
async function copyPath(path, paramName, btn) {
  const full = `${window.location.origin}${path}?${paramName}=`;
  let ok = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(full);
      ok = true;
    } catch (err) {
      ok = false;
    }
  }

  if (!ok) {
    const textarea = document.createElement('textarea');
    textarea.value = full;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(textarea);
  }

  if (btn) {
    const original = btn.innerHTML;
    btn.innerHTML = ok ? 'Copied!' : 'Copy failed';
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1500);
  }
}

// For endpoints that stream a real file (e.g. MP3) instead of JSON — fetching
// and JSON.parse()-ing binary/audio data would just throw, so this instead
// navigates straight to the URL and lets the browser's own download flow
// (driven by the Content-Disposition header from the server) take over.
function downloadFile(i, path, paramName) {
  const input = document.getElementById(`ep-${i}-${paramName}`);
  const box = document.getElementById(`ep-${i}-response`);
  const value = input ? input.value.trim() : '';

  if (!value) {
    box.textContent = `Enter a value for "${paramName}" first.`;
    box.classList.add('show', 'err');
    return;
  }

  box.classList.remove('err');
  box.classList.add('show');
  box.textContent = 'Starting download… (this can take a few seconds while the server converts the audio)';

  const url = `${path}?${paramName}=${encodeURIComponent(value)}`;
  window.location.href = url;
}

// Send a live request to one of our own /api/dl/* endpoints and render the JSON result
async function sendRequest(i, path, paramName) {
  const input = document.getElementById(`ep-${i}-${paramName}`);
  const box = document.getElementById(`ep-${i}-response`);
  const value = input ? input.value.trim() : '';

  if (!value) {
    box.textContent = `Enter a value for "${paramName}" first.`;
    box.classList.add('show', 'err');
    return;
  }

  box.classList.remove('err');
  box.classList.add('show');
  box.textContent = 'Loading...';

  const url = `${path}?${paramName}=${encodeURIComponent(value)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    box.classList.toggle('err', !data.status);
    box.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    box.classList.add('err');
    box.textContent = `Request failed: ${err.message}`;
  }
}

// ---- /console page: JSON syntax coloring + generic endpoint tester ----

function highlightJSON(jsonText) {
  const escaped = jsonText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'k' : 's';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

const jsonPanel = document.getElementById('jsonPanel');
if (jsonPanel) {
  jsonPanel.innerHTML = highlightJSON(jsonPanel.textContent);
}

const testerSelect = document.getElementById('testerEndpoint');
if (testerSelect && window.__ENDPOINTS__) {
  const endpoints = window.__ENDPOINTS__;
  const bySection = {};
  endpoints.forEach((ep, idx) => {
    (bySection[ep.section] = bySection[ep.section] || []).push({ ...ep, idx });
  });

  testerSelect.innerHTML = Object.entries(bySection)
    .map(
      ([section, eps]) =>
        `<optgroup label="${section}">${eps
          .map((ep) => `<option value="${ep.idx}">${ep.method} ${ep.path}</option>`)
          .join('')}</optgroup>`
    )
    .join('');

  const paramLabel = document.getElementById('testerParamLabel');
  const paramInput = document.getElementById('testerParamInput');
  const responseBox = document.getElementById('testerResponse');

  function syncFields() {
    const ep = endpoints[Number(testerSelect.value)];
    paramLabel.textContent = ep.param;
    paramInput.placeholder = ep.example || `Value for ${ep.param}`;
    paramInput.value = '';
    responseBox.classList.remove('show', 'err');
  }

  testerSelect.addEventListener('change', syncFields);
  syncFields();

  document.getElementById('testerSendBtn').addEventListener('click', async () => {
    const ep = endpoints[Number(testerSelect.value)];
    const value = paramInput.value.trim();

    if (!value) {
      responseBox.textContent = `Enter a value for "${ep.param}" first.`;
      responseBox.classList.add('show', 'err');
      return;
    }

    responseBox.classList.remove('err');
    responseBox.classList.add('show');
    responseBox.textContent = 'Loading...';

    try {
      const res = await fetch(`${ep.path}?${ep.param}=${encodeURIComponent(value)}`);
      const data = await res.json();
      responseBox.classList.toggle('err', !data.status);
      responseBox.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      responseBox.classList.add('err');
      responseBox.textContent = `Request failed: ${err.message}`;
    }
  });
}
