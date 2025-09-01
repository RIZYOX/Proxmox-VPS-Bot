const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { startPanelServer } = require('../utils/panelServer');
const proxmox = require('../utils/proxmox');
const { getUserLang } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Ouvre le panneau web local / Open the local web panel'),

  execute: async (interaction) => {
    try {
      await interaction.deferReply({ flags: 64 });
      const { url } = await startPanelServer({ proxmox });
      const lang = getUserLang(interaction.user.id, interaction.guildId);
      const isEN = lang === 'en';
      const tokenHint = process.env.PANEL_TOKEN ? (isEN ? 'Add header x-panel-token or ?token=...' : 'Ajoutez l’en-tête x-panel-token ou ?token=...') : (isEN ? 'No token set' : 'Aucun token défini');
      const emb = new EmbedBuilder()
        .setColor(0x2b5cff)
        .setTitle(isEN ? 'Local Panel' : 'Panneau local')
        .setDescription(`${isEN ? 'Open:' : 'Ouvrez :'} ${url}\n${tokenHint}`)
        .addFields(
          { name: 'Host', value: '127.0.0.1', inline: true },
          { name: 'Port', value: String(process.env.PANEL_PORT || 3000), inline: true },
        )
        .setFooter({ text: isEN ? 'Local only • Source-available • Private use' : 'Local seulement • Source-disponible • Usage privé' });
      await interaction.editReply({ embeds: [emb] });
    } catch (e) {
      try { await interaction.editReply({ content: '❌ ' + e.message }); } catch (_) {}
    }
  },
};
