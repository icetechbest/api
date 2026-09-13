const { NewMessage } = require('telegram/events');

// The "telegram" npm package's `telegram/events` barrel index does NOT
// re-export EditedMessage in every published version (confirmed: v2.26.22
// gives `undefined` for it there) — but the library's own internal code
// (TelegramClient.ts) imports it straight from the submodule instead:
//   import { EditedMessage } from "../events/EditedMessage";
// so we do the same here, with the barrel as a fallback in case a future/
// older version DOES export it from the top level, and a clear diagnostic
// dump if somehow neither path works.
let EditedMessage;
try {
  ({ EditedMessage } = require('telegram/events/EditedMessage'));
} catch {
  // ignore — fall through to the barrel attempt below
}
if (typeof EditedMessage !== 'function') {
  const barrel = require('telegram/events');
  EditedMessage = barrel.EditedMessage;
}
if (typeof EditedMessage !== 'function') {
  console.log('[tg-bridge] DIAGNOSTIC: could not resolve EditedMessage from either path. telegram/events keys:', Object.keys(require('telegram/events')));
}
const { getClient } = require('./telegram-client');
const { DownloaderError } = require('./http');

// The single linked Telegram account can only be "talking" to one bot at a
// time from our side. If two HTTP requests land at once, two `NewMessage`
// handlers used to be alive simultaneously, and whichever bot reply arrived
// first got handed to *both* pending promises — so request A could receive
// the reply meant for request B (or a stray leftover message). We fix that
// two ways:
//   1. A per-account queue: requests to sendAndWait run one at a time.
//   2. Filter incoming messages by timestamp (only accept messages sent
//      after we sent ours) as a second safety net.
let queue = Promise.resolve();

function runExclusive(fn) {
  const result = queue.then(fn, fn);
  // Swallow errors here so one failed request doesn't jam the queue for
  // the next one; the real error still propagates via `result`.
  queue = result.catch(() => {});
  return result;
}

// Many lookup/search bots don't answer in one shot — they first send a
// "please wait" placeholder, then either send a second message with the
// real result, or edit the placeholder in place once it's ready. A message
// matching one of these is treated as a placeholder, not the final answer.
const LOADING_PATTERNS = [
  /جار[ي]?\s*(ال)?بحث/i,
  /جار[ي]?\s*(ال)?معالجة/i,
  /جار[ي]?\s*(ال)?تحميل/i,
  /برجاء\s*الانتظار/i,
  /من\s*فضلك\s*انتظر/i,
  /^\s*(searching|loading|please wait|processing|fetching)\b/i,
  /\.\.\.\s*$/,
  /[⏳⌛🔍🔎]/
];

function isLoadingMessage(text) {
  const t = (text || '').trim();
  if (!t) return false;
  // Genuine "please wait" placeholders are always a short phrase — a few
  // words, sometimes trailing "...". A real final answer with actual data
  // (name/carrier/location/etc.) is longer, and can easily end in "..."
  // itself (a footer, a truncated field) or happen to contain a word like
  // "بحث" inside a longer sentence — that used to get misclassified as
  // still-loading and silently ignored forever, causing a false BOT_TIMEOUT
  // even though the bot's real answer had already arrived. Gate on length
  // first so long answers are never mistaken for a placeholder.
  if (t.length > 60) return false;
  return LOADING_PATTERNS.some((re) => re.test(t));
}

// Sends `text` to `botUsername` from the linked account and waits for that
// bot's *final* message back — skipping past any "loading/searching"
// placeholder it sends first, whether the real answer arrives as a new
// message or as an edit to the placeholder.
async function sendAndWait(botUsername, text, timeoutMs = 15000) {
  return runExclusive(() => sendAndWaitOnce(botUsername, text, timeoutMs));
}

async function sendAndWaitOnce(botUsername, text, timeoutMs) {
  const client = await getClient();

  if (!(await client.isUserAuthorized())) {
    throw new DownloaderError('No Telegram account is linked yet. Finish login first.', 'NOT_LINKED');
  }

  const entity = await client.getEntity(botUsername).catch(() => null);
  if (!entity) {
    throw new DownloaderError(`Could not find a Telegram user/bot "${botUsername}".`, 'BOT_NOT_FOUND');
  }

  // Set TELEGRAM_BRIDGE_DEBUG=0 to silence — on by default so the very
  // next test run shows exactly what's happening in the server logs
  // (Termux console / `vercel logs`) instead of us having to guess.
  const DEBUG = process.env.TELEGRAM_BRIDGE_DEBUG !== '0';
  const log = (...args) => { if (DEBUG) console.log('[tg-bridge]', ...args); };
  const preview = (t) => {
    const s = (t || '').replace(/\s+/g, ' ').trim();
    return s ? (s.length > 120 ? s.slice(0, 120) + '…' : s) : '[empty]';
  };

  // Build both event filters ONCE, up front, and reuse the exact same
  // instances for addEventHandler + removeEventHandler later. This used to
  // build a *new* `new EditedMessage({})` inline every time (once at
  // registration, again inside cleanup()). If that constructor ever throws
  // — e.g. a broken/mismatched "telegram" package install — the first throw
  // happened synchronously inside the Promise executor and auto-rejected
  // the promise WITHOUT ever clearing the 15s timer that had already been
  // armed. That orphaned timer would then fire later, call cleanup() again,
  // throw *again*, this time inside a raw setTimeout callback with nothing
  // to catch it — which crashes the entire Node process. Building the
  // filters here, before any timer exists, turns that into one clean,
  // immediate, catchable error instead of a delayed full-process crash.
  let newMessageFilter;
  let editedMessageFilter;
  try {
    newMessageFilter = new NewMessage({});
    editedMessageFilter = new EditedMessage({});
  } catch (err) {
    let pkgVersion = 'unknown';
    try { pkgVersion = require('telegram/package.json').version; } catch {}
    log('FATAL: could not construct Telegram event filters.', {
      error: err.message,
      'typeof NewMessage': typeof NewMessage,
      'typeof EditedMessage': typeof EditedMessage,
      installedTelegramPkgVersion: pkgVersion
    });
    throw new DownloaderError(
      `Telegram event listeners failed to initialize (${err.message}). ` +
      `This points to a broken/mismatched "telegram" npm package install — try deleting node_modules and package-lock.json then reinstalling.`,
      'EVENTS_INIT_FAILED'
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let sentAtSeconds = 0; // Telegram message .date is in unix seconds.
    let placeholderId = null; // message id of the "loading..." message, if seen
    let timer = null;

    const cleanup = () => {
      try {
        client.removeEventHandler(newHandler, newMessageFilter);
        client.removeEventHandler(editHandler, editedMessageFilter);
      } catch (err) {
        // Never let cleanup itself crash the process — worst case we leak
        // one handler, which is far better than taking the whole bot down.
        log('cleanup() error (non-fatal):', err.message);
      }
      clearTimeout(timer);
    };

    const armTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        log('TIMEOUT — no message accepted as final answer.', { placeholderId, timeoutMs });
        reject(new DownloaderError(`Bot "${botUsername}" did not reply within ${timeoutMs}ms.`, 'BOT_TIMEOUT'));
      }, timeoutMs);
    };

    const finish = (msg, via) => {
      settled = true;
      cleanup();
      log('FINISH via', via, '-> id', msg.id, 'text:', preview(msg.message), 'hasMedia:', Boolean(msg.media));
      resolve({
        text: msg.message || '',
        hasMedia: Boolean(msg.media),
        date: msg.date
      });
    };

    // Handles brand-new messages from the bot.
    const newHandler = (event) => {
      try {
        const msg = event.message;
        if (!msg) return;
        log('newMessage event <- senderId:', msg && msg.senderId, 'expected entity.id:', entity.id,
          'id:', msg && msg.id, 'date:', msg && msg.date, 'sentAtSeconds:', sentAtSeconds,
          'text:', preview(msg && msg.message), 'hasMedia:', Boolean(msg && msg.media));
        if (settled) { log('  -> dropped: already settled'); return; }
        if (String(msg.senderId) !== String(entity.id)) { log('  -> dropped: senderId mismatch'); return; }
        // Ignore anything that isn't actually a reply to *this* request —
        // e.g. a message that was already in flight before we sent ours.
        if (sentAtSeconds && msg.date < sentAtSeconds) { log('  -> dropped: older than our sent message'); return; }

        const text = msg.message || '';
        if (isLoadingMessage(text)) {
          // Remember it in case the bot edits *this* message with the real
          // result, and give it a fresh full timeout window to finish.
          placeholderId = msg.id;
          log('  -> treated as LOADING placeholder, waiting for edit/next message. id:', placeholderId);
          armTimeout();
          return;
        }

        finish(msg, 'newMessage');
      } catch (err) {
        // An event handler is called directly by GramJS's update loop — an
        // uncaught throw here would crash the whole process, not just this
        // one request. Log it and let this request time out normally instead.
        log('newHandler threw (non-fatal, swallowed):', err.message);
      }
    };

    // Handles the bot editing a message it already sent (commonly used to
    // turn a "searching..." placeholder into the final result in place).
    const editHandler = (event) => {
      try {
        const msg = event.message;
        if (!msg) return;
        log('editedMessage event <- senderId:', msg && msg.senderId, 'expected entity.id:', entity.id,
          'id:', msg && msg.id, 'placeholderId:', placeholderId,
          'text:', preview(msg && msg.message), 'hasMedia:', Boolean(msg && msg.media));
        if (settled) { log('  -> dropped: already settled'); return; }
        if (String(msg.senderId) !== String(entity.id)) { log('  -> dropped: senderId mismatch'); return; }
        if (sentAtSeconds && msg.date < sentAtSeconds) { log('  -> dropped: older than our sent message'); return; }
        // Only act on edits to the placeholder we're tracking (or, if we
        // never saw a placeholder, any edited message from the bot).
        if (placeholderId && msg.id !== placeholderId) { log('  -> dropped: not the tracked placeholder id'); return; }

        const text = msg.message || '';
        if (isLoadingMessage(text)) { log('  -> still looks like a loading message, ignoring'); return; }

        finish(msg, 'editedMessage');
      } catch (err) {
        log('editHandler threw (non-fatal, swallowed):', err.message);
      }
    };

    armTimeout();

    // Register handlers BEFORE sending so we can't miss a fast reply, then
    // record the exact send time to filter out stale messages above.
    client.addEventHandler(newHandler, newMessageFilter);
    client.addEventHandler(editHandler, editedMessageFilter);

    log('sending to', botUsername, '(entity.id=' + entity.id + ')', 'text:', preview(text));

    client.sendMessage(entity, { message: text }).then((sentMsg) => {
      // sentMsg.date is when Telegram accepted our outgoing message —
      // use it (falling back to "now") as the cutoff for valid replies.
      sentAtSeconds = (sentMsg && sentMsg.date) || Math.floor(Date.now() / 1000);
      log('sent OK, sentAtSeconds:', sentAtSeconds);
    }).catch((err) => {
      if (settled) return;
      settled = true;
      cleanup();
      log('SEND FAILED:', err.message);
      reject(new DownloaderError('Failed to send message to bot: ' + err.message, 'SEND_FAILED'));
    });
  });
}

module.exports = { sendAndWait };
