# 🎙️ Sparky Radio — Upgrades PRD
**Version:** 1.0 · **Date:** May 2026 · **Status:** Draft for Review

> This document is a structured upgrade roadmap derived from a forensic audit of the live codebase (`main.js` ~4,800 lines, three API handlers, ~100KB CSS, `index.html`). All ideas are grounded in observed code patterns, architectural decisions, and prior conversation history. Every item is organized as **impact** · **effort** for prioritization.

---

## Table of Contents
1. [Radio Side](#-radio-side)
   - [1.1 Optimization Ideas](#11-optimization-ideas)
   - [1.2 Enhancement Ideas](#12-enhancement-ideas)
   - [1.3 UI Upgrade Ideas](#13-ui-upgrade-ideas)
   - [1.4 Downgrade Ideas](#14-downgrade-ideas)
2. [Video Side](#-video-side)
   - [2.1 Optimization Ideas](#21-optimization-ideas)
   - [2.2 Enhancement Ideas](#22-enhancement-ideas)
   - [2.3 UI Upgrade Ideas](#23-ui-upgrade-ideas)
   - [2.4 Downgrade Ideas](#24-downgrade-ideas)

---

## 📻 Radio Side

### 1.1 Optimization Ideas

| # | Idea | Root Issue Observed | Impact | Effort |
|---|------|---------------------|--------|--------|
| R-O1 | **Deduplicate `loadFavs()` calls** — called independently in `isFav()`, `findFavMatch()`, `syncFavMetadata()`, and every render cycle. Memoize with a single-tick cache or pass `currentFavs` as param. | `loadFavs()` triggers JSON.parse on every station render row (x250 on discovery grid). | 🔥 High | 🟢 Low |
| R-O2 | **Replace `innerHTML` full-redraws with targeted DOM patching** — `renderStations()` and `renderFavs()` wipe and rebuild the full list on every tiny state change (vol, fav toggle). | Full DOM thrash on every sort/filter triggers reflow of 250+ rows. | 🔥 High | 🔴 High |
| R-O3 | **Debounce `backgroundSyncFavs()`** — it fires on every `switchTab('favs')` and awaits serial fetches with 500ms sleep per station, blocking the event loop. | `sleep(500)` loop inside async loop; 20 favs = 10s+ blocking. | 🔥 High | 🟢 Low |
| R-O4 | **Extract `getScore()` computation outside render loops** — the power-rank formula is recalculated for every item in every render pass including `renderStations`, `renderFavs`, `renderGroupedFavs`. | O(N²) behavior on sort + render of 250 stations. | 🟡 Medium | 🟢 Low |
| R-O5 | **Lazy-initialize AudioContext** — `initAudio()` is called on every `playStationObj()`. Guard should check `audioCtx` state before any allocation. | Safe now but redundant calls risk accumulating suspended contexts on mobile browsers. | 🟡 Medium | 🟢 Low |
| R-O6 | **Virtualize the station list** — render only visible rows (windowed scroll) for `renderStations` with 250 stations. | 250 DOM nodes, each with 5 child elements = 1,250 nodes painted on search. | 🔥 High | 🔴 High |
| R-O7 | **Consolidate `healFavoritesFavicons()` retry budget** — currently fetches up to 15 favicons at 1s intervals on every boot; expensive for mobile connections. | 15s of sequential requests at startup on every load. | 🟡 Medium | 🟢 Low |
| R-O8 | **Cache `norm()` URL results** — `norm()` is called inside nearly every ID comparison; lightweight string cache would prevent redundant regex processing. | Called inside `isFav()` which itself is called per-row in render. | 🟡 Medium | 🟢 Low |

---

### 1.2 Enhancement Ideas

| # | Idea | Why | Impact | Effort |
|---|------|-----|--------|--------|
| R-E1 | **Keyboard shortcuts for transport controls** — Space = play/stop, Left/Right arrows = prev/next, `M` = mute. | PWA power users on desktop have no keyboard nav; standard in streaming apps. | 🔥 High | 🟢 Low |

| R-E3 | **Persist EQ state to `sparky_last_station` context** — restore EQ preset alongside the last-played station on cold start. | `sparky_active_preset` is restored but `isStagedPreset` state is lost; user must re-apply. | 🟡 Medium | 🟢 Low |
| R-E4 | **Smart "Auto-Resume" on network reconnect** — listen to `navigator.onLine` / `online` event; auto-retry last station after connectivity is restored. | Drop-outs require manual user re-tap; broadcast apps handle this transparently. | 🔥 High | 🟡 Medium |
| R-E5 | **Batch `backgroundSyncFavs()` using `/byuuid` multi-ID endpoint** — radio-browser.info supports comma-separated UUIDs; replace the serial per-station loop with a single batch call. | Reduces sync time from ~10s serial to one parallel request. | 🔥 High | 🟢 Low |
| R-E6 | **Fuzzy search inside Favorites tab** — currently search only applies on Stations tab; add a local fuzzy filter (name + tags) for favs without calling the API. | Large favorites vaults (50+ stations) have no discovery filter in List mode. | 🟡 Medium | 🟢 Low |
| R-E7 | **Station metadata refresh on long-play** — after 30 min of continuous play, quietly re-fetch stats (votes, clickcount) and update the NP panel. | Live broadcast stats drift; "🔥 52K" shown at session start may be hours stale. | 🟡 Medium | 🟡 Medium |
| R-E8 | **Export/Import include EQ presets** — current export schema (`version:2`) contains favorites and usageStats but omits `sparky_eq_presets` and `sparky_custom_categories`. | Users lose custom EQ tuning when migrating devices. | 🟡 Medium | 🟢 Low |
| R-E9 | **"Play Similar" action on Now Playing** — query radio-browser by the playing station's primary tag to surface genre-adjacent stations. | Contextual discovery without leaving the NP panel. | 🔥 High | 🟡 Medium |
| R-E10 | **"Station of the Day" cold-start banner** — on first daily load, feature one trending station pulled from radio-browser's `/stations/topclick` endpoint. | Empty-state screen on first launch is generic; a curated pick drives engagement. | 🟡 Medium | 🟡 Medium |
| R-E11 | **Native Google Cast SDK integration (Radio Only)** — embed `<google-cast-launcher>` and initialize Cast Web SDK with the default media receiver to cast direct audio streams to Nest devices. Only active in Radio Mode due to YouTube streaming restrictions. | Allows casting stream audio directly from within the app rather than manually casting system-wide. | 🔥 High | 🟡 Medium |

---

### 1.3 UI Upgrade Ideas

| # | Idea | Details | Impact | Effort |
|---|------|---------|--------|--------|
| R-U1 | **Animated NP panel album-art background** — when favicon is available, apply it as a blurred, low-opacity backdrop on the `.now-playing` panel using `backdrop-filter`. | Creates a Spotify "Now Playing" ambient glow without touching layout geometry. | 🔥 High | 🟢 Low |
| R-U2 | **EQ fader needle glow on active preset** — add a `box-shadow` pulse on the active fader knob using the theme's `--accent` color; idle faders remain flat. | EQ panel feels industrial but static; micro-animation makes it feel alive. | 🟡 Medium | 🟢 Low |
| R-U3 | **Visualizer color reactive to theme** — currently hardcoded bar fill; tie bar color to `var(--accent)` and interpolate intensity with a `hsl()` shift. | Full theme support (6 themes + user custom) but visualizer stays the same cyan. | 🟡 Medium | 🟢 Low |
| R-U4 | **Station card hover "preview" ripple** — on card hover/tap, add a subtle circular ripple expanding from tap point before starting playback. | Eliminates the uncertainty of "did my tap register?" common on mobile touch. | 🔥 High | 🟢 Low |
| R-U5 | **Favorites grid card art** — in Discovery mode, replace the fallback `radio` icon with a gradient tile generated from the station's primary tag color (deterministic hash → HSL). **(Completed - Commit 86dcf80)** | Blank icon tiles dominate; colored gradient art makes discovery mode visually scannable. | 🔥 High | 🟡 Medium |
| R-U6 | **Collapsible NP panel on scroll** — when user scrolls the station list down, the `.now-playing` panel collapses to a thin "mini-player" strip showing favicon + name + stop button; expands on tap. | Maximizes content area on small screens without changing the DOM structure. | 🔥 High | 🟡 Medium |
| R-U7 | **Haptic feedback patterns per action** — current `triggerHaptic()` is a flat 10ms vibrate. Use `[10, 50, 10]` for add-to-favs, `[5]` for filter chip, `[30]` for play start. | Differentiated haptics provide tactile confirmation matching action severity. | 🟡 Medium | 🟢 Low |
| R-U8 | **Category chip row animation** — when switching category filter chips in List mode, slide-transition the station list with a horizontal swipe micro-animation (`transform: translateX`). | Current re-render is instant; animation establishes spatial context. | 🟡 Medium | 🟡 Medium |
| R-U9 | **"Power Score" progress arc on NP panel** — replace the flat `⚡ 83%` text badge with a small SVG circular arc gauge that fills to the power score percentage. | Replaces text-only status with a glanceable visual metric. | 🟡 Medium | 🟡 Medium |
| R-U10 | **Sort tooltip upgrade to inline flyout** — replace the `plSortTooltip` div with a smooth slide-down flyout panel listing all sort modes with icons; auto-close on select. | Current tooltip overlaps content and flickers; flyout is predictable and accessible. | 🟡 Medium | 🟢 Low |

---

### 1.4 Downgrade Ideas
> Items to **remove or simplify** that add friction, technical debt, or dilute the experience.

| # | Item | Why Remove/Simplify | Risk |
|---|------|---------------------|------|
| R-D1 | **`window.auditFavs` / `window.activeRescueFromM3U` global console utilities** — debug rescue functions exposed on `window`; the M3U fetch downloads a 30MB file silently on any cold start invocation. | Gate behind `?debug=1` URL param or remove from production bundle entirely. | 🟢 Low |
| R-D2 | **Pro-debugger console interceptor at top of `main.js`** — overrides `console.log`, `console.error`, and `console.warn` globally; breaks third-party library error reporting. | Move to a lazy-init dev-only module gated by `import.meta.env.DEV`. | 🟢 Low |
| R-D3 | **`closeSparkyModal()` called but never defined** — `bind('sparkyModalOk', () => closeSparkyModal(true))` is in `DOMContentLoaded` but the function does not exist anywhere; modal close is inline at each call site. | Consolidate all modal-close paths into one defined function. | 🟡 Medium |
| R-D4 | **Multiple `.bak` files committed to the repo** — `main.js.bak`, `main.js.error3.bak`, `main.js.mockup.bak`, plus 7 CSS `.bak` variants in `src/`. | Remove and add `*.bak` to `.gitignore`; version history belongs in git. | 🟢 Low |
| R-D5 | **`shiftColor()` / `getColorDistance()` hand-rolled color math** — 3 custom hex-manipulation functions for panel color contrast; CSS `oklch()` or a micro-library handles this more accurately with edge-case coverage. | Potential failures on near-0 or near-255 channels. | 🟡 Medium |
| R-D6 | **`healFavoritesFavicons()` runs on every prod load** — up to 15 sequential API calls at 1s intervals at startup; skipped on localhost only. | Throttle to once per session per missing favicon; rate-limit risk with radio-browser.info. | 🟡 Medium |
| R-D7 | **`debugLayout()` and `sparkyLog()` call sites still wired to every playback path** — both functions have their output commented out but are still called on every `playStationObj()`. | Gate behind a `SPARKY_DEBUG` flag or remove call sites to eliminate dead execution overhead. | 🟢 Low |

---

## 🎬 Video Side

### 2.1 Optimization Ideas

| # | Idea | Root Issue Observed | Impact | Effort |
|---|------|---------------------|--------|--------|
| V-O1 | **Innertube singleton across API handlers** — each of `searchVideos.js`, `fetchPlaylist.js`, `hydrateTags.js` calls `Innertube.create()` independently per request, re-negotiating a session each time. | Creates 3 separate sessions per search-then-hydrate workflow; 300–800ms overhead per cold call. | 🔥 High | 🟡 Medium |
| V-O2 | **Batch `hydrateYtQueueTags()` across the full queue** — currently processes only items missing `views` or `published`, in batches of 5. Items beyond index 20 in `fetchPlaylist.js` are never hydrated server-side. | Playlist items 21+ always render with empty metadata; client-side hydration of 50+ items costs 50 API calls. | 🔥 High | 🟡 Medium |
| V-O3 | **Deduplicate `attachYtCardListeners()` bindings** — called on every `renderYtVideoResults` append but does `attachYtCardListeners(el)` on the whole container, not just new cards; `data-bound` guard prevents double-bind on existing cards but still iterates all. | Binding accumulation on long scroll sessions; 200+ cards each with click listeners. | 🟡 Medium | 🟢 Low |
| V-O4 | **Cache YT iframe API load state** — `ytIframeApiLoading` and `ytIframeApiReady` flags exist but the `<script>` tag is injected dynamically each time without checking if already in DOM. | Multiple injections possible if `initYtPlayer` races on quick mode switches. | 🟡 Medium | 🟢 Low |
| V-O5 | **Prefetch page read race condition** — `prefetchNextYtPage()` updates `cache.prefetchedPage` but `processYtPage` reads it without a lock; rapid scroll can trigger two concurrent prefetch cycles. | Potential double-append of the same page; visible as duplicate cards during fast scroll. | 🔥 High | 🟡 Medium |
| V-O6 | **Cancel stale `fetchNextYtPage` requests on new search** — `runYtSearch()` resets the cache but any in-flight `fetch()` from a prior paginated load will still resolve and call `processYtPage` with stale data. | Race: new search results replaced by the tail end of a previous paginated load. | 🔥 High | 🟡 Medium |
| V-O7 | **Reduce `shortenMetadata()` duplication** — identical implementation across all three API files (`searchVideos.js`, `fetchPlaylist.js`, `hydrateTags.js`). | Three copies to maintain; extract to `api/utils.js`. | 🟢 Low | 🟢 Low |
| V-O8 | **`sparkyYtState.temporaryQueue` in-memory vs localStorage drift** — queue is stored in both state and localStorage but sync only happens explicitly; state can diverge after hard refresh. | Queue disappears after hard refresh unless `loadYtTempQueue()` is called on init. | 🟡 Medium | 🟢 Low |

---

### 2.2 Enhancement Ideas

| # | Idea | Why | Impact | Effort |
|---|------|-----|--------|--------|
| V-E1 | **Playlist queue drag-to-reorder** — add HTML5 drag-and-drop (or `touchmove` equivalent) to `ytQueueList` items to allow user reordering before or during playback. | Current queue is append-only; reorder requires remove + re-add. | 🔥 High | 🟡 Medium |
| V-E2 | **"Watch Later" / Deferred Queue** — add a second queue slot for videos to play after the current session; persisted in localStorage. | Current `temporaryQueue` is session-only; favs require full interaction. | 🟡 Medium | 🟡 Medium |
| V-E3 | **YouTube chapter markers on Now Playing panel** — when a video has chapters (available via `getInfo().chapters`), render a horizontal chapter timeline bar under the player. | Rich context during long-form content (concerts, mixes, lectures). | 🟡 Medium | 🔴 High |
| V-E4 | **Related videos sidebar on `yt-view`** — after a video plays, automatically fetch and render 4–6 related video cards from the `related_videos` field of `getInfo()` response. | Mimics YouTube's continue-watching flow; keeps user in the app. | 🔥 High | 🟡 Medium |
| V-E5 | **Playback speed control for video** — add a 0.75×/1×/1.25×/1.5×/2× speed selector to the YT NP meta row; YouTube IFrame API exposes `setPlaybackRate()`. | Essential for podcasts, lectures, and long-form content in audio-only mode. | 🔥 High | 🟢 Low |
| V-E6 | **Loop single video mode** — add a loop toggle to the queue drawer; maps to `YT.PlayerState.ENDED` handler that re-calls `player.playVideo()` on the same ID. | Missing core playback control; required for music videos and ambient loops. | 🔥 High | 🟢 Low |
| V-E7 | **"Play All" from Favs Hub** — one-tap button on the Hub tab header loads all Hub videos into the active queue and starts playback. | Hub currently requires individual clicks to queue each item. | 🟡 Medium | 🟢 Low |
| V-E8 | **Playlist video preview on hover** — on desktop, show a tooltip preview card (title + duration + channel + thumbnail) when hovering a playlist item in the queue drawer. | Low-effort discovery signal without opening the player. | 🟡 Medium | 🟡 Medium |
| V-E9 | **Keyboard shortcut layer for video mode** — `Space` = pause/play, `F` = toggle cinema mode, `M` = audio-only toggle, `N` = next in queue. | No keyboard shortcuts exist for video mode; essential for desktop UX. | 🔥 High | 🟢 Low |
| V-E10 | **Search filter chips (Duration, Date, Type)** — add filter row below the search bar for `Short (<4min)`, `Long (>20min)`, `This week`, `This year`; maps to YouTube search filter params. | Power users can't filter by duration or recency; they get raw chronological results. | 🔥 High | 🟡 Medium |

---

### 2.3 UI Upgrade Ideas

| # | Idea | Details | Impact | Effort |
|---|------|---------|--------|--------|
| V-U1 | **Cinema Mode auto-dim gradient overlay** — replace the abrupt `opacity: 0.2` footer fade with a cinematic vignette using a `linear-gradient` mask from transparent to near-black at the screen edges. | Current footer hide is jarring on dim-lit viewing; gradient feels native to cinema interfaces. | 🔥 High | 🟢 Low |
| V-U2 | **Queue drawer slide-in animation** — `ytQueueOverlay` appears/disappears via class toggle with no transition. Add `transform: translateX(100%)` → `translateX(0)` slide on `.show`. | Lack of motion makes the drawer feel like a glitch, not a panel. | 🔥 High | 🟢 Low |
| V-U3 | **Card thumbnail progressive blur-to-image load** — apply a blurred placeholder (`filter: blur(20px)`) on `<img class="yt-card-thumb">` before the full image resolves; clear on `onload`. | Prevents layout jump and blank tiles during slow connections. | 🟡 Medium | 🟢 Low |
| V-U4 | **Active queue item "now playing" animated bar** — in `ytQueueList`, show a mini 3-bar animated equalizer icon (like Spotify's) next to the currently playing queue item. | No visual link between the queue drawer and what's actually playing. | 🔥 High | 🟡 Medium |
| V-U5 | **Favs Hub grid masonry layout** — replace the current CSS grid (fixed aspect ratio) with a multi-column masonry layout for the Hub to better accommodate landscape vs portrait thumbnails. | Hub cards are cropped inconsistently; masonry respects natural aspect ratios. | 🟡 Medium | 🟡 Medium |
| V-U6 | **Video mode tab indicator glow pulse** — when a video is playing, `btnModeToggle` should pulse a soft glow in `--accent` color to indicate live video state. | Currently `yt-mode-active` CSS class only changes the icon; no ambient signal. | 🟡 Medium | 🟢 Low |
| V-U7 | **Search input hybrid suggestions dropdown** — upgrade dropdown to a Hybrid Discovery Engine showing Recents (top 3) + Autocomplete (middle 3) + Smart Similar & Related artists/genres (bottom 3) with dynamic query-matching. | 3 entries feel sparse; smart suggestions drive proactive, tap-only video/genre discovery. | 🔥 High | 🟡 Medium |
| V-U8 | **"Audio Only" mode animated waveform placeholder** — upgrade the flat `yt-audio-only-placeholder` to a gradient waveform animation (CSS bars) synchronized with the YouTube player's `onStateChange` playing/paused state. | Flat placeholder is visually dead; animated waveform signals audio activity. | 🟡 Medium | 🟡 Medium |
| V-U9 | **Queue header "playing X of Y" progress indicator** — add `[3 / 12]` counter to `ytQueueCount` and a thin progress bar below the queue header showing playlist advancement. | Users have no sense of how far through a playlist they are. | 🔥 High | 🟢 Low |
| V-U10 | **Card actions micro-animation on fav toggle** — when user taps the heart on a YT card, animate with a scale-up + color fill (`transform: scale(1.4)` → `scale(1)`) to confirm the action. | Current toggle is instant state flip with no animation; heart tap feels unresponsive. | 🟡 Medium | 🟢 Low |
| V-U11 | **NP panel ambient favicon glow** — apply the radio-mode ambient glow logic to YouTube video thumbnails when in Video mode. | Consistency with Radio mode immersive aesthetic. | 🔥 High | 🟢 Low |
| V-U12 | **Playing card panel ambient favicon glow** — apply the ambient glow to the active YouTube video card in search results or the queue. | Consistency with Radio mode playing card aesthetic. | 🔥 High | 🟢 Low |

---

### 2.4 Downgrade Ideas
> Items to **remove or simplify** on the video side.

| # | Item | Why Remove/Simplify | Risk |
|---|------|---------------------|------|
| V-D1 | **`findToken()` recursive deep scan on full API response** — both `searchVideos.js` and `fetchPlaylist.js` use a recursive `findToken()` that walks the entire YouTube response tree. May accidentally match non-continuation tokens (ad renderers, shelf separators). | Replace with targeted path extraction using known stable continuation paths. | 🔴 High |
| V-D2 | **`findVideos()` and `findPlaylists()` recursive deep scan** — unbounded recursion walks the entire response; any renderer anywhere (ads, promoted, shelves) can be accidentally matched. | Add explicit renderer type allowlist and targeted `sectionListRenderer` path traversal. | 🔴 High |
| V-D3 | **`renderYtQueueTab()` dead code function** — renders to `#ytQueue` which doesn't exist in `index.html`; the active queue renders to `ytQueueList` inside `ytQueueOverlay` via `renderYtQueue()`. | Remove entirely; ghost from a prior queue architecture. | 🟢 Low |
| V-D4 | **`sparkyYtState.originalQueue` is declared but never used** — defined alongside `currentQueue` and `temporaryQueue` at line 3170 but no function reads or writes it. | Remove dead state property to prevent confusion. | 🟢 Low |
| V-D5 | **`lastCinemaTriggerTime` variable used but never declared** — referenced in `toggleCinemaMode()` and `resetCinemaTimer()` but no `let` declaration exists; runs as an implicit global. | Strict mode will throw; implicit globals are fragile. Declare explicitly. | 🟡 Medium |
| V-D6 | **Console noise in production from YT module** — `fetchNextYtPage`, `processYtPage`, `prefetchNextYtPage`, and `hydrateYtQueueTags` each emit multiple `console.log` calls per request. 50-video hydration = 50+ console lines. | Gate all `[YT]`-prefixed logs behind a `SPARKY_YT_DEBUG` flag or strip via Vite `define`. | 🟢 Low |
| V-D7 | **Queue overlay HTML nested inside `#yt-view`** — `ytQueueOverlay` is inside `#yt-view`, which is hidden in radio mode; any cross-mode access to the queue will fail silently. | Move overlay to `#sparky-yt-player-wrap` or top-level `.app` sibling for cross-mode access. | 🟡 Medium |

---

## 🔖 Priority Summary

### ⚡ Quick Wins — Low Effort, High Impact
- **R-O1** Deduplicate `loadFavs()` calls
- **R-O3** Debounce `backgroundSyncFavs`
- **R-E1** Keyboard shortcuts for transport
- **R-E5** Batch favorites sync (one API call vs. serial loop)
- **R-U1** NP panel ambient favicon glow
- **R-U4** Station card hover ripple
- **V-E5** Playback speed control (1 line: `setPlaybackRate`)
- **V-E6** Loop single video mode
- **V-E9** Keyboard shortcuts for video mode
- **V-U2** Queue drawer slide-in animation
- **V-U9** "X of Y" queue progress indicator
- **V-D3** Remove dead `renderYtQueueTab()`
- **V-D4** Remove unused `originalQueue` state
- **V-D5** Declare `lastCinemaTriggerTime`
- **V-O7** Extract shared `shortenMetadata()` to `api/utils.js`
- **V-U11** NP panel ambient favicon glow (Video)
- **V-U12** Playing card panel ambient favicon glow (Video)

### 🎯 Strategic — High Impact, Medium Effort

- **R-E4** Auto-resume on network reconnect
- **R-U6** Collapsible mini-player on scroll
- **R-U5** Favorites grid card gradient art **(Completed - Commit 86dcf80)**
- **V-O1** Innertube singleton across API handlers
- **V-O2** Full-queue server-side hydration
- **V-O5** Prefetch race condition fix
- **V-O6** Cancel stale requests on new search
- **V-E4** Related videos sidebar
- **V-U4** Active queue item now-playing bar
- **V-U7** Hybrid search suggestions dropdown
- **R-E11** Native Google Cast SDK integration (Radio Only)

### 🏗️ Architectural — Must Plan Carefully
- **R-O2** Targeted DOM patching (replace innerHTML redraws)
- **R-O6** Virtualized station list (windowed scroll)
- **V-D1** Replace recursive `findToken()` with targeted paths
- **V-D2** Replace recursive renderer scanners with allowlisted paths

---

## 📋 Implementation Tracker (Mobile/Tablet Focused)

**Phase 1: Quick Wins** *(Updates 1-4 deployed for testing)*
- [9dc2f90] **[Radio - Optimization]** Deduplicate `loadFavs()` calls (R-O1)
- [df0ea5f] **[Radio - Optimization]** Debounce `backgroundSyncFavs` (R-O3)
- [d0040a7] **[Radio - Enhancement]** Batch favorites sync (R-E5)
- [dfc132f] **[Radio - UI Upgrade]** NP panel ambient favicon glow (R-U1)
*(Updates 5 (skipped) and 6-7 deployed for testing)*
- [Skipped] **[Video - Enhancement]** Playback speed control (V-E5)
- [80fee74] **[Video - Enhancement]** Loop single video mode (V-E6)
- [2f19b1c] **[Video - UI Upgrade]** Queue drawer slide-in animation (V-U2)
*(Updates 8-13 deployed for testing)*
- [6b0d119] **[Video - UI Upgrade]** "X of Y" queue progress indicator (V-U9)
- [0550c1b] **[Video - Downgrade]** Remove dead `renderYtQueueTab()` (V-D3)
- [0550c1b] **[Video - Downgrade]** Remove unused `originalQueue` state (V-D4)
- [0550c1b] **[Video - Downgrade]** Declare `lastCinemaTriggerTime` (V-D5)
- [0550c1b] **[Video - Optimization]** Extract shared `shortenMetadata()` (V-O7)
- [b8143c5] **[Radio - UI Upgrade]** playing card panel ambient favicon glow (R-U2)
*(Updates 14-15 deployed for testing)*
- [aa192d9] **[Video - UI Upgrade]** NP panel ambient favicon glow (V-U11)
- [aa192d9] **[Video - UI Upgrade]** playing card panel ambient favicon glow (V-U12)


**Phase 2: Strategic**
- [Removed] **[Radio - Enhancement]** Station stream health indicator (R-E2) - removed due to passive ping CORS/method incompatibilities
- [a1c9b2f] **[Radio - Enhancement]** Auto-resume on network reconnect (R-E4)
- [1bdcb84] **[Radio - UI Upgrade]** Collapsible mini-player on scroll (R-U6)
- [86dcf80] **[Radio - UI Upgrade]** Favorites grid card gradient art (R-U5)
- [0477b38] **[Video - Optimization]** Innertube singleton across API handlers (V-O1)
- [e921efa] **[Video - Optimization]** Full-queue server-side hydration (V-O2)
- [d4a2fd7] **[Video - Optimization]** Prefetch race condition fix (V-O5)
- [d4a2fd7] **[Video - Optimization]** Cancel stale requests on new search (V-O6)
- [8d2efc5] **[Video - Enhancement]** Related videos sidebar (V-E4)
- [Skipped] **[Video - UI Upgrade]** Active queue item now-playing bar (V-U4) - skipped; active card highlight and ambient favicon glow already satisfy this requirement
- [28f81ef] **[Video - UI Upgrade]** Hybrid search suggestions dropdown (V-U7)
- [1a696fb] **[Radio - Enhancement]** Native Google Cast SDK integration (R-E11) *(Restricted to Radio Mode)*
- [608182a] **[Radio - Enhancement]** Persistent recent search history & hybrid Favorites discovery dropdown (R-E12)

**Phase 3: Architectural**
- [55932d7] **[Radio - Optimization]** Targeted DOM patching (R-O2)
- [cc264ec] **[Radio - Optimization]** Virtualized station list (R-O6)
- [e921efa] **[Video - Downgrade]** Replace recursive `findToken()` (V-D1)
- [d1ea0d4] **[Video - Downgrade]** Replace recursive renderer scanners (V-D2)

---

*End of PRD — Sparky Radio Upgrades v1.0*
