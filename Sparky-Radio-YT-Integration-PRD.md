# Sparky Radio YouTube Integration PRD

## 1. Analysis Summary
After a thorough review of the `r1-launch-pad` repository, we have identified the key mechanisms and architectural patterns for YouTube integration. The launch pad utilizes a hybrid approach:
- **Playlists** are fetched via a Vercel serverless function (`/api/fetchPlaylist.js`), which relies on the `youtubei.js` library to extract playlist metadata and video items without an official API key.
- **Videos** and searches are currently routed through native Rabbit OS hooks (`PluginMessageHandler`). **Since Sparky Radio is a standalone PWA, this native hook is a critical gap and MUST be replaced.**
- **Player Embedding** uses the standard YouTube Iframe API (`YT.Player`) with specific `playerVars` to control playback (`playsinline: 1, modestbranding: 1, rel: 0`).
- **State Management** heavily relies on synchronous `localStorage` updates paired with in-memory arrays (e.g., `savedPlaylists`, `currentPlaylist`).
v
**Recommendations:**
- **Standardize API Access:** Expand the Vercel API endpoint (or create a new Cloudflare Worker/Vercel endpoint for Sparky) to handle *both* video searches and playlist fetching, entirely removing the dependency on `PluginMessageHandler`.
- **Decoupled Data Store:** Migrate `launchPadR1*` storage keys to `sparky_yt_*` keys to ensure Radio and Video states remain completely independent.
- **Player Lifecycle:** Implement a lazy-loaded, single-instance YouTube iframe. When toggling back to Radio mode, the YouTube iframe should be suspended or destroyed to prevent audio overlap and conserve memory.

## 2. Goals & User Flows
The primary goal is to seamlessly integrate a dedicated "Video Mode" into Sparky Radio without disrupting the existing "Radio Mode."

- **Mode Toggle:** A footer icon (using Google Fonts icons) will seamlessly toggle between Radio Mode and Video Mode.
- **Independent Ecosystem:** Video mode has its own search logic, play queue, favorites (Video Hub), and history.
- **Search & Play:** Users can search for Songs or Playlists. Clicking a card initiates playback via an injected YouTube iframe in the Now Playing area.
- **Favorites Hub:** Users can save videos or playlists to their Video Favorites.

## 3. Data Models & State Handling
We will port the in-memory array structures from `r1-launch-pad` to Sparky Radio using `localStorage`.

**LocalStorage Keys:**
- `sparky_yt_favorites`: Array of saved items (`{ id, type: 'video'|'playlist', title, thumb, addedAt }`).
- `sparky_yt_history`: Array of recently played items.
- `sparky_yt_lastSearch`: Cached search term and results.

**In-Memory State:**
```javascript
let sparkyYtState = {
    isModeActive: false,
    playerInstance: null,
    currentQueue: [], // For playlists
    queueIndex: 0,
    searchCache: { query: '', results: [] }
};
```

## 4. UI/DOM Structure
The UI components will leverage DOM injection templates similar to Sparky's existing architecture.

**Key Templates:**
- **Mode Toggle Button:** Footer action button to switch context.
- **Video Search/Hub View:** Replaces the Radio Stations list when in Video mode.
- **Video Player Container:** Injected into the Now Playing area.

```html
<!-- Injected Video Container (Hidden in Radio Mode) -->
<div id="sparky-yt-container" class="hidden">
    <div id="sparky-yt-player"></div>
    <div class="yt-controls">
        <button id="yt-prev-btn" class="icon-btn">...</button>
        <button id="yt-play-btn" class="icon-btn">...</button>
        <button id="yt-next-btn" class="icon-btn">...</button>
    </div>
</div>
```

## 5. Engineering Tasks & Implementation Details

### Priority 0: Safe Development Environment
- **Task:** Create and utilize an isolated Git branch (e.g., `feature/youtube-integration`). All development must happen on this branch to ensure the `main` production environment remains untouched and stable during development.

### Priority 1: Mode Switcher & DOM Scaffolding
- **Task:** Implement the footer toggle button. When activated, hide the Radio DOM elements and reveal the Video DOM elements.
- **Code Snippet (Context Switching):**
  ```javascript
  function toggleYtMode(activate) {
      sparkyYtState.isModeActive = activate;
      document.getElementById('radio-view').classList.toggle('hidden', activate);
      document.getElementById('yt-view').classList.toggle('hidden', !activate);
      if (activate && !window.YT) loadYtIframeApi();
  }
  ```

### Priority 2: Player Integration
- **Task:** Port the `openPlayerView` logic. Initialize `YT.Player` inside the `sparky-yt-player` div.
- **Code Snippet (Player Setup from Repo):**
  ```javascript
  player = new YT.Player('sparky-yt-player', {
      height: '100%',
      width: '100%',
      videoId: options.videoId,
      playerVars: {
          'playsinline': 1, 'controls': 1, 'autoplay': 1,
          'rel': 0, 'modestbranding': 1, 'showinfo': 0
      },
      events: { 'onStateChange': onYtStateChange }
  });
  ```

### Priority 3: API & Search Replacement
- **Task:** **Critically important:** Replace the `PluginMessageHandler` from `r1-launch-pad` with an external `fetch()` call to a backend proxy or official YouTube Data API, since Sparky Radio operates purely in-browser.

### Priority 4: Playlist Engine
- **Task:** Implement the manual playlist queue logic (ported from `playNextVideoInList` / `loadVideoFromPlaylist`).

## 6. Proposed Enhancements

- **Lazy Loading Iframe:** Do not inject the YouTube API script until the user explicitly toggles to Video mode for the first time. This significantly reduces initial PWA load time.
- **Serverless Search Proxy:** Since `r1-launch-pad` uses `PluginMessageHandler` for search, build a `/api/search` Vercel function alongside `/api/fetchPlaylist` to securely handle YouTube Data API requests without exposing keys on the frontend.
- **Audio Overlap Prevention:** Automatically pause the HTML5 Audio element (Radio) when the YouTube iframe begins playing, and vice-versa.
- **Offline Resilience:** While YouTube embeds cannot play offline, the Video Hub (favorites) metadata should be fully cached via the PWA service worker so the UI doesn't break when offline.

## 7. Acceptance Criteria (AC) & Testing
- **AC1 (PWA & Mobile):** The YouTube iframe must render correctly on iOS/Android, responding to CSS flex/grid rules without causing vertical scrolling overflow.
- **AC2 (Persistence):** Favoriting a video must successfully save to `sparky_yt_favorites` in LocalStorage, surviving hard refreshes and app closure.
- **AC3 (Separation of Concerns):** Playing a video must not alter the last played Radio station state. Toggling back to Radio should recall the exact Radio UI state.
- **AC4 (Performance):** The addition of the YouTube API script must not negatively impact Lighthouse performance scores for users who only use Radio mode.

## 8. Detailed Phased Execution Plan
*This section provides a highly detailed, step-by-step roadmap. Each phase (and its sub-tasks) is designed to be executed, tested, and reviewed independently. This ensures a safe, iterative workflow and allows seamless handoff between AI agents if quota limits are reached.*

### ✅ Phase 1: Environment Setup & API Foundation — COMPLETE
**Objective:** Secure the production environment and establish backend infrastructure.
* ✅ **Task 1.1: Secure `main` Branch:** Committed orphaned `TODO.md` and `Sparky-Radio-YT-Integration-PRD.md` to main, cleaned working directory.
* ✅ **Task 1.2: Branching:** Created and pushed `feature/youtube-integration` branch. All YT work isolated here.
* ✅ **Task 1.3: Vercel API Expansion:** Created `api/fetchPlaylist.js` (playlist search + fetch by ID) and `api/searchVideos.js` (video search, replaces `PluginMessageHandler`). Both use `youtubei.js` keyless access. Added `vercel.json` with Node runtime config.
* ✅ **Fix: Node version pinned** to `22.x` via `engines` field in `package.json`.
* ✅ **Fix: `"type": "module"`** added to `package.json` to resolve `FUNCTION_INVOCATION_FAILED` crash on ES module imports.
* ✅ **Review Gate 1 PASSED:** All 3 API endpoints tested and returning correct JSON from live Vercel deployment.

### ✅ Phase 2: DOM Scaffolding & State Toggling — COMPLETE
**Objective:** Build the UI skeleton and the context-switching logic without loading the YouTube API yet.
* ✅ **Task 2.1: DOM Injection:** Added HTML for YT Search Input (`#ytSearchInput`), Video Results Container (`#ytResults`), Video Hub (`#ytHub`), and hidden YouTube Player wrapper (`#sparky-yt-player-wrap`) inside the now-playing zone.
* ✅ **Task 2.2: Footer Integration:** Converted the static radio branding `div` into a live `<button id="btnModeToggle">` that toggles between `radio` and `smart_display` icons with accent glow on active state.
* ✅ **Task 2.3: State Manager:** Implemented `sparkyYtState`, `toggleYtMode()`, `switchYtTab()`, `renderYtHub()`, and localStorage keys (`sparky_yt_favorites`, `sparky_yt_history`). Mode persists across hard refreshes.
* ✅ **Fix: `#radio-view` flex containment** — added `flex:1; min-height:0; overflow:hidden` to prevent station list growth from pushing footer off screen.
* ✅ **Fix: YT player wrap placement** — moved inside `.now-playing` div (was orphaned outside, breaking flex layout).
* ✅ **Fix: JS syntax error** — removed duplicated `if (restoredCount > 0)` block that caused `npm run build` to fail.
* ✅ **Build:** `npm run build` passes clean (`Exit code: 0`).
* ✅ **Review Gate 2 PASSED:** Footer permanently visible. Mode toggle switches Radio ↔ Video. All 3 sub-tabs (Videos/Playlists/Hub) functional. Radio mode fully preserved.

### ✅ Phase 3: Search, Player, & Audio Overlap — COMPLETE
**Objective:** Connect the search UI to the API and implement the lazy-loaded player.
* ✅ **Task 3.1: Search Implementation:** Wired the search input button to call `/api/searchVideos` (videos) or `/api/fetchPlaylist` (playlists). Map JSON response to `.yt-card` DOM elements.
* ✅ **Task 3.2: Lazy Player Loading:** Implemented `loadYtIframeApi` and `createYtPlayer` triggered only when user clicks play.
* ✅ **Task 3.3: Audio Overlap Prevention:** Implemented logic to automatically pause Radio playback when YouTube starts, and sync play/pause states across both modes.
* ✅ **Review Gate 3 PASSED:** Search works, player loads on demand, and radio correctly yields to video audio.

### ✅ Phase 4: Playlists & Video Hub (Favorites) — COMPLETE
**Objective:** Port the playlist engine and finalize persistence.
* ✅ **Task 4.1: Playlist Engine:** Implemented the "crack open" logic for playlists. Clicking a playlist now fetches its video array, populates a manual queue, and enables sequential autoplay/navigation with UI sync.
* ✅ **Task 4.2: Favorites Logic:** Switched to Trashbin icon workflow for Hub management. Implemented `addYtFav`/`removeYtFav` with custom `sparkyConfirm` modal for deletions.
* ✅ **Task 4.3: Video Hub Render:** Implemented responsive Hub rendering that persists across sessions and supports direct playback from saved items.
* ✅ **Review Gate 4 PASSED:** Playlists sync perfectly with footer controls. Favorites persist and delete safely with custom confirmation. Project is feature-complete.

## 9. Pending Investigations & Known Issues
- **Direct ID Fetching (Backend):** Specific playlist IDs (e.g., `PLuoCQNABdBNv1LT8jW3WM0t3uFZX9zU37`) occasionally return "No playlist found" even when correctly parsed by the frontend.
    - **Status:** Logged for future backend proxy review (youtubei.js implementation).
    - **Note:** The frontend parser is confirmed working (correctly extracts and displays the ID in the search field).

