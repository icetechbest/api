const { getVideoInfo, extractVideoId, YtDlpError } = require('./youtube-client');
const { DownloaderError } = require('./http');

/**
 * Resolves a YouTube video URL into direct progressive (video+audio) and
 * audio-only stream links, plus basic metadata.
 *
 * Uses the `yt-dlp` CLI (see services/youtube-client.js) — we previously
 * used youtubei.js (Innertube) here, but YouTube's bot-detection started
 * blocking it (and its fallback client) with a login-required wall on a
 * growing number of videos. yt-dlp is updated constantly to work around
 * exactly that, and it's what this deployment's Telegram bot already
 * relies on, so this endpoint now mirrors that same approach.
 */
async function youtube(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new DownloaderError('This does not look like a valid YouTube video URL.', 'INVALID_URL');
  }

  let info;
  try {
    info = await getVideoInfo(url);
  } catch (err) {
    if (err instanceof YtDlpError && err.loginRequired) {
      throw new DownloaderError(
        'YouTube is blocking this video with a bot-check right now. Try again later, or update yt-dlp (yt-dlp -U).',
        'DOWNLOAD_FAILED'
      );
    }
    if (err && err.code === 'ENOENT') {
      throw new DownloaderError('yt-dlp is not installed on the server. Run: npm install (or: node scripts/install-ytdlp.js --force)', 'DOWNLOAD_FAILED');
    }
    throw new DownloaderError('Could not resolve this YouTube link. It may be private, age-restricted, or removed.', 'NOT_FOUND');
  }

  const formats = Array.isArray(info.formats) ? info.formats : [];

  // "Progressive" formats bundle video+audio in one file (no ffmpeg merge
  // needed) but cap out below 1080p on YouTube's side — a platform
  // limitation, not something this endpoint can work around.
  const progressive = formats
    .filter((f) => f.url && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .map((f) => ({
      quality: f.format_note || (f.height ? `${f.height}p` : null),
      container: f.ext || null,
      url: f.url
    }));

  const audioOnly = formats
    .filter((f) => f.url && (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none')
    .map((f) => ({
      bitrate: f.abr ? `${Math.round(f.abr)}kbps` : null,
      container: f.ext || null,
      url: f.url
    }))
    .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));

  if (progressive.length === 0 && audioOnly.length === 0) {
    throw new DownloaderError('No downloadable streams were found for this video.', 'NOT_FOUND');
  }

  const thumbnails = info.thumbnails || [];

  return {
    title: info.title || null,
    author: info.uploader || info.channel || null,
    duration_seconds: typeof info.duration === 'number' ? info.duration : null,
    thumbnail: info.thumbnail || (thumbnails.length ? thumbnails[thumbnails.length - 1].url : null),
    media: {
      video: progressive,
      audio: audioOnly
    }
  };
}

module.exports = youtube;
