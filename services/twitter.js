const { client, DownloaderError } = require('./http');

/**
 * Resolves a Twitter/X post URL into its direct video/photo links.
 * Twitter/X's own page is a client-rendered SPA with no server-side media
 * links, so this uses vxtwitter's public mirror API (api.vxtwitter.com),
 * which re-hosts Twitter's internal GraphQL response as plain JSON — the
 * same trick fxtwitter/vxtwitter embeds rely on. If vxtwitter ever goes
 * down, this is the single place to swap in an alternative mirror.
 */
async function twitter(url) {
  const match = url.match(/(?:twitter|x)\.com\/([^/]+)\/status(?:es)?\/(\d+)/i);
  if (!match) {
    throw new DownloaderError('That does not look like a valid Twitter/X post URL.', 'INVALID_URL');
  }
  const [, username, statusId] = match;

  const { data, status } = await client.get(`https://api.vxtwitter.com/${username}/status/${statusId}`);

  if (status >= 400 || !data || data.error) {
    throw new DownloaderError('Could not resolve this post. It may be private, deleted, or age-restricted.', 'NOT_FOUND');
  }

  const mediaItems = Array.isArray(data.media_extended) ? data.media_extended : [];

  const video = mediaItems.find((m) => m.type === 'video' || m.type === 'gif');
  const photos = mediaItems.filter((m) => m.type === 'image').map((m) => m.url);

  if (!video && photos.length === 0) {
    throw new DownloaderError('No downloadable media found on this post.', 'NOT_FOUND');
  }

  return {
    text: data.text || null,
    author: {
      username: data.user_screen_name || username,
      name: data.user_name || null
    },
    stats: {
      likes: data.likes ?? null,
      retweets: data.retweets ?? null,
      replies: data.replies ?? null,
      views: data.views ?? null
    },
    type: video ? (video.type === 'gif' ? 'gif' : 'video') : 'image',
    media: {
      video: video ? video.url : null,
      thumbnail: video ? video.thumbnail_url || null : null,
      photos
    }
  };
}

module.exports = twitter;
