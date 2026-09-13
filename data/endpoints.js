// Central registry — add a new endpoint here and it automatically shows up
// on the dashboard, the sections menu, and the docs pages.
// icon values map to /public/img feather-style inline icons defined in views/partials/icon.ejs

module.exports = [
  {
    id: 'downloader',
    name: 'Media',
    icon: 'download',
    description: 'Fetch direct media links from social platforms — no watermark, no login.',
    endpoints: [
      {
        id: 'instagram',
        title: 'Instagram',
        method: 'GET',
        path: '/api/dl/instagram',
        query: [{ name: 'url', required: true, example: 'https://www.instagram.com/p/POST_ID/' }],
        description: 'Returns direct video/image links from a public Instagram post, reel, or TV video.',
        status: 'active'
      },
      {
        id: 'facebook',
        title: 'Facebook',
        method: 'GET',
        path: '/api/dl/facebook',
        query: [{ name: 'url', required: true, example: 'https://www.facebook.com/watch/?v=VIDEO_ID' }],
        description: 'Returns SD and HD direct video links from a public Facebook video or reel.',
        status: 'active'
      },
      {
        id: 'tiktok',
        title: 'TikTok',
        method: 'GET',
        path: '/api/dl/tiktok',
        query: [{ name: 'url', required: true, example: 'https://www.tiktok.com/@user/video/VIDEO_ID' }],
        description: 'Returns a no-watermark video link plus author, music, and stats for a TikTok video.',
        status: 'active'
      },
      {
        id: 'pinterest',
        title: 'Pinterest',
        method: 'GET',
        path: '/api/dl/pinterest',
        query: [{ name: 'url', required: true, example: 'https://pin.it/PIN_ID' }],
        description: 'Returns the original-resolution image or video link from a Pinterest pin.',
        status: 'active'
      },
      {
        id: 'youtube',
        title: 'YouTube',
        method: 'GET',
        path: '/api/dl/youtube',
        query: [{ name: 'url', required: true, example: 'https://www.youtube.com/watch?v=VIDEO_ID' }],
        description: 'Returns progressive video links (multiple qualities) and audio-only links plus title, author, duration, and thumbnail.',
        status: 'active'
      }
    ]
  },
  {
    id: 'audio',
    name: 'Audio',
    icon: 'music',
    description: 'Convert and download audio tracks directly — the response is a real file, not just a link.',
    endpoints: [
      {
        id: 'youtube-mp3',
        title: 'YouTube to MP3',
        method: 'GET',
        path: '/api/audio/youtube-mp3',
        query: [
          { name: 'q', required: true, example: 'اسم الأغنية أو رابط يوتيوب' },
          { name: 'link', required: false, example: '1 — ارجع رابط تحميل مباشر JSON بدل تنزيل الملف نفسه' }
        ],
        description: 'Type a song name (searches YouTube automatically) or paste a YouTube URL — downloads a real MP3 file named after the title (Content-Disposition). Add &link=1 to instead get a direct, temporary audio URL back as JSON (no download/conversion). Requires ffmpeg on the server for the file mode.',
        status: 'active',
        responseType: 'file'
      }
    ]
  },
  {
    id: 'social',
    name: 'Social Platforms',
    icon: 'share',
    description: 'Direct media links from social platforms — video, photo, and audio posts.',
    endpoints: [
      {
        id: 'twitter',
        title: 'Twitter / X',
        method: 'GET',
        path: '/api/dl/twitter',
        query: [{ name: 'url', required: true, example: 'https://x.com/user/status/POST_ID' }],
        description: 'Returns the direct video/GIF link (or all photo links) plus author info and stats from a public Twitter/X post.',
        status: 'active'
      },
      {
        id: 'soundcloud',
        title: 'SoundCloud',
        method: 'GET',
        path: '/api/dl/soundcloud',
        query: [{ name: 'url', required: true, example: 'https://soundcloud.com/artist/track-name' }],
        description: 'Returns a direct, playable stream link plus title, author, duration, and artwork for a public SoundCloud track.',
        status: 'active'
      },
      {
        id: 'snapchat',
        title: 'Snapchat',
        method: 'GET',
        path: '/api/dl/snapchat',
        query: [{ name: 'url', required: true, example: 'https://www.snapchat.com/spotlight/SPOTLIGHT_ID' }],
        description: 'Returns the direct video/image link from a public Snapchat Spotlight or shared Story link.',
        status: 'active'
      },
      {
        id: 'threads',
        title: 'Threads',
        method: 'GET',
        path: '/api/dl/threads',
        query: [{ name: 'url', required: true, example: 'https://www.threads.net/@user/post/POST_ID' }],
        description: 'Returns the direct video/image link plus caption from a public Threads post.',
        status: 'active'
      }
    ]
  }
];
