const cheerio = require('cheerio');
const { client, DownloaderError } = require('./http');

/**
 * Resolves a public Snapchat Spotlight or shared Story link into its
 * direct video/image source. Public Snapchat share pages render server-side
 * with Open Graph tags pointing at the raw media file — no login or app
 * needed to reach them, same as Pinterest's pin pages.
 */
async function snapchat(url) {
  if (!/snapchat\.com/i.test(url)) {
    throw new DownloaderError('That does not look like a valid Snapchat link.', 'INVALID_URL');
  }

  const { data: html, status } = await client.get(url, { maxRedirects: 5 });

  if (status >= 400) {
    throw new DownloaderError('This Snapchat link could not be reached. Check the URL and try again.', 'NOT_FOUND');
  }

  const $ = cheerio.load(html);

  const ogVideo = $('meta[property="og:video"]').attr('content')
    || $('meta[property="og:video:secure_url"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const title = $('meta[property="og:title"]').attr('content') || null;
  const description = $('meta[property="og:description"]').attr('content') || null;

  if (!ogVideo && !ogImage) {
    throw new DownloaderError(
      'Could not extract media from this link. Public Spotlight/Story links only — private snaps cannot be resolved.',
      'NOT_FOUND'
    );
  }

  return {
    title,
    description,
    type: ogVideo ? 'video' : 'image',
    media: {
      video: ogVideo || null,
      image: ogImage || null
    }
  };
}

module.exports = snapchat;
