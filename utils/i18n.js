const fs = require('fs');
const path = require('path');

const LANG_PATH = path.join(__dirname, '..', 'data', 'lang.json');

function ensureFile() {
  const dir = path.dirname(LANG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LANG_PATH)) fs.writeFileSync(LANG_PATH, JSON.stringify({ users: {}, guilds: {} }, null, 2));
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(LANG_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return { users: {}, guilds: {} };
  }
}

function writeStore(store) {
  ensureFile();
  fs.writeFileSync(LANG_PATH, JSON.stringify(store, null, 2));
}

function getUserLang(userId, guildId) {
  const store = readStore();
  const u = store.users?.[String(userId)];
  if (u) return u;
  const g = store.guilds?.[String(guildId)];
  if (g) return g;
  return 'fr';
}

function setUserLang(userId, lang) {
  const store = readStore();
  store.users = store.users || {};
  store.users[String(userId)] = lang;
  writeStore(store);
}

function setGuildLang(guildId, lang) {
  const store = readStore();
  store.guilds = store.guilds || {};
  store.guilds[String(guildId)] = lang;
  writeStore(store);
}

module.exports = {
  getUserLang,
  setUserLang,
  setGuildLang,
};
