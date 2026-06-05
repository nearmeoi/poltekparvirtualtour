# Design Spec: Zero-Origin Coordinate System

**Date:** 2026-06-05  
**Status:** Approved  
**Scope:** Coordinate system redesign — camera + all 3D elements moved to y=0

---

## Problem

The current codebase uses y=1.6 as the implicit "eye level" origin for the camera and all 3D elements. This value is hardcoded in multiple files. When entering WebXR mode, the XR system moves the camera to y≈0 (local reference space), causing elements still at y=1.6 to appear below eye level. Cardboard mode is affected similarly. Additionally, sub-elements like SubMenu items (y=0.7) and back buttons (y=0.5) are inconsistent with the main eye-level baseline.

---

## Goal

- **y=0 = eye level** — the universal reference point for camera and all scene elements
- All position values reference `CONFIG` constants — no hardcoded numbers in component files
- Both WebXR and Cardboard modes work correctly without any `adjustForVR()` y-shift logic
- Offsets between elements (e.g., sub-menu below orbital menu) stored in `CONFIG.layout.*` and default to 0, to be tuned during testing

---

## Design

### Core Principle

```
y = 0  →  eye level  →  camera, orbital menu, video player, panorama group
```

"Floor" is not represented in the scene. The panorama sphere is centered at origin (0,0,0); moving the camera from y=1.6 to y=0 changes the view by 1.6/100 units (sphere radius 100) — visually negligible.

---

### CONFIG Changes (`src/config.js`)

Replace `camera.eyeLevel: 1.6` with `camera.y: 0`. Add `layout` namespace for all element positions:

```js
camera: {
  y: 0,              // eye level — was eyeLevel: 1.6
  fov: 75,
  near: 0.1,
  far: 1000,
},
layout: {
  menuY: 0,              // OrbitalMenu group Y
  subMenuOffsetY: 0,     // SubMenu items offset from menuY (tune after testing)
  backButtonOffsetY: 0,  // Back button offset from menuY (tune after testing)
  videoPlayerY: 0,       // StereoVideoPlayer group Y
  panoramaGroupY: 0,     // PanoramaViewer group Y
},
```

---

### File-by-File Changes

#### `src/main.js`
- `camera.position.y = CONFIG.camera.y` (was 1.6)
- `controls.target.y = CONFIG.camera.y` (was 1.6)
- Remove `adjustForVR(mode === 'webxr')` calls from `vr:entered` bus handler
- Remove `adjustForVR(false)` from `vr:exited` bus handler
- Remove `adjustForVR(this.vrMode === 'webxr')` from `onPanoramaBack()`
- Remove `this.vrMode` property (no longer needed for y-adjustment)

#### `src/components/OrbitalMenu.js`
- All menu item positions: `y = CONFIG.layout.menuY` (was 1.6)
- Delete `adjustForVR()` method entirely

#### `src/components/SubMenu.js`
- Item positions: `y = CONFIG.layout.menuY + CONFIG.layout.subMenuOffsetY` (was 0.7)
- Back button: `y = CONFIG.layout.menuY + CONFIG.layout.backButtonOffsetY` (was 0.5)

#### `src/components/PanoramaViewer.js`
- `this.group.position.y = CONFIG.layout.panoramaGroupY` (was 1.6)
- Back button local y: recalculate so world y = `CONFIG.layout.menuY + CONFIG.layout.backButtonOffsetY` (was local -1.0 → world 0.6)

#### `src/components/vr/StereoVideoPlayer.js`
- `this.group.position.y = CONFIG.layout.videoPlayerY` (was 1.6)
- Control button local positions: y = 0 (was -0.8 local)

---

### VR Mode Handling

With y=0, no per-mode y-adjustment is needed:

| Mode | Camera Y | Elements Y | Result |
|------|----------|------------|--------|
| Non-VR | 0 (Three.js) | 0 | Eye level ✓ |
| WebXR | ≈0 (XR 'local' space) | 0 | Eye level ✓ |
| Cardboard | 0 (Three.js) | 0 | Eye level ✓ |

The `adjustForVR()` mechanism is eliminated. VR-specific logic in `main.js` handles only: stereo effect enable/disable, FOV switch, and fullscreen — no y-coordinate changes.

---

### Risk & Mitigation

**Visual shift**: Panorama may look slightly different (camera 1.6 units lower in a radius-100 sphere). Impact is ~1.6% — expected to be imperceptible.  
**Mitigation**: If panorama feels off after testing, set `CONFIG.camera.y = 0.3` without touching component code.

**SubMenu/back button overlap**: With all offsets at 0, sub-menu items and back button may overlap at y=0. Tune `CONFIG.layout.subMenuOffsetY` and `CONFIG.layout.backButtonOffsetY` to negative values (e.g., -0.2, -0.4) after visual testing.

---

## Out of Scope

- Hotspot world-space positions (stored in JSON/localStorage, not affected by camera y)
- GazeController reticle (camera-relative, not affected)
- Any non-y-coordinate changes
