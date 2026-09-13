const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const instagram = require('../services/instagram');
const facebook = require('../services/facebook');
const tiktok = require('../services/tiktok');
const pinterest = require('../services/pinterest');
const youtube = require('../services/youtube');
const youtubeMp3 = require('../services/youtube-mp3');
const twitter = require('../services/twitter');
const soundcloud = require('../services/soundcloud');
const snapchat = require('../services/snapchat');
const threads = require('../services/threads');
const { DownloaderError } = require('../services/http');
const { getAllSections } = require('../utils/sections');
const { computeStats, buildSiteInfo } = require('../utils/stats');

// Static local data — cheap to serve, so it sits ahead of the rate limiter
// (the /console page's JSON panel calls this on every load).
router.get('/info', (req, res) => {
  res.json(buildSiteInfo(getAllSections(), req.app.locals.siteName));
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' }
});
router.use(limiter);

// Wraps every downloader handler so each route file stays a one-liner and
// every response — success or failure — has the same { status, result } shape.
function handler(fn) {
  return async (req, res) => {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ status: false, code: 'MISSING_URL', message: 'Query parameter "url" is required.' });
    }

    const started = Date.now();
    try {
      const result = await fn(url);
      return res.json({ status: true, took_ms: Date.now() - started, result });
    } catch (err) {
      const code = err instanceof DownloaderError ? err.code : 'INTERNAL_ERROR';
      const message = err instanceof DownloaderError ? err.message : 'Something went wrong while resolving that link.';
      const httpStatus = code === 'INVALID_URL' ? 400 : code === 'NOT_FOUND' ? 404 : 502;
      return res.status(httpStatus).json({ status: false, code, message });
    }
  };
}

router.get('/dl/instagram', handler(instagram));
router.get('/dl/facebook', handler(facebook));
router.get('/dl/tiktok', handler(tiktok));
router.get('/dl/pinterest', handler(pinterest));
router.get('/dl/youtube', handler(youtube));
router.get('/dl/twitter', handler(twitter));
router.get('/dl/snapchat', handler(snapchat));
router.get('/dl/threads', handler(threads));
router.get('/dl/soundcloud', handler(soundcloud));

// Streams a real file (not JSON), so it bypasses the generic `handler()`
// wrapper and manages its own status codes / errors internally.
router.get('/audio/youtube-mp3', youtubeMp3);

module.exports = router;
