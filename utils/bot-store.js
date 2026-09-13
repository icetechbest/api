const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = path.join(__dirname, '..', 'data', 'bots.json');
const VALID_INPUT_TYPES = ['text', 'name', 'number', 'link'];

// Loose on purpose — these just catch "wrong kind of input entirely" (typing
// a sentence into a number-only bot), not every malformed edge case. Real
// validation of whether a number/link is *correct* is the target bot's job.
const INPUT_VALIDATORS = {
  number: (v) => /\d/.test(v) && /^[+0-9\s()-]+$/.test(v),
  link: (v) => /^https?:\/\/\S+$/i.test(v.trim()),
  name: (v) => /^[\p{L}\s'.-]{1,100}$/u.test(v.trim()),
  text: () => true
};

function validateInput(inputType, value) {
  const fn = INPUT_VALIDATORS[inputType] || INPUT_VALIDATORS.text;
  return fn((value || '').trim());
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(bots) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(bots, null, 2), 'utf8');
}

function slugify(name) {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || crypto.randomBytes(3).toString('hex');
}

function list() {
  return readAll();
}

function get(id) {
  return readAll().find((b) => b.id === id) || null;
}

function create({ name, botUsername, inputType, description, timeoutMs }) {
  if (!name || !botUsername) {
    throw new Error('name and botUsername are required.');
  }
  if (inputType && !VALID_INPUT_TYPES.includes(inputType)) {
    throw new Error(`inputType must be one of: ${VALID_INPUT_TYPES.join(', ')}`);
  }

  const bots = readAll();
  let id = slugify(name);
  // Avoid clobbering an existing endpoint if two bots share a name.
  if (bots.some((b) => b.id === id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;

  const bot = {
    id,
    name,
    botUsername: botUsername.replace(/^@/, ''),
    inputType: inputType || 'text',
    description: description || '',
    timeoutMs: timeoutMs || 15000,
    createdAt: new Date().toISOString()
  };

  bots.push(bot);
  writeAll(bots);
  return bot;
}

function remove(id) {
  const bots = readAll();
  const next = bots.filter((b) => b.id !== id);
  const removed = next.length !== bots.length;
  if (removed) writeAll(next);
  return removed;
}

module.exports = { list, get, create, remove, validateInput, VALID_INPUT_TYPES };
