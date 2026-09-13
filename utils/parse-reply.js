// Many lookup bots reply with a block of "label: value" lines, e.g.:
//   📧 Email: someone@example.com
//   📱 Number: 01000000000
//   👤 Name: محمد
// Instead of handing that back as one big raw string, split it into a
// clean object: { email: '...', number: '...', name: '...' }.
//
// If the reply doesn't look like that shape (no "label: value" lines at
// all — e.g. a bot that just chats back a sentence), we fall back to
// returning the original text untouched so nothing gets lost.

function normalizeKey(rawKey) {
  return rawKey
    .trim()
    // drop leading/trailing emoji, bullets, stars, dashes etc. — anything
    // that isn't a letter/number in Latin or Arabic script
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseBotReply(text) {
  const raw = text || '';
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const data = {};
  const leftover = [];

  for (const line of lines) {
    // Strip leading emoji/bullets (e.g. "📧 Email: x@x.com" -> "Email: x@x.com")
    const cleaned = line.replace(/^[^\p{L}\p{N}]+/u, '').trim();

    // "label: value" — colon can be the normal ASCII one or the Arabic ':'
    const match = cleaned.match(/^([\p{L}\p{N}\s_-]{1,40}?)\s*[:：]\s*(.+)$/u);
    if (match) {
      const key = normalizeKey(match[1]);
      const value = match[2].trim();
      if (key && value) {
        data[key] = value;
        continue;
      }
    }
    leftover.push(cleaned);
  }

  // Nothing looked like "label: value" — this bot doesn't reply in that
  // shape, so just hand back the plain text instead of an empty object.
  if (Object.keys(data).length === 0) {
    return raw;
  }

  return data;
}

module.exports = { parseBotReply };
