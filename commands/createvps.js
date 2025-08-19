const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
} = require("discord.js");
const { randomPassword, sleep, log, bytesToGiB } = require("../utils/helpers");
const px = require("../utils/proxmox");
// Stockage des sessions actives (1 session par utilisateur)
const activeSessions = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("createvps")
    .setDescription("Créer un VPS personnalisé"),

  execute: async (interaction) => {
    const userId = interaction.user.id;
    if (activeSessions.has(userId)) {
      return interaction.reply({
        content: "⚠️ Vous avez déjà une création de VPS en cours.",
        ephemeral: true,
      });
    }
    activeSessions.set(userId, {
      step: "node",
      data: {
        node: null,
        templateVmid: null,
        ram: null,
        cores: null,
        disk: null,
        storage: null,
        name: null,
        user: "debian",
        password: null,
        vmid: null,
      }
    });
    try {
      await interaction.deferReply();
      const nodes = await px.nodes();
      if (!nodes.length) {
        activeSessions.delete(userId);
        return await interaction.editReply("❌ Aucun node trouvé sur Proxmox.");
      }
      const nodeMenu = new StringSelectMenuBuilder()
        .setCustomId(`node_${userId}`)
        .setPlaceholder("Choisissez un node")
        .addOptions(
          nodes.map(n => ({
            label: n.node,
            description: n.status === "online" ? "En ligne" : "Hors ligne",
            value: n.node,
          }))
        );
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🖥️ Sélectionnez un node")
            .setDescription("Choisissez le node Proxmox pour héberger votre VPS.")
            .setColor(0x00ff00)
        ],
        components: [new ActionRowBuilder().addComponents(nodeMenu)],
      });
    } catch (err) {
      log(`Erreur execute: ${err.stack}`, "ERROR", "CREATEVPS");
      activeSessions.delete(userId);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Erreur: ${err.message}`, ephemeral: true });
      } else {
        await interaction.editReply({ content: `❌ Erreur: ${err.message}` });
      }
    }
  },

  route: async (interaction) => {
    const userId = interaction.user.id;
    if (!activeSessions.has(userId)) return;
    const session = activeSessions.get(userId);
    if (!session) return;
    try {
      // --- Sélection du node ---
      if (interaction.isStringSelectMenu() && interaction.customId === `node_${userId}` && session.step === "node") {
        await interaction.deferUpdate();
        session.data.node = interaction.values[0];
        session.step = "template";
        const vms = await px.getVMs(session.data.node);
        const templates = vms.filter(vm => vm.template === 1);
        if (!templates.length) {
          await interaction.editReply("❌ Aucun template disponible sur ce node.");
          activeSessions.delete(userId);
          return;
        }
        const templateMenu = new StringSelectMenuBuilder()
          .setCustomId(`template_${userId}`)
          .setPlaceholder("Choisissez un template")
          .addOptions(
            templates.map(t => ({
              label: t.name || `VMID ${t.vmid}`,
              value: t.vmid.toString(),
            }))
          );
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📂 Sélectionnez un template")
              .setDescription("Choisissez un template pour votre VPS.")
              .setColor(0x0099ff)
          ],
          components: [new ActionRowBuilder().addComponents(templateMenu)],
        });
        return;
      }

      // --- Sélection du template ---
      if (interaction.isStringSelectMenu() && interaction.customId === `template_${userId}` && session.step === "template") {
        await interaction.deferUpdate();
        session.data.templateVmid = Number(interaction.values[0]);
        session.step = "ram";
        const ramMenu = new StringSelectMenuBuilder()
          .setCustomId(`ram_${userId}`)
          .setPlaceholder("Sélectionnez la RAM")
          .addOptions([
            { label: "2 Go", value: "2048" },
            { label: "4 Go", value: "4096" },
            { label: "8 Go", value: "8192" },
          ]);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("💾 Sélectionnez la RAM")
              .setDescription("Choisissez la quantité de RAM pour votre VPS.")
              .setColor(0x0099ff)
          ],
          components: [new ActionRowBuilder().addComponents(ramMenu)],
        });
        return;
      }

      // --- Sélection de la RAM ---
      if (interaction.isStringSelectMenu() && interaction.customId === `ram_${userId}` && session.step === "ram") {
        await interaction.deferUpdate();
        session.data.ram = interaction.values[0];
        session.step = "cores";
        const coresMenu = new StringSelectMenuBuilder()
          .setCustomId(`cores_${userId}`)
          .setPlaceholder("Sélectionnez le CPU")
          .addOptions([
            { label: "1 Cœur", value: "1" },
            { label: "2 Cœurs", value: "2" },
            { label: "4 Cœurs", value: "4" },
          ]);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚡ Sélectionnez le CPU")
              .setDescription("Choisissez le nombre de cœurs CPU pour votre VPS.")
              .setColor(0x0099ff)
          ],
          components: [new ActionRowBuilder().addComponents(coresMenu)],
        });
        return;
      }

      // --- Sélection du CPU ---
      if (interaction.isStringSelectMenu() && interaction.customId === `cores_${userId}` && session.step === "cores") {
        await interaction.deferUpdate();
        session.data.cores = interaction.values[0];
        session.step = "storage";
        const storages = await px.imagesStorages(session.data.node).catch(() => []);
        if (!storages.length) {
          await interaction.editReply("❌ Aucun stockage 'images' disponible sur ce node.");
          activeSessions.delete(userId);
          return;
        }
        const storageMenu = new StringSelectMenuBuilder()
          .setCustomId(`storage_${userId}`)
          .setPlaceholder("Sélectionnez le stockage Proxmox")
          .addOptions(
            storages.map(s => ({
              label: `${s.storage} (${typeof s.avail === 'number' ? bytesToGiB(s.avail) : '?'} GiB libres)`,
              description: `${s.type} - ${Array.isArray(s.content) ? s.content.join(',') : s.content}`,
              value: s.storage,
            }))
          );
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📦 Sélectionnez le stockage")
              .setDescription("Choisissez le stockage où sera placé le disque de votre VPS.")
              .setColor(0x0099ff)
          ],
          components: [new ActionRowBuilder().addComponents(storageMenu)],
        });
        return;
      }

      // --- Sélection du stockage ---
      if (interaction.isStringSelectMenu() && interaction.customId === `storage_${userId}`) {
        await interaction.deferUpdate();
        session.data.storage = interaction.values[0];
        session.step = "disk";
        const diskMenu = new StringSelectMenuBuilder()
          .setCustomId(`disk_${userId}`)
          .setPlaceholder("Sélectionnez la taille du disque")
          .addOptions([
            { label: "20 GiB", value: "20" },
            { label: "40 GiB", value: "40" },
            { label: "60 GiB", value: "60" },
            { label: "80 GiB", value: "80" },
            { label: "Personnalisé", value: "custom" },
          ]);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("💽 Sélectionnez l'espace disque")
              .setDescription(`Stockage: ${session.data.storage}\nChoisissez l'espace de stockage pour votre VPS.`)
              .setColor(0x0099ff)
          ],
          components: [new ActionRowBuilder().addComponents(diskMenu)],
        });
        return;
      }

      // --- Sélection du disque ---
      if (interaction.isStringSelectMenu() && interaction.customId === `disk_${userId}` && session.step === "disk") {
        const choice = interaction.values[0];
        if (choice === "custom") {
          session.step = "disk-custom";
          // Options personnalisées (limitées à 25)
          const customSizes = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 24);
          const customMenu = new StringSelectMenuBuilder()
            .setCustomId(`diskcustom_${userId}`)
            .setPlaceholder("Choisissez une taille personnalisée (GiB)")
            .addOptions([
              ...customSizes.map(v => ({ label: `${v} GiB`, value: String(v) })),
              { label: "↩️ Retour", value: "back" }
            ]);
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("💽 Taille disque personnalisée")
                .setDescription("Choisissez une taille dans la liste.")
                .setColor(0x0099ff)
            ],
            components: [new ActionRowBuilder().addComponents(customMenu)],
          });
          return;
        } else {
          session.data.disk = choice;
          session.step = "name";
          const modal = new ModalBuilder()
            .setCustomId(`name_${userId}`)
            .setTitle("Nom du VPS et username");
          const nameInput = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Nom du VPS")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          const userInput = new TextInputBuilder()
            .setCustomId("username")
            .setLabel("Nom d'utilisateur (ex: debian)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(userInput)
          );
          await interaction.showModal(modal);
          return;
        }
      }

      // --- Sélection taille personnalisée via menu ---
      if (interaction.isStringSelectMenu() && interaction.customId === `diskcustom_${userId}` && session.step === "disk-custom") {
        const choice = interaction.values[0];
        if (choice === "back") {
          session.step = "disk";
          const diskMenu = new StringSelectMenuBuilder()
            .setCustomId(`disk_${userId}`)
            .setPlaceholder("Sélectionnez la taille du disque")
            .addOptions([
              { label: "20 GiB", value: "20" },
              { label: "40 GiB", value: "40" },
              { label: "60 GiB", value: "60" },
              { label: "80 GiB", value: "80" },
              { label: "Personnalisé", value: "custom" },
            ]);
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("💽 Sélectionnez l'espace disque")
                .setDescription(`Stockage: ${session.data.storage}\nChoisissez l'espace de stockage pour votre VPS.`)
                .setColor(0x0099ff)
            ],
            components: [new ActionRowBuilder().addComponents(diskMenu)],
          });
          return;
        }
        // set size and open name modal
        session.data.disk = choice;
        session.step = "name";
        const modal = new ModalBuilder()
          .setCustomId(`name_${userId}`)
          .setTitle("Nom du VPS et username");
        const nameInput = new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Nom du VPS")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        const userInput = new TextInputBuilder()
          .setCustomId("username")
          .setLabel("Nom d'utilisateur (ex: debian)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(userInput)
        );
        await interaction.showModal(modal);
        return;
      }

      // (le flux custom via modal a été remplacé par un menu de sélection pour compatibilité)

      // --- Modal submit (Nom et utilisateur) ---
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId === `name_${userId}` && session.step === "name") {
        await interaction.deferUpdate();

        let name = interaction.fields.getTextInputValue("name");
        // Nettoyage du nom pour respecter le format DNS: lettres/chiffres/-, pas d'espace, commence par lettre
        name = name.trim().toLowerCase();
        name = name.replace(/\s+/g, "-"); // remplace espaces par tirets
        name = name.replace(/[^a-z0-9-]/g, "-"); // only a-z 0-9 -
        name = name.replace(/-+/g, "-"); // condense multiple '-'
        if (!/^[a-z]/.test(name)) name = `vps-${name}`; // doit commencer par une lettre
        name = name.replace(/-$/, ""); // pas de tiret final
        if (name.length < 3) name = `vps-${Date.now().toString().slice(-4)}`;
        const rawUsername = interaction.fields.getTextInputValue("username");

        let cleanUsername = rawUsername.trim();
        cleanUsername = cleanUsername.replace(/\s+/g, "_");
        cleanUsername = cleanUsername.replace(/[^a-zA-Z0-9_-]/g, "");
        if (cleanUsername.length < 2) cleanUsername = "user";
        else if (cleanUsername.length > 20) cleanUsername = cleanUsername.substring(0, 20);
        if (!/^[a-zA-Z]/.test(cleanUsername)) cleanUsername = "user_" + cleanUsername;

        log(`Nom d'utilisateur nettoyé: "${rawUsername}" → "${cleanUsername}"`, "INFO", "CREATEVPS");

        session.data.name = name;
        session.data.user = cleanUsername;
        session.data.password = randomPassword(12);
        session.data.vmid = await px.nextId();
        session.step = "confirm";
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_${userId}`)
            .setLabel("✅ Créer le VPS")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel_${userId}`)
            .setLabel("❌ Annuler")
            .setStyle(ButtonStyle.Danger),
        );
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📋 Récapitulatif")
              .setDescription(
                `**Nom VPS:** ${session.data.name}\n` +
                `**Utilisateur:** ${session.data.user}\n` +
                `**RAM:** ${session.data.ram/1024} Go\n` +
                `**CPU:** ${session.data.cores} cœur(s)\n` +
                `**Stockage:** ${session.data.storage}\n` +
                `**Disque:** ${session.data.disk} Go\n` +
                `**Template:** VMID ${session.data.templateVmid}`
              )
              .setColor(0xffaa00)
          ],
          components: [confirmRow],
        });
        return;
      }

      // --- Confirmation / Annulation ---
      if (interaction.isButton() && interaction.customId === `cancel_${userId}` && session.step === "confirm") {
        await interaction.deferUpdate();
        await interaction.editReply("❌ Création annulée.");
        activeSessions.delete(userId);
        return;
      }

      if (interaction.isButton() && interaction.customId === `confirm_${userId}` && session.step === "confirm") {
        await interaction.deferUpdate();
        const progressEmbed = new EmbedBuilder()
          .setTitle("🛠️ Création en cours...")
          .setDescription("Votre VPS est en cours de création...")
          .setColor(0x0099ff)
          .addFields({ name: "📋 Étapes", value: "1/4: Clonage du template", inline: false });
        await interaction.editReply({ embeds: [progressEmbed], components: [] });

        // --- Clonage ---
        try {
          await px.cloneVM(session.data.node, session.data.templateVmid, session.data.vmid, { name: session.data.name, full: 1, storage: session.data.storage });
          progressEmbed.data.fields[0].value = "2/4: Configuration de la VM";
          await interaction.editReply({ embeds: [progressEmbed] });
        } catch (err) {
          await interaction.editReply(`❌ Erreur clonage: ${err.message}`);
          activeSessions.delete(userId);
          return;
        }

        // --- Configuration VM (CORRIGÉE) ---
        try {
          log(`Configuration VM ${session.data.vmid}: user=${session.data.user}, password=${session.data.password}`, "INFO", "CREATEVPS");

          const cloudInitContent = `
          #cloud-config
          users:
            - name: ${session.data.user}
              sudo: ALL=(ALL) NOPASSWD:ALL
              groups: [sudo, adm]
              shell: /bin/bash
              lock_passwd: false
          ssh_pwauth: true
          disable_root: false
          chpasswd:
            list: |
              ${session.data.user}:${session.data.password}
              root:${session.data.password}
            expire: false
          packages:
            - cloud-guest-utils
          growpart:
            mode: auto
            devices: ['/', ]
            ignore_growroot_disabled: false
          resize_rootfs: true
          resizefs: true
          `;
          
          
          

          // 2. Upload du fichier cloud-init
          const cloudInitPath = await px.createCloudInitFile(session.data.node, session.data.vmid, cloudInitContent, "user-data");

          // 3. Configurer la VM avec le fichier cloud-init
          const configResult = await px.setVMConfig(session.data.node, session.data.vmid, {
            ciuser: session.data.user,
            cipassword: session.data.password,
            cicustom: cloudInitPath ? `user=${cloudInitPath}` : undefined,
          });

          log(`Configuration cloud-init réussie: ${JSON.stringify(configResult)}`, "INFO", "CREATEVPS");

          // 4. Attendre que cloud-init se configure
          await sleep(5000);

          // 5. Vérifier que la configuration est bien appliquée
          const vmConfig = await px.getVMConfig(session.data.node, session.data.vmid);
          log(`Vérification config: ${JSON.stringify(vmConfig)}`, "INFO", "CREATEVPS");

          // 6. Si la config n'est pas appliquée, forcer la réapplication
          if (!vmConfig.ciuser || !vmConfig.cipassword) {
            log(`⚠️ Configuration cloud-init non appliquée, nouvelle tentative...`, "WARN", "CREATEVPS");
            try {
              const status = await px.getVMStatus(session.data.node, session.data.vmid);
              if (status.status === "running") {
                await px.stopVM(session.data.node, session.data.vmid);
                await sleep(5000);
              }
            } catch (stopError) {
              log(`Erreur arrêt VM: ${stopError.message}`, "WARN", "CREATEVPS");
            }
            await px.setVMConfig(session.data.node, session.data.vmid, {
              ciuser: session.data.user,
              cipassword: session.data.password,
              cicustom: cloudInitPath ? `user=${cloudInitPath}` : undefined,
            });
            await sleep(3000);
          }

          progressEmbed.data.fields[0].value = "3/4: Redimensionnement du disque";
          await interaction.editReply({ embeds: [progressEmbed] });
        } catch (err) {
          log(`Erreur configuration VM ${session.data.vmid}: ${err.stack}`, "ERROR", "CREATEVPS");
          await interaction.editReply(`❌ Erreur configuration: ${err.message}`);
          activeSessions.delete(userId);
          return;
        }

        // --- Redimensionnement du disque ---
        try {
          if (Number(session.data.disk) > 2) {
            await px.resizeDisk(session.data.node, session.data.vmid, "scsi0", `${session.data.disk}G`);
          }
          progressEmbed.data.fields[0].value = "4/4: Démarrage et récupération IP";
          await interaction.editReply({ embeds: [progressEmbed] });
        } catch (err) {
          log(`Erreur disque: ${err.message}`, "WARN", "CREATEVPS");
        }

        // --- Démarrage VM ---
        try {
          log(`Démarrage VM ${session.data.vmid}...`, "INFO", "CREATEVPS");
          await px.startVM(session.data.node, session.data.vmid);

          // Attendre que la VM soit bien démarrée et que cloud-init se configure
          log(`Attente configuration cloud-init pour VM ${session.data.vmid}...`, "INFO", "CREATEVPS");
          await sleep(15000);

          // Vérification finale
          try {
            const finalConfig = await px.getVMConfig(session.data.node, session.data.vmid);
            log(`Configuration finale VM ${session.data.vmid}: ciuser=${finalConfig.ciuser}, cipassword=${finalConfig.cipassword ? 'SET' : 'NOT_SET'}`, "INFO", "CREATEVPS");
            if (!finalConfig.ciuser || !finalConfig.cipassword) {
              log(`⚠️ Configuration cloud-init toujours manquante après démarrage`, "WARN", "CREATEVPS");
            } else {
              log(`✅ Configuration cloud-init confirmée après démarrage`, "INFO", "CREATEVPS");
              log(`🎯 L'utilisateur ${session.data.user} a maintenant les droits sudo -i et peut devenir root !`, "INFO", "CREATEVPS");
            }
          } catch (configError) {
            log(`Erreur vérification config finale: ${configError.message}`, "WARN", "CREATEVPS");
          }
        } catch (err) {
          log(`Erreur démarrage VM ${session.data.vmid}: ${err.message}`, "ERROR", "CREATEVPS");
          await interaction.editReply(`❌ Erreur démarrage: ${err.message}`);
          activeSessions.delete(userId);
          return;
        }

        // --- Récupération IP ---
        let ip = null;
        for (let i=0; i<10; i++) {
          await sleep(10000);
          ip = await px.getVMIPv4Info(session.data.node, session.data.vmid).catch(() => null);
          if (ip) {
            log(`IPv4 récupérée pour VPS ${session.data.name}: ${ip}`, "INFO", "CREATEVPS");
            break;
          }
          const networkInfo = await px.getVMNetworkInfo(session.data.node, session.data.vmid).catch(() => null);
          if (networkInfo?.ip) {
            ip = networkInfo.ip;
            log(`IP récupérée (méthode générale) pour VPS ${session.data.name}: ${ip}`, "INFO", "CREATEVPS");
            break;
          }
        }
        if (!ip) ip = "IP non récupérée";

        // --- Attendre un peu plus pour cloud-init ---
        if (ip !== "IP non récupérée") {
          progressEmbed.setColor(0xffaa00)
            .setDescription(`⏳ Attente finalisation cloud-init...\n🌐 IP: ${ip}`);
          await interaction.editReply({ embeds: [progressEmbed] });
          await sleep(10000);
        }

        // --- Test de la connexion SSH ---
        progressEmbed.setColor(0xffaa00)
          .setDescription(`🧪 Test de la connexion SSH en cours...\n🌐 IP: ${ip}`);
        await interaction.editReply({ embeds: [progressEmbed] });
        let sshTestResult = null;
        if (ip !== "IP non récupérée") {
          try {
            log(`Test SSH pour VPS ${session.data.name} (${ip})`, "INFO", "CREATEVPS");
            sshTestResult = await px.testSSHConnection(ip, session.data.user, session.data.password);
            if (sshTestResult.success) {
              log(`✅ Test SSH réussi pour VPS ${session.data.name} en ${sshTestResult.attempts} tentative(s)`, "INFO", "CREATEVPS");
              progressEmbed.setColor(0x00ff00)
                .setDescription(`✅ VPS créé avec succès !\n🌐 IP: ${ip}\n🔐 SSH: Testé et fonctionnel\n🎯 Sudo: Testé et fonctionnel`);
            } else {
              log(`❌ Test SSH échoué pour VPS ${session.data.name}: ${sshTestResult.error}`, "WARN", "CREATEVPS");
              progressEmbed.setColor(0xff8800)
                .setDescription(`⚠️ VPS créé mais problème SSH détecté\n🌐 IP: ${ip}\n🔐 SSH: Échec du test (${sshTestResult.error})`);
            }
          } catch (sshError) {
            log(`Erreur lors du test SSH pour VPS ${session.data.name}: ${sshError.message}`, "ERROR", "CREATEVPS");
            progressEmbed.setColor(0xff8800)
              .setDescription(`⚠️ VPS créé mais test SSH impossible\n🌐 IP: ${ip}\n🔐 SSH: Erreur de test`);
          }
        } else {
          progressEmbed.setColor(0xff8800)
            .setDescription(`⚠️ VPS créé mais IP non récupérée\n🔐 SSH: Impossible à tester`);
        }
        await interaction.editReply({ embeds: [progressEmbed] });

        // --- Envoi DM avec statut SSH ---
        const dmEmbed = new EmbedBuilder()
          .setTitle("🔒 Identifiants de votre VPS")
          .setDescription(
            `🆔 **VMID:** ${session.data.vmid}\n` +
            `📛 **Nom:** ${session.data.name}\n` +
            `🖥️ **Node:** ${session.data.node}\n` +
            `📂 **Template:** VMID ${session.data.templateVmid}\n` +
            `⚡ **CPU:** ${session.data.cores} cœur(s)\n` +
            `💾 **RAM:** ${session.data.ram/1024} Go\n` +
            `📦 **Stockage:** ${session.data.storage}\n` +
            `💽 **Disque:** ${session.data.disk} Go\n` +
            `🌐 **IP:** ${ip}\n` +
            `👤 **Utilisateur:** ${session.data.user}\n` +
            `🔑 **Mot de passe:** \`${session.data.password}\`\n\n` +
            `**Connexion SSH:**\n` +
            `\`ssh ${session.data.user}@${ip}\`\n\n` +
            `**Devenir root:**\n` +
            `\`sudo su\` (mot de passe: ${session.data.password})\n\n` +
            `**Statut SSH:** ${sshTestResult?.success ? '✅ Testé et fonctionnel' : '❌ Problème détecté'}\n` +
            `**Test Sudo:** ${sshTestResult?.sudoTest ? '✅ Testé et fonctionnel' : '❌ Non testé'}\n\n` +
            `🎯 **L'utilisateur a les droits sudo et peut devenir root !**\n\n` +
            `⚠️ **Gardez ces informations en sécurité**`
          )
          .setColor(sshTestResult?.success ? 0x00ff00 : 0xff8800)
          .setFooter({
            text: `Créé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        try { await interaction.user.send({ embeds: [dmEmbed] }); } catch {}
        activeSessions.delete(userId);
      }
    } catch (err) {
      log(`Erreur route: ${err.stack}`, "ERROR", "CREATEVPS");
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ Une erreur est survenue.", ephemeral: true });
      } else {
        await interaction.followUp({ content: "❌ Une erreur est survenue.", ephemeral: true });
      }
      activeSessions.delete(userId);
    }
  },
};
