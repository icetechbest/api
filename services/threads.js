const cheerio = require('cheerio');
const { client, DownloaderError } = require('./http');

/**
 * Resolves a public Threads (threads.net) post into its direct media
 * link(s). Threads runs on the same backend family as Instagram, so public
 * posts expose the same pattern: Open Graph tags plus an escaped
 * "video_url"/"display_url" pair buried in the page's inline JSON — same
 * extraction approach as services/instagram.js.
 */
async function threads(url) {
  const match = url.match(/threads\.net\/@([^/]+)\/post\/([^/?#&]+)/i);
  if (!match) {
    throw new DownloaderError('That does not look like a valid Threads post URL.', 'INVALID_URL');
  }

  const { data: html, status } = await client.get(url, { maxRedirects: 5 });

  if (status >= 400) {
    throw new DownloaderError('This Threads post could not be reached. It may be private.', 'NOT_FOUND');
  }

  const $ = cheerio.load(html);

  const videoMatch = html.match(/"video_url":"(.*?)"/);
  const imageMatch = html.match(/"display_url":"(.*?)"/);

  let video = videoMatch ? videoMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;
  let image = imageMatch ? imageMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;

  if (!video && !image) {
    video = $('meta[property="og:video"]').attr('content') || null;
    image = $('meta[property="og:image"]').attr('content') || null;
  }

  const caption = $('meta[property="og:description"]').attr('content') || null;

  if (!video && !image) {
    throw new DownloaderError(
      'Could not extract media. The post may be private or the page markup has changed.',
      'NOT_FOUND'
    );
  }

  return {
    author: match[1],
    caption,
    type: video ? 'video' : 'image',
    media: { video, image }
  };
}

module.exports = threads;
