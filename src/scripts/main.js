/**
 * SPARKY RADIO · CORE LOGIC
 * 1:1 FIDELITY RESTORATION FROM index.html.bak
 * Modularized for production but preserving all legacy behaviors, 
 * bug fixes, and structural improvements.
 */

// ══ PRO-DEBUGGER INTERCEPTOR ══════════════
(function () {
  const output = [];
  const originalLog = console.log, originalErr = console.error;
  function logToVirtual(msg, type) {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    output.push(`[${time}] ${type.toUpperCase()}: ${msg}`);
    const el = document.getElementById('debugOutput');
    if (el) {
      const line = document.createElement('div');
      line.className = `debug-line ${type}`;
      line.textContent = `[${time}] ${msg}`;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    }
  }
  console.log = function (...args) { originalLog(...args); logToVirtual(args.join(' '), 'log'); };
  console.error = function (...args) { originalErr(...args); logToVirtual(args.join(' '), 'error'); };
  console.warn = function (...args) { logToVirtual(args.join(' '), 'warn'); };

  window.copyLogs = () => {
    navigator.clipboard.writeText(output.join('\n'));
    alert('LOGS COPIED TO CLIPBOARD');
  };

  window.auditFavs = async () => {
    console.log('--- STARTING ACTIVE RESCUE AUDIT ---');
    const favs = JSON.parse(localStorage.getItem('sparky_favorites') || '[]');
    if (!favs.length) { console.warn('Vault is empty.'); return; }
    console.log(`Total Records: ${favs.length}`);
    for (const [i, f] of favs.entries()) {
      const id = f.stationuuid || f.id;
      if (!id) {
        console.log(`[!] Station ${f.name} is an ORPHAN. Attempting Active Rescue...`);
        await rescueOrphan(f);
      } else {
        console.log(`[${(i + 1).toString().padStart(2, '0')}] ${f.name.slice(0, 10)}.. | ID: ${id.slice(0, 8)} | LINKED`);
      }
    }
    console.log('--- AUDIT COMPLETE ---');
  };

  async function rescueOrphan(st) {
    const mirrors = ['de1.api.radio-browser.info', 'at1.api.radio-browser.info', 'nl1.api.radio-browser.info'];
    const q = st.name.split('-')[0].trim();
    for (const m of mirrors) {
      try {
        const res = await fetch(`https://${m}/json/stations/byname/${encodeURIComponent(q)}`);
        if (!res.ok) continue;
        const results = await res.json();
        const match = results.find(r => norm(r.url_resolved || r.url) === norm(st.url));
        if (match) {
          console.log(`[RESCUE] SUCCESS! Found ID ${match.stationuuid} for ${st.name}`);
          syncFavMetadata(match);
          return true;
        }
      } catch (e) { }
    }
    console.warn(`[RESCUE] FAILED: Could not find clean signature match for ${st.name}`);
    return false;
  }
})();

// ══ STORAGE MIGRATION ══════════════════════
(function migrate() {
  const map = { 'sparky_favorites_v2': 'sparky_favorites', 'sparky_eq_v5': 'sparky_eq_presets', 'sparky_volume_v2': 'sparky_volume' };
  Object.entries(map).forEach(([oldK, newK]) => {
    const data = localStorage.getItem(oldK);
    if (data !== null) {
      if (localStorage.getItem(newK) === null) localStorage.setItem(newK, data);
      localStorage.removeItem(oldK);
    }
  });
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ══ STATE ══════════════════════════════════
const audioEl = document.getElementById('audioEl');
let stations = [];
let currentIdx = -1;
let activeTab = 'stations';
let sortMode = 'power';
let favSortMode = localStorage.getItem('sparky_fav_sort_mode') || 'power';
let currentSrc = null;
let isPlaying = false;
let favs = []; // Global synced favorites list
let textScale = parseFloat(localStorage.getItem('sparky_text_scale')) || 1.0;
let shuffle = false;
let repeat = false;
let rafId, hls;
let filterCountry = 'ALL';
let filterLang = 'ALL';
let filterHiFi = true;
let wasCollapsedBeforeEQ = false; // State persistence for EQ engaged mode
let isSearching = false;
const APP_CODENAME = "Smart-Tune Pro";
let statsMode = localStorage.getItem('sparky_stats_mode') || 'FULL';



function updateDeploymentUI() {
  const tsEl = document.getElementById('sigTS');
  if (!tsEl) return;
  const modDate = new Date(document.lastModified);
  const ts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(modDate).replace(',', ' ·');
  tsEl.textContent = ts;
}

function syncStatsUI() {
  const isCompact = statsMode === 'COMPACT';
  document.querySelector('.app')?.classList.toggle('stats-compact', isCompact);
}

let audioCtx, analyser, srcNode;
let freqData;
let smoothedBands = new Float32Array(30); // Pre-init for 30 bars
let sortTooltipTimeout;

// ══ THEME ══════════════════════════════════
let isDark = localStorage.getItem('sparky_theme') !== 'light';
function applyTheme() {
  document.body.classList.toggle('light', !isDark);
  document.getElementById('toggleTrack').classList.toggle('on', !isDark);
  localStorage.setItem('sparky_theme', isDark ? 'dark' : 'light');
}
applyTheme();
document.getElementById('themeToggle').addEventListener('click', () => { isDark = !isDark; applyTheme(); });

// ══ FAVORITES ══════════════════════════════
const FAV_KEY = 'sparky_favorites';
function loadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY)) || [];
    let changed = false;
    raw.forEach(f => { if (!f.sparkyId) { f.sparkyId = crypto.randomUUID(); changed = true; } });
    if (changed) localStorage.setItem(FAV_KEY, JSON.stringify(raw));
    return raw;
  } catch { return []; }
}
function saveFavs(f) { localStorage.setItem(FAV_KEY, JSON.stringify(f)); }

function norm(u) {
  if (!u) return '';
  try {
    let n = u.split('?')[0].split('#')[0].toLowerCase().trim();
    n = n.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return n;
  } catch (e) { return u.toLowerCase().trim(); }
}

function isFav(st) {
  const u = st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id;
  const fv = loadFavs();
  // URL-CENTRIC IDENTITY: Ignore name to prevent accidental duplicates with diff names
  return fv.some(f =>
    (uuid && (f.id === uuid || f.stationuuid === uuid)) ||
    (norm(f.url) === norm(u))
  );
}

function addFav(st) {
  const favs = loadFavs(), u = st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id || '';

  const existing = favs.filter(f => (uuid && (f.id === uuid || f.stationuuid === uuid)) || norm(f.url) === norm(u));

  const proceed = () => {
    favs.push({
      sparkyId: crypto.randomUUID(), // permanent unique key for this favorites entry
      id: uuid, name: st.name, url: u,
      bitrate: st.bitrate, codec: st.codec,
      countrycode: st.countrycode, tags: st.tags || '',
      votes: st.votes || 0, clickcount: st.clickcount || 0, clicktrend: st.clicktrend || 0
    });
    saveFavs(favs);
    refreshFavBadge();
    if (activeTab === 'favs') renderFavs();
  };

  if (existing.length > 0) {
    sparkyConfirm(`<span style="color:#ff0; font-weight:bold; font-size:13px">⚠ CAUTION: DUPLICATE URL</span><br><br>There is already a station in your Favorites with the same URL. Proceed anyway?`, proceed, "DUPLICATE DETECTED");
  } else {
    proceed();
  }
}

function removeFavByIndex(idx) {
  let m = loadFavs();
  if (idx >= 0 && idx < m.length) {
    m.splice(idx, 1);
    saveFavs(m);
    refreshFavBadge();
  }
}

function removeFavByUrl(u) {
  saveFavs(loadFavs().filter(f => norm(f.url) !== norm(u)));
  refreshFavBadge();
}

function removeFavBySparkyId(sparkyId) {
  saveFavs(loadFavs().filter(f => f.sparkyId !== sparkyId));
  refreshFavBadge();
}

function refreshFavBadge() {
  const n = loadFavs().length;
  const el = document.getElementById('favsBadge');
  if (el) el.textContent = n;
}

function syncFavMetadata(st) {
  if (!st) return;
  const favs = loadFavs();
  const u = st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id;
  const favIdx = favs.findIndex(f => {
    const idMatch = uuid && (f.id === uuid || f.stationuuid === uuid);
    const urlMatch = norm(f.url) === norm(u);
    return idMatch || urlMatch;
  });

  if (favIdx !== -1) {
    let changed = false;
    if (st.votes !== undefined && favs[favIdx].votes !== st.votes) { favs[favIdx].votes = st.votes; changed = true; }
    if (st.tags !== undefined && favs[favIdx].tags !== st.tags) { favs[favIdx].tags = st.tags; changed = true; }
    if (st.favicon !== undefined && favs[favIdx].favicon !== st.favicon) { favs[favIdx].favicon = st.favicon; changed = true; }
    if ((st.clickcount || st.c) !== undefined && favs[favIdx].clickcount !== (st.clickcount || st.c)) { favs[favIdx].clickcount = st.clickcount || st.c; changed = true; }
    if (uuid && !favs[favIdx].id && !favs[favIdx].stationuuid) { favs[favIdx].id = uuid; changed = true; }
    if (changed) saveFavs(favs);
  }
}

// ══ TABS ═══════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabStations').classList.toggle('active', tab === 'stations');
  document.getElementById('tabFavs').classList.toggle('active', tab === 'favs');
  document.getElementById('searchArea').style.display = tab === 'stations' ? '' : 'none';
  document.querySelector('.filters-area').classList.toggle('fav-mode-gap', tab === 'favs');

  if (tab === 'stations') {
    sortMode = 'power';
    document.getElementById('plLabel').textContent = 'Stations';
    renderStations();
  } else {
    sortMode = favSortMode;
    document.getElementById('plLabel').textContent = 'Favorites';
    renderFavs();
    backgroundSyncFavs();
  }
  updateSortUI();
}
document.getElementById('tabStations').addEventListener('click', () => switchTab('stations'));
document.getElementById('tabFavs').addEventListener('click', () => switchTab('favs'));

async function backgroundSyncFavs() {
  const fv = loadFavs();
  if (!fv.length) return;
  const mirrors = ["de1.api.radio-browser.info", "at1.api.radio-browser.info", "nl1.api.radio-browser.info"];
  for (let f of fv) {
    await sleep(500);
    let id = f.id || f.stationuuid;
    const m = mirrors[Math.floor(Math.random() * mirrors.length)];
    try {
      if (!id) {
        const sr = await fetch(`https://${m}/json/stations/byurl?url=${encodeURIComponent(f.url.split('?')[0])}`);
        const res = await sr.json();
        if (res && res.length) {
          id = res[0].stationuuid;
          let latest = loadFavs();
          let idx = latest.findIndex(fav => norm(fav.url) === norm(f.url));
          if (idx !== -1) { latest[idx].id = id; saveFavs(latest); }
        } else continue;
      }
      const r = await fetch(`https://${m}/json/stations/byuuid/${id}`, { cache: 'no-store' });
      const d = await r.json();
      if (d && d.length) {
        syncFavMetadata(d[0]);
        if (activeTab === 'favs') renderFavs();
      }
    } catch (e) { console.error("[SYNC_ERROR]", e); }
  }
}

// ══ EQ ════════════════════════════════════
const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
const EQ_LABELS = ['60Hz', '170Hz', '310Hz', '600Hz', '1kHz', '3kHz', '6kHz', '12kHz'];
const eqNodes = [], eqVals = new Array(8).fill(0);

const FACTORY_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 3, 0, 0, 0, 0, 0],
  vocal: [-2, -1, 0, 3, 5, 4, 1, 0],
  jazz: [4, 3, 0, 2, 2, 0, 3, 4],
  pop: [-1, 2, 5, 5, 2, -1, -2, -2],
  rock: [5, 3, -1, -2, 0, 2, 4, 5],
  hiphop: [6, 4, 0, -2, -2, 0, 3, 5],
  classic: [5, 4, 0, 0, 0, 0, 4, 5],
  electron: [6, 4, 2, 0, -2, 2, 4, 6],
  custom: [3, 2, 1, 0, 1, 2, 2, 3]
};

let currentPresets = JSON.parse(localStorage.getItem('sparky_eq_presets') || JSON.stringify(FACTORY_PRESETS));
let activePreset = localStorage.getItem('sparky_active_preset') || 'flat';
let lastSavedVals = [...(FACTORY_PRESETS.flat)];

function updateSaveButtonState() {
  const btn = document.querySelector('.btn-save');
  if (!btn) return;
  const changed = eqVals.some((v, i) => Math.abs(v - lastSavedVals[i]) > 0.1);
  btn.style.opacity = changed ? '1' : '0.35';
  btn.style.pointerEvents = changed ? 'auto' : 'none';
  btn.title = changed ? `Commit changes to [${activePreset.toUpperCase()}]` : `[${activePreset.toUpperCase()}] is currently synchronized`;
}

function initEq() {
  const row = document.getElementById('eqRow');
  if (!row) return;
  row.innerHTML = '';
  EQ_LABELS.forEach((label, i) => {
    const col = document.createElement('div');
    col.className = 'eq-col';
    col.innerHTML = `
      <div class="eq-slider-box" id="eqS${i}">
        <div class="eq-fader" id="eqF${i}" style="bottom:50%"></div>
      </div>
      <div class="eq-label-freq">${label}</div>
    `;
    row.appendChild(col);

    const updateFader = (y) => {
      const box = document.getElementById('eqS' + i);
      const rect = box.getBoundingClientRect();
      let p = 1 - (y - rect.top) / rect.height;
      p = Math.max(0, Math.min(1, p));
      let v = (p - 0.5) * 30;
      eqVals[i] = v;
      const f = document.getElementById('eqF' + i);
      f.style.bottom = (p * 100) + '%';
      f.setAttribute('data-db', v.toFixed(1) + 'dB');
      if (eqNodes[i]) eqNodes[i].gain.value = v;
      updateSaveButtonState();
    };

    const box = document.getElementById('eqS' + i);
    box.addEventListener('mousedown', e => {
      updateFader(e.clientY);
      const move = (me) => updateFader(me.clientY);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    box.addEventListener('touchstart', e => {
      updateFader(e.touches[0].clientY);
      const move = (te) => { te.preventDefault(); updateFader(te.touches[0].clientY); };
      const up = () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    });
  });
}

function setEqPreset(p) {
  activePreset = p;
  localStorage.setItem('sparky_active_preset', p);
  const vals = currentPresets[p] || FACTORY_PRESETS.flat;
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('pre-' + p);
  if (btn) btn.classList.add('active');
  vals.forEach((v, i) => {
    eqVals[i] = v;
    const pcent = ((v / 30) + 0.5) * 100;
    const f = document.getElementById('eqF' + i);
    if (f) {
      f.style.bottom = pcent + '%';
      f.setAttribute('data-db', v.toFixed(1) + 'dB');
    }
    if (eqNodes[i]) eqNodes[i].gain.value = v;
  });
  lastSavedVals = [...vals];
  updateSaveButtonState();
}

// ══ EQ BINDINGS CONSOLIDATED IN DOMContentLoaded ══

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.onclick = () => {
    const id = btn.id.replace('pre-', '');
    setEqPreset(id);
  };
});

document.querySelector('.btn-save').onclick = saveCustomEq;
document.querySelector('.btn-reset').onclick = resetEqDefaults;

function saveCustomEq() {
  if (!activePreset) {
    sparkyAlert("Please select a preset slot (e.g., CUSTOM or FLAT) to save your current levels.", "SAVE BLOCKED");
    return;
  }
  const p = activePreset.toUpperCase();
  sparkyConfirm(`Commit current slider levels to the <strong>[${p}]</strong> memory bank?`, () => {
    currentPresets[activePreset] = [...eqVals];
    lastSavedVals = [...eqVals];
    localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
    updateSaveButtonState();
  }, "CONFIRM MEMORY WRITE");
}

function resetEqDefaults() {
  if (activePreset) {
    const p = activePreset.toUpperCase();
    sparkyConfirm(`Reset the <strong>[${p}]</strong> preset to its original factory levels? (This will only affect the current preset).`, () => {
      currentPresets[activePreset] = [...FACTORY_PRESETS[activePreset]];
      localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
      setEqPreset(activePreset);
    }, "RESTORE PRESET");
  } else {
    sparkyConfirm(`<strong>GLOBAL FACTORY RESET:</strong> No preset is currently selected. Do you want to restore <strong>ALL</strong> presets to their original factory levels?`, () => {
      currentPresets = JSON.parse(JSON.stringify(FACTORY_PRESETS));
      localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
      // Re-apply flat defaults visually
      FACTORY_PRESETS.flat.forEach((v, i) => {
         eqVals[i] = v;
         if (eqNodes[i]) eqNodes[i].gain.value = v;
         const f = document.getElementById('eqF' + i);
         if (f) { f.style.bottom = '50%'; f.setAttribute('data-db', '0.0dB'); }
      });
      lastSavedVals = [...FACTORY_PRESETS.flat];
      updateSaveButtonState();
    }, "GLOBAL FACTORY RESET");
  }
}

// ══ MODALS ═════════════════════════════════
function sparkyAlert(msg, header = "SYSTEM MESSAGE") {
  document.getElementById('sparkyModalHeader').textContent = header;
  document.getElementById('sparkyModalText').innerHTML = msg;
  document.getElementById('sparkyModalCancel').style.display = 'none';
  document.getElementById('sparkyModal').style.display = 'flex';
  document.getElementById('sparkyModalOk').onclick = () => { document.getElementById('sparkyModal').style.display = 'none'; };
}

function sparkyConfirm(msg, onOk, header = "SYSTEM CONFIRM") {
  document.getElementById('sparkyModalHeader').textContent = header;
  document.getElementById('sparkyModalText').innerHTML = msg;
  document.getElementById('sparkyModalCancel').style.display = 'inline-block';
  document.getElementById('sparkyModal').style.display = 'flex';
  document.getElementById('sparkyModalOk').onclick = () => { document.getElementById('sparkyModal').style.display = 'none'; onOk(); };
  document.getElementById('sparkyModalCancel').onclick = () => { document.getElementById('sparkyModal').style.display = 'none'; };
}

function sparkyPrompt(msg, header, onOk) {
  const modal = document.getElementById('sparkyModal');
  const text = document.getElementById('sparkyModalText');
  const hdr = document.getElementById('sparkyModalHeader');
  const ok = document.getElementById('sparkyModalOk');
  const cancel = document.getElementById('sparkyModalCancel');
  hdr.textContent = header || "SYSTEM PROMPT";
  text.innerHTML = `
    <div style="margin-bottom:12px">${msg}</div>
    <input type="text" id="sparkyPromptInput" 
           style="width:100%; background:var(--bg); border:1px solid var(--border); color:var(--accent); 
                  padding:12px; outline:none; border-radius:2px; font-family:'Share Tech Mono', monospace; 
                  font-size:18px; font-weight:700; -webkit-font-smoothing:antialiased;">
  `;
  cancel.style.display = 'inline-block';
  modal.querySelector('.modal-content').style.maxWidth = '400px';
  modal.style.display = 'flex';
  const input = document.getElementById('sparkyPromptInput');
  if (input) {
    input.focus();
    input.onkeydown = (e) => { 
      if (e.key === 'Enter') ok.click(); 
      if (e.key === 'Escape') cancel.click(); 
    };
  }
  ok.onclick = () => { const val = input.value.trim(); modal.style.display = 'none'; if (onOk) onOk(val); };
  cancel.onclick = () => { modal.style.display = 'none'; if (onOk) onOk(null); };
}

function openEditModal(name, url, onSave) {
  const overlay = document.getElementById('editModalOverlay');
  const nameInput = document.getElementById('editStationName');
  const urlInput = document.getElementById('editStationUrl');
  const saveBtn = document.getElementById('editModalSave');
  const cancelBtn = document.getElementById('editModalCancel');
  nameInput.value = name || '';
  urlInput.value = url || '';
  overlay.style.display = 'flex';
  nameInput.focus();
  function closeModal() {
    overlay.style.display = 'none';
    saveBtn.onclick = null;
    cancelBtn.onclick = null;
    overlay.onclick = null;
    document.onkeydown = null;
  }
  saveBtn.onclick = (e) => { e.preventDefault(); closeModal(); onSave(nameInput.value.trim(), urlInput.value.trim()); };
  cancelBtn.onclick = (e) => { e.preventDefault(); closeModal(); onSave(null, null); };
  overlay.onclick = (e) => { if (e.target === overlay) { closeModal(); onSave(null, null); } };
  document.onkeydown = (e) => {
    if (e.key === 'Escape') { closeModal(); onSave(null, null); }
    if (e.key === 'Enter' && document.activeElement !== cancelBtn) { saveBtn.click(); }
  };
}

function removeFav(st) {
  const u = st.url_resolved || st.url;
  removeFavByUrl(u);
  if (activeTab === 'favs') renderFavs();
  else renderStations();
}

// ══ AUDIO INIT ════════════════════════════
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  analyser = audioCtx.createAnalyser(); 
  analyser.fftSize = 256; // 128 usable frequency bins
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;
  analyser.smoothingTimeConstant = 0.35; // Allow visual code to handle smoothing

  srcNode = audioCtx.createMediaElementSource(audioEl);
  let chain = srcNode;
  EQ_FREQS.forEach((freq, i) => {
    const f = audioCtx.createBiquadFilter();
    f.type = i === 0 ? 'lowshelf' : i === 7 ? 'highshelf' : 'peaking';
    f.frequency.value = freq; f.gain.value = eqVals[i];
    eqNodes.push(f); chain.connect(f); chain = f;
  });
  chain.connect(analyser); analyser.connect(audioCtx.destination);
  
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

// ══ VISUALIZER ════════════════════════════
const vizBars = document.querySelectorAll('.visualizer .bar');

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getBandEnergy(data, start, end) {
  let sum = 0, count = 0;
  for (let i = start; i <= end; i++) {
    sum += data[i] || 0;
    count++;
  }
  return count ? sum / count : 0;
}

function drawViz() {
  rafId = requestAnimationFrame(drawViz);
  if (!analyser || !freqData) return;

  analyser.getByteFrequencyData(freqData);

  const totalBins = analyser.frequencyBinCount;
  const barCount = vizBars.length;
  const minBin = 1;
  const maxBin = Math.min(totalBins - 1, 100); // Focus on musical range

  vizBars.forEach((bar, i) => {
    // Non-linear band mapping: More detail in bass/mids, grouping in treble
    const t0 = i / barCount;
    const t1 = (i + 1) / barCount;

    const startBin = Math.floor(minBin + Math.pow(t0, 1.8) * (maxBin - minBin));
    const endBin = Math.floor(minBin + Math.pow(t1, 1.8) * (maxBin - minBin));

    let val = getBandEnergy(freqData, startBin, Math.max(startBin, endBin));

    // Subtle progressive compensation (tilt)
    const tilt = 1 + (i / barCount) * 0.4;
    val *= tilt;

    // Expand quiet details (visual compressor)
    let normVal = val / 255;
    normVal = Math.pow(normVal, 0.65);

    // Visual smoothing: Fast rise (attack), slower fall (decay)
    const prev = smoothedBands[i] || 0;
    const attack = 0.55;
    const decay = 0.18;
    smoothedBands[i] = normVal > prev
      ? lerp(prev, normVal, attack)
      : lerp(prev, normVal, decay);

    // Height mapping
    const minH = 4;
    const maxH = 28;
    const h = minH + smoothedBands[i] * (maxH - minH);

    bar.style.height = h.toFixed(1) + 'px';
  });
}

function idleViz() {
  cancelAnimationFrame(rafId); let t = 0;
  (function tick() {
    rafId = requestAnimationFrame(tick); t += .05;
    vizBars.forEach((b, i) => { b.style.height = (4 + Math.abs(Math.sin(t + i * .4)) * 10) + 'px'; });
  })();
}
idleViz();

// ══ STATUS ════════════════════════════════
function setStatus(state, txt) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (dot) dot.className = 'dot ' + ({ playing: 'active', buffering: 'buffering', error: 'error' }[state] || '');
  if (text) text.textContent = txt.toUpperCase();
}

// ══ NOW PLAYING ═══════════════════════════
function updateNowPlaying(st) {
  const nm = document.getElementById('npName');
  if (!nm) return;
  nm.textContent = st ? st.name : '— SELECT A STATION —';
  nm.className = 'np-name' + (st ? ' running' : '');
  if (st) {
    const textWidth = nm.scrollWidth;
    const containerWidth = nm.parentElement.offsetWidth;
    const totalDist = textWidth + containerWidth;
    const speed = 35; // Pixels per second (Slower, relaxed pace)
    const duration = totalDist / speed;
    
    nm.style.setProperty('--ticker-duration', duration + 's');
    nm.style.setProperty('--ticker-start', containerWidth + 'px');
    nm.style.setProperty('--ticker-end', '-' + textWidth + 'px');
  }
  const votes = document.getElementById('npVotes');
  const clicks = document.getElementById('npClicks');
  const trend = document.getElementById('npTrend');
  const codec = document.getElementById('npCodec');
  if (trend) trend.textContent = (st?.clicktrend !== undefined) ? (st.clicktrend > 0 ? '+' + st.clicktrend : st.clicktrend) : '—';
  if (codec) codec.textContent = (st?.codec || 'MP3').toUpperCase();
  
  const npHD = document.getElementById('npHD');
  if (npHD) npHD.style.display = (Number(st?.bitrate || 0) >= 128) ? 'flex' : 'none';
  if (votes) votes.textContent = fmtK(st?.votes || 0);
  if (clicks) clicks.textContent = fmtK(st?.clickcount || 0);
}

// ══ PLAYBACK ══════════════════════════════
function playStationObj(st) {
  if (!st) return;
  syncFavMetadata(st);
  currentSrc = st;
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  initAudio();
  if (hls) { hls.destroy(); hls = null; }
  audioEl.pause();
  const url = st.url_resolved || st.url;
  audioEl.volume = document.getElementById('volSlider').value / 100;
  setStatus('buffering', 'BUFFERING');
  updateNowPlaying(st);
  updateMediaSession(st);
  if (url.toLowerCase().includes('.m3u8') && Hls.isSupported()) {
    hls = new Hls(); hls.loadSource(url); hls.attachMedia(audioEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => audioEl.play().then(onPlaySuccess).catch(onPlayError));
    hls.on(Hls.Events.ERROR, (ev, data) => { if (data.fatal) onPlayError(); });
  } else {
  audioEl.src = url; 
  audioEl.play().then(onPlaySuccess).catch(onPlayError);
  localStorage.setItem('sparky_last_station', JSON.stringify(st));
}
  function onPlaySuccess() {
    isPlaying = true; setStatus('playing', 'CONNECTED');
    syncPlayBtns();
    cancelAnimationFrame(rafId); drawViz();
  }
  function onPlayError() {
    setStatus('error', 'ERROR');
    syncPlayBtns();
  }
}

function playAtIndex(idx) {
  const list = activeTab === 'favs' ? favs : stations;
  if (idx < 0 || idx >= list.length) return;
  currentIdx = idx; playStationObj(list[idx]);
  renderCurrent();
}

function stopPlayback() {
  audioEl.pause(); audioEl.src = '';
  isPlaying = false; 
  setStatus('', 'IDLE');
  syncPlayBtns();
  idleViz(); renderCurrent();
}

function togglePlay() {
  if (isPlaying) stopPlayback();
  else if (currentSrc) playStationObj(currentSrc);
  else if (activeTab === 'stations' && stations.length) playAtIndex(0);
  else if (activeTab === 'favs' && favs.length) playAtIndex(0);
}

function renderCurrent() { activeTab === 'stations' ? renderStations() : renderFavs(); }

// ══ RENDERERS ══════════════════════════════
function renderFavicon(st) {
  if (st.favicon && st.favicon.trim() !== '') {
    return `<img class="pl-favicon" src="${esc(st.favicon)}" onerror="this.onerror=null; const s=document.createElement('span'); s.className='material-symbols-outlined pl-favicon-fallback'; s.textContent='radio'; this.replaceWith(s);">`;
  }
  return `<span class="material-symbols-outlined pl-favicon-fallback">radio</span>`;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtK(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v;
}

function renderStations() {
  const pl = document.getElementById('playlist');
  if (!pl) return;
  document.getElementById('stationsBadge').textContent = stations.length;
  if (!stations.length) {
    pl.innerHTML = '<div class="pl-empty"><div class="pl-empty-icon">📡</div><div>SEARCH TO DISCOVER STATIONS</div></div>'; return;
  }
  if (stations.length > 1) {
    if (sortMode === 'power') {
      const maxC = Math.max(...stations.map(s => s.clickcount || 0), 1);
      const maxV = Math.max(...stations.map(s => s.votes || 0), 1);
      const maxT = Math.max(...stations.map(s => s.clicktrend || 0), 1);
      stations.sort((a, b) => {
        const sA = ((a.clickcount || 0) / maxC * 0.6) + ((a.votes || 0) / maxV * 0.3) + ((a.clicktrend || 0) / maxT * 0.1);
        const sB = ((b.clickcount || 0) / maxC * 0.6) + ((b.votes || 0) / maxV * 0.3) + ((b.clicktrend || 0) / maxT * 0.1);
        return sB - sA;
      });
    } else { stations.sort((a, b) => (b.votes || 0) - (a.votes || 0)); }
  }

  const mC = Math.max(...stations.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...stations.map(s => s.votes || 0), 1);
  const mT = Math.max(...stations.map(s => s.clicktrend || 0), 1);

  pl.innerHTML = stations.map((st, i) => {
    const url = st.url_resolved || st.url;
    const actv = currentSrc && (norm(currentSrc.url) === norm(url)) && activeTab === 'stations';
    const favd = isFav(st);

    const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
    const pwr = Math.min(100, Math.round(rank * 100));

    // DASHBOARD TELEMETRY
    const trending = (st.clicktrend || 0) > 50 ? '<span class="pl-status-badge trending">TRENDING</span>' : '';
    let primary = { id: 'pwr', icon: '⚡', val: `${pwr}%`, color: 'var(--accent)' };
    let secondaries = [
      { id: 'clk', icon: '🔥', val: fmtK(st.clickcount) },
      { id: 'vot', icon: '👍', val: fmtK(st.votes) }
    ];

    if (sortMode === 'vote') {
      primary = { id: 'vot', icon: '👍', val: fmtK(st.votes), color: 'var(--fav)' };
      secondaries = [
        { id: 'pwr', icon: '⚡', val: `${pwr}%` },
        { id: 'clk', icon: '🔥', val: fmtK(st.clickcount) }
      ];
    }
    const isCompact = statsMode === 'COMPACT';
    const telemetryHtml = `
      <div class="pl-telemetry-bar">
        <div class="pl-stat-primary" style="color:${primary.color}"><i>${primary.icon}</i> ${primary.val}</div>
        ${!isCompact ? `<div class="pl-stat-sep">|</div>` : ''}
        ${!isCompact ? secondaries.map(s => `<div class="pl-stat-secondary"><i>${s.icon}</i> ${s.val}</div>`).join('') : ''}
      </div>
    `;

    return `<div class="pl-item${actv ? ' active' : ''}" data-idx="${i}">
      <div class="pl-sidebar"><div class="pl-num">${actv ? '▶' : (i + 1).toString().padStart(2, '0')}</div></div>
      <div class="pl-main">
        <div class="pl-item-row pl-item-top">
          <div class="pl-item-info-group">
            ${renderFavicon(st)}
            <div class="pl-item-name">${esc(st.name)}</div>
            ${(Number(st.bitrate || 0) >= 128) ? '<span class="hd-badge-inline">HD</span>' : ''}
            ${trending}
          </div>
          <div class="pl-item-actions">
            <button class="pl-action-btn pl-heart-btn" data-fav="${i}" title="Toggle Favorite">
              <span class="material-symbols-outlined pl-heart${favd ? ' is-fav' : ''}">favorite</span>
            </button>
            <button class="pl-action-btn pl-remove" data-rmst="${i}" title="Remove Station">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        
        <div class="pl-item-row pl-item-bottom">
          <div class="pl-item-meta-group">
            <span class="pl-item-meta-text">${esc(st.countrycode || '--')} · ${esc((st.tags || '').split(',').slice(0, 2).join(', ').toUpperCase() || 'RADIO')}</span>
          </div>
          <div class="pl-item-stat-group">
             <span class="pl-power-val" style="color:${primary.color}">⚡ ${primary.val}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  pl.querySelectorAll('.pl-item').forEach(el => el.onclick = (e) => {
    if (e.target.closest('button')) return;
    currentIdx = parseInt(el.dataset.idx); playAtIndex(currentIdx);
  });
  pl.querySelectorAll('.pl-heart-btn').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const st = stations[btn.dataset.fav];
    isFav(st) ? removeFavByUrl(st.url_resolved || st.url) : addFav(st); renderStations();
  });
  pl.querySelectorAll('.pl-remove').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const idx = parseInt(btn.dataset.rmst);
    sparkyConfirm(`Remove [${stations[idx].name}]?`, () => { stations.splice(idx, 1); renderStations(); });
  });
}

function renderFavs() {
  const pl = document.getElementById('playlist');
  favs = loadFavs(); // Sync global
  if (!pl) return;
  refreshFavBadge();
  if (!favs.length) {
    pl.innerHTML = '<div class="pl-empty"><div class="pl-empty-icon">★</div><div>NO FAVORITES YET</div></div>'; return;
  }
  if (favs.length > 1 && sortMode !== 'custom') {
    if (sortMode === 'power') {
      const maxC = Math.max(...favs.map(s => s.clickcount || 0), 1);
      favs.sort((a, b) => (b.clickcount || 0) / maxC - (a.clickcount || 0) / maxC);
    } else { favs.sort((a, b) => (b.votes || 0) - (a.votes || 0)); }
  }

  const mC = Math.max(...favs.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...favs.map(s => s.votes || 0), 1);
  const mT = Math.max(...favs.map(s => s.clicktrend || 0), 1);

  pl.innerHTML = favs.map((st, i) => {
    const actv = currentSrc && (norm(currentSrc.url) === norm(st.url)) && activeTab === 'favs';
    const isDup = favs.filter(s => norm(s.url) === norm(st.url)).length > 1;

    const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
    const pwr = Math.min(100, Math.round(rank * 100));

    const isManual = sortMode === 'custom';
    // DASHBOARD TELEMETRY
    const trending = (st.clicktrend || 0) > 50 ? '<span class="pl-status-badge trending">TRENDING</span>' : '';
    let primary = { id: 'pwr', icon: '⚡', val: `${pwr}%`, color: 'var(--accent)' };
    let secondaries = [
      { id: 'clk', icon: '🔥', val: fmtK(st.clickcount) },
      { id: 'vot', icon: '👍', val: fmtK(st.votes) }
    ];

    if (sortMode === 'vote') {
      primary = { id: 'vot', icon: '👍', val: fmtK(st.votes), color: 'var(--fav)' };
      secondaries = [
        { id: 'pwr', icon: '⚡', val: `${pwr}%` },
        { id: 'clk', icon: '🔥', val: fmtK(st.clickcount) }
      ];
    }

    const isCompact = statsMode === 'COMPACT';
    const telemetryHtml = `
      <div class="pl-telemetry-bar">
        <div class="pl-stat-primary" style="color:${primary.color}"><i>${primary.icon}</i> ${primary.val}</div>
        ${!isCompact ? `<div class="pl-stat-sep">|</div>` : ''}
        ${!isCompact ? secondaries.map(s => `<div class="pl-stat-secondary"><i>${s.icon}</i> ${s.val}</div>`).join('') : ''}
      </div>
    `;

    let sidebarHtml = `<div class="pl-num">${actv ? '▶' : (i + 1).toString().padStart(2, '0')}</div>`;
    if (isManual) {
      sidebarHtml = `
        <button class="btn-stack" data-up="${st.sparkyId}">▲</button>
        <div class="pl-num">${actv ? '▶' : (i + 1).toString().padStart(2, '0')}</div>
        <button class="btn-stack" data-down="${st.sparkyId}">▼</button>
      `;
    }

    return `<div class="pl-item${actv ? ' active' : ''}${isDup ? ' is-dup-fav' : ''}" data-idx="${i}">
      <div class="pl-sidebar">${sidebarHtml}</div>
      <div class="pl-main">
        <div class="pl-item-row pl-item-top">
          <div class="pl-item-info-group">
            ${renderFavicon(st)}
            <div class="pl-item-name">${esc(st.name)}</div>
            ${(Number(st.bitrate || 0) >= 128) ? '<span class="hd-badge-inline">HD</span>' : ''}
            ${trending}
          </div>
          <div class="pl-item-actions">
            <button class="pl-action-btn pl-edit" data-edit="${st.sparkyId}" title="Edit Favorite">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button class="pl-action-btn pl-remove" data-rmfav="${st.sparkyId}" title="Remove Favorite">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div class="pl-item-row pl-item-bottom">
          <div class="pl-item-meta-group">
            <span class="pl-item-meta-text">${esc(st.countrycode || '--')} · ${esc((st.tags || '').split(',').slice(0, 2).join(', ').toUpperCase() || 'RADIO')}</span>
          </div>
          <div class="pl-item-stat-group">
             <span class="pl-power-val" style="color:${primary.color}">⚡ ${primary.val}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  pl.querySelectorAll('.pl-item').forEach(el => el.onclick = (e) => {
    if (e.target.closest('button')) return;
    currentIdx = parseInt(el.dataset.idx); playAtIndex(currentIdx);
  });
  pl.querySelectorAll('[data-rmfav]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.rmfav; // sparkyId — permanent identity, sort-order independent
    const m = loadFavs();
    const f = m.find(x => x.sparkyId === sid);
    if (!f) return;
    sparkyConfirm(`Remove [${f.name}]?`, () => { removeFavBySparkyId(sid); renderFavs(); });
  });
  pl.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.edit; // sparkyId — permanent identity, sort-order independent
    const m = loadFavs();
    const storageIdx = m.findIndex(f => f.sparkyId === sid);
    if (storageIdx === -1) return; // entry no longer exists — bail out
    const st = m[storageIdx]; // always the exact correct entry
    const originalUrl = st.url;
    openEditModal(st.name, st.url, (n, u) => {
      if (n === null) return; // user cancelled — do nothing
      const newName = n.trim() || st.name;
      const newUrl = (u || '').trim() || originalUrl;
      let fresh = loadFavs(); // reload in case anything changed while modal was open
      const freshIdx = fresh.findIndex(f => f.sparkyId === sid);
      if (freshIdx === -1) return;
      const urlChanged = norm(newUrl) !== norm(originalUrl);
      const doSave = () => {
        fresh[freshIdx].name = newName;
        fresh[freshIdx].url = newUrl;
        saveFavs(fresh);
        renderFavs();
      };
      if (urlChanged) {
        // Only warn if new URL conflicts with a DIFFERENT existing favorite (not self)
        const conflict = fresh.some((f, i) => i !== freshIdx && norm(f.url) === norm(newUrl));
        if (conflict) {
          sparkyConfirm(`<span style="color:#ff0; font-weight:bold; font-size:13px">⚠ CAUTION: DUPLICATE URL</span><br><br>This URL already exists in another Favorite. Proceed anyway?`, doSave, "DUPLICATE DETECTED");
          return;
        }
      }
      doSave();
    });
  });
  pl.querySelectorAll('[data-up]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.up; // sparkyId
    let m = loadFavs();
    const idx = m.findIndex(f => f.sparkyId === sid);
    if (idx > 0) { [m[idx - 1], m[idx]] = [m[idx], m[idx - 1]]; saveFavs(m); renderFavs(); }
  });
  pl.querySelectorAll('[data-down]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.down; // sparkyId
    let m = loadFavs();
    const idx = m.findIndex(f => f.sparkyId === sid);
    if (idx < m.length - 1) { [m[idx + 1], m[idx]] = [m[idx], m[idx + 1]]; saveFavs(m); renderFavs(); }
  });
}

// ══ TRANSPORT ══════════════════════════════
// Logic moved to footer bindings and togglePlay function


// ══ FOOTER ACTIONS (Logic defined here, bound in INIT) ════
function handleAddStation() {
  sparkyPrompt("Enter stream URL:", "ADD CUSTOM STATION", (url) => {
    if (!url) return;
    const nUrl = norm(url);
    const favs = loadFavs();
    const exists = favs.some(f => norm(f.url) === nUrl);

    const proceedToName = () => {
      sparkyPrompt("Enter station name:", "STATION IDENTITY", (name) => {
        const st = { name: name || 'Custom Station', url_resolved: url, url, bitrate: '', codec: '', countrycode: '', tags: '' };
        stations.push(st);
        switchTab('stations');
      });
    };

    if (exists) {
      sparkyConfirm(`<span style="color:#ff0; font-weight:bold; font-size:13px">⚠ CAUTION: DUPLICATE URL</span><br><br>This URL already exists in your Favorites. Proceed anyway?`, proceedToName, "DUPLICATE DETECTED");
    } else {
      proceedToName();
    }
  });
}

function handleRemoveStation() {
  if (currentIdx < 0) {
    sparkyAlert("SELECT A STATION FROM THE LIST TO REMOVE", "SELECTION REQUIRED");
    return;
  }
  if (activeTab === 'favs') {
    const f = favs[currentIdx]; // sorted global — matches what user sees
    if (!f) { sparkyAlert("SELECTION INVALID — PLEASE RESELECT", "SELECTION REQUIRED"); return; }
    const sid = f.sparkyId; // sparkyId — permanent identity anchor
    sparkyConfirm(`Remove [${f.name}] from favorites?`, () => {
      removeFavBySparkyId(sid); stopPlayback(); renderFavs();
    });
  } else {
    const st = stations[currentIdx];
    sparkyConfirm(`Remove [${st.name}] from list?`, () => {
      stations.splice(currentIdx, 1); stopPlayback(); renderStations();
    });
  }
}


// FOOTER MINI-PLAYER BINDINGS
const syncPlayBtns = () => {
  const isP = isPlaying;
  // Global playing state for CSS effects
  document.querySelector('.app')?.classList.toggle('is-playing', isP);

  // Main button (legacy/top)
  const playBtn = document.getElementById('btnPlay');
  if (playBtn) playBtn.innerHTML = isP ? '&#9646;&#9646; PAUSE' : '&#9654; PLAY';

  // Footer button (new premium structure)
  const playBtnFooter = document.getElementById('btnPlayFooter');
  if (playBtnFooter) {
    const icon = playBtnFooter.querySelector('.material-symbols-outlined');
    const label = playBtnFooter.querySelector('.btn-label');
    if (icon && label) {
      icon.textContent = isP ? 'stop' : 'play_arrow'; // Changed to STOP icon for live streams
      label.textContent = isP ? 'STOP' : 'PLAY';      // Changed to STOP label
    } else {
      playBtnFooter.innerHTML = isP ? '&#9632; STOP' : '&#9654; PLAY';
    }
  }
};

const updateVolFill = (el) => {
  if (!el) return;
  const v = el.value;
  el.style.background = `linear-gradient(to right, var(--accent) ${v}%, var(--seek-bg) ${v}%)`;
};

// ══ SEARCH ════════════════════════════════
async function searchStations(q, isManual = false) {
  if (isSearching) return;
  localStorage.setItem('sparky_last_query', q || ''); 
  const hasFilters = filterCountry !== 'ALL' || filterLang !== 'ALL' || filterHiFi;
  if (!q && !hasFilters && !isManual) { stations = []; renderStations(); return; }
  if (q === '' && !isManual) { stations = []; renderStations(); return; } // Explicit empty = clear
  isSearching = true;
  const pl = document.getElementById('playlist');
  if (pl) pl.innerHTML = '<div class="pl-loading"><div class="spinner"></div>SMART SCANNING...</div>';

  const parts = q.split(/\s+/);
  const required = [], excluded = [];
  let baseQuery = "";
  parts.forEach(p => {
    if (p.startsWith('+') && p.length > 1) required.push(p.substring(1).toLowerCase());
    else if (p.startsWith('-') && p.length > 1) excluded.push(p.substring(1).toLowerCase());
    else baseQuery += (baseQuery ? " " : "") + p;
  });
  let apiQ = baseQuery || (required.length > 0 ? required[0] : q);
  const mirrors = ['de1.api.radio-browser.info', 'at1.api.radio-browser.info', 'fr1.api.radio-browser.info'];
  // Mirror Shuffle (1:1 Fidelity)
  for (let i = mirrors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mirrors[i], mirrors[j]] = [mirrors[j], mirrors[i]];
  }

  let success = false;
  for (const srv of mirrors) {
    try {
      const params = { limit: 250, hidebroken: true, order: 'clickcount', reverse: true };
      if (apiQ) params.name = apiQ;
      if (filterCountry !== 'ALL') params.countrycode = filterCountry;
      if (filterLang !== 'ALL') params.language = filterLang.toLowerCase();
      const res = await fetch(`https://${srv}/json/stations/search?` + new URLSearchParams(params));
      if (!res.ok) continue;

      // Mirror Telemetry (Logic preserved per request)
      const mirrorIndicator = document.getElementById('mirrorIndicator');
      if (mirrorIndicator) mirrorIndicator.textContent = srv.split('.')[0].toUpperCase();

      const raw = await res.json();
      let filtered = raw.filter(st => {
        const blob = (st.name + " " + (st.tags || '')).toLowerCase();
        for (const ex of excluded) if (blob.includes(ex)) return false;
        for (const req of required) if (!blob.includes(req)) return false;
        return true;
      });
      if (filterHiFi) filtered = filtered.filter(s => Number(s.bitrate || 0) >= 128);

      // ══ SMART-TUNE RE-SORT (1:1 FIDELITY) ════
      const maxClicks = Math.max(...filtered.map(s => Number(s.clickcount || 0)), 1);
      const maxVotes = Math.max(...filtered.map(s => Number(s.votes || 0)), 1);
      const maxTrend = Math.max(...filtered.map(s => Number(s.clicktrend || 0)), 1);

      const getScore = s => (
        ((Number(s.clickcount || 0) / maxClicks) * 0.6) +
        ((Number(s.votes || 0) / maxVotes) * 0.3) +
        ((Number(s.clicktrend || 0) / maxTrend) * 0.1)
      );

      stations = filtered.sort((a, b) => getScore(b) - getScore(a));
      success = true; break;
    } catch (e) { }
  }
  if (success) renderStations();
  else if (pl) pl.innerHTML = '<div class="pl-empty">⚠ ALL MIRRORS UNREACHABLE</div>';
  isSearching = false;
}

function toggleFilters() {
  const rack = document.getElementById('filterRack'), btn = document.getElementById('btnFilterToggle');
  const isCollapsed = rack.classList.toggle('collapsed');
  btn.classList.toggle('active', isCollapsed);
  localStorage.setItem('sparky_filters_collapsed', isCollapsed);
}
function expandFilters() {
  const rack = document.getElementById('filterRack'), btn = document.getElementById('btnFilterToggle');
  if (rack?.classList.contains('collapsed')) { rack.classList.remove('collapsed'); btn.classList.remove('active'); }
}

// ══ SETTINGS & UI ══════════════════════════
// ══ SETTINGS & UI (Logic defined here, bound in INIT) ══
function handleExport() {
  const data = JSON.stringify(loadFavs(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sparky_favorites_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  sparkyAlert("Favorites Vault exported as JSON file.", "EXPORT SUCCESSFUL");
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (re) => {
    try {
      const data = JSON.parse(re.target.result);
      if (Array.isArray(data)) {
        sparkyConfirm(`Restore ${data.length} stations from file? This will overwrite current favorites.`, () => {
          saveFavs(data);
          refreshFavBadge();
          if (activeTab === 'favs') renderFavs();
          sparkyAlert("Vault Restored Successfully!", "RESTORE COMPLETE");
        }, "CONFIRM RESTORE");
      } else { throw new Error(); }
    } catch (err) {
      sparkyAlert("Invalid JSON file. Please use a valid Sparky Radio backup.", "RESTORE FAILED");
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function applyTextScale(val) {
  textScale = val;
  document.documentElement.style.setProperty('--text-scale', val);
  localStorage.setItem('sparky_text_scale', val);
  const label = document.getElementById('textScaleLabel');
  const slider = document.getElementById('textScaleSlider');
  if (label) label.textContent = `${Math.round(val * 100)}% ${val === 1.0 ? '(DEFAULT)' : ''}`;
  if (slider) slider.value = val;
}

const CTRY_LIST = ['ALL', 'AE', 'AR', 'AT', 'AU', 'BA', 'BE', 'BG', 'BR', 'CA', 'CH', 'CL', 'CN', 'CO', 'CZ', 'DE', 'DK', 'EC', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'ID', 'IE', 'IL', 'IN', 'IT', 'JP', 'MX', 'NL', 'NZ', 'PE', 'PH', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SK', 'TR', 'TW', 'UA', 'UG', 'US', 'UY', 'VE', 'ZA'];
const LANG_LIST = ['ALL', 'arabic', 'brazilian portuguese', 'chinese', 'croatian', 'czech', 'dutch', 'english', 'french', 'german', 'greek', 'hindi', 'hungarian', 'indonesian', 'italian', 'japanese', 'polish', 'portuguese', 'romanian', 'russian', 'serbian', 'spanish', 'swedish', 'turkish', 'ukrainian'];

const CTRY_NAMES = {
  "AE": "The United Arab Emirates", "AR": "Argentina", "AT": "Austria", "AU": "Australia", "BA": "Bosnia And Herzegovina",
  "BE": "Belgium", "BG": "Bulgaria", "BR": "Brazil", "CA": "Canada", "CH": "Switzerland", "CL": "Chile", "CN": "China",
  "CO": "Colombia", "CZ": "Czechia", "DE": "Germany", "DK": "Denmark", "EC": "Ecuador", "ES": "Spain", "FI": "Finland",
  "FR": "France", "GB": "United Kingdom", "GR": "Greece", "HR": "Croatia", "HU": "Hungary", "ID": "Indonesia",
  "IE": "Ireland", "IL": "Israel", "IN": "India", "IT": "Italy", "JP": "Japan", "MX": "Mexico", "NL": "The Netherlands",
  "NZ": "New Zealand", "PE": "Peru", "PH": "Philippines", "PL": "Poland", "PT": "Portugal", "RO": "Romania",
  "RS": "Serbia", "RU": "Russian Federation", "SE": "Sweden", "SK": "Slovakia", "TR": "Türkiye", "TW": "Taiwan",
  "UA": "Ukraine", "UG": "Uganda", "US": "United States", "UY": "Uruguay", "VE": "Venezuela", "ZA": "South Africa"
};

function loadFilterOptions() {
  const cCont = document.getElementById('filterCountryOptions'), lCont = document.getElementById('filterLangOptions');
  if (!cCont || !lCont) return;

  const defC = localStorage.getItem('sparky_default_country') || 'ALL';
  const defL = localStorage.getItem('sparky_default_lang') || 'ALL';

  const finalC = ['ALL'];
  if (defC !== 'ALL' && CTRY_LIST.includes(defC)) finalC.push(defC);
  finalC.push(...CTRY_LIST.filter(c => c !== 'ALL' && c !== defC).sort());

  const finalL = ['ALL'];
  if (defL !== 'ALL' && LANG_LIST.includes(defL)) finalL.push(defL);
  finalL.push(...LANG_LIST.filter(l => l !== 'ALL' && l !== defL).sort());

  cCont.innerHTML = finalC.map(c => {
    const name = CTRY_NAMES[c] || c;
    const display = c === 'ALL' ? 'ALL COUNTRIES' : `${name} · ${c}`;
    return `<div class="preset-opt" data-val="${c}">${display}</div>`;
  }).join('');

  lCont.innerHTML = finalL.map(l => {
    const name = l.charAt(0).toUpperCase() + l.slice(1);
    const code = l === 'ALL' ? 'ALL' : l.substring(0, 3).toUpperCase();
    const display = l === 'ALL' ? 'ALL LANGUAGES' : `${name} · ${code}`;
    return `<div class="preset-opt" data-val="${l}">${display}</div>`;
  }).join('');

  cCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => { filterCountry = o.dataset.val; document.getElementById('filterCountryTrigger').textContent = filterCountry; cCont.classList.remove('show'); searchStations(document.getElementById('searchInput').value); });
  lCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => { filterLang = o.dataset.val; document.getElementById('filterLangTrigger').textContent = filterLang === 'ALL' ? 'ALL' : filterLang.substring(0, 3).toUpperCase(); lCont.classList.remove('show'); searchStations(document.getElementById('searchInput').value); });
}


const defaultPresets = ["Jazz", "Blues", "Rock", "Pop", "Classical", "News", "Country", "80s", "90s", "Charts"];
function loadPresets() {
  const custom = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
  const all = [...new Set([...defaultPresets, ...custom])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const container = document.getElementById('presetOptions');
  if (!container) return;
  let html = `<div class="preset-opt add-opt" data-val="ADD">+ ADD NEW TUNE</div>`;
  all.forEach(p => {
    const isDefault = defaultPresets.includes(p);
    html += `<div class="preset-opt" data-val="${p}"><span>${p.toUpperCase()}</span>${!isDefault ? `<span class="preset-del" data-del="${p}">✕</span>` : ''}</div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.preset-opt').forEach(opt => opt.onclick = (e) => { if (e.target.classList.contains('preset-del')) return; handlePresetSelect(opt.dataset.val); });
  container.querySelectorAll('.preset-del').forEach(btn => btn.onclick = (e) => { 
    e.stopPropagation(); 
    const val = btn.dataset.del; 
    sparkyConfirm(`Remove [${val}] from Quick-Tunes?`, () => { 
      const up = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]').filter(x => x !== val); 
      localStorage.setItem('sparky_search_presets', JSON.stringify(up)); 
      
      const trigger = document.getElementById('presetTrigger');
      if (trigger && trigger.textContent === val.toUpperCase()) {
        trigger.textContent = 'QUICK-TUNE';
      }
      
      loadPresets(); 
    }); 
  });
}

function handlePresetSelect(val) {
  document.getElementById('presetOptions').classList.remove('show');
  if (val === 'ADD') {
    sparkyPrompt("Enter new discovery label:", "ADD QUICK-TUNE", (term) => {
      if (term?.trim()) {
        const c = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
        if (!c.includes(term.trim())) { 
          c.push(term.trim()); 
          localStorage.setItem('sparky_search_presets', JSON.stringify(c)); 
          loadPresets(); 
          handlePresetSelect(term.trim()); 
        }
      }
    });
  } else {
    document.getElementById('presetTrigger').textContent = val.toUpperCase();
    const inp = document.getElementById('searchInput'); 
    inp.value = val;
    if (window.syncSearchUI) window.syncSearchUI(); // Ensure 'X' appears
    switchTab('stations'); 
    searchStations(val);
  }
}


function loadSettingsOptions() {
  const dcCont = document.getElementById('defaultCountryOptions'), dlCont = document.getElementById('defaultLangOptions');
  if (!dcCont || !dlCont) return;

  const defC = localStorage.getItem('sparky_default_country') || 'ALL';
  const defL = localStorage.getItem('sparky_default_lang') || 'ALL';

  const dct = document.getElementById('defaultCountryTrigger');
  if (dct) dct.textContent = defC;
  const dlt = document.getElementById('defaultLangTrigger');
  if (dlt) dlt.textContent = defL === 'ALL' ? 'ALL' : defL.substring(0, 3).toUpperCase();

  dcCont.innerHTML = CTRY_LIST.map(c => {
    const name = CTRY_NAMES[c] || c;
    const display = c === 'ALL' ? 'ALL COUNTRIES' : `${name} · ${c}`;
    return `<div class="preset-opt${c === defC ? ' active' : ''}" data-val="${c}">${display}</div>`;
  }).join('');

  dlCont.innerHTML = LANG_LIST.map(l => {
    const name = l.charAt(0).toUpperCase() + l.slice(1);
    const code = l === 'ALL' ? 'ALL' : l.substring(0, 3).toUpperCase();
    const display = l === 'ALL' ? 'ALL LANGUAGES' : `${name} · ${code}`;
    return `<div class="preset-opt${l === defL ? ' active' : ''}" data-val="${l}">${display}</div>`;
  }).join('');

  dcCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => {
    const val = o.dataset.val;
    localStorage.setItem('sparky_default_country', val);
    document.getElementById('defaultCountryTrigger').textContent = val;
    dcCont.classList.remove('show');
    loadSettingsOptions();
    loadFilterOptions(); // Sync filter list order
  });

  dlCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => {
    const val = o.dataset.val;
    localStorage.setItem('sparky_default_lang', val);
    document.getElementById('defaultLangTrigger').textContent = val === 'ALL' ? 'ALL' : val.substring(0, 3).toUpperCase();
    dlCont.classList.remove('show');
    loadSettingsOptions();
    loadFilterOptions(); // Sync filter list order
  });

  const smCont = document.getElementById('statsModeOptions');
  if (smCont) {
    document.getElementById('statsModeTrigger').textContent = statsMode;
    smCont.innerHTML = ['FULL', 'COMPACT'].map(m => `<div class="preset-opt${m === statsMode ? ' active' : ''}" data-val="${m}">${m}</div>`).join('');
    smCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => {
      statsMode = o.dataset.val;
      localStorage.setItem('sparky_stats_mode', statsMode);
      document.getElementById('statsModeTrigger').textContent = statsMode;
      smCont.classList.remove('show');
      syncStatsUI();
      renderCurrent();
    });
  }
}
// ══ APP INITIALIZATION ══════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initEq();
  setEqPreset(activePreset);
  loadPresets();
  applyTextScale(textScale);
  const sv = localStorage.getItem('sparky_volume');
  if (sv !== null) {
    const vs = document.getElementById('volSlider');
    vs.value = sv;
    audioEl.volume = sv / 100;
    updateVolFill(vs);
  }
  filterHiFi = localStorage.getItem('sparky_default_hifi') !== 'false';
  const bhf = document.getElementById('btnHifi');
  if (bhf) bhf.classList.toggle('active', filterHiFi);

  loadFilterOptions();
  loadSettingsOptions();
  syncStatsUI();

  // ══ DEFAULTS TRIGGERS ══
  // ══ DEFAULTS TRIGGERS (Safe Bindings) ══
  bind('defaultCountryTrigger', (e) => { e.stopPropagation(); document.getElementById('defaultCountryOptions')?.classList.toggle('show'); });
  bind('defaultLangTrigger', (e) => { e.stopPropagation(); document.getElementById('defaultLangOptions')?.classList.toggle('show'); });
  bind('statsModeTrigger', (e) => { e.stopPropagation(); document.getElementById('statsModeOptions')?.classList.toggle('show'); });


  const hifiToggle = document.getElementById('defaultHifiToggle');
  const hifiTrack = document.getElementById('defaultHifiTrack');
  if (hifiToggle && hifiTrack) {
    hifiTrack.classList.toggle('on', filterHiFi);
    hifiToggle.onclick = () => {
      filterHiFi = !filterHiFi;
      hifiTrack.classList.toggle('on', filterHiFi);
      localStorage.setItem('sparky_default_hifi', filterHiFi);
      const bhf = document.getElementById('btnHifi');
      if (bhf) bhf.classList.toggle('active', filterHiFi);
    };
  }

  // MISSION CONTROL BINDINGS
  // Top controls removed from UI
  // btnAdd logic consolidated at L816
  // btnRemove logic consolidated at L865
  const searchInput = document.getElementById('searchInput');
  const btnSearchClear = document.getElementById('btnSearchClear');

  const toggleSearchClear = () => {
    btnSearchClear.style.display = searchInput.value ? 'flex' : 'none';
  };

  searchInput.oninput = toggleSearchClear;

  btnSearchClear.onclick = () => {
    searchInput.value = '';
    searchInput.focus();
    toggleSearchClear();
    document.getElementById('presetTrigger').textContent = 'QUICK-TUNE';
    searchStations('', false); // Explicit clear
  };
  
  // Expose toggle for programmatic use
  window.syncSearchUI = toggleSearchClear;
  document.getElementById('btnEq').onclick = () => {
    const r = document.getElementById('eqRack');
    const np = document.querySelector('.now-playing');
    const isOpen = r.classList.toggle('open');
    np?.classList.toggle('eq-open', isOpen);
    document.querySelector('.app')?.classList.toggle('eq-mode', isOpen);
    document.getElementById('btnEq').classList.toggle('active', isOpen);
    
    if (isOpen) {
      wasCollapsedBeforeEQ = document.getElementById('filterRack').classList.contains('collapsed');
      document.getElementById('filterRack').classList.add('collapsed');
      document.getElementById('btnFilterToggle').classList.add('active');
    } else {
      if (!wasCollapsedBeforeEQ) {
        document.getElementById('filterRack').classList.remove('collapsed');
        document.getElementById('btnFilterToggle').classList.remove('active');
      }
    }
  };

  document.getElementById('volSlider').oninput = (e) => {
    const v = e.target.value;
    audioEl.volume = v / 100;
    localStorage.setItem('sparky_volume', v);
    updateVolFill(e.target);
  };

  // ══ CONSOLIDATED DOM BINDINGS (ELIMINATE TYPEERROR) ══
  function bind(id, fn, ev = 'onclick') { const el = document.getElementById(id); if (el) el[ev] = fn; }

  bind('btnSearch', () => {
    const q = document.getElementById('searchInput').value.trim();
    expandFilters(); if (q) { switchTab('stations'); searchStations(q); }
  });
  bind('btnFilterToggle', toggleFilters);
  bind('btnPlayFooter', () => togglePlay());
  bind('btnNextFooter', () => {
    const l = activeTab === 'favs' ? favs : stations;
    if (l.length) playAtIndex((currentIdx + 1) % l.length);
  });
  bind('btnPrevFooter', () => {
    const l = activeTab === 'favs' ? favs : stations;
    if (l.length) playAtIndex((currentIdx - 1 + l.length) % l.length);
  });

  bind('btnAdd', handleAddStation);
  bind('btnRemove', handleRemoveStation);
  bind('filterCountryTrigger', (e) => { e.stopPropagation(); document.getElementById('filterCountryOptions')?.classList.toggle('show'); });
  bind('filterLangTrigger', (e) => { e.stopPropagation(); document.getElementById('filterLangOptions')?.classList.toggle('show'); });
  bind('btnHifi', () => {
    filterHiFi = !filterHiFi;
    const btn = document.getElementById('btnHifi');
    if (btn) btn.classList.toggle('active', filterHiFi);
    updateNowPlaying(currentSrc); 
    if (activeTab === 'favs') {
      renderFavs();
    } else {
      searchStations(document.getElementById('searchInput').value, true); 
    }
  });
  bind('presetTrigger', (e) => { e.stopPropagation(); document.getElementById('presetOptions')?.classList.toggle('show'); });

  // ══ BACKDROP CLICK LISTENER ══
  window.addEventListener('click', () => {
    ['presetOptions', 'filterCountryOptions', 'filterLangOptions', 'defaultCountryOptions', 'defaultLangOptions', 'statsModeOptions'].forEach(id => {
      document.getElementById(id)?.classList.remove('show');
    });
  });

  // ══ SYSTEM & UTILITY BINDINGS (SAFE) ══
  bind('btnCopyLogs', () => window.copyLogs());
  bind('btnAuditFavs', () => window.auditFavs());
  bind('btnExportFavs', handleExport);
  bind('btnImportFavs', () => document.getElementById('importFile').click());
  bind('importFile', handleImport, 'onchange');
  bind('sparkyModalOk', () => closeSparkyModal(true));
  bind('sparkyModalCancel', () => closeSparkyModal(false));

  bind('statusCluster', () => {
    const sm = document.getElementById('settingsModal');
    if (sm) { sm.style.display = 'flex'; updateDeploymentUI(); }
  });
  bind('btnSettingsClose', () => {
    const sm = document.getElementById('settingsModal');
    if (sm) sm.style.display = 'none';
  });
  bind('btnOpenDebug', () => {
    const sm = document.getElementById('settingsModal');
    const dm = document.getElementById('debugModal');
    if (sm) sm.style.display = 'none';
    if (dm) dm.style.display = 'flex';
  });
  bind('btnDebugClose', () => {
    const dm = document.getElementById('debugModal');
    if (dm) dm.style.display = 'none';
  });

  // ══ INTERFACE SCALE BINDINGS ══
  bind('textScaleSlider', (e) => applyTextScale(parseFloat(e.target.value)), 'oninput');
  bind('btnResetScale', () => applyTextScale(1.0));

  // ══ SORT MODE BINDING ══
  bind('btnSortMode', () => {
    const modes = activeTab === 'stations' ? ['power', 'vote'] : ['power', 'vote', 'custom'];
    let idx = (modes.indexOf(sortMode) + 1) % modes.length;
    sortMode = modes[idx];
    if (activeTab === 'favs') {
      favSortMode = sortMode;
      localStorage.setItem('sparky_fav_sort_mode', favSortMode);
    }
    updateSortUI();
    renderCurrent();
    const tip = document.getElementById('plSortTooltip');
    if (tip) {
      tip.classList.add('show');
      clearTimeout(sortTooltipTimeout);
      sortTooltipTimeout = setTimeout(() => tip.classList.remove('show'), 1500);
    }
  });

  // ══ LAST STATION RESTORATION ══
  const last = localStorage.getItem('sparky_last_station');
  if (last) {
    try {
      currentSrc = JSON.parse(last);
      updateNowPlaying(currentSrc);
    } catch(e) { console.warn("Failed to restore last station", e); }
  }

  updateDeploymentUI();
  refreshFavBadge();
  updateSortUI(); 
  bind('presetTrigger', () => { /* Logic already handled at L1470 */ }, 'textContent', 'QUICK-TUNE');
  // Just set the text directly if safe
  const pt = document.getElementById('presetTrigger');
  if (pt) pt.textContent = 'QUICK-TUNE';
  bind('btnScan', () => searchStations(searchInput.value, true));
  const lastQ = localStorage.getItem('sparky_last_query');
  if (lastQ !== null) {
    if (searchInput) searchInput.value = lastQ;
    searchStations(lastQ);
  }
  
  if (window.syncSearchUI) window.syncSearchUI();
});

function updateSortUI() {
  const btn = document.getElementById('btnSortMode');
  const tip = document.getElementById('plSortTooltip');
  if (!btn || !tip) return;

  btn.innerHTML = `<span class="material-symbols-outlined">sort</span>`;

  const modes = activeTab === 'stations' ? ['power', 'vote'] : ['power', 'vote', 'custom'];
  const labels = { power: 'Power Ranking', vote: 'Vote Ranking', custom: 'Custom Order' };
  const icons = { power: 'bolt', vote: 'how_to_vote', custom: 'star' };

  tip.innerHTML = modes.map(m => `
    <div class="pl-sort-row${sortMode === m ? ' active' : ''}">
      <span class="material-symbols-outlined">${icons[m]}</span>
      <span class="sort-desc">${labels[m]}</span>
    </div>
  `).join('');
}


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
}

function updateMediaSession(st) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: st.countrycode, album: 'SPARKY RADIO' });
}

window.setEqPreset = setEqPreset;
window.saveCustomEq = saveCustomEq;
window.resetEqDefaults = resetEqDefaults;
window.updateDeploymentUI = updateDeploymentUI;
