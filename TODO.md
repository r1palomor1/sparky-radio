# Sparky Radio ELITE - Development Roadmap

## 🔴 HIGH PRIORITY: The Mobile Metadata Gap
**Issue**: Favorites saved on mobile devices as "Legacy Records" (pre-UUID system) are failing to sync live telemetry (Votes, Clicks, Momentum) even after URL-Rescue grafting.

### 🧪 What we have tried:
1.  **URL-Signature Match**: Implemented `norm(url)` comparison to link legacy records to global IDs.
2.  **ID Grafting**: Added logic to `syncFavMetadata` to write missing UUIDs into local storage records during playback or discovery.
3.  **Hiding Bitrate**: Purged legacy DOM references that were causing `TypeErrors` and stalling playback.

### 🔍 Current Theory:
*   **CORS/API Block**: Mobile browsers may be silently blocking the metadata refresh calls during background sync.
*   **Storage Collision**: Potential discrepancy in how mobile Safari/Chrome handles the JSON serialization of the `sparky_favorites` object.

---

## 🛠️ UPCOMING: The "Pro-Debugger" Module
**Goal**: provide a way to see real-time console feedback on mobile devices without an inspector.

### Requirements:
- [ ] **Settings UI**: Add a "Gear" icon to the header.
- [ ] **Debug Console Overlay**: A toggleable visual terminal on top of the UI.
- [ ] **Log Export**: One-tap "Copy Logs" button to send data back to Antigravity.
- [ ] **ID Audit**: Add a "Check Record Integrity" button to reveal which stations are missing UUIDs.

---

## 💅 UI/UX Refinement
- [ ] **Vertical Bracket Fine-tuning**: Polishing the spacing for the ▲/▼ arrows on ultra-wide screens.
- [ ] **Search Mirror Feedback**: Add a small indicator showing which Radio Browser mirror is currently active.
