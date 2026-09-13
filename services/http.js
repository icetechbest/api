const axios = require('axios');

// Shared client — most scraping-based downloaders get blocked without a
// realistic desktop User-Agent and Accept headers.
const client = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  },
  validateStatus: (s) => s < 500
});

class DownloaderError extends Error {
  constructor(message, code = 'DOWNLOAD_FAILED') {
    super(message);
    this.code = code;
  }
}

module.exports = { client, DownloaderError };
