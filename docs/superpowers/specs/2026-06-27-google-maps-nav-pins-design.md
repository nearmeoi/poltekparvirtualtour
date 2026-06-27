# Design: Google Maps-Style Navigation Pins

**Date:** 2026-06-27  
**File:** `src/components/core/HotspotManager.js`

---

## Goal

Replace the current colored-disc navigation hotspot icons (`arrow` and `back` types) with pins that look exactly like Google Maps Street View navigation arrows: white semi-transparent oval on the ground with a white directional chevron inside, no labels.

---

## Behavior

### Two pin types

| Type | Arrow direction | Use case |
|------|----------------|----------|
| `arrow` (next) | Points **away** from center → toward destination | Go to next scene |
| `back` | Points **toward** center ← origin | Go back to previous scene |

Direction is set automatically by the mesh rotation matrix — the arrow texture always points "up" in local space; the rotation aligns local-up with the horizontal direction to/from center.

### No labels
Navigation pins (`arrow` and `back`) show no text label regardless of what is in `data.label`. Labels are only relevant for info/location-type hotspots.

---

## Visual Design

### Texture (`_createNavArrowTexture`)

Canvas 256 × 256, transparent background:

1. **Oval base** — white semi-transparent ellipse  
   - Center: (128, 148), radiusX: 110, radiusY: 70  
   - Fill: `rgba(255, 255, 255, 0.45)`  
   - Stroke: `rgba(255, 255, 255, 0.80)`, lineWidth 3  
   - Soft white glow: `shadowColor: white`, `shadowBlur: 18`

2. **Chevron arrow** — white upward-pointing caret, centered in oval  
   - Three-point path: left foot → tip (top-center) → right foot  
   - Fill: `rgba(255, 255, 255, 0.95)`  
   - Glow: `shadowColor: white`, `shadowBlur: 12`

Same texture is used for both `arrow` and `back` — direction is controlled by rotation only.

---

## Orientation Logic

### Flatness

Change lerp value from `0.65` → `0.90` in the existing orientation block:

```js
const localZ = new THREE.Vector3()
  .lerpVectors(worldUp, facingCamera, 0.90)
  .normalize();
```

This lays the pin nearly flat on the floor, matching Street View's ground-level arrows.

### Direction flip for `back`

```js
// next (arrow): points AWAY from center
const horizontalDir = new THREE.Vector3(x, 0, z).normalize();

// back: points TOWARD center (flip)
const horizontalDir = new THREE.Vector3(-x, 0, -z).normalize();
```

The local Y of the mesh aligns with `horizontalDir`, so the chevron texture naturally points the correct way.

---

## Scale & Placement

- Scale: `2.2` (up from `1.8`) — Google Maps arrows are large and prominent
- Pitch placement: recommended `data.pitch` of `-20` to `-35` for floor-level look
- `renderOrder: 9999` — unchanged, keeps pins always visible

---

## Affected Code

Only `src/components/core/HotspotManager.js`:

| Change | Location |
|--------|----------|
| New `_createNavArrowTexture()` method | After `_createIconTexture` |
| `_createIconTexture` delegates `arrow`/`back` to new method | Line ~266 |
| Lerp `0.65` → `0.90` in orientation block | Line ~102 |
| `back` negates horizontal direction | Line ~105 |
| Skip label creation for `arrow`/`back` types | Line ~130 |

No other files change. No new assets needed.

---

## Out of Scope

- Changing other hotspot types (`info`, `location`, `photo`, etc.)
- Animated arrows (pulsing/blinking)
- Arrow that auto-rotates to face camera horizontally
- Any change to event system or hotspot data schema
