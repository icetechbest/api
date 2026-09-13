const { spawn } = require('child_process');
const yts = require('yt-search');

const {
  runYtDlp,
  extractVideoId,
  getExtraArgs,
  YTDLP_BIN
} = require('./youtube-client');

function sanitizeFilename(name) {
  const cleaned = (name || 'audio')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || 'audio').slice(0, 150);
}

async function resolveVideoId(url, q) {
  // URL
  const urlId = extractVideoId(url);
  if (urlId) {
    return {
      videoId: urlId,
      error: null
    };
  }

  // q ممكن يكون URL أو Video ID
  const queryId = extractVideoId(q);
  if (queryId) {
    return {
      videoId: queryId,
      error: null
    };
  }

  const searchTerm = q || url;

  if (!searchTerm) {
    return {
      videoId: null,
      error: 'MISSING_INPUT'
    };
  }

  try {
    const results = await yts(searchTerm);
    const video = results?.videos?.[0];

    if (!video) {
      return {
        videoId: null,
        error: 'NOT_FOUND'
      };
    }

    const videoId =
      video.videoId ||
      extractVideoId(video.url);

    if (!videoId) {
      return {
        videoId: null,
        error: 'NOT_FOUND'
      };
    }

    return {
      videoId,
      error: null
    };
  } catch (err) {
    console.error('[youtube-mp3] search error:', err);

    return {
      videoId: null,
      error: 'SEARCH_FAILED'
    };
  }
}

async function fetchTitle(videoUrl) {
  try {
    const output = await runYtDlp([
      '--no-warnings',
      '--skip-download',
      '--print',
      '%(title)s',
      '--no-playlist',
      ...getExtraArgs(),
      videoUrl
    ]);

    return output
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)[0] || 'audio';
  } catch (err) {
    console.error('[youtube-mp3] title error:', err);
    return 'audio';
  }
}

async function fetchDirectAudioUrl(videoUrl) {
  const output = await runYtDlp([
    '--no-warnings',
    '--no-playlist',
    '-f',
    'bestaudio/best',
    '-g',
    ...getExtraArgs(),
    videoUrl
  ]);

  return output
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)[0] || null;
}

async function youtubeMp3(req, res) {
  try {
    const { url, q, link } = req.query;

    const resolved = await resolveVideoId(url, q);

    if (resolved.error === 'MISSING_INPUT') {
      return res.status(400).json({
        status: false,
        code: 'MISSING_INPUT',
        message: 'Provide q or url.'
      });
    }

    if (resolved.error === 'SEARCH_FAILED') {
      return res.status(502).json({
        status: false,
        code: 'SEARCH_FAILED',
        message: 'YouTube search failed.'
      });
    }

    if (!resolved.videoId) {
      return res.status(404).json({
        status: false,
        code: 'NOT_FOUND',
        message: 'Video not found.'
      });
    }

    const videoId = resolved.videoId;

    const videoUrl =
      `https://www.youtube.com/watch?v=${videoId}`;

    /*
     * ?link=1
     */
    if (link === '1' || link === 'true') {
      try {
        const [title, directUrl] = await Promise.all([
          fetchTitle(videoUrl),
          fetchDirectAudioUrl(videoUrl)
        ]);

        if (!directUrl) {
          return res.status(404).json({
            status: false,
            code: 'NO_AUDIO_URL',
            message: 'Could not get audio URL.'
          });
        }

        return res.json({
          status: true,
          result: {
            title,
            video_id: videoId,
            url: directUrl
          }
        });
      } catch (err) {
        console.error(
          '[youtube-mp3] direct URL error:',
          err?.message || err
        );

        return res.status(502).json({
          status: false,
          code: 'DOWNLOAD_FAILED',
          message: 'Could not resolve YouTube audio.'
        });
      }
    }

    /*
     * Get title
     */
    const title = await fetchTitle(videoUrl);
    const filename = sanitizeFilename(title);

    /*
     * Headers
     */
    res.statusCode = 200;

    res.setHeader(
      'Content-Type',
      'audio/mpeg'
    );

    const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '').trim() || 'audio';
res.setHeader(
  'Content-Disposition',
  `attachment; filename="${asciiFilename}.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}.mp3`
);

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    /*
     * yt-dlp
     *
     * stdout = audio data
     */
    const ytdlpArgs = [
      '--no-warnings',
      '--no-playlist',

      // Best available audio
      '-f',
      'bestaudio/best',

      // Send media to stdout
      '-o',
      '-',

      ...getExtraArgs(),

      videoUrl
    ];

    console.log(
      '[youtube-mp3] starting yt-dlp:',
      videoUrl
    );

    const ytdlp = spawn(
      YTDLP_BIN,
      ytdlpArgs,
      {
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stderr = '';

    ytdlp.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    /*
     * ffmpeg
     *
     * stdin  = yt-dlp stdout
     * stdout = MP3
     */
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',

        '-i',
        'pipe:0',

        '-vn',

        '-acodec',
        'libmp3lame',

        '-b:a',
        '192k',

        '-f',
        'mp3',

        'pipe:1'
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let ffmpegError = '';

    ffmpeg.stderr.on('data', chunk => {
      ffmpegError += chunk.toString();
    });

    /*
     * Connect:
     *
     * yt-dlp stdout
     *       ↓
     * ffmpeg stdin
     */
    ytdlp.stdout.pipe(ffmpeg.stdin);

    /*
     * ffmpeg stdout
     *       ↓
     * HTTP response
     */
    ffmpeg.stdout.pipe(res);

    let finished = false;

    function killProcesses() {
      try {
        if (!ytdlp.killed) {
          ytdlp.kill('SIGKILL');
        }
      } catch {}

      try {
        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGKILL');
        }
      } catch {}
    }

    /*
     * yt-dlp error
     */
    ytdlp.on('error', err => {
      console.error(
        '[youtube-mp3] yt-dlp spawn error:',
        err?.message || err
      );

      if (!finished) {
        finished = true;
        killProcesses();

        if (!res.headersSent) {
          return res.status(502).json({
            status: false,
            code: 'YTDLP_ERROR',
            message: 'Failed to start yt-dlp.'
          });
        }

        res.destroy();
      }
    });

    /*
     * ffmpeg error
     */
    ffmpeg.on('error', err => {
      console.error(
        '[youtube-mp3] ffmpeg error:',
        err?.message || err
      );

      if (!finished) {
        finished = true;
        killProcesses();

        if (!res.headersSent) {
          return res.status(502).json({
            status: false,
            code: 'FFMPEG_ERROR',
            message: 'FFmpeg failed to start. Make sure ffmpeg is installed.'
          });
        }

        res.destroy();
      }
    });

    /*
     * yt-dlp finished
     */
    ytdlp.on('close', code => {
      console.log(
        '[youtube-mp3] yt-dlp exited:',
        code
      );

      if (code !== 0) {
        console.error(
          '[youtube-mp3] yt-dlp stderr:',
          stderr
        );

        try {
          ffmpeg.stdin.end();
        } catch {}
      }
    });

    /*
     * ffmpeg finished
     */
    ffmpeg.on('close', code => {
      console.log(
        '[youtube-mp3] ffmpeg exited:',
        code
      );

      if (finished) return;

      finished = true;

      if (code !== 0) {
        console.error(
          '[youtube-mp3] ffmpeg stderr:',
          ffmpegError
        );

        if (!res.writableEnded) {
          res.destroy();
        }

        return;
      }

      if (!res.writableEnded) {
        res.end();
      }
    });

    /*
     * Client disconnected
     */
    res.on('close', () => {
      if (!res.writableFinished) {
        killProcesses();
      }
    });

  } catch (err) {
    console.error(
      '[youtube-mp3] fatal error:',
      err?.stack || err
    );

    if (!res.headersSent) {
      return res.status(500).json({
        status: false,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error.'
      });
    }

    res.destroy();
  }
}

module.exports = youtubeMp3;