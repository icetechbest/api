const express = require('express');
const router = express.Router();
const { getAllSections } = require('../utils/sections');
const { computeStats, buildSiteInfo } = require('../utils/stats');
const botStore = require('../utils/bot-store');
const { requireLogin } = require('../middleware/require-login');

// ---- Auth ---------------------------------------------------------------

router.get('/login', (req, res) => {
  if (req.session && req.session.authed) return res.redirect(req.query.next || '/');
  res.render('login', { error: null, next: req.query.next || '/', siteName: req.app.locals.siteName });
});

router.post('/login', (req, res) => {
  const configured = process.env.ADMIN_TOKEN;
  const { password, next } = req.body;

  if (!configured) {
    return res.status(500).render('login', {
      error: 'ADMIN_TOKEN is not set on the server — set it in config.js first.',
      next: next || '/',
      siteName: req.app.locals.siteName
    });
  }

  if (password !== configured) {
    return res.status(401).render('login', { error: 'Wrong password.', next: next || '/', siteName: req.app.locals.siteName });
  }

  req.session.authed = true;
  res.redirect(next || '/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---- Public pages — anyone can browse the API docs, no login needed -----

router.get('/', (req, res) => {
  const sections = getAllSections();
  res.render('dashboard', { active: 'dashboard', stats: computeStats(sections) });
});

router.get('/sections', (req, res) => {
  res.render('sections', { active: 'sections' });
});

router.get('/sections/:id', (req, res) => {
  const sections = getAllSections();
  const section = sections.find((s) => s.id === req.params.id);
  if (!section) return res.status(404).render('404', { active: '' });
  res.render('section-detail', { active: 'sections', section });
});

// ---- Console (password-protected) ----------------------------------------
// The brand icon/name in the sidebar links here: a light "API console" page
// with the platform's raw JSON info, a generic tester for any endpoint, and
// the Telegram account-linking / bot-management panel. This is the one page
// that needs the login — it's where settings and the linked account live.
router.get('/console', requireLogin, (req, res) => {
  const sections = getAllSections();
  const siteInfo = buildSiteInfo(sections, req.app.locals.siteName);
  res.render('console', { active: 'console', siteInfo, sections, bots: botStore.list() });
});

module.exports = router;
