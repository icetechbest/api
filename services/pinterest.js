const cheerio = require('cheerio');
const { client, DownloaderError } = require('./http');

/**
 * Resolves a Pinterest pin (including pin.it short links, which redirect
 * automatically) into its original-resolution image or video source, read
 * straight from the page's Open Graph meta tags.
 */
async function pinterest(url) {
  const { data: html, status } = await client.get(url, { maxRedirects: 5 });

  if (status >= 400) {
    throw new DownloaderError('This Pinterest pin could not be reached. Check the URL and try again.', 'NOT_FOUND');
  }

  const $ = cheerio.load(html);

  const ogVideo = $('meta[property="og:video"]').attr('content')
    || $('meta[property="og:video:secure_url"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const title = $('meta[property="og:title"]').attr('content') || $('title').text() || null;
  const description = $('meta[property="og:description"]').attr('content') || null;

  if (!ogVideo && !ogImage) {
    throw new DownloaderError('Could not extract media from this pin. It may be private or removed.', 'NOT_FOUND');
  }

  return {
    title: title ? title.trim() : null,
    description,
    type: ogVideo ? 'video' : 'image',
    media: {
      video: ogVideo || null,
      image: ogImage ? ogImage.replace(/\/\d+x(?:\/|$)/, '/originals/') : null
    }
  };
}

module.exports = pinterest;
