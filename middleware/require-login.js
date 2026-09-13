// Protects browser pages (console, dashboard, sections) behind one site
// password. Kept separate from the x-admin-token header check in
// routes/telegram.js so curl/Postman-style API usage still works without a
// browser session — both simply compare against ADMIN_TOKEN.
function requireLogin(req, res, next) {
  if (req.session && req.session.authed) return next();
  const next_url = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?next=${next_url}`);
}

module.exports = { requireLogin };
