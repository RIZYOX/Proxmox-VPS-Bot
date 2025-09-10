const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { log } = require("../utils/helpers");
const px = require("../utils/proxmox");
const store = require("../utils/authStore");
const bl = require("../utils/blacklistStore");
const { getUserLang } = require("../utils/i18n");
const sshSessions = new Map(); // userId -> { host, port, user, password, history: [] }

// Helper: find node name of a VMID
async function findNodeByVMID(vmid) {
  const nodes = await px.nodes();
  for (const node of nodes) {
    try {
      const vms = await px.getVMs(node.node);
      if (vms.find(v => v.vmid === vmid)) return node.node;
    } catch (_) {}
  }
  return null;
}

// Clone VM
async function cloneVPS(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const newid = interaction.options.getInteger('newid');
    const name = interaction.options.getString('name') || undefined;
    const target_node = interaction.options.getString('target_node') || undefined;
    const mode = interaction.options.getString('mode') || undefined; // 'full' or 'linked'
    const storage = interaction.options.getString('storage') || undefined;

    const sourceNode = await findNodeByVMID(vmid);
    if (!sourceNode) {
      await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) });
      return;
    }

    const config = {};
    if (name) config.name = name;
    if (target_node) config.target = target_node;
    if (mode === 'full') config.full = 1; else if (mode === 'linked') config.full = 0;
    if (storage) config.storage = storage;

    await px.cloneVM(sourceNode, vmid, newid, config);
    const embed = new EmbedBuilder()
      .setTitle(T('🧬 Clonage lancé', '🧬 Clone started'))
      .setDescription(T(`Source: ${vmid} (${sourceNode}) → Nouveau: ${newid}${name ? ` (${name})` : ''}`, `Source: ${vmid} (${sourceNode}) → New: ${newid}${name ? ` (${name})` : ''}`))
      .setColor(0x6f42c1)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Clone error: ${err.message}` : `❌ Erreur clonage: ${err.message}` });
  }
}

// Autocomplete handler
async function autocomplete(interaction) {
  try {
    const DBG = process.env.AUTOCOMPLETE_DEBUG === '1';
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);
    const focused = interaction.options.getFocused(true); // { name, value }
    if (DBG) {
      try { log(`AC start: sub=${sub || 'none'} group=${group || 'none'} focus=${focused?.name}:${focused?.value}`, 'INFO', 'VPS'); } catch (_) {}
    }

    // Ensure slow API calls don't exceed Discord 3s window
    const withTimeout = (p, ms = 1200) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);

    // Helper: list all VMs across nodes
    async function listAllVMs() {
      try {
        const nodes = await withTimeout(px.nodes());
        const results = await Promise.allSettled(
          nodes.map(n => withTimeout(px.getVMs(n.node)).then(vms => ({ node: n.node, vms })).catch(() => ({ node: n.node, vms: [] })))
        );
        const out = [];
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const nnode = r.value.node;
          for (const v of r.value.vms || []) {
            if (typeof v.vmid !== 'number') continue;
            const label = `${v.vmid} • ${v.name || v.vm || 'VM'} @ ${nnode}`;
            out.push({ name: label, value: v.vmid });
            if (out.length >= 25) break;
          }
          if (out.length >= 25) break;
        }
        return out;
      } catch (_) {
        return [];
      }
    }

    // Helper: list node names
    async function listNodes() {
      try {
        const nodes = await withTimeout(px.nodes());
        return nodes.map(n => ({ name: n.node, value: n.node })).slice(0, 25);
      } catch (_) { return []; }
    }

    // Helper: disks for a VM
    async function listDisks(vmid) {
      const node = await withTimeout(findNodeByVMID(Number(vmid))).catch(() => null);
      if (!node) return [];
      const cfg = await withTimeout(px.getVMConfig(node, Number(vmid))).catch(() => ({}));
      const keys = Object.keys(cfg || {});
      const diskKeys = keys.filter(k => /^(ide|sata|scsi|virtio)\d+$/.test(k));
      const out = [];
      for (const k of diskKeys) {
        const val = cfg[k];
        // Try to extract size= and storage by pattern like storage:vm-100-disk-0,size=32G
        let size = '';
        let storage = '';
        if (typeof val === 'string') {
          const sizeM = val.match(/[,;\s]size=([^,\s]+)/i);
          if (sizeM) size = sizeM[1];
          const storeM = val.match(/^([^:\s]+):/);
          if (storeM) storage = storeM[1];
        }
        const label = `${k}${size ? ` • ${size}` : ''}${storage ? ` • ${storage}` : ''}`;
        out.push({ name: label, value: k });
      }
      return out;
    }

    // Helper: storages for a node of a VM
    async function listStoragesForVM(vmid) {
      const node = await withTimeout(findNodeByVMID(Number(vmid))).catch(() => null);
      if (!node) return [];
      const storages = await withTimeout(px.getNodeStorage(node)).catch(() => []);
      return (storages || []).map(s => ({ name: `${s.storage} (${s.type || ''})`, value: s.storage })).slice(0, 25);
    }

    // Helper: snapshots for VM
    async function listSnapshotsForVM(vmid) {
      const node = await withTimeout(findNodeByVMID(Number(vmid))).catch(() => null);
      if (!node) return [];
      const snaps = await withTimeout(px.listSnapshots(node, Number(vmid))).catch(() => []);
      return (snaps || []).map(s => ({ name: `${s.name || s.snapname}${s.current ? ' • current' : ''}`, value: String(s.name || s.snapname) })).slice(0, 25);
    }

    let choices = [];
    if (focused.name === 'vmid') {
      choices = await listAllVMs();
    } else if (focused.name === 'newid') {
      try {
        const base = await withTimeout(px.nextId(), 800).catch(() => null);
        const start = typeof base === 'number' && Number.isInteger(base) ? base : 100;
        const ids = [start, start + 1, start + 2, start + 3, start + 4];
        choices = ids.map(n => ({ name: `Next ID: ${n}`, value: n }));
      } catch (_) {
        choices = [{ name: 'Next ID: 100', value: 100 }];
      }
    } else if (focused.name === 'disk') {
      const vmid = interaction.options.getInteger('vmid');
      if (vmid) {
        choices = await listDisks(vmid);
      } else {
        // Fallback suggestions when VMID not selected yet
        choices = [
          { name: 'scsi0', value: 'scsi0' },
          { name: 'virtio0', value: 'virtio0' },
          { name: 'sata0', value: 'sata0' },
          { name: 'ide0', value: 'ide0' },
        ];
      }
    } else if (focused.name === 'target_node') {
      choices = await listNodes();
    } else if (focused.name === 'storage') {
      const vmid = interaction.options.getInteger('vmid');
      if (vmid) {
        choices = await listStoragesForVM(vmid);
      } else {
        // Fallback: storages from first available node
        try {
          const nodes = await px.nodes();
          if (nodes && nodes.length) {
            const storages = await px.getNodeStorage(nodes[0].node);
            choices = (storages || []).map(s => ({ name: `${s.storage} (${s.type || ''})`, value: s.storage })).slice(0, 25);
          }
        } catch (_) {}
      }
    } else if (focused.name === 'name' && group === 'snapshot' && (sub === 'delete' || sub === 'rollback')) {
      const vmid = interaction.options.getInteger('vmid');
      if (vmid) choices = await listSnapshotsForVM(vmid);
    }

    // Filter by user input
    const query = String(focused.value || '').toLowerCase();
    if (query && Array.isArray(choices)) {
      choices = choices.filter(c => c.name.toLowerCase().includes(query) || String(c.value).toLowerCase().includes(query));
    }
    // Always respond quickly; even empty list is acceptable
    const out = (choices || []).slice(0, 25);
    if (DBG) {
      try { log(`AC respond: focus=${focused?.name} choices=${out.length}`, 'INFO', 'VPS'); } catch (_) {}
    }
    await interaction.respond(out);
  } catch (err) {
    try {
      const DBG = process.env.AUTOCOMPLETE_DEBUG === '1';
      if (DBG) { try { log(`AC error: ${err.message}`, 'WARN', 'VPS'); } catch (_) {} }
      await interaction.respond([]);
    } catch (_) {}
  }
}

// Resize disk
async function resizeDiskVPS(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const disk = interaction.options.getString('disk');
    const rawSize = (interaction.options.getString('size') || '').trim();
    // Validate presence
    if (!rawSize) {
      const emb = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(T('❌ Taille manquante', '❌ Missing size'))
        .setDescription(T('Utilisez un format: +<nombre><K|M|G|T> (ex: +10G)', 'Use: +<number><K|M|G|T> (e.g., +10G)'));
      await interaction.editReply({ embeds: [emb] });
      return;
    }
    if (rawSize.startsWith('-')) {
      const emb = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(T('❌ Réduction non supportée', '❌ Shrinking not supported'))
        .setDescription(T('Proxmox n\'autorise pas la réduction. Utilisez un format de croissance, ex: +10G', 'Proxmox does not support shrinking. Use growth format, e.g. +10G'));
      await interaction.editReply({ embeds: [emb] });
      return;
    }

    // Normalize input and determine if absolute target was provided
    let size = rawSize.toUpperCase();
    const missingUnitRx = /^(\+)?(\d+)$/; // e.g., +4 or 4
    if (missingUnitRx.test(size)) {
      const emb = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(T('❌ Unité manquante', '❌ Missing unit'))
        .setDescription(T('Ajoutez K/M/G/T. Exemples: +4G, 4G, +512M', 'Add K/M/G/T. Examples: +4G, 4G, +512M'));
      await interaction.editReply({ embeds: [emb] });
      return;
    }
    const unitRx = /^(\+)?(\d+)(K|M|G|T)$/i;
    const m = unitRx.exec(size);
    if (!m) {
      const emb = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(T('❌ Format invalide', '❌ Invalid format'))
        .setDescription(T('Format attendu: +<nombre><K|M|G|T> (ex: +10G) ou <nombre><K|M|G|T>', 'Expected: +<number><K|M|G|T> (e.g., +10G) or <number><K|M|G|T>'));
      await interaction.editReply({ embeds: [emb] });
      return;
    }

    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }

    // Fetch current disk size from config
    let currentBytes = null;
    try {
      const cfg = await px.getVMConfig(node, vmid);
      const val = cfg?.[disk];
      if (typeof val === 'string') {
        const sm = val.match(/[,;\s]size=([^,\s]+)/i);
        if (sm && sm[1]) {
          const unitM = /^(\d+)(K|M|G|T)$/i.exec(sm[1]);
          if (unitM) {
            const n = Number(unitM[1]);
            const u = unitM[2].toUpperCase();
            const mult = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4 }[u];
            currentBytes = n * mult;
          }
        }
      }
    } catch (_) {}

    // If user did not include '+', treat as absolute target if we know current size
    const hasPlus = !!m[1];
    const reqNum = Number(m[2]);
    const reqUnit = m[3].toUpperCase();
    const unitMult = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4 };

    if (!hasPlus && currentBytes != null) {
      const requestedBytes = reqNum * unitMult[reqUnit];
      if (requestedBytes <= currentBytes) {
        const curInReqUnit = Math.round(currentBytes / unitMult[reqUnit]);
        const emb = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle(T('❌ Réduction détectée', '❌ Shrink detected'))
          .setDescription(T(
            `Taille actuelle ≈ ${curInReqUnit}${reqUnit}. Réduction vers ${reqNum}${reqUnit} non supportée. Utilisez un format de croissance (ex: +4G).`,
            `Current size ≈ ${curInReqUnit}${reqUnit}. Shrinking to ${reqNum}${reqUnit} is not supported. Use a growth format (e.g., +4G).`
          ));
        await interaction.editReply({ embeds: [emb] });
        return;
      }
      // Convert absolute to delta (requested - current) in the same unit
      const deltaBytes = requestedBytes - currentBytes;
      const deltaInUnit = Math.max(1, Math.round(deltaBytes / unitMult[reqUnit]));
      size = `+${deltaInUnit}${reqUnit}`;
    } else if (!hasPlus) {
      // No current available; fall back to growth interpretation
      size = `+${reqNum}${reqUnit}`;
    }

    await px.resizeDisk(node, vmid, disk, size);
    const embed = new EmbedBuilder()
      .setTitle(T('📏 Redimensionnement disque', '📏 Disk resize'))
      .setDescription(T(`VM ${vmid} (${node}) · ${disk} ← ${size}`, `VM ${vmid} (${node}) · ${disk} ← ${size}`))
      .setColor(0x2aa198)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const emb = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(isEN ? '❌ Resize error' : '❌ Erreur redimensionnement')
      .setDescription(String(err.message || err));
    await interaction.editReply({ embeds: [emb] });
  }
}

// Adjust CPU/memory
async function adjustResourcesVPS(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const cpu = interaction.options.getInteger('cpu_cores');
    const mem = interaction.options.getInteger('memory_mb');
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    await px.setVMConfig(node, vmid, { cores: cpu, memory: mem });
    const embed = new EmbedBuilder()
      .setTitle(T('🧮 Ressources ajustées', '🧮 Resources adjusted'))
      .setDescription(T(`VM ${vmid} (${node}) · CPU: ${cpu} · RAM: ${mem} MB`, `VM ${vmid} (${node}) · CPU: ${cpu} · RAM: ${mem} MB`))
      .setColor(0xb58900)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Adjust error: ${err.message}` : `❌ Erreur ajustement: ${err.message}` });
  }
}

// Migrate VM
async function migrateVPS(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const target = interaction.options.getString('target_node');
    const online = interaction.options.getBoolean('online');
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    const opts = {};
    if (online != null) opts.online = online ? 1 : 0;
    await px.migrateVM(node, vmid, target, opts);
    const embed = new EmbedBuilder()
      .setTitle(T('🚚 Migration lancée', '🚚 Migration started'))
      .setDescription(T(`VM ${vmid}: ${node} → ${target} ${online ? '(live)' : ''}`, `VM ${vmid}: ${node} → ${target} ${online ? '(live)' : ''}`))
      .setColor(0x268bd2)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Migration error: ${err.message}` : `❌ Erreur migration: ${err.message}` });
  }
}

// Snapshot operations
async function snapshotCreate(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description') || '';
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    await px.createSnapshot(node, vmid, name, description);
    await interaction.editReply({ content: T(`📸 Snapshot \`${name}\` créé pour VM ${vmid}.`, `📸 Snapshot \`${name}\` created for VM ${vmid}.`) });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Snapshot create error: ${err.message}` : `❌ Erreur création snapshot: ${err.message}` });
  }
}

async function snapshotList(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    const snaps = await px.listSnapshots(node, vmid);
    if (!snaps || !snaps.length) { await interaction.editReply({ content: T('📭 Aucun snapshot.', '📭 No snapshots.') }); return; }
    const lines = snaps.map(s => `• ${s.name || s.snapname} — ${s.description || ''} ${s.current ? ' (current)' : ''}`).join('\n');
    const embed = new EmbedBuilder().setTitle(T(`📚 Snapshots de VM ${vmid}`, `📚 VM ${vmid} snapshots`)).setDescription(lines).setColor(0x586e75);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Snapshot list error: ${err.message}` : `❌ Erreur liste snapshot: ${err.message}` });
  }
}

async function snapshotDelete(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const name = interaction.options.getString('name');
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    await px.deleteSnapshot(node, vmid, name);
    await interaction.editReply({ content: T(`🗑️ Snapshot \`${name}\` supprimé.`, `🗑️ Snapshot \`${name}\` deleted.`) });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Snapshot delete error: ${err.message}` : `❌ Erreur suppression snapshot: ${err.message}` });
  }
}

async function snapshotRollback(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    const vmid = interaction.options.getInteger('vmid');
    const name = interaction.options.getString('name');
    const node = await findNodeByVMID(vmid);
    if (!node) { await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) }); return; }
    await px.rollbackSnapshot(node, vmid, name);
    await interaction.editReply({ content: T(`↩️ Retour au snapshot \`${name}\` lancé.`, `↩️ Rollback to snapshot \`${name}\` started.`) });
  } catch (err) {
    await interaction.editReply({ content: isEN ? `❌ Snapshot rollback error: ${err.message}` : `❌ Erreur rollback snapshot: ${err.message}` });
  }
}

// Validation helpers for SSH inputs
function isValidIPv4(ip) {
  // strict IPv4 check
  const m = /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.exec(ip || "");
  if (!m) return false;
  return ip.split('.').every(oct => {
    const n = Number(oct);
    return n >= 0 && n <= 255 && String(n) === oct.replace(/^0+(?=\d)/, oct === '0' ? '0' : oct); // keep numeric
  });
}

function isValidPort(p) {
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

function isValidUser(u) {
  // Typical Linux username rules: start with letter/underscore, then letters/digits/._-
  return typeof u === 'string' && /^[a-z_][a-z0-9_\.-]*$/i.test(u) && u.length <= 32;
}

function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 1 && pw.length <= 128;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vps")
    .setDescription("Gérer et monitorer vos VPS / Manage and monitor your VPS")
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("Lister tous vos VPS / List all your VPS")
    )
    .addSubcommandGroup(group =>
      group
        .setName('blacklist')
        .setDescription('Gérer la blacklist de VMID / Manage VMID blacklist')
        .addSubcommand(sc => sc
          .setName('add')
          .setDescription('Ajouter un VMID à la blacklist (admin) / Add a VMID to blacklist (admin)')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sc => sc
          .setName('remove')
          .setDescription('Retirer un VMID de la blacklist (admin) / Remove a VMID from blacklist (admin)')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sc => sc
          .setName('list')
          .setDescription('Lister les VMID blacklistés / List blacklisted VMIDs')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("clone")
        .setDescription("Cloner une VM / Clone a VM")
        .addIntegerOption(o => o.setName('vmid').setDescription('ID source / Source VM ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('newid').setDescription('Nouveau VMID / New VMID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('name').setDescription('Nom de la nouvelle VM / New VM name').setRequired(false))
        .addStringOption(o => o.setName('target_node').setDescription('Node cible / Target node').setRequired(false).setAutocomplete(true))
        .addStringOption(o => o.setName('mode').setDescription('Type de clone / Clone type').addChoices({name:'full', value:'full'}, {name:'linked', value:'linked'}).setRequired(false))
        .addStringOption(o => o.setName('storage').setDescription('Stockage cible / Target storage').setRequired(false).setAutocomplete(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("resize_disk")
        .setDescription("Redimensionner un disque / Resize a disk")
        .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('disk').setDescription('Disque (ex: scsi0, sata0, virtio0) / Disk').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('size').setDescription('Taille (ex: +10G) / Size (e.g., +10G)').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("adjust_resources")
        .setDescription("Ajuster CPU/Mémoire / Adjust CPU/Memory")
        .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('cpu_cores').setDescription('Cœurs CPU / CPU cores').setRequired(true))
        .addIntegerOption(o => o.setName('memory_mb').setDescription('Mémoire (MB) / Memory (MB)').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("migrate")
        .setDescription("Migrer une VM vers un autre node / Migrate a VM to another node")
        .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('target_node').setDescription('Node cible / Target node').setRequired(true).setAutocomplete(true))
        .addBooleanOption(o => o.setName('online').setDescription('Migration à chaud / Live migration').setRequired(false))
    )
    .addSubcommandGroup(group =>
      group
        .setName('snapshot')
        .setDescription('Gérer les snapshots / Manage snapshots')
        .addSubcommand(sc => sc
          .setName('create')
          .setDescription('Créer un snapshot / Create snapshot')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
          .addStringOption(o => o.setName('name').setDescription('Nom du snapshot / Snapshot name').setRequired(true))
          .addStringOption(o => o.setName('description').setDescription('Description (optionnel) / Description (optional)'))
        )
        .addSubcommand(sc => sc
          .setName('list')
          .setDescription('Lister les snapshots / List snapshots')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sc => sc
          .setName('delete')
          .setDescription('Supprimer un snapshot / Delete snapshot')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
          .addStringOption(o => o.setName('name').setDescription('Nom du snapshot / Snapshot name').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sc => sc
          .setName('rollback')
          .setDescription('Revenir à un snapshot / Rollback to snapshot')
          .addIntegerOption(o => o.setName('vmid').setDescription('VM ID').setRequired(true).setAutocomplete(true))
          .addStringOption(o => o.setName('name').setDescription('Nom du snapshot / Snapshot name').setRequired(true).setAutocomplete(true))
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Vérifier le statut d'un VPS / Check VPS status")
        .addIntegerOption(option =>
          option
            .setName("vmid")
            .setDescription("ID de la VM / VM ID")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("action")
        .setDescription("Exécuter une action sur un VPS / Perform an action on a VPS")
        .addIntegerOption(option =>
          option
            .setName("vmid")
            .setDescription("ID de la VM / VM ID")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName("type")
            .setDescription("Action à exécuter / Action to perform")
            .addChoices(
              { name: "start", value: "start" },
              { name: "stop", value: "stop" },
              { name: "restart", value: "restart" },
              { name: "delete", value: "delete" },
            )
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("ssh")
        .setDescription("Ouvrir une session SSH sur une machine / Open an SSH session")
        .addStringOption(o => o.setName('ip').setDescription('Adresse IP / IP address').setRequired(true))
        .addStringOption(o => o.setName('user').setDescription('Utilisateur / User').setRequired(true))
        .addStringOption(o => o.setName('password').setDescription('Mot de passe / Password').setRequired(true))
        .addStringOption(o => o.setName('cmd').setDescription('Commande à exécuter (optionnel) / Command to run (optional)').setRequired(false))
        .addIntegerOption(o => o.setName('port').setDescription('Port SSH (optionnel, défaut: 22) / SSH port (optional, default: 22)').setRequired(false))
    ),
  execute: async (interaction) => {
    try {
      await interaction.deferReply({ flags: 64 });
      const lang = getUserLang(interaction.user.id, interaction.guildId);
      const isEN = lang === 'en';
      const T = (fr, en) => (isEN ? en : fr);
      const subcommand = interaction.options.getSubcommand();
      const group = interaction.options.getSubcommandGroup?.() || null;
      if (group === 'snapshot') {
        switch (subcommand) {
          case 'create': await snapshotCreate(interaction, isEN); break;
          case 'list': await snapshotList(interaction, isEN); break;
          case 'delete': await snapshotDelete(interaction, isEN); break;
          case 'rollback': await snapshotRollback(interaction, isEN); break;
          default:
            await interaction.editReply({ content: T("❌ Sous-commande snapshot inconnue.", "❌ Unknown snapshot subcommand.") });
        }
        return;
      }
      if (group === 'blacklist') {
        if (!store.isAdmin(interaction.user.id)) {
          await interaction.editReply({ content: T("❌ Réservé aux administrateurs.", "❌ Admins only.") });
          return;
        }
        switch (subcommand) {
          case 'add': await blacklistAdd(interaction, isEN); break;
          case 'remove': await blacklistRemove(interaction, isEN); break;
          case 'list': await blacklistList(interaction, isEN); break;
          default:
            await interaction.editReply({ content: T("❌ Sous-commande blacklist inconnue.", "❌ Unknown blacklist subcommand.") });
        }
        return;
      }
      switch (subcommand) {
        case "list":
          await listVPS(interaction, isEN);
          break;
        case "status":
          await getVPSStatus(interaction, isEN);
          break;
        case "action":
          await actionVPS(interaction, isEN);
          break;
        case "clone":
          await cloneVPS(interaction, isEN);
          break;
        case "resize_disk":
          await resizeDiskVPS(interaction, isEN);
          break;
        case "adjust_resources":
          await adjustResourcesVPS(interaction, isEN);
          break;
        case "migrate":
          await migrateVPS(interaction, isEN);
          break;
        case "ssh":
          await openSSHConsole(interaction, isEN);
          break;
        default:
          await interaction.editReply({ content: T("❌ Sous-commande non reconnue.", "❌ Unknown subcommand.") });
      }
    } catch (err) {
      log(err.stack, "ERROR", "VPS");
      const lang = getUserLang(interaction.user.id, interaction.guildId);
      const isEN = lang === 'en';
      await interaction.editReply({ content: isEN ? `❌ Error: ${err.message}` : `❌ Erreur: ${err.message}` });
    }
  },
  autocomplete,
};

// Fonction pour lister les VPS
async function listVPS(interaction, isEN) {
  try {
    const T = (fr, en) => (isEN ? en : fr);
    const nodes = await px.nodes();
    const onlineNodes = nodes.filter(n => n.status === "online");

    if (!onlineNodes.length) {
      await interaction.editReply({ content: T("❌ Aucun node Proxmox en ligne disponible.", "❌ No online Proxmox nodes available.") });
      return;
    }

    let allVMs = [];
    for (const node of onlineNodes) {
      try {
        const vms = await px.getVMs(node.node);
        const userVMs = vms.filter(vm => vm.template !== 1);
        allVMs.push(...userVMs.map(vm => ({ ...vm, node: node.node })));
      } catch (err) {
        log(`Erreur récupération VMs du node ${node.node}: ${err.message}`, "WARN", "VPS");
      }
    }

    if (!allVMs.length) {
      await interaction.editReply({ content: T("📭 Aucun VPS trouvé.", "📭 No VPS found.") });
      return;
    }

    allVMs.sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return a.vmid - b.vmid;
    });

    const embed = new EmbedBuilder()
      .setTitle(T("🖥️ Liste de vos VPS", "🖥️ Your VPS List"))
      .setDescription(T(`**${allVMs.length}** VPS trouvé(s) sur **${onlineNodes.length}** node(s)`, `**${allVMs.length}** VPS found across **${onlineNodes.length}** node(s)`))
      .setColor(0x0099ff)
      .setTimestamp();

    const runningVMs = allVMs.filter(vm => vm.status === "running");
    const stoppedVMs = allVMs.filter(vm => vm.status === "stopped");
    const otherVMs = allVMs.filter(vm => !["running", "stopped"].includes(vm.status));

    if (runningVMs.length > 0) {
      const runningList = runningVMs.map(vm => `🟢 **${vm.vmid}** - ${vm.name || `VPS-${vm.vmid}`} (${vm.node})`).join("\n");
      embed.addFields({ name: T(`🟢 En cours (${runningVMs.length})`, `🟢 Running (${runningVMs.length})`), value: runningList, inline: false });
    }

    if (stoppedVMs.length > 0) {
      const stoppedList = stoppedVMs.map(vm => `🔴 **${vm.vmid}** - ${vm.name || `VPS-${vm.vmid}`} (${vm.node})`).join("\n");
      embed.addFields({ name: T(`🔴 Arrêtés (${stoppedVMs.length})`, `🔴 Stopped (${stoppedVMs.length})`), value: stoppedList, inline: false });
    }

    if (otherVMs.length > 0) {
      const otherList = otherVMs.map(vm => `🟡 **${vm.vmid}** - ${vm.name || `VPS-${vm.vmid}`} (${vm.node}) - ${vm.status}`).join("\n");
      embed.addFields({ name: T(`🟡 Autres (${otherVMs.length})`, `🟡 Others (${otherVMs.length})`), value: otherList, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    log(err.stack, "ERROR", "VPS");
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN2 = lang === 'en';
    await interaction.editReply({ content: isEN2 ? `❌ Error while fetching VPS: ${err.message}` : `❌ Erreur lors de la récupération des VPS: ${err.message}` });
  }
}

// Fonction pour vérifier le statut d'un VPS
async function getVPSStatus(interaction, isEN) {
  try {
    const T = (fr, en) => (isEN ? en : fr);
    const vmid = interaction.options.getInteger("vmid");

    const nodes = await px.nodes();
    let vmInfo = null;
    let nodeName = null;
    for (const node of nodes) {
      try {
        const vms = await px.getVMs(node.node);
        const vm = vms.find(v => v.vmid === vmid);
        if (vm) {
          vmInfo = vm;
          nodeName = node.node;
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!vmInfo) {
      await interaction.editReply({ content: T(`❌ VPS avec VMID ${vmid} non trouvé.`, `❌ VPS with VMID ${vmid} not found.`) });
      return;
    }

    let detailedInfo = {};
    let runtimeStatus = null;
    try {
      detailedInfo = await px.getVMConfig(nodeName, vmid);
    } catch (err) {
      log(`Impossible de récupérer la config de la VM ${vmid}: ${err.message}`, "WARN", "VPS");
    }

    try {
      runtimeStatus = await px.getVMStatus(nodeName, vmid);
    } catch (err) {
      log(`Impossible de récupérer le statut runtime de la VM ${vmid}: ${err.message}`, "WARN", "VPS");
    }

    let ip = T("Non disponible", "Not available");
    if (vmInfo.status === "running") {
      try {
        const networkInfo = await px.getVMNetworkInfo(nodeName, vmid);
        if (networkInfo && networkInfo.ip) {
          ip = networkInfo.ip;
        }
      } catch (err) {
        log(`Impossible de récupérer l'IP de la VM ${vmid}: ${err.message}`, "DEBUG", "VPS");
      }
    }

    const statusColor = vmInfo.status === "running" ? 0x00ff00 : vmInfo.status === "stopped" ? 0xff0000 : 0xffaa00;
    const cpuPercent = runtimeStatus?.cpu ? Math.round(runtimeStatus.cpu * 100) : 0;
    const memUsedGiB = runtimeStatus?.mem ? Math.round(runtimeStatus.mem / 1024 / 1024 / 1024) : 0;
    const memMaxGiB = runtimeStatus?.maxmem ? Math.round(runtimeStatus.maxmem / 1024 / 1024 / 1024) : 0;
    const diskUsedGiB = runtimeStatus?.disk ? Math.round(runtimeStatus.disk / 1024 / 1024 / 1024) : 0;
    const diskMaxGiB = runtimeStatus?.maxdisk ? Math.round(runtimeStatus.maxdisk / 1024 / 1024 / 1024) : 0;

    const uptimeSec = runtimeStatus?.uptime || 0;
    const d = Math.floor(uptimeSec / 86400);
    const h = Math.floor((uptimeSec % 86400) / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = uptimeSec ? (isEN ? `${d ? d + 'd ' : ''}${h}h ${m}m` : `${d ? d + 'j ' : ''}${h}h ${m}m`) : 'N/A';

    let fsLine = null;
    let fsTotalLine = null;
    let fsUsedAllGiB = null;
    if (vmInfo.status === 'running') {
      try {
        const fsinfo = await px.getFSInfo(nodeName, vmid);
        if (Array.isArray(fsinfo)) {
          let entries = [];
          for (const e of fsinfo) {
            const mountpoint = e.mountpoint || e.path || e.dir || e.name;
            const total = e['total-bytes'] || e.total || e.size || 0;
            const used = e['used-bytes'] || e.used || 0;
            if (mountpoint && typeof total === 'number') {
              entries.push({ mountpoint, total, used });
            }
          }
          if (entries.length) {
            let root = entries.find(x => x.mountpoint === '/');
            if (!root) {
              root = entries.sort((a, b) => b.total - a.total)[0];
            }
            const usedGiB = Math.round((root.used || 0) / 1024 / 1024 / 1024);
            const totalGiB = Math.round((root.total || 0) / 1024 / 1024 / 1024);
            const pct = root.total ? Math.round(((root.used || 0) / root.total) * 100) : 0;
            fsLine = `${pct}% (${usedGiB}/${totalGiB} Go) sur ${root.mountpoint}`;
            const ignorePrefixes = ['/proc', '/sys', '/dev', '/run'];
            const physical = entries.filter(x => ignorePrefixes.every(p => !x.mountpoint.startsWith(p)));
            const sumTotal = physical.reduce((acc, x) => acc + (x.total || 0), 0);
            const sumUsed = physical.reduce((acc, x) => acc + (x.used || 0), 0);
            if (sumTotal > 0) {
              const pctAll = Math.round((sumUsed / sumTotal) * 100);
              const usedAllGiB = Math.round(sumUsed / 1024 / 1024 / 1024);
              const totalAllGiB = Math.round(sumTotal / 1024 / 1024 / 1024);
              fsTotalLine = `${pctAll}% (${usedAllGiB}/${totalAllGiB} Go)`;
              fsUsedAllGiB = usedAllGiB;
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(T(`📊 Statut du VPS ${vmid}`, `📊 VPS ${vmid} Status`))
      .setDescription(`**${vmInfo.name || `VPS-${vmid}`}**`)
      .setColor(statusColor)
      .addFields(
        { name: "🆔 VMID", value: vmid.toString(), inline: true },
        { name: "🖥️ Node", value: nodeName, inline: true },
        { name: T("📊 Statut", "📊 Status"), value: vmInfo.status, inline: true },
        { name: "🌐 IP", value: ip, inline: true },
        { name: "⚡ CPU", value: `${cpuPercent}%`, inline: true },
        { name: T("💾 RAM", "💾 RAM"), value: memMaxGiB ? (isEN ? `${memUsedGiB}/${memMaxGiB} GB` : `${memUsedGiB}/${memMaxGiB} Go`) : "N/A", inline: true },
        { name: T("💽 Disque (provisionné)", "💽 Disk (provisioned)"), value: diskMaxGiB ? (isEN ? `${diskMaxGiB} GB` : `${diskMaxGiB} Go`) : "N/A", inline: true },
        { name: "⏱️ Uptime", value: uptimeStr, inline: true }
      )
      .setTimestamp();

    if (detailedInfo.ciuser) {
      embed.addFields({ name: T("👤 Utilisateur", "👤 User"), value: detailedInfo.ciuser, inline: true });
    }
    if (fsLine) {
      embed.addFields({ name: "📁 FS /", value: isEN ? fsLine.replaceAll(' Go', ' GB') : fsLine, inline: true });
    }
    if (fsTotalLine) {
      embed.addFields({ name: T("🗄️ FS (total)", "🗄️ FS (total)"), value: isEN ? fsTotalLine.replace(' Go', ' GB') : fsTotalLine, inline: true });
    }
    if (fsUsedAllGiB != null && diskMaxGiB) {
      const pctVsProv = Math.min(100, Math.round((fsUsedAllGiB / diskMaxGiB) * 100));
      embed.addFields({ name: T("🧮 FS (vs provisionné)", "🧮 FS (vs provisioned)"), value: isEN ? `${pctVsProv}% (${fsUsedAllGiB}/${diskMaxGiB} GB)` : `${pctVsProv}% (${fsUsedAllGiB}/${diskMaxGiB} Go)`, inline: true });
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vps_start_${vmid}`)
          .setLabel(isEN ? "▶️ Start" : "▶️ Démarrer")
          .setStyle(ButtonStyle.Success)
          .setDisabled(vmInfo.status === "running"),
        new ButtonBuilder()
          .setCustomId(`vps_stop_${vmid}`)
          .setLabel(isEN ? "⏹️ Stop" : "⏹️ Arrêter")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(vmInfo.status === "stopped"),
        new ButtonBuilder()
          .setCustomId(`vps_restart_${vmid}`)
          .setLabel(isEN ? "🔄 Restart" : "🔄 Redémarrer")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(vmInfo.status !== "running")
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    log(err.stack, "ERROR", "VPS");
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN2 = lang === 'en';
    await interaction.editReply({ content: isEN2 ? `❌ Error retrieving VPS status: ${err.message}` : `❌ Erreur lors de la récupération du statut du VPS : ${err.message}` });
  }

}

// Fonction pour exécuter une action sur un VPS
async function actionVPS(interaction, isEN) {
  try {
    const T = (fr, en) => (isEN ? en : fr);
    const vmid = interaction.options.getInteger("vmid");
    const type = interaction.options.getString("type");

    if (!vmid || !type) {
      await interaction.editReply({ content: T('❌ Paramètres manquants (vmid/type).', '❌ Missing parameters (vmid/type).') });
      return;
    }

    // Blacklist: forbid management actions on listed VMIDs
    if (bl.hasVM(vmid)) {
      await interaction.editReply({ content: T(`⛔ Le VPS ${vmid} est blacklisté. Action interdite.`, `⛔ VPS ${vmid} is blacklisted. Action forbidden.`) });
      return;
    }

    // Find which node the VM is on
    const node = await findNodeByVMID(vmid);
    if (!node) {
      await interaction.editReply({ content: T(`❌ VMID ${vmid} introuvable.`, `❌ VMID ${vmid} not found.`) });
      return;
    }

    // Execute the requested action
    try {
      switch (type.toLowerCase()) {
        case 'start':
          await px.startVM(node, vmid);
          await interaction.editReply({ content: T(`🟢 Démarrage du VPS ${vmid} en cours...`, `🟢 Starting VPS ${vmid}...`) });
          break;
        case 'stop':
          await px.stopVM(node, vmid);
          await interaction.editReply({ content: T(`🔴 Arrêt du VPS ${vmid} en cours...`, `🔴 Stopping VPS ${vmid}...`) });
          break;
        case 'restart':
          await px.rebootVM(node, vmid);
          await interaction.editReply({ content: T(`🔄 Redémarrage du VPS ${vmid} en cours...`, `🔄 Restarting VPS ${vmid}...`) });
          break;
        default:
          await interaction.editReply({ content: T(`❌ Action non supportée: ${type}`, `❌ Unsupported action: ${type}`) });
          return;
      }
    } catch (err) {
      log(`Error in VPS action ${type} on ${vmid}: ${err.message}`, 'ERROR', 'VPS');
      throw err; // Let the outer catch handle it
    }
  } catch (err) {
    log(err.stack, "ERROR", "VPS");
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN2 = lang === 'en';
    await interaction.editReply({ content: isEN2 ? `❌ Error during VPS action: ${err.message}` : `❌ Erreur lors de l'action VPS: ${err.message}` });
  }
}

// Ouvrir une session SSH (commande /vps ssh)
async function openSSHConsole(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  try {
    // Autorisation: réservé aux utilisateurs autorisés
    if (!store.isAllowed(interaction.user.id)) {
      await interaction.editReply({ content: T("❌ Vous n'êtes pas autorisé à utiliser SSH.", "❌ You are not allowed to use SSH.") });
      return;
    }

    // Récupérer et valider les options
    const ip = interaction.options.getString('ip');
    const user = interaction.options.getString('user');
    const password = interaction.options.getString('password');
    const port = interaction.options.getInteger('port') || 22;
    const cmd = interaction.options.getString('cmd');

    if (!ip || !user || !password) {
      await interaction.editReply({ content: T('❌ Paramètres manquants (ip/user/password).', '❌ Missing parameters (ip/user/password).') });
      return;
    }
    if (!isValidPort(port)) {
      await interaction.editReply({ content: T('❌ Port invalide.', '❌ Invalid port.') });
      return;
    }
    if (!isValidUser(user)) {
      await interaction.editReply({ content: T('❌ Nom utilisateur invalide.', '❌ Invalid username.') });
      return;
    }
    if (!isValidPassword(password)) {
      await interaction.editReply({ content: T('❌ Mot de passe invalide.', '❌ Invalid password.') });
      return;
    }
    // IP: autoriser IPv4; si non IPv4 stricte, on accepte (hostname) mais on prévient silencieusement
    if (!isValidIPv4(ip)) {
      // pas de rejet strict: certains utilisent des noms DNS
    }

    // Créer la session et l'enregistrer
    const session = {
      host: ip,
      port,
      user,
      password,
      history: [],
      isRoot: false,
    };
    sshSessions.set(interaction.user.id, session);

    // Exécuter commande initiale si fournie
    if (cmd && cmd.trim()) {
      try {
        const output = await execSSH(session, cmd.trim(), isEN);
        session.history.push({ cmd: cmd.trim(), output });
      } catch (e) {
        session.history.push({ cmd: cmd.trim(), output: isEN ? `❌ Error: ${e.message}` : `❌ Erreur: ${e.message}` });
      }
    }

    // Afficher l'embed interactif
    await interaction.editReply(renderSSHEmbed(session, isEN));
  } catch (err) {
    log(err.stack, 'ERROR', 'VPS');
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN2 = lang === 'en';
    await interaction.editReply({ content: isEN2 ? `❌ SSH error: ${err.message}` : `❌ Erreur SSH: ${err.message}` });
  }
}

// ...

// Gestion des interactions boutons/modals
module.exports.route = async (interaction) => {
  const id = interaction.customId;
  const lang = getUserLang(interaction.user.id, interaction.guildId);
  const isEN = lang === 'en';
  const T = (fr, en) => (isEN ? en : fr);

  // Bouton CONFIRM DELETE: ouvrir le modal (NE PAS deferUpdate avant showModal)
  if (interaction.isButton() && id.startsWith('vpsdel_confirmbtn_')) {
    const parts = id.split('_'); // [ 'vpsdel', 'confirmbtn', node, vmid ]
    const node = parts[2];
    const vmid = parts[3];
    const modal = new ModalBuilder()
      .setCustomId(`vpsdel_confirm_${node}_${vmid}`)
      .setTitle(T('⚠️ Confirmer la suppression du VPS', '⚠️ Confirm VPS deletion'));
    const input = new TextInputBuilder()
      .setCustomId('confirm_vmid')
      .setLabel(T(`Tapez le VMID (${vmid}) pour confirmer`, `Type VMID (${vmid}) to confirm`))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder(String(vmid));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // Bouton CANCEL DELETE: retirer les composants
  if (interaction.isButton() && id.startsWith('vpsdel_cancel_')) {
    await interaction.deferUpdate();
    const message = await interaction.fetchReply();
    await interaction.editReply({ content: T('❎ Suppression annulée.', '❎ Deletion cancelled.'), embeds: [], components: [] });
    return;
  }

  // Gestion des boutons VPS génériques (start/stop/restart)
  if (interaction.isButton() && id.startsWith('vps_')) {
    await interaction.deferUpdate();
    const [prefix, action, vmidStr] = id.split('_');
    const vmid = Number(vmidStr);
    if (!vmid || !action) return;
    try {
      const fakeOptions = {
        getInteger: () => vmid,
        getString: () => action,
      };
      const fakeInteraction = {
        ...interaction,
        options: {
          getInteger: fakeOptions.getInteger,
          getString: fakeOptions.getString,
        },
        editReply: (data) => interaction.editReply(data),
      };
      await actionVPS(fakeInteraction, isEN);
    } catch (err) {
      log(`Erreur bouton ${id}: ${err.message}`, 'ERROR', 'VPS');
    }
    return;
  }

  // Gestion des boutons SSH
  if (interaction.isButton() && id.startsWith('ssh_')) {
    const userId = interaction.user.id;
    const session = sshSessions.get(userId);

    if (!session) {
      await interaction.reply({ content: T('❌ Session SSH non trouvée. Veuillez créer une nouvelle session.', '❌ SSH session not found. Please create a new session.'), flags: 64 });
      return;
    }

    if (id === 'ssh_run') {
      const modal = new ModalBuilder()
        .setCustomId('ssh_cmd_modal')
        .setTitle(T('SSH - Exécuter une commande', 'SSH - Run a command'));

      const input = new TextInputBuilder()
        .setCustomId('ssh_cmd')
        .setLabel(T('Commande à exécuter', 'Command to run'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder(T('Ex: ls -la, ps aux, df -h, systemctl status nginx...', 'Eg: ls -la, ps aux, df -h, systemctl status nginx...'))
        .setMaxLength(2000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // Pour les autres boutons, on peut utiliser deferUpdate
    await interaction.deferUpdate();

    if (id === 'ssh_clear') {
      session.history = [];
      await interaction.editReply(renderSSHEmbed(session, isEN));
      return;
    }

    if (id === 'ssh_root') {
      try {
        const output = await execSSH(session, 'sudo -i', isEN);
        session.history.push({ cmd: 'sudo -i', output });
        await interaction.editReply(renderSSHEmbed(session, isEN));
      } catch (err) {
        await interaction.followUp({ content: isEN ? `❌ Cannot become root: ${err.message}` : `❌ Impossible de devenir root: ${err.message}`, flags: 64 });
      }
      return;
    }

    if (id === 'ssh_close') {
      sshSessions.delete(userId);
      const closeEmbed = new EmbedBuilder()
        .setTitle(T('🔒 Session SSH fermée', '🔒 SSH Session closed'))
        .setDescription(T(`La session SSH vers \`${session.user}@${session.host}:${session.port}\` a été fermée avec succès.`, `SSH session to \`${session.user}@${session.host}:${session.port}\` has been closed successfully.`))
        .setColor(0xff6b6b)
        .setTimestamp();
      await interaction.editReply({ embeds: [closeEmbed], components: [] });
      return;
    }

    // Gestion des boutons de raccourcis
    if (id.startsWith('ssh_quick_')) {
      const quickType = id.split('_')[2];
      let quickCmd = '';
      
      switch (quickType) {
        case 'status':
          quickCmd = 'sudo systemctl status --no-pager | head -20 && echo "\n=== UPTIME ===" && uptime && echo "\n=== MEMORY ===" && free -h';
          break;
        case 'processes':
          quickCmd = 'sudo ps aux --sort=-%cpu | head -10';
          break;
        case 'disk':
          quickCmd = 'df -h && echo "\n=== INODES ===" && df -i';
          break;
        case 'network':
          quickCmd = 'sudo ss -tuln | head -15 && echo "\n=== IP CONFIG ===" && ip addr show | grep -E "inet|UP"';
          break;
      }
      
      if (quickCmd) {
        try {
          const output = await execSSH(session, quickCmd, isEN);
          session.history.push({ cmd: quickCmd, output });
          await interaction.editReply(renderSSHEmbed(session, isEN));
        } catch (err) {
          const errorEmbed = new EmbedBuilder()
            .setTitle(T('❌ Erreur lors de l\'exécution rapide', '❌ Error while performing quick action'))
            .setDescription(T(`Impossible d'exécuter la commande rapide\n\n**Erreur:** ${err.message}`, `Unable to run quick command\n\n**Error:** ${err.message}`))
            .setColor(0xff0000)
            .setTimestamp();
          await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        }
      }
      return;
    }

    // Gestion des boutons de réexécution
    if (id.startsWith('ssh_rerun_')) {
      const historyIndex = parseInt(id.split('_')[2]);
      if (historyIndex >= 0 && historyIndex < session.history.length) {
        const cmdToRerun = session.history[historyIndex].cmd;
        try {
          const output = await execSSH(session, cmdToRerun, isEN);
          session.history.push({ cmd: cmdToRerun, output });
          await interaction.editReply(renderSSHEmbed(session, isEN));
        } catch (err) {
          const errorEmbed = new EmbedBuilder()
            .setTitle(isEN ? '❌ Error on re-run' : '❌ Erreur lors de la réexécution')
            .setDescription(isEN ? `Unable to re-run command \`${cmdToRerun}\`\n\n**Error:** ${err.message}` : `Impossible de réexécuter la commande \`${cmdToRerun}\`\n\n**Erreur:** ${err.message}`)
            .setColor(0xff0000)
            .setTimestamp();
          await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        }
      }
      return;
    }
  }

  // Gestion de la soumission de commande via modal
  if (interaction.isModalSubmit() && id === 'ssh_cmd_modal') {
    await interaction.deferUpdate();
    const userId = interaction.user.id;
    const session = sshSessions.get(userId);

    if (!session) {
      await interaction.followUp({ content: T('❌ Session SSH non trouvée. Veuillez créer une nouvelle session.', '❌ SSH session not found. Please create a new session.'), flags: 64 });
      return;
    }

    const cmd = interaction.fields.getTextInputValue('ssh_cmd');
    try {
      const output = await execSSH(session, cmd, isEN);
      session.history.push({ cmd, output });
      await interaction.editReply(renderSSHEmbed(session, isEN));
    } catch (err) {
      await interaction.followUp({ content: isEN ? `❌ Error executing \`${cmd}\`: ${err.message}` : `❌ Erreur lors de l'exécution de \`${cmd}\`: ${err.message}`, flags: 64 });
    }
    return;
  }

  // Confirmation suppression VPS
  if (interaction.isModalSubmit() && id.startsWith('vpsdel_confirm_')) {
    const parts = id.split('_'); // [ 'vpsdel', 'confirm', node, vmid ]
    const node = parts[2];
    const vmidStr = parts[3];
    const vmid = Number(vmidStr);
    const entered = interaction.fields.getTextInputValue('confirm_vmid').trim();
    if (!vmid || entered !== vmidStr) {
      await interaction.reply({ content: T(`❌ Confirmation invalide. La suppression est annulée.`, `❌ Invalid confirmation. Deletion cancelled.`), flags: 64 });
      return;
    }

    // Vérifier autorisation utilisateur (même règle que SSH: allowed)
    if (!store.isAllowed(interaction.user.id)) {
      await interaction.reply({ content: T("❌ Vous n'êtes pas autorisé à supprimer des VPS.", "❌ You are not allowed to delete VPS."), flags: 64 });
      return;
    }

    // Blacklist safety: block deletion if VMID is blacklisted
    if (bl.hasVM(vmid)) {
      await interaction.reply({ content: T(`⛔ Le VPS ${vmid} est blacklisté. Suppression interdite.`, `⛔ VPS ${vmid} is blacklisted. Deletion forbidden.`), flags: 64 });
      return;
    }

    // Procédure sécurisée: tenter stop si running, unlock, puis delete avec purge
    try {
      await interaction.reply({ content: T(`⏳ Suppression du VPS ${vmid} en cours...`, `⏳ Deleting VPS ${vmid}...`), flags: 64 });
      try {
        const status = await px.getVMStatus(node, vmid);
        if (status?.status === 'running') {
          await px.stopVM(node, vmid);
          await px.sleep(4000);
        }
      } catch (_) {}

      try { await px.forceUnlockVM(node, vmid); } catch (_) {}

      // Proxmox DELETE accepts: purge=1 and destroy-unreferenced-disks=1. Avoid skiplock (root-only).
      await px.deleteVM(node, vmid, { purge: 1, 'destroy-unreferenced-disks': 1 });
      await interaction.followUp({ content: T(`✅ VPS ${vmid} supprimé avec succès.`, `✅ VPS ${vmid} deleted successfully.`), flags: 64 });
    } catch (err) {
      log(`Suppression VM ${vmid} échouée: ${err.message}`, 'ERROR', 'VPS');
      await interaction.followUp({ content: T(`❌ Échec de suppression du VPS ${vmid}: ${err.message}`, `❌ Failed to delete VPS ${vmid}: ${err.message}`), flags: 64 });
    }
    return;
  }
};

// Blacklist commands handlers
async function blacklistAdd(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  const vmid = interaction.options.getInteger('vmid');
  try {
    bl.addVM(vmid);
    await interaction.editReply({ content: T(`✅ VMID ${vmid} ajouté à la blacklist.`, `✅ VMID ${vmid} added to blacklist.`) });
  } catch (e) {
    await interaction.editReply({ content: T(`❌ Erreur: ${e.message}`, `❌ Error: ${e.message}`) });
  }
}

async function blacklistRemove(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  const vmid = interaction.options.getInteger('vmid');
  try {
    bl.removeVM(vmid);
    await interaction.editReply({ content: T(`✅ VMID ${vmid} retiré de la blacklist.`, `✅ VMID ${vmid} removed from blacklist.`) });
  } catch (e) {
    await interaction.editReply({ content: T(`❌ Erreur: ${e.message}`, `❌ Error: ${e.message}`) });
  }
}

async function blacklistList(interaction, isEN) {
  const T = (fr, en) => (isEN ? en : fr);
  const items = bl.list();
  if (!items.length) {
    await interaction.editReply({ content: T('📭 Aucune entrée blacklist.', '📭 No blacklisted entries.') });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(T('🚫 VMIDs blacklistés', '🚫 Blacklisted VMIDs'))
    .setDescription(items.map(v => `• ${v}`).join('\n'))
    .setColor(0x8b0000)
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// Fonction pour exécuter une commande SSH
async function execSSH(session, cmd, isEN = false) {
  const { Client } = require('ssh2');
  const conn = new Client();

  // Gestion spéciale pour sudo -i (devenir root)
  if (cmd.trim().toLowerCase() === 'sudo -i') {
    session.isRoot = true;
    return isEN ? '🔑 You are now root! All next commands will run as root.' : '🔑 Vous êtes maintenant root ! Toutes les prochaines commandes seront exécutées en tant que root.';
  }

  // Support override timeout via inline marker: #timeout=SECONDS
  let overrideTimeout = null;
  const timeoutMatch = cmd.match(/#\s*timeout\s*=\s*(\d{1,5})/i);
  if (timeoutMatch) {
    overrideTimeout = Math.max(5, Math.min(86400, parseInt(timeoutMatch[1], 10))); // 5s..24h
    cmd = cmd.replace(timeoutMatch[0], '').trim();
  }

  // Toujours exécuter via bash -lc pour supporter pipes, variables, &&, etc.
  // Gestion spéciale sudo:
  // - si session.isRoot: exécuter en root via sudo bash -lc
  // - si commande commence par 'sudo ' et pas root: passer le mot de passe via sudo -S
  const escapedCmd = cmd.replace(/"/g, '\\"');
  let finalCmd = `bash -lc "${escapedCmd}"`;
  if (session.isRoot) {
    finalCmd = `sudo bash -lc "${escapedCmd}"`;
  } else if (/^\s*sudo\s+/i.test(cmd)) {
    // Retirer le préfixe sudo pour éviter double sudo
    const rest = cmd.replace(/^\s*sudo\s+/i, '').replace(/"/g, '\\"');
    // -S pour lire le mdp sur stdin, -p '' pour pas de prompt, -k pour forcer l'auth si nécessaire
    finalCmd = `bash -lc "echo '${session.password.replace(/'/g, "'\\''")}' | sudo -S -p '' bash -lc \"${rest}\""`;
  }

  try {
    // Test de connexion avec timeout plus court
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(isEN ? `Connection timeout to ${session.host}:${session.port}` : `Timeout de connexion vers ${session.host}:${session.port}`));
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(isEN ? `Connection failed: ${err.message}` : `Connexion échouée: ${err.message}`));
      })
      .connect({
        host: session.host,
        port: session.port,
        username: session.user,
        password: session.password,
        readyTimeout: 8000,
        algorithms: {
          kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          hmac: ['hmac-sha2-256', 'hmac-sha1'],
          compress: ['none']
        }
      });
    });

    // Exécution de la commande avec gestion d'erreur améliorée
    const output = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      // Déterminer un timeout adapté (ex: apt install peut être long)
      const isLongRunning = /(apt|apt-get|yum|dnf|pacman|apk|zypper|snap|flatpak)\b|\b(update|upgrade|install|dist-upgrade|full-upgrade)\b|(&&|\|\|)|\b(systemctl\s+status)\b|\b(journalctl)\b/i.test(cmd);
      const timeoutMs = (overrideTimeout ? overrideTimeout * 1000 : (isLongRunning ? 900000 : 60000)); // 15 min long, 60s sinon
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(isEN ? `Command execution timeout (${Math.round(timeoutMs/1000)}s)` : `Timeout d'exécution de la commande (${Math.round(timeoutMs/1000)}s)`));
      }, timeoutMs);

      conn.exec(finalCmd, { pty: true }, (execErr, stream) => {
        if (execErr) {
          clearTimeout(timeout);
          reject(new Error(isEN ? `Execution error: ${execErr.message}` : `Erreur d'exécution: ${execErr.message}`));
          return;
        }

        stream.on('close', (code, signal) => {
          clearTimeout(timeout);
          conn.end();
          
          let result = '';
          if (stdout) result += stdout;
          if (stderr) result += (stdout ? '\n--- STDERR ---\n' : '') + stderr;
          if (!result && code === 0) result = isEN ? '✅ Command executed successfully (no output)' : '✅ Commande exécutée avec succès (aucune sortie)';
          if (!result && code !== 0) result = isEN ? `❌ Command finished with error code ${code}` : `❌ Commande terminée avec le code d'erreur ${code}`;
          
          resolve(result);
        })
        .on('data', (data) => {
          stdout += data.toString();
        })
        .stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });

    return output;
  } catch (e) {
    conn.end();
    throw new Error(`${e.message}`);
  }
}

// Fonction pour afficher l'embed SSH avec l'historique et les boutons
function renderSSHEmbed(session, isEN = false) {
  // Créer l'affichage terminal style
  const promptSymbol = session.isRoot ? '#' : '$';
  let terminalContent = `\`\`\`bash
┌─────────────────────────────────────────────────────────────────────┐
│ 🖥️  ${isEN ? 'SSH Terminal' : 'Terminal SSH'} - ${session.user}@${session.host}:${session.port}                    │
└─────────────────────────────────────────────────────────────────────┘
`;

  if (session.history.length === 0) {
    terminalContent += `
${session.user}@${session.host}:~${promptSymbol} # ${isEN ? 'Ready to run commands' : 'Prêt à exécuter des commandes'}
# ${isEN ? 'Use the buttons below to interact' : 'Utilisez les boutons ci-dessous pour interagir'}
`;
  } else {
    // Afficher les dernières commandes dans un style terminal propre
    const recentHistory = session.history.slice(-2); // 2 dernières commandes pour rester sous 4096
    recentHistory.forEach((h, index) => {
      const actualIndex = session.history.length - recentHistory.length + index;
      // Masquer le mot de passe s'il apparaît dans la commande (sécurité d'affichage)
      const safeCmd = (h.cmd || '').replaceAll(session.password, '******');
      terminalContent += `
${session.user}@${session.host}:~${promptSymbol} ${safeCmd}`;
      
      const output = h.output.trim();
      if (output) {
        // Limiter l'output pour garder l'interface propre
        const truncatedMsg = isEN ? '\n[...output truncated, use filters like `| head -200` or add `#timeout=900` ...]' : '\n[...sortie tronquée, utilisez des filtres comme `| head -200` ou ajoutez `#timeout=900` ...]';
        const truncatedOutput = output.length > 1500 ? output.substring(0, 1500) + truncatedMsg : output;
        terminalContent += `
${truncatedOutput}`;
      }
      terminalContent += `
`;
    });
    
    terminalContent += `${session.user}@${session.host}:~${promptSymbol} # ${isEN ? 'Ready for the next command' : 'Prêt pour la prochaine commande'}`;
  }

  terminalContent += '\n```';

  const embed = new EmbedBuilder()
    .setTitle(isEN ? '💻 Interactive SSH Console' : '💻 Console SSH Interactive')
    .setDescription(terminalContent)
    .setColor(0x2f3136) // Couleur sombre comme un terminal
    .addFields(
      { name: isEN ? '🔗 Connection' : '🔗 Connexion', value: `\`${session.user}@${session.host}:${session.port}\``, inline: true },
      { name: isEN ? '📊 Commands' : '📊 Commandes', value: isEN ? `${session.history.length} executed` : `${session.history.length} exécutée(s)`, inline: true },
      { name: isEN ? '🔄 Status' : '🔄 Statut', value: isEN ? '🟢 Connected' : '🟢 Connecté', inline: true },
      { name: '👑 Mode', value: session.isRoot ? 'root (#)' : 'user ($)', inline: true }
    )
    .setFooter({ text: isEN ? 'Use the buttons to interact with the terminal' : 'Utilisez les boutons pour interagir avec le terminal' })
    .setTimestamp();

  // Boutons principaux
  const mainButtons = [
    new ButtonBuilder()
      .setCustomId('ssh_run')
      .setLabel(isEN ? 'New command' : 'Nouvelle commande')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚡'),
    new ButtonBuilder()
      .setCustomId('ssh_clear')
      .setLabel(isEN ? 'Clear terminal' : 'Vider terminal')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId('ssh_root')
      .setLabel(isEN ? 'Become root' : 'Devenir root')
      .setStyle(ButtonStyle.Success)
      .setEmoji('👑'),
    new ButtonBuilder()
      .setCustomId('ssh_close')
      .setLabel(isEN ? 'Close session' : 'Fermer session')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  ];

  const rows = [new ActionRowBuilder().addComponents(mainButtons)];

  // Boutons de raccourcis pour commandes communes
  const shortcutButtons = [
    new ButtonBuilder()
      .setCustomId('ssh_quick_status')
      .setLabel(isEN ? '📊 System status' : '📊 Statut système')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ssh_quick_processes')
      .setLabel(isEN ? '⚙️ Processes' : '⚙️ Processus')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ssh_quick_disk')
      .setLabel(isEN ? '💾 Disk usage' : '💾 Espace disque')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ssh_quick_network')
      .setLabel(isEN ? '🌐 Network' : '🌐 Réseau')
      .setStyle(ButtonStyle.Secondary)
  ];

  rows.push(new ActionRowBuilder().addComponents(shortcutButtons));

  // Boutons de réexécution des commandes récentes
  if (session.history.length > 0) {
    const rerunButtons = [];
    const recentCommands = session.history.slice(-2); // 2 dernières commandes
    
    recentCommands.forEach((h, index) => {
      const actualIndex = session.history.length - recentCommands.length + index;
      const cmdPreview = h.cmd.length > 15 ? h.cmd.substring(0, 15) + '...' : h.cmd;
      
      rerunButtons.push(
        new ButtonBuilder()
          .setCustomId(`ssh_rerun_${actualIndex}`)
          .setLabel(`↻ ${cmdPreview}`)
          .setStyle(ButtonStyle.Success)
      );
    });

    if (rerunButtons.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(rerunButtons));
    }
  }

  return { embeds: [embed], components: rows };
}
