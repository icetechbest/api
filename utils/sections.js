const staticSections = require('../data/endpoints');
const botStore = require('./bot-store');

function exampleFor(inputType) {
  switch (inputType) {
    case 'name':
      return 'محمد';
    case 'number':
      return '01000000000';
    case 'link':
      return 'https://example.com/...';
    default:
      return 'hello';
  }
}

function buildBotsSection() {
  const bots = botStore.list();
  return {
    id: 'bots',
    name: 'Bots',
    icon: 'box',
    description: 'Custom APIs generated from Telegram bots linked in the console — send input, get the bot\'s reply back as JSON.',
    endpoints: bots.map((b) => ({
      id: b.id,
      title: b.name,
      method: 'GET',
      path: `/api/bot/${b.id}`,
      query: [{ name: 'input', required: true, example: exampleFor(b.inputType) }],
      description: b.description || `Sends your input to @${b.botUsername} on Telegram and returns its reply.`,
      status: 'active'
    }))
  };
}

// Call this instead of requiring data/endpoints.js directly anywhere sections
// are shown to a user (dashboard, sidebar, /sections, /console, /api/info) —
// it stays in sync with bots.json without needing a server restart.
function getAllSections() {
  const botsSection = buildBotsSection();
  return botsSection.endpoints.length ? [...staticSections, botsSection] : staticSections;
}

module.exports = { getAllSections };
