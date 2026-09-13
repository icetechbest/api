const fs = require('fs');
const path = require('path');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const { DownloaderError } = require('./http');

// The owner's session lives here once logged in. Never commit this file —
// anyone who has it can act as the linked Telegram account.
const SESSION_PATH = process.env.TELEGRAM_SESSION_PATH || path.join(__dirname, '..', 'data', 'telegram.session');

function readSavedSession() {
  try {
    return fs.readFileSync(SESSION_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

function saveSession(sessionString) {
  fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
  fs.writeFileSync(SESSION_PATH, sessionString, 'utf8');
}

let client = null;
// Holds the phoneCodeHash between the "start login" and "verify code" REST
// calls — those are two separate HTTP requests, so nothing can be kept on a
// local variable the way Telethon's interactive prompts do.
let pendingLogin = null;

function getApiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) {
    throw new DownloaderError(
      'TELEGRAM_API_ID / TELEGRAM_API_HASH are not set. Get them from https://my.telegram.org and add them to .env.',
      'TELEGRAM_NOT_CONFIGURED'
    );
  }
  return { apiId, apiHash };
}

// Returns a connected client, reusing the one saved session for the whole
// app's lifetime — there is exactly one linked account, shared by every
// generated bot endpoint.
async function getClient() {
  if (client && client.connected) return client;

  const { apiId, apiHash } = getApiCredentials();
  const session = new StringSession(readSavedSession());
  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5
  });
  await client.connect();
  return client;
}

async function isAuthorized() {
  try {
    const c = await getClient();
    return await c.isUserAuthorized();
  } catch {
    return false;
  }
}

// Step 1: send the login code to the phone number on the linked account.
async function startLogin(phone) {
  const { apiId, apiHash } = getApiCredentials();
  const c = await getClient();

  const result = await c.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({})
    })
  );

  pendingLogin = { phone, phoneCodeHash: result.phoneCodeHash };
  return { sent: true };
}

// Step 2: verify the code. If Telegram requires 2FA, this throws
// PASSWORD_REQUIRED and the caller should collect a password and call
// verifyPassword() next — the account stays unauthenticated until then.
async function verifyCode(code) {
  if (!pendingLogin) {
    throw new DownloaderError('No login in progress — call startLogin first.', 'NO_PENDING_LOGIN');
  }
  const c = await getClient();

  try {
    const result = await c.invoke(
      new Api.auth.SignIn({
        phoneNumber: pendingLogin.phone,
        phoneCodeHash: pendingLogin.phoneCodeHash,
        phoneCode: code
      })
    );
    pendingLogin = null;
    saveSession(c.session.save());
    return { linked: true, user: result.user };
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      throw new DownloaderError('This account has two-step verification — a password is required.', 'PASSWORD_REQUIRED');
    }
    throw new DownloaderError('The code was rejected: ' + (err.errorMessage || err.message), 'INVALID_CODE');
  }
}

// Step 3 (only if 2FA is on): finish the login with the account's password.
async function verifyPassword(password) {
  const c = await getClient();
  const passwordInfo = await c.invoke(new Api.account.GetPassword());
  const check = await computeCheck(passwordInfo, password);
  const result = await c.invoke(new Api.auth.CheckPassword({ password: check }));
  pendingLogin = null;
  saveSession(c.session.save());
  return { linked: true, user: result.user };
}

module.exports = { getClient, isAuthorized, startLogin, verifyCode, verifyPassword };
