const { client, DownloaderError } = require('./http');

/**
 * Resolves a TikTok video URL into direct, no-watermark media links.
 * Uses tikwm.com's public resolver endpoint, which mirrors TikTok's own
 * internal video-detail API. If tikwm changes its response shape or goes
 * down, this is the single place to update.
 */
async function tiktok(url) {
  const { data } = await client.get('https://www.tikwm.com/api/', {
    params: { url, hd: 1 }
  });

  if (!data || data.code !== 0 || !data.data) {
    throw new DownloaderError('Could not resolve this TikTok link. Make sure it is a public video URL.', 'NOT_FOUND');
  }

  const d = data.data;

  return {
    title: d.title || null,
    author: {
      username: d.author?.unique_id || null,
      nickname: d.author?.nickname || null,
      avatar: d.author?.avatar || null
    },
    stats: {
      plays: d.play_count ?? null,
      likes: d.digg_count ?? null,
      comments: d.comment_count ?? null,
      shares: d.share_count ?? null
    },
    media: {
      no_watermark: d.hdplay || d.play || null,
      watermark: d.wmplay || null,
      cover: d.cover || d.origin_cover || null,
      music: d.music || null
    }
  };
}

module.exports = tiktok;
