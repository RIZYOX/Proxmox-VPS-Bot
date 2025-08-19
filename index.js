require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");
const store = require("./utils/authStore");
const pkg = require("./package.json");
const proxmox = require("./utils/proxmox");
const { getUserLang } = require("./utils/i18n");

let log;
try {
  const helpers = require("./utils/helpers");
  log = helpers.log;
} catch (err) {
  log = (message, level = "INFO", component = "MAIN") => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] [${component}] ${message}`);
  };
  console.log("Warning: Using fallback log function - helpers.js not found");
}

function validateEnv() {
  const required = ["DISCORD_TOKEN", "PVE_HOST", "PVE_TOKENID", "PVE_SECRET"];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  if (missing.length) {
    const msg = `Variables d'environnement manquantes: ${missing.join(", ")}`;
    log(msg, "ERROR", "MAIN");
    console.error("\nExemple .env:\nDISCORD_TOKEN=...\nPVE_HOST=https://proxmox:8006\nPVE_TOKENID=user@pam!token\nPVE_SECRET=tokenvalue\nALLOWED_USERS=123,456\nADMIN_USERS=123\n");
    process.exit(1);
  }
}

validateEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialisation du store d'authentification
store.initFromEnv();

// Collection pour les commandes (évite les doublons)
client.commands = new Collection();

function isAllowed(userId) {
  return store.isAllowed(userId);
}

// Chargement dynamique des commandes (UNIQUEMENT au démarrage)
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if (command.data && command.execute) {
    if (client.commands.has(command.data.name)) {
      log(`⚠️ Commande dupliquée détectée: ${command.data.name} (fichier: ${file})`, "WARN", "MAIN");
    } else {
      client.commands.set(command.data.name, command);
      log(`Commande chargée: ${command.data.name}`, "INFO", "MAIN");
    }
  } else {
    log(`⚠️ La commande ${file} n'a pas data ou execute`, "WARN", "MAIN");
  }
}

client.once("ready", async () => {
  log(`Bot connecté: ${client.user.tag}`, "INFO", "MAIN");

  // Pretty banner
  try {
    const nodev = process.version;
    const djsv = require("discord.js").version;
    const name = pkg.name || "EZ VPS Bot";
    const ver = pkg.version || "0.0.0";
    const C = { reset:'\x1b[0m', cyan:'\x1b[36m', green:'\x1b[32m', bold:'\x1b[1m' };
    const lines = [
      `${C.cyan}┌───────────────────────────────────────────────────────────┐${C.reset}`,
      `${C.cyan}│${C.reset}  ${C.bold}${name} v${ver}${C.reset}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}│${C.reset}  Node ${nodev} · discord.js ${djsv}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}├───────────────────────────────────────────────────────────┤${C.reset}`,
      `${C.cyan}│${C.reset}  ${C.green}Status: starting...${C.reset}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}└───────────────────────────────────────────────────────────┘${C.reset}`,
    ];
    for (const l of lines) console.log(l);
  } catch (_) {}

  // Vérification de l'API Proxmox
  try {
    const nodes = await proxmox.nodes();
    if (!nodes || !Array.isArray(nodes)) {
      throw new Error("API Proxmox inaccessible");
    }
    log(`API Proxmox OK - ${nodes.length} node(s) trouvé(s)`, "INFO", "MAIN");
  } catch (err) {
    log(`Erreur API Proxmox: ${err.message}`, "ERROR", "MAIN");
    process.exit(1);
  }

  // Déploiement des commandes slash (nettoyage + enregistrement)
  try {
    // Option fast-boot: ignorer le déploiement si SKIP_DEPLOY=1
    if (process.env.SKIP_DEPLOY === '1') {
      log(`SKIP_DEPLOY=1: saut du nettoyage et de l'enregistrement des commandes slash`, 'INFO', 'MAIN');
    } else {
      // Préparer les données des commandes
      const commandsDataAll = Array.from(client.commands.values()).map(cmd => cmd.data.toJSON());

      // Calcul et persistance d'un hash du schéma (diagnostic uniquement)
      const crypto = require('crypto');
      const schemaStr = JSON.stringify(commandsDataAll);
      const currentHash = crypto.createHash('sha256').update(schemaStr).digest('hex');
      const hashFile = path.join(__dirname, 'data', 'commands_hash.json');
      try {
        fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
        fs.writeFileSync(hashFile, JSON.stringify({ hash: currentHash }, null, 2), 'utf8');
      } catch (e) {
        log(`Impossible d'écrire le hash des commandes: ${e.message}`, 'WARN', 'MAIN');
      }

      // Récupérer les guilds à cibler (si GUILD_ID défini, on limite le scope)
      let guilds;
      if (process.env.GUILD_ID) {
        const gid = process.env.GUILD_ID;
        try {
          const g = await client.guilds.fetch(gid);
          guilds = new Map([[gid, g]]);
        } catch (e) {
          log(`Impossible de récupérer la guild ${gid}: ${e.message}`, 'ERROR', 'MAIN');
          guilds = await client.guilds.fetch();
        }
      } else {
        guilds = await client.guilds.fetch();
      }
      const fetchedGuilds = await Promise.allSettled(
        Array.from(guilds).map(([id, guild]) => guild.fetch().then(g => ({ id, g })))
      );
      try { log(`Guilds à déployer: ${Array.from(guilds).length}`, 'INFO', 'MAIN'); } catch (_) {}

      // Préparer REST API Discord
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      const appId = client.user.id;

      // 1) Nettoyer les commandes sur chaque guild ciblée
      const toWork = fetchedGuilds.filter(r => r.status === 'fulfilled').map(r => r.value);
      for (const { id, g } of toWork) {
        try {
          log(`Nettoyage des commandes guild pour ${g.name}`, 'INFO', 'MAIN');
          await rest.put(Routes.applicationGuildCommands(appId, id), { body: [] });
        } catch (e) {
          log(`Échec du nettoyage des commandes sur la guild ${g.name}: ${e.message}`, 'WARN', 'MAIN');
        }
      }

      // 2) Nettoyer les commandes globales
      try {
        await rest.put(Routes.applicationCommands(appId), { body: [] });
        log(`Commandes globales nettoyées`, 'INFO', 'MAIN');
      } catch (e) {
        log(`Échec du nettoyage des commandes globales: ${e.message}`, 'WARN', 'MAIN');
      }

      // 3) Enregistrer les commandes sur chaque guild ciblée
      for (const { id, g } of toWork) {
        try {
          await rest.put(Routes.applicationGuildCommands(appId, id), { body: commandsDataAll });
          log(`Commandes slash enregistrées sur la guild ${g.name}`, 'INFO', 'MAIN');
        } catch (e) {
          log(`Échec d'enregistrement sur la guild ${g.name}: ${e.message}`, 'WARN', 'MAIN');
        }
      }
    }
  } catch (err) {
    log(`Erreur déploiement slash: ${err.message}`, 'ERROR', 'MAIN');
  }

  // Startup summary
  try {
    const guilds = await client.guilds.fetch();
    const names = [];
    for (const [, gref] of guilds) {
      try { const g = await gref.fetch(); names.push(`${g.name}`); } catch {}
    }
    const data = store.read();
    const envOk = ["DISCORD_TOKEN","PVE_HOST","PVE_TOKENID","PVE_SECRET"].every(k => process.env[k] && String(process.env[k]).trim() !== "");
    const C = { reset:'\x1b[0m', cyan:'\x1b[36m', green:'\x1b[32m', bold:'\x1b[1m' };
    const banner2 = [
      `${C.cyan}┌───────────────────────────────────────────────────────────┐${C.reset}`,
      `${C.cyan}│${C.reset}  ${C.bold}Startup OK${C.reset}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}│${C.reset}  Guilds (${names.length}): ${names.join(', ').slice(0, 42)}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}│${C.reset}  Admins: ${data.admins.length} · Allowed: ${data.allowed.length}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}│${C.reset}  ENV required: ${envOk ? C.green + 'OK' + C.reset : 'MISSING'}`.padEnd(65, " ") + `${C.cyan}│${C.reset}`,
      `${C.cyan}└───────────────────────────────────────────────────────────┘${C.reset}`,
    ];
    for (const l of banner2) console.log(l);
  } catch (e) {
    log(`Résumé de démarrage indisponible: ${e.message}`, "WARN", "MAIN");
  }

  // Mise à jour périodique du statut du bot: CPU%, RAM%, STORAGE% (toutes les 5 minutes)
  async function updateBotPresence() {
    try {
      const nodes = await proxmox.nodes();
      if (!Array.isArray(nodes) || nodes.length === 0) return;
      const nodeName = nodes[0].node || nodes[0].name || nodes[0].id || nodes[0];

      // CPU/RAM depuis /nodes/{node}/status
      const nodeInfo = await proxmox.getNodeCPUInfo(nodeName);
      let cpuPct = null;
      let ramPct = null;
      if (nodeInfo) {
        try {
          // Proxmox renvoie cpu (0..1), memory.total, memory.used
          const cpu = typeof nodeInfo.cpu === 'number' ? nodeInfo.cpu : (nodeInfo?.status?.cpu ?? null);
          const memTotal = nodeInfo?.memory?.total ?? nodeInfo?.status?.memory?.total ?? null;
          const memUsed = nodeInfo?.memory?.used ?? nodeInfo?.status?.memory?.used ?? null;
          cpuPct = (cpu != null) ? Math.min(100, Math.max(0, Math.round(cpu * 100))) : null;
          ramPct = (memTotal && memUsed != null && memTotal > 0) ? Math.min(100, Math.max(0, Math.round((memUsed / memTotal) * 100))) : null;
        } catch (_) {}
      }

      // Storage: sommer les storages du node
      let storagePct = null;
      try {
        const storages = await proxmox.getNodeStorage(nodeName);
        if (Array.isArray(storages) && storages.length > 0) {
          let total = 0n, used = 0n;
          for (const s of storages) {
            const t = BigInt(s.total ?? 0);
            const u = BigInt(s.used ?? 0);
            if (t > 0n) { total += t; used += u; }
          }
          if (total > 0n) {
            const pct = Number((used * 100n) / total);
            storagePct = Math.min(100, Math.max(0, pct));
          }
        }
      } catch (_) {}

      const parts = [];
      if (cpuPct != null) parts.push(`CPU ${cpuPct}%`);
      if (ramPct != null) parts.push(`RAM ${ramPct}%`);
      if (storagePct != null) parts.push(`Disk ${storagePct}%`);
      const name = parts.join(" • ") || "VPS Monitor";

      await client.user.setPresence({
        activities: [{ name, type: 3 /* Watching */ }],
        status: "online",
      });
      log(`Presence mise à jour: ${name}`, "INFO", "MAIN");
    } catch (err) {
      log(`Échec mise à jour présence: ${err.message}`, "WARN", "MAIN");
    }
  }

  // Lancer immédiatement puis toutes les 5 minutes
  updateBotPresence();
  setInterval(updateBotPresence, 5 * 60 * 1000);
});

// Commande texte: permettre le copier-coller de "/vps ssh ip:... user:... password:... [port:..] [cmd:..]"
client.on("messageCreate", async (message) => {
  try {
    // Ignorer les bots et les messages sans le motif attendu
    if (message.author.bot) return;
    const raw = (message.content || "").trim();
    // Discord peut intercepter les messages commençant par '/'. Accepter aussi sans slash ou avec '!'
    // Exemples acceptés: 
    //   "/vps ssh ip:... user:..."
    //   "vps ssh ip:... user:..."
    //   "!vps ssh ip:... user:..."
    // Sanitize basique avant le match
    const preSanitized = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, ' ')
      .trim();
    const cmdMatch = preSanitized.match(/^\s*[\/]?\!?vps\s+ssh\s+(.*)$/i);
    if (!cmdMatch) {
      return;
    }
    log(`messageCreate détecté pour vps ssh par ${message.author.tag}: ${raw}`, "INFO", "MAIN");

    // Vérification permissions
    if (!isAllowed(message.author.id)) {
      const lang = getUserLang(message.author.id, message.guildId);
      const isEN = lang === 'en';
      await message.reply({ content: isEN ? "❌ You are not allowed to use this bot." : "❌ Vous n'êtes pas autorisé à utiliser ce bot." });
      return;
    }

    // Sanitize: retirer caractères invisibles et normaliser les guillemets
    const sanitized = preSanitized
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ') // normaliser espaces
      .trim();

    // Parser key:value (clé parmi ip,user,password,port,cmd), valeurs entre guillemets ou non
    const argsPart = cmdMatch[1] || '';
    const kvRegex = /(ip|user|password|port|cmd):\s*("([^"]*)"|'([^']*)'|([^\s]+))/gi;
    const params = {};
    let m;
    while ((m = kvRegex.exec(argsPart)) !== null) {
      const key = m[1].toLowerCase();
      const val = m[3] ?? m[4] ?? m[5] ?? "";
      params[key] = val;
    }
    log(`messageCreate params: ip=${params.ip ? '✓' : '✗'}, user=${params.user ? '✓' : '✗'}, password=${params.password ? '✓' : '✗'}, port=${params.port ?? 'n/a'}, cmd=${params.cmd ? '✓' : 'n/a'}`, "INFO", "MAIN");

    // Champs requis
    if (!params.ip || !params.user || !params.password) {
      const lang = getUserLang(message.author.id, message.guildId);
      const isEN = lang === 'en';
      await message.reply({
        content: isEN ? "❌ Invalid format. Example: /vps ssh ip:192.168.1.145 user:root password:mypass port:22" : "❌ Format invalide. Exemple: /vps ssh ip:192.168.1.145 user:root password:monpass port:22",
      });
      return;
    }

    // Préparer un faux Interaction pour réutiliser la logique existante de la commande vps
    const vpsCommand = message.client.commands?.get("vps");
    if (!vpsCommand || !vpsCommand.execute) {
      const lang = getUserLang(message.author.id, message.guildId);
      const isEN = lang === 'en';
      await message.reply({ content: isEN ? "❌ /vps command unavailable." : "❌ Commande /vps indisponible." });
      return;
    }

    // Options simulées pour subcommand ssh
    const options = {
      getSubcommand: () => "ssh",
      getString: (name) => {
        switch (name) {
          case "ip": return params.ip;
          case "user": return params.user;
          case "password": return params.password;
          case "cmd": return params.cmd || null;
          default: return null;
        }
      },
      getInteger: (name) => {
        if (name === "port" && params.port) {
          const n = parseInt(params.port, 10);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      },
    };

    // Interaction simulée: on évite les réponses éphémères, on répond dans le salon
    let repliedOnce = false;
    const fakeInteraction = {
      commandName: "vps",
      user: { id: message.author.id },
      options,
      replied: false,
      deferred: false,
      // No-op pour deferReply mais on garde compat
      deferReply: async () => { fakeInteraction.deferred = true; },
      editReply: async (data) => { repliedOnce = true; return message.reply(data); },
      reply: async (data) => { repliedOnce = true; return message.reply(data); },
      followUp: async (data) => { return message.reply(data); },
    };

    log(`messageCreate exécution de vps ssh pour ${message.author.tag}`, "INFO", "MAIN");
    await vpsCommand.execute(fakeInteraction);

    // Optionnel: supprimer le message source pour éviter d'exposer le mot de passe dans l'historique
    try { await message.delete(); } catch (e) { log(`Suppression message source échouée: ${e.message}`, "WARN", "MAIN"); }
  } catch (err) {
    try {
      const lang = getUserLang(message.author.id, message.guildId);
      const isEN = lang === 'en';
      await message.reply({ content: isEN ? `❌ Error: ${err.message}` : `❌ Erreur: ${err.message}` });
    } catch (_) {}
    log(`Erreur messageCreate copier-coller: ${err.stack}`, "ERROR", "MAIN");
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Autocomplete (propose dynamic choices)
    if (interaction.isAutocomplete()) {
      const DBG = process.env.AUTOCOMPLETE_DEBUG === '1';
      try {
        if (DBG) {
          let focusInfo = '';
          try {
            const f = interaction.options.getFocused(true);
            focusInfo = ` focus=${f?.name}:${f?.value}`;
          } catch (_) {}
          log(`AC route: /${interaction.commandName}${focusInfo}`, 'INFO', 'MAIN');
        }
      } catch (_) {}

      const cmd = client.commands.get(interaction.commandName);
      if (cmd && typeof cmd.autocomplete === 'function') {
        try { await cmd.autocomplete(interaction); } catch (e) { 
          try {
            if (DBG) { try { log(`AC route error: ${e.message}`, 'WARN', 'MAIN'); } catch (_) {} }
            await interaction.respond([]); 
          } catch (_) {}
        }
      }
      return;
    }

    // Commandes slash
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Commande "help" accessible à tous
      if (interaction.commandName === "help") {
        return cmd.execute(interaction);
      }

      // Autoriser le passage jusqu'à la commande /authorize (elle-même valide admin en interne)
      if (interaction.commandName === "authorize") {
        return cmd.execute(interaction);
      }

      // Vérification des permissions (toutes les autres commandes)
      if (!isAllowed(interaction.user.id)) {
        const lang = getUserLang(interaction.user.id, interaction.guildId);
        const isEN = lang === 'en';
        return interaction.reply({
          content: isEN ? "❌ Access denied. Ask an administrator to add you using /authorize." : "❌ Accès refusé. Demandez à un administrateur de vous ajouter avec /authorize.",
          flags: 64,
        });
      }

      await cmd.execute(interaction);
    }
    // Composants (menus, boutons, modales)
    else if (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
      // Rechercher la commande qui gère cette interaction
      let cmd = null;
      for (const [commandName, command] of client.commands) {
        if (command.route) {
          // Vérifier si cette commande gère ce type d'interaction
          const customIdParts = interaction.customId.split("_");
          if (customIdParts.length > 0) {
            // Essayer de trouver la commande par le premier élément de l'ID
            const firstPart = customIdParts[0];
            if (firstPart === "node" || firstPart === "template" || firstPart === "ram" || 
                firstPart === "cores" || firstPart === "storage" || firstPart === "disk" || firstPart === "diskcustom" || firstPart === "customdisk" || firstPart === "name" || 
                firstPart === "confirm" || firstPart === "cancel") {
              // Ces interactions appartiennent à createvps
              cmd = client.commands.get("createvps");
              break;
            }
            if (firstPart.startsWith("vps") || firstPart === "ssh") {
              cmd = client.commands.get("vps");
              break;
            }
            if (firstPart === "help") {
              cmd = client.commands.get("help");
              break;
            }
            if (firstPart === "stats") {
              cmd = client.commands.get("stats-all");
              break;
            }
          }
        }
      }

      if (cmd && cmd.route) {
        await cmd.route(interaction);
      }
    }
  } catch (err) {
    log(`Erreur interaction: ${err.stack}`, "ERROR", "MAIN");
    try {
      const lang = (interaction && interaction.user) ? getUserLang(interaction.user.id, interaction.guildId) : 'fr';
      const isEN = lang === 'en';
      const errorMessage = isEN ? "❌ An error occurred while processing your request." : "❌ Une erreur est survenue lors du traitement de votre demande.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: 64 });
      } else {
        await interaction.reply({ content: errorMessage, flags: 64 });
      }
    } catch (followUpErr) {
      log(`Impossible de répondre à l'interaction: ${followUpErr.message}`, "ERROR", "MAIN");
    }
  }
});

// Gestion des erreurs non catchées
process.on("unhandledRejection", (err) => {
  log(`Erreur non gérée: ${err.stack}`, "ERROR", "MAIN");
});

process.on("uncaughtException", (err) => {
  log(`Exception non catchée: ${err.stack}`, "ERROR", "MAIN");
  process.exit(1);
});

// Démarrage du bot
client.login(process.env.DISCORD_TOKEN);
