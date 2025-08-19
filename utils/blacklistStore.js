// Persistent blacklist of VMIDs (JSON)
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'blacklist.json');

function ensureFile() {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ vms: [] }, null, 2));
  } else {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      if (!raw.trim()) throw new Error('empty');
      const json = JSON.parse(raw);
      if (!Array.isArray(json.vms)) {
        fs.writeFileSync(file, JSON.stringify({ vms: [] }, null, 2));
      }
    } catch {
      fs.writeFileSync(file, JSON.stringify({ vms: [] }, null, 2));
    }
  }
}

function read() {
  ensureFile();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const json = raw.trim() ? JSON.parse(raw) : { vms: [] };
    return { vms: Array.isArray(json.vms) ? json.vms : [] };
  } catch {
    ensureFile();
    return { vms: [] };
  }
}

function save(data) {
  ensureFile();
  const normalized = { vms: Array.isArray(data.vms) ? Array.from(new Set(data.vms)) : [] };
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2));
}

function list() {
  return read().vms;
}

function hasVM(vmid) {
  const v = Number(vmid);
  if (!Number.isInteger(v)) return false;
  return read().vms.includes(v);
}

function addVM(vmid) {
  const v = Number(vmid);
  if (!Number.isInteger(v)) throw new Error('Invalid VMID');
  const data = read();
  if (!data.vms.includes(v)) data.vms.push(v);
  save(data);
}

function removeVM(vmid) {
  const v = Number(vmid);
  if (!Number.isInteger(v)) throw new Error('Invalid VMID');
  const data = read();
  data.vms = data.vms.filter(x => x !== v);
  save(data);
}

module.exports = { list, hasVM, addVM, removeVM };
