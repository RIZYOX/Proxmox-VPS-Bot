const { SlashCommandBuilder, EmbedBuilder, codeBlock } = require("discord.js");
const px = require("../utils/proxmox");
const { getUserLang } = require("../utils/i18n");

function hasAllEnv() {
  const required = [
    "DISCORD_TOKEN",
    "PVE_HOST",
    "PVE_TOKENID",
    "PVE_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  return { ok: missing.length === 0, missing };
}

async function collectTemplates() {
  const result = [];
  const nodes = await px.nodes();
  for (const n of nodes) {
    const node = n.node || n.id || n; // tolerate shapes
    try {
      const vms = await px.getVMs(node);
      for (const vm of vms) {
        const vmid = vm.vmid;
        try {
          const cfg = await px.getVMConfig(node, vmid);
          if (String(cfg.template) === "1") {
            result.push({ node, vmid, cfg });
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return result;
}

function analyzeTemplate(t, T) {
  const issues = [];
  const hints = [];
  const cfg = t.cfg || {};

  // Agent
  if (!("agent" in cfg) || String(cfg.agent) !== "1") {
    issues.push(T("QEMU Guest Agent désactivé (agent != 1)", "QEMU Guest Agent disabled (agent != 1)"));
    hints.push(T("Activer l'agent: `qm set " + t.vmid + " --agent enabled=1`", "Enable the agent: `qm set " + t.vmid + " --agent enabled=1`"));
  }

  // Cloud-init disk presence (ide0/scsi0 with cloudinit)
  const hasCloudInit = (cfg.ide0 && String(cfg.ide0).includes("cloudinit")) ||
                       (cfg.scsi0 && String(cfg.scsi0).includes("cloudinit"));
  if (!hasCloudInit) {
    issues.push(T("Disque cloud-init manquant (ide0/scsi0)", "Missing cloud-init disk (ide0/scsi0)"));
    hints.push(T("Créer un disque cloud-init ou utiliser un template cloud-init officiel", "Create a cloud-init disk or use an official cloud-init template"));
  }

  // scsihw
  if (cfg.scsihw && cfg.scsihw !== "virtio-scsi-pci") {
    hints.push(T("Recommandé: `--scsihw virtio-scsi-pci`", "Recommended: `--scsihw virtio-scsi-pci`"));
  }

  // boot order include net0/scsi0
  if (!cfg.boot || !String(cfg.boot).length) {
    hints.push(T("Définir l'ordre de boot (ex: order=scsi0;net0)", "Set boot order (e.g., order=scsi0;net0)"));
  }

  return { issues, hints };
}

function buildTemplateGuideFR() {
  return (
    "Préparer un template Debian/Ubuntu cloud-init:\n" +
    codeBlock(
      "bash",
      [
        "# Sur la VM (ex: vmid 9000)",
        "apt update",
        "apt install -y qemu-guest-agent cloud-init",
        "systemctl enable --now qemu-guest-agent",
        "cloud-init clean",
        "shutdown -h now",
        "",
        "# Côté Proxmox (sur l'hôte)",
        "qm set 9000 --agent enabled=1",
        "# (optionnel) Créer/attacher disque cloud-init si besoin",
        "# puis marquer en template:",
        "qm template 9000",
      ].join("\n")
    )
  );
}

function buildTemplateGuideEN() {
  return (
    "Prepare a Debian/Ubuntu cloud-init template:\n" +
    codeBlock(
      "bash",
      [
        "# Inside the VM (e.g., vmid 9000)",
        "apt update",
        "apt install -y qemu-guest-agent cloud-init",
        "systemctl enable --now qemu-guest-agent",
        "cloud-init clean",
        "shutdown -h now",
        "",
        "# On Proxmox host",
        "qm set 9000 --agent enabled=1",
        "# (optional) Create/attach cloud-init disk if needed",
        "qm template 9000",
      ].join("\n")
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Vérifie l'environnement et les templates Proxmox / Verify environment & templates"),

  execute: async (interaction) => {
    await interaction.deferReply({ flags: 64 });
    const lang = getUserLang(interaction.user.id, interaction.guildId);
    const isEN = lang === 'en';
    const T = (fr, en) => (isEN ? en : fr);

    // 1) ENV
    const env = hasAllEnv();
    const envStatus = env.ok
      ? T("✅ Variables d'environnement OK", "✅ Environment variables OK")
      : T(`❌ Manque des variables: ${env.missing.join(", ")}`, `❌ Missing variables: ${env.missing.join(", ")}`);

    // 2) Connexion Proxmox
    let nodes = [];
    let pmStatus = "";
    try {
      nodes = await px.nodes();
      pmStatus = T(
        `✅ Proxmox OK — nodes: ${nodes.map(n => n.node || n.id).join(", ")}`,
        `✅ Proxmox OK — nodes: ${nodes.map(n => n.node || n.id).join(", ")}`
      );
    } catch (e) {
      pmStatus = T(`❌ Proxmox KO: ${e.message}`, `❌ Proxmox error: ${e.message}`);
    }

    // 3) Templates
    let templates = [];
    let tmplStatus = "";
    try {
      templates = await collectTemplates();
      if (!templates.length) {
        tmplStatus = T("❌ Aucun template détecté (flag template=1). Voir guide ci‑dessous.", "❌ No template detected (template=1). See guide below.");
      } else {
        tmplStatus = T(`✅ ${templates.length} template(s) détecté(s)`, `✅ ${templates.length} template(s) detected`);
      }
    } catch (e) {
      tmplStatus = T(`❌ Erreur récupération templates: ${e.message}`, `❌ Error fetching templates: ${e.message}`);
    }

    // 4) Analyse de chaque template
    const details = templates.slice(0, 10).map((t) => {
      const { issues, hints } = analyzeTemplate(t, T);
      const title = T(`Node ${t.node} · VMID ${t.vmid}`, `Node ${t.node} · VMID ${t.vmid}`);
      let val = "";
      if (issues.length === 0) {
        val += T("✅ Conforme\n", "✅ Compliant\n");
      } else {
        val += T(`❌ Problèmes: ${issues.join("; ")}\n`, `❌ Issues: ${issues.join("; ")}\n`);
      }
      if (hints.length) {
        val += T(`💡 Astuces: ${hints.join("; ")}`, `💡 Tips: ${hints.join("; ")}`);
      }
      return { name: title, value: val || "-", inline: false };
    });

    const embed = new EmbedBuilder()
      .setTitle(T("🔎 Vérification de l'environnement", "🔎 Environment verification"))
      .addFields(
        { name: "ENV", value: envStatus, inline: false },
        { name: "Proxmox", value: pmStatus, inline: false },
        { name: T("Templates", "Templates"), value: tmplStatus, inline: false },
        ...(details.length ? details : []),
        { name: T("📘 Guide FR", "📘 Guide FR"), value: buildTemplateGuideFR(), inline: false },
        { name: T("📘 Guide EN", "📘 Guide EN"), value: buildTemplateGuideEN(), inline: false },
      )
      .setColor(env.ok && pmStatus.startsWith("✅") ? 0x00cc66 : 0xffaa00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
