(function(){
  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  let token = '';
  const LS_TOKEN = 'panel_token';
  function parseQuery(){ try{ return new URLSearchParams(location.search); }catch{ return new URLSearchParams(''); } }
  function setToken(tok){ token = tok || ''; try{ if(token) localStorage.setItem(LS_TOKEN, token); else localStorage.removeItem(LS_TOKEN); }catch{} updateTokenUI(); }
  function initToken(){
    // priority: URL ?token=... > localStorage > window.PANEL_TOKEN
    const q = parseQuery();
    const qtok = q.get('token');
    if(qtok){ setToken(qtok); return; }
    try{ const st = localStorage.getItem(LS_TOKEN); if(st){ setToken(st); return; } }catch{}
    setToken(window.PANEL_TOKEN || '');
  }
  function updateTokenUI(){ const el = qs('#token-label'); if(!el) return; el.textContent = 'Token' + (token? ' • Set' : ' • Missing'); }

  // i18n
  const LS_KEY = 'panel_lang';
  const supported = ['fr','en'];
  let lang = (localStorage.getItem(LS_KEY) || (navigator.language||'fr').slice(0,2) || 'fr');
  if(!supported.includes(lang)) lang = 'fr';

  const I18N = {
    fr: {
      title: 'Proxmox VPS Panel',
      subtitle: 'Gérez vos VMs Proxmox rapidement et en sécurité.',
      filterPh: 'Filtrer par nom/vmid/statut…',
      refresh: 'Rafraîchir',
      create: 'Créer un VPS',
      count: (n)=> n===0? 'Aucune VM' : (n===1? '1 VM' : `${n} VMs`),
      empty: 'Aucun résultat. Ajustez le filtre ou créez un VPS.',
      createTitle: 'Créer un VPS',
      lblNode: 'Node',
      lblTemplate: 'Template',
      lblStorage: 'Stockage',
      lblName: 'Nom',
      lblCores: 'Cœurs',
      lblRam: 'RAM (Mo)',
      lblDisk: 'Disque (Go)',
      lblUser: 'Utilisateur',
      lblPass: 'Mot de passe',
      cancel: 'Annuler',
      submit: 'Créer',
      createOk: (vmid)=>`VPS créé (VMID ${vmid}). Démarrage en cours…`,
      createErr: (m)=>`Échec de création: ${m}`,
      fetchErr: 'Chargement impossible',
      thVmid: 'VMID', thName: 'Nom', thNode: 'Node', thStatus: 'Statut', thCPU: 'CPU', thRAM: 'RAM', thActions: 'Actions',
      start: 'Démarrer', stop: 'Arrêter', restart: 'Redémarrer', delete: 'Supprimer',
      confirmDelete: (vmid)=>`Supprimer la VM ${vmid} ?`,
      running: 'en cours', stopped: 'arrêtée', unknown: 'inconnu',
      healthOk: (v)=>`OK v${v}`,
      healthErr: 'Erreur de statut',
      loadFail: (m)=>`Échec du chargement des VMs : ${m}`,
      footer: 'Local seulement • Non redistribuable • Source-disponible usage privé',
      // Stats labels
      statsTotal: 'VMs totales',
      statsRunning: 'En marche',
      statsStopped: 'Arrêtées',
      statsCPU: 'CPU Cluster',
      statsCores: 'CPU (utilisé/total)',
      statsRAM: 'RAM Cluster',
      statsDisk: 'Disque Cluster',
      // Activity / Logs
      activity: 'Activité',
      activityClear: 'Vider',
      activityEmpty: 'Aucune activité pour le moment.',
      activityStarted: (m)=>`Démarré : ${m}`,
      activityOK: (m)=>`Succès : ${m}`,
      activityERR: (m)=>`Erreur : ${m}`,
      // Advanced actions
      moreResize: 'Redimensionner disque',
      moreResizeTitle: 'Redimensionner le disque',
      moreAdjust: 'Ajuster CPU/RAM',
      moreAdjustTitle: 'Ajuster les ressources',
      moreSnapshots: 'Snapshots',
      moreSnapshotsTitle: 'Snapshots',
      moreMigrate: 'Migrer',
      moreMigrateTitle: 'Migrer la VM',
      moreUnlock: 'Déverrouiller',
      moreUnlockTitle: 'Déverrouiller la VM',
      moreIP: 'Voir IP',
      moreIPTitle: 'IP de la VM',
      fDisk: 'Taille (ex: +10G ou 30G)',
      fCores: 'Cœurs',
      fRAM: 'RAM (Mo)',
      fSnapName: 'Nom du snapshot',
      rollback: 'Restaurer',
      noSnaps: 'Aucun snapshot',
      unlockHelp: 'Forcer le déverrouillage si la VM est bloquée.',
      ipFetching: 'Récupération de l’IP…',
      nothingToDo: 'Rien à ajuster'
    },
    en: {
      title: 'Proxmox VPS Panel',
      subtitle: 'Manage your Proxmox VMs quickly and safely.',
      filterPh: 'Filter by name/vmid/status…',
      refresh: 'Refresh',
      create: 'Create VPS',
      count: (n)=> n===0? 'No VMs' : (n===1? '1 VM' : `${n} VMs`),
      empty: 'No results. Adjust filter or create a VPS.',
      createTitle: 'Create VPS',
      lblNode: 'Node',
      lblTemplate: 'Template',
      lblStorage: 'Storage',
      lblName: 'Name',
      lblCores: 'Cores',
      lblRam: 'RAM (MB)',
      lblDisk: 'Disk (GB)',
      lblUser: 'User',
      lblPass: 'Password',
      cancel: 'Cancel',
      submit: 'Create',
      createOk: (vmid)=>`VPS created (VMID ${vmid}). Starting…`,
      createErr: (m)=>`Creation failed: ${m}`,
      fetchErr: 'Failed to load',
      thVmid: 'VMID', thName: 'Name', thNode: 'Node', thStatus: 'Status', thCPU: 'CPU', thRAM: 'RAM', thActions: 'Actions',
      start: 'Start', stop: 'Stop', restart: 'Restart', delete: 'Delete',
      confirmDelete: (vmid)=>`Delete VM ${vmid}?`,
      running: 'running', stopped: 'stopped', unknown: 'unknown',
      healthOk: (v)=>`OK v${v}`,
      healthErr: 'Health error',
      loadFail: (m)=>`Failed to load VMs: ${m}`,
      footer: 'Local only • Non-redistributable • Source-available for private use',
      // Stats labels
      statsTotal: 'Total VMs',
      statsRunning: 'Running',
      statsStopped: 'Stopped',
      statsCPU: 'Cluster CPU',
      statsCores: 'CPU (used/total)',
      statsRAM: 'Cluster RAM',
      statsDisk: 'Cluster Disk',
      // Activity / Logs
      activity: 'Activity',
      activityClear: 'Clear',
      activityEmpty: 'No activity yet.',
      activityStarted: (m)=>`Started: ${m}`,
      activityOK: (m)=>`Success: ${m}`,
      activityERR: (m)=>`Error: ${m}`,
      // Advanced actions
      moreResize: 'Resize disk',
      moreResizeTitle: 'Resize Disk',
      moreAdjust: 'Adjust CPU/RAM',
      moreAdjustTitle: 'Adjust Resources',
      moreSnapshots: 'Snapshots',
      moreSnapshotsTitle: 'Snapshots',
      moreMigrate: 'Migrate',
      moreMigrateTitle: 'Migrate VM',
      moreUnlock: 'Unlock',
      moreUnlockTitle: 'Unlock VM',
      moreIP: 'View IP',
      moreIPTitle: 'VM IP',
      fDisk: 'Size (e.g., +10G or 30G)',
      fCores: 'Cores',
      fRAM: 'RAM (MB)',
      fSnapName: 'Snapshot name',
      rollback: 'Rollback',
      noSnaps: 'No snapshots',
      unlockHelp: 'Force unlock this VM if it is stuck with a lock.',
      ipFetching: 'Fetching IP…',
      nothingToDo: 'Nothing to adjust',
    }
  };
  const t = (k, ...a) => {
    const v = I18N[lang][k];
    return typeof v === 'function' ? v(...a) : v;
  };

  // Toasts & Activity Log
  const logs = [];
  let logCounter = 0;
  function fmtTime(d){
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function renderLogs(){
    const list = qs('#activity-list'); if(!list) return;
    const empty = qs('#activity-empty');
    list.innerHTML = '';
    if(logs.length===0){ if(empty) empty.removeAttribute('hidden'); return; }
    if(empty) empty.setAttribute('hidden','');
    logs.forEach(l=>{
      const el = document.createElement('div');
      el.className = 'log-item';
      el.innerHTML = `<div class="log-time">${fmtTime(l.time)}</div>
        <div class="log-title">${l.title}${l.detail? `<div class='muted'>${l.detail}</div>`:''}</div>
        <div class="spacer"></div>
        <span class="tag ${l.status}">${l.status}</span>`;
      list.appendChild(el);
    });
  }
  function addLog(title, status='pending', detail=''){
    const id = ++logCounter;
    logs.unshift({ id, time:new Date(), title, status, detail });
    renderLogs();
    return id;
  }
  function updateLog(id, status, detail){
    const it = logs.find(x=>x.id===id);
    if(!it) return;
    it.status = status;
    if(detail!=null) it.detail = detail;
    renderLogs();
  }
  function toast(msg, type='ok', small){
    const box = qs('#toasts'); if(!box) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${msg}${small? `<span class="small">${small}</span>`:''}`;
    box.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 4200);
  }

  function applyI18n(){
    document.documentElement.lang = lang;
    const titleEl = qs('#title'); if(titleEl) titleEl.textContent = t('title');
    const subtitle = qs('#subtitle'); if(subtitle) subtitle.textContent = t('subtitle');
    const createLabel = qs('#create-label'); if(createLabel) createLabel.textContent = t('create');
    const filter = qs('#filter'); if(filter) filter.placeholder = t('filterPh');
    const btn = qs('#refresh'); if(btn) btn.textContent = t('refresh');
    const th = (id,key)=>{ const el=qs(id); if(el) el.textContent = t(key); };
    th('#th-vmid','thVmid'); th('#th-name','thName'); th('#th-node','thNode'); th('#th-status','thStatus'); th('#th-cpu','thCPU'); th('#th-ram','thRAM'); th('#th-actions','thActions');
    const footer = qs('#footer-text'); if(footer) footer.textContent = t('footer');
    // Stats labels
    const sMap = [
      ['#stats-label-total','statsTotal'],
      ['#stats-label-running','statsRunning'],
      ['#stats-label-stopped','statsStopped'],
      ['#stats-label-cpu','statsCPU'],
      ['#stats-label-cores','statsCores'],
      ['#stats-label-ram','statsRAM'],
      ['#stats-label-disk','statsDisk'],
    ];
    for(const [sel,key] of sMap){ const el = qs(sel); if(el) el.textContent = t(key); }
    qsa('.lang-switch .lang').forEach(b=>{
      b.classList.toggle('active', b.getAttribute('data-lang')===lang);
    });
    // Activity labels
    const al = qs('#activity-label'); if(al) al.textContent = t('activity');
    const at = qs('#activity-title'); if(at) at.textContent = t('activity');
    const ac = qs('#activity-clear'); if(ac) ac.textContent = t('activityClear');
    const ae = qs('#activity-empty'); if(ae) ae.textContent = t('activityEmpty');
    updateTokenUI();

    // Modal labels (Create VPS)
    const map = [
      ['#create-title','createTitle'],
      ['#lbl-node','lblNode'],
      ['#lbl-template','lblTemplate'],
      ['#lbl-storage','lblStorage'],
      ['#lbl-name','lblName'],
      ['#lbl-cores','lblCores'],
      ['#lbl-ram','lblRam'],
      ['#lbl-disk','lblDisk'],
      ['#lbl-user','lblUser'],
      ['#lbl-pass','lblPass'],
      ['#create-cancel','cancel'],
      ['#create-submit','submit']
    ];
    for(const [sel,key] of map){ const el = qs(sel); if(el) el.textContent = t(key); }
  }

  // Reusable Action Modal
  const actionModal = qs('#actionModal');
  const actionTitle = qs('#action-title');
  const actionContent = qs('#action-content');
  const actionError = qs('#action-error');
  const actionSubmit = qs('#action-submit');
  let currentAction = null; // { type, vm }

  const aOpen = ()=> actionModal && actionModal.setAttribute('aria-hidden','false');
  const aClose = ()=>{ if(actionModal){ actionModal.setAttribute('aria-hidden','true'); actionError?.setAttribute('hidden',''); actionContent.innerHTML=''; currentAction=null; } };
  qs('#action-close')?.addEventListener('click', aClose);
  qs('#action-cancel')?.addEventListener('click', aClose);

  function aErr(msg){ if(actionError){ actionError.textContent = msg; actionError.removeAttribute('hidden'); } }

  function openActionModal(type, vm){
    currentAction = { type, vm };
    buildActionUI(type, vm);
    aOpen();
  }

  function field(label, id, attrs){
    return `<label><span>${label}</span><input id="${id}" ${attrs||''}/></label>`;
  }

  async function buildActionUI(type, vm){
    actionError?.setAttribute('hidden','');
    if(type==='resize'){
      actionTitle.textContent = t('moreResizeTitle')||'Resize Disk';
      actionContent.innerHTML = `<div class="grid">${field(t('fDisk')||'Disk (e.g., +10G or 30G)','a-size','type="text" placeholder="+10G"')}</div>`;
      // Fetch current disk size to help user
      try {
        const cfg = await api(`/api/vm/${vm.vmid}/config`);
        const pref = ['scsi0','virtio0','sata0','ide0'];
        let sizeStr = null, diskKey = null;
        for (const k of pref) {
          if (cfg?.disks?.[k]) { diskKey = k; sizeStr = cfg.disks[k].size || null; break; }
        }
        if (sizeStr) {
          // Normalize like 30G or 30720M -> display in GB
          let gbHint = sizeStr;
          const m = /^([0-9.]+)\s*([GMK])?B?$/i.exec(sizeStr);
          if (m) {
            const val = parseFloat(m[1]);
            const unit = (m[2]||'G').toUpperCase();
            let gb = val;
            if (unit === 'M') gb = val / 1024;
            if (unit === 'K') gb = val / (1024*1024);
            gbHint = `${Math.round(gb)}G`;
          }
          const input = qs('#a-size');
          if (input) input.placeholder = `+10G (current: ${gbHint}${diskKey?` • ${diskKey}`:''})`;
        }
      } catch(_) {}
      actionSubmit.onclick = async ()=>{
        const size = qs('#a-size').value.trim(); if(!size) return aErr(t('fetchErr'));
        try{ await api(`/api/vm/${vm.vmid}/resize-disk`, { method:'POST', body: JSON.stringify({ size }) }); aClose(); await load(); }catch(e){ aErr(e.message); }
      };
    } else if(type==='adjust'){
      actionTitle.textContent = t('moreAdjustTitle')||'Adjust Resources';
      actionContent.innerHTML = `<div class="grid">${field(t('fCores')||'Cores','a-cores','type="number" min="1" step="1"')}${field(t('fRAM')||'RAM (MB)','a-ram','type="number" min="256" step="128"')}</div>`;
      // Prefill with current config
      try {
        const cfg = await api(`/api/vm/${vm.vmid}/config`);
        const iC = qs('#a-cores'); if (iC && Number.isFinite(Number(cfg?.cores))) iC.value = Number(cfg.cores);
        const iR = qs('#a-ram'); if (iR && Number.isFinite(Number(cfg?.memory))) iR.value = Number(cfg.memory);
      } catch(_) {}
      actionSubmit.onclick = async ()=>{
        const cores = Number(qs('#a-cores').value||''); const memory = Number(qs('#a-ram').value||'');
        const body = {}; if(cores) body.cores = cores; if(memory) body.memory = memory; if(!Object.keys(body).length) return aErr(t('nothingToDo')||'Nothing to adjust');
        try{ await api(`/api/vm/${vm.vmid}/adjust`, { method:'POST', body: JSON.stringify(body) }); aClose(); await load(); }catch(e){ aErr(e.message); }
      };
    } else if(type==='snapshots'){
      actionTitle.textContent = t('moreSnapshotsTitle')||'Snapshots';
      // Load list
      actionContent.innerHTML = `<div id="snaps" class="grid"></div><hr style="opacity:.1;margin:12px 0;"/><div class="grid">${field(t('fSnapName')||'Name','a-snap','type="text" placeholder="snapshot-1"')}</div>`;
      try{
        const data = await api(`/api/vm/${vm.vmid}/snapshots`);
        const box = qs('#snaps'); box.innerHTML = '';
        if((data.items||[]).length===0){ box.innerHTML = `<div class="muted">${t('noSnaps')||'No snapshots'}</div>`; }
        (data.items||[]).forEach(s=>{
          const row = document.createElement('div');
          row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div><strong>${s.name}</strong> <small class="muted">${s.description||''}</small></div>
            <div style="display:flex;gap:8px">
              <button data-snap="${s.name}" data-act="rollback">${t('rollback')||'Rollback'}</button>
              <button class="danger" data-snap="${s.name}" data-act="delete">${t('delete')}</button>
            </div>
          </div>`;
          row.querySelectorAll('button').forEach(b=>{
            b.addEventListener('click', async ()=>{
              const snap = b.getAttribute('data-snap'); const act = b.getAttribute('data-act');
              try{
                if(act==='rollback') await api(`/api/vm/${vm.vmid}/rollback`, { method:'POST', body: JSON.stringify({ snap }) });
                else if(act==='delete') await api(`/api/vm/${vm.vmid}/snapshot/${encodeURIComponent(snap)}`, { method:'DELETE' });
                buildActionUI('snapshots', vm);
              }catch(e){ aErr(e.message); }
            });
          });
          qs('#snaps').appendChild(row);
        });
      }catch(e){ aErr(e.message); }
      actionSubmit.onclick = async ()=>{
        const name = qs('#a-snap').value.trim(); if(!name) return aErr(t('fetchErr'));
        try{ await api(`/api/vm/${vm.vmid}/snapshot`, { method:'POST', body: JSON.stringify({ name }) }); buildActionUI('snapshots', vm); }catch(e){ aErr(e.message); }
      };
    } else if(type==='migrate'){
      actionTitle.textContent = t('moreMigrateTitle')||'Migrate VM';
      try{
        const nodes = await api('/api/nodes');
        actionContent.innerHTML = `<div class="grid"><label><span>${t('lblNode')||'Node'}</span><select id="a-target"></select></label></div>`;
        const sel = qs('#a-target'); sel.innerHTML='';
        nodes.items.forEach(n=>{ if(n.node!==vm.node){ const o=document.createElement('option'); o.value=n.node; o.textContent=n.node; sel.appendChild(o); } });
      }catch(e){ aErr(e.message); }
      actionSubmit.onclick = async ()=>{
        const target = qs('#a-target').value; if(!target) return aErr(t('fetchErr'));
        try{ await api(`/api/vm/${vm.vmid}/migrate`, { method:'POST', body: JSON.stringify({ target }) }); aClose(); await load(); }catch(e){ aErr(e.message); }
      };
    } else if(type==='unlock'){
      actionTitle.textContent = t('moreUnlockTitle')||'Unlock VM';
      actionContent.innerHTML = `<div class="muted">${t('unlockHelp')||'Force unlock this VM if it is stuck with a lock.'}</div>`;
      actionSubmit.onclick = async ()=>{
        try{ await api(`/api/vm/${vm.vmid}/unlock`, { method:'POST' }); aClose(); await load(); }catch(e){ aErr(e.message); }
      };
    } else if(type==='ip'){
      actionTitle.textContent = t('moreIPTitle')||'VM IP';
      actionContent.innerHTML = `<div class="muted">${t('ipFetching')||'Fetching IP...'}</div>`;
      try{ const r = await api(`/api/vm/${vm.vmid}/ip`); actionContent.innerHTML = `<div><strong>IPv4:</strong> ${r.ip||'-'}</div>`; }
      catch(e){ aErr(e.message); }
      actionSubmit.onclick = ()=> aClose();
    }
  }

  async function doDelete(vmid){
    try { await api(`/api/vm/${vmid}/action`, { method:'POST', body: JSON.stringify({ action:'delete' }) }); await load(); } catch(e){ toast(e.message, 'err'); }
  }

  function setHealth(text){ const el = qs('#health'); if(el) el.textContent = text; }

  async function api(path, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    if(token){ headers['x-panel-token'] = token; }
    const method = String((opts.method||'GET')).toUpperCase();
    let logId = null;
    if(method !== 'GET'){
      logId = addLog(t('activityStarted', `${method} ${path}`), 'pending');
    }
    try{
      const res = await fetch(path, Object.assign({}, opts, { headers }));
      const data = await res.json().catch(()=>({ ok:false, error:'bad json' }));
      if(!res.ok){ throw new Error(data.error || res.statusText); }
      if(logId){ updateLog(logId, 'ok'); toast(t('activityOK', `${method} ${path}`), 'ok'); }
      return data;
    }catch(e){
      if(logId){ updateLog(logId, 'err', e.message); }
      toast(t('activityERR', e.message), 'err', `${method} ${path}`);
      throw e;
    }
  }

  function fmtBytes(b){ if(!Number.isFinite(b)) return '-'; const u=['B','KB','MB','GB','TB']; let i=0, n=b; while(n>=1024 && i<u.length-1){ n/=1024; i++; } return `${n.toFixed(1)} ${u[i]}`; }

  function renderStats(stats){
    const tot = qs('#stats-total'); const run = qs('#stats-running'); const stop = qs('#stats-stopped');
    const cpu = qs('#stats-cpu'); const cores = qs('#stats-cores'); const ram = qs('#stats-ram'); const disk = qs('#stats-disk');
    if(stats && stats.totals){
      tot && (tot.textContent = String(stats.totals.vms ?? '–'));
      run && (run.textContent = String(stats.totals.running ?? '–'));
      stop && (stop.textContent = String(stats.totals.stopped ?? '–'));
      const cpuPct = (typeof stats.totals.cpuLoad === 'number') ? Math.round(stats.totals.cpuLoad * 100) : null;
      cpu && (cpu.textContent = cpuPct==null? '–' : `${cpuPct}%`);
      if(cores){
        const totalCores = Number(stats.totals.cpuCores);
        if(Number.isFinite(totalCores)){
          if(typeof stats.totals.cpuLoad === 'number'){
            const used = Math.round(totalCores * stats.totals.cpuLoad);
            cores.textContent = `${used} / ${totalCores}`;
          } else {
            cores.textContent = String(totalCores);
          }
        } else {
          cores.textContent = '–';
        }
      }
      const mUsed = stats.totals.memUsed, mTot = stats.totals.memTotal;
      ram && (ram.textContent = (Number.isFinite(mUsed)&&Number.isFinite(mTot))? `${fmtBytes(mUsed)} / ${fmtBytes(mTot)}` : '–');
      const dUsed = stats.totals.storageUsed, dTot = stats.totals.storageTotal;
      disk && (disk.textContent = (Number.isFinite(dUsed)&&Number.isFinite(dTot))? `${fmtBytes(dUsed)} / ${fmtBytes(dTot)}` : '–');
    }
  }

  function render(items){
    const tbody = qs('#vms tbody');
    const filter = (qs('#filter').value||'').toLowerCase();
    tbody.innerHTML='';
    let shown = 0;
    for(const it of items){
      const txt = `${it.vmid} ${it.name} ${it.node} ${it.status}`.toLowerCase();
      if(filter && !txt.includes(filter)) continue;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.vmid}</td>
        <td>${it.name}</td>
        <td>${it.node}</td>
        <td><span class="status ${it.status}">${I18N[lang][it.status] || t('unknown')}</span></td>
        <td>${it.maxcpu ?? '-'}</td>
        <td>${fmtBytes(it.maxmem)}</td>
        <td class="actions">
          <button data-action="start">${t('start')}</button>
          <button data-action="stop">${t('stop')}</button>
          <button data-action="restart">${t('restart')}</button>
          <div class="menu">
            <button class="menu-btn">⋯</button>
            <div class="menu-list">
              <button class="menu-item" data-more="resize">${t('moreResize')||'Resize disk'}</button>
              <button class="menu-item" data-more="adjust">${t('moreAdjust')||'Adjust CPU/RAM'}</button>
              <button class="menu-item" data-more="snapshots">${t('moreSnapshots')||'Snapshots'}</button>
              <button class="menu-item" data-more="migrate">${t('moreMigrate')||'Migrate'}</button>
              <button class="menu-item" data-more="unlock">${t('moreUnlock')||'Unlock'}</button>
              <button class="menu-item" data-more="ip">${t('moreIP')||'View IP'}</button>
              <button class="menu-item danger" data-more="delete">${t('delete')}</button>
            </div>
          </div>
        </td>`;
      qsa('button', tr).forEach(b=>{
        b.addEventListener('click', async () => {
          const act = b.getAttribute('data-action');
          if(!act) return;
          if(act==='delete' && !confirm(t('confirmDelete', it.vmid))) return;
          b.disabled = true; b.textContent = '…';
          try {
            await api(`/api/vm/${it.vmid}/action`, { method:'POST', body: JSON.stringify({ action: act }) });
            await load();
          } catch(e){ alert(e.message); }
          finally { b.disabled=false; b.textContent = t(act); }
        });
      });
      // Menu open/close
      const menu = tr.querySelector('.menu');
      const btnMenu = tr.querySelector('.menu-btn');
      btnMenu.addEventListener('click', (ev)=>{ ev.stopPropagation(); closeAllMenus(); menu.classList.toggle('open'); });
      document.addEventListener('click', closeAllMenus, { once:true });
      function closeAllMenus(){ qsa('.menu.open').forEach(m=> m.classList.remove('open')); }
      // More actions
      tr.querySelectorAll('.menu-item').forEach(mi=>{
        mi.addEventListener('click', async ()=>{
          const m = mi.getAttribute('data-more');
          menu.classList.remove('open');
          if(m==='delete'){ if(confirm(t('confirmDelete', it.vmid))){ await doDelete(it.vmid); } return; }
          openActionModal(m, it);
        });
      });
      tbody.appendChild(tr);
      shown++;
    }
    // Empty state
    if(shown===0){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" class="empty">${t('empty')}</td>`;
      tbody.appendChild(tr);
    }
    const countEl = qs('#count'); if(countEl) countEl.textContent = t('count', items.filter(it=> (qs('#filter').value||'')? `${it.vmid} ${it.name} ${it.node} ${it.status}`.toLowerCase().includes((qs('#filter').value||'').toLowerCase()) : true).length);
  }

  async function load(){
    try{
      const health = await api('/api/health');
      setHealth(t('healthOk', health.version));
    }catch(e){ setHealth(t('healthErr')); }

    try{
      // stats first
      const stats = await api('/api/stats');
      renderStats(stats);
    }catch(e){ /* non-blocking */ }

    try{
      const data = await api('/api/vms');
      render(data.items||[]);
    }catch(e){ toast(t('loadFail', e.message), 'err'); }
  }

  function bindLangSwitch(){
    qsa('.lang-switch .lang').forEach(btn=>{
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-lang');
        if(next && next !== lang){
          lang = next; localStorage.setItem(LS_KEY, lang);
          applyI18n();
          load();
        }
      });
    });
    applyI18n();
  }

  // Activity drawer events
  qs('#activity-toggle')?.addEventListener('click', ()=>{ const d=qs('#activity'); if(d) d.setAttribute('aria-hidden','false'); });
  qs('#activity-close')?.addEventListener('click', ()=>{ const d=qs('#activity'); if(d) d.setAttribute('aria-hidden','true'); });
  qs('#activity-clear')?.addEventListener('click', ()=>{ logs.splice(0, logs.length); renderLogs(); });

  // Token prompt
  qs('#token-btn')?.addEventListener('click', ()=>{
    const next = prompt('Enter PANEL_TOKEN (leave empty to clear):', token || '');
    if(next===null) return; // cancelled
    setToken(next.trim());
    load();
  });

  qs('#refresh')?.addEventListener('click', load);
  qs('#filter')?.addEventListener('input', load);

  // Create VPS modal logic
  const modal = qs('#createModal');
  const openModal = ()=>{ if(modal){ modal.setAttribute('aria-hidden','false'); loadCreateForm(); } };
  const closeModal = ()=>{ if(modal){ modal.setAttribute('aria-hidden','true'); qs('#create-error')?.setAttribute('hidden',''); } };
  qs('#createVps')?.addEventListener('click', openModal);
  qs('#create-close')?.addEventListener('click', closeModal);
  qs('#create-cancel')?.addEventListener('click', closeModal);

  async function loadCreateForm(){
    try{
      // nodes
      const nodes = await api('/api/nodes');
      const selNode = qs('#f-node'); if(selNode){ selNode.innerHTML = ''; nodes.items.forEach(n=>{ const o=document.createElement('option'); o.value=n.node; o.textContent=n.node; selNode.appendChild(o); }); }
      await onNodeChange();
    }catch(e){ showCreateError(t('fetchErr')); }
  }

  async function onNodeChange(){
    const node = qs('#f-node')?.value;
    if(!node) return;
    try{
      const templates = await api(`/api/templates?node=${encodeURIComponent(node)}`);
      const selTpl = qs('#f-template'); if(selTpl){ selTpl.innerHTML=''; templates.items.forEach(tp=>{ const o=document.createElement('option'); o.value=tp.vmid; o.textContent=`${tp.vmid} - ${tp.name}`; selTpl.appendChild(o); }); }
    }catch(e){ showCreateError(t('fetchErr')); }
    try{
      const stor = await api(`/api/storages?node=${encodeURIComponent(node)}`);
      const selSt = qs('#f-storage'); if(selSt){ selSt.innerHTML=''; stor.items.forEach(s=>{ const o=document.createElement('option'); o.value=s.storage; o.textContent=`${s.storage}`; selSt.appendChild(o); }); }
    }catch(e){ showCreateError(t('fetchErr')); }
  }
  qs('#f-node')?.addEventListener('change', onNodeChange);

  function showCreateError(msg){ const box = qs('#create-error'); if(box){ box.textContent = msg; box.removeAttribute('hidden'); } }

  qs('#create-submit')?.addEventListener('click', async ()=>{
    const node = qs('#f-node')?.value;
    const templateVmid = qs('#f-template')?.value;
    const storage = qs('#f-storage')?.value;
    const name = qs('#f-name')?.value?.trim();
    const cores = Number(qs('#f-cores')?.value || 0) || undefined;
    const memory = Number(qs('#f-ram')?.value || 0) || undefined;
    const diskSizeGB = Number(qs('#f-disk')?.value || 0) || undefined;
    const ciuser = qs('#f-user')?.value?.trim() || undefined;
    const cipassword = qs('#f-pass')?.value || undefined;
    try{
      const resp = await api('/api/vm/create', { method:'POST', body: JSON.stringify({ node, templateVmid, storage, name, cores, memory, diskSizeGB, ciuser, cipassword }) });
      toast(t('createOk', resp.vmid), 'ok');
      closeModal();
      await load();
    }catch(e){ showCreateError(t('createErr', e.message)); toast(t('createErr', e.message), 'err'); }
  });

  initToken();
  bindLangSwitch();
  load();
})();
