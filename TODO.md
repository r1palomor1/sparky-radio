# Sparky Radio ELITE - Development Roadmap

## 🔴 CRITICAL: Favicon Info Icon Refactor (RE-VISIT)
**Issue**: The "Info" icon guide in the Station Management modal is failing to trigger. We have tried three iterations (Alert, Hardened Event, Dedicated Modal) and it still fails to appear.
*   **Action**: Conduct a full structural audit of the Station Management modal's lifecycle to identify event shadowing or DOM detachment.
*   **Target**: First priority for next session.

## 🔵 FUTURE: Integration of Features from R1-Launch-Pad
**Reference**: `C:\Users\palom\Vibe Coding Apps\r1-launch-pad`
**Goal**: Analyze the source project (where our Theme Logic originated) to adapt another "very great enhancement" to Sparky Radio's industrial framework.

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
- [x] **Dynamic Deployment Signature**: Transitioned from manual `APP_VERSION` to cryptographic software fingerprinting (Build Hash + Auto-Timestamp).
