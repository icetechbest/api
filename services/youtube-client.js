const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Path to the yt-dlp binary this app uses. Defaults to the standalone
 * copy fetched into ./bin/yt-dlp by scripts/install-ytdlp.js (runs
 * automatically on `npm install` — see package.json's "postinstall").
 * That avoids depending on a system-wide `yt-dlp` on PATH, which most
 * container hosts (Pterodactyl included) won't have since they don't give
 * root/apt/pip access. Override with the YTDLP_PATH env var if you'd
 * rather point at a system install (e.g. on a plain VPS where you already
 * `pip install yt-dlp`).
 */
const LOCAL_BIN = path.join(__dirname, '..', 'bin', 'yt-dlp');
const YTDLP_BIN = process.env.YTDLP_PATH || (fs.existsSync(LOCAL_BIN) ? LOCAL_BIN : 'yt-dlp');

/**
 * Extra flags appended to every yt-dlp call to work around YouTube's
 * "Sign in to confirm you're not a bot" wall on the default web client:
 *
 *  - `--extractor-args youtube:player_client=...` makes yt-dlp request the
 *    video as if from the Android/TV/mobile-web apps instead of the main
 *    website. Those clients aren't held to the same PO-token/sign-in
 *    requirement, so most public videos resolve fine without any cookies.
 *    It's a comma-separated fallback list — yt-dlp tries each in order.
 *  - If YTDLP_COOKIES points at a Netscape-format cookies.txt (exported
 *    from a real logged-in browser session), it's passed through too —
 *    this is the most reliable fix per yt-dlp's own guidance, for videos
 *    the client-spoofing trick still can't reach.
 */
function getExtraArgs() {
  const args = ['--extractor-args', 'youtube:player_client=android,tv,web'];
  if (process.env.YTDLP_COOKIES) {
    args.push('--cookies', process.env.YTDLP_COOKIES);
  }
  return args;
}

/**
 * Shared yt-dlp helpers, used by both services/youtube.js (JSON info/links)
 * and services/youtube-mp3.js (live MP3 stream).
 *
 * Everything here shells out to the `yt-dlp` CLI rather than using
 * youtubei.js (Innertube). Since ~Jan 2026 YouTube's bot-detection has been
 * blocking Innertube's WEB client (and its TV_EMBEDDED fallback) with a
 * "Sign in to confirm you're not a bot" / LOGIN_REQUIRED wall on a growing
 * number of videos. yt-dlp gets updated constantly to work around exactly
 * this, so both endpoints now go through it instead.
 *
 * By default this uses the standalone binary auto-downloaded into
 * ./bin/yt-dlp by scripts/install-ytdlp.js on `npm install` — no system
 * Python/pip required (see YTDLP_BIN below). Keep it updated occasionally
 * — YouTube changes things often enough that a stale binary will
 * eventually start failing the same way Innertube did. Update with:
 *   node scripts/install-ytdlp.js --force
 */

class YtDlpError extends Error {
  constructor(message, { loginRequired = false } = {}) {
    super(message);
    this.loginRequired = loginRequired;
  }
}

// Runs yt-dlp with the given args and resolves with all of stdout as a
// UTF-8 string. Rejects with a YtDlpError on non-zero exit (stderr message
// attached, plus a `loginRequired` flag when it looks like YouTube's bot
// wall), or the raw spawn error (e.g. ENOENT) if the binary isn't found.
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (spawnErr) => reject(spawnErr));
    child.on('close', (code) => {
      if (code !== 0) {
        const loginRequired = /sign[\s-]?in|login/i.test(err);
        reject(new YtDlpError(err.trim() || `yt-dlp exited with code ${code}`, { loginRequired }));
        return;
      }
      resolve(out);
    });
  });
}

// Runs `yt-dlp --dump-json <url>` and parses the result — the single-shot
// way to get full metadata + every available format's direct URL.
async function getVideoInfo(url) {
  const out = await runYtDlp([
    '--dump-json',
    '--no-warnings',
    '--no-playlist',
    ...getExtraArgs(),
    url
  ]);
  return JSON.parse(out.trim().split('\n')[0]);
}

// yt-dlp accepts full URLs, bare video IDs, or search terms directly, so
// this only needs to pull the 11-char ID out of common YouTube URL shapes
// for validation / dedup purposes — it does not need to hit the network.
function extractVideoId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:v=|\/videos\/|embed\/|youtu\.be\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

module.exports = { runYtDlp, getVideoInfo, extractVideoId, getExtraArgs, YtDlpError, YTDLP_BIN };
