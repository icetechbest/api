const { client, DownloaderError } = require('./http');

/**
 * Resolves a public SoundCloud track URL into a direct, playable stream
 * link plus metadata.
 *
 * SoundCloud's public track pages embed the full track object (title,
 * artwork, duration, and a list of "transcodings" — one URL per audio
 * format) in a `window.__sc_hydration` JSON blob. Each transcoding URL is
 * itself just a *resolver* endpoint, not the final file — hitting it
 * (with a valid `client_id`) returns one more JSON object containing the
 * real, temporary CDN stream URL.
 *
 * The `client_id` is SoundCloud's public web-app key, not a secret — it's
 * embedded in one of the page's own JS bundles and rotates occasionally.
 * This scrapes it fresh from the page's script tags rather than
 * hardcoding it, so it keeps working after SoundCloud rotates the key.
 */
async function soundcloud(url) {
  if (!/soundcloud\.com\//i.test(url)) {
    throw new DownloaderError('That does not look like a valid SoundCloud track URL.', 'INVALID_URL');
  }

  const { data: html, status } = await client.get(url, { maxRedirects: 5 });
  if (status >= 400) {
    throw new DownloaderError('This SoundCloud track could not be reached. Check the URL and try again.', 'NOT_FOUND');
  }

  const track = extractTrack(html);
  if (!track) {
    throw new DownloaderError('Could not read track data from this page. It may be private or geo-blocked.', 'NOT_FOUND');
  }

  const transcodings = track.media?.transcodings || [];
  if (transcodings.length === 0) {
    throw new DownloaderError('This track has no streamable audio (it may be blocked or a Go+ exclusive).', 'NOT_FOUND');
  }

  const clientId = await getClientId(html);
  if (!clientId) {
    throw new DownloaderError('Could not resolve a SoundCloud client ID right now. Try again shortly.', 'DOWNLOAD_FAILED');
  }

  // Prefer a plain progressive MP3 stream (single file, no HLS playlist)
  // when SoundCloud offers one; otherwise fall back to whatever's first
  // (usually an HLS .m3u8 playlist, still playable by most players).
  const progressive = transcodings.find((t) => t.format?.protocol === 'progressive') || transcodings[0];

  let streamUrl = null;
  try {
    const { data: resolved } = await client.get(progressive.url, { params: { client_id: clientId } });
    streamUrl = resolved?.url || null;
  } catch (err) {
    throw new DownloaderError('Failed to resolve the final stream link for this track.', 'DOWNLOAD_FAILED');
  }

  if (!streamUrl) {
    throw new DownloaderError('Failed to resolve the final stream link for this track.', 'DOWNLOAD_FAILED');
  }

  return {
    title: track.title || null,
    author: track.user?.username || null,
    duration_seconds: typeof track.duration === 'number' ? Math.round(track.duration / 1000) : null,
    artwork: track.artwork_url ? track.artwork_url.replace('-large', '-t500x500') : null,
    genre: track.genre || null,
    format: progressive.format?.protocol === 'progressive' ? 'mp3' : 'hls',
    media: { stream: streamUrl }
  };
}

// Pulls the track object out of the page's `window.__sc_hydration = [...]`
// array — it's a list of hydration entries, one of which has
// `hydratable: "sound"` and holds the actual track data we need.
function extractTrack(html) {
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
  if (!match) return null;
  try {
    const hydration = JSON.parse(match[1]);
    const soundEntry = hydration.find((entry) => entry.hydratable === 'sound');
    return soundEntry?.data || null;
  } catch (err) {
    return null;
  }
}

// SoundCloud's web client ID lives inside one of the page's own <script>
// bundles as `,client_id:"XXXXXXXX"`. Scan the script tags referenced by
// the track page (newest bundles first) until one contains it.
async function getClientId(trackPageHtml) {
  const scriptSrcs = [...trackPageHtml.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)]
    .map((m) => m[1])
    .reverse();

  for (const src of scriptSrcs) {
    try {
      const { data: js } = await client.get(src);
      const idMatch = js.match(/client_id\s*:\s*"([a-zA-Z0-9]+)"/);
      if (idMatch) return idMatch[1];
    } catch (err) {
      // try the next bundle
    }
  }
  return null;
}

module.exports = soundcloud;
