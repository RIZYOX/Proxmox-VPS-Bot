const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js")
const { log } = require("../utils/helpers")
const px = require("../utils/proxmox")
const { getUserLang } = require("../utils/i18n")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats-all")
    .setDescription("Statistiques détaillées de tous les nodes Proxmox / Detailed stats for all Proxmox nodes"),

  execute: async (interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true })

      const lang = getUserLang(interaction.user.id, interaction.guildId)
      const isEN = lang === 'en'
      const T = (fr, en) => (isEN ? en : fr)

      const nodes = await px.nodes()
      if (!nodes.length) {
        await interaction.editReply({ content: T("❌ Aucun node Proxmox trouvé.", "❌ No Proxmox nodes found.") })
        return
      }

      const statsEmbed = new EmbedBuilder()
        .setTitle(T("📊 Statistiques Complètes - Proxmox Cluster", "📊 Full Statistics - Proxmox Cluster"))
        .setDescription(T(`**${nodes.length}** node(s) détecté(s)`, `**${nodes.length}** node(s) detected`))
        .setColor(0x0099ff)
        .setTimestamp()

      let totalVMs = 0
      let totalTemplates = 0
      let runningVMs = 0
      let totalRAM = 0
      let usedRAM = 0
      let totalCPU = 0
      let usedCPU = 0

      for (const node of nodes) {
        try {
          const vms = await px.getVMs(node.node)
          const userVMs = vms.filter(vm => vm.template !== 1)
          const templates = vms.filter(vm => vm.template === 1)
          
          totalVMs += userVMs.length
          totalTemplates += templates.length
          runningVMs += userVMs.filter(vm => vm.status === "running").length

          // Récupération des infos CPU détaillées
          const nodeCPUInfo = await px.getNodeCPUInfo(node.node)
          
          // Calcul des ressources
          const nodeRAM = node.maxmem || 0
          const nodeUsedRAM = node.mem || 0
          const nodeCPU = nodeCPUInfo?.cpuinfo?.cpus || node.cpuinfo?.cpus || 1
          const nodeUsedCPU = node.cpu || 0

          totalRAM += nodeRAM
          usedRAM += nodeUsedRAM
          totalCPU += nodeCPU
          usedCPU += nodeUsedCPU

          const nodeStatus = node.status === "online" ? "🟢" : "🔴"
          const ramUsage = nodeRAM > 0 ? Math.round((nodeUsedRAM / nodeRAM) * 100) : 0
          const cpuUsage = Math.round(nodeUsedCPU * 100)

          // Stockages du node (avec pourcentage utilisé)
          let storageLines = []
          try {
            const storages = await px.getNodeStorage(node.node)
            for (const s of storages) {
              const total = s.total || 0
              const used = (s.total || 0) - (s.avail || 0)
              const pct = total > 0 ? Math.round((used / total) * 100) : 0
              storageLines.push(T(
                `📦 ${s.storage}: ${pct}% (${Math.round(used/1024/1024/1024)}/${Math.round(total/1024/1024/1024)} Go) [${Array.isArray(s.content)?s.content.join(','):s.content}]`,
                `📦 ${s.storage}: ${pct}% (${Math.round(used/1024/1024/1024)}/${Math.round(total/1024/1024/1024)} GB) [${Array.isArray(s.content)?s.content.join(','):s.content}]`
              ))
            }
          } catch (e) {
            storageLines.push(T("📦 Stockages: N/A", "📦 Storages: N/A"))
          }

          statsEmbed.addFields({
            name: `${nodeStatus} Node ${node.node}`,
            value: [
              T(`📊 **Statut:** ${node.status}`, `📊 **Status:** ${node.status}`),
              T(`🖥️ **VMs:** ${userVMs.length} (${userVMs.filter(v => v.status === "running").length} en cours)`, `🖥️ **VMs:** ${userVMs.length} (${userVMs.filter(v => v.status === "running").length} running)`),
              T(`📂 **Templates:** ${templates.length}`, `📂 **Templates:** ${templates.length}`),
              T(`💾 **RAM:** ${Math.round(ramUsage)}% (${Math.round(nodeUsedRAM / 1024 / 1024 / 1024)}/${Math.round(nodeRAM / 1024 / 1024 / 1024)} Go)`, `💾 **RAM:** ${Math.round(ramUsage)}% (${Math.round(nodeUsedRAM / 1024 / 1024 / 1024)}/${Math.round(nodeRAM / 1024 / 1024 / 1024)} GB)`),
              T(`⚡ **CPU:** ${cpuUsage}% (${nodeCPU} cœurs)`, `⚡ **CPU:** ${cpuUsage}% (${nodeCPU} cores)`),
              T(`🔧 **Modèle:** ${nodeCPUInfo?.cpuinfo?.model || 'N/A'}`, `🔧 **Model:** ${nodeCPUInfo?.cpuinfo?.model || 'N/A'}`),
              ...storageLines,
            ].join("\n"),
            inline: true
          })

        } catch (err) {
          log(T(`Erreur récupération stats node ${node.node}: ${err.message}`, `Error fetching stats for node ${node.node}: ${err.message}`), "WARN", "STATS-ALL")
          statsEmbed.addFields({
            name: `❌ Node ${node.node}`,
            value: T(`Erreur: ${err.message}`, `Error: ${err.message}`),
            inline: true
          })
        }
      }

      // Statistiques globales
      const globalRAMUsage = totalRAM > 0 ? Math.round((usedRAM / totalRAM) * 100) : 0
      const globalCPUUsage = totalCPU > 0 ? Math.round((usedCPU / totalCPU) * 100) : 0

      // Global storages (merged)
      let totalStorage = 0
      let usedStorage = 0
      try {
        for (const node of nodes) {
          const storages = await px.getNodeStorage(node.node)
          for (const s of storages) {
            totalStorage += s.total || 0
            usedStorage += (s.total || 0) - (s.avail || 0)
          }
        }
      } catch (e) {}
      const globalStoragePct = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0

      statsEmbed.addFields({
        name: T("🌐 Statistiques Globales", "🌐 Global Statistics"),
        value: [
          T(`📊 **Total VMs:** ${totalVMs}`, `📊 **Total VMs:** ${totalVMs}`),
          T(`▶️ **VMs en cours:** ${runningVMs}`, `▶️ **Running VMs:** ${runningVMs}`),
          T(`📂 **Total Templates:** ${totalTemplates}`, `📂 **Total Templates:** ${totalTemplates}`),
          T(`💾 **RAM globale:** ${globalRAMUsage}% (${Math.round(usedRAM / 1024 / 1024 / 1024)}/${Math.round(totalRAM / 1024 / 1024 / 1024)} Go)`, `💾 **Global RAM:** ${globalRAMUsage}% (${Math.round(usedRAM / 1024 / 1024 / 1024)}/${Math.round(totalRAM / 1024 / 1024 / 1024)} GB)`),
          T(`⚡ **CPU global:** ${globalCPUUsage}% (${totalCPU} cœurs totaux)`, `⚡ **Global CPU:** ${globalCPUUsage}% (${totalCPU} total cores)`),
          T(`🗄️ **Stockage global:** ${globalStoragePct}% (${Math.round(usedStorage/1024/1024/1024)}/${Math.round(totalStorage/1024/1024/1024)} Go)`, `🗄️ **Global Storage:** ${globalStoragePct}% (${Math.round(usedStorage/1024/1024/1024)}/${Math.round(totalStorage/1024/1024/1024)} GB)`),
          T(`📈 **Taux d'utilisation:** ${totalVMs > 0 ? Math.round((runningVMs / totalVMs) * 100) : 0}%`, `📈 **Utilization Rate:** ${totalVMs > 0 ? Math.round((runningVMs / totalVMs) * 100) : 0}%`)
        ].join("\n"),
        inline: false
      })

      // Recommandations
      const recommendations = []
      if (globalRAMUsage > 80) recommendations.push(T("⚠️ **RAM:** Considérer l'ajout de mémoire", "⚠️ **RAM:** Consider adding more memory"))
      if (globalCPUUsage > 80) recommendations.push(T("⚠️ **CPU:** Charge CPU élevée détectée", "⚠️ **CPU:** High CPU load detected"))
      if (runningVMs / totalVMs > 0.9) recommendations.push(T("⚠️ **VMs:** Presque toutes les VMs sont en cours", "⚠️ **VMs:** Almost all VMs are running"))
      if (totalVMs === 0) recommendations.push(T("ℹ️ **VMs:** Aucune VM créée, utilisez `/createvps`", "ℹ️ **VMs:** No VMs created yet, use `/createvps`"))

      if (recommendations.length > 0) {
        statsEmbed.addFields({
          name: T("💡 Recommandations", "💡 Recommendations"),
          value: recommendations.join("\n"),
          inline: false
        })
      }

      const langRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('stats_lang')
          .setPlaceholder(isEN ? 'Language' : 'Langue')
          .addOptions([
            { label: 'Français', value: 'fr', default: !isEN, description: 'Aide en français' },
            { label: 'English', value: 'en', default: isEN, description: 'Help in English' },
          ])
      )

      await interaction.editReply({ embeds: [statsEmbed], components: [langRow] })
    } catch (err) {
      log(err.stack, "ERROR", "STATS-ALL")
      const lang = getUserLang(interaction.user.id, interaction.guildId)
      const isEN = lang === 'en'
      await interaction.editReply({ content: isEN ? `❌ Error while fetching statistics: ${err.message}` : `❌ Erreur lors de la récupération des statistiques: ${err.message}` })
    }
  },
  // Route handler for select menu to switch language
  route: async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== 'stats_lang') return;

    const selected = interaction.values?.[0] || 'fr';
    const isEN = selected === 'en';
    const T = (fr, en) => (isEN ? en : fr);

    try {
      // Recompute stats in the chosen language
      const nodes = await px.nodes();
      if (!nodes.length) {
        await interaction.update({ content: T("❌ Aucun node Proxmox trouvé.", "❌ No Proxmox nodes found."), embeds: [], components: [] });
        return;
      }

      const statsEmbed = new EmbedBuilder()
        .setTitle(T("📊 Statistiques Complètes - Proxmox Cluster", "📊 Full Statistics - Proxmox Cluster"))
        .setDescription(T(`**${nodes.length}** node(s) détecté(s)`, `**${nodes.length}** node(s) detected`))
        .setColor(0x0099ff)
        .setTimestamp();

      let totalVMs = 0, totalTemplates = 0, runningVMs = 0;
      let totalRAM = 0, usedRAM = 0, totalCPU = 0, usedCPU = 0;

      for (const node of nodes) {
        try {
          const vms = await px.getVMs(node.node);
          const userVMs = vms.filter(vm => vm.template !== 1);
          const templates = vms.filter(vm => vm.template === 1);
          totalVMs += userVMs.length;
          totalTemplates += templates.length;
          runningVMs += userVMs.filter(vm => vm.status === 'running').length;

          const nodeCPUInfo = await px.getNodeCPUInfo(node.node);
          const nodeRAM = node.maxmem || 0;
          const nodeUsedRAM = node.mem || 0;
          const nodeCPU = nodeCPUInfo?.cpuinfo?.cpus || node.cpuinfo?.cpus || 1;
          const nodeUsedCPU = node.cpu || 0;
          totalRAM += nodeRAM; usedRAM += nodeUsedRAM; totalCPU += nodeCPU; usedCPU += nodeUsedCPU;
          const nodeStatus = node.status === 'online' ? '🟢' : '🔴';
          const ramUsage = nodeRAM > 0 ? Math.round((nodeUsedRAM / nodeRAM) * 100) : 0;
          const cpuUsage = Math.round(nodeUsedCPU * 100);

          let storageLines = [];
          try {
            const storages = await px.getNodeStorage(node.node);
            for (const s of storages) {
              const total = s.total || 0;
              const used = (s.total || 0) - (s.avail || 0);
              const pct = total > 0 ? Math.round((used / total) * 100) : 0;
              storageLines.push(T(
                `📦 ${s.storage}: ${pct}% (${Math.round(used/1024/1024/1024)}/${Math.round(total/1024/1024/1024)} Go) [${Array.isArray(s.content)?s.content.join(','):s.content}]`,
                `📦 ${s.storage}: ${pct}% (${Math.round(used/1024/1024/1024)}/${Math.round(total/1024/1024/1024)} GB) [${Array.isArray(s.content)?s.content.join(','):s.content}]`
              ));
            }
          } catch (_) {
            storageLines.push(T('📦 Stockages: N/A', '📦 Storages: N/A'));
          }

          statsEmbed.addFields({
            name: `${nodeStatus} Node ${node.node}`,
            value: [
              T(`📊 **Statut:** ${node.status}`, `📊 **Status:** ${node.status}`),
              T(`🖥️ **VMs:** ${userVMs.length} (${userVMs.filter(v => v.status === 'running').length} en cours)`, `🖥️ **VMs:** ${userVMs.length} (${userVMs.filter(v => v.status === 'running').length} running)`),
              T(`📂 **Templates:** ${templates.length}`, `📂 **Templates:** ${templates.length}`),
              T(`💾 **RAM:** ${Math.round(ramUsage)}% (${Math.round(nodeUsedRAM/1024/1024/1024)}/${Math.round(nodeRAM/1024/1024/1024)} Go)`, `💾 **RAM:** ${Math.round(ramUsage)}% (${Math.round(nodeUsedRAM/1024/1024/1024)}/${Math.round(nodeRAM/1024/1024/1024)} GB)`),
              T(`⚡ **CPU:** ${cpuUsage}% (${nodeCPU} cœurs)`, `⚡ **CPU:** ${cpuUsage}% (${nodeCPU} cores)`),
              T(`🔧 **Modèle:** ${nodeCPUInfo?.cpuinfo?.model || 'N/A'}`, `🔧 **Model:** ${nodeCPUInfo?.cpuinfo?.model || 'N/A'}`),
              ...storageLines,
            ].join('\n'),
            inline: true,
          });
        } catch (err) {
          statsEmbed.addFields({ name: `❌ Node ${node.node}`, value: T(`Erreur: ${err.message}`, `Error: ${err.message}`), inline: true });
        }
      }

      const globalRAMUsage = totalRAM > 0 ? Math.round((usedRAM / totalRAM) * 100) : 0;
      const globalCPUUsage = totalCPU > 0 ? Math.round((usedCPU / totalCPU) * 100) : 0;

      let totalStorage = 0, usedStorage = 0;
      try {
        for (const node of nodes) {
          const storages = await px.getNodeStorage(node.node);
          for (const s of storages) { totalStorage += s.total || 0; usedStorage += (s.total || 0) - (s.avail || 0); }
        }
      } catch {}
      const globalStoragePct = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0;

      statsEmbed.addFields({
        name: T('🌐 Statistiques Globales', '🌐 Global Statistics'),
        value: [
          T(`📊 **Total VMs:** ${totalVMs}`, `📊 **Total VMs:** ${totalVMs}`),
          T(`▶️ **VMs en cours:** ${runningVMs}`, `▶️ **Running VMs:** ${runningVMs}`),
          T(`📂 **Total Templates:** ${totalTemplates}`, `📂 **Total Templates:** ${totalTemplates}`),
          T(`💾 **RAM globale:** ${globalRAMUsage}% (${Math.round(usedRAM/1024/1024/1024)}/${Math.round(totalRAM/1024/1024/1024)} Go)`, `💾 **Global RAM:** ${globalRAMUsage}% (${Math.round(usedRAM/1024/1024/1024)}/${Math.round(totalRAM/1024/1024/1024)} GB)`),
          T(`⚡ **CPU global:** ${globalCPUUsage}% (${totalCPU} cœurs totaux)`, `⚡ **Global CPU:** ${globalCPUUsage}% (${totalCPU} total cores)`),
          T(`🗄️ **Stockage global:** ${globalStoragePct}% (${Math.round(usedStorage/1024/1024/1024)}/${Math.round(totalStorage/1024/1024/1024)} Go)`, `🗄️ **Global Storage:** ${globalStoragePct}% (${Math.round(usedStorage/1024/1024/1024)}/${Math.round(totalStorage/1024/1024/1024)} GB)`),
          T(`📈 **Taux d'utilisation:** ${totalVMs > 0 ? Math.round((runningVMs / totalVMs) * 100) : 0}%`, `📈 **Utilization Rate:** ${totalVMs > 0 ? Math.round((runningVMs / totalVMs) * 100) : 0}%`),
        ].join('\n'),
        inline: false,
      });

      const langRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('stats_lang')
          .setPlaceholder(isEN ? 'Language' : 'Langue')
          .addOptions([
            { label: 'Français', value: 'fr', default: !isEN, description: 'Aide en français' },
            { label: 'English', value: 'en', default: isEN, description: 'Help in English' },
          ])
      );

      await interaction.update({ embeds: [statsEmbed], components: [langRow] });
    } catch (err) {
      try { await interaction.update({ content: `❌ ${isEN ? 'Error' : 'Erreur'}: ${err.message}`, embeds: [], components: [] }); } catch {}
    }
  },
}
