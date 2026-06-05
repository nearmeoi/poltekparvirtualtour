# Zero-Origin Coordinate System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 3D elements from y=1.6 to y=0 as the universal eye-level origin, eliminating hardcoded values and the `adjustForVR()` mechanism.

**Architecture:** `CONFIG.camera.y = 0` and `CONFIG.layout.*` become the single source of truth for all element Y positions. Camera and OrbitControls target both move to y=0. `OrbitalMenu.adjustForVR()` is deleted — y=0 works identically for WebXR (XR system places camera at y≈0 in 'local' space) and Cardboard (Three.js camera set to y=0).

**Tech Stack:** Three.js, Vite, vanilla JS — no test runner. Verification is manual via `npm run dev`.

---

## Files Modified

| File | Change |
|------|--------|
| `src/config.js` | Rename `camera.eyeLevel` → `camera.y: 0`; add `layout` namespace |
| `src/components/core/GazeController.js` | Update `CONFIG.camera.eyeLevel` reference (line 92) |
| `src/main.js` | Camera/controls y position; remove all 6 `adjustForVR` calls; remove `vrMode` tracking |
| `src/components/menu/OrbitalMenu.js` | Items y=`CONFIG.layout.menuY`; delete `adjustForVR()` method |
| `src/components/ui/SubMenu.js` | Items y=`CONFIG.layout.menuY`; back button y via `CONFIG.layout` |
| `src/components/core/PanoramaViewer.js` | Group y=`CONFIG.layout.panoramaGroupY`; back button local y |
| `src/components/vr/StereoVideoPlayer.js` | Add CONFIG import; group y=`CONFIG.layout.videoPlayerY`; button local y |

---

### Task 1: Update CONFIG

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Replace `camera.eyeLevel` with `camera.y` and add `layout` namespace**

Replace this block:
```js
    // Camera Position
    camera: {
        eyeLevel: 1.6,
        zOffset: 0.1
    },
```

With:
```js
    // Camera Position
    camera: {
        y: 0,         // eye level — was eyeLevel: 1.6
        zOffset: 0.1
    },

    // Layout — element Y positions; all 0 by default (eye level = y=0). Tune after testing.
    layout: {
        menuY: 0,
        subMenuOffsetY: 0,
        backButtonOffsetY: 0,
        videoPlayerY: 0,
        panoramaGroupY: 0,
    },
```

- [ ] **Step 2: Commit**
```bash
git add src/config.js
git commit -m "refactor: rename camera.eyeLevel to camera.y=0 and add layout namespace"
```

---

### Task 2: Fix GazeController CONFIG Reference

**Files:**
- Modify: `src/components/core/GazeController.js:90-92`

- [ ] **Step 1: Update the Cardboard gaze origin correction**

Find this block (around line 90):
```js
        } else if (this.isStereoscopic) {
            // Cardboard fallback — use main camera with eye level correction
            this.camera.getWorldPosition(this._origin);
            this._origin.y = CONFIG.camera.eyeLevel;
            this.camera.getWorldDirection(this._direction);
```

Replace with:
```js
        } else if (this.isStereoscopic) {
            // Cardboard fallback — camera is at y=0 (eye level), read actual position
            this.camera.getWorldPosition(this._origin);
            this._origin.y = CONFIG.camera.y;
            this.camera.getWorldDirection(this._direction);
```

- [ ] **Step 2: Commit**
```bash
git add src/components/core/GazeController.js
git commit -m "refactor: update GazeController to use CONFIG.camera.y"
```

---

### Task 3: Update Camera and Controls in main.js

**Files:**
- Modify: `src/main.js:148,160`

- [ ] **Step 1: Fix camera starting position**

Find (line ~148):
```js
        this.camera.position.set(0, CONFIG.camera.eyeLevel, CONFIG.camera.zOffset);
```

Replace with:
```js
        this.camera.position.set(0, CONFIG.camera.y, CONFIG.camera.zOffset);
```

- [ ] **Step 2: Fix OrbitControls target**

Find (line ~160):
```js
        this.controls.target.set(0, CONFIG.camera.eyeLevel, 0);
```

Replace with:
```js
        this.controls.target.set(0, CONFIG.camera.y, 0);
```

- [ ] **Step 3: Commit**
```bash
git add src/main.js
git commit -m "refactor: camera and controls target use CONFIG.camera.y"
```

---

### Task 4: Remove All `adjustForVR` Calls and `vrMode` from main.js

**Files:**
- Modify: `src/main.js`

There are 6 `adjustForVR` call sites and 3 `vrMode` assignments to remove. Do them in order top to bottom.

- [ ] **Step 1: Remove `this.vrMode` property declaration (line ~76)**

Find:
```js
        this.vrMode          = null; // 'webxr' | 'cardboard' | null
```
Delete that line.

- [ ] **Step 2: Remove `vrMode` assignment and `adjustForVR` in `vr:entered` handler (lines ~172–182)**

Find this block inside the `vr:entered` listener:
```js
            this.vrMode   = mode; // 'webxr' | 'cardboard'
            if (this.panoramaViewer) {
```

Replace with (remove only the vrMode line):
```js
            if (this.panoramaViewer) {
```

Then find (still in the same listener):
```js
            // In native WebXR 'local' space the camera sits at y≈0 (XR manages it),
            // so items must move to y=0. In Cardboard fallback the camera stays at y=1.6
            // (OrbitControls unchanged), so items must stay at y=1.6 — don't adjust.
            if (this.orbitalMenu) this.orbitalMenu.adjustForVR(mode === 'webxr');
            if (this.vrButton)    this.vrButton.style.display = 'none';
```

Replace with:
```js
            if (this.vrButton)    this.vrButton.style.display = 'none';
```

- [ ] **Step 3: Remove `vrMode` reset and `adjustForVR` in `vr:exited` handler (lines ~188–190)**

Find this block inside the `vr:exited` listener:
```js
            this.vrMode   = null;
            if (this.panoramaViewer) this.panoramaViewer.setVRMode(false);
            if (this.orbitalMenu)    this.orbitalMenu.adjustForVR(false);
```

Replace with:
```js
            if (this.panoramaViewer) this.panoramaViewer.setVRMode(false);
```

- [ ] **Step 4: Remove pre-adjust call in `sessionstart` handler (lines ~251–253)**

Find this block in the `sessionstart` listener:
```js
            if (this.gyroscopeControls) this.gyroscopeControls.enabled = false;
            // In WebXR 'local' reference space the camera starts at y≈0.
            // Pre-adjust orbital menu before emitting so it's ready on first render.
            if (this.orbitalMenu) this.orbitalMenu.adjustForVR(true);
            this.bus.emit('vr:entered', { mode: 'webxr' });
```

Replace with:
```js
            if (this.gyroscopeControls) this.gyroscopeControls.enabled = false;
            this.bus.emit('vr:entered', { mode: 'webxr' });
```

- [ ] **Step 5: Remove pre-adjust call in `startVRSession` (lines ~352–354)**

Find this block inside `startVRSession`:
```js
        // Pre-adjust orbital menu BEFORE session starts to avoid a "menu above" flash
        // (WebXR camera starts at y≈0 in 'local' reference space)
        if (this.orbitalMenu) this.orbitalMenu.adjustForVR(true);

        try {
```

Replace with:
```js
        try {
```

- [ ] **Step 6: Remove recovery `adjustForVR` in the catch block (lines ~366–368)**

Find this block in the catch of `startVRSession`:
```js
        } catch (e) {
            // Restore menu height if session failed to start
            if (this.orbitalMenu) this.orbitalMenu.adjustForVR(false);
            console.log('Failed to start WebXR session:', e.message);
```

Replace with:
```js
        } catch (e) {
            console.log('Failed to start WebXR session:', e.message);
```

- [ ] **Step 7: Remove `adjustForVR` in `onPanoramaBack` (line ~529)**

Find:
```js
        if (this.orbitalMenu) this.orbitalMenu.adjustForVR(this.vrMode === 'webxr');
        this.orbitalMenu.show();
```

Replace with:
```js
        this.orbitalMenu.show();
```

- [ ] **Step 8: Commit**
```bash
git add src/main.js
git commit -m "refactor: remove adjustForVR calls and vrMode tracking from main.js"
```

---

### Task 5: Update OrbitalMenu — Items at y=0, Remove `adjustForVR`

**Files:**
- Modify: `src/components/menu/OrbitalMenu.js:67-72,186-191`

- [ ] **Step 1: Move item positions to CONFIG.layout.menuY**

Find this block (lines ~67–72):
```js
            itemGroup.position.set(
                Math.sin(theta) * this.radius,
                1.6,
                Math.cos(theta) * this.radius
            );
            itemGroup.lookAt(0, 1.6, 0);
```

Replace with:
```js
            itemGroup.position.set(
                Math.sin(theta) * this.radius,
                CONFIG.layout.menuY,
                Math.cos(theta) * this.radius
            );
            itemGroup.lookAt(0, CONFIG.layout.menuY, 0);
```

- [ ] **Step 2: Delete the `adjustForVR` method**

Find this entire method:
```js
    adjustForVR(isVR) {
        const targetY = isVR ? 0 : 1.6;
        this.thumbnails.forEach(itemGroup => {
            itemGroup.position.y = targetY;
        });
    }
```

Delete it entirely (replace with empty string).

- [ ] **Step 3: Commit**
```bash
git add src/components/menu/OrbitalMenu.js
git commit -m "refactor: OrbitalMenu items at CONFIG.layout.menuY, remove adjustForVR"
```

---

### Task 6: Update SubMenu — Items and Back Button at y=0

**Files:**
- Modify: `src/components/ui/SubMenu.js:150-157,243-244`

- [ ] **Step 1: Move sub-menu item positions to CONFIG.layout**

Find this block (lines ~150–157):
```js
            mesh.position.set(
                Math.sin(theta) * this.radius * 0.9, // Slightly closer
                0.7, // Lowered further
                Math.cos(theta) * this.radius * 0.9
            );

            mesh.lookAt(0, 0.7, 0);
```

Replace with:
```js
            const eyeY = CONFIG.layout.menuY + CONFIG.layout.subMenuOffsetY;
            mesh.position.set(
                Math.sin(theta) * this.radius * 0.9,
                eyeY,
                Math.cos(theta) * this.radius * 0.9
            );

            mesh.lookAt(0, eyeY, 0);
```

- [ ] **Step 2: Move back button position to CONFIG.layout**

Find (lines ~243–244):
```js
        this.backBtn.position.set(0, 0.5, -1.5);
        this.backBtn.lookAt(0, 0.5, 0);
```

Replace with:
```js
        const backY = CONFIG.layout.menuY + CONFIG.layout.backButtonOffsetY;
        this.backBtn.position.set(0, backY, -1.5);
        this.backBtn.lookAt(0, backY, 0);
```

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/SubMenu.js
git commit -m "refactor: SubMenu items and back button use CONFIG.layout positions"
```

---

### Task 7: Update PanoramaViewer — Group and Back Button at y=0

**Files:**
- Modify: `src/components/core/PanoramaViewer.js:18,118-119`

- [ ] **Step 1: Move group position to CONFIG.layout.panoramaGroupY**

Find (line ~18):
```js
        this.group.position.set(0, 1.6, 0); // Center everything at eye level
```

Replace with:
```js
        this.group.position.set(0, CONFIG.layout.panoramaGroupY, 0);
```

- [ ] **Step 2: Update back button local position**

Find (lines ~117–119):
```js
        this.backBtn.position.set(0, -1.0, -1.6); // Moved to Z -1.6 to match radius
        this.backBtn.lookAt(0, 0.6, 0);
```

Replace with:
```js
        this.backBtn.position.set(0, CONFIG.layout.backButtonOffsetY, -1.6);
        this.backBtn.lookAt(0, CONFIG.layout.menuY, 0);
```

- [ ] **Step 3: Commit**
```bash
git add src/components/core/PanoramaViewer.js
git commit -m "refactor: PanoramaViewer group and back button use CONFIG.layout positions"
```

---

### Task 8: Update StereoVideoPlayer — Add CONFIG Import, Group and Buttons at y=0

**Files:**
- Modify: `src/components/vr/StereoVideoPlayer.js:1-4,20,244-246,273-275`

- [ ] **Step 1: Add CONFIG import**

Find the existing imports at the top of the file:
```js
import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
```

Replace with:
```js
import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
import { CONFIG } from '../../config.js';
```

- [ ] **Step 2: Move group position to CONFIG.layout.videoPlayerY**

Find (line ~20):
```js
        this.group.position.set(0, 1.6, 0); // Eye level
```

Replace with:
```js
        this.group.position.set(0, CONFIG.layout.videoPlayerY, 0);
```

- [ ] **Step 3: Update back button local position**

Find (lines ~244–246):
```js
        this.backBtn.position.set(-0.4, -0.8, -2.5);
        this.backBtn.lookAt(-0.4, 0.6, 0);
```

Replace with:
```js
        this.backBtn.position.set(-0.4, CONFIG.layout.backButtonOffsetY, -2.5);
        this.backBtn.lookAt(-0.4, CONFIG.layout.menuY, 0);
```

- [ ] **Step 4: Update play button local position**

Find (lines ~273–275):
```js
        this.playBtn.position.set(0.4, -0.8, -2.5);
        this.playBtn.lookAt(0.4, 0.6, 0);
```

Replace with:
```js
        this.playBtn.position.set(0.4, CONFIG.layout.backButtonOffsetY, -2.5);
        this.playBtn.lookAt(0.4, CONFIG.layout.menuY, 0);
```

- [ ] **Step 5: Commit**
```bash
git add src/components/vr/StereoVideoPlayer.js
git commit -m "refactor: StereoVideoPlayer uses CONFIG.layout positions (y=0 eye level)"
```

---

### Task 9: Start Dev Server and Verify Visually

- [ ] **Step 1: Start the dev server**
```bash
npm run dev
```

- [ ] **Step 2: Verify non-VR view (Desktop)**

Open `http://localhost:5173` in a desktop browser. Check:
- [ ] Orbital menu (3 venue cards) visible and at eye level
- [ ] Click a venue → sub-menu items at same eye level
- [ ] Panorama loads and looks the same as before (sphere still fills view)
- [ ] Back button works

- [ ] **Step 3: Verify WebXR (if headset available)**

Open in browser with WebXR support. Enter VR:
- [ ] Orbital menu stays at eye level (y=0 in XR 'local' space = head height at session start)
- [ ] No "menu below" bug

- [ ] **Step 4: Verify Cardboard / forced cardboard mode**

Open `http://<LAN-IP>:5173?cardboard=true`:
- [ ] Orbital menu visible and at eye level in stereo split view
- [ ] Gaze reticle appears at screen center

- [ ] **Step 5: Tune offsets if needed**

If any element looks too low/high, adjust the relevant value in `src/config.js` → `layout` namespace. All element positions trace back to those constants — no need to touch component files.

- [ ] **Step 6: Final commit**
```bash
git add -A
git commit -m "chore: zero-origin coordinate system — all elements at y=0 eye level"
```
