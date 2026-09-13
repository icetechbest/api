const { client, DownloaderError } = require('./http');

/**
 * Resolves a public Facebook video/reel URL into direct SD and HD source
 * links. Facebook embeds these as escaped fields inside the page's inline
 * JS rather than clean <meta> tags, so this reads the raw HTML with regex
 * instead of a DOM parser. If Facebook changes its markup this is the
 * single place to update the two patterns below.
 */
async function facebook(url) {
  const { data: html, status } = await client.get(url, {
    maxRedirects: 5,
    headers: { 'User-Agent': 'facebookexternalhit/1.1' }
  });

  if (status >= 400) {
    throw new DownloaderError('This Facebook video could not be reached. Check the URL and try again.', 'NOT_FOUND');
  }

  const clean = (s) => s.replace(/\\\//g, '/').replace(/&amp;/g, '&');

  const hdMatch = html.match(/"browser_native_hd_url":"(.*?)"/);
  const sdMatch = html.match(/"browser_native_sd_url":"(.*?)"/);
  const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/);
  const thumbMatch = html.match(/<meta property="og:image" content="(.*?)"/);

  const hd = hdMatch ? clean(hdMatch[1]) : null;
  const sd = sdMatch ? clean(sdMatch[1]) : null;

  if (!hd && !sd) {
    throw new DownloaderError(
      'Could not extract a direct video link. The video may be private, age-restricted, or the page markup has changed.',
      'NOT_FOUND'
    );
  }

  return {
    title: titleMatch ? clean(titleMatch[1]) : null,
    thumbnail: thumbMatch ? clean(thumbMatch[1]) : null,
    media: { hd, sd: sd || hd }
  };
}

module.exports = facebook;
