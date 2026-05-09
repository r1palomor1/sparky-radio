# Immersive Cinema Mode Architecture

## Feature Overview
The Immersive Cinema Mode provides a distraction-free viewing experience for YouTube playback. When a video is playing, after an 8-second delay (or via a manual toggle), the UI collapses non-essential components (headers, search bar, tabs, and queue lists) and vertically stretches the video iframe to fill the space above the global footer player controls.

## Initial Implementation Details
- CSS class `.immersive-cinema-mode` applies `display: none !important;` to `.header`, `#yt-view` (excluding the player container), and list wrappers.
- Flex layout forces `#sparky-yt-player-wrap` to expand globally across `.app`.
- Auto-timer (`cinemaModeTimer`) monitors 8 seconds of idle playback to engage.
- Global listeners (`click`, `mousemove`, `scroll`, `touchstart`) were mapped to dynamically wake up the original UI.

## The Bug
The UI would enter Cinema Mode and immediately revert back to standard layout. Several proven root causes drove this behavior:
1. **Ghost / Bubbled Clicks:** The massive DOM reflow caused by hiding core elements fired passive pointer events, which hit the `document.addEventListener('click')`, instantly executing `wakeFromCinemaMode()`.
2. **YouTube IFrame API Resize Conflict:** The vertical resize of the iframe triggered YouTube's internal layout engines to emit a micro-second `YT.PlayerState.PAUSED` signal. The app's `onYtStateChange` handler interpreted this pause as an explicit user pause-action and forced the UI to wake up.
3. **Infinite Timer Reset Loop:** The timer setup was bound to `['mousemove', 'scroll']`. The constant firing of `mousemove` inside the browser's passive event loop repeatedly destroyed and re-initialized the 8-second timer via `resetCinemaTimer()`, preventing it from ever reaching 8000ms.
4. **CSS Caching Nullification:** Aggressive CDN/Vite caching mechanisms caused browsers to entirely ignore the dynamically appended CSS rules for `.immersive-cinema-mode`, preventing the layout reflow from executing even when JS successfully attached the classes.

## The Fix
1. **Targeted Wake Events:** The global `click` listener was updated to explicitly ignore clicks targeting the fullscreen toggle button and the `.youtube-iframe-container` wrapper. Waking up now strictly requires tapping the background or global footer tools. 
2. **Debounce Buffer:** A timestamp (`lastCinemaTriggerTime`) is recorded when the mode engages. The `onYtStateChange` handler enforces a 1000ms debounce buffer against `PAUSED` states following the reflow, effectively discarding the iframe's fake structural ping.
3. **Removed Polling Listeners:** The `mousemove` target was removed entirely from the loop. The UI relies strictly on explicit interactions like clicks and intentional scrolls to dictate user presence, ensuring the timer execution operates stably.
4. **Inline Style Injection:** The Cinema Mode CSS rules were removed from `main.css` and injected directly into a `<style id="sparky-cinema-styles">` tag within the `<head>` of `index.html`. This bypasses external stylesheet caching and forces the browser to evaluate the layout overrides immediately.