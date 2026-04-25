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

## ✅ COMPLETED: Pro-Debugger & UI Modernization
- [x] **Smart-Tune Pro Engine**: Multi-metric power ranking and mirror fallback.
- [x] **Mirror Feedback**: Real-time display of active Radio Browser mirror (e.g., DE, NL).
- [x] **Pro-Debugger Module**: Integrated console overlay with real-time log trace.
- [x] **Audit Engine**: "Audit Vault" functionality for UUID integrity rescue.
- [x] **Log Export**: One-tap "Copy Logs" button for diagnostic feedback.
- [x] **Defaults Engine**: Persistent Country, Language, and HI-FI settings in Command Center.
- [x] **Compact Player Mode**: Collapsible lower rack to optimize screen real estate.
- [x] **Industrial-Beige**: Premium aesthetic overhaul with high-contrast palette.
