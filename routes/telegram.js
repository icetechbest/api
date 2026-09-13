const express = require('express');
const router = express.Router();

const tgClient = require('../services/telegram-client');
const { sendAndWait } = require('../services/telegram-bridge');
const { DownloaderError } = require('../services/http');
const botStore = require('../utils/bot-store');
const { parseBotReply } = require('../utils/parse-reply');

// Everything here can act as, or reconfigure, the linked Telegram account —
// gate it behind ADMIN_TOKEN so a public visitor can't relink your number or
// delete your generated bots. Only the generated bot endpoints (bottom of
// this file) are meant to be public.
function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    return res.status(500).json({
      status: false,
      code: 'ADMIN_TOKEN_NOT_SET',
      message: 'Set ADMIN_TOKEN in config.js before using the Telegram admin routes.'
    });
  }
  if (req.session && req.session.authed) return next(); // logged into the site in this browser
  const provided = req.get('x-admin-token');
  if (provided !== configured) {
    return res.status(401).json({ status: false, code: 'UNAUTHORIZED', message: 'Missing or invalid x-admin-token header.' });
  }
  next();
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err instanceof DownloaderError ? err.code : 'INTERNAL_ERROR';
      const message = err instanceof DownloaderError ? err.message : 'Something went wrong.';
      const httpStatus = { NOT_LINKED: 400, BOT_NOT_FOUND: 404, BOT_TIMEOUT: 504 }[code] || 500;
      res.status(httpStatus).json({ status: false, code, message });
    }
  };
}

// Standard query parsers (Express's req.query, Node's querystring, qs, even
// WHATWG URLSearchParams) all decode a literal "+" in the query string as a
// space — that's application/x-www-form-urlencoded behavior, meant for HTML
// forms, not REST query params. That's the actual reason a phone number
// like "+201554724008" ends up as " 201554724008" by the time our code sees
// it: nothing in this file changed it, the framework's default parser did.
// For this endpoint specifically we bypass that by reading the value
// straight off the raw URL and decoding only %XX escapes, leaving "+" as
// a literal plus. This makes both "?input=+2015..." and "?input=%2B2015..."
// work identically and exactly as typed.
function getRawQueryParam(req, key) {
  const idx = req.originalUrl.indexOf('?');
  if (idx === -1) return undefined;
  const query = req.originalUrl.slice(idx + 1);
  for (const pair of query.split('&')) {
    const eqIdx = pair.indexOf('=');
    const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    if (decodeURIComponent(rawKey) !== key) continue;
    const rawValue = eqIdx === -1 ? '' : pair.slice(eqIdx + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue; // malformed %-escape — fall back to the raw text
    }
  }
  return undefined;
}

// ---- Account linking (admin only) ------------------------------------

router.get('/telegram/status', requireAdmin, wrap(async (req, res) => {
  const linked = await tgClient.isAuthorized();
  res.json({ status: true, result: { linked } });
}));

router.post('/telegram/login/start', requireAdmin, wrap(async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ status: false, code: 'MISSING_PHONE', message: '"phone" is required, e.g. +201234567890' });
  const result = await tgClient.startLogin(phone);
  res.json({ status: true, result });
}));

router.post('/telegram/login/verify', requireAdmin, wrap(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ status: false, code: 'MISSING_CODE', message: '"code" is required.' });
  const result = await tgClient.verifyCode(code);
  res.json({ status: true, result });
}));

router.post('/telegram/login/password', requireAdmin, wrap(async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ status: false, code: 'MISSING_PASSWORD', message: '"password" is required.' });
  const result = await tgClient.verifyPassword(password);
  res.json({ status: true, result });
}));

// ---- Generated bot-APIs (admin manages, everyone can call) -----------

router.get('/telegram/bots', requireAdmin, wrap(async (req, res) => {
  res.json({ status: true, result: botStore.list() });
}));

router.post('/telegram/bots', requireAdmin, wrap(async (req, res) => {
  const { name, botUsername, inputType, description, timeoutMs } = req.body;
  try {
    const bot = botStore.create({ name, botUsername, inputType, description, timeoutMs });
    res.json({ status: true, result: bot });
  } catch (err) {
    res.status(400).json({ status: false, code: 'INVALID_BOT', message: err.message });
  }
}));

router.delete('/telegram/bots/:id', requireAdmin, wrap(async (req, res) => {
  const removed = botStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ status: false, code: 'NOT_FOUND', message: 'No bot with that id.' });
  res.json({ status: true, result: { removed: true } });
}));

// ---- Public: call a generated bot as a plain API ----------------------
// GET /api/bot/:id?input=... — this is the endpoint end users actually hit.
router.get('/bot/:id', wrap(async (req, res) => {
  const bot = botStore.get(req.params.id);
  if (!bot) return res.status(404).json({ status: false, code: 'NOT_FOUND', message: 'No generated bot with that id.' });

  const input = getRawQueryParam(req, 'input');
  if (!input) {
    return res.status(400).json({ status: false, code: 'MISSING_INPUT', message: 'Query parameter "input" is required.' });
  }

  if (!botStore.validateInput(bot.inputType, input)) {
    return res.status(400).json({
      status: false,
      code: 'INVALID_INPUT',
      message: `"input" doesn't look like a valid ${bot.inputType} — this bot only accepts ${bot.inputType} input.`
    });
  }

  // Log the exact bytes we're about to relay, so it's easy to verify from
  // the server console that nothing gets added/changed before it reaches
  // the bot — "+" is preserved literally now instead of becoming a space.
  console.log(`[bot:${bot.id}] relaying input verbatim -> "${input}" (length ${input.length})`);

  const started = Date.now();
  const reply = await sendAndWait(bot.botUsername, input, bot.timeoutMs);
  res.json({
    status: true,
    took_ms: Date.now() - started,
    data: parseBotReply(reply.text),
    hasMedia: reply.hasMedia
  });
}));

module.exports = router;
