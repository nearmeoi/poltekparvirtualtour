# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server at http://localhost:5173 (binds 0.0.0.0, accessible on LAN)
npm run build    # Production build (tree-shakes AdminPanel/HotspotEditor)
npm run preview  # Preview the production build locally
```

No test runner is configured. There is no linter configured either — code style is inferred from existing files.

**Testing on mobile during dev:** The dev server binds to `0.0.0.0`, so you can hit `http://<your-LAN-IP>:5173` from a phone. Append `?cardboard=true` to the URL to force Cardboard/stereo mode on any device (useful for testing iOS VR path on a desktop browser).

## Architecture Overview

### Entry Point & App Class

`src/main.js` contains a single `App` class that owns the entire application. It initialises sub-systems in a fixed order (renderer → camera/controls → scene → components → WebXR/Cardboard → input/landing → render loop). All cross-component communication goes through `this.bus` (an `EventBus` instance).

### EventBus Events

The EventBus (`src/core/EventBus.js`) is the backbone for decoupled communication. Key events:

| Event | Emitted by | Consumed by |
|---|---|---|
| `vr:entered` `{ mode, isStereoscopic, ipd }` | `main.js` | `main.js`, `GazeController` |
| `vr:exited` | `main.js` | `main.js` |
| `scene:change` `{ hotspots }` | `PanoramaViewer` | `HotspotManager` |
| `scene:loaded` `{ sceneId, sceneData }` | `PanoramaViewer` | (general) |
| `hotspot:click` `{ data }` | `HotspotManager` | `main.js` → `PanoramaViewer.navigateToScene(data.target)` |
| `admin:hotspot-save` `{ hotspots }` | `AdminPanel` | `HotspotManager` |

### VR Strategy — Platform Decision Tree

`initWebXR()` in `main.js` decides the VR path at startup:

1. **No `navigator.xr`** → Cardboard fallback (`CardboardModeManager`)
2. **`navigator.xr` present but `immersive-vr` not supported** → Cardboard fallback
3. **`immersive-vr` supported** → Native WebXR (`_setupWebXR`)

iOS never has native WebXR; `src/utils/initPolyfill.js` (imported first in `main.js`) installs `webxr-polyfill` only for iOS and `?cardboard=true` URLs. Android Chrome 79+ uses native WebXR without polyfill.

**Cardboard path** (`src/components/vr/CardboardModeManager.js`):
- Wraps `StereoEffect` for split-screen rendering
- `GyroscopeControls` is enabled only after the first real (non-zero) sensor event sets `gotAnyData = true` — this guards against stuck-zero sensor events snapping the camera
- `VROverlay` (`src/components/vr/VROverlay.js`) handles the step-by-step onboarding (sensor permission → orientation → fullscreen swipe) before `startVRSession()` is called

### Data Flow: Panorama Scenes

Tour data lives in two places:
- `src/data/tourData.js` — hardcoded top-level venue list (Museum Kota, La Galigo, Pantai Losari)
- `src/data/tours/*.json` — per-tour scene arrays, lazy-loaded via `DataService` (`import.meta.glob`)
- `src/data/sceneMap.js` — auto-generated mapping from Pano2VR IDs (`panorama_XXXX`) to local asset paths

Hotspots are stored in `localStorage` keyed by `hotspots_<sceneId>` (written by `AdminPersistence`). When a scene loads, `PanoramaViewer` reads from localStorage first; if absent, falls back to the JSON data.

### Admin Panel

Available **only in dev mode** (`import.meta.env.PROD` gates the lazy import). Access it via `window.adminPanel` in the browser console. The panel saves hotspot edits to `localStorage`; use its Export button to get a JSON file for committing.

The admin system is split across:
- `AdminPanel` — UI shell and keyboard shortcuts (`src/components/admin/AdminPanel.js`)
- `AdminFormBuilder` — form rendering helpers
- `AdminStateManager` — undo/redo stack
- `AdminPersistence` — localStorage read/write + JSON export/import

### Key Utilities

- `src/utils/deviceDetection.js` — `isIOS()`, `isAndroid()`, `isMobile()`, `hasGyroscope()`, `isCardboardForced()`. **Always use these instead of raw UA sniffing.**
- `src/utils/FullscreenHelper.js` — cross-browser fullscreen request/exit/lock. All methods are `async`; always `await` them.
- `src/config.js` — all magic numbers (FOV, timing, geometry sizes, gaze thresholds). Centralised here; do not hardcode values inline.
- `src/utils/CanvasUI.js` — helpers for drawing buttons and textures onto `<canvas>` elements used as Three.js `CanvasTexture` materials.

### Render Loop

`renderer.setAnimationLoop(this.render.bind(this))` drives everything. In Cardboard mode, `CardboardModeManager.render(scene, camera)` is called instead of the standard `renderer.render`. In WebXR mode, Three.js WebXRManager handles the per-eye rendering automatically.

### Gyroscope Guard (important)

`GyroscopeControls.gotAnyData` starts `false` and only becomes `true` after at least one deviceorientation event with a non-zero axis (`Math.abs > 0.0001`). `CardboardModeManager.update()` checks this flag before calling `gyroscopeControls.update()`. This prevents stuck-zero sensor events from overwriting the camera quaternion on startup.
