# Sparky Radio ELITE - Development Roadmap

## 🔵 FUTURE: Integration of Features from R1-Launch-Pad
**Reference**: `C:\Users\palom\Vibe Coding Apps\r1-launch-pad`
**Goal**: Analyze the source project (where our Theme Logic originated) to adapt another "very great enhancement" to Sparky Radio's industrial framework.



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

---

## Industrial Responsive Logic (v2.33.0)

### 1. Hybrid Dynamic-Proportional System
The UI utilizes a "Gear-Shift" architecture that adapts to hardware width while maintaining proportional visual weights.

### 2. Dynamic Column Tiers (Width-Driven)
The grid automatically adjusts column counts based on the viewport width:
*   **Mobile (<480px)**: 3 Columns. (Updated for higher density testing)
*   **Wide Phone (481px - 699px)**: 3 Columns.
*   **Tablet/Fold5 (700px - 999px)**: 4 Columns.
*   **Desktop (>1000px)**: Auto-Fill Fluid Grid (Dynamic 5+ Columns).

### 3. Proportional Card Multiplier (Height-Driven)
Card height is mathematically tied to width to ensure industrial consistency:
*   **Mobile Aspect Multiplier**: 1.5. (Stretched vertically to support 3-column text wrapping).
*   **Desktop Aspect Multiplier**: 1.35.
*   **Note**: Aspect ratios are strictly enforced via CSS to prevent UI ghosting or clipping during multi-line station name wraps.

### 4. Vertical Flex-Grow Strategy
*   The Discovery Hub uses flex: 1 to consume all available vertical space between the Now Playing header and the footer.
*   Legacy height constraints (max-height: 320px) have been purged to allow full vertical immersion on tablets.
