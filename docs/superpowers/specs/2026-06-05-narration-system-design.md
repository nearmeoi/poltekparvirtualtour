# Design Spec: Audio Narration + 3D Subtitle System

**Date:** 2026-06-05
**Status:** Approved
**Scope:** Auto-playing scene narration with synchronized 3D subtitle panel and inline playback controls

---

## Problem

Tour scenes already have `audio` fields in their JSON data and the MP3 files are present in `public/assets/Narasi/Audio/`. There is no system to:
- Auto-play narration audio when a scene loads
- Display synchronized 3D subtitle text tied to audio timestamps
- Give users pause/skip controls without leaving the panorama view

Existing `AudioControls` and `InfoPanel3D` serve different use cases (manual hotspot info) and must not be modified for this feature.

---

## Goal

- Audio narration auto-plays on every scene load, pauseable by user
- Subtitle text appears as a floating 3D panel that follows the camera (bottom of FOV), synced to audio timestamps
- Pause and Skip controls live next to the existing Back button in `PanoramaViewer` — all scene controls in one place
- Subtitle data stored as an array in each scene's JSON — no external parser needed
- System is self-contained: two new files, minimal changes to existing code

---

## Data Format

Add a `subtitles` array to each scene entry in `src/data/tours/*.json`. The `audio` field already exists and is unchanged.

```json
{
  "id": 1,
  "title": "Museum La Galigo",
  "audio": "assets/Narasi/Audio/Lagaligo/1. Pintu Masuk.mp3",
  "subtitles": [
    { "start": 0,    "end": 5.5,  "text": "Selamat datang di Museum La Galigo." },
    { "start": 6.0,  "end": 12.0, "text": "Museum ini terletak di Fort Rotterdam..." },
    { "start": 12.5, "end": 18.0, "text": "..." }
  ]
}
```

**Rules:**
- `start` / `end` in seconds (float), matching the MP3 timestamp
- Gaps between segments are allowed — subtitle panel hides when no segment is active
- Scene without `subtitles` (or empty array): audio still plays, no subtitle text shown
- Scene without `audio`: `NarrationController` skips entirely for that scene

---

## Architecture

```
main.js
  ├─ init: new NarrationController(bus, camera, scene)
  ├─ init: panoramaViewer.setNarrationController(narrationController)
  └─ render loop: narrationController.update(delta)

EventBus
  └─ scene:loaded → NarrationController._loadScene(sceneData)
                       ├─ dispose previous HTMLAudioElement
                       ├─ create new HTMLAudioElement (sceneData.audio)
                       ├─ store sceneData.subtitles[]
                       └─ autoplay after AudioContextManager.resume()

NarrationController.update(delta)
  ├─ check audio.currentTime against subtitles[]
  ├─ SubtitlePanel3D.show(text) / .hide()
  └─ SubtitlePanel3D.update()  ← follow-camera positioning

PanoramaViewer
  ├─ backBtn   (existing)
  ├─ pauseBtn  (new) → controller.pause() / .resume()
  └─ skipBtn   (new) → controller.skip()
```

---

## Component 1: NarrationController

**File:** `src/components/narration/NarrationController.js`

**Single responsibility:** orchestrate audio lifecycle and subtitle timing per scene.

### Public API

```js
new NarrationController(bus, camera, scene)
controller.update(delta)   // called from render loop every frame
controller.pause()         // pause audio + hide subtitle
controller.resume()        // resume audio
controller.skip()          // jump to end, hide subtitle, dispose audio
controller.isActive()      // returns true when audio is loaded for current scene
controller.dispose()       // full cleanup
```

### Internal flow

```
_loadScene(sceneData)
  ├─ _disposeAudio()              — stop + null previous element
  ├─ if !sceneData.audio → return
  ├─ this._audio = new Audio(sceneData.audio)
  ├─ this._subtitles = sceneData.subtitles || []
  ├─ this._paused = false
  └─ AudioContextManager.resume() → this._audio.play()

update(delta)
  ├─ if !this._audio || this._audio.paused → return
  ├─ t = this._audio.currentTime
  ├─ segment = this._subtitles.find(s => t >= s.start && t < s.end)
  ├─ segment found   → this._subtitlePanel.show(segment.text)
  └─ no segment      → this._subtitlePanel.hide()
```

### Owns
- One `HTMLAudioElement` (HTML5 Audio — no spatialization needed)
- One `SubtitlePanel3D` instance (created in constructor)
- Subtitle array from active scene JSON

### Does not own
- No direct Three.js scene manipulation beyond passing scene to SubtitlePanel3D
- No button/UI rendering — controls exposed via `pause()` / `resume()` / `skip()`

---

## Component 2: SubtitlePanel3D

**File:** `src/components/narration/SubtitlePanel3D.js`

**Single responsibility:** render subtitle text as a floating 3D canvas panel that follows the camera's horizontal direction.

### Public API

```js
new SubtitlePanel3D(camera, scene)
panel.show(text)    // update canvas texture, set visible = true
panel.hide()        // set visible = false
panel.update()      // reposition to follow camera — called every frame by NarrationController
panel.dispose()     // remove from scene, free textures
```

### Follow-camera positioning

Pitch is ignored so the panel stays at a fixed vertical offset even when the user looks up or down:

```js
const dir = camera.getWorldDirection(tmp).setY(0).normalize();
group.position
  .copy(camera.position)
  .addScaledVector(dir, CONFIG.narration.subtitleDistance)
  .setY(camera.position.y + CONFIG.narration.subtitleY);
group.lookAt(camera.position);
```

### Visual
- `THREE.PlaneGeometry` with `THREE.CanvasTexture`
- Dark semi-transparent background (`rgba(0,0,0,0.65)`) with rounded corners via `CanvasUI.roundRect`
- White text, centered, 40px bold, wraps to two lines max
- No navigation buttons — display-only

---

## Component 3: PanoramaViewer changes

**File:** `src/components/core/PanoramaViewer.js`

### New buttons (alongside existing backBtn)

```
[← BACK]  [⏸]  [⏭]
```

```js
// x offset from back button, same Z depth and Y
pauseBtn.position.set(0.5, CONFIG.layout.backButtonOffsetY, -1.6)
skipBtn.position.set( 0.9, CONFIG.layout.backButtonOffsetY, -1.6)
```

- Both buttons use `userData.isInteractable = true` — picked up by existing `InputHandler`
- `onClick` delegates to `this._narrationController.pause()` / `.skip()`
- Pause button label toggles between `⏸` and `▶` based on playback state

### New method

```js
setNarrationController(controller) {
    this._narrationController = controller;
    // show/hide narration buttons based on controller.isActive()
}
```

Buttons are hidden when `controller.isActive()` is false (scene has no audio).

---

## CONFIG Changes

Add to `src/config.js`:

```js
narration: {
    subtitleDistance: 2.0,   // meters in front of camera
    subtitleY: -0.5,         // meters below camera.position.y
    subtitleWidth: 1.8,      // panel width in world units
    subtitleHeight: 0.25,    // panel height in world units
},
```

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/narration/NarrationController.js` | **NEW** — audio + subtitle orchestration |
| `src/components/narration/SubtitlePanel3D.js` | **NEW** — follow-camera subtitle display |
| `src/config.js` | add `narration` namespace |
| `src/components/core/PanoramaViewer.js` | add pauseBtn, skipBtn, `setNarrationController()` |
| `src/main.js` | wire NarrationController, call `setNarrationController` |
| `src/data/tours/*.json` | add `subtitles[]` per scene (populated separately from `docs/narasi/`) |

## Files Not Touched

`InfoPanel3D`, `AudioControls`, `AudioContextManager` (reused as-is), `OrbitalMenu`, `SubMenu`, `GazeController`, `CardboardModeManager`

---

## Out of Scope

- Narration in OrbitalMenu or SubMenu screens (only in PanoramaViewer)
- Spatial / positional audio (mono MP3 via HTML5 Audio is sufficient)
- Auto-generating subtitle timestamps from doc files (manual entry in JSON)
- Volume slider UI
