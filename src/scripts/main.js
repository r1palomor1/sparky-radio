/**
 * SPARKY RADIO Â· CORE LOGIC
 * 1:1 FIDELITY RESTORATION FROM index.html.bak
 * Modularized for production but preserving all legacy behaviors, 
 * bug fixes, and structural improvements.
 */

// â•â• PRO-DEBUGGER INTERCEPTOR â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    if (!favs.length) { console.warn('Favorites list is empty.'); return; }
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

  let m3uCache = null;
  async function fetchM3UBackup() {
    if (m3uCache) return m3uCache;
    try {
      console.log('[RESCUE] Fetching Backup Repository...');
      const res = await fetch('https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/allradio.net/---everything-full.m3u');
      if (!res.ok) throw new Error('Repo unreachable');
      m3uCache = await res.text();
      return m3uCache;
    } catch (e) {
      console.error('[RESCUE_FETCH_ERROR]', e);
      return null;
    }
  }

  window.activeRescueFromM3U = async function (st) {
    const m3u = await fetchM3UBackup();
    if (!m3u) return false;

    const targetName = st.name.toLowerCase().trim();
    const lines = m3u.split('\n');

    // Attempt high-fidelity match using name fingerprint
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const namePart = line.split(',')[1];
        if (namePart && namePart.toLowerCase().trim() === targetName) {
          const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
          if (nextLine && nextLine.startsWith('http')) {
            console.log(`[ACTIVE_RESCUE] MATCH FOUND: ${st.name} -> ${nextLine}`);
            st.url = nextLine;
            st.url_resolved = nextLine;
            st.isRescued = true;
            syncFavMetadata(st);
            return true;
          }
        }
      }
    }

    // Fuzzy fallback if exact match fails
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const namePart = line.split(',')[1];
        if (namePart && namePart.toLowerCase().trim().includes(targetName)) {
          const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
          if (nextLine && nextLine.startsWith('http')) {
            console.log(`[ACTIVE_RESCUE] FUZZY MATCH FOUND: ${st.name} -> ${nextLine}`);
            st.url = nextLine;
            st.url_resolved = nextLine;
            st.isRescued = true;
            syncFavMetadata(st);
            return true;
          }
        }
      }
    }
    return false;
  };
})();

// â•â• STORAGE MIGRATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â• STATE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const audioEl = document.getElementById('audioEl');
let stations = [];
let activeTab = 'favs';
let sortMode = 'pwr';
let favSortMode = localStorage.getItem('sparky_fav_sort_mode') || 'pwr';
let favViewMode = localStorage.getItem('sparky_fav_view') || 'list';
let collapsedCategories = JSON.parse(localStorage.getItem('sparky_collapsed_cats') || '[]');
let lastRenderedList = []; // Cache of exactly what is on screen
let currentIdx = -1;
let isSearching = false;
let currentSrc = null;
let isPlaying = false;
let activeSearchPreset = '';
let favs = []; // Global synced favorites list
let textScale = parseFloat(localStorage.getItem('sparky_text_scale')) || 1.0;
let shuffle = false;
let repeat = false;
let rafId, hls;
let filterCountry = 'ALL';
let filterLang = 'ALL';
let panelColor = localStorage.getItem('sparky_panel_color') || '#061021';
let searchQuery = '';
let filterHiFi = false;
let isSyncingFavs = false;
let customCategories = JSON.parse(localStorage.getItem('sparky_custom_categories') || '[]');
let discoveryCategoryFilter = 'ALL';
let discoveryScrollMap = {};


let wasCollapsedBeforeEQ = false; // State persistence for EQ engaged mode
let scrollPositions = { stations: 0, favs: 0 };
const APP_CODENAME = "Smart-Tune Pro";

let wasPlayingBeforeOffline = false;
let offlineRetryCount = 0;
const MAX_OFFLINE_RETRIES = 3;


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
  }).format(modDate).replace(',', ' \u00B7');
  tsEl.textContent = ts;
}



let audioCtx, analyser, srcNode;
let freqData;
let smoothedBands = new Float32Array(128); // Pre-init for high-density bars
let sortTooltipTimeout;



// â•â• THEME INITIALIZATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
if (window.initThemeEngine) {
  // If we're on localhost, clear any stale service worker caches to prevent the "broken UI" bug
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    if ('caches' in window) {
      caches.keys().then(names => {
        for (let name of names) caches.delete(name);
      });
    }
  }
  window.initThemeEngine();
}

// â•â• FAVORITES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const FAV_KEY = 'sparky_favorites';
const USAGE_KEY = 'sparky_usage_stats';
let usagePulseTimer;
let lastCountedId = null;

function loadUsage() {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY)) || {}; } catch { return {}; }
}
function saveUsage(data) { localStorage.setItem(USAGE_KEY, JSON.stringify(data)); }

function getRecentStations() {
  const stats = loadUsage();
  const fv = loadFavs();

  return Object.values(stats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50) // Internal Top 50
    .filter(st => st.count > 0) // Filter out items with 0 count (reset items)
    .slice(0, 10) // Display Top 10
    .map(st => {
      const favMatch = fv.find(f => (st.stationuuid && f.stationuuid === st.stationuuid) || (f.url && st.url && norm(f.url) === norm(st.url)));
      // DEEP MERGE: If it's a favorite, use the Vault data as the base, then overlay usage count
      if (favMatch) {
        return { ...favMatch, count: st.count, lastPlayed: st.lastPlayed, isRecentMemory: true, isFav: true };
      }
      return { ...st, isRecentMemory: true, isFav: false };
    });
}


function trackUsage(st) {
  if (!st) return;
  if (usagePulseTimer) clearTimeout(usagePulseTimer);

  // 2-minute (120,000ms) "Meaningful Play" validation pulse
  usagePulseTimer = setTimeout(() => {
    // Verify we are still playing the same station
    if (!currentSrc || (st.stationuuid && currentSrc.stationuuid !== st.stationuuid)) return;

    const id = st.stationuuid || st.id || `${st.name}_${st.url}`;

    // SEQUENTIAL SESSION FILTER: Don't count back-to-back plays of the same station
    if (id === lastCountedId) {
      console.log(`[PULSE] Session continuation detected for ${st.name}. Skipping redundant count.`);
      return;
    }

    const stats = loadUsage();
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;

    if (!stats[id]) {
      stats[id] = {
        count: 0,
        lastPlayed: 0,
        name: st.name,
        url: st.url_resolved || st.url,
        favicon: st.favicon || '',
        tags: st.tags || '',
        countrycode: st.countrycode || '',
        stationuuid: st.stationuuid || st.id || '',
        votes: st.votes || 0,
        clickcount: st.clickcount || st.c || 0,
        clicktrend: st.clicktrend || 0
      };
    }

    // 1-HOUR RATE LIMIT: Only increment the play count if an hour has passed
    if (stats[id].lastPlayed && (now - stats[id].lastPlayed) < oneHourMs) {
      console.log(`[PULSE] 1-hour rate limit active for ${st.name}. Updating timestamp without incrementing count.`);
    } else {
      stats[id].count++;
    }

    lastCountedId = id; // Lock this station as the "Current Active Session"
    stats[id].lastPlayed = now;
    stats[id].name = st.name; // Keep metadata fresh
    stats[id].favicon = st.favicon || '';
    stats[id].votes = st.votes || 0;
    stats[id].clickcount = st.clickcount || st.c || 0;
    stats[id].clicktrend = st.clicktrend || 0;

    // RETENTION POLICY: Top 50 stations + 30-day stale prune
    const entries = Object.entries(stats);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    // Filter out stale low-usage entries
    let filtered = entries.filter(([k, v]) => {
      if (v.count < 3 && (now - v.lastPlayed) > thirtyDays) return false;
      return true;
    });

    // Cap at 50 most played
    if (filtered.length > 50) {
      filtered.sort((a, b) => b[1].count - a[1].count);
      filtered = filtered.slice(0, 50);
    }

    saveUsage(Object.fromEntries(filtered));
    console.log(`[PULSE] Usage validated for ${st.name}. Total plays: ${stats[id].count}`);
  }, 120000);
}

let _favsCache = null;
let _favsCacheTid = null;

function loadFavs() {
  if (_favsCache) return _favsCache;
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY)) || [];
    // Ensure defaultPresets is defined; if not, fallback to empty array
    const dp = typeof defaultPresets !== 'undefined' ? defaultPresets : [];
    const custom = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
    const allPresets = [...new Set([...dp, ...custom])];

    let changed = false;
    raw.forEach(f => {
      if (!f.sparkyId) { f.sparkyId = crypto.randomUUID(); changed = true; }
      if (!f.category || f.category === 'Undefined') {
        const tags = (f.tags || '').toLowerCase();
        const found = allPresets.find(p => tags.includes(p.toLowerCase()));
        f.category = found || 'Undefined';
        changed = true;
      }
    });
    if (changed) localStorage.setItem(FAV_KEY, JSON.stringify(raw));
    
    _favsCache = raw;
    if (!_favsCacheTid) {
       _favsCacheTid = setTimeout(() => { _favsCache = null; _favsCacheTid = null; }, 0);
    }
    return raw;
  } catch { return []; }
}
function saveFavs(f) { 
  localStorage.setItem(FAV_KEY, JSON.stringify(f));
  _favsCache = null; 
}

function norm(u) {
  if (!u) return '';
  try {
    if (!u) return '';
    let n = u.toLowerCase().trim();
    // Strip protocol and trailing slash but KEEP the path/query to distinguish mirrors
    n = n.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return n;
  } catch (e) { return u ? u.toLowerCase().trim() : ''; }
}

function findFavMatch(st) {
  if (!st) return null;
  const currentFavs = loadFavs();
  return currentFavs.find(f =>
    (st.stationuuid && f.stationuuid === st.stationuuid) ||
    (st.sparkyId && f.sparkyId === st.sparkyId) ||
    (norm(f.url) === norm(st.url_resolved || st.url)) ||
    (norm(f.url_resolved) === norm(st.url_resolved || st.url))
  );
}

function isFav(st, currentFavs) {
  if (!st) return false;
  const fv = currentFavs || loadFavs();
  const stUuid = st.stationuuid || st.id;
  const stName = (st.name || '').trim().toLowerCase();
  const stUrl = (st.url_resolved || st.url || '').trim().toLowerCase();

  return fv.some(f => {
    const fUuid = f.stationuuid || f.id;
    const fName = (f.name || '').trim().toLowerCase();
    const fUrl = (f.url_resolved || f.url || '').trim().toLowerCase();
    // 1. UUID Match (Primary)
    if (stUuid && fUuid && stUuid === fUuid) return true;
    // 2. Name + URL Match (Secondary for custom/independent stations)
    if (stName === fName && stUrl === fUrl) return true;
    return false;
  });
}

function getSuggestedCategory(st) {
  if (activeSearchPreset && activeSearchPreset !== 'ADD' && activeSearchPreset !== 'ALL') return activeSearchPreset;
  const custom = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
  const allPresets = [...new Set([...defaultPresets, ...custom])];
  const tags = (st.tags || '').toLowerCase();
  const found = allPresets.find(p => tags.includes(p.toLowerCase()));
  return found || 'Select Category';
}

function isValidImageUrl(url) {
  if (!url) return true;
  const u = url.toLowerCase().trim();
  if (u.startsWith('data:image/')) return true;
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  const exts = ['.png', '.jpg', '.jpeg', '.ico', '.gif', '.webp', '.svg'];
  return exts.some(ext => u.includes(ext)) || u.split('?')[0].includes('.');
}

function addFav(st, customName, customUrl, customCat, customFav) {
  const favs = loadFavs(), u = customUrl || st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id || '';

  const proceed = () => {
    favs.push({
      sparkyId: crypto.randomUUID(),
      id: uuid,
      name: customName || st.name,
      url: u,
      bitrate: st.bitrate,
      codec: st.codec,
      countrycode: st.countrycode,
      tags: st.tags || '',
      votes: st.votes || 0,
      clickcount: st.clickcount || 0,
      clicktrend: st.clicktrend || 0,
      isRescued: st.isRescued || false,
      favicon: customFav !== undefined ? customFav : (st.favicon || ''),
      category: customCat || getSuggestedCategory(st)
    });
    saveFavs(favs);
    refreshFavBadge();
    if (activeTab === 'favs') renderFavs();
  };

  const existing = favs.filter(f => {
    const fUuid = f.stationuuid || f.id;
    const fName = (f.name || '').trim().toLowerCase();
    const fUrl = (f.url_resolved || f.url || '').trim().toLowerCase();
    const stName = ((customName || st.name) || '').trim().toLowerCase();
    const stUrl = (u || '').trim().toLowerCase();

    if (uuid && fUuid && uuid === fUuid) return true;
    if (stName === fName && stUrl === fUrl) return true;
    return false;
  });

  if (existing.length > 0) {
    sparkyConfirm(`<span style="color:#ff0; font-weight:bold; font-size:13px">âš  CAUTION: DUPLICATE URL</span><br><br>There is already a station in your Favorites with the same URL. Proceed anyway?`, proceed, "DUPLICATE DETECTED");
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
  const fv = loadFavs();
  const n = filterHiFi ? fv.filter(s => Number(s.bitrate || 0) >= 128).length : fv.length;
  const el = document.getElementById('favsBadge');
  if (el) el.textContent = n;
}

function syncFavMetadata(st) {
  if (!st) return;
  const favs = loadFavs();
  const u = st.url_resolved || st.url;
  const uuid = st.stationuuid || st.id;
  const favIdx = favs.findIndex(f => {
    if (st.sparkyId && f.sparkyId === st.sparkyId) return true;
    const fUuid = f.stationuuid || f.id;
    const fName = (f.name || '').trim().toLowerCase();
    const fUrl = (f.url_resolved || f.url || '').trim().toLowerCase();
    const stName = (st.name || '').trim().toLowerCase();
    const stUrl = (u || '').trim().toLowerCase();

    if (uuid && fUuid && uuid === fUuid) return true;
    if (stName === fName && stUrl === fUrl) return true;
    return false;
  });

  if (favIdx !== -1) {
    let changed = false;
    if (st.votes !== undefined && favs[favIdx].votes !== st.votes) { favs[favIdx].votes = st.votes; changed = true; }
    if (st.tags !== undefined && favs[favIdx].tags !== st.tags) { favs[favIdx].tags = st.tags; changed = true; }
    if (st.favicon !== undefined && (!favs[favIdx].favicon || favs[favIdx].favicon.trim() === '') && favs[favIdx].favicon !== st.favicon) { favs[favIdx].favicon = st.favicon; changed = true; }
    if ((st.clickcount || st.c) !== undefined && favs[favIdx].clickcount !== (st.clickcount || st.c)) { favs[favIdx].clickcount = st.clickcount || st.c; changed = true; }
    if (uuid && !favs[favIdx].id && !favs[favIdx].stationuuid) { favs[favIdx].id = uuid; changed = true; }
    if (st.isRescued !== undefined && favs[favIdx].isRescued !== st.isRescued) { favs[favIdx].isRescued = st.isRescued; changed = true; }
    if (changed) saveFavs(favs);
  }
}

// â•â• TABS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function switchTab(tab) {
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) npPanel.classList.remove('compact');
  const pl = document.getElementById('playlist');
  if (pl) scrollPositions[activeTab] = pl.scrollTop;

  activeTab = tab;
  document.getElementById('tabStations').classList.toggle('active', tab === 'stations');
  document.getElementById('tabFavs').classList.toggle('active', tab === 'favs');
  document.getElementById('searchArea').style.display = tab === 'stations' ? '' : 'none';
  const filtersArea = document.querySelector('.filters-area');
  if (filtersArea) filtersArea.style.display = tab === 'stations' ? 'flex' : 'none';

  const hr = document.getElementById('plHeaderRight');
  if (hr) hr.style.display = tab === 'favs' ? 'flex' : 'none';
  if (tab === 'favs') updateViewToggleUI();

  if (tab === 'stations') {
    sortMode = 'pwr';
    document.getElementById('plLabel').textContent = 'Stations';
    renderStations();
  } else {
    sortMode = favSortMode;
    document.getElementById('plLabel').textContent = 'Favorites';
    renderFavs();
    backgroundSyncFavs();
  }
  updateSortUI();

  if (pl) {
    // Restore scroll after render
    setTimeout(() => { pl.scrollTop = scrollPositions[tab]; }, 10);
  }
}
document.getElementById('tabStations').addEventListener('click', () => switchTab('stations'));
document.getElementById('tabFavs').addEventListener('click', () => switchTab('favs'));

let syncFavsTimer = null;
async function backgroundSyncFavs() {
  if (syncFavsTimer) clearTimeout(syncFavsTimer);
  syncFavsTimer = setTimeout(async () => {
    if (isSyncingFavs) return;
    // Skip background sync in local dev to prevent console noise from failing mirrors
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
    isSyncingFavs = true;
    const fv = loadFavs();
    if (!fv.length) { isSyncingFavs = false; return; }
    const mirrors = ["de1.api.radio-browser.info", "at1.api.radio-browser.info", "nl1.api.radio-browser.info"];
    try {
      // 1. Attempt to resolve any orphans (missing UUID) first
      const orphans = fv.filter(f => !(f.id || f.stationuuid));
      for (let o of orphans) {
        const m = mirrors[Math.floor(Math.random() * mirrors.length)];
        try {
          const sr = await fetch(`https://${m}/json/stations/byurl?url=${encodeURIComponent(o.url.split('?')[0])}`);
          const res = await sr.json();
          if (res && res.length) {
            let id = res[0].stationuuid;
            let latest = loadFavs();
            let idx = latest.findIndex(fav => norm(fav.url) === norm(o.url));
            if (idx !== -1) { latest[idx].id = id; saveFavs(latest); }
            o.id = id; // update local ref
          }
        } catch (e) { /* Silent fail */ }
      }

      // 2. Fetch all valid UUIDs in a single batched request
      const validUuids = fv.map(f => f.id || f.stationuuid).filter(Boolean);
      if (validUuids.length > 0) {
        const m = mirrors[Math.floor(Math.random() * mirrors.length)];
        const r = await fetch(`https://${m}/json/stations/byuuid/${validUuids.join(',')}`, { cache: 'no-store' });
        const batchData = await r.json();
        
        if (batchData && batchData.length) {
          batchData.forEach(st => syncFavMetadata(st));
          if (activeTab === 'favs') renderFavs();
        }
      }
    } catch (e) { console.error("[GLOBAL_SYNC_ERROR]", e); }
    isSyncingFavs = false;
  }, 2000); // Wait 2 seconds of stabilization before starting heavy sync loop
}

// â•â• EQ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
let appliedEqVals = [...(FACTORY_PRESETS.flat)];
let appliedPreset = activePreset;
let isStagedPreset = false;

function updateSaveButtonState() {
  const btn = document.querySelector('.btn-save');
  if (!btn) return;

  const changedFromApplied = eqVals.some((v, i) => Math.abs(v - appliedEqVals[i]) > 0.1);
  const changedFromSaved = eqVals.some((v, i) => Math.abs(v - lastSavedVals[i]) > 0.1);
  const isAlreadyApplied = (activePreset === appliedPreset) && !eqVals.some((v, i) => Math.abs(v - appliedEqVals[i]) > 0.1);
  const presetName = activePreset.toUpperCase();

  btn.classList.toggle('btn-save-alert', (isStagedPreset && !isAlreadyApplied) || changedFromSaved);

  if (isStagedPreset && !isAlreadyApplied) {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">check</span> APPLY ${presetName}`;
    btn.title = `Apply [${presetName}] settings to the audio engine`;
  } else if (changedFromSaved) {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">save</span> SAVE ${presetName}`;
    btn.title = `Save custom adjustments to the [${presetName}] preset slot`;
  } else {
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">settings_input_component</span> APPLY PRESET`;
    btn.title = `Select a preset to apply or modify settings`;
  }
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
      appliedEqVals[i] = v; // Manual tweaks are applied immediately
      isStagedPreset = false; // Manual tweak breaks the "staged preset" state
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
    // Note: Audio nodes NOT updated yet. This is "staged".
  });

  lastSavedVals = [...vals];
  isStagedPreset = true;
  updateSaveButtonState();
}

// â•â• EQ BINDINGS CONSOLIDATED IN DOMContentLoaded â•â•

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
    sparkyAlert("Please select a preset slot (e.g., CUSTOM or FLAT) to manage settings.", "ACTION REQUIRED");
    return;
  }

  const p = activePreset.toUpperCase();

  if (isStagedPreset) {
    // APPLY LOGIC
    eqVals.forEach((v, i) => {
      if (eqNodes[i]) eqNodes[i].gain.value = v;
      appliedEqVals[i] = v;
    });
    appliedPreset = activePreset;
    isStagedPreset = false;
    updateSaveButtonState();
    console.log(`[EQ] Applied ${p} Preset`);
    return;
  }

  // SAVE LOGIC
  sparkyConfirm(`Commit current custom adjustments to the <strong>[${p}]</strong> memory bank?`, () => {
    currentPresets[activePreset] = [...eqVals];
    lastSavedVals = [...eqVals];
    appliedEqVals = [...eqVals];
    appliedPreset = activePreset;
    localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
    isStagedPreset = false;
    updateSaveButtonState();
  }, "CONFIRM MEMORY WRITE");
}

function resetEqDefaults() {
  if (activePreset) {
    const p = activePreset.toUpperCase();
    sparkyConfirm(`Reset the <strong>[${p}]</strong> preset to its original factory levels?`, () => {
      currentPresets[activePreset] = [...FACTORY_PRESETS[activePreset]];
      localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
      setEqPreset(activePreset);
      // Force apply after reset for immediate recovery
      eqVals.forEach((v, i) => { if (eqNodes[i]) eqNodes[i].gain.value = v; appliedEqVals[i] = v; });
      appliedPreset = activePreset;
      isStagedPreset = false;
      updateSaveButtonState();
    }, "RESTORE PRESET");
  } else {
    sparkyConfirm(`<strong>GLOBAL FACTORY RESET:</strong> Restore <strong>ALL</strong> presets to original specs?`, () => {
      currentPresets = JSON.parse(JSON.stringify(FACTORY_PRESETS));
      localStorage.setItem('sparky_eq_presets', JSON.stringify(currentPresets));
      setEqPreset('flat');
      eqVals.forEach((v, i) => { if (eqNodes[i]) eqNodes[i].gain.value = v; appliedEqVals[i] = v; });
      appliedPreset = 'flat';
      isStagedPreset = false;
      updateSaveButtonState();
    }, "GLOBAL FACTORY RESET");
  }
}

// â•â• MODALS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

function loadEditCategories(currentVal) {
  const customPresets = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
  const vaultCats = [...new Set(loadFavs().map(f => f.category || 'Undefined'))];
  const all = [...new Set([...defaultPresets, ...customPresets, ...customCategories, ...vaultCats, 'Undefined'])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const container = document.getElementById('editCatOptions');
  const trigger = document.getElementById('editCatTrigger');
  if (!container || !trigger) return;

  trigger.textContent = currentVal || 'Select Category';

  let html = `<div class="preset-opt add-opt" data-val="ADD_CAT">+ Add Category</div>`;
  all.forEach(c => {
    // Only deletable if it is a custom category or a custom preset (not a factory preset)
    const isCustomCat = customCategories.includes(c);
    const isCustomPreset = customPresets.includes(c) && !defaultPresets.includes(c);
    const isDeletable = isCustomCat || isCustomPreset;

    html += `<div class="preset-opt" data-val="${c}"><span>${c}</span>${isDeletable ? `<span class="preset-del" data-del-cat="${c}">âœ•</span>` : ''}</div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.preset-opt').forEach(opt => opt.onclick = (e) => {
    if (e.target.classList.contains('preset-del')) return;
    const val = opt.dataset.val;
    if (val === 'ADD_CAT') {
      sparkyPrompt("Enter new category name:", "ADD CATEGORY", (name) => {
        if (!name) return;
        if (!customCategories.includes(name)) {
          customCategories.push(name);
          localStorage.setItem('sparky_custom_categories', JSON.stringify(customCategories));
          loadEditCategories(name);
        }
      });
    } else {
      trigger.textContent = val;
      container.classList.remove('show');
    }
  });

  container.querySelectorAll('[data-del-cat]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const val = btn.dataset.delCat;
    sparkyConfirm(`Remove [${val}] from categories?`, () => {
      // If it's a custom preset, we don't delete the preset itself, just remove from customCategories if it's there
      customCategories = customCategories.filter(x => x !== val);
      localStorage.setItem('sparky_custom_categories', JSON.stringify(customCategories));
      if (trigger.textContent === val) trigger.textContent = 'Undefined';
      loadEditCategories(trigger.textContent);
    });
  });
}

function openEditModal(name, url, category, favicon, onSave, title = "EDIT STATION", btnText = "SAVE CHANGES", focusField = "name") {
  const overlay = document.getElementById('editModalOverlay');
  const header = document.getElementById('editModalHeader');
  const nameInput = document.getElementById('editStationName');
  const urlInput = document.getElementById('editStationUrl');
  const favInput = document.getElementById('editStationFavicon');
  const catTrigger = document.getElementById('editCatTrigger');
  const catOptions = document.getElementById('editCatOptions');
  const saveBtn = document.getElementById('editModalSave');
  const cancelBtn = document.getElementById('editModalCancel');

  if (header) header.textContent = title;
  if (saveBtn) saveBtn.textContent = btnText;

  loadEditCategories(category || 'Select Category');

  nameInput.value = name || '';
  urlInput.value = url || '';
  favInput.value = favicon || '';

  const infoBtn = document.getElementById('btnFaviconInfo');
  if (infoBtn) {
    infoBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const m = document.getElementById('faviconGuideModal');
      if (m) m.style.display = 'flex';
    };
  }
  const closeGuide = document.getElementById('btnFaviconGuideClose');
  if (closeGuide) closeGuide.onclick = () => {
    const m = document.getElementById('faviconGuideModal');
    if (m) m.style.display = 'none';
  };

  overlay.style.display = 'flex';

  if (focusField === 'name') {
    nameInput.focus();
  }

  // Bind dropdown toggle
  catTrigger.onclick = (e) => { e.stopPropagation(); catOptions.classList.toggle('show'); };

  function closeModal() {
    overlay.style.display = 'none';
    catOptions.classList.remove('show');
    saveBtn.onclick = null;
    cancelBtn.onclick = null;
    overlay.onclick = null;
    document.onkeydown = null;
  }
  saveBtn.onclick = (e) => {
    e.preventDefault();
    const finalCat = catTrigger.textContent;
    const finalFav = favInput.value.trim();

    if (!isValidImageUrl(finalFav)) {
      sparkyAlert("FAVICON REQUIREMENTS:\nâ€¢ Must start with http:// or https://\nâ€¢ Must point to a valid image (.png, .jpg, .ico, .webp, .svg)\nâ€¢ Data URIs are also supported.", "INVALID FAVICON URL");
      return;
    }

    closeModal();
    onSave(nameInput.value.trim(), urlInput.value.trim(), finalCat, finalFav);
  };
  cancelBtn.onclick = (e) => { e.preventDefault(); closeModal(); onSave(null, null, null, null); };
  overlay.onclick = (e) => { if (e.target === overlay) { closeModal(); onSave(null, null, null, null); } };
  document.onkeydown = (e) => {
    if (e.key === 'Escape') cancelBtn.click();
    if (e.key === 'Enter') saveBtn.click();
  };
}

function removeFav(st) {
  const u = st.url_resolved || st.url;
  removeFavByUrl(u);
  if (activeTab === 'favs') renderFavs();
  else renderStations();
}

// â•â• AUDIO INIT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const isIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;

function initAudio() {
  if (isIOS) {
    console.log("[PWA] iOS Bypass: Native Audio Engaged. Web Audio API (EQ/Viz) disabled for background play support.");

    // UI Notification for iOS users
    const eqTitle = document.querySelector('.eq-panel-title');
    if (eqTitle && !eqTitle.innerHTML.includes('iOS Background Active')) {
      eqTitle.innerHTML += ' <span style="color:var(--text-dim); font-size:10px; font-weight:normal; margin-left:8px;">(iOS Background Active - EQ Off)</span>';
    }

    return;
  }

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

// â•â• VISUALIZER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  const maxBin = Math.min(totalBins - 1, 120); // Focus on musical range

  vizBars.forEach((bar, i) => {
    const t0 = i / barCount;
    const t1 = (i + 1) / barCount;

    const startBin = Math.floor(minBin + Math.pow(t0, 1.4) * (maxBin - minBin));
    const endBin = Math.floor(minBin + Math.pow(t1, 1.4) * (maxBin - minBin));

    let val = getBandEnergy(freqData, startBin, Math.max(startBin, endBin));

    // Dynamic Range Expansion (High-Fidelity "Tips and Valleys")
    const tilt = 1 + (i / barCount) * 0.6;
    val *= tilt;

    // Sharpen the peaks (Power curve)
    let normVal = val / 255;
    normVal = Math.pow(normVal, 1.3); // Sharper contrast

    // Visual smoothing: Snappy attack, smooth decay
    const prev = smoothedBands[i] || 0;
    const attack = 0.8;
    const decay = 0.1;
    smoothedBands[i] = normVal > prev
      ? lerp(prev, normVal, attack)
      : lerp(prev, normVal, decay);

    const minH = 2;
    const maxH = 28;
    const h = minH + (smoothedBands[i] * maxH);

    bar.style.height = h.toFixed(1) + 'px';
  });
}

function idleViz() {
  cancelAnimationFrame(rafId); let t = 0;
  (function tick() {
    rafId = requestAnimationFrame(tick); t += .05;
    vizBars.forEach((b, i) => { b.style.height = (2 + Math.abs(Math.sin(t + i * .2)) * 6) + 'px'; });
  })();
}
idleViz();

// â•â• STATUS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function setStatus(state, txt) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (dot) dot.className = 'dot ' + ({ playing: 'active', buffering: 'buffering', error: 'error' }[state] || '');
  if (text) text.textContent = txt;
}

// â•â• NOW PLAYING â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function updateNowPlaying(st) {
  const nm = document.getElementById('npName');
  const sm = document.getElementById('npSubMeta');
  const favEl = document.getElementById('npFavicon');
  const catNameEl = document.getElementById('npCatName');
  const catIconEl = document.getElementById('npCatIcon');
  if (!nm) return;

  if (favEl) favEl.innerHTML = st ? renderFavicon(st) : '';
  
  // R-U1: Ambient favicon glow for Now Playing panel
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) {
    if (st && st.favicon && st.favicon.trim() !== '') {
      npPanel.style.setProperty('--ambient-bg', `url("${esc(st.favicon)}")`);
      npPanel.classList.add('has-ambient-bg');
    } else {
      npPanel.style.removeProperty('--ambient-bg');
      npPanel.classList.remove('has-ambient-bg');
    }
  }

  nm.textContent = st ? st.name : 'SELECT A STATION';

  if (catNameEl && catIconEl) {
    const fav = findFavMatch(st);
    if (fav && fav.category) {
      catNameEl.textContent = fav.category.toUpperCase();
      catIconEl.textContent = 'bookmark_manager';
    } else {
      catNameEl.textContent = 'NOW PLAYING';
      catIconEl.textContent = 'folder';
    }
  }

  // CONDITIONAL SCROLLING LOGIC
  nm.classList.remove('scrolling');
  nm.style.removeProperty('--ticker-end');
  nm.style.removeProperty('--ticker-duration');

  // We need a small timeout to let the DOM update before measuring
  setTimeout(() => {
    const container = nm.parentElement;
    if (!container) return;

    // Reset before measurement
    nm.classList.remove('scrolling');
    nm.style.transform = 'none';

    // Force a layout recalculation
    void nm.offsetWidth;

    const isOverflowing = nm.scrollWidth > (container.clientWidth + 2);

    if (isOverflowing) {
      const scrollDist = nm.scrollWidth + 60; // Extra buffer
      const speed = 25; // Slower for industrial elegance
      const duration = scrollDist / speed;

      nm.style.setProperty('--ticker-end', `-${scrollDist}px`);
      nm.style.setProperty('--ticker-duration', `${duration}s`);
      nm.classList.add('scrolling');
    }
  }, 150);

  if (sm) {
    if (st) {
      const location = st.countrycode || st.country || 'Global';
      const genre = (st.tags || 'Various').split(',')[0].trim();
      const hdBadge = (Number(st?.bitrate || 0) >= 128) ? '<span class="hd-badge-inline" style="margin-left: 8px; vertical-align: middle;">HD</span>' : '';
      sm.innerHTML = `${location.toUpperCase()} \u00B7 ${genre}${hdBadge}`;
    } else {
      sm.textContent = '—';
    }
  }

  const votes = document.getElementById('npVotes');
  const clicks = document.getElementById('npClicks');
  const trend = document.getElementById('npTrend');
  const codec = document.getElementById('npCodec');

  if (trend) trend.textContent = (st?.clicktrend !== undefined) ? (st.clicktrend > 0 ? '+' + st.clicktrend : st.clicktrend) : 'â€”';
  if (codec) codec.textContent = (st?.codec || 'MP3').toUpperCase();
  if (votes) votes.textContent = fmtK(st?.votes || 0);
  if (clicks) clicks.textContent = fmtK(st?.clickcount || 0);
}

function jumpToCategoryShortcut(st) {
  if (!st) return;
  const fav = findFavMatch(st);
  if (!fav || !fav.category) {
    sparkyAlert("This station is not in your Favorites yet.", "STATION NOT CATEGORIZED");
    return;
  }

  const cat = fav.category;
  favViewMode = 'grouped';
  localStorage.setItem('sparky_fav_view', 'grouped');
  updateViewToggleUI();

  // Expand category if collapsed
  collapsedCategories = collapsedCategories.filter(c => c !== cat);
  localStorage.setItem('sparky_collapsed_cats', JSON.stringify(collapsedCategories));

  switchTab('favs');
  renderFavs();

  setTimeout(() => {
    const sid = fav.sparkyId;
    const el = document.querySelector(`.pl-item[data-sid="${sid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('jump-highlight');
      setTimeout(() => el.classList.remove('jump-highlight'), 2000);
    } else {
      // Fallback to category header if item not rendered yet or filtered
      const catEl = document.querySelector(`.pl-category-header[data-cat="${cat}"]`);
      if (catEl) catEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 200);
}

function jumpToStation(st) {
  if (!st) return;
  const favMatch = findFavMatch(st);

  if (favMatch) {
    // Navigate within Favorites
    switchTab('favs');

    if (favViewMode === 'grouped') {
      const cat = favMatch.category || 'Undefined';
      collapsedCategories = collapsedCategories.filter(c => c !== cat);
      localStorage.setItem('sparky_collapsed_cats', JSON.stringify(collapsedCategories));
      renderFavs();
    } else if (favViewMode === 'discovery') {
      discoveryCategoryFilter = favMatch.category || 'Undefined';
      renderFavs();
    }

    setTimeout(() => {
      const sid = favMatch.sparkyId;
      const el = document.querySelector(`.pl-item[data-sid="${sid}"], .pl-discovery-card[data-sid="${sid}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('jump-highlight');
        setTimeout(() => el.classList.remove('jump-highlight'), 2000);
      }
    }, 200);
    return;
  }

  const url = st.url_resolved || st.url;
  const discoveryMatchIdx = stations.findIndex(s => norm(s.url) === norm(url));
  if (discoveryMatchIdx !== -1) {
    // Navigate within Discovery
    switchTab('stations');
    setTimeout(() => {
      const el = document.querySelector(`.pl-item[data-idx="${discoveryMatchIdx}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('jump-highlight');
        setTimeout(() => el.classList.remove('jump-highlight'), 2000);
      }
    }, 200);
    return;
  }
}

// â•â• PLAYBACK â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function playStationObj(st) {
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) npPanel.classList.remove('compact', 'compact-radio', 'compact-video');
  sparkyLog(`Action: playStationObj(${st.stationuuid || st.id}) - ${st.name}`);
  debugLayout('BEFORE-RADIO-PLAY');
  if (!st) return;
  syncFavMetadata(st);
  currentSrc = st;
  trackUsage(st);
  renderCurrent(); // Instant highlighting
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  initAudio();
  setTimeout(() => debugLayout('AFTER-RADIO-PLAY'), 300);
  if (hls) { hls.destroy(); hls = null; }
  audioEl.pause();
  const url = st.url_resolved || st.url;
  const vol = document.getElementById('volSlider').value;
  audioEl.volume = vol / 100;
  if (sparkyYtState.playerInstance && typeof sparkyYtState.playerInstance.setVolume === 'function') {
    sparkyYtState.playerInstance.setVolume(vol);
  }
  setStatus('buffering', 'Buffering');
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
    isPlaying = true; setStatus('playing', 'Connected');
    syncPlayBtns();
    cancelAnimationFrame(rafId); drawViz();
  }
  async function onPlayError() {
    if (!navigator.onLine) {
      wasPlayingBeforeOffline = true;
      setStatus('error', 'Offline');
      console.log(`[PLAY_ERROR] Playback failed because network is offline. Staging for auto-resume: ${st.name}`);
      return;
    }

    if (!st._retryAttempted) {
      console.log(`[PLAY_ERROR] Transient error for ${st.name}. Retrying original link...`);
      setStatus('buffering', 'Reconnecting...');
      st._retryAttempted = true;
      await sleep(1500);
      playStationObj(st);
      return;
    }

    if (!st._rescueAttempted) {
      setStatus('buffering', 'Active Rescue...');
      st._rescueAttempted = true;
      const rescued = await window.activeRescueFromM3U(st);
      if (rescued) {
        console.log(`[ACTIVE_RESCUE] Retrying with healed link for ${st.name}`);
        playStationObj(st);
        return;
      }
    }
    setStatus('error', 'Error');
    syncPlayBtns();
  }
}

function getCurrentNavigationList() {
  return lastRenderedList.length > 0 ? lastRenderedList : stations;
}

function playAtIndex(idx) {
  const list = getCurrentNavigationList();
  if (idx < 0 || idx >= list.length) return;
  playStationObj(list[idx]);
}

function stopPlayback() {
  audioEl.pause(); audioEl.src = '';
  isPlaying = false;
  wasPlayingBeforeOffline = false; // Reset network reconnect state on manual stop
  setStatus('', 'Idle');
  syncPlayBtns();
  idleViz(); renderCurrent();
}

function togglePlay() {
  if (isPlaying) stopPlayback();
  else if (currentSrc) playStationObj(currentSrc);
  else if (activeTab === 'stations' && stations.length) playAtIndex(0);
  else if (activeTab === 'favs' && favs.length) playAtIndex(0);
}

function scrollToActive() {
  const activeEl = document.querySelector('.pl-item.active, .pl-discovery-card.active');
  if (!activeEl) return;

  // If in grouped mode, ensure parent category is expanded
  const group = activeEl.closest('.pl-category-group');
  if (group && group.classList.contains('collapsed')) {
    const cat = group.dataset.cat;
    group.classList.remove('collapsed');
    collapsedCategories = collapsedCategories.filter(c => c !== cat);
    localStorage.setItem('sparky_collapsed_cats', JSON.stringify(collapsedCategories));
  }

  activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderCurrent() {
  if (activeTab === 'stations') renderStations(); else renderFavs();
  scrollToActive();
}

// â•â• RENDERERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function getGenreIconSVG(tags, name) {
  const t = String(tags || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  
  if (t.includes('j-pop') || t.includes('jpop') || t.includes('japan') || n.includes('j-pop') || n.includes('jpop')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  }
  if (t.includes('country') || t.includes('folk') || t.includes('bluegrass') || n.includes('country') || n.includes('folk')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 17.5c2.5-1 5.5-1 8.5-1s6 0 8.5 1c-1.5-1-3-1.5-4.5-1.5-1.2 0-2-.8-2-2v-2.5c0-1.8-1-2.5-2.5-2.5S7.5 9.7 7.5 11.5V14c0 1.2-.8 2-2 2-1.5 0-3 .5-4.5 1.5z"/></svg>`;
  }
  if (t.includes('electronic') || t.includes('dance') || t.includes('techno') || t.includes('synth') || t.includes('house') || t.includes('trance') || t.includes('ambient') || n.includes('dance') || n.includes('synth')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`;
  }
  if (t.includes('rock') || t.includes('metal') || t.includes('grunge') || n.includes('rock') || n.includes('metal')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  }
  if (t.includes('pop') || t.includes('top 40') || t.includes('hits') || n.includes('pop')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line></svg>`;
  }
  if (t.includes('talk') || t.includes('news') || t.includes('podcast') || t.includes('info') || t.includes('spoken') || n.includes('talk') || n.includes('news')) {
    return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path><circle cx="12" cy="12" r="2"></circle></svg>`;
  }
  return `<svg class="pl-genre-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
}

function renderFavicon(st) {
  const seed = String(st.tags || st.category || st.name || 'Radio').split(',')[0].trim();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 65;
  const l = 40;
  const h2 = (h + 35) % 360;
  const l2 = 25;
  
  let initials = 'RA';
  if (st.name) {
    const clean = String(st.name).trim().replace(/^[^a-zA-Z0-9]+/, '');
    if (clean) {
      const words = clean.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && /[a-zA-Z0-9]/.test(words[0][0]) && /[a-zA-Z0-9]/.test(words[1][0])) {
        initials = (words[0][0] + words[1][0]).toUpperCase();
      } else {
        const alphaNums = clean.replace(/[^a-zA-Z0-9]/g, '');
        initials = alphaNums.length >= 2 ? alphaNums.slice(0, 2).toUpperCase() : clean.slice(0, 2).toUpperCase();
      }
    }
  }

  const gradientStyle = `background: linear-gradient(135deg, hsl(${h}, ${s}%, ${l}%) 0%, hsl(${h2}, ${s}%, ${l2}%) 100%);`;
  const genreOverlay = getGenreIconSVG(st.tags, st.name);

  if (st.favicon && st.favicon.trim() !== '') {
    return `
      <img class="pl-favicon" src="${esc(st.favicon)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="pl-card-gradient" style="${gradientStyle} display: none;">
        <span class="pl-card-gradient-text">${esc(initials)}</span>
        ${genreOverlay}
      </div>
    `;
  }
  return `
    <div class="pl-card-gradient" style="${gradientStyle} display: flex;">
      <span class="pl-card-gradient-text">${esc(initials)}</span>
      ${genreOverlay}
    </div>
  `;
}

function renderDiscoveryFavicon(st) {
  return renderFavicon(st);
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
  if (!pl || activeTab !== 'stations') return;
  if (!stations.length) {
    pl.innerHTML = '<div class="pl-empty"><div class="pl-empty-icon"><span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.6;">radio</span></div><div>No stations loaded</div></div>'; return;
  }
  let displayStations = [...stations];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    displayStations = displayStations.filter(s => s.name.toLowerCase().includes(q) || (s.tags || '').toLowerCase().includes(q));
  }
  if (filterHiFi) {
    displayStations = displayStations.filter(s => Number(s.bitrate || 0) >= 128);
  }
  if (filterCountry && filterCountry !== 'ALL') {
    displayStations = displayStations.filter(s => (s.countrycode || '').toUpperCase() === filterCountry.toUpperCase());
  }
  if (filterLang && filterLang !== 'ALL') {
    displayStations = displayStations.filter(s => (s.language || '').toLowerCase() === filterLang.toLowerCase());
  }

  if (displayStations.length > 1) {
    const mC = Math.max(...displayStations.map(s => s.clickcount || 0), 1);
    const mV = Math.max(...displayStations.map(s => s.votes || 0), 1);
    const mT = Math.max(...displayStations.map(s => s.clicktrend || 0), 1);
    if (sortMode === 'pwr') {
      displayStations.sort((a, b) => {
        const sA = (((a.clickcount || 0) / mC) * 0.6) + (((a.votes || 0) / mV) * 0.3) + (((a.clicktrend || 0) / mT) * 0.1);
        const sB = (((b.clickcount || 0) / mC) * 0.6) + (((b.votes || 0) / mV) * 0.3) + (((b.clicktrend || 0) / mT) * 0.1);
        return sB - sA;
      });
    } else if (sortMode === 'vote') {
      displayStations.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    }
  }

  if (stations.length > 0 && !displayStations.length) {
    const sb = document.getElementById('stationsBadge');
    if (sb) sb.textContent = '0';
    pl.innerHTML = '<div class="pl-empty"><div class="pl-empty-icon"><span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.6;">search</span></div><div>No matching stations</div></div>';
    return;
  }

  const sb = document.getElementById('stationsBadge');
  if (sb) sb.textContent = displayStations.length;

  const mC = Math.max(...displayStations.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...displayStations.map(s => s.votes || 0), 1);
  const mT = Math.max(...displayStations.map(s => s.clicktrend || 0), 1);

  const currentFavs = loadFavs();
  pl.innerHTML = displayStations.map((st, i) => {
    const actv = currentSrc && (
      (st.stationuuid && currentSrc.stationuuid === st.stationuuid) ||
      (st.sparkyId && currentSrc.sparkyId === st.sparkyId) ||
      (norm(currentSrc.url) === norm(st.url_resolved || st.url)) ||
      (norm(currentSrc.url_resolved) === norm(st.url_resolved || st.url))
    );
    const favd = isFav(st, currentFavs);
    const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
    const pwr = Math.min(100, Math.round(rank * 100));
    const trending = (st.clicktrend || 0) > 50 ? '<span class="pl-status-badge trending">Trending</span>' : '';
    let primary = { id: 'pwr', icon: 'bolt', val: `${pwr}%`, color: 'var(--text)' };
    if (sortMode === 'vote') { primary = { id: 'vot', icon: 'thumb_up', val: fmtK(st.votes), color: 'var(--text)' }; }

    const tagArr = (st.tags || '').split(',').map(t => t.trim()).filter(t => t);
    let dispTags = tagArr.slice(0, 2);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      let match = tagArr.find(t => t.toLowerCase().includes(q));
      if (!match && st.name.toLowerCase().includes(q)) match = searchQuery;
      if (match && !dispTags.some(dt => dt.toLowerCase().includes(q))) dispTags.push(match);
    }
    const finalTags = dispTags.slice(0, 3).join(', ') || 'Radio';
    const rescued = st.isRescued ? ' rescued' : '';

    const ambientStyle = actv && st.favicon && st.favicon.trim() !== '' ? ` style="--ambient-bg: url('${esc(st.favicon)}');"` : '';
    const ambientClass = actv && st.favicon && st.favicon.trim() !== '' ? ' has-ambient-bg' : '';

    return `<div class="pl-item${actv ? ' active' : ''}${rescued}${ambientClass}" data-idx="${i}" data-url="${st.url || st.url_resolved || ''}" data-uuid="${st.stationuuid || st.id || ''}"${ambientStyle}>
      <div class="pl-favicon-col">
        ${renderFavicon(st)}
      </div>
      <div class="pl-main-col">
        <div class="pl-item-name">${esc(st.name)}</div>
        <div class="pl-item-meta">${esc(st.countrycode || '--')} \u00B7 ${esc(finalTags)}</div>
        <div class="pl-item-stats">
          <span class="pl-stat-power" style="color:${primary.color}"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">${primary.icon}</span> ${primary.val}</span>
          ${(Number(st.bitrate || 0) >= 128) ? '<span class="hd-badge-inline">HD</span>' : ''}
          ${trending}
        </div>
      </div>
      <div class="pl-actions-col">
        <button class="pl-action-btn pl-heart-btn" data-fav="${i}" title="Toggle Favorite">
          <span class="material-symbols-outlined pl-heart${favd ? ' is-fav' : ''}">favorite</span>
        </button>
        <button class="pl-action-btn pl-remove" data-rmst="${i}" title="Remove Station">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>`;


  }).join('');
  pl.querySelectorAll('.pl-item').forEach((el, idx) => {
    el.onclick = (e) => {
      if (e.target.closest('button')) return;
      playStationObj(displayStations[idx]);
    };
  });
  pl.querySelectorAll('.pl-heart-btn').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const st = displayStations[btn.dataset.fav];
    if (isFav(st)) {
      removeFavByUrl(st.url_resolved || st.url);
      renderStations();
    } else {
      const suggested = getSuggestedCategory(st);
      openEditModal(st.name, st.url_resolved || st.url, suggested, st.favicon || '', (newName, newUrl, newCat, newFav) => {
        if (newName && newUrl) {
          const finalCat = (newCat === 'Select Category') ? 'Undefined' : newCat;
          addFav(st, newName, newUrl, finalCat, newFav);
          renderStations();
        }
      }, "ADD TO FAVORITES", "ADD FAVORITES", "category");
    }
  });
  pl.querySelectorAll('.pl-remove').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const idx = parseInt(btn.dataset.rmst);
    sparkyConfirm(`Remove [${displayStations[idx].name}]?`, () => {
      const targetUrl = displayStations[idx].url;
      stations = stations.filter(s => s.url !== targetUrl);
      renderStations();
    });
  });
  lastRenderedList = displayStations;
}

function renderFavs() {
  const pl = document.getElementById('playlist');
  if (!pl || activeTab !== 'favs') return;
  favs = loadFavs();
  refreshFavBadge();
  const recentList = getRecentStations();
  if (!favs.length && !recentList.length) {
    pl.innerHTML = '<div class="pl-empty"><div class="pl-empty-icon"><span class="material-symbols-outlined">radio</span></div><div>No favorites yet</div></div>'; return;
  }

  if (favViewMode === 'grouped') {
    renderGroupedFavs(pl);
    return;
  }
  if (favViewMode === 'discovery') {
    renderDiscoveryFavs(pl);
    return;
  }

  let displayFavs = [...favs];
  if (discoveryCategoryFilter === 'RECENT') {
    displayFavs = recentList;
  } else if (discoveryCategoryFilter !== 'ALL') {
    displayFavs = displayFavs.filter(f => (f.category || 'Undefined') === discoveryCategoryFilter);
  }
  if (filterHiFi) {
    displayFavs = displayFavs.filter(s => Number(s.bitrate || 0) >= 128);
  }

  // Sorting Logic: Restricted to Usage-First if RECENT is active
  const isFiltered = discoveryCategoryFilter !== 'ALL' && discoveryCategoryFilter !== 'RECENT';
  const isRecent = discoveryCategoryFilter === 'RECENT';
  const effectiveSort = isRecent ? 'usage' : ((isFiltered && sortMode === 'custom') ? 'pwr' : sortMode);

  if (displayFavs.length > 1 && effectiveSort !== 'custom') {
    if (effectiveSort === 'usage') {
      displayFavs.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else {
      const mC = Math.max(...displayFavs.map(s => s.clickcount || 0), 1);
      const mV = Math.max(...displayFavs.map(s => s.votes || 0), 1);
      const mT = Math.max(...displayFavs.map(s => s.clicktrend || 0), 1);

      if (effectiveSort === 'pwr') {
        displayFavs.sort((a, b) => {
          const sA = (((a.clickcount || 0) / mC) * 0.6) + (((a.votes || 0) / mV) * 0.3) + (((a.clicktrend || 0) / mT) * 0.1);
          const sB = (((b.clickcount || 0) / mC) * 0.6) + (((b.votes || 0) / mV) * 0.3) + (((b.clicktrend || 0) / mT) * 0.1);
          return sB - sA;
        });
      } else {
        displayFavs.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      }
    }
  }

  const mC = Math.max(...favs.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...favs.map(s => s.votes || 0), 1);
  const mT = Math.max(...favs.map(s => s.clicktrend || 0), 1);

  const groups = groupFavsByCategory(favs);
  const categories = ['ALL', 'RECENT', ...Object.keys(groups).sort().filter(c => c !== 'RECENT')];
  const chipsHtml = `
    <div class="pl-discovery-filters list-mode-filters">
      ${categories.map(cat => `
        <div class="filter-chip${discoveryCategoryFilter === cat ? ' active' : ''}" data-filter="${cat}">
          ${cat}
        </div>
      `).join('')}
    </div>
  `;

  pl.innerHTML = chipsHtml + displayFavs.map((st, i) => {
    const actv = currentSrc && (
      (st.stationuuid && currentSrc.stationuuid === st.stationuuid) ||
      (st.sparkyId && currentSrc.sparkyId === st.sparkyId) ||
      (norm(currentSrc.url) === norm(st.url_resolved || st.url)) ||
      (norm(currentSrc.url_resolved) === norm(st.url_resolved || st.url))
    );
    const favd = st.isFav ?? isFav(st);
    const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
    const pwr = Math.min(100, Math.round(rank * 100));
    const isManual = sortMode === 'custom' && !isRecent;
    const trending = (st.clicktrend || 0) > 50 ? '<span class="pl-status-badge trending">Trending</span>' : '';
    let primary = { id: 'pwr', icon: 'bolt', val: isRecent ? `${st.count} plays` : `${pwr}%`, color: 'var(--accent)' };
    if (sortMode === 'vote' && !isRecent) { primary = { id: 'vot', icon: 'thumb_up', val: fmtK(st.votes), color: 'var(--fav)' }; }

    const tagArr = (st.tags || '').split(',').map(t => t.trim()).filter(t => t);
    let dispTags = tagArr.slice(0, 2);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      let match = tagArr.find(t => t.toLowerCase().includes(q));
      if (!match && st.name.toLowerCase().includes(q)) match = searchQuery;
      if (match && !dispTags.some(dt => dt.toLowerCase().includes(q))) dispTags.push(match);
    }
    const finalTags = dispTags.slice(0, 3).join(', ') || 'Radio';
    const rescued = st.isRescued ? ' rescued' : '';

    const ambientStyle = actv && st.favicon && st.favicon.trim() !== '' ? ` style="--ambient-bg: url('${esc(st.favicon)}');"` : '';
    const ambientClass = actv && st.favicon && st.favicon.trim() !== '' ? ' has-ambient-bg' : '';

    return `<div class="pl-item${actv ? ' active' : ''}${rescued}${ambientClass}" data-sid="${st.sparkyId || ''}" data-uuid="${st.stationuuid || ''}" data-url="${st.url || ''}"${ambientStyle}>
      <div class="pl-favicon-col">
        ${renderFavicon(st)}
      </div>
      <div class="pl-main-col">
        <div class="pl-item-name">${esc(st.name)}</div>
        <div class="pl-item-meta">${esc(st.countrycode || '--')} \u00B7 ${esc(finalTags)}</div>
        <div class="pl-item-stats">
          <span class="pl-stat-power" style="color:${primary.color}"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">${primary.icon}</span> ${primary.val}</span>
          ${(Number(st.bitrate || 0) >= 128) ? '<span class="hd-badge-inline">HD</span>' : ''}
          ${trending}
        </div>
      </div>
      <div class="pl-actions-col">
        ${isRecent ? `
          <button class="pl-action-btn pl-add-fav" title="Toggle Favorite" style="color:${favd ? 'var(--fav)' : 'var(--accent)'}">
            <span class="material-symbols-outlined pl-heart${favd ? ' is-fav' : ''}">favorite</span>
          </button>
        ` : `
          <button class="pl-action-btn pl-edit" data-edit="${st.sparkyId || ''}" title="Edit Favorite">
            <span class="material-symbols-outlined">edit</span>
          </button>
        `}
        <button class="pl-action-btn pl-remove" data-rmfav="${st.sparkyId || ''}" data-rmrecent="${st.stationuuid || st.id || `${st.name}_${st.url}`}" title="Remove from History">
          <span class="material-symbols-outlined">delete</span>
        </button>
        ${isManual ? `
          <div class="pl-sort-col">
            <button class="pl-action-btn pl-sort-up" data-up="${st.sparkyId}" title="Move Up">
              <span class="material-symbols-outlined">expand_less</span>
            </button>
            <button class="pl-action-btn pl-sort-down" data-down="${st.sparkyId}" title="Move Down">
              <span class="material-symbols-outlined">expand_more</span>
            </button>
          </div>
        ` : ''}
      </div>
    </div>`;
  }).join('');




  pl.querySelectorAll('.pl-item').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('button')) return;
      const sId = el.dataset.sid;
      const uuid = el.dataset.uuid;
      const url = el.dataset.url;

      let target;
      if (sId) target = favs.find(f => f.sparkyId === sId);
      if (!target && uuid) target = getRecentStations().find(s => s.stationuuid === uuid);
      if (!target && url) target = getRecentStations().find(s => norm(s.url) === norm(url));

      if (target) playStationObj(target);
    };
  });

  pl.querySelectorAll('.pl-add-fav').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const item = btn.closest('.pl-item, .pl-discovery-card');
    const uuid = item.dataset.uuid;
    const url = item.dataset.url;
    const st = getRecentStations().find(s => s.stationuuid === uuid || norm(s.url) === norm(url));
    if (st) {
      if (st.isFav) {
        removeFavByUrl(st.url_resolved || st.url);
        renderFavs();
      } else {
        const suggested = getSuggestedCategory(st);
        openEditModal(st.name, st.url_resolved || st.url, suggested, st.favicon || '', (newName, newUrl, newCat, newFav) => {
          if (newName && newUrl) {
            addFav(st, newName, newUrl, newCat, newFav);
            renderFavs();
          }
        });
      }
    }
  });

  pl.querySelectorAll('.pl-remove').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.rmfav;
    const rid = btn.dataset.rmrecent;

    if (discoveryCategoryFilter === 'RECENT' && rid) {
      const stats = loadUsage();
      const stName = stats[rid] ? stats[rid].name : 'this station';

      sparkyConfirm(`<strong>[${stName}]</strong> from your Recently Listened?`, () => {
        if (stats[rid]) stats[rid].count = 0;
        saveUsage(stats);
        renderFavs();
      }, "REMOVE FROM HISTORY");
    } else if (sid) {
      // STANDARD VAULT REMOVAL
      const fv = loadFavs();
      const st = fv.find(f => f.sparkyId === sid);
      if (st) {
        sparkyConfirm(`Remove [${st.name}] from your Favorites?`, () => {
          removeFavBySparkyId(sid);
          renderFavs();
        }, "DELETE FROM FAVORITES");
      }
    }
  });

  pl.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.edit;
    const m = loadFavs();
    const f = m.find(x => x.sparkyId === sid);
    if (f) openEditModal(f.name, f.url, f.category || 'Undefined', f.favicon || '', (newName, newUrl, newCat, newFav) => {
      if (newName !== null) {
        f.name = newName; f.url = newUrl; f.category = newCat; f.favicon = newFav;
        saveFavs(m); renderFavs();
      }
    });
  });

  // Bind sorting arrows
  pl.querySelectorAll('[data-up]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    handleMoveFav(btn.dataset.up, 'up');
  });
  pl.querySelectorAll('[data-down]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    handleMoveFav(btn.dataset.down, 'down');
  });

  lastRenderedList = displayFavs;
  bindListChips(pl);
  scrollActiveChipIntoView(pl);
}

function bindListChips(pl) {
  pl.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      const favsArea = document.getElementById('playlist');
      discoveryScrollMap[discoveryCategoryFilter] = favsArea.scrollTop;
      discoveryCategoryFilter = chip.dataset.filter;
      // Auto-sanitize sort mode when entering a category
      if (discoveryCategoryFilter !== 'ALL' && sortMode === 'custom') {
        sortMode = 'pwr';
        favSortMode = 'pwr';
        localStorage.setItem('sparky_fav_sort_mode', 'pwr');
        updateSortUI();
      }
      renderFavs();
      favsArea.scrollTop = discoveryScrollMap[discoveryCategoryFilter] || 0;
      triggerHaptic();
    };
  });
}

function groupFavsByCategory(list) {
  const groups = {};
  const recent = getRecentStations();
  if (recent.length > 0) groups['RECENT'] = recent;

  list.forEach(f => {
    const cat = f.category || 'Undefined';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  });
  return groups;
}


function renderGroupedFavs(pl) {
  const groups = groupFavsByCategory(favs);
  const sortedCats = Object.keys(groups).sort();

  const mC = Math.max(...favs.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...favs.map(s => s.votes || 0), 1);
  const mT = Math.max(...favs.map(s => s.clicktrend || 0), 1);

  pl.innerHTML = sortedCats.map(cat => {
    const catFavs = groups[cat];
    const isRecent = cat === 'RECENT';
    // Internal Sorting: Follows Usage if RECENT, otherwise Power or Vote
    const effectiveSort = isRecent ? 'usage' : ((sortMode === 'vote') ? 'vote' : 'pwr');

    if (effectiveSort === 'usage') {
      catFavs.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else if (effectiveSort === 'pwr') {
      catFavs.sort((a, b) => {
        const scoreA = (((a.clickcount || 0) / mC) * 0.6) + (((a.votes || 0) / mV) * 0.3) + (((a.clicktrend || 0) / mT) * 0.1);
        const scoreB = (((b.clickcount || 0) / mC) * 0.6) + (((b.votes || 0) / mV) * 0.3) + (((b.clicktrend || 0) / mT) * 0.1);
        return scoreB - scoreA;
      });
    } else {
      catFavs.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    }

    const isCollapsed = collapsedCategories.includes(cat);

    return `
      <div class="pl-category-group${isCollapsed ? ' collapsed' : ''}" data-cat="${cat}">
        <div class="pl-category-header">
          <span class="pl-category-title">${cat} <span class="pl-category-count">${catFavs.length}</span></span>
          <span class="material-symbols-outlined expand-icon">expand_more</span>
        </div>
        <div class="pl-category-content">
          ${catFavs.map(st => {
      const actv = currentSrc && (
        (st.stationuuid && currentSrc.stationuuid === st.stationuuid) ||
        (st.sparkyId && currentSrc.sparkyId === st.sparkyId) ||
        (norm(currentSrc.url) === norm(st.url_resolved || st.url)) ||
        (norm(currentSrc.url_resolved) === norm(st.url_resolved || st.url))
      );
      const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
      const pwr = Math.min(100, Math.round(rank * 100));
      const trending = (st.clicktrend || 0) > 50 ? '<span class="pl-status-badge trending">Trending</span>' : '';
      let primary = { id: 'pwr', icon: 'bolt', val: isRecent ? `${st.count} plays` : `${pwr}%`, color: 'var(--text)' };
      if (sortMode === 'vote' && !isRecent) { primary = { id: 'vot', icon: 'thumb_up', val: fmtK(st.votes), color: 'var(--text)' }; }
      const tagArr = (st.tags || '').split(',').map(t => t.trim()).filter(t => t);
      const finalTags = tagArr.slice(0, 3).join(', ') || 'Radio';
      const rescued = st.isRescued ? ' rescued' : '';

      const ambientStyle = actv && st.favicon && st.favicon.trim() !== '' ? ` style="--ambient-bg: url('${esc(st.favicon)}');"` : '';
      const ambientClass = actv && st.favicon && st.favicon.trim() !== '' ? ' has-ambient-bg' : '';

      return `<div class="pl-item${actv ? ' active' : ''}${rescued}${ambientClass}" data-sid="${st.sparkyId || ''}" data-uuid="${st.stationuuid || ''}" data-url="${st.url || ''}"${ambientStyle}>
              <div class="pl-favicon-col">${renderFavicon(st)}</div>
              <div class="pl-main-col">
                <div class="pl-item-name">${esc(st.name)}</div>
                <div class="pl-item-meta">${esc(st.countrycode || '--')} \u00B7 ${esc(finalTags)}</div>
                <div class="pl-item-stats">
                  <span class="pl-stat-power" style="color:${primary.color}"><span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">${primary.icon}</span> ${primary.val}</span>
                  ${(Number(st.bitrate || 0) >= 128) ? '<span class="hd-badge-inline">HD</span>' : ''}
                  ${trending}
                </div>
              </div>
              <div class="pl-actions-col">
                ${isRecent && !isFav(st) ? `
                  <button class="pl-action-btn pl-add-fav" title="Add to Favorites" style="color:var(--accent)">
                    <span class="material-symbols-outlined">add_circle</span>
                  </button>
                ` : `
                  <button class="pl-action-btn pl-edit" data-edit="${st.sparkyId || ''}"><span class="material-symbols-outlined">edit</span></button>
                `}
                <button class="pl-action-btn pl-remove" data-rmfav="${st.sparkyId || ''}" data-rmrecent="${st.stationuuid || st.id || ''}"><span class="material-symbols-outlined">delete</span></button>
              </div>
            </div>`;
    }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Update nav cache with flattened grouped list
  lastRenderedList = [];
  sortedCats.forEach(cat => {
    const catFavs = groups[cat];
    const mC = Math.max(...catFavs.map(s => s.clickcount || 0), 1);
    const mV = Math.max(...catFavs.map(s => s.votes || 0), 1);
    const mT = Math.max(...catFavs.map(s => s.clicktrend || 0), 1);

    if (sortMode === 'pwr') {
      catFavs.sort((a, b) => {
        const sA = (((a.clickcount || 0) / mC) * 0.6) + (((a.votes || 0) / mV) * 0.3) + (((a.clicktrend || 0) / mT) * 0.1);
        const sB = (((b.clickcount || 0) / mC) * 0.6) + (((b.votes || 0) / mV) * 0.3) + (((b.clicktrend || 0) / mT) * 0.1);
        return sB - sA;
      });
    } else if (sortMode === 'vote') {
      catFavs.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    }
    lastRenderedList.push(...catFavs);
  });

  // Re-bind click handlers for cards and headers
  pl.querySelectorAll('.pl-category-header').forEach(h => h.onclick = () => {
    const group = h.parentElement;
    const cat = group.dataset.cat;
    group.classList.toggle('collapsed');
    if (group.classList.contains('collapsed')) {
      if (!collapsedCategories.includes(cat)) collapsedCategories.push(cat);
    } else {
      collapsedCategories = collapsedCategories.filter(c => c !== cat);
    }
    localStorage.setItem('sparky_collapsed_cats', JSON.stringify(collapsedCategories));
  });

  // Re-bind station actions (same as standard list)
  bindStationActions(pl, favs);
}

function renderDiscoveryFavs(pl) {
  const groups = groupFavsByCategory(favs);
  const categories = ['ALL', 'RECENT', ...Object.keys(groups).sort().filter(c => c !== 'RECENT')];

  const recentList = getRecentStations();
  let displayFavs = [...favs];

  if (discoveryCategoryFilter === 'RECENT') {
    displayFavs = recentList;
  } else if (discoveryCategoryFilter !== 'ALL') {
    displayFavs = displayFavs.filter(f => (f.category || 'Undefined') === discoveryCategoryFilter);
  }
  if (filterHiFi) {
    displayFavs = displayFavs.filter(s => Number(s.bitrate || 0) >= 128);
  }

  // Internal Sorting
  const mC = Math.max(...favs.map(s => s.clickcount || 0), 1);
  const mV = Math.max(...favs.map(s => s.votes || 0), 1);
  const mT = Math.max(...favs.map(s => s.clicktrend || 0), 1);

  const effectiveSort = discoveryCategoryFilter === 'RECENT' ? 'usage' : ((sortMode === 'vote') ? 'vote' : 'pwr');
  if (effectiveSort === 'usage') {
    displayFavs.sort((a, b) => (b.count || 0) - (a.count || 0));
  } else if (effectiveSort === 'pwr') {
    displayFavs.sort((a, b) => {
      const scoreA = (((a.clickcount || 0) / mC) * 0.6) + (((a.votes || 0) / mV) * 0.3) + (((a.clicktrend || 0) / mT) * 0.1);
      const scoreB = (((b.clickcount || 0) / mC) * 0.6) + (((b.votes || 0) / mV) * 0.3) + (((b.clicktrend || 0) / mT) * 0.1);
      return scoreB - scoreA;
    });
  } else {
    displayFavs.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  }

  let html = `
    <div class="pl-discovery-filters">
      ${categories.map(cat => `
        <div class="filter-chip${discoveryCategoryFilter === cat ? ' active' : ''}" data-filter="${cat}">
          ${cat}
        </div>
      `).join('')}
    </div>
    <div class="pl-discovery-grid">
  `;

  html += displayFavs.map(st => {
    const actv = currentSrc && (
      (st.stationuuid && currentSrc.stationuuid === st.stationuuid) ||
      (st.sparkyId && currentSrc.sparkyId === st.sparkyId) ||
      (norm(currentSrc.url) === norm(st.url_resolved || st.url)) ||
      (norm(currentSrc.url_resolved) === norm(st.url_resolved || st.url))
    );
    const favd = isFav(st);
    const rank = (((st.clickcount || 0) / mC) * 0.6) + (((st.votes || 0) / mV) * 0.3) + (((st.clicktrend || 0) / mT) * 0.1);
    const pwr = Math.min(100, Math.round(rank * 100));

    const tagArr = (st.tags || '').split(',').map(t => t.trim()).filter(t => t);
    const finalTags = tagArr.slice(0, 2).join(' \u00B7 ') || 'Radio';
    const rescued = st.isRescued ? ' rescued' : '';

    let statVal = `<span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">bolt</span> ${pwr}%`;
    if (discoveryCategoryFilter === 'RECENT') statVal = `<span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">bolt</span> ${st.count} plays`;
    else if (sortMode === 'vote') statVal = `<span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle;">thumb_up</span> ${fmtK(st.votes)}`;

    const ambientStyle = actv && st.favicon && st.favicon.trim() !== '' ? ` style="--ambient-bg: url('${esc(st.favicon)}');"` : '';
    const ambientClass = actv && st.favicon && st.favicon.trim() !== '' ? ' has-ambient-bg' : '';

    return `
      <div class="pl-discovery-card${actv ? ' active' : ''}${rescued}${ambientClass}" data-sid="${st.sparkyId || ''}" data-uuid="${st.stationuuid || ''}" data-url="${st.url || ''}"${ambientStyle}>
        <div class="card-favicon-wrap">
          ${renderDiscoveryFavicon(st)}
        </div>
        <div class="card-info">
          <div class="card-name">${esc(st.name)}</div>
          <div class="card-meta">
            <div class="card-tags">${esc(finalTags)}</div>
            <div class="card-stats">
              <div class="card-stat-pwr">${statVal}</div>
              ${discoveryCategoryFilter === 'RECENT' ? `
                <button class="pl-action-btn pl-add-fav" title="Toggle Favorite" style="color:${favd ? 'var(--fav)' : 'var(--accent)'}; margin-left:auto;">
                  <span class="material-symbols-outlined pl-heart${favd ? ' is-fav' : ''}">favorite</span>
                </button>
              ` : (st.category === 'Undefined' || !st.category) ? `
                <button class="pl-action-btn pl-edit card-edit" data-edit="${st.sparkyId || ''}" title="Categorize Station">
                  <span class="material-symbols-outlined">edit</span>
                </button>
              ` : ''}
              <button class="pl-action-btn pl-remove card-remove" data-rmfav="${st.sparkyId || ''}" data-rmrecent="${st.stationuuid || st.id || `${st.name}_${st.url}`}" title="Remove from History">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  html += `</div>`;
  pl.innerHTML = html;
  scrollActiveChipIntoView(pl);

  // Bind Filter Chips
  pl.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      const favsArea = document.getElementById('playlist');
      discoveryScrollMap[discoveryCategoryFilter] = favsArea.scrollTop;
      discoveryCategoryFilter = chip.dataset.filter;
      // Auto-sanitize sort mode when entering a category
      if (discoveryCategoryFilter !== 'ALL' && sortMode === 'custom') {
        sortMode = 'pwr';
        favSortMode = 'pwr';
        localStorage.setItem('sparky_fav_sort_mode', 'pwr');
        updateSortUI();
      }
      renderFavs();
      favsArea.scrollTop = discoveryScrollMap[discoveryCategoryFilter] || 0;
      triggerHaptic();
    };
  });

  // Bind Card Actions (Favicon area for play/stop)
  pl.querySelectorAll('.pl-discovery-card').forEach(card => {
    const wrap = card.querySelector('.card-favicon-wrap');
    if (wrap) {
      wrap.onclick = (e) => {
        e.stopPropagation();
        const sid = card.dataset.sid;
        const uuid = card.dataset.uuid;
        const url = card.dataset.url;

        let target;
        if (sid) target = favs.find(f => f.sparkyId === sid);
        if (!target && uuid) target = recentList.find(s => s.stationuuid === uuid);
        if (!target && url) target = recentList.find(s => norm(s.url) === norm(url));

        if (target) {
          if (currentSrc && isPlaying && (
            (target.sparkyId && currentSrc.sparkyId === target.sparkyId) ||
            (target.stationuuid && currentSrc.stationuuid === target.stationuuid) ||
            (norm(currentSrc.url) === norm(target.url))
          )) {
            stopPlayback();
          } else {
            playStationObj(target);
          }
        }
      };
    }
  });

  pl.querySelectorAll('.pl-add-fav').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const item = btn.closest('.pl-discovery-card');
    const uuid = item.dataset.uuid;
    const url = item.dataset.url;
    const st = recentList.find(s => s.stationuuid === uuid || norm(s.url) === norm(url));
    if (st) {
      if (st.isFav) {
        removeFavByUrl(st.url_resolved || st.url);
        renderFavs();
      } else {
        const suggested = getSuggestedCategory(st);
        openEditModal(st.name, st.url_resolved || st.url, suggested, st.favicon || '', (newName, newUrl, newCat, newFav) => {
          if (newName && newUrl) {
            addFav(st, newName, newUrl, newCat, newFav);
            renderFavs();
          }
        });
      }
    }
  });

  pl.querySelectorAll('.pl-remove, .card-remove').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.rmfav;
    const rid = btn.dataset.rmrecent;

    if (rid && (discoveryCategoryFilter === 'RECENT' || btn.closest('.pl-category-group[data-cat="RECENT"]'))) {
      const stats = loadUsage();
      const stName = stats[rid] ? stats[rid].name : 'this station';
      sparkyConfirm(`<strong>[${stName}]</strong> from your Recently Listened?`, () => {
        if (stats[rid]) stats[rid].count = 0; // Standard reset for all Recent items
        saveUsage(stats);
        renderFavs();
      }, "REMOVE FROM HISTORY");
    } else if (sid) {
      const fv = loadFavs();
      const st = fv.find(f => f.sparkyId === sid);
      if (st) {
        sparkyConfirm(`Remove [${st.name}] from your Favorites?`, () => {
          removeFavBySparkyId(sid);
          renderFavs();
        }, "DELETE FROM FAVORITES");
      }
    }
  });

  // (Redundant Hub removal logic removed - handled by unified .pl-remove/.card-remove logic in renderFavs/renderDiscoveryFavs)

  // Bind Edit Toggle (Conditional for Undefined)
  pl.querySelectorAll('.card-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const sid = btn.dataset.edit;
      const m = loadFavs();
      const f = m.find(x => x.sparkyId === sid);
      if (f) {
        openEditModal(f.name, f.url, f.category || 'Undefined', f.favicon || '', (newName, newUrl, newCat, newFav) => {
          if (newName !== null) {
            f.name = newName; f.url = newUrl; f.category = newCat; f.favicon = newFav;
            saveFavs(m); renderFavs();
          }
        });
      }
    };
  });

  lastRenderedList = displayFavs;
}


function bindStationActions(pl, list) {
  pl.querySelectorAll('.pl-item').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('button')) return;
      const sId = el.dataset.sid;
      const target = list.find(f => f.sparkyId === sId);
      if (target) playStationObj(target);
    };
  });
  pl.querySelectorAll('.pl-remove').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.rmfav;
    const rid = btn.dataset.rmrecent;

    if (rid && (discoveryCategoryFilter === 'RECENT' || btn.closest('.pl-category-group[data-cat="RECENT"]'))) {
      const stats = loadUsage();
      const stName = stats[rid] ? stats[rid].name : 'this station';
      sparkyConfirm(`<strong>[${stName}]</strong> from your Recently Listened?`, () => {
        if (stats[rid]) stats[rid].count = 0;
        saveUsage(stats);
        renderFavs();
      }, "REMOVE FROM HISTORY");
    } else if (sid) {
      const m = loadFavs();
      const f = m.find(x => x.sparkyId === sid);
      if (f) sparkyConfirm(`Remove [${f.name}]?`, () => { removeFavBySparkyId(sid); renderFavs(); }, "DELETE FROM FAVORITES");
    }
  });
  pl.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const sid = btn.dataset.edit;
    const m = loadFavs();
    const f = m.find(x => x.sparkyId === sid);
    if (f) openEditModal(f.name, f.url, f.category || 'Undefined', f.favicon || '', (newName, newUrl, newCat, newFav) => {
      if (newName !== null) {
        f.name = newName; f.url = newUrl; f.category = newCat; f.favicon = newFav;
        saveFavs(m); renderFavs();
      }
    });
  });
}

function handleMoveFav(sid, direction) {
  const m = loadFavs();
  const idx = m.findIndex(f => f.sparkyId === sid);
  if (idx === -1) return;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= m.length) return;

  // Atomic Swap
  [m[idx], m[targetIdx]] = [m[targetIdx], m[idx]];
  saveFavs(m);
  renderFavs();
  triggerHaptic();
}

function triggerHaptic() {
  if (window.navigator && window.navigator.vibrate) {
    window.navigator.vibrate(10);
  }
}

function scrollActiveChipIntoView(container) {
  const activeChip = container.querySelector('.filter-chip.active');
  if (!activeChip) return;

  const parent = activeChip.parentElement;
  if (!parent) return;

  // Check if already visible enough to avoid unnecessary jitter
  const chipRect = activeChip.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const isVisible = (
    chipRect.left >= parentRect.left &&
    chipRect.right <= parentRect.right
  );

  if (!isVisible) {
    activeChip.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  }
}

// â•â• TRANSPORT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Logic moved to footer bindings and togglePlay function


// â•â• FOOTER ACTIONS (Logic defined here, bound in INIT) â•â•â•â•
function handleAddStation() {
  openEditModal("", "", "Select Category", "", (name, url, cat, favicon) => {
    if (!name || !url) return;

    const nUrl = norm(url);
    const m = loadFavs();
    const exists = m.some(f => norm(f.url) === nUrl || norm(f.url_resolved) === nUrl);

    const proceed = () => {
      const finalCat = (cat === 'Select Category') ? 'Undefined' : cat;
      const st = {
        sparkyId: 's_' + Date.now(),
        name: name,
        url: url,
        url_resolved: url,
        category: finalCat,
        favicon: favicon || '',
        bitrate: '?', codec: '?', countrycode: '--', tags: 'Custom'
      };
      m.push(st);
      saveFavs(m);
      renderFavs();
      switchTab('favs');
    };

    if (exists) {
      sparkyConfirm(`URL already exists in your Favorites. Add anyway?`, proceed, "DUPLICATE DETECTED");
    } else {
      proceed();
    }
  }, "ADD CUSTOM STATION", "ADD STATION");
}

function handleRemoveStation() {
  if (!currentSrc) {
    sparkyAlert("NO STATION CURRENTLY PLAYING", "SELECTION REQUIRED");
    return;
  }
  const f = currentSrc;
  const sid = f.sparkyId;

  if (activeTab === 'favs') {
    sparkyConfirm(`Remove [${f.name}] from favorites?`, () => {
      removeFavBySparkyId(sid); stopPlayback(); renderFavs();
    }, "DELETE FROM FAVORITES");
  } else {
    sparkyConfirm(`Remove [${f.name}] from list?`, () => {
      stations = stations.filter(s => s.sparkyId !== sid);
      stopPlayback(); renderStations();
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
    if (icon) {
      if (isP) {
        // Use 'pause' bars for Video mode (Spotify/Apple style)
        // Use 'stop' square for Radio mode (Industrial Broadcast style)
        icon.textContent = (typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) ? 'pause' : 'stop';
      } else {
        icon.textContent = 'play_arrow';
      }
    }
    if (label) {
      label.textContent = isP ? (sparkyYtState.isModeActive ? 'PAUSE' : 'STOP') : 'PLAY';
    }
    // If neither icon nor label exists, but the button does, handle fallback safely
    if (!icon && !label) {
      const fallbackIcon = isP ? ((typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) ? 'pause' : 'stop') : 'play_arrow';
      playBtnFooter.innerHTML = `<span class="material-symbols-outlined">${fallbackIcon}</span>`;
    }
  }
};

const updateVolFill = (el) => {
  if (!el) return;
  const v = el.value;
  el.style.background = `linear-gradient(to right, var(--accent) ${v}%, var(--seek-bg) ${v}%)`;
};

// â•â• SEARCH â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function searchStations(q, isManual = false) {
  if (isSearching) return;
  searchQuery = (q || "").trim();

  localStorage.setItem('sparky_last_query', q || '');
  const hasFilters = filterCountry !== 'ALL' || filterLang !== 'ALL' || filterHiFi;
  if (!q && !hasFilters && !isManual) { stations = []; renderStations(); return; }
  if (q === '' && !isManual) { stations = []; renderStations(); return; } // Explicit empty = clear
  isSearching = true;
  const pl = document.getElementById('playlist');
  if (pl && activeTab === 'stations') pl.innerHTML = '<div class="pl-loading"><div class="spinner"></div>SMART SCANNING...</div>';

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
  const isEscalated = arguments[2] === true; // Internal flag for deep scan

  for (const srv of mirrors) {
    try {
      const baseParams = { limit: 250, hidebroken: true, order: 'clickcount', reverse: true };

      // Only apply filters on the first pass. If we are deep scanning, we go global.
      if (!isEscalated) {
        if (filterCountry !== 'ALL') baseParams.countrycode = filterCountry;
        if (filterLang !== 'ALL') baseParams.language = filterLang.toLowerCase();
      }

      const searchTasks = [];
      if (apiQ) {
        searchTasks.push(fetch(`https://${srv}/json/stations/search?` + new URLSearchParams({ ...baseParams, name: apiQ })));
        searchTasks.push(fetch(`https://${srv}/json/stations/search?` + new URLSearchParams({ ...baseParams, tag: apiQ })));
      } else {
        searchTasks.push(fetch(`https://${srv}/json/stations/search?` + new URLSearchParams(baseParams)));
      }

      const responses = await Promise.all(searchTasks);
      const results = await Promise.all(responses.map(r => r.ok ? r.json() : []));
      const raw = [].concat(...results);
      const uniqueMap = new Map();
      raw.forEach(st => { const id = st.stationuuid || st.url; if (!uniqueMap.has(id)) uniqueMap.set(id, st); });
      const deduplicatedRaw = Array.from(uniqueMap.values());

      let filtered = deduplicatedRaw.filter(st => {
        const blob = (st.name + " " + (st.tags || '')).toLowerCase();
        for (const ex of excluded) if (blob.includes(ex)) return false;
        for (const req of required) if (!blob.includes(req)) return false;
        return true;
      });
      if (filterHiFi) filtered = filtered.filter(s => Number(s.bitrate || 0) >= 128);

      // ESCALATION LOGIC
      if (filtered.length === 0 && !isEscalated && (filterCountry !== 'ALL' || filterLang !== 'ALL')) {
        console.log(`[SEARCH] No results in ${filterCountry}/${filterLang}. Escalating to Global Deep Scan...`);
        isSearching = false; // Reset for recursion
        return searchStations(q, isManual, true);
      }

      if (filtered.length > 0) {
        // Success!
      } else if (srv === mirrors[mirrors.length - 1]) {
        // End of the line
      } else {
        continue;
      }

      const mirrorIndicator = document.getElementById('mirrorIndicator');
      if (mirrorIndicator) mirrorIndicator.textContent = (isEscalated ? '🌐 ' : '') + srv.split('.')[0].toUpperCase();

      const maxClicks = Math.max(...filtered.map(s => Number(s.clickcount || 0)), 1);
      const maxVotes = Math.max(...filtered.map(s => Number(s.votes || 0)), 1);
      const maxTrend = Math.max(...filtered.map(s => Number(s.clicktrend || 0)), 1);
      const getScore = s => (((Number(s.clickcount || 0) / maxClicks) * 0.6) + ((Number(s.votes || 0) / maxVotes) * 0.3) + ((Number(s.clicktrend || 0) / maxTrend) * 0.1));

      stations = filtered.sort((a, b) => getScore(b) - getScore(a));
      success = true; break;
    } catch (e) { }
  }

  if (success) {
    renderStations();
  } else if (pl) {
    const fallbackMsg = q ? `NO STATIONS FOUND FOR "${q.toUpperCase()}"<br><span style="font-size:10px; color:var(--dim)">TRY SEARCHING BY GENRE (E.G. REGGAETON, ROCK)</span>` : '⚠️ ALL MIRRORS UNREACHABLE';
    pl.innerHTML = `<div class="pl-empty"><div class="pl-empty-icon"><span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.6;">sensors</span></div><div>${fallbackMsg}</div></div>`;
  }
  isSearching = false;
}

/* toggleFilters removed as Discovery Rack is now persistent */

function expandFilters() {
  const rack = document.getElementById('filterRack');
  if (rack?.classList.contains('collapsed')) rack.classList.remove('collapsed');
}


// â•â• SETTINGS & UI â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â• SETTINGS & UI (Logic defined here, bound in INIT) â•â•
function handleExport() {
  const exportPayload = {
    version: 2,
    favorites: loadFavs(),
    usageStats: loadUsage()
  };
  const data = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sparky_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  sparkyAlert("Favorites Vault and Recent History exported.", "EXPORT SUCCESSFUL");
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (re) => {
    try {
      const data = JSON.parse(re.target.result);
      let newFavs = [];
      let newUsage = null;

      if (Array.isArray(data)) {
        newFavs = data; // Legacy v1 backup
      } else if (data && data.favorites && Array.isArray(data.favorites)) {
        newFavs = data.favorites; // New v2 backup
        if (data.usageStats) newUsage = data.usageStats;
      } else {
        throw new Error();
      }

      sparkyConfirm(`Restore ${newFavs.length} stations from file? This will overwrite current favorites${newUsage ? ' and recent history' : ''}.`, () => {
        saveFavs(newFavs);
        if (newUsage) saveUsage(newUsage);
        refreshFavBadge();
        if (activeTab === 'favs') renderFavs();
        sparkyAlert("Vault Restored Successfully!", "RESTORE COMPLETE");
      }, "CONFIRM RESTORE");
    } catch (err) {
      sparkyAlert("Invalid JSON file. Please use a valid Sparky Radio backup.", "RESTORE FAILED");
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function shiftColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    G = (num >> 8 & 0x00FF) + amt,
    B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function getColorDistance(hex1, hex2) {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

function getContrastColor(hex) {
  if (!hex || hex.length < 7) return '#ffffff';
  // Standard sRGB luminance formula
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.5 ? '#000000' : '#ffffff';
}

function applyPanelColor(color) {
  panelColor = color;
  const root = document.documentElement;
  root.style.setProperty('--panel', color);
  localStorage.setItem('sparky_panel_color', color);

  const contrast = getContrastColor(color);
  root.style.setProperty('--panel-text', contrast);
  root.style.setProperty('--panel-dim', contrast === '#000000' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)');
  root.style.setProperty('--panel-border', contrast === '#000000' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)');

  // LAYER 2: Surface Integration
  const isLight = contrast === '#000000';
  const hoverTint = shiftColor(color, isLight ? -8 : 12);
  const activeTint = shiftColor(color, isLight ? -15 : 25); // Stronger shift for active
  const glowTint = shiftColor(color, isLight ? -15 : 25);
  root.style.setProperty('--panel-hover', hoverTint);
  root.style.setProperty('--panel-active', activeTint);
  root.style.setProperty('--panel-glow', glowTint);

  // LAYER 3: Accent Collision Protection
  const teal = '#00f2ff';
  const dist = getColorDistance(color, teal);
  const needsCorrection = dist < 85; // Slightly wider threshold for safety
  root.style.setProperty('--accent-correction', needsCorrection ? (isLight ? 'drop-shadow(0 0 1px #000) brightness(0.7)' : 'drop-shadow(0 0 10px rgba(255,255,255,0.6)) brightness(1.2)') : 'none');

  const picker = document.getElementById('panelColorPicker');
  if (picker) picker.value = color;
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
  "RS": "Serbia", "RU": "Russian Federation", "SE": "Sweden", "SK": "Slovakia", "TR": "TÃ¼rkiye", "TW": "Taiwan",
  "UA": "Ukraine", "UG": "Uganda", "US": "United States", "UY": "Uruguay", "VE": "Venezuela", "ZA": "South Africa"
};

function loadFilterOptions() {
  const cCont = document.getElementById('filterCountryOptions'), lCont = document.getElementById('filterLangOptions');
  if (!cCont || !lCont) return;

  const defC = localStorage.getItem('sparky_default_country') || 'ALL';
  const defL = localStorage.getItem('sparky_default_lang') || 'ALL';

  const fct = document.getElementById('filterCountryTrigger');
  if (fct) fct.innerHTML = '<span class="material-symbols-outlined">public</span>';
  const flt = document.getElementById('filterLangTrigger');
  if (flt) flt.innerHTML = '<span class="material-symbols-outlined">language</span>';




  const finalC = ['ALL'];

  if (defC !== 'ALL' && CTRY_LIST.includes(defC)) finalC.push(defC);
  finalC.push(...CTRY_LIST.filter(c => c !== 'ALL' && c !== defC).sort());

  const finalL = ['ALL'];
  if (defL !== 'ALL' && LANG_LIST.includes(defL)) finalL.push(defL);
  finalL.push(...LANG_LIST.filter(l => l !== 'ALL' && l !== defL).sort());

  cCont.innerHTML = finalC.map(c => {
    const name = CTRY_NAMES[c] || c;
    const display = c === 'ALL' ? 'All countries' : `${name} \u00B7 ${c}`;
    return `<div class="preset-opt" data-val="${c}">${display}</div>`;
  }).join('');

  lCont.innerHTML = finalL.map(l => {
    const name = l.charAt(0).toUpperCase() + l.slice(1);
    const code = l === 'ALL' ? 'ALL' : l.substring(0, 3).toUpperCase();
    const display = l === 'ALL' ? 'All languages' : `${name} \u00B7 ${code}`;
    return `<div class="preset-opt" data-val="${l}">${display}</div>`;
  }).join('');

  cCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => { filterCountry = o.dataset.val; document.getElementById('filterCountryTrigger').innerHTML = `<span class="material-symbols-outlined">public</span>${filterCountry === 'ALL' ? '' : ' ' + filterCountry}`; cCont.classList.remove('show'); searchStations(document.getElementById('searchInput').value); });
  lCont.querySelectorAll('.preset-opt').forEach(o => o.onclick = () => { filterLang = o.dataset.val; const lVal = filterLang === 'ALL' ? '' : ' ' + filterLang.substring(0, 3).toUpperCase(); document.getElementById('filterLangTrigger').innerHTML = `<span class="material-symbols-outlined">language</span>${lVal}`; lCont.classList.remove('show'); searchStations(document.getElementById('searchInput').value); });



}


const defaultPresets = ["Jazz", "Blues", "Rock", "Pop", "Classical", "News", "Country", "80s", "90s", "Charts"];
function loadPresets() {
  const custom = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
  const all = [...new Set([...defaultPresets, ...custom])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const container = document.getElementById('presetOptions');
  if (!container) return;
  let html = `<div class="preset-opt add-opt" data-val="ADD">+ Add new tune</div>`;
  all.forEach(p => {
    const isDefault = defaultPresets.includes(p);
    html += `<div class="preset-opt" data-val="${p}"><span>${p}</span>${!isDefault ? `<span class="preset-del" data-del="${p}">âœ•</span>` : ''}</div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.preset-opt').forEach(opt => opt.onclick = (e) => {
    if (e.target.classList.contains('preset-del')) return;

    // New Search Intent: Clear HD filter
    filterHiFi = false;
    const btn = document.getElementById('btnHifi');
    if (btn) btn.classList.remove('active');

    handlePresetSelect(opt.dataset.val);
  });
  container.querySelectorAll('.preset-del').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const val = btn.dataset.del;
    sparkyConfirm(`Remove [${val}] from Quick-Tunes?`, () => {
      const up = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]').filter(x => x !== val);
      localStorage.setItem('sparky_search_presets', JSON.stringify(up));

      const trigger = document.getElementById('presetTrigger');
      if (trigger && trigger.textContent === val) {
        trigger.textContent = 'Quick-Tune';
      }

      loadPresets();
    });
  });
}

function handlePresetSelect(val) {
  const container = document.getElementById('presetOptions');
  if (val === 'ADD') {
    sparkyPrompt("Enter new tune name (e.g. Jazz, 80s):", "ADD QUICK-TUNE", (name) => {
      if (!name) return;
      const c = JSON.parse(localStorage.getItem('sparky_search_presets') || '[]');
      if (!c.includes(name)) { c.push(name); localStorage.setItem('sparky_search_presets', JSON.stringify(c)); loadPresets(); }
    });
  }
  else {
    activeSearchPreset = val;
    const si = document.getElementById('searchInput');
    if (si) {
      si.value = val;
      if (window.syncSearchUI) window.syncSearchUI();
    }
    searchStations(val, true);
    document.getElementById('presetTrigger').textContent = val;
    container.classList.remove('show');
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
    const display = c === 'ALL' ? 'All countries' : `${name} \u00B7 ${c}`;
    return `<div class="preset-opt${c === defC ? ' active' : ''}" data-val="${c}">${display}</div>`;
  }).join('');

  dlCont.innerHTML = LANG_LIST.map(l => {
    const name = l.charAt(0).toUpperCase() + l.slice(1);
    const code = l === 'ALL' ? 'ALL' : l.substring(0, 3).toUpperCase();
    const display = l === 'ALL' ? 'All languages' : `${name} \u00B7 ${code}`;
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

}
// â•â• APP INITIALIZATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ FORENSIC DEBUGGING MODULE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sparkyLog(msg) {
  // console.log(`%c[SPARKY-DEBUG] ${msg}`, 'color: #4fd1c5; font-weight: bold;');
  const out = document.getElementById('debugOutput');
  if (out) {
    const d = new Date();
    const ts = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + d.getMilliseconds();
    // out.innerHTML = `<div><span style="color:var(--accent)">[${ts}]</span> ${msg}</div>` + out.innerHTML;
  }
}

function debugLayout(label) {
  const app = document.querySelector('.app');
  const player = document.getElementById('sparky-yt-player-wrap');
  const results = document.getElementById('ytResults');

  sparkyLog(`L-TRACE [${label}]`);
  sparkyLog(`  > Window: ${window.innerWidth}x${window.innerHeight}, scrollY: ${window.scrollY}`);
  if (app) sparkyLog(`  > .app: h=${app.offsetHeight}, top=${app.offsetTop}, clientH=${app.clientHeight}`);
  if (player) sparkyLog(`  > Player: h=${player.offsetHeight}, hidden=${player.classList.contains('hidden')}`);
  if (results) sparkyLog(`  > Results: scrollT=${results.scrollTop}`);
}

window.addEventListener('scroll', (e) => {
  if (window.scrollY !== 0) {
    sparkyLog(`!! SCROLL DETECTED: window.scrollY=${window.scrollY}`);
    // Optional: console.trace(); // Check console for origin
  }
}, true);

// â”€â”€ APP INITIALIZATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', () => {
  // sparkyLog('System Initialized - Forensic Mode Active');
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

  // Background maintenance tasks
  healFavoritesFavicons();
  filterHiFi = false; // Standardizing to Discovery-First startup
  const bhf = document.getElementById('btnHifi');
  if (bhf) bhf.classList.toggle('active', filterHiFi);

  loadFilterOptions();
  loadSettingsOptions();

  bind('npLabel', (e) => { e.stopPropagation(); jumpToCategoryShortcut(currentSrc); });
  bind('npJumpArea', () => jumpToStation(currentSrc));

  // â•â• DEFAULTS TRIGGERS â•â•
  // â•â• DEFAULTS TRIGGERS (Safe Bindings) â•â•
  bind('defaultCountryTrigger', (e) => { e.stopPropagation(); document.getElementById('defaultCountryOptions')?.classList.toggle('show'); });
  bind('defaultLangTrigger', (e) => { e.stopPropagation(); document.getElementById('defaultLangOptions')?.classList.toggle('show'); });


  // HiFi Default Toggle removed

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
  searchInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      // New Search Intent: Clear HD filter
      filterHiFi = false;
      const btn = document.getElementById('btnHifi');
      if (btn) btn.classList.remove('active');
      switchTab('stations');
      searchStations(searchInput.value, true);
    }
  };

  btnSearchClear.onclick = () => {
    searchInput.value = '';
    searchInput.focus();
    toggleSearchClear();
    document.getElementById('presetTrigger').textContent = 'Quick-Tune';
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
    document.getElementById('btnEq').innerHTML = isOpen ? '<span class="material-symbols-outlined" style="font-size:18px">close</span>' : 'EQ';

    if (isOpen) {
      wasCollapsedBeforeEQ = document.getElementById('filterRack').classList.contains('collapsed');
      document.getElementById('filterRack').classList.add('collapsed');
    } else {
      if (!wasCollapsedBeforeEQ) {
        document.getElementById('filterRack').classList.remove('collapsed');
      }
    }

  };

  // â”€â”€ VOLUME ROW LOGIC â”€â”€
  let volTimer = null;
  const volCtrl = document.getElementById('volCtrl');
  const volRow = document.getElementById('volRow');
  const btnVolToggle = document.getElementById('btnVolToggle');
  const volSlider = document.getElementById('volSlider');

  const updateVolIcon = (v) => {
    const icon = btnVolToggle?.querySelector('.material-symbols-outlined');
    if (icon) {
      if (v == 0) icon.textContent = 'volume_off';
      else if (v < 30) icon.textContent = 'volume_mute';
      else if (v < 70) icon.textContent = 'volume_down';
      else icon.textContent = 'volume_up';
    }
  };

  const showVol = () => {
    volRow?.classList.add('show');
    resetVolTimer();
  };
  const hideVol = () => {
    volRow?.classList.remove('show');
    if (volTimer) clearTimeout(volTimer);
  };
  const resetVolTimer = () => {
    if (volTimer) clearTimeout(volTimer);
    volTimer = setTimeout(hideVol, 2000); // Re-calibrated to 2s for snappier dismissal
  };

  if (btnVolToggle) {
    btnVolToggle.onclick = (e) => {
      e.stopPropagation();
      volRow?.classList.contains('show') ? hideVol() : showVol();
    };
  }

  if (volSlider) {
    // Initial sync
    const savedVol = localStorage.getItem('sparky_volume') || 80;
    volSlider.value = savedVol;
    updateVolIcon(savedVol);

    volSlider.oninput = (e) => {
      const v = e.target.value;
      audioEl.volume = v / 100;
      if (sparkyYtState.playerInstance && typeof sparkyYtState.playerInstance.setVolume === 'function') {
        sparkyYtState.playerInstance.setVolume(v);
      }
      localStorage.setItem('sparky_volume', v);
      updateVolFill(e.target);
      updateVolIcon(v);
      resetVolTimer();
    };
    volSlider.onmousedown = volSlider.ontouchstart = () => { if (volTimer) clearTimeout(volTimer); };
    volSlider.onmouseup = volSlider.ontouchend = () => { resetVolTimer(); };
  }

  // Click away to close (Integrated with existing window click)
  window.addEventListener('click', (e) => {
    if (volRow && !volCtrl?.contains(e.target) && !volRow.contains(e.target)) hideVol();
  });


  // â•â• CONSOLIDATED DOM BINDINGS (ELIMINATE TYPEERROR) â•â•
  function bind(id, fn, ev = 'onclick') { const el = document.getElementById(id); if (el) el[ev] = fn; }

  bind('btnSearch', () => {
    const q = document.getElementById('searchInput').value.trim();
    // New Search Intent: Clear HD filter
    filterHiFi = false;
    const btn = document.getElementById('btnHifi');
    if (btn) btn.classList.remove('active');
    expandFilters(); if (q) { switchTab('stations'); searchStations(q); }
  });

  bind('btnPlayFooter', () => { if (typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) toggleYtPlay(); else togglePlay(); });
  bind('btnNextFooter', () => { if (typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) playYtNext(); else playNext(); });
  bind('btnPrevFooter', () => { if (typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) playYtPrev(); else playPrevious(); });

  bind('btnAddVault', handleAddStation);
  bind('btnRemove', handleRemoveStation);
  bind('filterCountryTrigger', (e) => { e.stopPropagation(); document.getElementById('filterCountryOptions')?.classList.toggle('show'); });
  bind('filterLangTrigger', (e) => { e.stopPropagation(); document.getElementById('filterLangOptions')?.classList.toggle('show'); });
  bind('btnHifi', () => {
    filterHiFi = !filterHiFi;
    const btn = document.getElementById('btnHifi');
    if (btn) btn.classList.toggle('active', filterHiFi);

    // Reactive Badge Sync
    refreshFavBadge();
    if (activeTab !== 'stations') {
      const sb = document.getElementById('stationsBadge');
      if (sb) {
        const count = filterHiFi ? stations.filter(s => Number(s.bitrate || 0) >= 128).length : stations.length;
        sb.textContent = count;
      }
    }

    updateNowPlaying(currentSrc);
    const q = document.getElementById('searchInput').value.trim();
    if (activeTab === 'favs') {
      renderFavs();
    } else {
      if (q || filterCountry !== 'ALL' || filterLang !== 'ALL') {
        searchStations(q, true);
      } else {
        stations = []; renderStations();
      }
    }
  });
  bind('presetTrigger', (e) => { e.stopPropagation(); document.getElementById('presetOptions')?.classList.toggle('show'); });

  // â•â• BACKDROP CLICK LISTENER â•â•
  window.addEventListener('click', () => {
    ['presetOptions', 'filterCountryOptions', 'filterLangOptions', 'defaultCountryOptions', 'defaultLangOptions', 'statsModeOptions'].forEach(id => {
      document.getElementById(id)?.classList.remove('show');
    });
  });

  // â•â• SYSTEM & UTILITY BINDINGS (SAFE) â•â•
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

  // â•â• INTERFACE SCALE BINDINGS â•â•
  bind('textScaleSlider', (e) => applyTextScale(parseFloat(e.target.value)), 'oninput');
  bind('btnResetScale', () => applyTextScale(1.0));

  // â”€â”€ PANEL THEME BINDINGS â”€â”€
  bind('panelColorPicker', (e) => applyPanelColor(e.target.value), 'oninput');
  bind('btnResetPanel', () => applyPanelColor('#061021'));

  // â•â• SORT MODE BINDING â•â•
  bind('btnSortMode', () => {
    if (activeTab === 'favs' && discoveryCategoryFilter === 'RECENT') return;
    const modes = (activeTab === 'stations' || favViewMode !== 'list' || (discoveryCategoryFilter !== 'ALL' && discoveryCategoryFilter !== 'RECENT')) ? ['pwr', 'vote'] : ['pwr', 'vote', 'custom'];
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

  // â”€â”€ VIEW MODE BINDINGS â”€â”€
  bind('btnViewToggle', () => {
    if (favViewMode === 'list') {
      favViewMode = 'discovery';
    } else {
      favViewMode = 'list';
    }

    localStorage.setItem('sparky_fav_view', favViewMode);

    // Auto-sanitize sort mode when entering grid views
    if (favViewMode !== 'list' && sortMode === 'custom') {
      sortMode = 'pwr';
      favSortMode = 'pwr';
      localStorage.setItem('sparky_fav_sort_mode', 'pwr');
      updateSortUI();
    }

    updateViewToggleUI();
    renderFavs();
    triggerHaptic();
  });


  updateViewToggleUI();

  // â•â• LAST STATION RESTORATION â•â•
  const last = localStorage.getItem('sparky_last_station');
  if (last) {
    try {
      currentSrc = JSON.parse(last);
      updateNowPlaying(currentSrc);
    } catch (e) { console.warn("Failed to restore last station", e); }
  }

  updateDeploymentUI();
  refreshFavBadge();
  updateSortUI();

  // Just set the text directly if safe
  const presetTrigger = document.getElementById('presetTrigger');
  if (presetTrigger) presetTrigger.textContent = 'Quick-Tune';
  const lastQ = localStorage.getItem('sparky_last_query');
  if (lastQ !== null && lastQ.trim() !== '') {
    if (searchInput) searchInput.value = lastQ;
    searchStations(lastQ, false, true); // Restore query but SKIP tab switch
  }

  // Always default to Favorites view on clean boot
  switchTab('favs');

  // Initial Theme Application
  applyPanelColor(panelColor);

  if (window.syncSearchUI) window.syncSearchUI();

  // Smart Auto-Resume on network reconnect (R-E4)
  window.addEventListener('offline', () => {
    if (isPlaying && currentSrc) {
      wasPlayingBeforeOffline = true;
      offlineRetryCount = 0;
      console.log(`[OFFLINE] Network disconnected. Pausing player to preserve stream state.`);
      setStatus('buffering', 'Network Offline');
      audioEl.pause();
    }
  });

  window.addEventListener('online', () => {
    if (wasPlayingBeforeOffline && currentSrc) {
      console.log(`[ONLINE] Network restored. Attempting auto-resume for: ${currentSrc.name}`);
      setStatus('buffering', 'Network Restored...');
      setTimeout(() => {
        // Double check we are still online and player hasn't been manually stopped
        if (navigator.onLine && wasPlayingBeforeOffline && currentSrc) {
          wasPlayingBeforeOffline = false; // Reset before retrying
          playStationObj(currentSrc);
        }
      }, 1500); // 1.5s delay to allow network hardware/routes to stabilize
    }
  });

  // --- INDEPENDENT COLLAPSIBLE MINI-PLAYER LOGIC (R-U6) ---
  const npPanel = document.querySelector('.now-playing');
  const playlistContainer = document.getElementById('playlist');
  const ytResultsContainer = document.getElementById('ytResults');
  const ytHubContainer = document.getElementById('ytHub');
  let ignoreScrollCollapse = false;
  let lastRadioScrollTop = 0;
  let lastScrollTop = 0;
  let compactInactivityTimer = null;
  const INACTIVITY_TIME = 15000; // 15s inactivity auto-restore

  function resetCompactInactivityTimer() {
    if (compactInactivityTimer) clearTimeout(compactInactivityTimer);
    if (!npPanel) return;
    compactInactivityTimer = setTimeout(() => {
      if (npPanel.classList.contains('compact-radio') || npPanel.classList.contains('compact-video')) {
        npPanel.classList.remove('compact-radio', 'compact-video');
        lastRadioScrollTop = 0;
        lastScrollTop = 0;
      }
    }, INACTIVITY_TIME);
  }

  // Bind interaction events to restore standard view after 15s inactivity
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetCompactInactivityTimer, { passive: true });
  });

  function handleRadioScrollCollapse(e) {
    if (!npPanel || ignoreScrollCollapse) return;
    if (typeof sparkyYtState !== 'undefined' && sparkyYtState.isModeActive) return;

    // Viewport-agnostic card count safety gate: do not compact if list is short (<= 10 cards)
    const cardCount = playlistContainer ? playlistContainer.querySelectorAll('.pl-item').length : 0;
    if (cardCount <= 10) {
      npPanel.classList.remove('compact-radio');
      return;
    }

    const scrollTop = e.currentTarget.scrollTop;
    // Only collapse if scrolling down
    if (scrollTop > 120 && scrollTop > lastRadioScrollTop) {
      npPanel.classList.add('compact-radio');
    } else if (scrollTop <= 10) {
      npPanel.classList.remove('compact-radio');
    }
    lastRadioScrollTop = scrollTop;
    resetCompactInactivityTimer();
  }

  function handleVideoScrollCollapse(e) {
    if (!npPanel || ignoreScrollCollapse) return;
    if (typeof sparkyYtState === 'undefined' || !sparkyYtState.isModeActive) return;
    if (document.querySelector('.app')?.classList.contains('immersive-cinema-mode')) {
      npPanel.classList.remove('compact-video');
      return;
    }

    const scrollTop = e.currentTarget.scrollTop;
    // Only collapse if scrolling down
    if (scrollTop > 50 && scrollTop > lastScrollTop) {
      npPanel.classList.add('compact-video');
    } else if (scrollTop <= 10) {
      npPanel.classList.remove('compact-video');
    }
    lastScrollTop = scrollTop;
    resetCompactInactivityTimer();
  }

  if (playlistContainer) {
    playlistContainer.addEventListener('scroll', handleRadioScrollCollapse, { passive: true });
  }
  if (ytResultsContainer) {
    ytResultsContainer.addEventListener('scroll', handleVideoScrollCollapse, { passive: true });
  }
  if (ytHubContainer) {
    ytHubContainer.addEventListener('scroll', handleVideoScrollCollapse, { passive: true });
  }

  // Allow tapping compact player to expand it back to full
  if (npPanel) {
    npPanel.addEventListener('click', (e) => {
      // Don't expand if clicking interactive links or buttons (like stop/play buttons)
      if (e.target.closest('button') || e.target.closest('a')) return;

      const isCompactRadio = npPanel.classList.contains('compact-radio');
      const isCompactVideo = npPanel.classList.contains('compact-video');

      if (isCompactRadio || isCompactVideo) {
        e.stopPropagation();
        e.preventDefault();
        
        ignoreScrollCollapse = true;
        npPanel.classList.remove('compact-radio', 'compact-video');
        if (compactInactivityTimer) clearTimeout(compactInactivityTimer);
        
        // Wake up from immersive cinema mode to ensure main UI is fully restored
        if (isCompactVideo && typeof wakeFromCinemaMode === 'function') {
          wakeFromCinemaMode();
        }

        // Lock scroll thresholds to prevent immediate re-collapse on minor scrolls
        if (isCompactVideo && ytResultsContainer) {
          lastScrollTop = ytResultsContainer.scrollTop;
        } else if (isCompactVideo && ytHubContainer) {
          lastScrollTop = ytHubContainer.scrollTop;
        } else if (isCompactRadio && playlistContainer) {
          lastRadioScrollTop = playlistContainer.scrollTop;
        }

        setTimeout(() => {
          ignoreScrollCollapse = false;
        }, 300); // 300ms lock protects against touch release vibrations
      }
    });
  }
});

function updateViewToggleUI() {
  const icon = document.getElementById('viewToggleIcon');
  if (!icon) return;

  const currentIcons = {
    list: 'format_list_bulleted',
    grouped: 'folder',
    discovery: 'apps'
  };

  const titles = {
    list: 'Current View: List',
    grouped: 'Current View: Categories',
    discovery: 'Current View: Discovery Hub'
  };

  icon.textContent = currentIcons[favViewMode] || 'format_list_bulleted';
  icon.parentElement.title = titles[favViewMode] || 'Toggle View';
}


function updateSortUI() {
  const btn = document.getElementById('btnSortMode');
  const tip = document.getElementById('plSortTooltip');
  if (!btn || !tip) return;

  const isRecent = activeTab === 'favs' && discoveryCategoryFilter === 'RECENT';
  const isLocked = isRecent; // Explicit lock only for Recent shelf

  btn.classList.toggle('disabled-ui', isLocked);
  btn.title = isLocked ? "Sorting locked to Usage in Recent View" : "Change Sort Mode";

  btn.innerHTML = `<span class="material-symbols-outlined">sort</span>`;

  const modes = (activeTab === 'stations' || favViewMode !== 'list' || (discoveryCategoryFilter !== 'ALL' && discoveryCategoryFilter !== 'RECENT')) ? ['pwr', 'vote'] : ['pwr', 'vote', 'custom'];
  const labels = { pwr: 'Power Ranking', vote: 'Vote Ranking', custom: 'Custom Order' };
  const icons = { pwr: 'bolt', vote: 'how_to_vote', custom: 'star' };

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

function playNext() {
  const list = getCurrentNavigationList();
  if (!list.length) return;
  let idx = list.findIndex(st =>
    (st.sparkyId && currentSrc?.sparkyId === st.sparkyId) ||
    (st.stationuuid && currentSrc?.stationuuid === st.stationuuid) ||
    (norm(currentSrc?.url) === norm(st.url_resolved || st.url))
  );
  playStationObj(list[(idx + 1) % list.length]);
}

function playPrevious() {
  const list = getCurrentNavigationList();
  if (!list.length) return;
  let idx = list.findIndex(st =>
    (st.sparkyId && currentSrc?.sparkyId === st.sparkyId) ||
    (st.stationuuid && currentSrc?.stationuuid === st.stationuuid) ||
    (norm(currentSrc?.url) === norm(st.url_resolved || st.url))
  );
  if (idx === -1) idx = 1;
  playStationObj(list[(idx - 1 + list.length) % list.length]);
}

function updateMediaSession(st) {
  if (!('mediaSession' in navigator)) return;

  const artwork = st.favicon ? [
    { src: st.favicon, sizes: '96x96', type: 'image/png' },
    { src: st.favicon, sizes: '128x128', type: 'image/png' },
    { src: st.favicon, sizes: '192x192', type: 'image/png' },
    { src: st.favicon, sizes: '256x256', type: 'image/png' },
    { src: st.favicon, sizes: '384x384', type: 'image/png' },
    { src: st.favicon, sizes: '512x512', type: 'image/png' },
  ] : [];

  navigator.mediaSession.metadata = new MediaMetadata({
    title: st.name,
    artist: st.countrycode || 'Radio',
    album: 'SPARKY RADIO',
    artwork: artwork
  });

  navigator.mediaSession.setActionHandler('play', () => { if (currentSrc) playStationObj(currentSrc); });
  navigator.mediaSession.setActionHandler('pause', () => stopPlayback());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNext());

  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
}

window.setEqPreset = setEqPreset;
window.saveCustomEq = saveCustomEq;
window.resetEqDefaults = resetEqDefaults;
window.updateDeploymentUI = updateDeploymentUI;

async function healFavoritesFavicons() {
  const m = loadFavs();
  // Filter for favorites missing a favicon but having a recognizable ID
  const missing = m.filter(f => (!f.favicon || f.favicon.trim() === '') && f.id && f.id.length > 10);
  if (missing.length === 0) return;

  // Skip background healing in local dev to prevent console noise from failing mirrors
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

  console.log(`[SELF-HEAL] Found ${missing.length} favorites missing icons. Starting background rescue...`);

  let restoredCount = 0;
  // Process up to 15 per session to stay within API courtesy limits
  for (let i = 0; i < Math.min(missing.length, 15); i++) {
    const f = missing[i];
    try {
      // Use different mirrors to avoid rate limiting
      const mirrors = ['de1', 'at1', 'nl1'];
      const mirror = mirrors[i % mirrors.length];
      const url = `https://${mirror}.api.radio-browser.info/json/stations/byuuid/${f.id}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0 && data[0].favicon) {
        f.favicon = data[0].favicon;
        restoredCount++;
      }
    } catch (e) {
      console.warn(`[SELF-HEAL] Failed to rescue icon for ${f.name}`);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  if (restoredCount > 0) {
    saveFavs(m);
    console.log(`[SELF-HEAL] Successfully restored ${restoredCount} icons. Refreshing UI...`);
    if (activeTab === 'favs') renderFavs();
  }
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•‘  SPARKY YT MODULE â€” Phase 2: State Manager & DOM Toggling  â•‘
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const sparkyYtState = {
  isModeActive: false,
  playerInstance: null,
  activeAbortController: null,
  activePrefetchAbortController: null,
  currentQueue: [],
  originalQueue: [],
  temporaryQueue: [], // User-built manual queue
  queueIndex: 0,
  currentSubMode: 'videos',
  videoCache: {
    query: '',
    results: [],
    continuation: null,
    hasMore: false,
    isFetchingMore: false,
    prefetchedPage: null
  },
  playlistCache: {
    query: '',
    results: [],
    continuation: null,
    hasMore: false,
    isFetchingMore: false,
    prefetchedPage: null
  },
  activePlaylistId: null,
  currentItemId: null,  // Tracks last played item â€” used to restore highlight after tab switch
  isAudioOnly: false,
  isShuffleActive: false,
  tempQueuePlayedIds: new Set(), // Track played IDs for pulsing logic
  loopMode: 'none', // 'none' | 'one'
  relatedVideos: [], // For related videos overlay
  relatedSortMode: 'relevance', // Sort order: relevance | views
  dropdownOpen: false, // V-U7: Dropdown visibility state
  autocompleteResults: [], // V-U7: Tier 2 autocomplete results
  smartSuggestions: [] // V-U7: Tier 3 context suggestions
};

const YT_FAVS_KEY = 'sparky_yt_favorites';
const YT_HISTORY_KEY = 'sparky_yt_history';
const YT_TEMP_QUEUE_KEY = 'sparky_yt_temp_queue';

/* --- IMMERSIVE CINEMA MODE --- */
let cinemaModeTimer = null;
const CINEMA_TIMEOUT_MS = 20000;

function wakeFromCinemaMode() {
  document.querySelector('.app').classList.remove('immersive-cinema-mode');
  if (document.getElementById('cinemaWakeZone')) document.getElementById('cinemaWakeZone').classList.remove('is-cinema');
  document.getElementById('btnYtCinemaToggle')?.classList.remove('active');
  resetCinemaTimer();
}

function resetCinemaTimer() {
  clearTimeout(cinemaModeTimer);
  if (!sparkyYtState.isModeActive) return;
  if (!sparkyYtState.playerInstance) return;

  // Suppress automatic cinema mode entry if the video player is in compact mode
  const npPanel = document.querySelector('.now-playing');
  if (npPanel && (npPanel.classList.contains('compact-video') || npPanel.classList.contains('compact-radio'))) {
    return;
  }

  const app = document.querySelector('.app');
  // Don't auto-rehide if user manually exited by pausing, but we handle that via paused state below.
  const state = typeof sparkyYtState.playerInstance.getPlayerState === 'function' ?
    sparkyYtState.playerInstance.getPlayerState() : -1;

  if (state === YT.PlayerState.PLAYING) {
    cinemaModeTimer = setTimeout(() => {
      lastCinemaTriggerTime = Date.now();
      app.classList.add('immersive-cinema-mode');
      document.querySelector('.now-playing')?.classList.remove('compact-video');
      if (document.getElementById('cinemaWakeZone')) document.getElementById('cinemaWakeZone').classList.add('is-cinema');
      document.getElementById('btnYtCinemaToggle')?.classList.add('active');
    }, CINEMA_TIMEOUT_MS);
  }
}

function toggleCinemaMode() {
  const app = document.querySelector('.app');
  if (app.classList.contains('immersive-cinema-mode')) {
    wakeFromCinemaMode();
  } else {
    lastCinemaTriggerTime = Date.now();
    app.classList.add('immersive-cinema-mode');
    document.querySelector('.now-playing')?.classList.remove('compact-video');
    if (document.getElementById('cinemaWakeZone')) document.getElementById('cinemaWakeZone').classList.add('is-cinema');
    document.getElementById('btnYtCinemaToggle')?.classList.add('active');
    clearTimeout(cinemaModeTimer); // Disable auto-timer when manually forcing it
  }
}

// â”€â”€ Wake Button Isolated Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const wakeZone = document.getElementById('cinemaWakeZone');
if (wakeZone) {
  ['click', 'touchstart'].forEach(evt => {
    wakeZone.addEventListener(evt, (e) => {
      // Prevent bleed to elements behind the wake button
      e.preventDefault();
      e.stopPropagation();
      wakeFromCinemaMode();
    }, { passive: false });
  });
}

// â”€â”€ General Idle Detection (Reset Timer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
['click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    // If the wake button handled it above, this won't trigger for the button
    if (e.target.closest('#btnYtCinemaToggle') || e.target.closest('.youtube-iframe-container')) return;
    const app = document.querySelector('.app');

    // Only wake up if the user explicitly clicked the background UI (like the footer)
    if (app.classList.contains('immersive-cinema-mode') && !e.target.closest('#sparky-yt-player-wrap')) {
      wakeFromCinemaMode();
    } else {
      resetCinemaTimer();
    }
  }, { passive: true });
});

// â”€â”€ Infinite Scroll Listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ytResultsEl = document.getElementById('ytResults');
if (ytResultsEl) {
  ytResultsEl.addEventListener('scroll', () => {
    if (!sparkyYtState.isModeActive || sparkyYtState.currentSubMode === 'hub') return;

    const cache = (sparkyYtState.currentSubMode === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;
    if (!cache.hasMore || cache.isFetchingMore) return;

    // Trigger when 150px from bottom
    const threshold = 150;
    if (ytResultsEl.scrollTop + ytResultsEl.clientHeight >= ytResultsEl.scrollHeight - threshold) {
      console.log(`[YT] Infinite scroll trigger: fetching next page for ${sparkyYtState.currentSubMode}`);
      fetchNextYtPage(true);
    }
  }, { passive: true });
}

['scroll', 'mousemove', 'touchmove', 'keydown'].forEach(evt => {
  // Use capturing for scroll because element scrolls do not bubble
  document.addEventListener(evt, () => {
    const app = document.querySelector('.app');
    if (!app.classList.contains('immersive-cinema-mode')) {
      resetCinemaTimer(); // Only reset the timer if not already in cinema mode. Do not wake on scroll/mouse to prevent reflow bugs.
    }
  }, { passive: true, capture: evt === 'scroll' });
});

function initYtStorage() {
  if (!localStorage.getItem(YT_FAVS_KEY)) localStorage.setItem(YT_FAVS_KEY, JSON.stringify([]));
  if (!localStorage.getItem(YT_HISTORY_KEY)) localStorage.setItem(YT_HISTORY_KEY, JSON.stringify([]));
  if (!localStorage.getItem(YT_TEMP_QUEUE_KEY)) localStorage.setItem(YT_TEMP_QUEUE_KEY, JSON.stringify([]));

  // Load initial temp queue into state
  sparkyYtState.temporaryQueue = loadYtTempQueue();
}

function loadYtFavs() { try { return JSON.parse(localStorage.getItem(YT_FAVS_KEY)) || []; } catch { return []; } }
function loadYtHistory() { try { return JSON.parse(localStorage.getItem(YT_HISTORY_KEY)) || []; } catch { return []; } }
function loadYtTempQueue() { try { return JSON.parse(localStorage.getItem(YT_TEMP_QUEUE_KEY)) || []; } catch { return []; } }
function saveYtFavs(arr) { localStorage.setItem(YT_FAVS_KEY, JSON.stringify(arr)); }
function saveYtTempQueue(arr) { localStorage.setItem(YT_TEMP_QUEUE_KEY, JSON.stringify(arr)); }

// â”€â”€ Core Mode Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function toggleYtMode(activate) {
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) npPanel.classList.remove('compact', 'compact-radio', 'compact-video');
  // sparkyLog(`Action: toggleYtMode(${activate})`);
  // debugLayout('BEFORE-TOGGLE');
  sparkyYtState.isModeActive = activate;

  const logoText = document.getElementById('mainLogoText');
  if (logoText) {
    logoText.textContent = activate ? 'Video' : 'Radio';
  }

  const radioView = document.getElementById('radio-view');
  const ytView = document.getElementById('yt-view');
  const ytPlayer = document.getElementById('sparky-yt-player-wrap');
  const npBody = document.getElementById('npJumpArea');
  const npMeta = document.getElementById('npMeta');
  const npHeader = document.querySelector('.np-header');  // folder icon + EQ btn row
  const eqBtn = document.getElementById('btnEq');
  const eqRack = document.getElementById('eqRack');

  if (radioView) radioView.classList.toggle('hidden', activate);
  if (ytView) ytView.classList.toggle('hidden', !activate);
  if (npBody) npBody.classList.toggle('hidden', activate);
  if (npMeta) npMeta.classList.toggle('hidden', activate);
  if (npHeader) npHeader.classList.toggle('hidden', activate);
  if (ytPlayer) ytPlayer.classList.toggle('hidden', !activate);

  if (eqBtn) eqBtn.style.display = activate ? 'none' : '';
  if (eqRack) eqRack.style.display = activate ? 'none' : '';

  // Footer icon swap
  const icon = document.getElementById('modeToggleIcon');
  const btn = document.getElementById('btnModeToggle');
  if (icon) icon.textContent = activate ? 'smart_display' : 'radio';
  if (btn) {
    btn.title = activate ? 'Switch to Radio Mode' : 'Switch to Video Mode';
    btn.classList.toggle('yt-mode-active', activate);
  }

  // Pause radio when entering YT mode
  if (activate) {
    const audio = document.getElementById('audioEl');
    if (audio && !audio.paused) {
      audio.pause();
      isPlaying = false; // Reset global playing state so UI updates
      syncPlayBtns();
    }
  }

  // Pause YT when returning to radio
  if (!activate) {
    if (sparkyYtState.playerInstance) {
      try { sparkyYtState.playerInstance.pauseVideo(); } catch (e) { /* player may not be ready */ }
    }
    if (sparkyYtState.activeAbortController) {
      sparkyYtState.activeAbortController.abort();
      sparkyYtState.activeAbortController = null;
    }
    if (sparkyYtState.activePrefetchAbortController) {
      sparkyYtState.activePrefetchAbortController.abort();
      sparkyYtState.activePrefetchAbortController = null;
    }
  }

  localStorage.setItem('sparky_yt_mode_active', activate ? '1' : '0');
  // sparkyLog(`[YT] Mode â†’ ${activate ? 'VIDEO' : 'RADIO'}`);
  // setTimeout(() => debugLayout('AFTER-TOGGLE'), 100);
}

// â”€â”€ Sub-mode Tab Switching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function switchYtTab(mode) {
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) npPanel.classList.remove('compact');
  wakeFromCinemaMode(); // Wake up when switching tabs

  // Abort in-flight page fetches/prefetches on tab switches
  if (sparkyYtState.activeAbortController) {
    sparkyYtState.activeAbortController.abort();
    sparkyYtState.activeAbortController = null;
  }
  if (sparkyYtState.activePrefetchAbortController) {
    sparkyYtState.activePrefetchAbortController.abort();
    sparkyYtState.activePrefetchAbortController = null;
  }

  sparkyYtState.currentSubMode = mode;
  document.querySelectorAll('.yt-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

  const searchWrap = document.getElementById('ytSearchWrap');
  const results = document.getElementById('ytResults');
  const hub = document.getElementById('ytHub');

  const isHub = mode === 'hub';

  if (searchWrap) searchWrap.classList.toggle('hidden', isHub);
  if (results) results.classList.toggle('hidden', isHub);
  if (hub) hub.classList.toggle('hidden', !isHub);

  const input = document.getElementById('ytSearchInput');

  if (isHub) {
    renderYtHub();
    if (sparkyYtState.currentItemId) highlightYtCard(sparkyYtState.currentItemId);
  } else {
    const cache = (mode === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;

    // 1. If we ALREADY have results for this tab, just show them (instant restore)
    if (cache.results && cache.results.length > 0) {
      if (input) input.value = cache.query;
      if (mode === 'playlists') renderYtPlaylistResults(cache.results);
      else renderYtVideoResults(cache.results);
      // Re-apply active highlight â€” render wipes innerHTML so .active class is lost
      if (sparkyYtState.currentItemId) highlightYtCard(sparkyYtState.currentItemId);
    }
    // 2. If no results BUT there is a search term in the input, auto-search
    else if (input && input.value.trim()) {
      clearYtResults();
      runYtSearch();
    }
    // 3. Otherwise clear
    else {
      clearYtResults();
    }
  }
}

function clearYtResults() {
  const mode = sparkyYtState.currentSubMode;
  if (mode === 'videos') sparkyYtState.videoCache = { query: '', results: [] };
  if (mode === 'playlists') sparkyYtState.playlistCache = { query: '', results: [] };

  const el = document.getElementById('ytResults');
  if (!el) return;
  
  const isHidden = sparkyYtState.dropdownOpen ? ' hidden' : '';
  el.innerHTML = `<div class="pl-empty${isHidden}">
    <div class="pl-empty-icon">&#9654;&#65039;</div>
    <div>Search for ${mode === 'playlists' ? 'playlists' : 'videos'} above</div>
  </div>`;
}

function renderYtHub() {
  const hub = document.getElementById('ytHub');
  if (!hub) return;
  const favs = loadYtFavs();
  if (!favs.length) {
    hub.innerHTML = `<div class="pl-empty">
      <div class="pl-empty-icon">&#128420;</div>
      <div>No saved videos yet &mdash; heart a video to save it here in your Favs Hub</div>
    </div>`;
    return;
  }
  hub.innerHTML = favs.map(item => {
    const isAct = sparkyYtState.currentItemId === item.id || (sparkyYtState.activePlaylistId && item.id === sparkyYtState.activePlaylistId);
    const ambientStyle = isAct && item.thumb ? ` style="--ambient-bg: url('${esc(item.thumb)}');"` : '';
    const ambientClass = isAct && item.thumb ? ' has-ambient-bg' : '';

    return `
    <div class="yt-card${isAct ? ' active' : ''}${ambientClass}" data-id="${item.id}" data-type="${item.type}" data-title="${item.title.replace(/"/g, '&quot;')}" data-channel="${(item.channel || '').replace(/"/g, '&quot;')}" data-thumb="${item.thumb}" data-duration="${item.duration || ''}" data-views="${item.views || ''}" data-published="${item.published || ''}" data-video-count="${item.video_count || ''}"${ambientStyle}>
      <img class="yt-card-thumb" src="${item.thumb}" alt="" loading="lazy">
      <div class="yt-card-info">
        <div class="yt-card-title">${item.title}</div>
        <div class="yt-card-channel">
          ${item.type === 'playlist' ? 
            `Playlist${item.video_count ? ' &middot; ' + item.video_count : ''}` :
            `<span class="desktop-only">${item.views || ''}${item.published ? (item.views ? ' &middot; ' : '') + item.published : ''}${item.duration ? (item.views || item.published ? ' &middot; ' : '') + item.duration : ''}${item.channel ? (item.views || item.published || item.duration ? ' &middot; ' : '') + item.channel : ''}</span>
             <span class="mobile-stats">${item.views || ''}${item.published ? (item.views ? ' &middot; ' : '') + item.published : ''}${item.channel ? (item.views || item.published ? ' &middot; ' : '') + item.channel : ''}</span>`
          }
        </div>
      </div>
      <div class="yt-card-actions">
        <button class="yt-card-fav yt-card-delete active" data-id="${item.id}" title="Delete from Hub">
          <span class="material-symbols-outlined">delete</span>
        </button>
        <button class="yt-card-add yt-card-hub-queue${sparkyYtState.temporaryQueue.some(v => v.id === item.id) ? ' active' : ''}" data-id="${item.id}" title="${sparkyYtState.temporaryQueue.some(v => v.id === item.id) ? 'Remove from Queue' : 'Add to Queue'}">
          <span class="material-symbols-outlined">${sparkyYtState.temporaryQueue.some(v => v.id === item.id) ? 'remove_from_queue' : 'add_to_queue'}</span>
        </button>
      </div>
    </div>
  `;}).join('');

  // Standard listeners (play, fav, add) handle the Hub interactions via delegation in attachYtCardListeners
  attachYtCardListeners(hub);
}



function isYtFav(id) { return loadYtFavs().some(f => f.id === id); }
function addYtFav(item) {
  const f = loadYtFavs();
  const idx = f.findIndex(x => x.id === item.id);
  if (idx !== -1) {
    f[idx] = { ...f[idx], ...item }; // Refresh metadata
  } else {
    f.push({ ...item, addedAt: Date.now() });
  }
  saveYtFavs(f);
}
function removeYtFav(id) { saveYtFavs(loadYtFavs().filter(f => f.id !== id)); }

// â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
initYtStorage();
syncYtQueueBtn();
syncYtQueueBadge();

document.getElementById('btnModeToggle')?.addEventListener('click', () => {
  toggleYtMode(!sparkyYtState.isModeActive);
});

['ytTabVideos', 'ytTabPlaylists', 'ytTabHub'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    switchYtTab(e.currentTarget.dataset.mode);
  });
});

// Restore last mode on reload
if (localStorage.getItem('sparky_yt_mode_active') === '1') {
  toggleYtMode(true);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•‘  SPARKY YT MODULE â€” Phase 3: Search, Player & Audio Overlap â•‘
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Use relative paths for API calls to support Vite proxy in dev and Vercel in production
const YT_API_BASE = '';

let ytIframeApiLoading = false;
let ytIframeApiReady = false;
let pendingPlayItem = null;

// â”€â”€ Recent Searches Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RECENT_SEARCHES_KEY = 'sparky_yt_recent_searches';

/* V-U7: Get recents filtered by mode */
function getRecentsByMode(mode) {
  const allRecents = loadYtRecentSearches();
  // For now, return all recents for both modes
  // Future: can add metadata to track video vs playlist searches
  return allRecents;
}

/* V-U7: Dropdown state management */
function openYtSearchDropdown() {
  const dropdown = document.getElementById('ytSearchDropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) return; // Already open
  dropdown?.classList.remove('hidden');
  sparkyYtState.dropdownOpen = true;

  const plEmpty = document.querySelector('#ytResults .pl-empty');
  if (plEmpty) plEmpty.classList.add('hidden');
}

function closeYtSearchDropdown() {
  const dropdown = document.getElementById('ytSearchDropdown');
  if (dropdown && dropdown.classList.contains('hidden')) return; // Already closed
  dropdown?.classList.add('hidden');
  sparkyYtState.dropdownOpen = false;

  const query = document.getElementById('ytSearchInput')?.value?.trim() || '';
  if (query === '') {
    const plEmpty = document.querySelector('#ytResults .pl-empty');
    if (plEmpty) plEmpty.classList.remove('hidden');
  }
}

function loadYtRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveYtRecentSearch(query) {
  if (!query) return;
  let searches = loadYtRecentSearches();
  // Remove if exists (to move to front)
  searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase());
  searches.unshift(query);
  searches = searches.slice(0, 3);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
}

function removeYtRecentSearch(query) {
  let searches = loadYtRecentSearches();
  searches = searches.filter(s => s !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  renderDropdownRecents();
}

function renderYtRecentSearches() {
  const container = document.getElementById('ytRecentSearches');
  if (!container) return;
  
  const searches = loadYtRecentSearches();
  if (!searches.length) {
    container.classList.add('hidden');
    return;
  }
  
  container.innerHTML = searches.map(s => `
    <div class="yt-recent-item" data-query="${s.replace(/"/g, '&quot;')}">
      <span class="yt-recent-text">${s}</span>
      <span class="yt-recent-remove" title="Remove">&times;</span>
    </div>
  `).join('');
  
  container.querySelectorAll('.yt-recent-item').forEach(item => {
    // Click on text to search
    const textEl = item.querySelector('.yt-recent-text');
    textEl.onclick = (e) => {
      e.stopPropagation();
      const input = document.getElementById('ytSearchInput');
      if (input) {
        input.value = item.dataset.query;
        toggleYtSearchClear(); // Show the 'X' button
        runYtSearch();
        container.classList.add('hidden');
      }
    };
    
    // Click on X to remove
    const removeBtn = item.querySelector('.yt-recent-remove');
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeYtRecentSearch(item.dataset.query);
    };

    // Full item click fallback (excluding remove btn)
    item.onclick = (e) => {
      if (e.target.classList.contains('yt-recent-remove')) return;
      const input = document.getElementById('ytSearchInput');
      if (input) {
        input.value = item.dataset.query;
        toggleYtSearchClear(); // Show the 'X' button
        runYtSearch();
        container.classList.add('hidden');
      }
    };
  });
}

// â”€â”€ 3.1: Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function runYtSearch(skipRecent = false, queryToSave = null) {
  if (typeof skipRecent === 'object') skipRecent = false;

  let query = document.getElementById('ytSearchInput')?.value?.trim();
  if (!query) return;

  if (queryToSave && queryToSave.trim() !== '') {
    saveYtRecentSearch(queryToSave);
  } else if (!skipRecent) {
    saveYtRecentSearch(query);
  }

  const mode = sparkyYtState.currentSubMode; // 'videos' | 'playlists'

  // 1. URL PARSER: Extract ID if user pastes a full link
  if (query.includes('youtube.com') || query.includes('youtu.be')) {
    if (mode === 'playlists') {
      const plMatch = query.match(/[?&]list=([^#\&\?]+)/);
      if (plMatch) query = plMatch[1];
    } else {
      const vMatch = query.match(/(?:v=|youtu\.be\/|embed\/|v\/|shorts\/)([^#\&\?\n ]{11})/);
      if (vMatch) query = vMatch[1];
    }
    // Update input field to show the extracted ID (visual confirmation)
    const input = document.getElementById('ytSearchInput');
    if (input) input.value = query;
  }

  const resultsEl = document.getElementById('ytResults');
  if (!resultsEl) return;

  resultsEl.classList.add('yt-searching-deep');
  resultsEl.innerHTML = `<div id="ytDeepScanLoader" class="yt-loading"><div class="yt-spinner"></div>Searching for videos...</div>`;
  resultsEl.scrollTop = 0;

  // Reset Cache for NEW search
  const cache = (mode === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;
  cache.query = query;
  cache.results = [];
  cache.continuation = null;
  cache.hasMore = false;
  cache.isFetchingMore = false;
  cache.prefetchedPage = null;

  console.log(`[YT-SEARCH] Starting search for: "${query}" (Mode: ${mode})`);
  await fetchNextYtPage(false);

  // AUTO-DEEP-SEARCH: Fetch a second page immediately to ensure consistent sorting pools
  if (cache.hasMore && !cache.isFetchingMore) {
    console.log('[YT-SEARCH] Auto-Deep-Search: Fetching second page...');
    await fetchNextYtPage(true);
  }

  // Show results and scroll to top
  const deepLoader = document.getElementById('ytDeepScanLoader');
  if (deepLoader) deepLoader.remove();
  
  resultsEl.classList.remove('yt-searching-deep');
  
  // Final explicit render to ensure everything is visible
  if (mode === 'videos') renderYtVideoResults(cache.results, false);
  else renderYtPlaylistResults(cache.results, false);

  // AUTO-SORT: Apply current sort selection before revealing
  const activeSort = document.querySelector('#ytSortOptions .preset-opt.active');
  if (activeSort && activeSort.dataset.sort !== 'relevance') {
    console.log(`[YT-SEARCH] Auto-sorting results by: ${activeSort.dataset.sort}`);
    sortYtResultsLocal(activeSort.dataset.sort);
  }
  
  resultsEl.scrollTop = 0;
}




async function fetchNextYtPage(isAppending = true) {
  const modeAtStart = sparkyYtState.currentSubMode;
  const cache = (modeAtStart === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;

  if (cache.isFetchingMore) return;

  // PREFETCH OPTIMIZATION: If we already have the next page ready, use it immediately
  if (isAppending && cache.prefetchedPage) {
    console.log(`[YT] Using prefetched page for ${modeAtStart}`);
    processYtPage(cache.prefetchedPage, true, modeAtStart);
    cache.prefetchedPage = null;

    // Proactively prefetch the NEXT one
    if (cache.hasMore) prefetchNextYtPage(modeAtStart);
    return;
  }

  // Cancel any active searches/prefetches if this is a NEW search fetch
  if (!isAppending) {
    if (sparkyYtState.activeAbortController) {
      console.log('[YT] Aborting active search fetch for new search...');
      sparkyYtState.activeAbortController.abort();
      sparkyYtState.activeAbortController = null;
    }
    if (sparkyYtState.activePrefetchAbortController) {
      console.log('[YT] Aborting active prefetch fetch for new search...');
      sparkyYtState.activePrefetchAbortController.abort();
      sparkyYtState.activePrefetchAbortController = null;
    }
  }

  cache.isFetchingMore = true;

  // Show "Loading more" footer if appending
  if (isAppending) {
    const resultsEl = document.getElementById('ytResults');
    if (resultsEl && !document.getElementById('ytLoadMoreIndicator')) {
      const loader = document.createElement('div');
      loader.id = 'ytLoadMoreIndicator';
      loader.className = 'yt-loading';
      loader.style.padding = '20px';
      loader.innerHTML = `<div class="yt-spinner"></div>Loading more...`;
      resultsEl.appendChild(loader);
      // Smooth scroll to show loader
      resultsEl.scrollTo({ top: resultsEl.scrollHeight, behavior: 'smooth' });
    }
  }

  const controller = new AbortController();
  sparkyYtState.activeAbortController = controller;

  try {
    let url = '';
    if (cache.continuation) {
      const api = (modeAtStart === 'playlists') ? 'fetchPlaylist' : 'searchVideos';
      url = `${YT_API_BASE}/api/${api}?continuation=${encodeURIComponent(cache.continuation)}`;
    } else {
      if (modeAtStart === 'videos') {
        url = `${YT_API_BASE}/api/searchVideos?query=${encodeURIComponent(cache.query)}`;
      } else {
        const isId = /^(PL|RD|LL|LM|UU|FL|OL)[a-zA-Z0-9_-]+/.test(cache.query);
        const param = isId ? 'id' : 'query';
        url = `${YT_API_BASE}/api/fetchPlaylist?${param}=${encodeURIComponent(cache.query)}`;
      }
    }

    console.log(`[YT-FETCH] Fetching URL: ${url.length > 150 ? url.substring(0, 150) + '...' : url}`);
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    console.log(`[YT-FETCH] Response received: ${res.status} ${res.statusText}`);

    if (sparkyYtState.activeAbortController !== controller) {
      console.log('[YT-FETCH] Stale fetch ignored.');
      return;
    }

    if (!res.ok) {
      let errData = {};
      try { errData = await res.json(); } catch (e) { console.warn('[YT-FETCH] Could not parse error JSON'); }
      console.error('[YT-FETCH] Server error detail:', errData);
      throw new Error(`HTTP ${res.status}: ${errData.message || errData.error || 'Unknown Error'}`);
    }
    
    const data = await res.json();
    console.log(`[YT-FETCH] Data received. Results length: ${(data.video_results || data.playlist_results || []).length}`);
    
    processYtPage(data, isAppending);

    // Initial prefetch after first page loads
    if (!isAppending && cache.hasMore) {
      prefetchNextYtPage();
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[YT] Fetch aborted.');
      return;
    }
    console.error('[YT] Fetch error:', err);
    if (!isAppending) {
      showYtError('Search failed. Check your connection and try again.');
    } else {
      const loader = document.getElementById('ytLoadMoreIndicator');
      if (loader) loader.innerHTML = `<div style="color:var(--accent2)">Retry failed — scroll to try again</div>`;
    }
  } finally {
    if (sparkyYtState.activeAbortController === controller) {
      sparkyYtState.activeAbortController = null;
    }
    cache.isFetchingMore = false;
  }
}



async function prefetchNextYtPage() {
  const mode = sparkyYtState.currentSubMode;
  const cache = (mode === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;

  if (!cache.continuation || cache.prefetchedPage || cache.isFetchingMore) return;

  if (sparkyYtState.activePrefetchAbortController) {
    sparkyYtState.activePrefetchAbortController.abort();
    sparkyYtState.activePrefetchAbortController = null;
  }

  const controller = new AbortController();
  sparkyYtState.activePrefetchAbortController = controller;

  console.log(`[YT] Prefetching next page for ${mode}...`);
  try {
    const api = (mode === 'playlists') ? 'fetchPlaylist' : 'searchVideos';
    const url = `${YT_API_BASE}/api/${api}?continuation=${encodeURIComponent(cache.continuation)}`;
    const res = await fetch(url, { signal: controller.signal });
    
    if (sparkyYtState.activePrefetchAbortController !== controller) {
      console.log('[YT] Stale prefetch ignored.');
      return;
    }

    if (res.ok) {
      cache.prefetchedPage = await res.json();
      console.log(`[YT] Prefetch successful for ${mode}`);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('[YT] Prefetch aborted.');
      return;
    }
    console.warn('[YT] Prefetch failed:', e.message);
  } finally {
    if (sparkyYtState.activePrefetchAbortController === controller) {
      sparkyYtState.activePrefetchAbortController = null;
    }
  }
}

function processYtPage(data, isAppending) {
  const mode = sparkyYtState.currentSubMode;
  const cache = (mode === 'playlists') ? sparkyYtState.playlistCache : sparkyYtState.videoCache;

  const newResults = data.video_results || data.playlist_results || [];

  // Handle direct ID fetch which might return a single object (normalize it)
  let normalizedResults = newResults;
  if (!newResults.length && data.id && data.title && mode === 'playlists') {
    normalizedResults = [{
      id: data.id,
      playlist_id: data.id,
      title: data.title,
      thumbnail: data.thumb || (data.videos && data.videos[0]?.thumb),
      type: 'playlist'
    }];
  }

  if (isAppending) {
    cache.results = [...cache.results, ...normalizedResults];
    // Remove loader before appending new HTML
    const loader = document.getElementById('ytLoadMoreIndicator');
    if (loader) loader.remove();
  } else {
    cache.results = normalizedResults;
  }

  cache.continuation = data.continuation || null;
  cache.hasMore = !!cache.continuation;

  if (cache.results.length) {
    // Only render if we are still viewing the mode that requested this data
    if (mode === sparkyYtState.currentSubMode && !document.getElementById('ytDeepScanLoader')) {
      if (mode === 'videos') renderYtVideoResults(isAppending ? normalizedResults : cache.results, isAppending);
      else renderYtPlaylistResults(isAppending ? normalizedResults : cache.results, isAppending);
    }
    
    // Final check for end of results
    if (!cache.hasMore) {
      const el = document.getElementById('ytResults');
      if (el) {
        const endMsg = document.createElement('div');
        endMsg.className = 'yt-end-results';
        endMsg.innerHTML = '— End of results —';
        el.appendChild(endMsg);
      }
    }
  } else if (!isAppending) {
    showYtError('No results found — try a different search.');
  }
}

function showYtError(msg) {
  const el = document.getElementById('ytResults');
  if (el) el.innerHTML = `<div class="pl-empty"><div class="pl-empty-icon">&#9888;&#65039;</div><div>${msg}</div></div>`;
}

function renderYtVideoResults(videos, isAppending = false) {
  const el = document.getElementById('ytResults');
  if (!el || !videos.length) {
    if (!isAppending) showYtError('No videos found.');
    return;
  }

  const html = videos.map(v => {
    const isAct = sparkyYtState.currentItemId === v.id;
    const ambientStyle = isAct && v.thumbnail ? ` style="--ambient-bg: url('${esc(v.thumbnail)}');"` : '';
    const ambientClass = isAct && v.thumbnail ? ' has-ambient-bg' : '';

    return `
    <div class="yt-card${isAct ? ' active' : ''}${ambientClass}" data-id="${v.id}" data-type="video" data-title="${v.title.replace(/"/g, '&quot;')}" data-channel="${(v.channel || '').replace(/"/g, '&quot;')}" data-thumb="${v.thumbnail}" data-duration="${v.duration || ''}" data-views="${v.views || ''}" data-published="${v.published || ''}"${ambientStyle}>
      <img class="yt-card-thumb" src="${v.thumbnail}" alt="" loading="lazy">
      <div class="yt-card-info">
        <div class="yt-card-title">${v.title}</div>
        <div class="yt-card-channel">
            <span class="desktop-only">${v.views || ''}${v.published ? (v.views ? ' &middot; ' : '') + v.published : ''}${v.duration ? (v.views || v.published ? ' &middot; ' : '') + v.duration : ''}${v.channel ? (v.views || v.published || v.duration ? ' &middot; ' : '') + v.channel : ''}</span>
            <span class="mobile-stats">${v.views || ''}${v.published ? (v.views ? ' &middot; ' : '') + v.published : ''}${v.channel ? (v.views || v.published ? ' &middot; ' : '') + v.channel : ''}</span>
        </div>
      </div>
      <div class="yt-card-actions">
        <button class="yt-card-fav${isYtFav(v.id) ? ' active' : ''}" data-id="${v.id}" data-type="video" title="${isYtFav(v.id) ? 'Remove from Favs Hub' : 'Save to Favs Hub'}">
          <span class="material-symbols-outlined">favorite</span>
        </button>
        <button class="yt-card-add${sparkyYtState.temporaryQueue.some(q => q.id === v.id) ? ' active' : ''}" data-id="${v.id}" title="${sparkyYtState.temporaryQueue.some(q => q.id === v.id) ? 'Remove from Queue' : 'Add to Temporary Queue'}">
          <span class="material-symbols-outlined">${sparkyYtState.temporaryQueue.some(q => q.id === v.id) ? 'remove_from_queue' : 'add_to_queue'}</span>
        </button>
      </div>
    </div>
  `;}).join('');

  if (isAppending) {
    el.insertAdjacentHTML('beforeend', html);
  } else {
    el.innerHTML = html;
  }

  attachYtCardListeners(el);
  if (sparkyYtState.currentItemId) highlightYtCard(sparkyYtState.currentItemId);
}

function renderYtPlaylistResults(playlists, isAppending = false) {
  const el = document.getElementById('ytResults');
  if (!el || !playlists.length) {
    if (!isAppending) showYtError('No playlists found.');
    return;
  }

  const html = playlists.map(p => {
    const isAct = sparkyYtState.currentItemId === p.playlist_id;
    const ambientStyle = isAct && p.thumbnail ? ` style="--ambient-bg: url('${esc(p.thumbnail)}');"` : '';
    const ambientClass = isAct && p.thumbnail ? ' has-ambient-bg' : '';

    return `
    <div class="yt-card${isAct ? ' active' : ''}${ambientClass}" data-id="${p.playlist_id}" data-type="playlist" data-title="${p.title.replace(/"/g, '&quot;')}" data-channel="Playlist" data-thumb="${p.thumbnail}" data-video-count="${p.video_count || ''}"${ambientStyle}>
      <img class="yt-card-thumb" src="${p.thumbnail}" alt="" loading="lazy">
      <div class="yt-card-info">
        <div class="yt-card-title">${p.title}</div>
        <div class="yt-card-channel">Playlist${p.video_count ? ' &middot; ' + p.video_count : ''}</div>
      </div>
      <div class="yt-card-actions">
        <button class="yt-card-fav${isYtFav(p.playlist_id) ? ' active' : ''}" data-id="${p.playlist_id}" data-type="playlist" title="${isYtFav(p.playlist_id) ? 'Remove from Favs Hub' : 'Save to Favs Hub'}">
          <span class="material-symbols-outlined">favorite</span>
        </button>
        <button class="yt-card-add${sparkyYtState.temporaryQueue.some(q => q.id === p.playlist_id) ? ' active' : ''}" data-id="${p.playlist_id}" title="${sparkyYtState.temporaryQueue.some(q => q.id === p.playlist_id) ? 'Remove from Queue' : 'Add Playlist to Queue'}">
          <span class="material-symbols-outlined">${sparkyYtState.temporaryQueue.some(q => q.id === p.playlist_id) ? 'remove_from_queue' : 'add_to_queue'}</span>
        </button>
      </div>
    </div>
  `;}).join('');

  if (isAppending) {
    el.insertAdjacentHTML('beforeend', html);
  } else {
    el.innerHTML = html;
  }

  attachYtCardListeners(el);
  if (sparkyYtState.currentItemId) highlightYtCard(sparkyYtState.currentItemId);
}

async function hydrateYtQueueTags() {
  const queue = sparkyYtState.currentQueue;
  if (!queue || !queue.length) return;

  const toHydrate = queue.filter(item => !item.views || !item.published);
  if (!toHydrate.length) return;

  const CHUNK_SIZE = 15;
  console.log(`[YT] Batch hydrating ${toHydrate.length} items in chunks of ${CHUNK_SIZE}...`);

  for (let i = 0; i < toHydrate.length; i += CHUNK_SIZE) {
    const chunk = toHydrate.slice(i, i + CHUNK_SIZE);
    const ids = chunk.map(item => item.id).join(',');

    try {
      const res = await fetch(`${YT_API_BASE}/api/hydrateTags?ids=${encodeURIComponent(ids)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          data.results.forEach(result => {
            const item = queue.find(q => q.id === result.id);
            if (item) {
              if (result.views)     item.views     = result.views;
              if (result.published) item.published = result.published;
            }
          });
          renderYtQueue();
        }
      }
    } catch (e) {
      console.warn('[YT] Batch chunk hydration failed:', e.message);
    }
  }
}


function attachYtCardListeners(container) {
  const newCards = Array.from(container.querySelectorAll('.yt-card:not([data-bound])'));

  newCards.forEach((card) => {
    card.setAttribute('data-bound', 'true');

    // Card body click â†’ play
    card.addEventListener('click', async e => {
      if (e.target.closest('.yt-card-fav') || e.target.closest('.yt-card-add')) return;

      // Resolve full queue from container at click-time to support pagination
      const allCards = Array.from(container.querySelectorAll('.yt-card'));
      const queue = allCards.map(c => ({
        id: c.dataset.id,
        type: c.dataset.type,
        title: c.dataset.title,
        channel: c.dataset.channel,
        thumb: c.dataset.thumb,
        duration: c.dataset.duration || '',
        views: c.dataset.views || '',
        published: c.dataset.published || '',
        video_count: c.dataset.videoCount || ''
      }));
      const index = allCards.indexOf(card);
      const item = queue[index];

      if (item.type === 'playlist') {
        if (sparkyYtState.activePlaylistId === item.id) {
          if (sparkyYtState.playerInstance) {
            const state = sparkyYtState.playerInstance.getPlayerState();
            if (state !== YT.PlayerState.PLAYING) sparkyYtState.playerInstance.playVideo();
          }
          if (container) {
            const containerTop = container.getBoundingClientRect().top;
            const cardTop = card.getBoundingClientRect().top;
            const cardBottom = card.getBoundingClientRect().bottom;
            const containerBottom = container.getBoundingClientRect().bottom;
            
            // Only scroll if card is actually off-screen (with 20px buffer)
            const isOffScreen = (cardTop < containerTop - 20) || (cardBottom > containerBottom + 20);
            if (isOffScreen) {
              card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
          return;
        }

        sparkyYtState.activePlaylistId = item.id;
        const titleEl = document.getElementById('ytNpTitle');
        if (titleEl) titleEl.textContent = 'Loading Playlist...';

        try {
          const res = await fetch(`${YT_API_BASE}/api/fetchPlaylist?id=${item.id}`);
          const data = await res.json();
          const playlistVideos = data.videos || data.video_results || []; // Safety for both schemas
          if (playlistVideos.length > 0) {
            sparkyYtState.currentQueue = playlistVideos.map(v => ({
              id: v.id,
              type: 'video',
              title: v.title,
              channel: v.channel || v.author || data.title || item.title || 'Unknown',
              thumb: v.thumbnail || v.thumb || v.thumbnail_url || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
              duration: v.duration || '',
              views: v.views || '',
              published: v.published || ''
            }));
            sparkyYtState.originalQueue = [...sparkyYtState.currentQueue];
            sparkyYtState.isShuffleActive = false;

            const btnShuffle = document.getElementById('btnYtShuffle');
            if (btnShuffle) btnShuffle.classList.remove('active');
            const btnQueue = document.getElementById('btnYtQueue');
            if (btnQueue) btnQueue.classList.remove('hidden');

            console.log(`[YT-DEBUG] Playlist Queued: ${sparkyYtState.currentQueue.length} videos. Hydrating...`);
            renderYtQueue();
            hydrateYtQueueTags(sparkyYtState.currentQueue);
            
            playYtItem(sparkyYtState.currentQueue[0]);
          } else {
            if (titleEl) titleEl.textContent = 'Playlist Empty/Error';
          }
        } catch (err) {
          console.error('[YT] Failed to fetch playlist:', err);
          if (titleEl) titleEl.textContent = 'Network Error';
        }
      } else {
        if (sparkyYtState.currentItemId === item.id) {
          if (sparkyYtState.playerInstance) {
            const state = sparkyYtState.playerInstance.getPlayerState();
            if (state !== YT.PlayerState.PLAYING) sparkyYtState.playerInstance.playVideo();
          }
          return;
        }

        sparkyYtState.activePlaylistId = null;
        const btnQueue = document.getElementById('btnYtQueue');
        if (btnQueue) btnQueue.classList.add('hidden');

        sparkyYtState.currentQueue = queue;
        sparkyYtState.originalQueue = [...queue];
        sparkyYtState.queueIndex = index;
        sparkyYtState.isShuffleActive = false;

        const btnShuffle = document.getElementById('btnYtShuffle');
        if (btnShuffle) btnShuffle.classList.remove('active');

        playYtItem(item);
      }
    });

    // Fav button toggle
    const favBtn = card.querySelector('.yt-card-fav');
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.stopPropagation();
        const item = {
          id: favBtn.dataset.id,
          type: favBtn.dataset.type,
          title: card.dataset.title,
          thumb: card.dataset.thumb,
          channel: card.dataset.channel,
          duration: card.dataset.duration || '',
          views: card.dataset.views || '',
          published: card.dataset.published || '',
          video_count: card.dataset.videoCount || ''
        };

        if (favBtn.classList.contains('yt-card-delete')) {
          sparkyConfirm(`Are you sure you want to remove [${item.title}] from Favorites?`, () => {
            removeYtFav(item.id);
            if (sparkyYtState.currentSubMode === 'hub') renderYtHub();
          }, "DELETE FROM FAVS HUB");
          return;
        }

        if (isYtFav(item.id)) {
          removeYtFav(item.id);
          favBtn.classList.remove('active');
          favBtn.title = 'Save to Favs Hub';
        } else {
          addYtFav(item);
          favBtn.classList.add('active');
          favBtn.title = 'Remove from Favs Hub';
        }
      });
    }

    // Add to Temp Queue
    const addBtn = card.querySelector('.yt-card-add');
    if (addBtn) {
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        const id = addBtn.dataset.id;
        const item = {
          id: id,
          type: card.dataset.type || 'video',
          title: card.dataset.title,
          thumb: card.dataset.thumb,
          channel: card.dataset.channel,
          duration: card.dataset.duration || '',
          views: card.dataset.views || '',
          published: card.dataset.published || '',
          video_count: card.dataset.videoCount || ''
        };

        if (sparkyYtState.temporaryQueue.some(v => v.id === id)) {
          removeFromYtTempQueue(id, true);
        } else {
          addToYtTempQueue(item, addBtn);
        }
      });
    }
  });
}

function addToYtTempQueue(item, sourceBtn = null) {
  sparkyLog(`[YT] Request to add: ${item.title} (ID: ${item.id})`);

  if (!sparkyYtState.temporaryQueue) sparkyYtState.temporaryQueue = [];

  if (sparkyYtState.temporaryQueue.some(v => v.id === item.id)) {
    return;
  }

  sparkyYtState.temporaryQueue.push(item);
  saveYtTempQueue(sparkyYtState.temporaryQueue);

  // Instant Sync: If we are currently viewing/playing the 'temp' queue, update it immediately
  if (sparkyYtState.activePlaylistId === 'temp') {
    sparkyYtState.currentQueue = [...sparkyYtState.temporaryQueue];
    sparkyYtState.originalQueue = [...sparkyYtState.temporaryQueue];
    renderYtQueue();
  }

  syncYtQueueBtn();
  syncYtQueueBadge();

  // Update icon state globally if button provided
  if (sourceBtn) {
    sourceBtn.classList.add('active');
    const icon = sourceBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'remove_from_queue';
  }
}

function removeFromYtTempQueue(id, silent = false) {
  const doRemove = () => {
    sparkyYtState.temporaryQueue = sparkyYtState.temporaryQueue.filter(v => v.id !== id);
    saveYtTempQueue(sparkyYtState.temporaryQueue);

    // Sync with playback state: Always remove from current/original queue if present
    sparkyYtState.currentQueue = sparkyYtState.currentQueue.filter(v => v.id !== id);
    sparkyYtState.originalQueue = sparkyYtState.originalQueue.filter(v => v.id !== id);
    
    renderYtQueue();

    syncYtQueueBtn();
    syncYtQueueBadge();

    if (sparkyYtState.currentSubMode === 'hub') renderYtHub();

    // Update any visible toggle buttons in the main view
    document.querySelectorAll(`.yt-card-add[data-id="${id}"]`).forEach(btn => {
      btn.classList.remove('active');
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'add_to_queue';
    });

    sparkyLog(`[YT] Removed ${id} from temp queue`);
  };

  if (silent) {
    doRemove();
  } else {
    sparkyConfirm("Remove this video from your session queue?", doRemove, "REMOVE FROM QUEUE");
  }
}

function clearYtTempQueue() {
  sparkyConfirm("Clear all items from your temporary queue?", () => {
    sparkyYtState.temporaryQueue = [];
    saveYtTempQueue([]);
    syncYtQueueBtn();
    syncYtQueueBadge();

    // Reset playback state: Clear everything
    sparkyYtState.currentQueue = [];
    sparkyYtState.originalQueue = [];
    sparkyYtState.activePlaylistId = null;
    sparkyYtState.queueIndex = 0;

    renderYtQueue();
    sparkyLog('[YT] Temporary queue cleared');
  }, "CLEAR QUEUE");
}

function syncYtQueueBtn() {
  const btn = document.getElementById('btnYtQueue');
  if (!btn) return;

  const hasTempItems = sparkyYtState.temporaryQueue.length > 0;
  const isPlayingPlaylist = sparkyYtState.activePlaylistId !== null;
  const hasQueue = hasTempItems || isPlayingPlaylist;

  btn.classList.toggle('hidden', !hasQueue);

  const isOverlayOpen = !document.getElementById('ytQueueOverlay').classList.contains('hidden');
  btn.classList.toggle('active', isOverlayOpen);

  // Pulse logic: if we have items in temp queue NOT played yet, pulse it (only in video tab context)
  if (hasTempItems) {
    const unplayed = sparkyYtState.temporaryQueue.some(v => !sparkyYtState.tempQueuePlayedIds.has(v.id));
    // Only pulse if we are in Video mode (isModeActive) but NOT looking at the overlay
    btn.classList.toggle('pulse', unplayed && sparkyYtState.isModeActive && !isOverlayOpen);
  } else {
    btn.classList.remove('pulse');
  }
}

function syncYtQueueBadge() {
  // Obsolete: Tab badge removed in favor of dynamic NP icon
  return;
}

function highlightYtCard(id, shouldScroll = false) {
  let activeCard = null;

  document.querySelectorAll('.yt-card').forEach(c => {
    // Highlight if it matches the current song ID OR if it's the active parent playlist
    const isAct = c.dataset.id === id || (sparkyYtState.activePlaylistId && c.dataset.id === sparkyYtState.activePlaylistId);
    c.classList.toggle('active', isAct);

    // V-U12: Ambient favicon glow for playing card
    if (isAct && c.dataset.thumb) {
      c.style.setProperty('--ambient-bg', `url("${esc(c.dataset.thumb)}")`);
      c.classList.add('has-ambient-bg');
    } else {
      c.style.removeProperty('--ambient-bg');
      c.classList.remove('has-ambient-bg');
    }

    if (isAct && c.dataset.id === id) activeCard = c;
  });

  if (activeCard && shouldScroll) {
    // Small delay to ensure any layout changes (like active class) have finished painting
    setTimeout(() => {
      // Find the specific container this card belongs to (Results, Hub, or Queue)
      const container = activeCard.closest('#ytResults, #ytHub, #ytQueueList');
      if (!container) return;

      const cRect = container.getBoundingClientRect();
      const aRect = activeCard.getBoundingClientRect();

      // Check if mostly visible in the container (with 10px buffer)
      const isVisible = (aRect.top >= cRect.top - 10) && (aRect.bottom <= cRect.bottom + 10);

      // Only scroll if NOT visible, preventing the 'jump' on direct click
      if (!isVisible) {
        // Prevent scrolling elements inside hidden views/overlays, which causes browser viewport shift regressions
        if (container.id === 'ytQueueList') {
          const overlay = document.getElementById('ytQueueOverlay');
          if (overlay && overlay.classList.contains('hidden')) return;
        }
        if (container.id === 'ytResults') {
          const results = document.getElementById('ytResults');
          if (results && results.classList.contains('hidden')) return;
        }
        if (container.id === 'ytHub') {
          const hub = document.getElementById('ytHub');
          if (hub && hub.classList.contains('hidden')) return;
        }

        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }
}

function toggleYtQueue() {
  resetCinemaTimer();
  const overlay = document.getElementById('ytQueueOverlay');
  if (!overlay) return;

  const isOpen = !overlay.classList.contains('hidden');
  if (isOpen) {
    overlay.classList.add('hidden');
    syncYtQueueBtn(); // Update pulse logic when closing
  } else {
    overlay.classList.remove('hidden');

    // Force sync if active mode is 'temp'
    if (sparkyYtState.activePlaylistId === 'temp' || (sparkyYtState.activePlaylistId === null && sparkyYtState.temporaryQueue.length > 0)) {
      sparkyYtState.activePlaylistId = 'temp';
      sparkyYtState.currentQueue = [...sparkyYtState.temporaryQueue];
      sparkyYtState.originalQueue = [...sparkyYtState.temporaryQueue];
    }

    renderYtQueue();
    syncYtQueueBtn(); // Update pulse logic when opening
  }
}

function closeYtQueue() {
  resetCinemaTimer();
  const overlay = document.getElementById('ytQueueOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    syncYtQueueBtn();
  }
}

function toggleYtRelated() {
  resetCinemaTimer();
  const overlay = document.getElementById('ytRelatedOverlay');
  if (!overlay) return;

  const isOpen = !overlay.classList.contains('hidden');
  if (isOpen) {
    overlay.classList.add('hidden');
  } else {
    overlay.classList.remove('hidden');
    fetchRelatedVideos();
  }
}

function closeYtRelated() {
  resetCinemaTimer();
  const overlay = document.getElementById('ytRelatedOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

async function fetchRelatedVideos() {
  const currentItem = sparkyYtState.currentQueue[sparkyYtState.queueIndex] 
    || sparkyYtState.temporaryQueue.find(v => v.id === sparkyYtState.currentItemId);
  
  if (!currentItem || !currentItem.id) {
    console.warn('[YT Related DEBUG] No current video in state. currentQueue:', sparkyYtState.currentQueue, 'queueIndex:', sparkyYtState.queueIndex, 'currentItemId:', sparkyYtState.currentItemId);
    return;
  }

  try {
    console.log(`[YT Related DEBUG] Fetching from API for: ${currentItem.id} ("${currentItem.title}")`);
    const res = await fetch(`/api/hydrateTags?id=${encodeURIComponent(currentItem.id)}`);
    console.log('[YT Related DEBUG] HTTP Response Status:', res.status, 'OK:', res.ok);
    
    if (!res.ok) throw new Error(`API fetch failed with status ${res.status}`);
    
    const data = await res.json();
    console.log('[YT Related DEBUG] JSON data received from API:', data);
    
    const related = data.related_videos || [];
    console.log('[YT Related DEBUG] Parsed related_videos from data:', related);
    
    sparkyYtState.relatedVideos = related.slice(0, 12); // Limit to 12
    console.log(`[YT Related DEBUG] State relatedVideos assigned. Length: ${sparkyYtState.relatedVideos.length}`, sparkyYtState.relatedVideos);
    
    renderYtRelated();
    syncYtRelatedBtn();
  } catch (err) {
    console.error('[YT Related DEBUG] Fetch error occurred:', err);
    const errEl = document.getElementById('ytRelatedList');
    if (errEl) errEl.innerHTML = `<div class="pl-empty">Failed to load related videos: ${err.message}</div>`;
  }
}

function renderYtRelated() {
  const container = document.getElementById('ytRelatedList');
  const countEl = document.getElementById('ytRelatedCount');
  console.log('[YT Related DEBUG] renderYtRelated triggered. Container exists:', !!container, 'Count element exists:', !!countEl);
  if (!container) return;

  let related = sparkyYtState.relatedVideos || [];
  console.log('[YT Related DEBUG] renderYtRelated array state:', related);
  
  if (!related.length) {
    console.warn('[YT Related DEBUG] No related videos in state. Rendering empty state.');
    container.innerHTML = '<div class="pl-empty">No related videos available</div>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  // Apply sorting
  if (sparkyYtState.relatedSortMode === 'views') {
    related = [...related].sort((a, b) => {
      const viewsA = parseYtViews(a.views);
      const viewsB = parseYtViews(b.views);
      return viewsB - viewsA;
    });
  }
  // Default relevance: use original order

  if (countEl) countEl.textContent = related.length;

  container.innerHTML = '';
  related.forEach((item) => {
    const isFav = isYtFav(item.id);
    const isInQueue = sparkyYtState.temporaryQueue.some(v => v.id === item.id);

    const el = document.createElement('div');
    el.className = 'yt-card yt-related-card';
    el.dataset.id = item.id;
    el.dataset.thumb = item.thumb || item.thumbnail;
    el.innerHTML = `
      <img src="${item.thumb || item.thumbnail}" class="yt-card-thumb" alt="" loading="lazy">
      <div class="yt-card-info">
        <div class="yt-card-title">${item.title}</div>
        <div class="yt-card-channel">
          <span class="desktop-only">${item.views || ''}${item.duration ? (item.views ? ' &middot; ' : '') + item.duration : ''}${item.channel ? (item.views || item.duration ? ' &middot; ' : '') + item.channel : ''}</span>
          <span class="mobile-stats">${item.views || ''}${item.channel ? (item.views ? ' &middot; ' : '') + item.channel : ''}</span>
        </div>
      </div>
      <div class="yt-card-actions">
        <button class="yt-card-fav${isFav ? ' active' : ''}" title="${isFav ? 'Remove from Hub' : 'Save to Hub'}">
          <span class="material-symbols-outlined">favorite</span>
        </button>
        <button class="yt-card-add${isInQueue ? ' active' : ''}" data-id="${item.id}" title="${isInQueue ? 'Remove from Queue' : 'Queue Video'}">
          <span class="material-symbols-outlined">${isInQueue ? 'remove_from_queue' : 'add_to_queue'}</span>
        </button>
      </div>
    `;

    // Play on body click
    el.onclick = (e) => {
      if (e.target.closest('.yt-card-fav') || e.target.closest('.yt-card-add')) return;

      const relatedQueue = related.map(v => ({
        id: v.id,
        type: 'video',
        title: v.title,
        channel: v.channel || '',
        thumb: v.thumb || v.thumbnail || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        duration: v.duration || '',
        views: v.views || '',
        published: v.published || ''
      }));

      const index = related.indexOf(item);

      sparkyYtState.activePlaylistId = null;
      const btnQueue = document.getElementById('btnYtQueue');
      if (btnQueue) btnQueue.classList.add('hidden');

      sparkyYtState.currentQueue = relatedQueue;
      sparkyYtState.originalQueue = [...relatedQueue];
      sparkyYtState.queueIndex = index;
      sparkyYtState.isShuffleActive = false;

      const btnShuffle = document.getElementById('btnYtShuffle');
      if (btnShuffle) btnShuffle.classList.remove('active');

      playYtItem(relatedQueue[index]);
      console.log(`[YT Related] Playing: ${item.title}`);
    };

    // Fav button
    const favBtn = el.querySelector('.yt-card-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleYtFav(item);
      };
    }

    // Queue button
    const queueBtn = el.querySelector('.yt-card-add');
    if (queueBtn) {
      queueBtn.onclick = (e) => {
        e.stopPropagation();
        if (sparkyYtState.temporaryQueue.some(v => v.id === item.id)) {
          removeFromYtTempQueue(item.id, true);
        } else {
          addToYtTempQueue(item, queueBtn);
        }
      };
    }

    container.appendChild(el);
  });
}

function syncYtRelatedBtn() {
  const btn = document.getElementById('btnYtRelated');
  if (!btn) return;

  // Show button only if we have a current video
  const hasCurrentVideo = sparkyYtState.currentQueue.length > 0 && sparkyYtState.queueIndex >= 0;
  btn.classList.toggle('hidden', !hasCurrentVideo);

  // Highlight if overlay is open
  const isOverlayOpen = !document.getElementById('ytRelatedOverlay').classList.contains('hidden');
  btn.classList.toggle('active', isOverlayOpen);

  // Style button with solid accent theme color if recommendations are loaded and overlay is closed
  const hasRelated = sparkyYtState.relatedVideos && sparkyYtState.relatedVideos.length > 0;
  btn.classList.toggle('available', hasRelated && !isOverlayOpen);
}

function syncAudioOnlyCard() {
  const placeholder = document.getElementById('yt-audio-only-placeholder');
  if (!placeholder || placeholder.classList.contains('hidden')) return;

  // Resolve the currently playing item from queue or temp queue
  const item = sparkyYtState.currentQueue[sparkyYtState.queueIndex]
    || sparkyYtState.temporaryQueue.find(v => v.id === sparkyYtState.currentItemId)
    || null;

  const thumbEl  = document.getElementById('audioModeThumb');
  const titleEl  = document.getElementById('audioModeTitle');
  const metaEl   = document.getElementById('audioModeMeta');
  if (!thumbEl || !titleEl || !metaEl) return;

  if (item) {
    const src = item.thumb || item.thumbnail || '';
    thumbEl.src = src;
    titleEl.textContent = item.title || '';
    const parts = [];
    if (item.channel)  parts.push(item.channel);
    if (item.duration) parts.push(item.duration);
    metaEl.textContent = parts.join(' \u00B7 ');
  } else {
    thumbEl.src = '';
    titleEl.textContent = document.getElementById('ytNpTitle')?.textContent || '';
    metaEl.textContent  = '';
  }
}

function toggleYtAudioOnly() {
  sparkyYtState.isAudioOnly = !sparkyYtState.isAudioOnly;
  const btn = document.getElementById('btnYtAudioOnly');
  const videoEl = document.getElementById('sparky-yt-player');
  const placeholder = document.getElementById('yt-audio-only-placeholder');

  if (btn) btn.classList.toggle('active', sparkyYtState.isAudioOnly);
  if (videoEl) videoEl.classList.toggle('hidden', sparkyYtState.isAudioOnly);
  if (placeholder) placeholder.classList.toggle('hidden', !sparkyYtState.isAudioOnly);

  if (sparkyYtState.isAudioOnly) syncAudioOnlyCard();
}

// â”€â”€ Ported from R1: Playlist Engine (Shuffle & Restart) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function restartYtQueue() {
  if (sparkyYtState.originalQueue.length === 0) return;

  sparkyYtState.isShuffleActive = false;
  const btnShuffle = document.getElementById('btnYtShuffle');
  if (btnShuffle) btnShuffle.classList.remove('active');

  sparkyYtState.currentQueue = [...sparkyYtState.originalQueue];
  sparkyYtState.queueIndex = 0;
  playYtItem(sparkyYtState.currentQueue[0]);
  console.log('[YT] Restarting playlist from beginning');
}

function toggleYtShuffle() {
  if (sparkyYtState.originalQueue.length === 0) return;

  sparkyYtState.isShuffleActive = !sparkyYtState.isShuffleActive;
  const btnShuffle = document.getElementById('btnYtShuffle');
  if (btnShuffle) btnShuffle.classList.toggle('active', sparkyYtState.isShuffleActive);

  if (sparkyYtState.isShuffleActive) {
    // Enable Shuffle
    const currentItem = sparkyYtState.currentQueue[sparkyYtState.queueIndex];
    // Filter out current item from the shuffle pool
    const pool = sparkyYtState.originalQueue.filter(v => v.id !== currentItem.id);

    // Fisher-Yates Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // Put current item first in the new shuffled queue
    sparkyYtState.currentQueue = [currentItem, ...pool];
    sparkyYtState.queueIndex = 0;
    console.log('[YT] Shuffle enabled');
  } else {
    // Disable Shuffle: Restore original order
    const currentItem = sparkyYtState.currentQueue[sparkyYtState.queueIndex];
    sparkyYtState.currentQueue = [...sparkyYtState.originalQueue];

    // Find current item's index in the original list to maintain position
    const idx = sparkyYtState.currentQueue.findIndex(v => v.id === currentItem.id);
    sparkyYtState.queueIndex = idx >= 0 ? idx : 0;
    console.log('[YT] Shuffle disabled');
  }

  renderYtQueue();
}
function toggleYtLoop() {
  const btn = document.getElementById('btnYtLoop');
  if (!btn) return;
  sparkyYtState.loopMode = sparkyYtState.loopMode === 'none' ? 'one' : 'none';
  const isActive = sparkyYtState.loopMode === 'one';
  btn.classList.toggle('active', isActive);
  btn.title = `Loop Mode: ${isActive ? 'Single' : 'Off'}`;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = isActive ? 'repeat_one' : 'repeat';
  console.log(`[YT] Loop Mode: ${sparkyYtState.loopMode}`);
}

function renderYtQueue() {
  const container = document.getElementById('ytQueueList');
  const countEl = document.getElementById('ytQueueCount');
  if (!container) return;

  const queue = sparkyYtState.currentQueue;
  if (!queue || queue.length === 0) {
    container.innerHTML = '<div class="pl-empty">Queue is empty</div>';
    if (countEl) countEl.textContent = '0 / 0';
    const progressEl = document.getElementById('ytQueueProgressBar');
    if (progressEl) progressEl.style.width = '0%';
    // Auto-close the overlay when queue is emptied (clear all or last item removed)
    const overlay = document.getElementById('ytQueueOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
      syncYtQueueBtn();
    }
    return;
  }

  if (countEl) {
    const current = sparkyYtState.queueIndex + 1;
    countEl.textContent = `${current} / ${queue.length}`;
  }

  const progressEl = document.getElementById('ytQueueProgressBar');
  if (progressEl) {
    const pct = ((sparkyYtState.queueIndex + 1) / queue.length) * 100;
    progressEl.style.width = `${pct}%`;
  }

  // Only re-render if count or items changed, or just update active class
  // For simplicity, we re-render but we can optimize.
  container.innerHTML = '';
  queue.forEach((item, idx) => {
    const isActive = idx === sparkyYtState.queueIndex && (sparkyYtState.activePlaylistId === 'temp' || sparkyYtState.activePlaylistId !== null);
    const isFav = isYtFav(item.id);
    const isTempQueue = sparkyYtState.activePlaylistId === 'temp';

    const ambientStyle = isActive && item.thumb ? ` style="--ambient-bg: url('${esc(item.thumb)}');"` : '';
    const ambientClass = isActive && item.thumb ? ' has-ambient-bg' : '';

    const el = document.createElement('div');
    el.className = `yt-card yt-queue-card${isActive ? ' active' : ''}${ambientClass}`;
    el.dataset.id = item.id;
    el.dataset.thumb = item.thumb;
    if (ambientStyle) el.style.cssText += ambientStyle.replace(' style="', '').replace('"', '');
    el.innerHTML = `
      <img src="${item.thumb}" class="yt-card-thumb" alt="" loading="lazy">
      <div class="yt-card-info">
        <div class="yt-card-title">${item.title}</div>
        <div class="yt-card-channel">
          ${item.type === 'playlist' ? 
            `Playlist${item.video_count ? ' &middot; ' + item.video_count : ''}` :
            `<span class="desktop-only">${item.views || ''}${item.published ? (item.views ? ' &middot; ' : '') + item.published : ''}${item.duration ? (item.views || item.published ? ' &middot; ' : '') + item.duration : ''}${item.channel ? (item.views || item.published || item.duration ? ' &middot; ' : '') + item.channel : ''}</span>
             <span class="mobile-stats">${item.views || ''}${item.published ? (item.views ? ' &middot; ' : '') + item.published : ''}${item.channel ? (item.views || item.published ? ' &middot; ' : '') + item.channel : ''}</span>`
          }
        </div>
      </div>
      <div class="yt-card-actions">
        <button class="yt-card-fav${isFav ? ' active' : ''}" title="${isFav ? 'Remove from Hub' : 'Save to Hub'}">
          <span class="material-symbols-outlined">favorite</span>
        </button>
        ${isTempQueue ? `
          <button class="yt-card-remove" title="Remove from Queue">
            <span class="material-symbols-outlined">delete</span>
          </button>
        ` : ''}
      </div>
    `;

    // Play on body click
    el.onclick = (e) => {
      if (e.target.closest('.yt-card-fav') || e.target.closest('.yt-card-remove')) return;
      sparkyYtState.queueIndex = idx;
      playYtItem(item);
    };

    // Fav toggle
    const favBtn = el.querySelector('.yt-card-fav');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        const currentlyFav = isYtFav(item.id);
        if (currentlyFav) {
          removeYtFav(item.id);
          favBtn.classList.remove('active');
          favBtn.title = 'Save to Hub';
        } else {
          addYtFav(item);
          favBtn.classList.add('active');
          favBtn.title = 'Remove from Hub';
        }

        // Instant parity with main NP area and Hub
        if (sparkyYtState.currentItemId === item.id) syncYtNpFav();
        if (sparkyYtState.currentSubMode === 'hub') renderYtHub();
      };
    }

    // Remove from Temp Queue
    const removeBtn = el.querySelector('.yt-card-remove');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeFromYtTempQueue(item.id);
      };
    }

    container.appendChild(el);

    if (isActive) {
      // Prevent scrolling the active item if the queue list overlay is hidden to avoid viewport shifts
      const overlay = document.getElementById('ytQueueOverlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
      }
    }
  });
}

function syncYtNpFav() {
  const btn = document.getElementById('btnYtNpFav');
  if (!btn || !sparkyYtState.currentItemId) return;
  const isFav = isYtFav(sparkyYtState.currentItemId);
  btn.classList.toggle('active', isFav);
  btn.title = isFav ? 'Remove from Hub' : 'Save to Hub';
  btn.innerHTML = `<span class="material-symbols-outlined">${isFav ? 'favorite' : 'favorite_border'}</span>`;
}

// â”€â”€ 3.2: Lazy Player Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function playYtItem(item) {
  sparkyLog(`Action: playYtItem(${item.id}) - ${item.title}`);
  debugLayout('BEFORE-PLAY');

  sparkyYtState.currentItemId = item.id; // Persist so highlight survives tab switches

  // Track played status for temp queue pulsing logic
  if (sparkyYtState.temporaryQueue.some(v => v.id === item.id)) {
    sparkyYtState.tempQueuePlayedIds.add(item.id);
    syncYtQueueBtn();
  }

  // Clear previous related videos on load to reset reactive theme state
  sparkyYtState.relatedVideos = [];
  syncYtRelatedBtn();
  pauseRadioForYt();
  highlightYtCard(item.id, true);

  // V-U11: Ambient favicon glow for Now Playing panel
  const npPanel = document.querySelector('.now-playing');
  if (npPanel) {
    const thumb = item.thumb || item.thumbnail || (item.thumbnail_url);
    if (thumb) {
      npPanel.style.setProperty('--ambient-bg', `url("${esc(thumb)}")`);
      npPanel.classList.add('has-ambient-bg');
    } else {
      npPanel.style.removeProperty('--ambient-bg');
      npPanel.classList.remove('has-ambient-bg');
    }
  }

  // Handle Playlist Expansion
  if (item.type === 'playlist') {
    console.log(`[YT-DEBUG] Expanding playlist for playback: ${item.id}`);
    const titleEl = document.getElementById('ytNpTitle');
    if (titleEl) titleEl.textContent = 'Loading Playlist...';
    
    try {
      const res = await fetch(`${YT_API_BASE}/api/fetchPlaylist?id=${item.id}`);
      const data = await res.json();
      const playlistVideos = data.videos || data.video_results || [];
      
      if (playlistVideos.length > 0) {
        sparkyYtState.currentQueue = playlistVideos.map(v => ({
          ...v,
          type: 'video',
          thumb: v.thumbnail || v.thumb || '', // Bridge the API-to-UI gap
          views: v.views || '',
          published: v.published || ''
        }));
        sparkyYtState.activePlaylistId = item.id;
        sparkyYtState.queueIndex = 0;
        
        renderYtQueue();
        hydrateYtQueueTags(sparkyYtState.currentQueue);
        
        // Play the first video from the newly expanded playlist
        playYtItem(sparkyYtState.currentQueue[0]);
        return;
      }
    } catch (e) {
      console.error('[YT-DEBUG] Playlist expansion failed:', e);
      return;
    }
  }

  // Update Queue UI if open
  renderYtQueue();

  // Update NP metadata immediately
  const titleEl = document.getElementById('ytNpTitle');
  const channelEl = document.getElementById('ytNpChannel');
  if (titleEl) titleEl.textContent = item.title || 'Loading...';
  if (channelEl) channelEl.textContent = item.type === 'playlist' ? '▶ Playlist' : '▶ Video';

  // Update/Inject NP heart button
  let btnFav = document.getElementById('btnYtNpFav');
  if (!btnFav) {
    const container = document.querySelector('.yt-np-meta .yt-np-meta + div') || document.querySelector('.yt-np-meta > div > div:last-child');
    if (container) {
      btnFav = document.createElement('button');
      btnFav.id = 'btnYtNpFav';
      btnFav.className = 'btn-yt-queue';
      container.insertBefore(btnFav, container.firstChild);
      btnFav.onclick = () => {
        const current = sparkyYtState.currentQueue[sparkyYtState.queueIndex] || item;
        if (isYtFav(current.id)) {
          removeYtFav(current.id);
        } else {
          addYtFav(current);
        }
        syncYtNpFav();
        renderYtQueue();
        if (sparkyYtState.currentSubMode === 'hub') renderYtHub();
      };
    }
  }
  syncYtNpFav();
  if (sparkyYtState.isAudioOnly) syncAudioOnlyCard();

  if (ytIframeApiReady && sparkyYtState.playerInstance) {
    loadIntoExistingPlayer(item);
  } else if (ytIframeApiReady && !sparkyYtState.playerInstance) {
    createYtPlayer(item);
  } else {
    pendingPlayItem = item;
    loadYtIframeApi();
  }

  if (item.type !== 'playlist') {
    fetchRelatedVideos().catch(err => console.error('[YT] Background related fetch failed:', err));
  }

  sparkyLog(`[YT] Playing ${item.type}: ${item.title}`);
  setTimeout(() => debugLayout('AFTER-PLAY'), 300);
}

function loadIntoExistingPlayer(item) {
  const p = sparkyYtState.playerInstance;
  // Deep check for API availability
  if (!p || typeof p.loadVideoById !== 'function') {
    console.warn('[YT-DEBUG] Player API not fully loaded or broken. Re-initializing...');
    createYtPlayer(item);
    return;
  }
  
  try {
    p.loadVideoById(item.id);
  } catch (e) {
    console.error('[YT-DEBUG] Player load error:', e);
    // Recreate player if it crashed
    sparkyYtState.playerInstance = null;
    createYtPlayer(item);
  }
}

function loadYtIframeApi() {
  if (ytIframeApiLoading || ytIframeApiReady) return;
  ytIframeApiLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  console.log('[YT] Lazy-loading iframe API...');
}

// Global callback â€” YouTube API calls this when ready
window.onYouTubeIframeAPIReady = function () {
  ytIframeApiReady = true;
  ytIframeApiLoading = false;
  console.log('[YT] iframe API ready');
  if (pendingPlayItem) {
    createYtPlayer(pendingPlayItem);
    pendingPlayItem = null;
  }
};

function createYtPlayer(item) {
  sparkyLog(`Action: createYtPlayer(${item.id})`);
  // Reset the div in case it has stale content
  const playerDiv = document.getElementById('sparky-yt-player');
  if (!playerDiv) return;
  playerDiv.innerHTML = '';

  sparkyYtState.playerInstance = new YT.Player('sparky-yt-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      playsinline: 1,
      controls: 1,
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      fs: 1,
      enablejsapi: 1,
      origin: window.location.origin
    },
    events: {
      onReady: event => {
        event.target.loadVideoById(item.id);
      },
      onStateChange: onYtStateChange,
      onError: e => console.error('[YT] Player error code:', e.data)
    }
  });
}

// â”€â”€ 3.3: Audio Overlap Prevention â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let lastCinemaTriggerTime = 0;
function onYtStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    pauseRadioForYt();
    isPlaying = true; // Update global state for UI sync
    syncPlayBtns();
    resetCinemaTimer(); // Start/refresh cinema timer when playback begins
  } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
    isPlaying = false; // Update global state for UI sync
    syncPlayBtns();
    if (Date.now() - lastCinemaTriggerTime > 1000) {
      wakeFromCinemaMode(); // Auto-wake if paused or ended, ignore instantaneous layout reflow pause pings
    }
    if (event.data === YT.PlayerState.ENDED) {
      if (sparkyYtState.loopMode === 'one') {
        console.log('[YT] Loop Active: Restarting current video');
        event.target.playVideo();
      } else {
        playYtNext();
      }
    }
  }
}

function toggleYtPlay() {
  const p = sparkyYtState.playerInstance;
  if (!p) return;
  const state = p.getPlayerState();
  if (state === YT.PlayerState.PLAYING) p.pauseVideo();
  else p.playVideo();
}

function playYtNext() {
  const p = sparkyYtState.playerInstance;
  if (!p) return;
  if (sparkyYtState.queueIndex < sparkyYtState.currentQueue.length - 1) {
    sparkyYtState.queueIndex++;
    playYtItem(sparkyYtState.currentQueue[sparkyYtState.queueIndex]);
  }
}

function playYtPrev() {
  const p = sparkyYtState.playerInstance;
  if (!p) return;
  if (sparkyYtState.queueIndex > 0) {
    sparkyYtState.queueIndex--;
    playYtItem(sparkyYtState.currentQueue[sparkyYtState.queueIndex]);
  }
}

function pauseRadioForYt() {
  const audio = document.getElementById('audioEl');
  if (audio && !audio.paused) {
    audio.pause();
    console.log('[YT] Radio paused â€” YouTube is now playing');
  }
}

// â”€â”€ Search Event Wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ytSearchInput = document.getElementById('ytSearchInput');
const btnYtSearchClear = document.getElementById('btnYtSearchClear');

const toggleYtSearchClear = () => {
  if (btnYtSearchClear && ytSearchInput) {
    btnYtSearchClear.style.display = ytSearchInput.value ? 'flex' : 'none';
  }
};

/* V-U7: Render Tier 1 - Recent Searches (3 items, show recents tier only) */
function renderDropdownRecents() {
  const tierItems = document.getElementById('tierRecentsItems');
  const tierRecents = document.getElementById('dropdownTierRecents');
  const tierAutocomplete = document.getElementById('dropdownTierAutocomplete');
  if (!tierItems || !tierRecents) return;
  
  const recents = getRecentsByMode(sparkyYtState.currentSubMode).slice(0, 3);
  tierRecents.style.display = 'flex';
  if (tierAutocomplete) tierAutocomplete.style.display = 'none';
  
  if (!recents.length) {
    tierItems.innerHTML = '<div class="tier-empty">No recent searches</div>';
    return;
  }
  tierItems.innerHTML = recents.map(query => `
    <div class="dropdown-item dropdown-recent-item" data-query="${query.replace(/"/g, '&quot;')}">
      <div class="dropdown-item-left">
        <span class="dropdown-item-icon material-symbols-outlined" style="font-size: 16px;">history</span>
        <span class="dropdown-item-text">${query}</span>
      </div>
      <button class="dropdown-item-remove" title="Remove search">&times;</button>
    </div>
  `).join('');
  
  tierItems.querySelectorAll('.dropdown-recent-item').forEach(el => {
    const leftArea = el.querySelector('.dropdown-item-left');
    if (leftArea) {
      leftArea.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDropdownItem(el.dataset.query, false);
      });
    }
    const removeBtn = el.querySelector('.dropdown-item-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeYtRecentSearch(el.dataset.query);
      });
    }
  });
}

/* V-U7: Render Tier 2 - Autocomplete (hide recents tier when showing suggestions) */
function renderDropdownAutocomplete() {
  const tierContainer = document.getElementById('dropdownTierAutocomplete');
  const tierItems = document.getElementById('tierAutocompleteItems');
  const tierRecents = document.getElementById('dropdownTierRecents');
  if (!tierItems || !tierContainer) return;
  
  const results = sparkyYtState.autocompleteResults || [];
  const typedQuery = document.getElementById('ytSearchInput')?.value?.trim() || '';

  if (!results.length) {
    tierContainer.style.display = 'none';
    if (tierRecents) {
      if (typedQuery === '') {
        tierRecents.style.display = 'flex';
      } else {
        tierRecents.style.display = 'none';
      }
    }
    return;
  }
  tierContainer.style.display = 'flex';
  if (tierRecents) tierRecents.style.display = 'none';
  tierItems.innerHTML = results.slice(0, 5).map(sugg => `
    <div class="dropdown-item" data-query="${sugg.replace(/"/g, '&quot;')}">
      <span class="dropdown-item-icon material-symbols-outlined" style="font-size: 16px;">search</span>
      <span class="dropdown-item-text">${sugg}</span>
    </div>
  `).join('');
  tierItems.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('click', () => {
      const typedQuery = document.getElementById('ytSearchInput')?.value?.trim();
      selectDropdownItem(el.dataset.query, true, typedQuery);
    });
  });
}

/* V-U7: Populate dropdown (recents only on focus) */
function populateYtSearchDropdown() {
  renderDropdownRecents();
}

/* V-U7: Select item */
function selectDropdownItem(query, skipRecent = false, typedQuery = null) {
  if (ytSearchInput) {
    clearTimeout(autocompleteDebounce);
    if (autocompleteAbortController) {
      autocompleteAbortController.abort();
    }
    ytSearchInput.value = query;
    toggleYtSearchClear();
    runYtSearch(skipRecent, typedQuery);
    closeYtSearchDropdown();
  }
}

/* V-U7: Debounced autocomplete */
let autocompleteDebounce = null;
let autocompleteAbortController = null;
async function fetchAutocomplete(query) {
  if (!query.trim() || query.length < 2) {
    sparkyYtState.autocompleteResults = [];
    renderDropdownAutocomplete();
    return;
  }
  if (autocompleteAbortController) {
    autocompleteAbortController.abort();
  }
  autocompleteAbortController = new AbortController();
  const signal = autocompleteAbortController.signal;

  try {
    const mode = sparkyYtState.currentSubMode;
    const endpoint = mode === 'playlists' ? '/api/fetchPlaylist' : '/api/searchVideos';
    const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&limit=5`, { signal });
    const data = await response.json();
    const suggestions = (mode === 'playlists' 
      ? data.playlist_results?.map(p => p.title) 
      : data.video_results?.map(v => v.title)) || [];
    sparkyYtState.autocompleteResults = suggestions.slice(0, 5);
    renderDropdownAutocomplete();
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[V-U7] Autocomplete:', e);
    }
  }
}

document.getElementById('btnYtSearch')?.addEventListener('click', () => runYtSearch(false));
ytSearchInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    runYtSearch();
    closeYtSearchDropdown();
  }
});
ytSearchInput?.addEventListener('input', () => {
  toggleYtSearchClear();
  const query = ytSearchInput.value.trim();
  if (query === '') {
    clearTimeout(autocompleteDebounce);
    if (autocompleteAbortController) {
      autocompleteAbortController.abort();
    }
    sparkyYtState.autocompleteResults = [];
    populateYtSearchDropdown();
  } else {
    const tierRecents = document.getElementById('dropdownTierRecents');
    if (tierRecents) tierRecents.style.display = 'none';
    
    clearTimeout(autocompleteDebounce);
    autocompleteDebounce = setTimeout(() => fetchAutocomplete(query), 300);
  }
});
ytSearchInput?.addEventListener('focus', () => {
  populateYtSearchDropdown();
  renderDropdownRecents();
  openYtSearchDropdown();
});
ytSearchInput?.addEventListener('blur', () => {
  setTimeout(() => closeYtSearchDropdown(), 200);
});
ytSearchInput?.addEventListener('click', () => {
  if (!sparkyYtState.dropdownOpen) {
    populateYtSearchDropdown();
    renderDropdownRecents();
    openYtSearchDropdown();
  }
});
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('ytSearchDropdown');
  const searchWrap = document.getElementById('ytSearchWrap');
  if (dropdown && searchWrap && !searchWrap.contains(e.target)) {
    closeYtSearchDropdown();
  }
});

btnYtSearchClear?.addEventListener('click', () => {
  if (ytSearchInput) {
    ytSearchInput.value = '';
    toggleYtSearchClear();
    populateYtSearchDropdown();
    renderDropdownRecents();
    openYtSearchDropdown();
    ytSearchInput.focus();
    clearYtResults();
  }
});


document.getElementById('btnYtQueue')?.addEventListener('click', toggleYtQueue);
document.getElementById('btnYtRelated')?.addEventListener('click', toggleYtRelated);
document.getElementById('btnYtRelatedClose')?.addEventListener('click', closeYtRelated);
document.getElementById('btnYtCinemaToggle')?.addEventListener('click', toggleCinemaMode);
document.getElementById('btnYtQueueClear')?.addEventListener('click', clearYtTempQueue);
document.getElementById('btnYtAudioOnly')?.addEventListener('click', toggleYtAudioOnly);
document.getElementById('btnYtShuffle')?.addEventListener('click', toggleYtShuffle);
document.getElementById('btnYtLoop')?.addEventListener('click', toggleYtLoop);
document.getElementById('btnYtRestart')?.addEventListener('click', restartYtQueue);

// Tab switching
document.querySelectorAll('.yt-tab').forEach(btn => {
  btn.addEventListener('click', () => switchYtTab(btn.dataset.mode));
});

// YT LOCAL SORT LOGIC
const ytSortTrigger = document.getElementById('ytSortTrigger');
const ytSortOptions = document.getElementById('ytSortOptions');
const ytSortLabel = document.getElementById('ytSortLabel');

if (ytSortTrigger) {
  ytSortTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    ytSortOptions.classList.toggle('show');
  });
}

// YT RELATED SORT LOGIC
const ytRelatedSortTrigger = document.getElementById('ytRelatedSortTrigger');
const ytRelatedSortOptions = document.getElementById('ytRelatedSortOptions');
const ytRelatedSortLabel = document.getElementById('ytRelatedSortLabel');

if (ytRelatedSortTrigger) {
  ytRelatedSortTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    ytRelatedSortOptions.classList.toggle('show');
  });

  document.querySelectorAll('#ytRelatedSortOptions .preset-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const sortMode = opt.dataset.sort;
      sparkyYtState.relatedSortMode = sortMode;

      // Update label & active state
      document.querySelectorAll('#ytRelatedSortOptions .preset-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      if (ytRelatedSortLabel) ytRelatedSortLabel.textContent = opt.textContent;

      // Re-render with new sort
      renderYtRelated();
      ytRelatedSortOptions.classList.remove('show');
    });
  });
}

document.addEventListener('click', (e) => {
  if (ytSortOptions && !ytSortTrigger.contains(e.target)) {
    ytSortOptions.classList.remove('show');
  }
  if (ytRelatedSortOptions && !ytRelatedSortTrigger.contains(e.target)) {
    ytRelatedSortOptions.classList.remove('show');
  }
});

if (ytSortOptions) {
  ytSortOptions.querySelectorAll('.preset-opt').forEach(item => {
    item.addEventListener('click', (e) => {
      ytSortOptions.querySelectorAll('.preset-opt').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const sortMode = item.dataset.sort;
      ytSortLabel.textContent = item.textContent;
      ytSortOptions.classList.remove('show');
      sortYtResultsLocal(sortMode);
    });
  });
}

function parseYtViews(str) {
  if (!str) return 0;
  let num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (str.toLowerCase().includes('k')) num *= 1000;
  if (str.toLowerCase().includes('m')) num *= 1000000;
  if (str.toLowerCase().includes('b')) num *= 1000000000;
  return num;
}

function parseYtDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 0;
}

function parseYtTimeframe(str) {
  if (!str) return 0;
  let num = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
  let mult = 1;
  const lower = str.toLowerCase();
  if (lower.includes('minute')) mult = 1;
  else if (lower.includes('hour')) mult = 60;
  else if (lower.includes('day')) mult = 60*24;
  else if (lower.includes('week')) mult = 60*24*7;
  else if (lower.includes('month')) mult = 60*24*30;
  else if (lower.includes('year')) mult = 60*24*365;
  return num * mult;
}

function sortYtResultsLocal(mode) {
  const container = document.getElementById('ytResults');
  if (!container) return;
  const cards = Array.from(container.querySelectorAll('.yt-card'));
  if (!cards.length) return;

  // Store the original order (relevance) if not already stored
  cards.forEach((card, index) => {
    if (!card.dataset.relevanceIndex) {
      card.dataset.relevanceIndex = index;
    }
  });

  cards.sort((a, b) => {
    if (mode === 'views') {
      return parseYtViews(b.dataset.views) - parseYtViews(a.dataset.views);
    }
    if (mode === 'duration') {
      return parseYtDuration(b.dataset.duration) - parseYtDuration(a.dataset.duration);
    }
    if (mode === 'timeframe') {
      return parseYtTimeframe(a.dataset.published) - parseYtTimeframe(b.dataset.published); // Ascending (newest first usually means smallest timeframe ago)
    }
    if (mode === 'artist') {
      const aName = (a.dataset.channel || '').toLowerCase();
      const bName = (b.dataset.channel || '').toLowerCase();
      return aName.localeCompare(bName);
    }
    // Default: relevance
    return parseInt(a.dataset.relevanceIndex) - parseInt(b.dataset.relevanceIndex);
  });

  cards.forEach(card => container.appendChild(card));
}

// YT MUTATION OBSERVER FOR AUTO-SORT
let isYtSorting = false;
const ytObserver = new MutationObserver(() => {
  if (isYtSorting) return;
  const activeSort = document.querySelector('#ytSortOptions .preset-opt.active');
  if (activeSort && activeSort.dataset.sort !== 'relevance') {
    isYtSorting = true;
    sortYtResultsLocal(activeSort.dataset.sort);
    setTimeout(() => { isYtSorting = false; }, 50);
  }
});
const ytContainer = document.getElementById('ytResults');
if (ytContainer) {
  ytObserver.observe(ytContainer, { childList: true });
}

// YT QUEUE LOCAL SORT LOGIC
const ytQueueSortTrigger = document.getElementById('ytQueueSortTrigger');
const ytQueueSortOptions = document.getElementById('ytQueueSortOptions');
const ytQueueSortLabel = document.getElementById('ytQueueSortLabel');

if (ytQueueSortTrigger) {
  ytQueueSortTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    ytQueueSortOptions.classList.toggle('show');
  });
}

document.addEventListener('click', (e) => {
  if (ytQueueSortOptions && !ytQueueSortTrigger.contains(e.target)) {
    ytQueueSortOptions.classList.remove('show');
  }
});

if (ytQueueSortOptions) {
  ytQueueSortOptions.querySelectorAll('.preset-opt').forEach(item => {
    item.addEventListener('click', (e) => {
      ytQueueSortOptions.querySelectorAll('.preset-opt').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const sortMode = item.dataset.sort;
      ytQueueSortLabel.textContent = item.textContent;
      ytQueueSortOptions.classList.remove('show');
      sortYtQueueLocal(sortMode);
    });
  });
}

function sortYtQueueLocal(mode) {
  if (!sparkyYtState.currentQueue || !sparkyYtState.currentQueue.length) return;
  const currentItem = sparkyYtState.currentQueue[sparkyYtState.queueIndex];

  if (mode === 'relevance') {
    sparkyYtState.currentQueue = [...sparkyYtState.originalQueue];
  } else {
    sparkyYtState.currentQueue.sort((a, b) => {
      if (mode === 'views') {
        return parseYtViews(b.views) - parseYtViews(a.views);
      }
      if (mode === 'duration') {
        return parseYtDuration(b.duration) - parseYtDuration(a.duration);
      }
      if (mode === 'timeframe') {
        return parseYtTimeframe(a.published) - parseYtTimeframe(b.published);
      }
      if (mode === 'artist') {
        const aName = (a.channel || a.author || '').toLowerCase();
        const bName = (b.channel || b.author || '').toLowerCase();
        return aName.localeCompare(bName);
      }
      return 0;
    });
  }

  if (currentItem) {
    const newIdx = sparkyYtState.currentQueue.findIndex(v => v.id === currentItem.id);
    if (newIdx !== -1) sparkyYtState.queueIndex = newIdx;
  }
  
  renderYtQueue();
}

/* V-O6: Dynamic Self-Healing Mojibake Autorecover System */
function autoRepairEncoding() {
  const repairMap = {
    'ðŸ“»': '📻',
    'ðŸ” ': '🔍',
    'ðŸ📡': '📡',
    'âœ…': '✅',
    'âš': '⚠️',
  };
  
  function walkAndRepair(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.nodeValue;
      let changed = false;
      for (const [garbled, clean] of Object.entries(repairMap)) {
        if (text.includes(garbled)) {
          text = text.replaceAll(garbled, clean);
          changed = true;
        }
      }
      if (changed) node.nodeValue = text;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
        node.childNodes.forEach(walkAndRepair);
      }
    }
  }

  const runRepair = () => {
    if (!document.body) return;
    walkAndRepair(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(walkAndRepair);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runRepair);
  } else {
    runRepair();
  }
}
autoRepairEncoding();
