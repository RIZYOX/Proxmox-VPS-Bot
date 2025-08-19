const { SlashCommandBuilder } = require("discord.js");
const store = require("../utils/authStore");
const { getUserLang } = require("../utils/i18n");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("authorize")
    .setDescription("Autoriser un utilisateur (admin uniquement) / Authorize a user (admin only)")
    .addStringOption(option => 
      option.setName("userid")
        .setDescription("ID Discord de l'utilisateur à autoriser / Discord user ID to authorize")
        .setRequired(true)
    ),

  execute: async (interaction) => {
    const callerId = interaction.user.id;
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN = lang === 'en';
    const T = (fr, en) => (isEN ? en : fr);

    if (!store.isAdmin(callerId)) {
      await interaction.reply({ content: T("❌ Seuls les admins peuvent autoriser des utilisateurs.", "❌ Only admins can authorize users."), flags: 64 });
      return;
    }

    const uid = interaction.options.getString("userid");
    store.addAllowed(uid);

    await interaction.reply({ content: T(`✅ L'utilisateur <@${uid}> est maintenant autorisé.`, `✅ User <@${uid}> is now authorized.`), flags: 64 });
  }
};
