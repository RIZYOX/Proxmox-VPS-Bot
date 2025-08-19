const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function helpEmbedFR() {
  return new EmbedBuilder()
    .setTitle("🤖 EZ VPS Bot — Aide (FR)")
    .setDescription("Crée et gère des VPS Proxmox + SSH depuis Discord")
    .addFields(
      { name: "📦 Commandes", value: "• `/createvps` — Assistant de création\n• `/vps list` — Liste vos VPS\n• `/vps status vmid:<id>` — Statut\n• `/vps action vmid:<id> type:<start|stop|restart>` — Action\n• `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]` — SSH\n• `/verify` — Vérifier l'environnement (ENV, Proxmox, templates)\n• `/stats-all` — Statistiques globales\n• `/authorize userid:<id>` — Autoriser un utilisateur (admin)", inline: false },
      { name: "⌨️ Raccourci texte", value: "Dans un salon: `vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'`\nLe message source est supprimé pour ne pas exposer le mot de passe.", inline: false },
      { name: "🧰 SSH interactif", value: "Sans `cmd`, un embed s'ouvre avec des boutons:\n• Nouvelle commande (modal multi-lignes)\n• Devenir root (équivaut à `sudo -i`)\n• Raccourcis (statut/processus/disque/réseau)\n• Fermer session", inline: false },
      { name: "🔐 sudo & root", value: "• Cliquez ‘Devenir root’ pour exécuter toutes les commandes en root.\n• Sinon, vous pouvez préfixer par `sudo ...`, le bot fournit le mot de passe via `sudo -S` automatiquement.", inline: false },
      { name: "⏱️ Timeout et longues commandes", value: "• Timeout auto: 60s (classiques), 15min (install/update/etc.).\n• Forcer: ajoutez `#timeout=900` à la fin (en secondes).\n• Conseil: utilisez `| head -200` pour limiter la sortie.", inline: false },
      { name: "🖥️ Linux supportés", value: "Ubuntu 24.04/22.04, Debian 12/11 (templates cloud-init)", inline: false },
      { name: "🌐 Réseau / Hébergement", value: "• Le bot n'a PAS besoin d'être sur la même machine que Proxmox.\n• Il doit simplement atteindre l'API Proxmox (`PVE_HOST`) en HTTPS (port 8006 par défaut ou celui que vous avez mappé).\n• 2 scénarios: LAN: utilisez l'IP privée du Proxmox (ex: https://192.168.x.x:8006).\n  Internet: exposez 8006 proprement (NAT/Firewall/Reverse Proxy) ou utilisez un VPN.\n• Si le BOT tourne sur un VPS avec IP publique: pas d'entrée requise non plus; autorisez les SORTIES vers `PVE_HOST` (TCP 443/8006).\n• Aucun port entrant vers le bot n'est requis: il fait des requêtes sortantes vers Proxmox.\n• Recommandé: certificat/HTTPS correct, IP/port fixes, allowlist/ACL côté Proxmox ou VPN.", inline: false },
      { name: "❗ Notes", value: "Commandes interactives (vim/top sans batch) non adaptées via exec. Pour TTY complet, une autre solution serait nécessaire.", inline: false },
    )
    .setColor(0x00AEEF)
    .setFooter({ text: "EZ VPS Bot" });
}

function helpEmbedEN() {
  return new EmbedBuilder()
    .setTitle("🤖 EZ VPS Bot — Help (EN)")
    .setDescription("Create/manage Proxmox VPS + SSH from Discord")
    .addFields(
      { name: "📦 Commands", value: "• `/createvps` — Creation wizard\n• `/vps list` — List your VPS\n• `/vps status vmid:<id>` — Status\n• `/vps action vmid:<id> type:<start|stop|restart>` — Action\n• `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]` — SSH\n• `/verify` — Verify environment (ENV, Proxmox, templates)\n• `/stats-all` — Global statistics\n• `/authorize userid:<id>` — Allow a user (admin)", inline: false },
      { name: "⌨️ Text shortcut", value: "In a channel: `vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'`\nThe source message is deleted to avoid exposing the password.", inline: false },
      { name: "🧰 Interactive SSH", value: "Without `cmd`, an embed opens with buttons:\n• New command (multi-line modal)\n• Become root (`sudo -i`)\n• Shortcuts (status/processes/disk/network)\n• Close session", inline: false },
      { name: "🔐 sudo & root", value: "• Click ‘Become root’ to execute all next commands as root.\n• Otherwise you can prefix with `sudo ...`, the bot provides the password with `sudo -S` automatically.", inline: false },
      { name: "⏱️ Timeout & long-running", value: "• Auto timeout: 60s (regular), 15min (install/update/etc.).\n• Force with `#timeout=900` at the end (seconds).\n• Tip: use `| head -200` to limit output.", inline: false },
      { name: "🖥️ Supported Linux", value: "Ubuntu 24.04/22.04, Debian 12/11 (cloud-init templates)", inline: false },
      { name: "🌐 Network / Hosting", value: "• The bot does NOT need to run on the same machine as Proxmox.\n• It only needs to reach the Proxmox API (`PVE_HOST`) over HTTPS (default 8006 or your mapping).\n• 2 scenarios: LAN: use Proxmox private IP (e.g., https://192.168.x.x:8006).\n  Internet: properly expose 8006 (NAT/Firewall/Reverse Proxy) or use a VPN.\n• If the BOT runs on a VPS with a public IP: no inbound needed either; allow OUTBOUND to `PVE_HOST` (TCP 443/8006).\n• No inbound port to the bot required: it only performs outbound requests to Proxmox.\n• Recommended: proper HTTPS/cert, fixed IP/port, allowlist/ACL on Proxmox side or VPN.", inline: false },
      { name: "❗ Notes", value: "Interactive commands (e.g., vim/top without batch) are not ideal via exec. A full TTY solution would be required.", inline: false },
    )
    .setColor(0x00AEEF)
    .setFooter({ text: "EZ VPS Bot" });
}

function makeLangRow(selected = 'fr') {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_lang')
      .setPlaceholder('Language / Langue')
      .addOptions([
        { label: 'Français', value: 'fr', description: 'Aide en français', default: selected === 'fr' },
        { label: 'English', value: 'en', description: 'Help in English', default: selected === 'en' },
      ])
  );
}

function makeTopicRow(lang = 'fr', selected = 'overview') {
  const topics = [
    { v: 'overview', fr: 'Vue d’ensemble', en: 'Overview' },
    { v: 'reference', fr: 'Référence', en: 'Reference' },
    { v: 'setup_api', fr: 'Configurer API Proxmox', en: 'Setup Proxmox API' },
    { v: 'createvps', fr: 'createvps', en: 'createvps' },
    { v: 'vps_list', fr: 'vps list', en: 'vps list' },
    { v: 'vps_status', fr: 'vps status', en: 'vps status' },
    { v: 'vps_action', fr: 'vps action', en: 'vps action' },
    { v: 'vps_ssh', fr: 'vps ssh', en: 'vps ssh' },
    { v: 'vps_clone', fr: 'vps clone', en: 'vps clone' },
    { v: 'vps_resize', fr: 'vps resize_disk', en: 'vps resize_disk' },
    { v: 'vps_adjust', fr: 'vps adjust_resources', en: 'vps adjust_resources' },
    { v: 'vps_migrate', fr: 'vps migrate', en: 'vps migrate' },
    { v: 'vps_snapshot', fr: 'vps snapshot', en: 'vps snapshot' },
    { v: 'vps_blacklist', fr: 'vps blacklist', en: 'vps blacklist' },
    { v: 'authorize', fr: 'authorize', en: 'authorize' },
    { v: 'verify', fr: 'verify', en: 'verify' },
    { v: 'stats_all', fr: 'stats-all', en: 'stats-all' },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_topic')
      .setPlaceholder(lang === 'en' ? 'Select a topic' : 'Sélectionnez un sujet')
      .addOptions(
        topics.map(t => ({
          label: lang === 'en' ? t.en : t.fr,
          value: t.v,
          default: selected === t.v,
        }))
      )
  );
}

function topicEmbed(lang, topic, page = 1) {
  const isEN = lang === 'en';
  const T = (fr, en) => (isEN ? en : fr);
  const e = new EmbedBuilder().setColor(0x00AEEF).setFooter({ text: "EZ VPS Bot" });
  switch (topic) {
    case 'overview': {
      const total = getTopicPages('overview');
      e.setTitle((isEN ? '🤖 EZ VPS Bot — Help (EN)' : '🤖 EZ VPS Bot — Aide (FR)') + ` — ${T('Page', 'Page')} ${page}/${total}`)
       .setDescription(T('Crée et gère des VPS Proxmox + SSH depuis Discord', 'Create/manage Proxmox VPS + SSH from Discord'));
      if (page === 1) {
        e.addFields(
          { name: T('📦 Commandes', '📦 Commands'), value: T(
            '• `/createvps` — Assistant de création\n• `/vps list` — Liste vos VPS\n• `/vps status vmid:<id>` — Statut\n• `/vps action vmid:<id> type:<start|stop|restart>` — Action\n• `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]` — SSH\n• `/vps blacklist add|remove|list` — Blacklist VMID (admin)\n• `/verify` — Vérifier ENV/Proxmox/templates\n• `/stats-all` — Statistiques globales\n• `/authorize userid:<id>` — Autoriser (admin)'
            , '• `/createvps` — Creation wizard\n• `/vps list` — List your VPS\n• `/vps status vmid:<id>` — Status\n• `/vps action vmid:<id> type:<start|stop|restart>` — Action\n• `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]` — SSH\n• `/vps blacklist add|remove|list` — Blacklist VMID (admin)\n• `/verify` — Verify ENV/Proxmox/templates\n• `/stats-all` — Global statistics\n• `/authorize userid:<id>` — Allow (admin)'
          ), inline: false },
          { name: T('⌨️ Raccourci texte', '⌨️ Text shortcut'), value: T(
            "Dans un salon: `vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'`\nLe message source est supprimé pour ne pas exposer le mot de passe.",
            "In a channel: `vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'`\nThe source message is deleted to avoid exposing the password."
          ), inline: false }
        );
      } else if (page === 2) {
        e.addFields(
          { name: T('🧰 SSH interactif', '🧰 Interactive SSH'), value: T(
            "Sans `cmd`, un embed s'ouvre avec des boutons:\n• Nouvelle commande (modal multi-lignes)\n• Devenir root (équivaut à `sudo -i`)\n• Raccourcis (statut/processus/disque/réseau)\n• Fermer session",
            'Without `cmd`, an embed opens with buttons:\n• New command (multi-line modal)\n• Become root (`sudo -i`)\n• Shortcuts (status/processes/disk/network)\n• Close session'
          ), inline: false },
          { name: '🔐 sudo & root', value: T(
            '• Cliquez « Devenir root » pour exécuter les commandes en root.\n• Sinon, préfixez par `sudo ...` (mot de passe fourni via `sudo -S`).',
            '• Click “Become root” to run commands as root.\n• Or prefix with `sudo ...` (password provided via `sudo -S`).'
          ), inline: false },
          { name: T('⏱️ Timeout & longues commandes', '⏱️ Timeout & long-running'), value: T(
            '• Timeout auto: 60s (normal), 15min (install/update/etc.)\n• Forcer: `#timeout=900` (secondes)\n• Astuce: utilisez `| head -200` pour limiter la sortie.',
            '• Auto timeout: 60s (regular), 15min (install/update/etc.)\n• Force: `#timeout=900` (seconds)\n• Tip: use `| head -200` to limit output.'
          ), inline: false }
        );
      } else if (page === 3) {
        e.setDescription(T('Configurer un token API Proxmox (GUI)', 'Set up a Proxmox API token (GUI)'))
         .addFields({
           name: T('Étapes', 'Steps'),
           value: T(
             '1) Datacenter → Permissions → API Tokens → Add\n2) Sélectionnez utilisateur (`root@pam` ou service)\n3) Nommer (Token ID) et créer\n4) Copier `Token ID` + `Secret` (UNE FOIS)\n5) Assigner rôles requis (Administrator ou minimal)',
             '1) Datacenter → Permissions → API Tokens → Add\n2) Select user (`root@pam` or service)\n3) Name (Token ID) and create\n4) Copy `Token ID` + `Secret` (ONCE)\n5) Assign required roles (Administrator or minimal)'
           )
         });
      } else if (page === 4) {
        e.setDescription(T('Configurer `.env` et valider', 'Configure `.env` and validate'))
         .addFields(
           { name: '.env', value: '```env\nPVE_HOST=https://your-proxmox:8006\nPVE_TOKENID=user@pam!mybot\nPVE_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n# Optionnel\nPVE_NODE=node1\nDISK_STORAGE=local-lvm\n```' },
           { name: T('Conseils', 'Tips'), value: T('• Gardez le secret en sécurité\n• Utilisez le moindre privilège\n• Testez avec `/verify`', '• Keep the secret safe\n• Use least privilege\n• Test with `/verify`') }
         );
      } else if (page === 5) {
        const servers = T('servers — Lister les VPS du node\n```\n/vps list\n```', 'servers — List VPS on the node\n```\n/vps list\n```');
        const vm = T(
          'vm — Gestion d’une VM\n```\n/vps status vmid:<id>\n/vps action vmid:<id> type:start|stop|restart\n/createvps\n```',
          'vm — Manage a VM\n```\n/vps status vmid:<id>\n/vps action vmid:<id> type:start|stop|restart\n/createvps\n```'
        );
        const ssh = T(
          'ssh — Session interactive\n```\n/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]\n```',
          'ssh — Interactive session\n```\n/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]\n```'
        );
        const tools = T('outils — Divers\n```\n/verify\n/stats-all\n/help\n```', 'tools — Misc\n```\n/verify\n/stats-all\n/help\n```');
        const admin = T('admin — Accès\n```\n/authorize userid:<discord_id>\n/vps blacklist add|remove|list\n/lang\n```', 'admin — Access\n```\n/authorize userid:<discord_id>\n/vps blacklist add|remove|list\n/lang\n```');
        e.addFields(
          { name: T('servers', 'servers'), value: servers, inline: false },
          { name: 'vm', value: vm, inline: false },
          { name: 'ssh', value: ssh, inline: false },
          { name: T('outils', 'tools'), value: tools, inline: false },
          { name: 'admin', value: admin, inline: false },
        );
      } else {
        e.setDescription(T('Avancé: clone, resize, adjust, migrate, snapshot', 'Advanced: clone, resize, adjust, migrate, snapshot'))
         .addFields(
          { name: 'clone', value: T('`/vps clone ...` — Cloner une VM/template', '`/vps clone ...` — Clone a VM/template') },
          { name: 'resize_disk', value: T('`/vps resize_disk vmid:<id> size:<+4G|20G>` — Agrandir le disque (unités K/M/G/T). `+N<U>` = croissance, `N<U>` = cible absolue. Réduction non supportée.', '`/vps resize_disk vmid:<id> size:<+4G|20G>` — Grow disk (units K/M/G/T). `+N<U>` = growth, `N<U>` = absolute target. Shrink blocked.') },
          { name: 'adjust_resources', value: T('`/vps adjust_resources ...` — CPU/RAM/Disk selon règles', '`/vps adjust_resources ...` — CPU/RAM/Disk per rules') },
          { name: 'migrate', value: T('`/vps migrate vmid:<id> target:<node>` — Migrer une VM', '`/vps migrate vmid:<id> target:<node>` — Migrate a VM') },
          { name: 'snapshot', value: T('`/vps snapshot create|list|delete|rollback ...` — Gérer snapshots', '`/vps snapshot create|list|delete|rollback ...` — Manage snapshots') },
          { name: T('Règles resize', 'Resize rules'), value: T(
            '• Unités obligatoires K/M/G/T\n• `+N<U>` = agrandit de N unités\n• `N<U>` sans `+` = cible absolue; si plus grand que l’actuel, converti en delta; si ≤ actuel → erreur rouge.\n• `+4` ou `4` → erreur rouge: unité manquante.\n• Valeurs négatives → interdit.',
            '• Units required K/M/G/T\n• `+N<U>` = grow by N\n• `N<U>` without `+` = absolute target; if greater than current, auto-converted to delta; if ≤ current → red error.\n• `+4` or `4` → red error: missing unit.\n• Negative values → rejected.'
          ) }
         );
      }
      break;
    }
    case 'setup_api': {
      const total = getTopicPages('setup_api');
      e.setTitle('🔐 ' + T('Configurer l’API Proxmox', 'Setup Proxmox API') + ` — ${T('Page', 'Page')} ${page}/${total}`)
      if (page === 1) {
        e.setDescription(T(
          'Pourquoi un token API ?\n• Le bot appelle l’API Proxmox pour lister, créer, gérer vos VMs.\n• Un token évite d’utiliser le mot de passe et permet un moindre privilège.\n\nPrérequis:\n• Accès au GUI Proxmox (Datacenter)\n• Un utilisateur (ex: `root@pam`) ou compte de service',
          'Why an API token?\n• The bot calls the Proxmox API to list/create/manage VMs.\n• A token avoids using a password and enables least-privilege.\n\nPrereqs:\n• Access to Proxmox GUI (Datacenter)\n• A user (e.g., `root@pam`) or a service account'
        ));
      } else if (page === 2) {
        e.setDescription(T('Création du token (GUI)', 'Create token (GUI)'))
         .addFields({
           name: T('Étapes', 'Steps'),
           value: T(
             '1) Datacenter → Permissions → API Tokens → Add\n2) Sélectionnez utilisateur (`root@pam` ou service)\n3) Nommer (Token ID) et créer\n4) Copier `Token ID` + `Secret` (UNE FOIS)\n5) Assigner rôles requis (Administrator ou minimal)',
             '1) Datacenter → Permissions → API Tokens → Add\n2) Select user (`root@pam` or service)\n3) Name (Token ID) and create\n4) Copy `Token ID` + `Secret` (ONCE)\n5) Assign required roles (Administrator or minimal)'
           )
         });
      } else {
        e.setDescription(T('Configurer `.env` et valider', 'Configure `.env` and validate'))
         .addFields(
           { name: '.env', value: '```env\nPVE_HOST=https://your-proxmox:8006\nPVE_TOKENID=user@pam!mybot\nPVE_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n# Optionnel\nPVE_NODE=node1\nDISK_STORAGE=local-lvm\n```' },
           { name: T('Conseils', 'Tips'), value: T('• Gardez le secret en sécurité\n• Utilisez le moindre privilège\n• Testez avec `/verify`', '• Keep the secret safe\n• Use least privilege\n• Test with `/verify`') }
         );
      }
      break;
    }
    case 'reference': {
      const total = getTopicPages('reference');
      e.setTitle(T('📚 Référence des commandes', '📚 Command reference') + ` — ${T('Page', 'Page')} ${page}/${total}`)
       .setDescription(T(
        'Aperçu des commandes disponibles, regroupées par thème.',
        'Overview of available commands, grouped by theme.'
       ));
      if (page === 1) {
        const servers = T('servers — Lister les VPS du node\n```\n/vps list\n```', 'servers — List VPS on the node\n```\n/vps list\n```');
        const vm = T(
          'vm — Gestion d’une VM\n```\n/vps status vmid:<id>\n/vps action vmid:<id> type:start|stop|restart\n/createvps\n```',
          'vm — Manage a VM\n```\n/vps status vmid:<id>\n/vps action vmid:<id> type:start|stop|restart\n/createvps\n```'
        );
        const ssh = T(
          'ssh — Session interactive\n```\n/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]\n```',
          'ssh — Interactive session\n```\n/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]\n```'
        );
        e.addFields(
          { name: T('servers', 'servers'), value: servers, inline: false },
          { name: 'vm', value: vm, inline: false },
          { name: 'ssh', value: ssh, inline: false },
        );
      } else {
        const advanced = T(
          'avancé — Clone/Resize/Adjust/Migrate/Snapshot\n```\n/vps clone ...\n/vps resize_disk ...\n/vps adjust_resources ...\n/vps migrate ...\n/vps snapshot create|list|delete|rollback ...\n```',
          'advanced — Clone/Resize/Adjust/Migrate/Snapshot\n```\n/vps clone ...\n/vps resize_disk ...\n/vps adjust_resources ...\n/vps migrate ...\n/vps snapshot create|list|delete|rollback ...\n```'
        );
        const tools = T(
          'outils — Divers\n```\n/verify\n/stats-all\n/help\n```',
          'tools — Misc\n```\n/verify\n/stats-all\n/help\n```'
        );
        const admin = T(
          'admin — Accès\n```\n/authorize userid:<discord_id>\n/vps blacklist add|remove|list\n/lang\n```',
          'admin — Access\n```\n/authorize userid:<discord_id>\n/vps blacklist add|remove|list\n/lang\n```'
        );
        e.addFields(
          { name: T('avancé', 'advanced'), value: advanced, inline: false },
          { name: T('outils', 'tools'), value: tools, inline: false },
          { name: 'admin', value: admin, inline: false },
        );
      }
      break;
    }
    case 'createvps':
      e.setTitle(T('📦 createvps — Assistant', '📦 createvps — Wizard'))
       .setDescription(T(
        'Crée un VPS via template cloud-init. Guide pas à pas, test SSH final.',
        'Create a VPS from cloud-init template. Step-by-step, ends with SSH test.'
       ))
       .addFields({ name: T('Usage', 'Usage'), value: '`/createvps`' });
      break;
    case 'vps_list':
      e.setTitle('🖥️ vps list')
       .setDescription(T('Liste tous vos VPS avec statut.', 'List all your VPS with status.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps list`' });
      break;
    case 'vps_status':
      e.setTitle('📊 vps status')
       .setDescription(T('Détails + IP + ressources + boutons actions.', 'Details + IP + resources + action buttons.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps status vmid:<id>`' });
      break;
    case 'vps_action':
      e.setTitle('⚙️ vps action')
       .setDescription(T('Démarrer/Arrêter/Redémarrer/Supprimer (avec confirmation).', 'Start/Stop/Restart/Delete (with confirmation).'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps action vmid:<id> type:<start|stop|restart|delete>`' });
      break;
    case 'vps_ssh':
      e.setTitle('💻 vps ssh')
       .setDescription(T('Session SSH interactive avec historique et boutons.', 'Interactive SSH session with history and buttons.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]`' });
      break;
    case 'vps_clone':
      e.setTitle('🧬 vps clone')
       .setDescription(T('Cloner une VM (full ou linked), nom/stockage/node cibles.', 'Clone a VM (full or linked), with name/storage/target node.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps clone vmid:<src> newid:<id> [name:<str>] [target_node:<node>] [mode:<full|linked>] [storage:<storage>]`' });
      break;
    case 'vps_resize':
      e.setTitle('📏 vps resize_disk')
       .setDescription(T('Agrandir un disque. La réduction est interdite par Proxmox.', 'Enlarge a disk. Shrinking is not supported by Proxmox.'))
       .addFields(
         { name: T('Usage', 'Usage'), value: '`/vps resize_disk vmid:<id> disk:<scsi0|virtio0|sata0|ide0> size:<+4G|20G|512M>`' },
         { name: T('Règles', 'Rules'), value: T(
           '• Unité obligatoire: K/M/G/T. Ex: `+4G`, `4G`, `+512M`\n• `+N<U>` = croissance (ex: `+4G`).\n• `N<U>` sans `+` = cible absolue; si plus grand que l’actuel, converti en delta; si ≤ actuel → erreur rouge.\n• `+4` ou `4` → erreur rouge: unité manquante.\n• Valeurs négatives → interdit.',
           '• Unit required: K/M/G/T. Ex: `+4G`, `4G`, `+512M`\n• `+N<U>` = growth (e.g., `+4G`).\n• `N<U>` without `+` = absolute target; if greater than current, auto-converted to delta; if ≤ current → red error.\n• `+4` or `4` → red error: missing unit.\n• Negative values → rejected.'
         ) }
       );
      break;
    case 'vps_adjust':
      e.setTitle('🧮 vps adjust_resources')
       .setDescription(T('Ajuster CPU et RAM d’une VM.', 'Adjust a VM’s CPU and RAM.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps adjust_resources vmid:<id> cpu_cores:<n> memory_mb:<mb>`' });
      break;
    case 'vps_migrate':
      e.setTitle('🚚 vps migrate')
       .setDescription(T('Migrer vers un autre node (live optionnel).', 'Migrate to another node (optional live).'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/vps migrate vmid:<id> target_node:<node> [online:<true|false>]`' });
      break;
    case 'vps_snapshot':
      e.setTitle('🧷 vps snapshot')
       .setDescription(T('Créer/Lister/Supprimer/Restaurer des snapshots.', 'Create/List/Delete/Rollback snapshots.'))
       .addFields({ name: T('Usage', 'Usage'), value: '```\n/vps snapshot create vmid:<id> name:<name> [description:<txt>]\n/vps snapshot list vmid:<id>\n/vps snapshot delete vmid:<id> name:<name>\n/vps snapshot rollback vmid:<id> name:<name>\n```' });
      break;
    case 'vps_blacklist':
      e.setTitle('🚫 vps blacklist')
       .setDescription(T(
        'Admin: empêcher la gestion/suppression de certains VMID. Les VMID blacklistés ne peuvent pas être démarrés/arrêtés/redémarrés/supprimés, y compris via les boutons et la confirmation de suppression.',
        'Admin: prevent management/deletion of certain VMIDs. Blacklisted VMIDs cannot be started/stopped/restarted/deleted, including via buttons and delete confirmation.'
       ))
       .addFields(
         { name: T('Usage', 'Usage'), value: '```\n/vps blacklist add vmid:<id>\n/vps blacklist remove vmid:<id>\n/vps blacklist list\n```' },
         { name: T('Notes', 'Notes'), value: T(
           '• Réservé aux administrateurs du bot.\n• Persistance dans un fichier JSON.\n• Messages bilingues FR/EN.\n• Vérifications appliquées aux commandes et interactions (boutons/modals).',
           '• Restricted to bot admins.\n• Persisted in a JSON file.\n• Bilingual FR/EN messages.\n• Checks enforced across commands and interactions (buttons/modals).'
         ), inline: false }
       );
      break;
    case 'authorize':
      e.setTitle('🔑 authorize')
       .setDescription(T('Admin: autorise un utilisateur au bot.', 'Admin: authorize a user to the bot.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/authorize userid:<discord_id>`' });
      break;
    case 'verify':
      e.setTitle('🧪 verify')
       .setDescription(T('Vérifie ENV, accès Proxmox, templates, etc.', 'Checks ENV, Proxmox access, templates, etc.'))
       .addFields(
         { name: T('Usage', 'Usage'), value: '`/verify`' },
         {
           name: T('Vérification de l\'environnement', 'Environment verification'),
           value: T(
             "ENV\n Variables d'environnement OK\nProxmox\n Proxmox OK — nodes: pve\nTemplates\n 1 template(s) détecté(s)\nNode pve · VMID 9000\n Conforme",
             "ENV\n Environment variables OK\nProxmox\n Proxmox OK — nodes: pve\nTemplates\n 1 template(s) detected\nNode pve · VMID 9000\n Compliant"
           ),
           inline: false
         },
         {
           name: 'Guide FR',
           value: "Préparer un template Debian/Ubuntu cloud-init:\n\n```bash\n# Sur la VM (ex: vmid 9000)\napt update\napt install -y qemu-guest-agent cloud-init\nsystemctl enable --now qemu-guest-agent\ncloud-init clean\nshutdown -h now\n\n# Côté Proxmox (sur l'hôte)\nqm set 9000 --agent enabled=1\n# (optionnel) Créer/attacher disque cloud-init si besoin\n# puis marquer en template:\nqm template 9000\n```",
           inline: false
         },
         {
           name: 'Guide EN',
           value: "Prepare a Debian/Ubuntu cloud-init template:\n\n```bash\n# Inside the VM (e.g., vmid 9000)\napt update\napt install -y qemu-guest-agent cloud-init\nsystemctl enable --now qemu-guest-agent\ncloud-init clean\nshutdown -h now\n\n# On Proxmox host\nqm set 9000 --agent enabled=1\n# (optional) Create/attach cloud-init disk if needed\nqm template 9000\n```",
           inline: false
         }
       );
      break;
    case 'stats_all':
      e.setTitle('📈 stats-all')
       .setDescription(T('Statistiques globales sur les nodes/VMs.', 'Global statistics on nodes/VMs.'))
       .addFields({ name: T('Usage', 'Usage'), value: '`/stats-all`' });
      break;
    default:
      return (lang === 'en') ? helpEmbedEN() : helpEmbedFR();
  }
  return e;
}

function getTopicPages(topic) {
  if (topic === 'overview') return 6;
  if (topic === 'setup_api') return 3;
  if (topic === 'reference') return 2;
  return 1;
}

function makePageRows(topic, page, total, lang) {
  if (total <= 1) return [];
  const rows = [];
  let current = new ActionRowBuilder();
  for (let i = 1; i <= total; i++) {
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder();
    }
    const b = new ButtonBuilder()
      .setCustomId(`help_goto:${topic}:${i}`)
      .setLabel(String(i))
      .setStyle(i === page ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(i === page);
    current.addComponents(b);
  }
  if (current.components.length > 0) rows.push(current);
  return rows;
}

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Affiche l'aide du bot / Show bot help"),

  execute: async (interaction) => {
    // Déterminer la langue préférée de l'utilisateur
    let lang = 'fr';
    try {
      const { getUserLang } = require('../utils/i18n');
      lang = getUserLang(interaction.user.id, interaction.guildId);
    } catch {}
    const topic = 'overview';
    const page = 1;
    const total = getTopicPages(topic);
    const embed = topicEmbed(lang, topic, page);
    const rows = [makeLangRow(lang), makeTopicRow(lang, topic)];
    const pageRows = makePageRows(topic, page, total, lang);
    if (pageRows.length) rows.push(...pageRows);
    await interaction.reply({ embeds: [embed], components: rows, flags: 64 });
  },

  // Router des interactions (select menu)
  route: async (interaction) => {
    if (!(interaction.isStringSelectMenu() || interaction.isButton())) return;

    // Récupérer la langue courante depuis le menu help_lang de l'ancien message
    let currentLang = 'fr';
    try {
      const rows = interaction.message.components || [];
      for (const row of rows) {
        const comp = row.components?.[0];
        if (comp?.customId === 'help_lang') {
          const def = comp.options?.find(o => o.default);
          if (def) currentLang = def.value;
        }
      }
    } catch {}

    if (interaction.isStringSelectMenu() && interaction.customId === 'help_lang') {
      const lang = interaction.values?.[0] || 'fr';
      const topic = 'overview';
      const page = 1;
      const total = getTopicPages(topic);
      const embed = topicEmbed(lang, topic, page);
      const rows = [makeLangRow(lang), makeTopicRow(lang, topic)];
      const pageRows = makePageRows(topic, page, total, lang);
      if (pageRows.length) rows.push(...pageRows);
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'help_topic') {
      const topic = interaction.values?.[0] || 'overview';
      const embed = topicEmbed(currentLang, topic, 1);
      const rows = [makeLangRow(currentLang), makeTopicRow(currentLang, topic)];
      const total = getTopicPages(topic);
      const pageRows = makePageRows(topic, 1, total, currentLang);
      if (pageRows.length) rows.push(...pageRows);
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('help_page:')) {
      const parts = interaction.customId.split(':');
      const topic = parts[1];
      let page = parseInt(parts[2], 10);
      if (!Number.isFinite(page) || page < 1) page = 1;
      const total = getTopicPages(topic);
      if (page > total) page = total;
      const embed = topicEmbed(currentLang, topic, page);
      const rows = [makeLangRow(currentLang), makeTopicRow(currentLang, topic)];
      const pageRows = makePageRows(topic, page, total, currentLang);
      if (pageRows.length) rows.push(...pageRows);
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('help_home:')) {
      const topic = interaction.customId.split(':')[1];
      const page = 1;
      const total = getTopicPages(topic);
      const embed = topicEmbed(currentLang, topic, page);
      const rows = [makeLangRow(currentLang), makeTopicRow(currentLang, topic)];
      const pageRows = makePageRows(topic, page, total, currentLang);
      if (pageRows.length) rows.push(...pageRows);
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('help_goto:')) {
      const parts = interaction.customId.split(':');
      const topic = parts[1];
      let page = parseInt(parts[2], 10);
      if (!Number.isFinite(page) || page < 1) page = 1;
      const total = getTopicPages(topic);
      if (page > total) page = total;
      const embed = topicEmbed(currentLang, topic, page);
      const rows = [makeLangRow(currentLang), makeTopicRow(currentLang, topic)];
      const pageRows = makePageRows(topic, page, total, currentLang);
      if (pageRows.length) rows.push(...pageRows);
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }
  },
}
