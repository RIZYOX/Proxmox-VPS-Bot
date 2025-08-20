### 📏 Disk resize rules (/vps resize_disk)
- Unit required: `K/M/G/T`.
- Accepted formats: `+4G`, `4G`, `+512M`.
- `+N<U>` = growth (e.g., `+4G`).
- `N<U>` without `+` = absolute target: if greater than current, converted to delta; if ≤ current → error (shrinking unsupported).
- `+4` or `4` → error: missing unit (add `G/M/K/T`).
- Negative values → rejected.
### 📏 Règles de redimensionnement disque (/vps resize_disk)
- Unité obligatoire: `K/M/G/T`.
- Formats acceptés: `+4G`, `4G`, `+512M`.
- `+N<U>` = croissance (ex: `+4G`).
- `N<U>` sans `+` = cible absolue: si plus grand que l’actuel, converti en delta; si ≤ actuel → erreur (Proxmox n’autorise pas la réduction).
- `+4` ou `4` → erreur: unité manquante (ajoutez `G/M/K/T`).
- Valeurs négatives → interdites.

# EZ VPS Bot 💠 Discord → Proxmox + SSH
 
 Bilingue: FR | EN
 
 ---
 
 ## 🇫🇷 Français
 
 ### ✨ Présentation
 - Crée et gère vos VPS Proxmox directement depuis Discord.
 - Exécute des commandes SSH (sudo, pipes, multi‑lignes, PTY).
 - Sécurisé: suppression des messages texte contenant des mots de passe.
 
 ### 🧰 Fonctionnalités
 - Assistant de création VPS (cloud‑init)
 - Liste / statut / actions (start | stop | restart)
 - SSH avec:
   - bash -lc (pipes, &&, redirections, env)
   - PTY activé
   - sudo -S auto si pas root + bouton « Devenir root »
   - Modal multi‑lignes
   - Timeouts auto et personnalisables
   - Troncature propre pour Discord
 
 ### ⚙️ Installation
 **Prérequis**
 - Node.js 18+
 - Accès API Proxmox (token)
 - Bot Discord (token)
 
 **Configuration `.env`**
 ```env
 DISCORD_TOKEN=...
 PVE_HOST=https://votre-proxmox:8006
 PVE_TOKENID=username@pam!tokenname
 PVE_SECRET=tokenvalue
 ALLOWED_USERS=1234567890,0987654321
 ```
 
 **Installer et lancer**
 ```bash
 npm install
 node index.js
 ```
 
 ### 🧾 Commandes Discord
 - `/createvps` — Assistant de création
 - `/vps list` — Liste les VPS
 - `/vps status vmid:<id>` — Statut d’une VM
 - `/vps action vmid:<id> type:<start|stop|restart|delete>` — Action VM
 - `/vps clone vmid:<src> newid:<id> [name:<str>] [target_node:<node>] [mode:<full|linked>] [storage:<storage>]` — Cloner une VM
 - `/vps resize_disk vmid:<id> disk:<scsi0|virtio0|sata0|ide0> size:<+4G|20G|512M>` — Agrandir un disque
 - `/vps adjust_resources vmid:<id> cpu_cores:<n> memory_mb:<mb>` — Ajuster CPU/RAM
 - `/vps migrate vmid:<id> target_node:<node> [online:<true|false>]` — Migrer une VM
 - `/vps snapshot create|list|delete|rollback ...` — Gérer les snapshots
 - `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]`
 - `/verify` — Vérifie ENV, accès Proxmox, templates
 - `/stats-all` — Statistiques globales
 - `/authorize userid:<id>` — Autoriser un utilisateur (admin)
 - `/help` — Aide bilingue FR/EN
 
 ### ⌨️ Raccourci texte (sécurité incluse)
 Dans un salon:
 ```text
 vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'
 ```
 Le message source est supprimé automatiquement.
 
 ### 🖥️ SSH interactif (embed)
 Sans `cmd`, un embed propose:
 - Nouvelle commande (modal multi‑lignes)
 - Devenir root (équivaut à `sudo -i`, persistant)
 - Raccourcis (statut / processus / disque / réseau)
 - Fermer session
 
 ### 🔐 Sudo & root
 - Si vous n’êtes pas root, cliquez « Devenir root » ou préfixez par `sudo ...` (le bot fournit le mot de passe via `sudo -S`).
 - Exemples:
   ```bash
   sudo systemctl status nginx --no-pager | head -80
   sudo apt update && sudo apt install -y htop
   ```
 
 ### ⏱️ Timeouts et sorties
 - Auto: 60s (classiques), 15min (install/update/systemctl/journalctl/&&/||)
 - Personnalisé: ajoutez `#timeout=900` (secondes) à la fin
 - Limiter la sortie: `| head -200`
 - L’embed tronque vers ~1500 caractères pour Discord
 
 ### 📚 Exemples utiles
 ```bash
 uname -a && (lsb_release -a || cat /etc/os-release)
 df -h | head -50
 ip -br a && ss -tuln | head -50
 systemctl status nginx --no-pager | head -80
 journalctl -u ssh --no-pager -n 200
 ```
 
 ### 🧪 Vérifier l’environnement (/verify)
 Vérifie: variables .env, accès API Proxmox, templates (`template=1`) et problèmes fréquents (Agent QEMU, disque cloud‑init, boot).
 L’embed inclut un guide FR/EN pour créer un template valide.
 
 ### 🧱 Préparer un template cloud‑init (Debian/Ubuntu)
 Dans la VM (ex: 9000):
 ```bash
 apt update
 apt install -y qemu-guest-agent cloud-init
 systemctl enable --now qemu-guest-agent
 cloud-init clean
 shutdown -h now
 ```
 Sur Proxmox:
 ```bash
 qm set 9000 --agent enabled=1
 # (optionnel) Ajouter un disque cloud‑init si nécessaire
 qm template 9000
 ```
 Astuce JSON rapide (diagnostic):
 ```bash
 qm config 9000 | awk -F': ' '{print " \"" $1 "\": \"" $2 "\","}' | sed '$ s/,$//' | sed '1s/^/{\n/;$a}'
 ```
 
 ### ⚠️ Limitations
 - Les TUIs plein écran (vim, nano, top, htop, less interactif) ne sont pas idéales via exec. Utilisez un vrai client SSH, ou un TTY web.
 
 ---
 
 ## 🇬🇧 English
 
 ### ✨ Overview
 - Create and manage Proxmox VPS from Discord.
 - SSH runner with sudo, pipes, multi-line, and PTY.
 - Safeguard: deletes text messages containing passwords.
 
 ### 🧰 Features
 - Guided VPS creation (cloud‑init)
 - List / status / actions
 - SSH with bash -lc, PTY, sudo -S, persistent root, custom timeouts, truncation.
 
 ### ⚙️ Setup
 **Environment file**
 ```env
 DISCORD_TOKEN=...
 PVE_HOST=https://your-proxmox:8006
 PVE_TOKENID=username@pam!tokenname
 PVE_SECRET=tokenvalue
 ALLOWED_USERS=1234567890,0987654321
 ```
 
 **Install & run**
 ```bash
 npm install
 node index.js
 ```
 
 ### 🧾 Commands
 - `/createvps`
 - `/vps list | status | action | delete`
 - `/vps clone vmid:<src> newid:<id> [name:<str>] [target_node:<node>] [mode:<full|linked>] [storage:<storage>]`
 - `/vps resize_disk vmid:<id> disk:<scsi0|virtio0|sata0|ide0> size:<+4G|20G|512M>`
 - `/vps adjust_resources vmid:<id> cpu_cores:<n> memory_mb:<mb>`
 - `/vps migrate vmid:<id> target_node:<node> [online:<true|false>]`
 - `/vps snapshot create|list|delete|rollback ...`
 - `/vps ssh ip:<ip> user:<user> password:<pass> [port:<22>] [cmd:<...>]`
 - `/verify`
 - `/stats-all`
 - `/authorize userid:<id>`
 - `/help`
 
 ### ⌨️ Text shortcut
 ```text
 vps ssh ip:1.2.3.4 user:root password:'pass' port:22 cmd:'uname -a'
 ```
 Source message is deleted for safety.
 
 ### 🔐 Sudo & root
 - Become root button (`sudo -i` persistence) or prefix with `sudo` (password via `sudo -S`).
 - Timeouts: auto 60s/15min, override with `#timeout=900`.
 - Limit output with `| head -200`.
 
 ### 🧱 Template checklist (cloud‑init)
 - Inside VM: install qemu‑guest‑agent + cloud‑init, enable agent, cloud‑init clean, shutdown.
 - On Proxmox: `qm set <vmid> --agent enabled=1`, then `qm template <vmid>`.
 
 ### ⚠️ Limitations
 - Not suited for full‑screen TUIs; use a real SSH client or a web TTY.

## 📸 Captures d'écran / Screenshots
 
 - __Création terminée / Creation completed__
   
   ![Création de VPS terminée](img/image1.png)
   
   _FR: Message de confirmation après création du VPS._  
   _EN: Confirmation message once the VPS is created._
 
 - __Création en cours / Creation in progress__
   
   ![VPS en cours de création](img/image2.png)
   
   _FR: Le VPS est en cours de création (commande déjà exécutée)._  
   _EN: VPS is being created (command already executed)._ 
 
 - __Aperçu de commandes / Commands overview__
   
   ![Commandes diverses 1](img/image3.png)
   
   _FR: Plusieurs commandes affichées._  
   _EN: Many commands shown._
 
 - __Aperçu de commandes / Commands overview__
   
   ![Commandes diverses 2](img/image4.png)
   
   _FR: Plusieurs commandes affichées._  
   _EN: Many commands shown._
 
 - __Aperçu de commandes / Commands overview__
   
   ![Commandes diverses 3](img/image5.png)
   
   _FR: Plusieurs commandes affichées._  
   _EN: Many commands shown._
 
 - __Statistiques globales / Global statistics__
   
   ![Statistiques Proxmox (stats-all)](img/image6.png)
   
   _FR: Commande `stats-all` listant toutes les statistiques Proxmox._  
   _EN: `stats-all` command listing global Proxmox statistics._
 
 - __Liste des VPS / VPS list__
   
   ![Liste des VPS](img/image7.png)
   
   _FR: Commande listant les VPS._  
   _EN: Command showing the list of VPS._

---
 
## 🧑‍⚖️ License / Licence

### 🇫🇷 Licence (Tous droits réservés)
- Ce projet est propriétaire et non libre. Tous droits réservés 2025 RIZYOX.
- Il est interdit de copier, reproduire, modifier, publier, distribuer ou créer des œuvres dérivées sans l’accord écrit préalable du créateur.
- Pour toute demande de licence/accord, contactez le propriétaire.

### 🇬🇧 License (All rights reserved)
- This project is proprietary and not open source. All rights reserved 2025 RIZYOX.
- You may not copy, reproduce, modify, publish, distribute, or create derivative works without prior written permission from the creator.
- For licensing inquiries/permission, please contact the owner.

See `LICENSE` for full terms.
