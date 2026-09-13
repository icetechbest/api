const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Downloads the standalone `yt-dlp_linux` build (a self-contained
 * executable with Python bundled in — no system Python/pip needed) into
 * ./bin/yt-dlp on every `npm install`.
 *
 * This exists because Pterodactyl (and most shared-hosting containers)
 * give the app's own directory write access but NOT root/apt/pip access,
 * so a normal `pip install yt-dlp` has nowhere to go. Shipping the binary
 * inside the project directory sidesteps that entirely — it only needs
 * outbound HTTPS access, which every deployment here already has.
 *
 * Safe to re-run: skips the download if ./bin/yt-dlp already exists. To
 * force an update (recommended occasionally — YouTube changes often),
 * delete bin/yt-dlp and run `npm install` again, or `node scripts/install-ytdlp.js --force`.
 */

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'yt-dlp');
const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
const FORCE = process.argv.includes('--force');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'devx-api-installer' } }, (res) => {
        // GitHub's release download URLs 302-redirect to the actual asset host.
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  if (fs.existsSync(BIN_PATH) && !FORCE) {
    console.log('[install-ytdlp] bin/yt-dlp already present, skipping. (use --force to re-download)');
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log('[install-ytdlp] downloading standalone yt-dlp binary...');

  try {
    await download(DOWNLOAD_URL, BIN_PATH);
    fs.chmodSync(BIN_PATH, 0o755);
    console.log('[install-ytdlp] done ->', BIN_PATH);
  } catch (err) {
    // Non-fatal: don't break `npm install` over this. The YouTube routes
    // will just report YTDLP_NOT_INSTALLED until this is retried, e.g. if
    // the container has no outbound internet during build.
    console.error('[install-ytdlp] failed to download yt-dlp:', err.message);
    console.error('[install-ytdlp] YouTube endpoints will not work until this succeeds.');
    console.error('[install-ytdlp] retry manually with: node scripts/install-ytdlp.js --force');
  }
}

main();
