# Google Maps Navigation Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `arrow` and `back` hotspot icons with Google Maps Street View-style white translucent oval + chevron arrows that lay flat on the floor and point toward/away from the scene center.

**Architecture:** All changes are confined to `src/components/core/HotspotManager.js`. A new `_createNavArrowTexture()` method draws the white oval + chevron on a canvas. `_createIconTexture()` delegates to it for `arrow` and `back` types. The mesh orientation logic gets a lerp bump to `0.90` for flatness, and the `back` type negates its horizontal direction vector so the arrow points toward center.

**Tech Stack:** Three.js `CanvasTexture`, HTML Canvas 2D API, `Path2D`

## Global Constraints

- No new files, no new assets — single-file change only
- No test runner — verification is manual in the browser (`npm run dev`)
- No labels on `arrow` or `back` type hotspots
- Both types share the same white-on-transparent texture; direction is controlled purely by rotation matrix

---

### Task 1: Add `_createNavArrowTexture()` and wire it into `_createIconTexture()`

**Files:**
- Modify: `src/components/core/HotspotManager.js`

**Interfaces:**
- Produces: `_createNavArrowTexture()` → `THREE.CanvasTexture` (white oval + upward chevron, 256×256)
- Consumed by: `_createIconTexture()` when `type === 'arrow' || type === 'back'`

- [ ] **Step 1: Add `_createNavArrowTexture()` method**

In `src/components/core/HotspotManager.js`, add this method after the existing `_createIconTexture()` method (around line 346, before `_adjustColor`):

```js
_createNavArrowTexture() {
    const key = 'nav_arrow_gmaps';
    if (this.textureCache.has(key)) return this.textureCache.get(key);

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;       // 128
    const cy = size / 2 + 20;  // 148 — oval sits slightly below center

    // Oval base with soft white glow
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 110, 70, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.80)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Chevron arrow — upward-pointing caret, centered in oval
    // Points: left-foot (55,170), tip (128,90), right-foot (201,170)
    // Second tier: left-foot (75,145), tip (128,80), right-foot (181,145)
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(55, 168);
    ctx.lineTo(128, 92);
    ctx.lineTo(201, 168);
    ctx.lineTo(181, 168);
    ctx.lineTo(128, 112);
    ctx.lineTo(75, 168);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.textureCache.set(key, texture);
    return texture;
}
```

- [ ] **Step 2: Wire `_createIconTexture()` to delegate for `arrow` and `back`**

In `_createIconTexture()`, replace the opening of the `if (type === 'arrow' || type === 'back')` block (lines ~266–292) with a delegation to the new method:

Find this block:
```js
if (type === 'arrow' || type === 'back') {
    // Google Maps Style Disc: Vibrant colored background
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // White border for the disc to make it pop
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Draw the chevron (white) using explicit prefixed commands
    const pathStr = type === 'arrow' 
        ? 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z'
        : 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z';
    const path = new Path2D(pathStr);

    const scale = 7.5;
    const offset = (size - (24 * scale)) / 2;
    ctx.translate(offset, offset);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    ctx.fill(path);

    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
} else {
```

Replace it with:
```js
if (type === 'arrow' || type === 'back') {
    return this._createNavArrowTexture();
} else {
```

Note: the `key` cache check and canvas/ctx setup at the top of `_createIconTexture()` still run first, but `return` exits before touching the canvas — that's fine. To be clean, also make `_createIconTexture` return early before the canvas setup when type is nav. Replace the top of `_createIconTexture` (the key/canvas setup block) like this:

```js
_createIconTexture(type, customColor = null) {
    if (type === 'arrow' || type === 'back') {
        return this._createNavArrowTexture();
    }

    const key = 'icon_svg_' + type + '_' + (customColor || '');
    if (this.textureCache.has(key)) return this.textureCache.get(key);

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // ... rest unchanged
```

- [ ] **Step 3: Commit texture change**

```bash
git add src/components/core/HotspotManager.js
git commit -m "feat: add Google Maps white oval+chevron nav arrow texture"
```

---

### Task 2: Update orientation logic — flat mesh + directional flip for `back`

**Files:**
- Modify: `src/components/core/HotspotManager.js`

**Interfaces:**
- Consumes: `mesh.position` `{x, y, z}` already set above the orientation block
- Produces: correctly oriented flat mesh where `arrow` points away from center and `back` points toward center

- [ ] **Step 1: Update lerp value and direction flip**

In `_createHotspotMesh()`, find the orientation block for `arrow`/`back` (currently around lines 95–115):

```js
if (type === 'arrow' || type === 'back') {
    mesh.scale.set(1.8, 1.8, 1.8);

    // Google Maps style: laying flat but tilted towards the camera for visibility
    const facingCamera = new THREE.Vector3().copy(mesh.position).normalize().negate();
    
    // Interpolate between flat (worldUp) and billboard (facingCamera)
    const localZ = new THREE.Vector3().lerpVectors(worldUp, facingCamera, 0.65).normalize();
    
    // Local Y points away from the camera on the horizontal plane
    const horizontalDir = new THREE.Vector3(x, 0, z).normalize();
    const localY = horizontalDir.clone();
    
    // Recompute localX to ensure right-handed orthonormality
    const localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
    // Recompute localY to be perpendicular to localX and localZ
    localY.crossVectors(localZ, localX).normalize();
    
    const matrix = new THREE.Matrix4();
    matrix.makeBasis(localX, localY, localZ);
    mesh.setRotationFromMatrix(matrix);
}
```

Replace it with:

```js
if (type === 'arrow' || type === 'back') {
    mesh.scale.set(2.2, 2.2, 2.2);

    const facingCamera = new THREE.Vector3().copy(mesh.position).normalize().negate();

    // 0.90 = nearly flat on the floor, matching Google Maps Street View
    const localZ = new THREE.Vector3().lerpVectors(worldUp, facingCamera, 0.90).normalize();

    // next (arrow): chevron points AWAY from center
    // back:         chevron points TOWARD center (negate horizontal direction)
    const sign = type === 'back' ? -1 : 1;
    const horizontalDir = new THREE.Vector3(sign * x, 0, sign * z).normalize();
    const localY = horizontalDir.clone();

    const localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
    localY.crossVectors(localZ, localX).normalize();

    const matrix = new THREE.Matrix4();
    matrix.makeBasis(localX, localY, localZ);
    mesh.setRotationFromMatrix(matrix);
}
```

- [ ] **Step 2: Skip labels for `arrow` and `back` types**

Find the label creation block in `_createHotspotMesh()` (currently around line 130):

```js
if (data.label) {
```

Replace with:

```js
if (data.label && type !== 'arrow' && type !== 'back') {
```

- [ ] **Step 3: Commit orientation + label changes**

```bash
git add src/components/core/HotspotManager.js
git commit -m "feat: flat Google Maps orientation + directional flip for back nav pin"
```

---

### Task 3: Manual browser verification

**Files:** none changed — verification only

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open `http://localhost:5173` in browser.

- [ ] **Step 2: Open admin panel and place test hotspots**

In browser console:
```js
window.adminPanel.show()
```

Add two hotspots with these settings to test:
- Type: `arrow`, Yaw: 0, Pitch: -25 (next pin, should point away from you)
- Type: `back`, Yaw: 180, Pitch: -25 (back pin, should point toward you)

- [ ] **Step 3: Verify visual appearance**

Confirm all of the following:
- Both pins are white/translucent oval shapes on the floor
- Both show a white chevron arrow inside the oval
- `arrow` (next) pin's chevron points **away** from the scene center (outward)
- `back` pin's chevron points **toward** the scene center (inward)
- Pins lay nearly flat on the ground (not steeply tilted)
- No text label appears below either pin
- Hover causes scale-up (1.3×) as before
- Clicking a pin still fires `hotspot:click` event (check console)

- [ ] **Step 4: Test in Cardboard/VR mode (optional)**

Append `?cardboard=true` to URL and confirm pins are visible and correctly oriented in split-screen stereo mode.

- [ ] **Step 5: Final commit if any tweaks were needed**

```bash
git add src/components/core/HotspotManager.js
git commit -m "fix: nav pin visual tweaks after browser verification"
```
