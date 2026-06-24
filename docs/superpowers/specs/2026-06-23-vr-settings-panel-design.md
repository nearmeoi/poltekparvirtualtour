# VR Settings / Calibration Panel — Design

Date: 2026-06-23
Status: approved, implementing

## Problem

Native-WebXR and Cardboard VR show a double/ghosted image on Android. Debugging
requires changing values (IPD, FOV, reticle, panorama distance) and re-testing on
a real device — currently a slow code → push → reload loop. We want an on-device,
pre-experience **Settings panel** so the user can calibrate values themselves in
one session, with no code round-trips, and bake the result into `config.js`.

## Approach (chosen: Option A — live tuning, pre-experience menu)

A flat HTML Settings overlay reached from the landing screen (a **⚙ Settings**
button below **Start Experience**). Flat DOM is used because it works on every
device and is set *before* entering VR (DOM is invisible inside immersive WebXR
and untouchable inside a sealed Cardboard viewer).

## Components (small, isolated)

- `src/utils/SettingsStore.js`
  - Loads overrides from `localStorage` (key `vrSettings`) and **merges into
    `CONFIG`** at startup, before the scene is built.
  - `get(path)`, `set(path, value)` (dot-path into CONFIG, e.g. `gaze.reticleSize`).
  - `set()` persists to localStorage and calls an `apply` hook so live objects
    update immediately (reticle, panorama sphere) when they exist.
  - `reset()` clears overrides. `exportSnippet()` returns a `config.js`-style string.
- `src/components/ui/SettingsPanel.js`
  - Builds the overlay from a declarative schema (one row per knob: label, CONFIG
    path, min/max/step, group, `modes` it affects).
  - Shows device detection at top and greys/annotates knobs not active in the
    detected mode. Buttons: Reset, Copy values, Done.
- Hooks:
  - `LandingScreen`: add Settings button + open handler.
  - App startup: `SettingsStore.load()` before `initCamera`/`initControls`/components.
  - `index.html`: add `#open-settings-btn` under `#enter-vr-btn`.

## Device detection

Uses `deviceDetection.js` (isIOS/isAndroid/isMobile) + async
`navigator.xr?.isSessionSupported('immersive-vr')`. Resolves active mode:
**Native WebXR**, **Cardboard**, or **Magic-window**. Displayed in the panel and
used for the per-knob "active/no-effect" labels.

## Knobs (schema)

| Label | CONFIG path | range/step | active modes |
|---|---|---|---|
| Reticle size | `gaze.reticleSize` | 0.002–0.03 / 0.001 | all |
| Reticle distance | `gaze.reticleDistance` | 0.5–5 / 0.1 | all |
| Dwell time (s) | `gaze.activationTime` | 0.5–4 / 0.1 | all |
| Eye separation (IPD) | `vr.cardboardIPD` | 0.04–0.09 / 0.001 | cardboard |
| VR field of view | `fov.vr` | 30–110 / 1 | cardboard, magic-window |
| Panorama distance | `panorama.sphereRadius` | 20–500 / 5 | all |

## Live-apply mapping

- `gaze.*` → update `app.gazeController` reticle mesh (size/distance) + dwell field.
- `panorama.sphereRadius` → rebuild/scale `panoramaViewer.sphere` (scale is enough
  for visual distance; geometry radius read at creation).
- `vr.cardboardIPD` → read by Cardboard `StereoEffect` next render (no rebuild).
- `fov.vr` → applied on next VR enter; if currently magic-window, update camera fov.

## Behavior

- Live + persisted; values survive reload.
- Loop: open Settings → adjust → Start → enter VR → look → exit → adjust.
- "Copy values" → clipboard `config.js` snippet to commit as the new default.

## Out of scope (YAGNI)

- 3D in-headset gaze-driven settings panel (build later only if the flat loop is
  too slow).
- Any knob beyond the six above.

## Caveat / diagnostic value

The existing in-XR "VR FIX" re-centers the panorama on the camera each frame, so
**Panorama distance may not move the double-vision**. If it does, that proves the
VR FIX isn't behaving — a useful signal either way.
