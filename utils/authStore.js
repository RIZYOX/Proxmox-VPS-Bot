// Persistance simple des utilisateurs autorisés (JSON)
const fs = require("fs")
const path = require("path")

const file = path.join(__dirname, "..", "data", "authorized.json")

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function initFromEnv() {
  if (!fs.existsSync(path.dirname(file))) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  if (!fs.existsSync(file)) {
    const admins = parseCsv(process.env.ADMIN_USERS)
    // Backward compat: AUTHORIZED_USERS, else ALLOWED_USERS
    const allowedFromCompat = parseCsv(process.env.AUTHORIZED_USERS)
    const allowed = allowedFromCompat.length
      ? allowedFromCompat
      : parseCsv(process.env.ALLOWED_USERS)

    const data = {
      admins: Array.from(new Set(admins)),
      allowed: Array.from(new Set([...admins, ...allowed])),
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } else {
    try {
      const content = fs.readFileSync(file, "utf-8")
      const json = content.trim() ? JSON.parse(content) : { admins: [], allowed: [] }
      // Legacy migration: { authorized_users: [...] }
      if (json.authorized_users && !json.allowed) {
        const data = {
          admins: Array.isArray(json.admins) ? json.admins : [],
          allowed: json.authorized_users,
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2))
      }
    } catch (e) {
      // Recreate from env on corruption
      const admins = parseCsv(process.env.ADMIN_USERS)
      const allowedFromCompat = parseCsv(process.env.AUTHORIZED_USERS)
      const allowed = allowedFromCompat.length
        ? allowedFromCompat
        : parseCsv(process.env.ALLOWED_USERS)
      const data = {
        admins: Array.from(new Set(admins)),
        allowed: Array.from(new Set([...admins, ...allowed])),
      }
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    }
  }
}

function read() {
  if (!fs.existsSync(file)) initFromEnv()
  try {
    const content = fs.readFileSync(file, "utf-8")
    if (!content.trim()) throw new Error("File is empty")
    const data = JSON.parse(content)
    // Normalize shape
    return {
      admins: Array.isArray(data.admins) ? data.admins : [],
      allowed: Array.isArray(data.allowed) ? data.allowed : [],
    }
  } catch (err) {
    console.error("❌ Erreur lors de la lecture du fichier authorized.json:", err.message)
    initFromEnv()
    return read()
  }
}

function save(data) {
  const normalized = {
    admins: Array.isArray(data.admins) ? data.admins : [],
    allowed: Array.isArray(data.allowed) ? data.allowed : [],
  }
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2))
}

function isAllowed(userId) {
  const data = read()
  return data.allowed.includes(userId)
}

function isAdmin(userId) {
  const { admins } = read()
  return admins.includes(userId)
}

function addAllowed(userId) {
  const data = read()
  if (!data.allowed.includes(userId)) data.allowed.push(userId)
  save(data)
}

module.exports = { initFromEnv, read, save, isAllowed, isAdmin, addAllowed }
