# Sparky Radio · UI Improvement PRD
**Status:** Draft v3 — Reordered by Implementation Sequence  
**Primary Target:** Mobile-first (touch-safe, no hover effects)

---

> [!NOTE]
> Items are now numbered **in the order they should be implemented** — not by complexity tier. Each phase can be executed as a single work session. Dependencies are noted inline so nothing blocks another item unexpectedly.

> [!IMPORTANT]
> **Constraints carried from v2:**
> - No hover-only interactions — touch-safe alternatives used throughout
> - Footer transport controls stay and become primary; top controls are the removal candidate
> - No two-column desktop layout (desktop is rarely used)

---

## PHASE 1 — Visual Momentum (CSS Only · No Risk · ~2 hrs total)
*All items in this phase are pure CSS. Nothing touches JS or HTML structure. Do them all in one session — the app will look dramatically different by the end.*

---

### 1. App Background — Ambient Gradient ⭐
**Goal:** Premium Look / Surprise  
The body is currently a flat color. A subtle radial gradient behind the app card transforms the first impression instantly.
- Dark mode: deep charcoal + subtle green aurora glow from center
- Light mode: soft warm cream gradient with vignette edges
- On mobile, the card fills most of the screen so the gradient frames it like a product

**Effort:** 30 min · CSS only  
**Dependency:** None — start here

---

### 2. Status Dot — Animated Pulse on "Connected" ⭐
**Goal:** Intuitive Rich UX / Premium Feel  
The green dot is static. A CSS keyframe pulse ring when `state = playing` tells the user the stream is live without reading any text. No interaction needed — works perfectly on touch.

**Effort:** 15 min · CSS only  
**Dependency:** None

---

### 3. Active Card — More Visually Distinct
**Goal:** Intuitive UX / Premium Look  
The playing card has a green sidebar but the card body blends into the list. Add a subtle green left-border glow + slightly elevated background to make "this is playing" unmistakable at a glance. Always visible — no hover needed.

**Effort:** 20 min · CSS only  
**Dependency:** None

---

### 4. Playlist Card — Tap Press State (replaces hover)
**Goal:** Premium Look / Tactile Feedback  
On mobile, there is no hover. Replace with a `:active` press state — a brief flash of the accent color on tap (slight scale-down + border flash). Gives physical feedback that the tap registered.

**Effort:** 20 min · CSS only  
**Dependency:** None

---

### 5. Index Number Sidebar — Consistent Width
**Goal:** Less Clutter  
The sidebar column (`28px`) is too narrow. Slightly wider (`32px`) with tighter letter-spacing gives the number room to breathe without adding card height.

**Effort:** 10 min · CSS only  
**Dependency:** None

---

### 6. "TRENDING" Badge — Refined Style ⭐
**Goal:** Premium Look  
The badge is a plain unstyled span. A proper pill shape with a subtle colored border will make it feel intentional rather than bolted on.

**Effort:** 20 min · CSS only  
**Dependency:** None

---

### 7. Duplicate URL Warning — Softer Treatment ⭐
**Goal:** Less Clutter / Less Alarming  
The `is-dup-fav` full orange card border + watermark text is aggressive for an informational state. Soften to a subtle amber left-border + small inline `⚠` icon. Less alarm, same information density.

**Effort:** 20 min · CSS only  
**Dependency:** None

---

## PHASE 2 — Transport & Controls Restructure (~3 hrs total)
*This phase makes the app feel cleaner and more intentional. Items 8 and 9 are tightly related — do them in the same session.*

---

### 8. Footer Redesign — Premium Transport Bar ⭐
**Goal:** Declutter / Premium UX / Premium Look  
The footer is now the primary transport. It deserves a premium redesign:
- Taller footer with more generous touch targets (min 48px button height)
- Prev / Play / Stop / Next as distinct, well-spaced icon+label buttons
- `+ ADD` and `⌫ REMOVE` grouped separately with clear visual weight difference from transport
- Subtle top border glow in accent color when a station is playing
- Should feel like a proper mobile player bar (Spotify-style bottom bar)

**Effort:** 2 hr · HTML + CSS  
**Dependency:** Do before Item 9 — redesign first, then remove the duplicate

---

### 9. Remove Top Controls Row — Footer Becomes Sole Transport
**Goal:** Declutter  
There are two full sets of transport controls. Footer won the UX test — it stays. The top controls row (Prev/Play/Stop/Next in the header controls section) is the removal candidate.

Benefits:
- Eliminates the duplication
- Reclaims vertical space — playlist gets taller
- Pushes all transport to the thumb-reachable zone on mobile

**Effort:** 45 min · HTML + JS binding cleanup + CSS  
**Dependency:** Requires Item 8 first — footer must be premium before top is removed

---

### 10. Volume Slider — Premium Styling
**Goal:** Declutter / Premium Look  
The browser-default range input breaks the industrial aesthetic. Custom styling:
- Thin colored fill track
- Thumb sized for touch (min 44px touch target)
- Accent glow on `:active` press (touch-safe)
- No JS change required

**Effort:** 30 min · CSS only  
**Dependency:** None — can be done anytime in Phase 2

---

### 11. Timestamp Format — Settings Modal
**Goal:** Premium Feel  
`As of: 04/26 21:30` reads like a debug string. Format as `Apr 26, 2026 · 9:30 PM` using `Intl.DateTimeFormat`. Two lines of JS, no UI change.

**Effort:** 10 min · 2 lines of JS  
**Dependency:** None — quick win, drop it in during Phase 2

---

### 12. Light Theme — Color Palette Overhaul
**Goal:** Premium Look  
The current light theme is functional but generic (grey/blue). A warmer cream + deep navy palette would make it feel like an intentional design choice, not an inverted dark mode.
- CSS token overrides only — no JS or HTML changes
- Both themes should feel equally considered

**Effort:** 1 hr · CSS tokens only  
**Dependency:** Easier to finalize after Phase 1 gradient is done (so both themes look right together)

---

## PHASE 3 — Cards & Content Upgrade (~5 hrs total)
*This phase elevates the core content experience. Item 13 (favicons) should be done before Item 14 (card redesign) since the redesign depends on the favicon element existing.*

---

### 13. Station Card — Favicon / Logo Display ⭐
**Goal:** Premium Look / Rich UX  
Radio Browser API returns a `favicon` field for many stations. A small station logo (24px, with a generic radio icon fallback) makes the list scannable instantly — critical on mobile where reading is slower.
- `syncFavMetadata` already stores the favicon field
- Needs a small `<img>` in the card HTML with `onerror` fallback to radio icon

**Effort:** 1.5 hr · JS (renderStations + renderFavs) + CSS  
**Dependency:** Do before Item 14

---

### 14. Playlist Cards — Full Redesign (Touch-Optimized)
**Goal:** Premium Look / Rich UX / Less Clutter  
Current card layout: index | name | country·tags | power% | clicks | votes + action buttons — all crammed into a small card.

Redesigned layout:
- Favicon (left, 24px) | Name (primary, larger font) | Country+codec (right-aligned, subtle)
- Telemetry row (power%, clicks, votes) condensed below — hidden in COMPACT mode
- Edit/remove buttons: always visible, restyled as compact icon-only buttons with proper 44px touch targets (no hover tray — touch-first)
- Slightly taller cards for easier tap accuracy

**Effort:** 3 hr · JS (renderStations + renderFavs) + CSS  
**Dependency:** Item 13 (favicon) must be done first

---

### 15. Now Playing Section — Visual Hierarchy Upgrade
**Goal:** Premium Feel / Layout  
The now-playing ticker + meta badges zone is flat and cramped. Mobile-optimized improvements:
- Station name larger and bolder — the dominant element
- Meta badges condensed: primary only (🔥 clicks + 👍 votes) by default; secondary (trend, country, codec) only shown in FULL stats mode
- Slightly taller zone with more breathing room

**Effort:** 1.5 hr · CSS + minor HTML  
**Dependency:** Easier after Item 14 (cards) since the visual language will be established

---

### 16. Search Bar — Refined & Purposeful
**Goal:** Less Clutter / Intuitive UX  
The search area has no visual separation from the tabs and the filter row is cramped. Mobile-safe improvements:
- Distinct background band for the search row (groups it with tab bar visually)
- Better spacing and rhythm between Quick-Tune, CTRY, LANG, HI-FI, and List toggle
- All filter touch targets sized to min 32px height

**Effort:** 1 hr · HTML + CSS  
**Dependency:** None, but easier to finalize after card/now-playing work is settled

---

## PHASE 4 — Deep Redesign (When Ready · ~10 hrs total)
*These are the most impactful but also most involved changes. Each can be done independently.*

---

### 17. Glassmorphism Header & Now Playing ⭐
**Goal:** Premium Look / Surprise  
Apply a frosted-glass treatment (`backdrop-filter: blur`) to the header and now-playing section. Works on modern mobile browsers (iOS Safari, Chrome Android both fully support it).
- Requires the ambient gradient (Item 1) to be in place — the blur needs something behind it to blur
- Header becomes semi-translucent with blur
- Creates depth that feels genuinely premium on a phone screen

**Effort:** 2 hr · CSS only  
**Dependency:** Item 1 (ambient gradient) must be in place

---

### 18. Compact Mode — Collapse Now Playing Meta ⭐
**Goal:** Declutter  
Extend the existing `statsMode` toggle (FULL/COMPACT) to also collapse the meta badges in the now-playing zone. In COMPACT mode: only the station name ticker + status dot show. Clean and minimal for casual listening.

**Effort:** 2 hr · CSS + JS state  
**Dependency:** Item 15 (now playing redesign) should be done first

---

### 19. Mobile-First Layout Refinement ⭐
**Goal:** Layout Redesign / Mobile UX  
Optimize the single-column layout for mobile viewport:
- Dynamic playlist height — fills remaining viewport instead of fixed 170px
- App card fills more of mobile screen (reduce body padding on small screens)
- Safe-area padding for notched phones (`env(safe-area-inset-*)`)

**Effort:** 3–4 hr · CSS (viewport units + media queries)  
**Dependency:** Best done after Phase 3 so the card heights are finalized

---

### 20. Animated Waveform / Visualizer — Now Playing Zone ⭐
**Goal:** Premium Feel / Surprise  
The current visualizer (30px header bar) is easy to miss. A full-width subtle waveform in the now-playing zone — animated when playing, flat when idle — makes the playing state dramatic on a phone screen.
- Canvas-based bar visualizer or SVG wave path
- Makes the app feel like a real radio product

**Effort:** 3–4 hr · JS (Canvas/SVG) + CSS  
**Dependency:** Item 15 (now playing redesign) should be done first

---

### 21. State Persistence Engine ⭐
**Goal:** Premium Experience / Continuity  
The app should feel like a dedicated device. On reload, it must restore the exact state the user left:
- **Last Station Recovery:** Automatically restores the "Now Playing" metadata and audio identity.
- **Search Query Persistence:** Remembers the last search term (e.g., "Jazz" or "Rock") so the user doesn't have to re-type.
- **Zero-Default Logic:** If the search was cleared, it stays cleared (removes the hardcoded 'jazz' fetch).

**Effort:** 1 hr · JS (localStorage)  
**Dependency:** None — implemented during Phase 4 polish

---

### 22. EQ Focus Mode (Zero Distractions) ⭐
**Goal:** Declutter / Focused UX  
Opening the EQ should transform the app into a dedicated audio console.
- **Background Concealment:** Automatically hides the visualizer, ticker, and playlist when EQ is open.
- **Console Expansion:** The EQ rack expands to fill the primary viewport.
- **Visual Stability:** Eliminates vertical "push" jitter by temporarily removing other UI elements.

**Effort:** 1.5 hr · CSS + JS Toggle  
**Dependency:** Item 15.1 (EQ Stacking)

---

## Deferred / Out of Scope

| Item | Reason |
|---|---|
| Two-column desktop layout | Deprioritized — desktop rarely used, effort vs. benefit poor |
| Hover action tray on cards | Removed — not applicable on mobile/tablet |
| Keyboard shortcuts | Not relevant for mobile |
| Debug/Diagnostics modal | Developer tool — no redesign needed |
| PWA / offline | Infrastructure, not UI |

---

## Implementation Tracker

| # | Item | Phase | Status |
|---|---|---|---|
| 1 | Ambient Gradient | 1 | ✅ |
| 2 | Status Dot Pulse | 1 | ✅ |
| 3 | Active Card Glow | 1 | ✅ |
| 4 | Tap Press State | 1 | ✅ |
| 5 | Sidebar Width | 1 | ✅ |
| 6 | TRENDING Badge | 1 | ✅ |
| 7 | Duplicate Warning Softer | 1 | ✅ |
| 8 | Footer Premium Redesign | 2 | ✅ |
| 9 | Remove Top Controls | 2 | ✅ |
| 10 | Volume Slider | 2 | ✅ |
| 11 | Timestamp Format | 2 | ✅ |
| 12 | Light Theme Overhaul | 2 | ✅ |
| 13 | Favicon Display | 3 | ✅ |
| 14 | Card Full Redesign | 3 | ✅ |
| 15 | Now Playing Upgrade | 3 | ✅ |
| 15.1 | EQ Stacking & Logic | 3 | ✅ |
| 16 | Search Bar Refinement | 3 | ✅ |
| 16.1 | Quick-Tune Management | 3 | ✅ |
| 17 | Glassmorphism | 4 | ✅ |
| 17.5 | Visualizer Pro-Grade Optimization | 4 | ✅ |
| 18 | Compact Mode Extension (Standardized) | 4 | ✅ |
| 19 | Mobile Layout Refinement | 4 | ✅ |
| 20 | Visualizer Upgrade | 4 | ✅ |
| 21 | State Persistence Engine | 4 | ✅ |
| 22 | EQ Focus Mode | 4 | ✅ |
| 23 | UI Rhythm & Control Spacing | 4 | ✅ |
| 24 | Signal Fidelity Intelligence (HD Badges) | 4 | ✅ |

---

> [!IMPORTANT]
> Follow this working agreement for every implementation session to avoid losing work mid-stream.

### Rules
1. **One phase per conversation** — start a new chat for each phase. Fresh context window, clean handoff.
2. **Commit after every single item** — not after each phase. Git history is the receipt if a session ends unexpectedly.
3. **Update the tracker above** — mark items `✅` when committed and pushed. Any agent starting fresh reads this PRD first.
4. **No mid-phase context switching** — finish the current item before moving to the next, even if it feels small.

### How to Start Each Session
Open a new conversation and say:

> *"Starting Phase [X] of Sparky Radio UI PRD. Please read the PRD and check git log to confirm where we left off."*

The agent will:
- Read this PRD from its artifact path
- Run `git log --oneline -10` to confirm last committed item
- Cross-reference the tracker table to find the next `⬜` item
- Begin immediately

### Reference Paths
- **PRD (Master):** `c:\Users\palom\Vibe Coding Apps\Radio Internet Claude\sparky-radio\SPARKY_UI_PRD.md`
- **Repo:** `c:\Users\palom\Vibe Coding Apps\Radio Internet Claude\sparky-radio`

---

