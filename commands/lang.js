const { SlashCommandBuilder } = require('discord.js');
const { setUserLang, getUserLang } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lang')
    .setDescription('Set or view your preferred language (FR/EN)')
    .addSubcommand(sc => sc
      .setName('set')
      .setDescription('Set your preferred language')
      .addStringOption(o => o
        .setName('language')
        .setDescription('Choose FR or EN')
        .setRequired(true)
        .addChoices(
          { name: 'Français', value: 'fr' },
          { name: 'English', value: 'en' },
        )
      )
    )
    .addSubcommand(sc => sc
      .setName('show')
      .setDescription('Show your current preferred language')
    ),

  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const lang = interaction.options.getString('language');
      if (!['fr', 'en'].includes(lang)) {
        await interaction.reply({ content: 'Lang must be fr|en', flags: 64 });
        return;
      }
      setUserLang(interaction.user.id, lang);
      await interaction.reply({ content: lang === 'en' ? '✅ Language set to English.' : '✅ Langue définie sur Français.', flags: 64 });
      return;
    }

    if (sub === 'show') {
      const lang = getUserLang(interaction.user.id, interaction.guildId);
      await interaction.reply({ content: lang === 'en' ? 'Your language is English.' : 'Votre langue est le Français.', flags: 64 });
      return;
    }
  },
};
