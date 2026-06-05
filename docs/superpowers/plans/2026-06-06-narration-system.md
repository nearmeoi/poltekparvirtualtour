# Narration System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-playing scene narration with synchronized 3D subtitle panel and inline Pause/Skip controls next to the existing Back button.

**Architecture:** `NarrationController` subscribes to `scene:loaded` (EventBus), manages one `HTMLAudioElement`, and drives `SubtitlePanel3D` each frame. `PanoramaViewer.loadFromLocation()` is modified to emit `scene:loaded` (instead of creating its own Audio element) so narration is owned in one place. Pause and Skip buttons live inside `PanoramaViewer.controlDock` alongside the existing Back button.

**Tech Stack:** Three.js, Vite, vanilla JS — no test runner. Verification is manual via `npm run dev`.

---

## Files

| File | Action |
|------|--------|
| `src/config.js` | Modify — add `narration` namespace |
| `src/components/narration/SubtitlePanel3D.js` | Create — follow-camera subtitle display |
| `src/components/narration/NarrationController.js` | Create — audio + subtitle orchestration |
| `src/components/core/PanoramaViewer.js` | Modify — emit `scene:loaded`, add pauseBtn/skipBtn, add `setNarrationController()` |
| `src/main.js` | Modify — wire NarrationController, update render loop and back handler |
| `src/data/tourData.js` | Modify — add `subtitles` field to all 3 TOUR_DATA entries |

---

### Task 1: Add `narration` namespace to CONFIG

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add narration block after the existing `layout` block**

Open `src/config.js`. Find:
```js
    // Layout — element Y positions; all 0 by default (eye level = y=0). Tune after testing.
    layout: {
        menuY: 0,
        subMenuOffsetY: 0,
        backButtonOffsetY: -0.9,
        videoPlayerY: 0,
        panoramaGroupY: 0,
    },
```

Replace with:
```js
    // Layout — element Y positions; all 0 by default (eye level = y=0). Tune after testing.
    layout: {
        menuY: 0,
        subMenuOffsetY: 0,
        backButtonOffsetY: -0.9,
        videoPlayerY: 0,
        panoramaGroupY: 0,
    },

    // Narration — subtitle panel positioning and sizing
    narration: {
        subtitleDistance: 2.0,   // meters in front of camera
        subtitleY: -0.5,         // meters below camera.position.y
        subtitleWidth: 1.8,      // panel width in world units
        subtitleHeight: 0.25,    // panel height in world units
    },
```

- [ ] **Step 2: Commit**
```bash
git add src/config.js
git commit -m "feat: add narration namespace to CONFIG"
```

---

### Task 2: Create SubtitlePanel3D

**Files:**
- Create: `src/components/narration/SubtitlePanel3D.js`

- [ ] **Step 1: Create the file**

Create `src/components/narration/SubtitlePanel3D.js` with this content:

```js
import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { CanvasUI } from '../../utils/CanvasUI.js';

export class SubtitlePanel3D {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        this._tmp = new THREE.Vector3();
        this._currentText = '';

        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.visible = false;

        this._createPanel();
    }

    _createPanel() {
        const w = CONFIG.narration.subtitleWidth;
        const h = CONFIG.narration.subtitleHeight;

        const canvasW = 1024;
        const canvasH = Math.round(canvasW * (h / w));

        this.canvas = document.createElement('canvas');
        this.canvas.width = canvasW;
        this.canvas.height = canvasH;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            this.material
        );
        this.mesh.renderOrder = 9990;
        this.group.add(this.mesh);
    }

    _drawText(text) {
        const { width: cw, height: ch } = this.canvas;
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);

        CanvasUI.roundRect(ctx, 8, 8, cw - 16, ch - 16, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 52px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;

        const maxWidth = cw - 80;
        const words = text.split(' ');
        let line1 = '';
        let line2 = '';
        let onLine2 = false;

        for (const word of words) {
            const candidate = (onLine2 ? line2 : line1) + word + ' ';
            if (!onLine2 && ctx.measureText(candidate).width > maxWidth) {
                onLine2 = true;
            }
            if (onLine2) line2 += word + ' ';
            else line1 += word + ' ';
        }

        const l1 = line1.trim();
        const l2 = line2.trim();
        if (l2) {
            ctx.fillText(l1, cw / 2, ch / 2 - 34);
            ctx.fillText(l2, cw / 2, ch / 2 + 34);
        } else {
            ctx.fillText(l1, cw / 2, ch / 2);
        }

        this.texture.needsUpdate = true;
    }

    show(text) {
        if (text === this._currentText && this.group.visible) return;
        this._currentText = text;
        this._drawText(text);
        this.group.visible = true;
    }

    hide() {
        if (!this.group.visible) return;
        this.group.visible = false;
        this._currentText = '';
    }

    update() {
        if (!this.group.visible) return;

        const dir = this.camera.getWorldDirection(this._tmp).setY(0);
        if (dir.lengthSq() < 0.001) return;
        dir.normalize();

        this.group.position
            .copy(this.camera.position)
            .addScaledVector(dir, CONFIG.narration.subtitleDistance)
            .setY(this.camera.position.y + CONFIG.narration.subtitleY);

        this.group.lookAt(this.camera.position);
    }

    dispose() {
        this.texture.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        this.scene.remove(this.group);
    }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/narration/SubtitlePanel3D.js
git commit -m "feat: add SubtitlePanel3D — follow-camera subtitle display"
```

---

### Task 3: Create NarrationController

**Files:**
- Create: `src/components/narration/NarrationController.js`

- [ ] **Step 1: Create the file**

Create `src/components/narration/NarrationController.js` with this content:

```js
import { AudioContextManager } from '../../utils/AudioContextManager.js';
import { SubtitlePanel3D } from './SubtitlePanel3D.js';

export class NarrationController {
    constructor(bus, camera, scene) {
        this._bus = bus;
        this._audio = null;
        this._subtitles = [];
        this._subtitlePanel = new SubtitlePanel3D(camera, scene);

        this._bus.on('scene:loaded', ({ sceneData }) => this._loadScene(sceneData));
    }

    _loadScene(sceneData) {
        this._disposeAudio();
        if (!sceneData?.audio) return;

        this._subtitles = sceneData.subtitles || [];
        this._audio = new Audio(sceneData.audio);
        this._audio.volume = 0.8;

        AudioContextManager.resume().then(() => {
            this._audio?.play().catch(err => {
                console.warn('[NarrationController] Autoplay blocked:', err);
            });
        });
    }

    update(delta) {
        this._subtitlePanel.update();

        if (!this._audio || this._audio.paused || this._audio.ended) {
            this._subtitlePanel.hide();
            return;
        }

        const t = this._audio.currentTime;
        const segment = this._subtitles.find(s => t >= s.start && t < s.end);
        if (segment) {
            this._subtitlePanel.show(segment.text);
        } else {
            this._subtitlePanel.hide();
        }
    }

    pause() {
        if (!this._audio) return;
        if (this._audio.paused) {
            this._audio.play().catch(() => {});
        } else {
            this._audio.pause();
            this._subtitlePanel.hide();
        }
    }

    isPaused() {
        return !this._audio || this._audio.paused;
    }

    skip() {
        this._disposeAudio();
    }

    isActive() {
        return this._audio !== null;
    }

    _disposeAudio() {
        if (this._audio) {
            this._audio.pause();
            this._audio.src = '';
            this._audio = null;
        }
        this._subtitles = [];
        this._subtitlePanel.hide();
    }

    dispose() {
        this._disposeAudio();
        this._subtitlePanel.dispose();
    }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/narration/NarrationController.js
git commit -m "feat: add NarrationController — audio lifecycle and subtitle timing"
```

---

### Task 4: Update PanoramaViewer

**Files:**
- Modify: `src/components/core/PanoramaViewer.js`

Four separate changes: (a) emit `scene:loaded` and remove self-managed audio in `loadFromLocation()`, (b) add narration buttons, (c) add `setNarrationController()`, (d) update `update()`.

- [ ] **Step 1: Remove audio block from `loadFromLocation()` and emit `scene:loaded`**

Find this block in `loadFromLocation()` (roughly lines 165–213):

```js
        // Stop any playing audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        // Play audio if available (global per location)
        if (location.audio) {
            this.currentAudio = new Audio(location.audio);
            this.currentAudio.loop = false; // No loop, play once
            this.currentAudio.volume = 0.5;

            // Bind audio to AudioControls
            this.audioControls.setAudio(this.currentAudio);

            // Handle audio ended
            this.currentAudio.addEventListener('ended', () => {
                this.audioControls.setState(false, this.audioControls.isMuted);
            });

            // Auto-start
            this.currentAudio.play().then(() => {
                this.audioControls.setState(true, this.audioControls.isMuted);
            }).catch(err => {
                console.log('Audio autoplay blocked:', err);
                this.audioControls.setState(false, false);
            });
        } else {
            this.audioControls.setAudio(null);
            this.audioControls.setState(false, false);
        }

        // Check for multi-scene data
        if (location.scenes && location.scenes.length > 0) {
```

Replace with:

```js
        // Audio is handled by NarrationController via scene:loaded event

        // Check for multi-scene data
        if (location.scenes && location.scenes.length > 0) {
```

Then find the `else if (location.panorama)` branch inside `loadFromLocation()`:

```js
        } else if (location.panorama) {
            // Load with depth map if available
            this.loadTextureWithDepth(location.panorama, location.depthMap);
            this.clearHotspots();
        }
```

Replace with:

```js
        } else if (location.panorama) {
            // Load with depth map if available
            this.loadTextureWithDepth(location.panorama, location.depthMap);
            this.clearHotspots();

            // Emit scene:loaded so NarrationController picks up audio + subtitles
            if (this.bus) {
                this.bus.emit('scene:loaded', {
                    sceneId: location.id ?? location.panorama,
                    sceneData: location,
                });
            }
        }
```

- [ ] **Step 2: Add `createNarrationButtons()` method**

Find `createBackButton()` method. Add the new method directly after it (after the closing `}` of `createBackButton`):

```js
    createNarrationButtons() {
        const makeBtn = (label) => {
            const canvas = CanvasUI.createButtonTexture(label, {
                width: 200, height: 180, radius: 40, fontSize: 36
            });
            const texture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.MeshBasicMaterial({
                map: texture, transparent: true, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), mat);
            mesh.userData.isInteractable = true;
            mesh.userData.originalScale = new THREE.Vector3(1, 1, 1);
            mesh.userData.targetScale   = new THREE.Vector3(1, 1, 1);
            mesh.userData.animProgress  = 1;
            mesh.onHoverIn  = () => mesh.userData.targetScale.set(1.1, 1.1, 1.1);
            mesh.onHoverOut = () => mesh.userData.targetScale.copy(mesh.userData.originalScale);
            return { mesh, canvas };
        };

        const y = CONFIG.layout.backButtonOffsetY;

        // Pause / Resume button
        const { mesh: pauseMesh, canvas: pauseCanvas } = makeBtn('PAUSE');
        this.pauseBtn = pauseMesh;
        this._pauseBtnCanvas = pauseCanvas;
        this.pauseBtn.position.set(0.5, y, -1.6);
        this.pauseBtn.lookAt(0, CONFIG.layout.menuY, 0);
        this.pauseBtn.onClick = () => { this._narrationController?.pause(); };
        this.pauseBtn.visible = false;
        this.controlDock.add(this.pauseBtn);

        // Skip button
        const { mesh: skipMesh } = makeBtn('SKIP');
        this.skipBtn = skipMesh;
        this.skipBtn.position.set(0.9, y, -1.6);
        this.skipBtn.lookAt(0, CONFIG.layout.menuY, 0);
        this.skipBtn.onClick = () => { this._narrationController?.skip(); };
        this.skipBtn.visible = false;
        this.controlDock.add(this.skipBtn);

        this._narrationPaused = false;
    }
```

- [ ] **Step 3: Call `createNarrationButtons()` from constructor**

In the constructor, find the line:
```js
        this.createBackButton();
        this.audioControls = new AudioControls(this.controlDock);
```

Replace with:
```js
        this.createBackButton();
        this.createNarrationButtons();
        this.audioControls = new AudioControls(this.controlDock);
```

- [ ] **Step 4: Add `setNarrationController()` method**

Add this method anywhere after `createNarrationButtons()`:

```js
    setNarrationController(controller) {
        this._narrationController = controller;
    }
```

- [ ] **Step 5: Update `update()` to animate narration buttons and refresh pause label**

Inside `update(delta)`, find:
```js
        // Animate all buttons
        animateObject(this.backBtn);
```

Replace with:
```js
        // Animate all buttons
        animateObject(this.backBtn);
        animateObject(this.pauseBtn);
        animateObject(this.skipBtn);

        // Show/hide narration buttons and sync pause label
        if (this._narrationController) {
            const active = this._narrationController.isActive();
            if (this.pauseBtn) this.pauseBtn.visible = active;
            if (this.skipBtn)  this.skipBtn.visible  = active;

            if (active) {
                const paused = this._narrationController.isPaused();
                if (paused !== this._narrationPaused) {
                    this._narrationPaused = paused;
                    const label = paused ? 'PLAY' : 'PAUSE';
                    CanvasUI.drawButtonText(this._pauseBtnCanvas, label, {
                        width: 200, height: 180, radius: 40, fontSize: 36
                    });
                    this.pauseBtn.material.map.needsUpdate = true;
                }
            }
        }
```

- [ ] **Step 6: Verify `CanvasUI.drawButtonText` exists — if not, use `createButtonTexture` instead**

Open `src/utils/CanvasUI.js`. Search for `drawButtonText`. If the method does not exist, replace the texture-update block from Step 5 with this version instead (swaps the texture rather than redrawing in-place):

```js
                if (paused !== this._narrationPaused) {
                    this._narrationPaused = paused;
                    const label = paused ? 'PLAY' : 'PAUSE';
                    const newCanvas = CanvasUI.createButtonTexture(label, {
                        width: 200, height: 180, radius: 40, fontSize: 36
                    });
                    const oldMap = this.pauseBtn.material.map;
                    this.pauseBtn.material.map = new THREE.CanvasTexture(newCanvas);
                    this.pauseBtn.material.needsUpdate = true;
                    if (oldMap) oldMap.dispose();
                    this._pauseBtnCanvas = newCanvas;
                }
```

- [ ] **Step 7: Commit**
```bash
git add src/components/core/PanoramaViewer.js
git commit -m "feat: PanoramaViewer — narration buttons, setNarrationController, delegate audio to scene:loaded"
```

---

### Task 5: Wire NarrationController in main.js

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add import at the top of main.js**

Find the block of import statements at the top. After the last import line, add:

```js
import { NarrationController } from './components/narration/NarrationController.js';
```

- [ ] **Step 2: Init NarrationController in `initComponents()`**

Find the end of `initComponents()`:
```js
        this.orbitalMenu = new OrbitalMenu(this.scene, this.camera, (index) => {
            console.log('Orbital Menu selected:', index);
            this.orbitalMenu.hide();
            this.panoramaViewer.load(index);
            this.panoramaViewer.backBtn.visible = true;
        });
        this.orbitalMenu.hide(); // Hidden until user starts the experience
    }
```

Replace with:
```js
        this.orbitalMenu = new OrbitalMenu(this.scene, this.camera, (index) => {
            console.log('Orbital Menu selected:', index);
            this.orbitalMenu.hide();
            this.panoramaViewer.load(index);
            this.panoramaViewer.backBtn.visible = true;
        });
        this.orbitalMenu.hide(); // Hidden until user starts the experience

        // Narration controller — audio + subtitle system
        this.narrationController = new NarrationController(this.bus, this.camera, this.scene);
        this.panoramaViewer.setNarrationController(this.narrationController);
    }
```

- [ ] **Step 3: Add `narrationController.update(delta)` to the render loop**

In `render()`, find:
```js
        // Per-frame component updates
        this.panoramaViewer?.update(delta);
```

Replace with:
```js
        // Per-frame component updates
        this.narrationController?.update(delta);
        this.panoramaViewer?.update(delta);
```

- [ ] **Step 4: Update `onPanoramaBack()` to stop narration**

Find in `onPanoramaBack()`:
```js
        if (this.panoramaViewer.currentAudio) {
            this.panoramaViewer.currentAudio.pause();
        }
```

Replace with:
```js
        this.narrationController?.skip();
```

- [ ] **Step 5: Add `narrationController` cleanup in `dispose()`**

Find:
```js
    dispose() {
        this.inputHandler?.dispose();
        this.panoramaViewer?.dispose?.();
```

Replace with:
```js
    dispose() {
        this.inputHandler?.dispose();
        this.narrationController?.dispose();
        this.panoramaViewer?.dispose?.();
```

- [ ] **Step 6: Commit**
```bash
git add src/main.js
git commit -m "feat: wire NarrationController into App — init, render loop, back handler, dispose"
```

---

### Task 6: Add sample subtitle data to tourData.js

**Files:**
- Modify: `src/data/tourData.js`

This task adds a `subtitles` array to each TOUR_DATA entry. For Museum Kota (index 0), add a sample segment to verify the subtitle panel works. La Galigo and Pantai Losari get empty arrays (audio still plays; add timestamps later).

- [ ] **Step 1: Add subtitles to TOUR_DATA[0] (Museum Kota Makassar)**

Find:
```js
  {
    id: 0,
    title: 'Museum Kota Makassar',
    subtitle: 'Halaman Depan',
    description: 'Museum Sejarah Kota Makassar',
    panorama: 'assets/Museum Kota/01_Scene 1.jpg',
    thumbnail: 'assets/thumb_museum_kota.jpg',
    audio: 'assets/Narasi/Audio/Museum Kota/1. Pembuka Virtual Tour.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: []
  },
```

Replace with:
```js
  {
    id: 0,
    title: 'Museum Kota Makassar',
    subtitle: 'Halaman Depan',
    description: 'Museum Sejarah Kota Makassar',
    panorama: 'assets/Museum Kota/01_Scene 1.jpg',
    thumbnail: 'assets/thumb_museum_kota.jpg',
    audio: 'assets/Narasi/Audio/Museum Kota/1. Pembuka Virtual Tour.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: [],
    subtitles: [
      { start: 0,    end: 6,    text: 'Selamat datang di Museum Kota Makassar.' },
      { start: 6.5,  end: 14,   text: 'Museum ini menyimpan sejarah panjang Kota Makassar.' },
      { start: 14.5, end: 22,   text: 'Mari kita mulai perjalanan virtual tour ini bersama.' },
    ],
  },
```

- [ ] **Step 2: Add empty subtitles to TOUR_DATA[1] (La Galigo)**

Find:
```js
  {
    id: 1,
    title: 'Museum La Galigo',
    subtitle: 'Pintu Masuk',
    description: 'Fort Rotterdam – Museum Terlengkap di Sulawesi Selatan',
    panorama: 'assets/Museum La Galigo/01_Pintu Masuk.jpg',
    thumbnail: 'assets/thumb_lagaligo.jpg',
    audio: 'assets/Narasi/Audio/Lagaligo/1. Pintu Masuk.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: []
  },
```

Replace with:
```js
  {
    id: 1,
    title: 'Museum La Galigo',
    subtitle: 'Pintu Masuk',
    description: 'Fort Rotterdam – Museum Terlengkap di Sulawesi Selatan',
    panorama: 'assets/Museum La Galigo/01_Pintu Masuk.jpg',
    thumbnail: 'assets/thumb_lagaligo.jpg',
    audio: 'assets/Narasi/Audio/Lagaligo/1. Pintu Masuk.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: [],
    subtitles: [],
  },
```

- [ ] **Step 3: Add empty subtitles to TOUR_DATA[2] (Pantai Losari)**

Find:
```js
  {
    id: 2,
    title: 'Pantai Losari',
    subtitle: 'Pintu Masuk',
    description: 'Ikon Pariwisata Kota Makassar',
    panorama: 'assets/Pantai Losari/01_Scene 1.jpg',
    thumbnail: 'assets/thumb_pantai_losari.webp',
    audio: 'assets/Narasi/Audio/Panlos/1. Pintu Masuk KawasanWaterfront.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: []
  }
```

Replace with:
```js
  {
    id: 2,
    title: 'Pantai Losari',
    subtitle: 'Pintu Masuk',
    description: 'Ikon Pariwisata Kota Makassar',
    panorama: 'assets/Pantai Losari/01_Scene 1.jpg',
    thumbnail: 'assets/thumb_pantai_losari.webp',
    audio: 'assets/Narasi/Audio/Panlos/1. Pintu Masuk KawasanWaterfront.mp3',
    duration: 200,
    initialHeading: 0,
    autoRotate: false,
    hotspots: [],
    subtitles: [],
  }
```

- [ ] **Step 4: Commit**
```bash
git add src/data/tourData.js
git commit -m "feat: add subtitles field to TOUR_DATA — sample for Museum Kota, empty for others"
```

---

### Task 7: Verify in browser

- [ ] **Step 1: Check CanvasUI.createButtonTexture signature**

Before running, open `src/utils/CanvasUI.js` and confirm `createButtonTexture` exists and accepts `(label, { width, height, radius, fontSize })`. If the signature is different, adjust the calls in `createNarrationButtons()` (Task 4 Step 2) to match.

- [ ] **Step 2: Start dev server**
```bash
npm run dev
```

Expected: server starts at `http://localhost:5173` with no console errors.

- [ ] **Step 3: Verify Museum Kota narration**

Open `http://localhost:5173` in browser. Start the tour and enter **Museum Kota Makassar**:
- Audio narration starts automatically
- After ~0 seconds, subtitle panel appears at the bottom of view: *"Selamat datang di Museum Kota Makassar."*
- After ~6.5 seconds, text changes to *"Museum ini menyimpan sejarah panjang Kota Makassar."*
- **PAUSE** button (at x=0.5 next to Back) pauses audio and hides subtitle
- After pause: PAUSE label changes to PLAY; click again → audio resumes
- **SKIP** button (at x=0.9) stops narration, hides subtitle, buttons disappear

- [ ] **Step 4: Verify La Galigo and Pantai Losari**

Enter La Galigo and Pantai Losari. Audio plays (no subtitles, empty array). PAUSE and SKIP buttons visible. No JS console errors.

- [ ] **Step 5: Verify Back button flow**

While narration is playing, click **BACK**. Verify: narration stops, subtitle disappears, returns to Orbital Menu with no lingering audio.

- [ ] **Step 6: Commit if any tuning was needed**

If you adjusted any values (subtitle position, button x offset), commit the changes:
```bash
git add src/config.js src/components/core/PanoramaViewer.js
git commit -m "chore: tune narration subtitle position and button layout after visual test"
```
