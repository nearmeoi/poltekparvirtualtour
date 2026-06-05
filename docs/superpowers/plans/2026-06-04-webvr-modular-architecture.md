# WebVR Modular Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor WebVR Virtual Tour menjadi arsitektur modular berbasis EventBus — menghilangkan duplikasi kode, memecah God Objects, dan memperbaiki bug reticle iOS Cardboard.

**Architecture:** Komponen berkomunikasi lewat EventBus singleton (pub/sub) — tidak ada referensi langsung antar komponen. `VRStateManager` menjadi satu-satunya pemilik logika VR. `PanoramaViewer` dipecah menjadi `TextureManager`, `HotspotManager`, dan `HotspotEditor`.

**Tech Stack:** Three.js r182, Vite 7, ES Modules, WebXR API, Cardboard SDK

---

## Catatan Penting

- Tidak ada test suite — verifikasi via `npm run build` + manual browser check
- Setiap sprint harus `npm run build` hijau sebelum lanjut
- Test VR harus di mobile device (Android untuk WebXR, iOS untuk Cardboard)
- Working directory: `D:\02 MAGANG POLTEKPAR\webvr-v3`

---

## SPRINT 1 — Foundation (EventBus + Utilities)

### Task 1: Buat EventBus

**Files:**
- Create: `src/core/EventBus.js`

- [ ] **Step 1: Buat folder dan file**

```bash
mkdir src/core
```

Buat file `src/core/EventBus.js` dengan konten:

```js
export class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this._listeners.get(event)?.delete(handler);
    }

    emit(event, payload) {
        this._listeners.get(event)?.forEach(h => h(payload));
    }

    once(event, handler) {
        const wrapper = (payload) => {
            handler(payload);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    clear(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

export const bus = new EventBus();
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built in` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/core/EventBus.js
git commit -m "feat: add EventBus singleton for decoupled component communication"
```

---

### Task 2: Buat FullscreenHelper

**Files:**
- Create: `src/utils/FullscreenHelper.js`
- Modify: `src/components/vr/CardboardModeManager.js` (hapus fullscreen duplikat)
- Modify: `src/components/vr/VROverlay.js` (hapus fullscreen duplikat)
- Modify: `src/main.js` (hapus fullscreen duplikat)

- [ ] **Step 1: Buat `src/utils/FullscreenHelper.js`**

```js
export const FullscreenHelper = {
    async request(element) {
        const el = element || document.documentElement;
        const fn = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.mozRequestFullScreen
            || el.msRequestFullscreen;
        if (fn) {
            await fn.call(el).catch(err =>
                console.warn('[FullscreenHelper] request failed:', err)
            );
        }
    },

    async exit() {
        const fn = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.mozCancelFullScreen
            || document.msExitFullscreen;
        if (fn && this.isFullscreen()) {
            await fn.call(document).catch(err =>
                console.warn('[FullscreenHelper] exit failed:', err)
            );
        }
    },

    async lockLandscape() {
        try {
            await screen.orientation.lock('landscape');
        } catch (err) {
            console.warn('[FullscreenHelper] orientation lock not supported:', err);
        }
    },

    isFullscreen() {
        return !!(
            document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
        );
    }
};
```

- [ ] **Step 2: Update `CardboardModeManager.js` — tambah import dan ganti fullscreen calls**

Di baris paling atas file, tambahkan:
```js
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
```

Cari dan hapus blok fullscreen helper lokal (sekitar baris 236–267). Ganti semua panggilan fullscreen lokal dengan:
- `requestFullscreen(...)` → `FullscreenHelper.request(...)`
- `lockScreenOrientation()` → `FullscreenHelper.lockLandscape()`
- Hapus method private fullscreen lokal yang sudah tidak dipakai.

- [ ] **Step 3: Update `VROverlay.js` — tambah import dan ganti fullscreen calls**

Di baris paling atas, tambahkan:
```js
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
```

Cari blok fullscreen + orientation lock di sekitar baris 171–192. Ganti dengan:
```js
await FullscreenHelper.request(document.body);
await FullscreenHelper.lockLandscape();
```

Hapus implementasi fullscreen lokal.

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/utils/FullscreenHelper.js src/components/vr/CardboardModeManager.js src/components/vr/VROverlay.js
git commit -m "feat: extract FullscreenHelper — eliminate 3 duplicate fullscreen implementations"
```

---

### Task 3: Buat AudioContextManager

**Files:**
- Create: `src/utils/AudioContextManager.js`
- Modify: `src/components/ui/LandingScreen.js`
- Modify: `src/components/vr/CardboardModeManager.js`

- [ ] **Step 1: Buat `src/utils/AudioContextManager.js`**

```js
import * as THREE from 'three';

export const AudioContextManager = {
    getContext() {
        return THREE.AudioContext.getContext();
    },

    async resume() {
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
            await ctx.resume().catch(err =>
                console.warn('[AudioContextManager] resume failed:', err)
            );
        }
    }
};
```

- [ ] **Step 2: Update `LandingScreen.js` — ganti AudioContext lokal**

Tambahkan import di atas:
```js
import { AudioContextManager } from '../../utils/AudioContextManager.js';
```

Cari blok yang create AudioContext manual (sekitar baris 20–37). Ganti dengan:
```js
await AudioContextManager.resume();
```

Hapus variabel AudioContext lokal yang tidak terpakai.

- [ ] **Step 3: Update `CardboardModeManager.js` — ganti AudioContext call**

Tambahkan import:
```js
import { AudioContextManager } from '../../utils/AudioContextManager.js';
```

Cari baris `THREE.AudioContext.resume()` atau `audioCtx.resume()` (sekitar baris 115–119). Ganti dengan:
```js
await AudioContextManager.resume();
```

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/utils/AudioContextManager.js src/components/ui/LandingScreen.js src/components/vr/CardboardModeManager.js
git commit -m "feat: extract AudioContextManager — eliminate 3 duplicate audio context patterns"
```

---

### Task 4: Fix deviceDetection usage

**Files:**
- Modify: `src/components/vr/CardboardModeManager.js`
- Modify: `src/components/vr/VROverlay.js`
- Modify: `src/components/vr/CardboardButton.js`

- [ ] **Step 1: Cek exports deviceDetection.js**

Baca `src/utils/deviceDetection.js` dan catat semua fungsi yang diexport (isIOS, isAndroid, isMobile, isCardboardForced, dll.).

- [ ] **Step 2: Update `CardboardModeManager.js`**

Tambahkan import di atas (sudah ada yang lain, cukup tambahkan):
```js
import { isIOS } from '../../utils/deviceDetection.js';
```

Cari regex detection lokal seperti:
```js
/iPad|iPhone|iPod/.test(navigator.userAgent)
```
Ganti dengan `isIOS()`.

Hapus semua regex iOS/Android detection inline.

- [ ] **Step 3: Update `VROverlay.js`**

Tambahkan import:
```js
import { isIOS, isAndroid } from '../../utils/deviceDetection.js';
```

Ganti semua regex detection inline dengan fungsi yang sudah diimport.

- [ ] **Step 4: Update `CardboardButton.js`**

Lakukan hal yang sama — hapus inline detection, pakai import dari `deviceDetection.js`.

- [ ] **Step 5: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 6: Commit**

```bash
git add src/components/vr/CardboardModeManager.js src/components/vr/VROverlay.js src/components/vr/CardboardButton.js
git commit -m "refactor: use shared deviceDetection.js — eliminate iOS/Android detection duplicates"
```

---

## SPRINT 2 — Config Consolidation

### Task 5: Expand config.js

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Tambah nilai yang hilang ke config.js**

Buka `src/config.js`. Tambahkan section baru dan lengkapi section yang ada:

```js
// Tambah ke dalam export const CONFIG = { ... }

// Gaze — tambah triggerLockTime yang sekarang hardcode di GazeController
gaze: {
    activationTime: 1.5,
    reticleDistance: 1.0,
    reticleSize: 0.008,
    triggerLockTime: 0.8,   // ← BARU
},

// VR — section baru
vr: {
    cardboardIPD: 0.065,        // inter-pupillary distance (meter)
    fadeTime: 500,              // ms — dipakai di overlay transitions
    swipeThreshold: 30,         // px — threshold swipe gesture di VROverlay
    fullscreenPollInterval: 500,// ms — polling fullscreen state
    fullscreenDelay: 800,       // ms — delay sebelum cek fullscreen
},

// Menu — tambah subMenuRadius dan easeSpeed
menu: {
    radius: 2.5,
    itemWidth: 0.9,
    itemHeight: 0.6,
    subMenuRadius: 1.8,         // ← BARU: radius SubMenu dock
    easeSpeed: 0.08,            // ← BARU: camera follow ease speed SubMenu
    lookDownThreshold: -0.45,   // ← BARU: dari SubMenu hardcode
    hoverScale: 1.2,            // ← BARU: hover scale thumbnail
},
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "refactor: expand config.js with missing values (vr, gaze.triggerLockTime, menu)"
```

---

### Task 6: Replace magic numbers di GazeController dan SubMenu

**Files:**
- Modify: `src/components/core/GazeController.js`
- Modify: `src/components/ui/SubMenu.js`

- [ ] **Step 1: Fix `GazeController.js` baris 188**

Cari:
```js
this.triggerLockTime = 0.8; // 800ms lock
```

Ganti dengan:
```js
this.triggerLockTime = CONFIG.gaze.triggerLockTime;
```

- [ ] **Step 2: Fix `SubMenu.js` — hapus duplikat camera-follow loop**

Saat ini `SubMenu.update()` punya DUA blok camera-follow: baris 274–294 (pakai CONFIG ✓) dan baris 345–373 (hardcode ✗). Keduanya melakukan hal yang persis sama.

**Hapus seluruh blok baris 345–373** (yang hardcode). Blok pertama (274–294) sudah benar dan cukup.

Juga fix baris 20:
```js
// Sebelum:
this.radius = 1.8;
// Sesudah:
this.radius = CONFIG.menu.subMenuRadius;
```

- [ ] **Step 3: Fix `SubMenu.js` — hapus roundRect lokal di `createBackButton()`**

Di dalam `createBackButton()` (sekitar baris 217), ada `const roundRect = (x, y, w, h, r) => { ... }` yang mendefinisikan ulang roundRect padahal sudah ada di `CanvasUI`. 

Hapus definisi lokal tersebut. Tambahkan di awal method:
```js
const roundRect = CanvasUI.roundRect;
```

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 5: Test manual**

```bash
npm run dev
```
Buka browser, verifikasi:
- SubMenu dock tampil dan follow kamera dengan benar
- Back button masih tampil benar

- [ ] **Step 6: Commit**

```bash
git add src/components/core/GazeController.js src/components/ui/SubMenu.js
git commit -m "refactor: replace magic numbers with CONFIG values, remove duplicate camera-follow loop in SubMenu"
```

---

## SPRINT 3 — VRStateManager + Fix Reticle iOS

### Task 7: Buat VRStateManager

**Files:**
- Create: `src/vr/VRStateManager.js`

- [ ] **Step 1: Buat folder**

```bash
mkdir src/vr
```

- [ ] **Step 2: Buat `src/vr/VRStateManager.js`**

```js
import { CONFIG } from '../config.js';
import { FullscreenHelper } from '../utils/FullscreenHelper.js';
import { AudioContextManager } from '../utils/AudioContextManager.js';

export class VRStateManager {
    constructor(renderer, camera, bus) {
        this.renderer = renderer;
        this.camera   = camera;
        this.bus      = bus;

        // 'idle' | 'entering' | 'webxr' | 'cardboard' | 'exiting'
        this._mode = 'idle';
        this._stereoEffect = null;
    }

    setStereoEffect(stereoEffect) {
        this._stereoEffect = stereoEffect;
    }

    getMode()         { return this._mode; }
    isStereoscopic()  { return this._mode === 'cardboard'; }
    isPresenting()    { return this._mode === 'webxr' || this._mode === 'cardboard'; }

    async enterWebXR() {
        if (this._mode !== 'idle') return;
        this._mode = 'entering';

        try {
            await AudioContextManager.resume();
            // WebXR session itself is started by VRButton — we just track state
            this._mode = 'webxr';
            this.bus.emit('vr:entered', {
                mode: 'webxr',
                isStereoscopic: false,
                ipd: 0
            });
        } catch (err) {
            this._mode = 'idle';
            console.error('[VRStateManager] WebXR entry failed:', err);
        }
    }

    async enterCardboard() {
        if (this._mode !== 'idle') return;
        this._mode = 'entering';

        try {
            await AudioContextManager.resume();
            await FullscreenHelper.request(document.body);
            await FullscreenHelper.lockLandscape();

            if (this._stereoEffect) this._stereoEffect.enable();

            // Camera FOV for cardboard
            this.camera.fov = CONFIG.fov.vr;
            this.camera.updateProjectionMatrix();

            this._mode = 'cardboard';
            this.bus.emit('vr:entered', {
                mode: 'cardboard',
                isStereoscopic: true,
                ipd: CONFIG.vr.cardboardIPD
            });
        } catch (err) {
            this._mode = 'idle';
            console.error('[VRStateManager] Cardboard entry failed:', err);
        }
    }

    async exit() {
        if (this._mode === 'idle') return;
        const prevMode = this._mode;
        this._mode = 'exiting';

        if (prevMode === 'cardboard' && this._stereoEffect) {
            this._stereoEffect.disable();
            this.camera.fov = CONFIG.fov.default;
            this.camera.updateProjectionMatrix();
        }

        if (FullscreenHelper.isFullscreen()) {
            await FullscreenHelper.exit();
        }

        this._mode = 'idle';
        this.bus.emit('vr:exited', { prevMode });
    }
}
```

- [ ] **Step 3: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 4: Commit**

```bash
git add src/vr/VRStateManager.js
git commit -m "feat: add VRStateManager — single owner of all VR state and side effects"
```

---

### Task 8: Fix GazeController — stereo-aware reticle

**Files:**
- Modify: `src/components/core/GazeController.js`

- [ ] **Step 1: Tambah bus parameter dan stereo state ke constructor**

Ubah constructor signature:
```js
// Sebelum:
constructor(scene, camera, renderer)
// Sesudah:
constructor(scene, camera, renderer, bus)
```

Tambah di dalam constructor, setelah `this.triggerLockTime = 0;`:
```js
this.isStereoscopic = false;
this.ipd = 0;
this._origin = new THREE.Vector3();
this._direction = new THREE.Vector3();

if (bus) {
    bus.on('vr:entered', ({ isStereoscopic, ipd }) => {
        this.isStereoscopic = isStereoscopic;
        this.ipd = ipd || 0;
    });
    bus.on('vr:exited', () => {
        this.isStereoscopic = false;
        this.ipd = 0;
    });
}
```

- [ ] **Step 2: Ganti reticle positioning logic di `update()`**

Cari blok baris 62–81:
```js
update(scene, interactables, delta) {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();

    let currentCamera = this.camera;
    if (this.renderer && this.renderer.xr && this.renderer.xr.isPresenting) {
        const xrCamera = this.renderer.xr.getCamera();
        xrCamera.getWorldPosition(origin);
        xrCamera.getWorldDirection(direction);
        currentCamera = xrCamera;
    } else {
        this.camera.getWorldPosition(origin);
        this.camera.getWorldDirection(direction);
    }

    this.mesh.position.copy(origin).add(direction.multiplyScalar(this.reticleDistance));
    this.mesh.lookAt(origin);
```

Ganti dengan:
```js
update(scene, interactables, delta) {
    this._updateReticlePosition();
    const origin    = this._origin;
    const direction = this._direction;

    let currentCamera = this.camera;
    if (this.renderer?.xr?.isPresenting) {
        const xrCamera = this.renderer.xr.getCamera?.();
        if (xrCamera) currentCamera = xrCamera;
    }
```

- [ ] **Step 3: Tambah method `_updateReticlePosition()` sebelum `update()`**

```js
_updateReticlePosition() {
    const xrCamera = this.renderer?.xr?.isPresenting
        ? this.renderer.xr.getCamera?.()
        : null;

    if (xrCamera?.cameras?.length === 2) {
        // Native WebXR stereo — rata-rata posisi kedua mata
        const left  = xrCamera.cameras[0].position;
        const right = xrCamera.cameras[1].position;
        this._origin.addVectors(left, right).multiplyScalar(0.5);
        xrCamera.getWorldDirection(this._direction);
    } else if (this.isStereoscopic) {
        // Cardboard fallback — pakai main camera dengan IPD correction
        this.camera.getWorldPosition(this._origin);
        this._origin.y = CONFIG.camera.eyeLevel;
        this.camera.getWorldDirection(this._direction);
    } else {
        // Desktop / mono
        this.camera.getWorldPosition(this._origin);
        this.camera.getWorldDirection(this._direction);
    }

    this.mesh.position
        .copy(this._origin)
        .add(this._direction.clone().multiplyScalar(this.reticleDistance));
    this.mesh.lookAt(this._origin);
}
```

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 5: Test reticle**

```bash
npm run dev
```
Buka di desktop: reticle harus centered di tengah layar.
Jika ada device iOS: test masuk Cardboard mode, reticle harus centered.

- [ ] **Step 6: Commit**

```bash
git add src/components/core/GazeController.js
git commit -m "fix: stereo-aware reticle positioning in GazeController — fixes iOS Cardboard centering bug"
```

---

### Task 9: Fix GyroscopeControls double instantiation

**Files:**
- Modify: `src/components/vr/CardboardModeManager.js`

- [ ] **Step 1: Update CardboardModeManager constructor**

Saat ini `CardboardModeManager` membuat instance `GyroscopeControls` sendiri di dalam `initGyroscope()`. Ini konflik dengan instance yang dibuat di `main.js`.

Ubah constructor CardboardModeManager untuk menerima gyroscopeControls dari luar:

```js
// Sebelum:
constructor(renderer, camera, controls) {
    this.renderer = renderer;
    this.camera   = camera;
    this.controls = controls;
    // ...
}

// Sesudah:
constructor(renderer, camera, controls, gyroscopeControls) {
    this.renderer           = renderer;
    this.camera             = camera;
    this.controls           = controls;
    this.gyroscopeControls  = gyroscopeControls; // reuse existing instance
    // ...
}
```

- [ ] **Step 2: Hapus `initGyroscope()` dari CardboardModeManager**

Cari method `initGyroscope()` yang membuat `new GyroscopeControls(...)`. Hapus method tersebut dan semua panggilannya di dalam class.

- [ ] **Step 3: Update main.js — pass gyroscopeControls ke CardboardModeManager**

Cari baris:
```js
this.cardboardManager = new CardboardModeManager(
    this.renderer, this.camera, this.controls
);
```

Ganti dengan:
```js
this.cardboardManager = new CardboardModeManager(
    this.renderer, this.camera, this.controls, this.gyroscopeControls
);
```

- [ ] **Step 4: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/components/vr/CardboardModeManager.js src/main.js
git commit -m "fix: eliminate duplicate GyroscopeControls instantiation — single instance in main.js"
```

---

## SPRINT 4 — PanoramaViewer Split + DataService

> **Catatan:** Sprint ini yang paling besar. Kerjakan satu task sekaligus dan verify setelah setiap task.

### Task 10: Buat TextureManager

**Files:**
- Create: `src/components/core/TextureManager.js`

- [ ] **Step 1: Buat `src/components/core/TextureManager.js`**

```js
import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this._cache = new Map();
        this._loader = new THREE.TextureLoader();
    }

    load(url) {
        if (this._cache.has(url)) {
            return Promise.resolve(this._cache.get(url));
        }
        return new Promise((resolve, reject) => {
            this._loader.load(
                url,
                (texture) => {
                    this._cache.set(url, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    preload(urls) {
        return Promise.allSettled(urls.map(url => this.load(url)));
    }

    get(url) {
        return this._cache.get(url) || null;
    }

    dispose(url) {
        const texture = this._cache.get(url);
        if (texture) {
            texture.dispose();
            this._cache.delete(url);
        }
    }

    disposeAll() {
        this._cache.forEach(texture => texture.dispose());
        this._cache.clear();
    }
}
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/components/core/TextureManager.js
git commit -m "feat: add TextureManager with load/cache/preload/dispose"
```

---

### Task 11: Buat DataService + JSON files

**Files:**
- Create: `src/data/DataService.js`
- Create: `src/data/tours/makassar.json`
- Create: `src/data/tours/lagaligo.json`

- [ ] **Step 1: Baca `src/data/tourData.js` untuk lihat struktur TOUR_DATA dan LAGALIGO_SCENES**

Buka file tersebut dan catat struktur object setiap item (id, name, title, subtitle, thumbnail, path, hotspots, subLocations, dsb.).

- [ ] **Step 2: Buat `src/data/tours/makassar.json`**

Pindahkan isi array `TOUR_DATA` dari `tourData.js` ke format JSON. Contoh struktur:

```json
[
  {
    "id": 0,
    "name": "Nama Scene",
    "title": "Title Scene",
    "subtitle": "Subtitle opsional",
    "thumbnail": "/assets/...",
    "path": "/assets/...",
    "hotspots": [],
    "subLocations": []
  }
]
```

Isi dengan data aktual dari `tourData.js`.

- [ ] **Step 3: Buat `src/data/tours/lagaligo.json`**

Pindahkan isi array `LAGALIGO_SCENES` dari `tourData.js` ke format JSON dengan struktur yang sama.

- [ ] **Step 4: Buat `src/data/DataService.js`**

```js
export const DataService = {
    async getTour(id) {
        const mod = await import(`./tours/${id}.json`);
        return mod.default;
    },

    async getScenes(tourId) {
        return this.getTour(tourId);
    },

    async getHotspots(sceneId, tourId = 'makassar') {
        const scenes = await this.getTour(tourId);
        const scene  = scenes.find(s => s.id === sceneId);
        return scene?.hotspots || [];
    }
};
```

- [ ] **Step 5: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 6: Verifikasi JSON valid**

```bash
node -e "require('./src/data/tours/makassar.json'); console.log('OK')"
node -e "require('./src/data/tours/lagaligo.json'); console.log('OK')"
```
Expected: `OK` keduanya.

- [ ] **Step 7: Commit**

```bash
git add src/data/DataService.js src/data/tours/
git commit -m "feat: add DataService + JSON tour files — tour content no longer hardcoded in JS"
```

---

### Task 12: Buat HotspotManager

**Files:**
- Create: `src/components/core/HotspotManager.js`

- [ ] **Step 1: Baca `src/components/core/PanoramaViewer.js`**

Identifikasi semua method yang berhubungan dengan hotspot:
- `createHotspot()` atau yang setara
- `loadHotspots()` / `clearHotspots()`
- Logika hover/glow/scale hotspot
- `getInteractables()` atau array hotspot untuk raycasting

- [ ] **Step 2: Buat `src/components/core/HotspotManager.js`**

Pindahkan semua hotspot logic dari PanoramaViewer ke sini:

```js
import * as THREE from 'three';
import { CONFIG } from '../../config.js';

export class HotspotManager {
    constructor(scene, bus, dataService) {
        this.scene       = scene;
        this.bus         = bus;
        this.dataService = dataService;
        this.hotspots    = [];

        bus.on('scene:change', ({ sceneId, hotspots }) => {
            this.loadHotspots(hotspots);
        });

        bus.on('admin:hotspot-save', ({ sceneId, hotspots }) => {
            this.loadHotspots(hotspots);
        });
    }

    loadHotspots(hotspotDataArray) {
        this.clearHotspots();
        (hotspotDataArray || []).forEach(data => {
            const mesh = this._createHotspotMesh(data);
            this.scene.add(mesh);
            this.hotspots.push(mesh);
        });
    }

    clearHotspots() {
        this.hotspots.forEach(mesh => {
            mesh.geometry?.dispose();
            mesh.material?.dispose();
            this.scene.remove(mesh);
        });
        this.hotspots = [];
    }

    getInteractables() {
        return this.hotspots;
    }

    // Pindahkan implementasi _createHotspotMesh dari PanoramaViewer
    _createHotspotMesh(data) {
        // Salin implementasi dari PanoramaViewer.createHotspot() atau setara
        // Pastikan mesh.userData.isInteractable = true
        // Pastikan mesh.onClick callback emit 'hotspot:click'
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(CONFIG.panorama.hotspotRadius * 0.02, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
        );
        mesh.position.set(
            data.position?.x || 0,
            data.position?.y || 0,
            data.position?.z || 0
        );
        mesh.userData.isInteractable = true;
        mesh.userData.label = data.label || data.name || '';
        mesh.userData.hotspotData = data;
        mesh.onClick = () => {
            this.bus.emit('hotspot:click', { data });
        };
        return mesh;
    }

    dispose() {
        this.clearHotspots();
    }
}
```

> **Catatan:** Implementasi `_createHotspotMesh` harus disalin/diadaptasi dari `PanoramaViewer.js` yang asli — sesuaikan dengan kode aktual di file tersebut (icon, label, animasi).

- [ ] **Step 3: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 4: Commit**

```bash
git add src/components/core/HotspotManager.js
git commit -m "feat: extract HotspotManager from PanoramaViewer"
```

---

### Task 13: Slim PanoramaViewer

**Files:**
- Modify: `src/components/core/PanoramaViewer.js`

- [ ] **Step 1: Tambah import di PanoramaViewer**

```js
import { TextureManager } from './TextureManager.js';
import { HotspotManager } from './HotspotManager.js';
```

- [ ] **Step 2: Update constructor**

```js
constructor(scene, camera, bus, textureManager, dataService) {
    this.scene          = scene;
    this.camera         = camera;
    this.bus            = bus;
    this.textureManager = textureManager || new TextureManager();
    this.dataService    = dataService;
    this.hotspotManager = new HotspotManager(scene, bus, dataService);
    // ... sisanya tetap
}
```

Saat scene berubah (di method `loadScene` atau setara), emit event dengan hotspot data:
```js
async loadScene(sceneId, tourId = 'makassar') {
    this.bus.emit('scene:loading', { sceneId });
    const scenes = await this.dataService.getScenes(tourId);
    const scene  = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const texture = await this.textureManager.load(scene.path);
    this._sphere.material.map = texture;
    this._sphere.material.needsUpdate = true;

    this.bus.emit('scene:change', {
        sceneId,
        hotspots: scene.hotspots || [],
        sceneData: scene
    });
    this.bus.emit('scene:loaded', { sceneId, sceneData: scene });
}
```

- [ ] **Step 3: Hapus semua hotspot logic dari PanoramaViewer**

Hapus semua method yang sudah dipindah ke `HotspotManager`:
- Method yang buat/hapus hotspot mesh
- Array hotspot lokal
- Hotspot interaction callbacks

Ganti dengan delegate ke `this.hotspotManager`.

- [ ] **Step 4: Ganti texture loading dengan TextureManager**

Cari semua `new THREE.TextureLoader().load(...)` atau `textureLoader.load(...)`.
Ganti dengan:
```js
this.textureManager.load(url).then(texture => {
    // pakai texture
});
```

- [ ] **Step 5: Verifikasi build + fungsional**

```bash
npm run build
```

```bash
npm run dev
```
Buka browser. Verifikasi:
- Panorama sphere loading dengan benar
- Hotspot tampil di posisi yang benar
- Klik hotspot navigate ke scene berikutnya

- [ ] **Step 6: Commit**

```bash
git add src/components/core/PanoramaViewer.js
git commit -m "refactor: slim PanoramaViewer — delegate hotspot to HotspotManager, texture to TextureManager"
```

---

### Task 14: Setup HotspotEditor (lazy-load)

**Files:**
- Create: `src/components/core/HotspotEditor.js`
- Modify: `src/main.js`

- [ ] **Step 1: Buat `src/components/core/HotspotEditor.js`**

Pindahkan semua admin edit logic (drag hotspot, tambah hotspot baru, delete) dari `PanoramaViewer.js` ke file baru ini:

```js
export class HotspotEditor {
    constructor(scene, camera, renderer, bus) {
        this.scene    = scene;
        this.camera   = camera;
        this.renderer = renderer;
        this.bus      = bus;
        this._enabled = false;
        this._bindEvents();
    }

    enable() {
        this._enabled = true;
        // ... aktifkan drag/add/delete handlers
    }

    disable() {
        this._enabled = false;
        // ... nonaktifkan handlers
    }

    _bindEvents() {
        this.bus.on('admin:open', () => this.enable());
        this.bus.on('admin:close', () => this.disable());
    }

    // Pindahkan semua admin edit logic dari PanoramaViewer ke sini
    dispose() {
        this.disable();
    }
}
```

> **Catatan:** Salin implementasi edit logic dari `PanoramaViewer.js` yang asli — drag handler, raycasting untuk add/delete hotspot, dsb.

- [ ] **Step 2: Update `main.js` untuk lazy-load HotspotEditor**

Di dalam `initAdminPanel()` atau handler admin:
```js
bus.on('admin:open', async () => {
    if (!this._hotspotEditor) {
        const { HotspotEditor } = await import('./components/core/HotspotEditor.js');
        this._hotspotEditor = new HotspotEditor(
            this.scene, this.camera, this.renderer, bus
        );
    }
    this._hotspotEditor.enable();
});
```

- [ ] **Step 3: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error. HotspotEditor seharusnya TIDAK masuk bundle utama (lazy import).

- [ ] **Step 4: Commit**

```bash
git add src/components/core/HotspotEditor.js src/main.js
git commit -m "feat: extract HotspotEditor as lazy-loaded module — excluded from production bundle"
```

---

## SPRINT 5 — AdminPanel Split

### Task 15: Buat AdminFormBuilder

**Files:**
- Create: `src/components/admin/AdminFormBuilder.js`

- [ ] **Step 1: Buat `src/components/admin/AdminFormBuilder.js`**

Pindahkan semua form generation dari AdminPanel ke sini. Setiap fungsi harus return DOM element:

```js
export const AdminFormBuilder = {
    createInput({ label, value = '', placeholder = '', onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener('input', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(input);
        return wrapper;
    },

    createButton({ text, onClick, variant = 'default' }) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className   = `admin-btn admin-btn--${variant}`;
        btn.addEventListener('click', onClick);
        return btn;
    },

    createColorPicker({ label, value = '#ffffff', onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type  = 'color';
        input.value = value;
        input.addEventListener('input', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(input);
        return wrapper;
    },

    createSelect({ label, options = [], value, onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const select = document.createElement('select');
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value       = opt.value;
            el.textContent = opt.label;
            if (opt.value === value) el.selected = true;
            select.appendChild(el);
        });
        select.addEventListener('change', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(select);
        return wrapper;
    }
};
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminFormBuilder.js
git commit -m "feat: extract AdminFormBuilder — reusable form element factory"
```

---

### Task 16: Buat AdminStateManager

**Files:**
- Create: `src/components/admin/AdminStateManager.js`

- [ ] **Step 1: Buat `src/components/admin/AdminStateManager.js`**

```js
export class AdminStateManager {
    constructor(bus) {
        this.bus          = bus;
        this._undoStack   = [];
        this._redoStack   = [];
        this._clipboard   = null;
        this._maxHistory  = 50;
    }

    push(state) {
        this._undoStack.push(JSON.parse(JSON.stringify(state)));
        if (this._undoStack.length > this._maxHistory) {
            this._undoStack.shift();
        }
        this._redoStack = [];
    }

    undo() {
        if (!this.canUndo()) return null;
        const state = this._undoStack.pop();
        this._redoStack.push(state);
        const prev  = this._undoStack[this._undoStack.length - 1] || null;
        this.bus.emit('admin:state-change', { state: prev, action: 'undo' });
        return prev;
    }

    redo() {
        if (!this.canRedo()) return null;
        const state = this._redoStack.pop();
        this._undoStack.push(state);
        this.bus.emit('admin:state-change', { state, action: 'redo' });
        return state;
    }

    copy(data) {
        this._clipboard = JSON.parse(JSON.stringify(data));
    }

    paste() {
        return this._clipboard
            ? JSON.parse(JSON.stringify(this._clipboard))
            : null;
    }

    canUndo() { return this._undoStack.length > 1; }
    canRedo() { return this._redoStack.length > 0; }
    hasClipboard() { return this._clipboard !== null; }

    clear() {
        this._undoStack  = [];
        this._redoStack  = [];
        this._clipboard  = null;
    }
}
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminStateManager.js
git commit -m "feat: extract AdminStateManager — undo/redo/clipboard logic"
```

---

### Task 17: Buat AdminPersistence

**Files:**
- Create: `src/components/admin/AdminPersistence.js`

- [ ] **Step 1: Buat `src/components/admin/AdminPersistence.js`**

```js
import { API_BASE } from '../../config.js';

export const AdminPersistence = {
    async saveHotspots(sceneId, hotspots) {
        const key = `hotspots_${sceneId}`;
        try {
            localStorage.setItem(key, JSON.stringify(hotspots));
            console.log(`[AdminPersistence] Saved ${hotspots.length} hotspots for scene ${sceneId}`);
        } catch (err) {
            console.error('[AdminPersistence] Save failed:', err);
            throw err;
        }
    },

    loadHotspots(sceneId) {
        const key  = `hotspots_${sceneId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    exportJSON(sceneId, hotspots) {
        const data    = JSON.stringify(hotspots, null, 2);
        const blob    = new Blob([data], { type: 'application/json' });
        const url     = URL.createObjectURL(blob);
        const anchor  = document.createElement('a');
        anchor.href     = url;
        anchor.download = `hotspots_${sceneId}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    },

    importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = e => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (err) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsText(file);
        });
    }
};
```

- [ ] **Step 2: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminPersistence.js
git commit -m "feat: extract AdminPersistence — save/load/export/import hotspot data"
```

---

### Task 18: Slim AdminPanel

**Files:**
- Modify: `src/components/admin/AdminPanel.js`

- [ ] **Step 1: Tambah imports ke AdminPanel.js**

```js
import { AdminFormBuilder }  from './AdminFormBuilder.js';
import { AdminStateManager } from './AdminStateManager.js';
import { AdminPersistence }  from './AdminPersistence.js';
```

- [ ] **Step 2: Update constructor**

```js
constructor(bus) {
    this.bus           = bus;
    this.stateManager  = new AdminStateManager(bus);
    // Hapus semua undo/redo/clipboard logic dari constructor
    // Hapus semua form generation helper lokal
    // Tetap bind keyboard shortcuts di sini
    this._initUI();
    this._bindShortcuts();
}
```

- [ ] **Step 3: Replace form generation**

Di seluruh `AdminPanel.js`, cari pattern:
```js
const btn    = document.createElement('button'); // + styling inline
const input  = document.createElement('input');  // + styling inline
```

Ganti dengan:
```js
const btn   = AdminFormBuilder.createButton({ text: '...', onClick: ... });
const input = AdminFormBuilder.createInput({ label: '...', onChange: ... });
```

- [ ] **Step 4: Replace undo/redo/clipboard calls**

Cari semua `this._undoStack`, `this._redoStack`, `this._clipboard`.
Ganti dengan `this.stateManager.push()`, `this.stateManager.undo()`, dsb.

- [ ] **Step 5: Replace save/load calls**

Cari semua `localStorage.setItem('hotspots...')` atau save logic.
Ganti dengan `AdminPersistence.saveHotspots(sceneId, data)`.

- [ ] **Step 6: Verifikasi build + fungsional**

```bash
npm run build
```

```bash
npm run dev
```
Test admin panel:
- Buka admin panel (triple tap atau Ctrl+A)
- Tambah hotspot baru → posisi benar
- Undo → hotspot terhapus
- Export JSON → file terdownload
- Import JSON → hotspot ter-restore

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminPanel.js
git commit -m "refactor: slim AdminPanel — delegate to AdminFormBuilder, AdminStateManager, AdminPersistence"
```

---

## SPRINT 6 — main.js Final + Smoke Test

### Task 19: Slim main.js

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Tambah import EventBus dan VRStateManager**

```js
import { EventBus }       from './core/EventBus.js';
import { VRStateManager } from './vr/VRStateManager.js';
import { TextureManager } from './components/core/TextureManager.js';
import { HotspotManager } from './components/core/HotspotManager.js';
```

- [ ] **Step 2: Inisialisasi bus dan vrManager di constructor**

Di awal constructor `App`, tambahkan:
```js
this.bus        = new EventBus();
this.textures   = new TextureManager();
this.vrManager  = new VRStateManager(this.renderer, this.camera, this.bus);
```

Setelah `initControls()`:
```js
this.vrManager.setStereoEffect(this.cardboardManager?.stereoEffect);
```

- [ ] **Step 3: Pass bus ke komponen yang sudah mendukung**

Update semua konstruktor yang menerima bus:
```js
// GazeController
this.gazeController = new GazeController(
    this.scene, this.camera, this.renderer, this.bus
);

// DataService
const { DataService } = await import('./data/DataService.js');
this.dataService = DataService;

// PanoramaViewer
this.panoramaViewer = new PanoramaViewer(
    this.scene, this.camera, this.bus, this.textures, this.dataService
);
```

- [ ] **Step 4: Replace VR callbacks dengan bus events**

Cari `this.cardboardManager.onModeChange = (isVR) => { ... }` (sekitar baris 184–198).
Ganti dengan listeners di bus:
```js
this.bus.on('vr:entered', ({ mode }) => {
    this.isVRMode = true;
    if (this.panoramaViewer) this.panoramaViewer.setVRMode(true);
    if (this.orbitalMenu)    this.orbitalMenu.adjustForVR(true);
    if (this.vrButton)       this.vrButton.style.display = 'none';
});

this.bus.on('vr:exited', () => {
    this.isVRMode = false;
    if (this.panoramaViewer) this.panoramaViewer.setVRMode(false);
    if (this.orbitalMenu)    this.orbitalMenu.adjustForVR(false);
    if (this.vrButton) {
        this.vrButton.style.display =
            (this.vrButton.id === 'vr-goggle-button') ? 'flex' : '';
    }
});
```

- [ ] **Step 5: Verifikasi build**

```bash
npm run build
```
Expected: `✓ built` tanpa error. Chunk size warning boleh ada (existing issue).

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "refactor: wire EventBus and VRStateManager into main.js"
```

---

### Task 20: Final Smoke Test

- [ ] **Step 1: Full build check**

```bash
npm run build
```
Expected: `✓ built in` — tidak ada error, hanya warning chunk size yang sudah ada sebelumnya.

- [ ] **Step 2: Desktop smoke test**

```bash
npm run dev
```

Checklist desktop:
- [ ] Landing screen tampil
- [ ] Klik Start → Orbital Menu muncul
- [ ] Pilih scene → Panorama loading
- [ ] Hotspot terlihat dan interaktif
- [ ] Gaze cursor (reticle) centered
- [ ] SubMenu buka dan thumbnail tampil
- [ ] Back button di SubMenu berfungsi
- [ ] InfoPanel buka saat klik hotspot

- [ ] **Step 3: Mobile smoke test (kirim URL ke HP)**

Checklist mobile (Android):
- [ ] VR button visible
- [ ] Tap VR button → masuk WebXR mode
- [ ] Reticle centered
- [ ] Gaze interaction berfungsi

Checklist mobile (iOS jika tersedia):
- [ ] Cardboard button visible
- [ ] Masuk Cardboard mode → fullscreen landscape
- [ ] Reticle centered di stereo view (bug fix verified ✓)
- [ ] Gaze interaction berfungsi

- [ ] **Step 4: Admin panel smoke test**

- [ ] Triple tap atau Ctrl+A → Admin panel buka
- [ ] Tambah hotspot → posisi tersimpan
- [ ] Ctrl+Z → undo berfungsi
- [ ] Export JSON → file terdownload

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: complete modular architecture refactor — EventBus, VRStateManager, split PanoramaViewer, split AdminPanel"
```

---

## Ringkasan File yang Dibuat / Diubah

| Action | File | Sprint |
|---|---|---|
| Create | `src/core/EventBus.js` | 1 |
| Create | `src/utils/FullscreenHelper.js` | 1 |
| Create | `src/utils/AudioContextManager.js` | 1 |
| Create | `src/vr/VRStateManager.js` | 3 |
| Create | `src/components/core/TextureManager.js` | 4 |
| Create | `src/components/core/HotspotManager.js` | 4 |
| Create | `src/components/core/HotspotEditor.js` | 4 |
| Create | `src/data/DataService.js` | 4 |
| Create | `src/data/tours/makassar.json` | 4 |
| Create | `src/data/tours/lagaligo.json` | 4 |
| Create | `src/components/admin/AdminFormBuilder.js` | 5 |
| Create | `src/components/admin/AdminStateManager.js` | 5 |
| Create | `src/components/admin/AdminPersistence.js` | 5 |
| Modify | `src/config.js` | 2 |
| Modify | `src/main.js` | 3, 6 |
| Modify | `src/components/core/GazeController.js` | 2, 3 |
| Modify | `src/components/core/PanoramaViewer.js` | 4 |
| Modify | `src/components/ui/SubMenu.js` | 2 |
| Modify | `src/components/vr/CardboardModeManager.js` | 1, 3 |
| Modify | `src/components/vr/VROverlay.js` | 1 |
| Modify | `src/components/vr/CardboardButton.js` | 1 |
| Modify | `src/components/admin/AdminPanel.js` | 5 |
