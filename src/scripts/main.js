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

let BUILD_COMMIT = "__COMMIT_HASH__";
let BUILD_REF = "__COMMIT_MSG__";

function updateDeploymentUI() {
  const idEl = document.getElementById('sigID');
  const refEl = document.getElementById('sigREF');
  const tsEl = document.getElementById('sigTS');
  if (!idEl) return;

  if (BUILD_COMMIT.startsWith('__')) BUILD_COMMIT = 'LOCAL_DEV';
  if (BUILD_REF.startsWith('__')) BUILD_REF = 'Smart-Tune Pro (Dev Mode)';

  const modDate = new Date(document.lastModified);
  const ts = (modDate.getMonth() + 1).toString().padStart(2, '0') + '/' +
    modDate.getDate().toString().padStart(2, '0') + ' ' +
    modDate.getHours().toString().padStart(2, '0') + ':' +
    modDate.getMinutes().toString().padStart(2, '0');

  idEl.textContent = BUILD_COMMIT.substring(0, 7);
  refEl.textContent = BUILD_REF.length > 30 ? BUILD_REF.substring(0, 27) + '...' : BUILD_REF;
  tsEl.textContent = ts;
}

let audioCtx, analyser, srcNode;
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
function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } }
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
  return fv.some(f => (uuid && (f.id === uuid || f.stationuuid === uuid)) || norm(f.url) === norm(u));
}

function addFav(st) {
  const favs = loadFavs(), u = st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id || '';
  if (!favs.some(f => (uuid && (f.id === uuid || f.stationuuid === uuid)) || norm(f.url) === norm(u))) {
    favs.push({
      id: uuid,
      name: st.name,
      url: u,
      bitrate: st.bitrate,
      codec: st.codec,
      countrycode: st.countrycode,
      tags: st.tags || '',
      votes: st.votes
    });
    saveFavs(favs);
  }
  refreshFavBadge();
}

function removeFavByUrl(u) {
  saveFavs(loadFavs().filter(f => norm(f.url) !== norm(u)));
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
  bass: [5, 4, 2, 0, -1, -1, 1, 2],
  vocal: [-2, -1, 0, 2, 4, 5, 3, 2],
  jazz: [2, 2, 1, 0, 2, 3, 2, 2],
  pop: [2, 1, 0, 1, 2, 3, 3, 4],
  rock: [4, 3, 1, -1, 0, 2, 3, 3],
  hiphop: [5, 4, 2, 0, 1, 2, 2, 3],
  classic: [0, 0, 0, 1, 2, 3, 2, 2],
  electron: [4, 3, 1, 0, 0, 2, 3, 4],
  custom: [3, 2, 1, 0, 1, 2, 2, 3]
};

let currentPresets = JSON.parse(localStorage.getItem('sparky_eq_presets') || JSON.stringify(FACTORY_PRESETS));
let activePreset = 'flat';
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

// ══ EQ BINDINGS ═══════════════════════════
document.getElementById('btnEq').onclick = function() {
  const rack = document.getElementById('eqRack');
  const isOpen = rack.classList.toggle('open');
  this.classList.toggle('active', isOpen);

  if (isOpen) {
    wasCollapsedBeforeEQ = document.getElementById('filterRack').classList.contains('collapsed');
    if (!wasCollapsedBeforeEQ) toggleFilters();
  } else {
    if (!wasCollapsedBeforeEQ) expandFilters();
  }
};

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.onclick = () => {
    const id = btn.id.replace('pre-', '');
    setEqPreset(id);
  };
});

document.querySelector('.btn-save').onclick = saveCustomEq;
document.querySelector('.btn-reset').onclick = resetEqDefaults;

function saveCustomEq() {
  const p = activePreset.toUpperCase();
  sparkyConfirm(`Commit current levels to the [${p}] memory bank?`, () => {
    currentPresets[activePreset] = [...eqVals];
    lastSavedVals = [...eqVals];
    localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
    updateSaveButtonState();
    sparkyAlert(`Preset [${p}] updated.`, "SAVE SUCCESSFUL");
  }, "CONFIRM MEMORY WRITE");
}

function resetEqDefaults() {
  sparkyConfirm(`RESTORE FACTORY SPECS: Reset [${activePreset.toUpperCase()}] to original levels?`, () => {
    currentPresets[activePreset] = [...FACTORY_PRESETS[activePreset]];
    localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
    setEqPreset(activePreset);
  }, "PRESET RECOVERY");
}

// ══ MODALS ═════════════════════════════════
function sparkyAlert(msg, header = "SYSTEM MESSAGE") {
  document.getElementById('sparkyModalHeader').textContent = header;
  document.getElementById('sparkyModalText').textContent = msg;
  document.getElementById('sparkyModalCancel').style.display = 'none';
  document.getElementById('sparkyModal').style.display = 'flex';
  document.getElementById('sparkyModalOk').onclick = () => { document.getElementById('sparkyModal').style.display = 'none'; };
}

function sparkyConfirm(msg, onOk, header = "SYSTEM CONFIRM") {
  document.getElementById('sparkyModalHeader').textContent = header;
  document.getElementById('sparkyModalText').textContent = msg;
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
  text.innerHTML = `<div style="margin-bottom:10px">${msg}</div><input type="text" id="sparkyPromptInput" style="width:100%; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:8px; outline:none; border-radius:2px;">`;
  cancel.style.display = 'inline-block';
  modal.style.display = 'flex';
  const input = document.getElementById('sparkyPromptInput');
  if (input) {
    input.focus();
    input.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); };
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

// ══ AUDIO INIT ════════════════════════════
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 64;
  srcNode = audioCtx.createMediaElementSource(audioEl);
  let chain = srcNode;
  EQ_FREQS.forEach((freq, i) => {
    const f = audioCtx.createBiquadFilter();
    f.type = i === 0 ? 'lowshelf' : i === 7 ? 'highshelf' : 'peaking';
    f.frequency.value = freq; f.gain.value = eqVals[i];
    eqNodes.push(f); chain.connect(f); chain = f;
  });
  chain.connect(analyser); analyser.connect(audioCtx.destination);
}

// ══ VISUALIZER ════════════════════════════
const vizBars = document.querySelectorAll('.visualizer .bar');
const vizData = new Uint8Array(28);

function drawViz() {
  rafId = requestAnimationFrame(drawViz);
  if (!analyser) return;
  analyser.getByteFrequencyData(vizData);
  vizBars.forEach((b, i) => { b.style.height = (4 + (vizData[i] || 0) / 255 * 22) + 'px'; });
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
    const duration = (textWidth + containerWidth) / 50;
    nm.style.animationDuration = duration + 's';
  }
  const votes = document.getElementById('npVotes');
  const clicks = document.getElementById('npClicks');
  const trend = document.getElementById('npTrend');
  const country = document.getElementById('npCountry');
  const codec = document.getElementById('npCodec');
  if (votes) votes.textContent = fmtK(st?.votes || 0);
  if (clicks) clicks.textContent = fmtK(st?.clickcount || 0);
  if (trend) trend.textContent = (st?.clicktrend !== undefined) ? (st.clicktrend > 0 ? '+' + st.clicktrend : st.clicktrend) : '—';
  if (country) country.textContent = st?.countrycode || '—';
  if (codec) codec.textContent = st?.codec || '—';
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
    audioEl.src = url; audioEl.play().then(onPlaySuccess).catch(onPlayError);
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
  isPlaying = false; currentSrc = null;
  setStatus('', 'IDLE');
  syncPlayBtns();
  idleViz(); renderCurrent();
}

function renderCurrent() { activeTab === 'stations' ? renderStations() : renderFavs(); }

// ══ RENDERERS ══════════════════════════════
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
  pl.innerHTML = stations.map((st, i) => {
    const url = st.url_resolved || st.url;
    const actv = currentSrc && (currentSrc.stationuuid === st.stationuuid || norm(currentSrc.url) === norm(url)) && activeTab === 'stations';
    const favd = isFav(st);
    return `<div class="pl-item${actv ? ' active' : ''}" data-idx="${i}">
      <div class="pl-sidebar"><div class="pl-num">${actv ? '▶' : (i + 1).toString().padStart(2, '0')}</div></div>
      <div class="pl-main">
        <div class="pl-item-name-row">
          <div class="pl-item-name">${esc(st.name)}</div>
          <div class="pl-item-actions">
            <button class="pl-fav${favd ? ' is-fav' : ''}" data-fav="${i}">${favd ? '− FAV' : '+ FAV'}</button>
            <button class="pl-remove" data-rmst="${i}">✕</button>
          </div>
        </div>
        <div class="pl-item-sub-row">
          <div class="pl-item-sub">${esc(st.countrycode || '--')} · ${esc((st.tags || '').split(',').slice(0, 2).join(', ') || 'radio')}</div>
          <div class="pl-badge-group">
            <div class="pl-badge-mini"><i>🔥</i> ${fmtK(st.clickcount)}</div>
            <div class="pl-badge-mini"><i>👍</i> ${fmtK(st.votes)}</div>
            <div class="pl-badge-mini"><i>📈</i> ${(st.clicktrend || 0) > 0 ? '+' + st.clicktrend : (st.clicktrend || 0)}</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  pl.querySelectorAll('.pl-item').forEach(el => el.onclick = (e) => {
    if (e.target.closest('button')) return;
    currentIdx = parseInt(el.dataset.idx); playAtIndex(currentIdx);
  });
  pl.querySelectorAll('.pl-fav').forEach(btn => btn.onclick = (e) => {
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
  pl.innerHTML = favs.map((st, i) => {
    const actv = currentSrc && (currentSrc.id === st.id || norm(currentSrc.url) === norm(st.url)) && activeTab === 'favs';
    const isManual = sortMode === 'custom';
    return `<div class="pl-item${actv ? ' active' : ''}" data-idx="${i}">
      <div class="pl-sidebar">
        ${isManual ? `<button class="btn-stack" data-up="${i}">▲</button>` : ''}
        <div class="pl-num">${actv ? '▶' : (i + 1).toString().padStart(2, '0')}</div>
        ${isManual ? `<button class="btn-stack" data-down="${i}">▼</button>` : ''}
      </div>
      <div class="pl-main">
        <div class="pl-item-name-row">
          <div class="pl-item-name">${esc(st.name)}</div>
          <div class="pl-item-actions">
            <button class="pl-edit" data-edit="${i}">✎</button>
            <button class="pl-remove" data-rmfav="${i}">✕</button>
          </div>
        </div>
        <div class="pl-item-sub-row">
          <div class="pl-item-sub">${esc(st.countrycode || '--')} · ${esc((st.tags || '').split(',').slice(0, 2).join(', ') || 'radio')}</div>
          <div class="pl-badge-group">
            <div class="pl-badge-mini"><i>🔥</i> ${fmtK(st.clickcount)}</div>
            <div class="pl-badge-mini"><i>👍</i> ${fmtK(st.votes)}</div>
            <div class="pl-badge-mini"><i>📈</i> ${(st.clicktrend || 0) > 0 ? '+' + st.clicktrend : (st.clicktrend || 0)}</div>
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
    e.stopPropagation(); const f = favs[btn.dataset.rmfav];
    sparkyConfirm(`Remove [${f.name}]?`, () => { removeFavByUrl(f.url); renderFavs(); });
  });
  pl.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const idx = btn.dataset.edit; const st = favs[idx];
    openEditModal(st.name, st.url, (n, u) => {
      if (n) { let m = loadFavs(); m[idx].name = n; m[idx].url = u; saveFavs(m); renderFavs(); }
    });
  });
  pl.querySelectorAll('[data-up]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const idx = parseInt(btn.dataset.up);
    let m = loadFavs(); if (idx > 0) { [m[idx - 1], m[idx]] = [m[idx], m[idx - 1]]; saveFavs(m); renderFavs(); }
  });
  pl.querySelectorAll('[data-down]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const idx = parseInt(btn.dataset.down);
    let m = loadFavs(); if (idx < m.length - 1) { [m[idx + 1], m[idx]] = [m[idx], m[idx + 1]]; saveFavs(m); renderFavs(); }
  });
}

// ══ TRANSPORT ══════════════════════════════
document.getElementById('btnPlay').onclick = () => {
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  if (!isPlaying) {
    if (currentSrc) audioEl.play().then(() => { isPlaying = true; setStatus('playing', 'CONNECTED'); syncPlayBtns(); drawViz(); });
    else { const l = activeTab === 'favs' ? loadFavs() : stations; if (l.length) playAtIndex(0); }
  } else { audioEl.pause(); isPlaying = false; setStatus('', 'PAUSED'); syncPlayBtns(); idleViz(); }
};
document.getElementById('btnStop').onclick = stopPlayback;
document.getElementById('btnNext').onclick = () => { 
  const l = activeTab === 'favs' ? favs : stations; 
  if (l.length) playAtIndex((currentIdx + 1) % l.length); 
};
document.getElementById('btnPrev').onclick = () => { 
  const l = activeTab === 'favs' ? favs : stations; 
  if (l.length) playAtIndex((currentIdx - 1 + l.length) % l.length); 
};

// ══ FOOTER ACTIONS ════════════════════════
document.getElementById('btnAdd').onclick = () => {
  sparkyPrompt("Enter stream URL:", "ADD CUSTOM STATION", (url) => {
    if (!url) return;
    sparkyPrompt("Enter station name:", "STATION IDENTITY", (name) => {
      stations.push({ name: name || 'Custom Station', url_resolved: url, url, bitrate: '', codec: '', countrycode: '', tags: '' });
      switchTab('stations');
    });
  });
};

document.getElementById('btnRemove').onclick = () => {
  if (currentIdx < 0) {
    sparkyAlert("SELECT A STATION FROM THE LIST TO REMOVE", "SELECTION REQUIRED");
    return;
  }
  if (activeTab === 'favs') {
    const f = loadFavs()[currentIdx];
    sparkyConfirm(`Remove [${f.name}] from favorites?`, () => {
      removeFavByUrl(f.url); stopPlayback(); renderFavs();
    });
  } else {
    const st = stations[currentIdx];
    sparkyConfirm(`Remove [${st.name}] from list?`, () => {
      stations.splice(currentIdx, 1); stopPlayback(); renderStations();
    });
  }
};

// FOOTER MINI-PLAYER BINDINGS
const playBtn = document.getElementById('btnPlay');
const playBtnFooter = document.getElementById('btnPlayFooter');

const syncPlayBtns = () => {
  const html = isPlaying ? '&#9646;&#9646; PAUSE' : '&#9654; PLAY';
  if (playBtn) playBtn.innerHTML = html;
  if (playBtnFooter) playBtnFooter.innerHTML = html;
};

document.getElementById('btnPlayFooter').onclick = () => document.getElementById('btnPlay').click();
document.getElementById('btnStopFooter').onclick = () => stopPlayback();
document.getElementById('btnNextFooter').onclick = () => document.getElementById('btnNext').click();
document.getElementById('btnPrevFooter').onclick = () => document.getElementById('btnPrev').click();

// ══ SEARCH ════════════════════════════════
async function searchStations(q) {
  if (isSearching) return;
  const hasFilters = filterCountry !== 'ALL' || filterLang !== 'ALL' || filterHiFi;
  if (!q && !hasFilters) { stations = []; renderStations(); return; }
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
  let success = false;
  for (const srv of mirrors) {
    try {
      const params = { limit: 250, hidebroken: true, order: 'clickcount', reverse: true };
      if (apiQ) params.name = apiQ;
      if (filterCountry !== 'ALL') params.countrycode = filterCountry;
      if (filterLang !== 'ALL') params.language = filterLang.toLowerCase();
      const res = await fetch(`https://${srv}/json/stations/search?` + new URLSearchParams(params));
      if (!res.ok) continue;
      const raw = await res.json();
      let filtered = raw.filter(st => {
        const blob = (st.name + " " + (st.tags || '')).toLowerCase();
        for (const ex of excluded) if (blob.includes(ex)) return false;
        for (const req of required) if (!blob.includes(req)) return false;
        return true;
      });
      if (filterHiFi) filtered = filtered.filter(s => Number(s.bitrate || 0) >= 128);
      stations = filtered;
      success = true; break;
    } catch (e) {}
  }
  if (success) renderStations();
  else if (pl) pl.innerHTML = '<div class="pl-empty">⚠ ALL MIRRORS UNREACHABLE</div>';
  isSearching = false;
}

document.getElementById('btnSearch').onclick = () => {
  const q = document.getElementById('searchInput').value.trim();
  expandFilters(); if (q) { switchTab('stations'); searchStations(q); }
};

// ══ FILTERS & PRESETS ══════════════════════
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
document.getElementById('btnFilterToggle').onclick = toggleFilters;

// ══ SETTINGS & UI ══════════════════════════
document.getElementById('statusCluster').onclick = () => {
  document.getElementById('settingsModal').style.display = 'flex';
  updateDeploymentUI();
};
document.getElementById('btnSettingsClose').onclick = () => {
  document.getElementById('settingsModal').style.display = 'none';
};
document.getElementById('btnOpenDebug').onclick = () => {
  document.getElementById('settingsModal').style.display = 'none';
  document.getElementById('debugModal').style.display = 'flex';
};
document.getElementById('btnDebugClose').onclick = () => {
  document.getElementById('debugModal').style.display = 'none';
};
document.getElementById('btnCopyLogs').onclick = () => window.copyLogs();
document.getElementById('btnAuditFavs').onclick = () => window.auditFavs();

function applyTextScale(val) {
  textScale = val;
  document.documentElement.style.setProperty('--text-scale', val);
  localStorage.setItem('sparky_text_scale', val);
  const label = document.getElementById('textScaleLabel');
  const slider = document.getElementById('textScaleSlider');
  if (label) label.textContent = `${Math.round(val * 100)}% ${val === 1.0 ? '(DEFAULT)' : ''}`;
  if (slider) slider.value = val;
}
document.getElementById('textScaleSlider').oninput = (e) => applyTextScale(parseFloat(e.target.value));
document.getElementById('btnResetScale').onclick = () => applyTextScale(1.0);

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
  lCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => { filterLang = o.dataset.val; document.getElementById('filterLangTrigger').textContent = filterLang === 'ALL' ? 'ALL' : filterLang.substring(0,3).toUpperCase(); lCont.classList.remove('show'); searchStations(document.getElementById('searchInput').value); });
}

document.getElementById('filterCountryTrigger').onclick = (e) => { e.stopPropagation(); document.getElementById('filterCountryOptions').classList.toggle('show'); };
document.getElementById('filterLangTrigger').onclick = (e) => { e.stopPropagation(); document.getElementById('filterLangOptions').classList.toggle('show'); };

document.getElementById('btnHifi').onclick = () => {
  filterHiFi = !filterHiFi;
  document.getElementById('btnHifi').classList.toggle('active', filterHiFi);
  searchStations(document.getElementById('searchInput').value);
};

const defaultPresets = ["Jazz", "Blues", "Rock", "Pop", "Classical", "News", "Country", "80s", "90s", "Charts"];
function loadPresets() {
  const custom = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
  const all = [...new Set([...defaultPresets, ...custom])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const container = document.getElementById('presetOptions');
  if (!container) return;
  let html = `<div class="preset-opt add-opt" data-val="ADD">+ ADD NEW PRESET</div>`;
  all.forEach(p => {
    const isDefault = defaultPresets.includes(p);
    html += `<div class="preset-opt" data-val="${p}"><span>${p}</span>${!isDefault ? `<span class="preset-del" data-del="${p}">✕</span>` : ''}</div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.preset-opt').forEach(opt => opt.onclick = (e) => { if (e.target.classList.contains('preset-del')) return; handlePresetSelect(opt.dataset.val); });
  container.querySelectorAll('.preset-del').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); const val = btn.dataset.del; sparkyConfirm(`Remove [${val}]?`, () => { const up = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]').filter(x => x !== val); localStorage.setItem('sparky_search_presets', JSON.stringify(up)); loadPresets(); }); });
}

function handlePresetSelect(val) {
  document.getElementById('presetOptions').classList.remove('show');
  if (val === 'ADD') {
    sparkyPrompt("Enter search term:", "NEW PRESET", (term) => {
      if (term?.trim()) {
        const c = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
        if (!c.includes(term.trim())) { c.push(term.trim()); localStorage.setItem('sparky_search_presets', JSON.stringify(c)); loadPresets(); handlePresetSelect(term.trim()); }
      }
    });
  } else {
    document.getElementById('presetTrigger').textContent = val;
    const inp = document.getElementById('searchInput'); inp.value = val;
    switchTab('stations'); searchStations(val);
  }
}

document.getElementById('presetTrigger').onclick = (e) => { e.stopPropagation(); document.getElementById('presetOptions').classList.toggle('show'); };

window.addEventListener('click', () => {
  document.getElementById('presetOptions')?.classList.remove('show');
  document.getElementById('filterCountryOptions')?.classList.remove('show');
  document.getElementById('filterLangOptions')?.classList.remove('show');
  document.getElementById('defaultCountryOptions')?.classList.remove('show');
  document.getElementById('defaultLangOptions')?.classList.remove('show');
});

function loadSettingsOptions() {
  const dcCont = document.getElementById('defaultCountryOptions'), dlCont = document.getElementById('defaultLangOptions');
  if (!dcCont || !dlCont) return;

  const defC = localStorage.getItem('sparky_default_country') || 'ALL';
  const defL = localStorage.getItem('sparky_default_lang') || 'ALL';

  document.getElementById('defaultCountryTrigger').textContent = defC;
  document.getElementById('defaultLangTrigger').textContent = defL === 'ALL' ? 'ALL' : defL.substring(0,3).toUpperCase();

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
    document.getElementById('defaultLangTrigger').textContent = val === 'ALL' ? 'ALL' : val.substring(0,3).toUpperCase();
    dlCont.classList.remove('show');
    loadSettingsOptions();
    loadFilterOptions(); // Sync filter list order
  });
}

document.getElementById('defaultCountryTrigger').onclick = (e) => { e.stopPropagation(); document.getElementById('defaultCountryOptions').classList.toggle('show'); };
document.getElementById('defaultLangTrigger').onclick = (e) => { e.stopPropagation(); document.getElementById('defaultLangOptions').classList.toggle('show'); };

// ══ INIT ══════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initEq();
  loadPresets();
  applyTextScale(textScale);
  const sv = localStorage.getItem('sparky_volume'); if (sv !== null) { document.getElementById('volSlider').value = sv; audioEl.volume = sv / 100; }
  filterHiFi = localStorage.getItem('sparky_default_hifi') !== 'false';
  document.getElementById('btnHifi').classList.toggle('active', filterHiFi);
  
  loadFilterOptions();
  loadSettingsOptions();
  
  const hifiToggle = document.getElementById('defaultHifiToggle');
  const hifiTrack = document.getElementById('defaultHifiTrack');
  if (hifiToggle && hifiTrack) {
    hifiTrack.classList.toggle('on', filterHiFi);
    hifiToggle.onclick = () => {
      filterHiFi = !filterHiFi;
      hifiTrack.classList.toggle('on', filterHiFi);
      localStorage.setItem('sparky_default_hifi', filterHiFi);
      document.getElementById('btnHifi').classList.toggle('active', filterHiFi);
    };
  }

  updateDeploymentUI();
  searchStations('jazz');
});

function updateSortUI() {
  const btn = document.getElementById('btnSortMode');
  const tip = document.getElementById('plSortTooltip');
  if (!btn || !tip) return;

  const icon = sortMode === 'power' ? 'bolt' : (sortMode === 'vote' ? 'how_to_vote' : 'star');
  btn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;

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

document.getElementById('btnSortMode').onclick = () => {
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
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

function updateMediaSession(st) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: st.countrycode, album: 'SPARKY RADIO' });
}

window.setEqPreset = setEqPreset;
window.saveCustomEq = saveCustomEq;
window.resetEqDefaults = resetEqDefaults;
window.updateDeploymentUI = updateDeploymentUI;
