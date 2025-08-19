const https = require("https");
const querystring = require("querystring");
const { log } = require("./helpers");
const FormData = require("form-data");

class ProxmoxAPI {
  constructor() {
    this.host = process.env.PVE_HOST;
    this.tokenId = process.env.PVE_TOKENID;
    this.secret = process.env.PVE_SECRET;
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async requestWithRetry(method, path, data = null, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.request(method, path, data);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        log(`Request failed (attempt ${attempt}/${maxRetries}) ${method} ${path}: ${error.message}`, "WARN", "PROXMOX");
        await this.sleep(1500 * attempt);
      }
    }
  }

  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.host);
      const options = {
        method,
        headers: {
          Authorization: `PVEAPIToken=${this.tokenId}=${this.secret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        agent: this.agent,
        timeout: 30000,
      };
      let postData = "";
      if (data && (method === "POST" || method === "PUT")) {
        postData = querystring.stringify(data);
        options.headers["Content-Length"] = Buffer.byteLength(postData);
      }
      const req = https.request(url, options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            if (result.errors) {
              reject(new Error(JSON.stringify(result.errors)));
            } else {
              resolve(result.data || result);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.on("error", reject);
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  async nodes() {
    return this.request("GET", "/api2/json/nodes");
  }

  async getVMs(node) {
    return this.request("GET", `/api2/json/nodes/${node}/qemu`);
  }

  async createVM(node, config) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu`, config);
  }

  async cloneVM(node, vmid, newid, config) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/clone`, {
      newid,
      ...config,
    });
  }

  async migrateVM(node, vmid, target, opts = {}) {
    // opts may include: online=1, with-local-disks=1, target-storage=... etc.
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/migrate`, {
      target,
      ...opts,
    });
  }

  async setVMConfig(node, vmid, config) {
    return this.request("PUT", `/api2/json/nodes/${node}/qemu/${vmid}/config`, config);
  }

  async startVM(node, vmid) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/status/start`);
  }

  async stopVM(node, vmid) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/status/stop`);
  }

  async deleteVM(node, vmid, opts = {}) {
    // Proxmox accepts DELETE with query parameters like purge=1, force=1, destroy-unreferenced-disks=1
    const qs = opts && Object.keys(opts).length ? `?${querystring.stringify(opts)}` : "";
    return this.request("DELETE", `/api2/json/nodes/${node}/qemu/${vmid}${qs}`);
  }

  async getVMStatus(node, vmid) {
    return this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/status/current`);
  }

  async importDisk(node, vmid, source, storage) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/importdisk`, {
      source,
      storage,
    });
  }

  async convertToTemplate(node, vmid) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/template`);
  }

  async agentNetwork(node, vmid) {
    return this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`);
  }

  async getFSInfo(node, vmid) {
    try {
      const result = await this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/agent/get-fsinfo`);
      // Proxmox may return {result: [...]} or just [...]
      return result?.result || result;
    } catch (error) {
      log(`QEMU agent get-fsinfo indisponible pour VM ${vmid}: ${error.message}`, "DEBUG", "PROXMOX");
      return null;
    }
  }

  async getVMConfig(node, vmid) {
    return this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/config`);
  }

  async listSnapshots(node, vmid) {
    return this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/snapshot`);
  }

  async createSnapshot(node, vmid, snapname, description = "") {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/snapshot`, {
      snapname,
      description,
    });
  }

  async deleteSnapshot(node, vmid, snapname) {
    return this.request("DELETE", `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}`);
  }

  async rollbackSnapshot(node, vmid, snapname) {
    return this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`);
  }

  async getNodeCPUInfo(node) {
    try {
      const result = await this.request("GET", `/api2/json/nodes/${node}/status`);
      if (!result?.cpuinfo?.cpus || !result?.cpuinfo?.model) {
        try {
          const systemInfo = await this.request("GET", `/api2/json/nodes/${node}/system`);
          if (systemInfo && systemInfo.cpuinfo) {
            result.cpuinfo = { ...result.cpuinfo, ...systemInfo.cpuinfo };
          }
        } catch (sysError) {
          log(`Impossible de récupérer les infos système pour ${node}: ${sysError.message}`, "DEBUG", "PROXMOX");
        }
      }
      return result;
    } catch (error) {
      log(`Erreur récupération infos CPU node ${node}: ${error.message}`, "WARN", "PROXMOX");
      return null;
    }
  }




  async getVMNetworkInfo(node, vmid) {
    try {
      try {
        const agentData = await this.agentNetwork(node, vmid);
        const interfaces = agentData.result || agentData;
        for (const iface of interfaces) {
          if (iface["ip-addresses"] && iface["ip-addresses"].length > 0) {
            let ipv4Found = null;
            for (const ip of iface["ip-addresses"]) {
              const addr = ip["ip-address"];
              if (addr && !addr.startsWith("127.") && addr !== "::1" && !addr.startsWith("fe80:")) {
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) {
                  log(`IPv4 trouvée via agent QEMU pour VM ${vmid}: ${addr}`, "INFO", "PROXMOX");
                  return { ip: addr, method: "qemu-agent" };
                } else if (!ipv4Found) {
                  ipv4Found = addr;
                }
              }
            }
            if (ipv4Found) {
              log(`IPv6 trouvée via agent QEMU pour VM ${vmid}: ${ipv4Found}`, "INFO", "PROXMOX");
              return { ip: ipv4Found, method: "qemu-agent" };
            }
          }
        }
      } catch (agentError) {
        log(`Agent QEMU non disponible pour VM ${vmid}: ${agentError.message}`, "DEBUG", "PROXMOX");
      }
      try {
        const dhcpLogs = await this.getDHCPLogs(node, vmid);
        if (dhcpLogs) {
          log(`IP trouvée via logs DHCP pour VM ${vmid}: ${dhcpLogs}`, "INFO", "PROXMOX");
          return { ip: dhcpLogs, method: "dhcp-logs" };
        }
      } catch (dhcpError) {
        log(`Logs DHCP non disponibles pour VM ${vmid}: ${dhcpError.message}`, "DEBUG", "PROXMOX");
      }
      try {
        const arpIP = await this.getARPInfo(node, vmid);
        if (arpIP) {
          log(`IP trouvée via table ARP pour VM ${vmid}: ${arpIP}`, "INFO", "PROXMOX");
          return { ip: arpIP, method: "arp-table" };
        }
      } catch (arpError) {
        log(`Table ARP non accessible pour VM ${vmid}: ${arpError.message}`, "DEBUG", "PROXMOX");
      }
      return null;
    } catch (error) {
      log(`Erreur lors de la récupération des infos réseau VM ${vmid}: ${error.message}`, "WARN", "PROXMOX");
      return null;
    }
  }

  async getVMIPv4Info(node, vmid) {
    try {
      try {
        const agentData = await this.agentNetwork(node, vmid);
        const interfaces = agentData.result || agentData;
        for (const iface of interfaces) {
          if (iface["ip-addresses"] && iface["ip-addresses"].length > 0) {
            for (const ip of iface["ip-addresses"]) {
              const addr = ip["ip-address"];
              if (addr && /^(\d{1,3}\.){3}\d{1,3}$/.test(addr) && !addr.startsWith("127.")) {
                log(`IPv4 trouvée pour VM ${vmid}: ${addr}`, "INFO", "PROXMOX");
                return addr;
              }
            }
          }
        }
      } catch (agentError) {
        log(`Agent QEMU non disponible pour VM ${vmid}: ${agentError.message}`, "DEBUG", "PROXMOX");
      }
      try {
        const result = await this.request("GET", `/api2/json/nodes/${node}/network/arp`);
        if (result && result.data) {
          const vmConfig = await this.getVMConfig(node, vmid);
          if (vmConfig && vmConfig.net0) {
            const macMatch = vmConfig.net0.match(/mac=([a-fA-F0-9:]+)/i);
            if (macMatch && macMatch[1]) {
              const mac = macMatch[1];
              const arpEntry = result.data.find(entry => entry.mac === mac);
              if (arpEntry && arpEntry.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(arpEntry.ip)) {
                log(`IPv4 trouvée via ARP pour VM ${vmid}: ${arpEntry.ip}`, "INFO", "PROXMOX");
                return arpEntry.ip;
              }
            }
          }
        }
      } catch (arpError) {
        log(`Table ARP non accessible pour VM ${vmid}: ${arpError.message}`, "DEBUG", "PROXMOX");
      }
      return null;
    } catch (error) {
      log(`Erreur lors de la récupération IPv4 pour VM ${vmid}: ${error.message}`, "WARN", "PROXMOX");
      return null;
    }
  }

  async getDHCPLogs(node, vmid) {
    try {
      const result = await this.request("GET", `/api2/json/nodes/${node}/qemu/${vmid}/monitor`, {
        command: "info network"
      });
      if (result && result.data) {
        const networkInfo = result.data;
        const ipMatch = networkInfo.match(/(?:ip|address)[\s:]+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i);
        if (ipMatch && ipMatch[1]) {
          return ipMatch[1];
        }
      }
      return null;
    } catch (error) {
      log(`Impossible de récupérer les logs DHCP pour VM ${vmid}: ${error.message}`, "DEBUG", "PROXMOX");
      return null;
    }
  }

  async getARPInfo(node, vmid) {
    try {
      const result = await this.request("GET", `/api2/json/nodes/${node}/network/arp`);
      if (result && result.data) {
        const vmConfig = await this.getVMConfig(node, vmid);
        if (vmConfig && vmConfig.net0) {
          const macMatch = vmConfig.net0.match(/mac=([a-fA-F0-9:]+)/i);
          if (macMatch && macMatch[1]) {
            const mac = macMatch[1];
            const arpEntry = result.data.find(entry => entry.mac === mac);
            if (arpEntry && arpEntry.ip) {
              return arpEntry.ip;
            }
          }
        }
      }
      return null;
    } catch (error) {
      log(`Impossible de récupérer la table ARP pour VM ${vmid}: ${error.message}`, "DEBUG", "PROXMOX");
      return null;
    }
  }

  async nextId() {
    const result = await this.request("GET", "/api2/json/cluster/nextid");
    return Number.parseInt(result);
  }

  async imagesStorages(node) {
    const storages = await this.request("GET", `/api2/json/nodes/${node}/storage`);
    return storages.filter((s) => s.content.includes("images"));
  }

  async getNodeStorage(node) {
    return this.request("GET", `/api2/json/nodes/${node}/storage`);
  }

  async resizeDisk(node, vmid, disk, size) {
    return this.request("PUT", `/api2/json/nodes/${node}/qemu/${vmid}/resize`, {
      disk,
      size,
    });
  }

  async unlockVM(node, vmid) {
    try {
      const result = await this.request("DELETE", `/api2/json/nodes/${node}/qemu/${vmid}/unlock`);
      log(`VM ${vmid} unlocked successfully`, "INFO", "PROXMOX");
      return result;
    } catch (error) {
      try {
        await this.request("POST", `/api2/json/nodes/${node}/qemu/${vmid}/unlock`);
        log(`VM ${vmid} unlocked with alternative method`, "INFO", "PROXMOX");
      } catch (altError) {
        log(`Failed to unlock VM ${vmid}: ${error.message}`, "WARN", "PROXMOX");
      }
    }
  }

  async forceUnlockVM(node, vmid) {
    try {
      await this.requestWithRetry("DELETE", `/api2/json/nodes/${node}/qemu/${vmid}/unlock`);
      log(`VM ${vmid} unlocked successfully`, "INFO", "PROXMOX");
      await this.sleep(3000);
      try {
        await this.getVMConfig(node, vmid);
        log(`VM ${vmid} successfully unlocked`, "INFO", "PROXMOX");
      } catch (configError) {
        if (configError.message.includes("lock")) {
          log(`VM ${vmid} still locked, attempting alternative unlock`, "WARN", "PROXMOX");
          // POST unlock typically does not accept a body; retry without extra params
          await this.requestWithRetry("POST", `/api2/json/nodes/${node}/qemu/${vmid}/unlock`);
        }
      }
    } catch (error) {
      log(`Force unlock failed for VM ${vmid}: ${error.message}`, "ERROR", "PROXMOX");
    }
  }

  async createCloudInitFile(node, vmid, content, filename = "user-data") {
    try {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("filename", `${filename}-${vmid}.yml`);
      formData.append("storage", "local");
      formData.append("path", "snippets");
      const result = await this.requestWithRetryLongTimeout(
        "POST",
        `/api2/json/nodes/${node}/storage/local/upload`,
        formData,
        2,
      );
      log(`Cloud-init file ${filename}-${vmid}.yml created successfully`, "INFO", "PROXMOX");
      return `local:snippets/${filename}-${vmid}.yml`;
    } catch (error) {
      log(`Failed to create cloud-init file ${filename}-${vmid}.yml: ${error.message}`, "WARN", "PROXMOX");
      log(`Using inline cloud-init configuration for VM ${vmid}`, "INFO", "PROXMOX");
      return false;
    }
  }

  async requestWithRetryLongTimeout(method, path, data = null, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.requestLongTimeout(method, path, data);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        log(`File upload failed (attempt ${attempt}/${maxRetries}): ${error.message}`, "WARN", "PROXMOX");
        await this.sleep(5000 * attempt);
      }
    }
  }

  async requestLongTimeout(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.host);
      const options = {
        method,
        headers: {
          Authorization: `PVEAPIToken=${this.tokenId}=${this.secret}`,
        },
        agent: this.agent,
        timeout: 60000,
      };
      if (data instanceof FormData) {
        options.headers = {
          ...options.headers,
          ...data.getHeaders(),
        };
      } else if (data && (method === "POST" || method === "PUT")) {
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      const req = https.request(url, options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            if (result.errors) {
              reject(new Error(JSON.stringify(result.errors)));
            } else {
              resolve(result.data || result);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.on("error", reject);
      if (data instanceof FormData) {
        data.pipe(req);
      } else if (data && (method === "POST" || method === "PUT")) {
        const postData = querystring.stringify(data);
        req.write(postData);
      }
      if (!(data instanceof FormData)) {
        req.end();
      }
    });
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async isVMReady(node, vmid, maxTries = 10, delayMs = 20000) {
    log(`Checking if VM ${vmid} is ready...`, "INFO", "PROXMOX");
    for (let i = 0; i < maxTries; i++) {
      try {
        const status = await this.getVMStatus(node, vmid);
        if (status.status !== "running") {
          log(`VM ${vmid} not running yet (${status.status}), attempt ${i + 1}/${maxTries}`, "INFO", "PROXMOX");
          await this.sleep(delayMs);
          continue;
        }
        try {
          await this.agentNetwork(node, vmid);
          log(`VM ${vmid} is ready with QEMU agent responding`, "INFO", "PROXMOX");
          return true;
        } catch (agentError) {
          log(`VM ${vmid} running but agent not ready yet, attempt ${i + 1}/${maxTries}`, "INFO", "PROXMOX");
          if (i < maxTries - 1) {
            await this.sleep(delayMs);
          }
        }
      } catch (error) {
        log(`Error checking VM ${vmid} readiness: ${error.message}`, "WARN", "PROXMOX");
        if (i < maxTries - 1) {
          await this.sleep(delayMs);
        }
      }
    }
    log(`VM ${vmid} not ready after ${maxTries} attempts`, "WARN", "PROXMOX");
    return false;
  }

  async testCloudInitConfig(node, vmid, username, password) {
    try {
      log(`Test de la configuration cloud-init pour VM ${vmid}`, "INFO", "PROXMOX");
      const config = await this.getVMConfig(node, vmid);
      log(`Configuration actuelle VM ${vmid}: ${JSON.stringify(config)}`, "INFO", "PROXMOX");
      if (config.ciuser === username && config.cipassword === password) {
        log(`✅ Configuration cloud-init correcte pour VM ${vmid}`, "INFO", "PROXMOX");
        return true;
      } else {
        log(`❌ Configuration cloud-init incorrecte pour VM ${vmid}`, "WARN", "PROXMOX");
        log(`Attendu: user=${username}, password=${password}`, "WARN", "PROXMOX");
        log(`Trouvé: user=${config.ciuser}, password=${config.cipassword}`, "WARN", "PROXMOX");
        return false;
      }
    } catch (error) {
      log(`Erreur test configuration cloud-init VM ${vmid}: ${error.message}`, "ERROR", "PROXMOX");
      return false;
    }
  }

  async forceCloudInitRegeneration(node, vmid, username, password) {
    try {
      log(`🔧 Force régénération cloud-init pour VM ${vmid}`, "INFO", "PROXMOX");
      try {
        const status = await this.getVMStatus(node, vmid);
        if (status.status === "running") {
          log(`Arrêt de la VM ${vmid} pour régénération cloud-init`, "INFO", "PROXMOX");
          await this.stopVM(node, vmid);
          await this.sleep(5000);
        }
      } catch (stopError) {
        log(`Erreur lors de l'arrêt VM ${vmid}: ${stopError.message}`, "WARN", "PROXMOX");
      }
      await this.setVMConfig(node, vmid, {
        ciuser: username,
        cipassword: password
      });
      log(`Configuration cloud-init forcée pour VM ${vmid}`, "INFO", "PROXMOX");
      await this.sleep(3000);
      log(`Redémarrage de la VM ${vmid}`, "INFO", "PROXMOX");
      await this.startVM(node, vmid);
      return true;
    } catch (error) {
      log(`Erreur force régénération cloud-init VM ${vmid}: ${error.message}`, "ERROR", "PROXMOX");
      return false;
    }
  }

  async testSSHConnection(ip, username, password, maxRetries = 5) {
    const { Client } = require('ssh2');
    log(`🧪 Test de connexion SSH COMPLET vers ${username}@${ip}`, "INFO", "PROXMOX");
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log(`Tentative SSH ${attempt}/${maxRetries} vers ${ip}`, "INFO", "PROXMOX");
        const userConnection = await new Promise((resolve, reject) => {
          const conn = new Client();
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              conn.end();
              reject(new Error("Timeout de connexion utilisateur"));
            }
          }, 5000);
          conn.on('ready', () => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              conn.end();
              resolve(true);
            }
          });
          conn.on('error', (err) => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });
          conn.connect({
            host: ip,
            port: 22,
            username: username,
            password: password,
            readyTimeout: 5000,
            keepaliveInterval: 1000
          });
        });
        log(`✅ Connexion utilisateur ${username} réussie`, "INFO", "PROXMOX");
        const sudoTest = await new Promise((resolve, reject) => {
          const conn = new Client();
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              conn.end();
              reject(new Error("Timeout test sudo"));
            }
          }, 10000);
          conn.on('ready', () => {
            clearTimeout(timeout);
            conn.exec('sudo su -c "whoami"', (err, stream) => {
              if (err) {
                if (!resolved) {
                  resolved = true;
                  conn.end();
                  reject(err);
                }
                return;
              }
              let output = '';
              stream.on('data', (data) => {
                output += data.toString();
              });
              stream.on('close', (code) => {
                clearTimeout(timeout);
                if (!resolved) {
                  resolved = true;
                  conn.end();
                  if (code === 0 && output.trim() === 'root') {
                    log(`✅ Test sudo su RÉUSSI - L'utilisateur peut devenir root !`, "INFO", "PROXMOX");
                    resolve(true);
                  } else {
                    log(`❌ Test sudo su échoué - Code: ${code}, Output: ${output.trim()}`, "WARN", "PROXMOX");
                    reject(new Error(`Sudo test échoué - Code: ${code}`));
                  }
                }
              });
              stream.on('error', (err) => {
                clearTimeout(timeout);
                if (!resolved) {
                  resolved = true;
                  conn.end();
                  reject(err);
                }
              });
            });
          });
          conn.on('error', (err) => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });
          conn.connect({
            host: ip,
            port: 22,
            username: username,
            password: password,
            readyTimeout: 5000,
            keepaliveInterval: 1000
          });
        });
        log(`🎯 TOUS LES TESTS SSH RÉUSSIS pour ${username}@${ip}`, "INFO", "PROXMOX");
        return {
          success: true,
          attempts: attempt,
          userConnection: true,
          sudoTest: true,
          message: "Connexion utilisateur ET sudo su fonctionnent parfaitement !"
        };
      } catch (error) {
        log(`❌ Erreur SSH tentative ${attempt}: ${error.message}`, "WARN", "PROXMOX");
        if (attempt < maxRetries) {
          log(`Nouvelle tentative dans 3 secondes...`, "INFO", "PROXMOX");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    log(`❌ Échec de la connexion SSH après ${maxRetries} tentatives`, "ERROR", "PROXMOX");
    return {
      success: false,
      error: `Échec après ${maxRetries} tentatives`,
      userConnection: false,
      sudoTest: false
    };
  }
}

module.exports = new ProxmoxAPI();
