const crypto = require("crypto");

function randomPassword(length = 12) {
  // Caractères Linux-compatibles (pas de caractères spéciaux problématiques)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, level = "INFO", component = "MAIN") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] [${component}] ${message}`);
}

function isAdmin(userId) {
  const admins = (process.env.ADMIN_USERS || "").split(",").map(s => s.trim()).filter(Boolean);
  return admins.includes(userId);
}

function bytesToMiB(b) {
  return Math.round(b / 1024 / 1024);
}

function bytesToGiB(b) {
  if (typeof b !== "number" || isNaN(b)) return 0;
  const result = b / 1024 / 1024 / 1024;
  return Math.round(result * 100) / 100;
}

function bytesToTiB(b) {
  if (typeof b !== "number" || isNaN(b)) return 0;
  const result = b / 1024 / 1024 / 1024 / 1024;
  return Math.round(result * 100) / 100;
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 4) return `${bytesToTiB(bytes)} TiB`;
  if (bytes >= 1024 ** 3) return `${bytesToGiB(bytes)} GiB`;
  if (bytes >= 1024 ** 2) return `${bytesToMiB(bytes)} MiB`;
  return `${bytes} B`;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

module.exports = {
  randomPassword,
  sleep,
  log,
  isAdmin,
  bytesToMiB,
  bytesToGiB,
  bytesToTiB,
  formatBytes,
  pct,
};
