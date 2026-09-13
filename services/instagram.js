const cheerio = require('cheerio');
const { client, DownloaderError } = require('./http');

/**
 * Resolves a public Instagram post/reel/IGTV URL into its direct media
 * link(s) using Instagram's public "embed" page, which is reachable
 * without a logged-in session for public content. Instagram embeds the
 * media as a JSON blob inside a <script type="application/json"> tag; the
 * exact key path has shifted between Instagram releases before, so this
 * falls back to Open Graph tags if the JSON shape isn't found.
 */
async function instagram(url) {
  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/);
  if (!shortcodeMatch) {
    throw new DownloaderError('That does not look like a valid Instagram post/reel URL.', 'INVALID_URL');
  }

  const embedUrl = `https://www.instagram.com/p/${shortcodeMatch[1]}/embed/captioned/`;
  const { data: html, status } = await client.get(embedUrl);

  if (status >= 400) {
    throw new DownloaderError('This Instagram post could not be reached. It may be private.', 'NOT_FOUND');
  }

  const $ = cheerio.load(html);

  // Primary path: Instagram's embed JSON payload.
  let video = null;
  let image = null;
  let caption = null;

  const scriptMatch = html.match(/"video_url":"(.*?)"/);
  const imageMatch = html.match(/"display_url":"(.*?)"/);
  if (scriptMatch) video = scriptMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  if (imageMatch) image = imageMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');

  // Fallback: Open Graph meta tags on the embed page.
  if (!video && !image) {
    video = $('meta[property="og:video"]').attr('content') || null;
    image = $('meta[property="og:image"]').attr('content') || null;
  }

  caption = $('.Caption').text().trim() || null;

  if (!video && !image) {
    throw new DownloaderError(
      'Could not extract media. The post may be private, age-gated, or require a login.',
      'NOT_FOUND'
    );
  }

  return {
    caption,
    type: video ? 'video' : 'image',
    media: { video, image }
  };
}

module.exports = instagram;
