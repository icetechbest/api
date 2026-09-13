require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

// config.js is the plain file you actually edit (name, password, Telegram
// keys, etc). Anything set there wins over .env, so you never have to touch
// .env at all — it only exists for platforms (like Pterodactyl) that inject
// their own variables such as SERVER_PORT automatically.
const config = require('./config');
Object.entries(config).forEach(([key, value]) => {
  if (value !== undefined && value !== '') process.env[key] = String(value);
});

const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const telegramRoutes = require('./routes/telegram');

const app = express();

// Pterodactyl injects the allocated port as SERVER_PORT (not PORT) — support
// both so the same code runs on Pterodactyl, a plain VPS, or cPanel without
// changes. Always bind 0.0.0.0: inside a Pterodactyl/Docker container the
// public SERVER_IP isn't actually attached to the container's own network
// interface, so binding to it directly would fail — Docker's own NAT maps
// the public IP:port to the container regardless.
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.siteName = process.env.SITE_NAME || 'NexoAPI';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for the /login form post
app.use(express.static(path.join(__dirname, 'public')));

// Gates the browser pages (dashboard/sections/console) behind ADMIN_TOKEN —
// see routes/web.js (/login) and middleware/require-login.js. `secure` is
// left off since deployments here are commonly plain HTTP behind an IP:port,
// not HTTPS; turn it on once you're behind TLS.
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// The sidebar partial lists every section on every page — make the
// registry available to all views so no route can forget to pass it.
// getAllSections() merges the static sections with any generated bot-APIs,
// so newly added bots show up without a restart.
const { getAllSections } = require('./utils/sections');
app.use((req, res, next) => {
  res.locals.sections = getAllSections();
  next();
});

app.use('/api', apiRoutes);
app.use('/api', telegramRoutes);
app.use('/', webRoutes);

app.use((req, res) => {
  res.status(404).render('404', { active: '' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: false, code: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
});

app.listen(PORT, HOST, () => {
  console.log(`${app.locals.siteName} running on http://${HOST}:${PORT}`);
});
