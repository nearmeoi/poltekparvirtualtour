# WebVR Modular Architecture Design
**Date:** 2026-06-04
**Branch:** akmal
**Status:** Approved

---

## 1. Latar Belakang & Tujuan

Project WebVR Virtual Tour saat ini memiliki masalah utama:
- `PanoramaViewer.js` 1725 baris — God Object dengan 6 tanggung jawab
- `AdminPanel.js` 1150 baris — mixed concerns
- Logika VR tersebar di 4 file → bug reticle iOS Cardboard sulit di-fix
- 4 implementasi fullscreen API yang identik
- iOS/Android detection diduplikasi di 4+ file meski `deviceDetection.js` sudah ada
- `config.js` didefinisikan tapi banyak yang tidak dipakai — magic number tersebar
- Data tour hardcoded di JS 567 baris — susah tambah konten baru

**Tujuan:** Refactor arsitektur menjadi modular, reusable, dan maintainable dengan resiko migrasi minimal.

---

## 2. Prinsip Desain

1. **Single Responsibility** — setiap file punya satu tanggung jawab yang bisa dijelaskan dalam satu kalimat
2. **Decoupled via EventBus** — komponen tidak saling pegang referensi langsung
3. **Config sebagai satu-satunya sumber kebenaran** — tidak ada magic number di luar `config.js`

---

## 3. Arsitektur: EventBus Pattern

### Sebelum
```
main.js → PanoramaViewer → AdminPanel (window.adminPanel)
main.js → GazeController → PanoramaViewer
AdminPanel → PanoramaViewer (direct method calls)
VROverlay → CardboardModeManager → main.js
```

### Sesudah
```
PanoramaViewer  ──emit──→  EventBus  ──listen──→  AdminPanel
VRStateManager  ──emit──→  EventBus  ──listen──→  GazeController
HotspotManager  ──emit──→  EventBus  ──listen──→  OrbitalMenu
```

### Event Namespace

| Namespace | Contoh Event | Emitter | Listeners |
|---|---|---|---|
| `vr:` | `vr:entered`, `vr:exited`, `vr:reticle-update` | VRStateManager | GazeController, UI |
| `scene:` | `scene:change`, `scene:loading`, `scene:loaded` | PanoramaViewer | OrbitalMenu, InfoPanel |
| `hotspot:` | `hotspot:hover`, `hotspot:click`, `hotspot:gaze-enter` | HotspotManager | GazeController, AdminPanel |
| `audio:` | `audio:play`, `audio:mute` | AudioControls | AudioContextManager |
| `admin:` | `admin:open`, `admin:hotspot-save`, `admin:state-change` | AdminPanel | HotspotManager |

---

## 4. Struktur Folder Final

```
src/
├── core/
│   └── EventBus.js                   ← BARU: singleton pub/sub
├── utils/
│   ├── FullscreenHelper.js           ← BARU: ganti 3 duplikasi
│   ├── AudioContextManager.js        ← BARU: ganti 3 duplikasi
│   ├── deviceDetection.js            ← SUDAH ADA — dipakai konsisten
│   ├── CanvasUI.js                   ← sudah direfactor
│   ├── AnimationHelper.js
│   ├── GyroscopeControls.js          ← singleton, 1 instance saja
│   └── initPolyfill.js
├── vr/
│   └── VRStateManager.js             ← BARU: isolasi SEMUA logika VR
├── components/
│   ├── core/
│   │   ├── PanoramaViewer.js         ← dikecilkan ~200 baris
│   │   ├── HotspotManager.js         ← BARU: dipecah dari PanoramaViewer
│   │   ├── TextureManager.js         ← BARU: dipecah dari PanoramaViewer
│   │   ├── HotspotEditor.js          ← BARU: lazy-loaded, admin only
│   │   └── GazeController.js         ← stereo-aware
│   ├── menu/
│   │   └── OrbitalMenu.js
│   ├── vr/
│   │   ├── VROverlay.js              ← disederhanakan
│   │   ├── CardboardModeManager.js   ← disederhanakan
│   │   ├── CardboardButton.js
│   │   ├── CardboardUI.js
│   │   ├── StereoEffect.js
│   │   └── StereoVideoPlayer.js
│   ├── ui/
│   │   ├── LandingScreen.js
│   │   ├── InfoOverlay.js
│   │   ├── InfoPanel3D.js
│   │   ├── AudioControls.js
│   │   └── SubMenu.js              ← deduplikasi camera-follow loop
│   └── admin/
│       ├── AdminPanel.js             ← ~300 baris, hanya koordinasi
│       ├── AdminFormBuilder.js       ← BARU: form element factory
│       ├── AdminStateManager.js      ← BARU: undo/redo/clipboard
│       └── AdminPersistence.js       ← BARU: save/load/export
├── data/
│   ├── DataService.js                ← BARU: API layer untuk data tour
│   ├── sceneMap.js
│   └── tours/
│       ├── makassar.json             ← BARU: dari TOUR_DATA
│       └── lagaligo.json             ← BARU: dari LAGALIGO_SCENES
├── config.js                         ← diperlengkapi
└── main.js                           ← ~120 baris, pure orchestrator
```

---

## 5. Komponen Baru

### 5.1 `EventBus.js`
Simple pub/sub singleton tanpa dependency eksternal.

```js
// Interface:
bus.emit(event, payload)
bus.on(event, handler)     // return unsubscribe function
bus.off(event, handler)
bus.once(event, handler)   // auto-unsubscribe setelah dipanggil sekali
```

### 5.2 `FullscreenHelper.js`
Menggantikan 3 implementasi fullscreen yang identik.

```js
FullscreenHelper.request(element)   // cross-browser prefixes
FullscreenHelper.exit()
FullscreenHelper.lockLandscape()    // dengan graceful error handling
FullscreenHelper.isFullscreen()     // → boolean
```

### 5.3 `AudioContextManager.js`
Menggantikan 3 pola AudioContext yang berbeda.

```js
AudioContextManager.resume()        // dipanggil saat user gesture pertama
AudioContextManager.getContext()    // singleton, tidak buat context baru
```

### 5.4 `VRStateManager.js`
Single class yang owns semua state dan side-effect VR.

**State machine:** `IDLE → ENTERING → ACTIVE(mode) → EXITING → IDLE`

```js
class VRStateManager {
  constructor(renderer, bus) { }
  async enterWebXR()     { }   // Android native WebXR
  async enterCardboard() { }   // iOS fallback
  async exit()           { }   // unified exit untuk semua mode
  getMode()              { }   // 'idle' | 'entering' | 'webxr' | 'cardboard' | 'exiting'
  isStereoscopic()       { }   // → boolean
}
```

Saat enter: emit `vr:entered` dengan payload `{ mode, isStereoscopic, ipd }`.
Semua side-effect (fullscreen, orientation lock, audio resume, stereo enable) terjadi di dalam class ini.

### 5.5 `TextureManager.js`
Load dan cache texture. Tidak tahu soal scene atau hotspot.

```js
class TextureManager {
  load(url)       { }   // return Promise<THREE.Texture>
  preload(urls)   { }   // background preload array
  dispose(url)    { }
  disposeAll()    { }
}
```

### 5.6 `HotspotManager.js`
Buat, posisikan, animasi hotspot. Listen event dari bus.

```js
class HotspotManager {
  constructor(scene, bus, dataService) { }
  loadHotspots(sceneId)   { }
  clearHotspots()         { }
  getHotspots()           { }   // return array untuk raycasting
}
// Listens: 'scene:change', 'hotspot:gaze-enter', 'admin:hotspot-save'
// Emits:   'hotspot:click', 'hotspot:hover'
```

### 5.7 `DataService.js`
```js
const DataService = {
  async getTour(id)          { },   // load tours/{id}.json
  async getScenes(tourId)    { },
  async getHotspots(sceneId) { },
};
```

### 5.8 `AdminFormBuilder.js`
Reusable form element factory — tidak tahu soal AdminPanel.

```js
FormBuilder.createInput({ label, value, onChange })
FormBuilder.createButton({ text, onClick, variant })
FormBuilder.createColorPicker({ value, onChange })
FormBuilder.createSelect({ options, value, onChange })
```

### 5.9 `AdminStateManager.js`
```js
class AdminStateManager {
  push(state)   { }   // tambah ke undo stack
  undo()        { }   // emit 'admin:state-change'
  redo()        { }
  copy()        { }
  paste()       { }
  canUndo()     { }   // → boolean
  canRedo()     { }   // → boolean
}
```

### 5.10 `AdminPersistence.js`
```js
AdminPersistence.saveHotspots(sceneId, hotspots)
AdminPersistence.loadHotspots(sceneId)
AdminPersistence.exportJSON()
AdminPersistence.importJSON(file)
```

---

## 6. Fix Reticle iOS Cardboard

### Root Cause
1. `renderer.xr.getCamera()` return `undefined` di Cardboard fallback (bukan native WebXR)
2. `GazeController` tidak tahu apakah stereo mode aktif
3. Tidak ada IPD correction — reticle tidak di tengah kedua mata

### Fix di `GazeController.js`

```js
// Listen VRStateManager:
bus.on('vr:entered', ({ isStereoscopic, ipd }) => {
  this.isStereoscopic = isStereoscopic;
  this.ipd = ipd;
});

// Reticle positioning (diperbaiki):
_updateReticlePosition() {
  const xrCamera = this.renderer.xr.getCamera?.();

  if (xrCamera?.cameras?.length === 2) {
    // Native WebXR stereo — rata-rata kedua mata
    const left  = xrCamera.cameras[0].position;
    const right = xrCamera.cameras[1].position;
    this._origin.addVectors(left, right).multiplyScalar(0.5);
  } else if (this.isStereoscopic) {
    // Cardboard fallback — pakai main camera + IPD correction
    this._origin.copy(this.camera.position);
    this._origin.y = CONFIG.camera.eyeLevel;
  } else {
    // Desktop
    this._origin.copy(this.camera.position);
  }

  this.reticleMesh.position
    .copy(this._origin)
    .add(this._direction.multiplyScalar(CONFIG.gaze.reticleDistance));
}
```

---

## 7. CONFIG Lengkap

```js
export const CONFIG = {
  camera: {
    eyeLevel: 1.6,
    fov: 75,
    near: 0.1,
    far: 1000,
  },
  gaze: {
    activationTime: 1.5,
    triggerLockTime: 0.8,
    reticleDistance: 1.0,
  },
  vr: {
    cardboardIPD: 0.065,
    fadeTime: 500,
    swipeThreshold: 30,
    fullscreenPollInterval: 500,
    fullscreenDelay: 800,
  },
  menu: {
    radius: 3.5,
    subMenuRadius: 1.8,
    easeSpeed: 0.08,
    lookDownThreshold: -0.45,
    hoverScale: 1.2,
    itemWidth: 1.8,
    itemHeight: 1.2,
  },
  animation: {
    fadeTime: 500,
  },
  assets: {
    basePath: '/assets',
  },
};
```

---

## 8. main.js Final (~120 baris)

```js
import './utils/initPolyfill.js';
import './style/index.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { EventBus }       from './core/EventBus.js';
import { DataService }    from './data/DataService.js';
import { VRStateManager } from './vr/VRStateManager.js';
import { TextureManager } from './components/core/TextureManager.js';
import { PanoramaViewer } from './components/core/PanoramaViewer.js';
import { HotspotManager } from './components/core/HotspotManager.js';
import { GazeController } from './components/core/GazeController.js';
import { OrbitalMenu }    from './components/menu/OrbitalMenu.js';
import { LandingScreen }  from './components/ui/LandingScreen.js';

class App {
  constructor() {
    this._setupRenderer();
    this._setupScene();
    this.init();
  }

  async init() {
    const bus      = new EventBus();
    const data     = new DataService();
    const textures = new TextureManager();
    const vr       = new VRStateManager(this.renderer, bus);
    const hotspots = new HotspotManager(this.scene, bus, data);
    const panorama = new PanoramaViewer(this.scene, bus, textures);
    const gaze     = new GazeController(this.camera, this.renderer, bus);
    const menu     = new OrbitalMenu(this.scene, this.camera, bus);
    const landing  = new LandingScreen(bus);

    // AdminPanel: lazy load — tidak masuk bundle produksi
    bus.on('admin:open', async () => {
      const { AdminPanel } = await import('./components/admin/AdminPanel.js');
      new AdminPanel(bus);
    });

    this._startRenderLoop();
  }
}

new App();
```

---

## 9. Strategi Migrasi (6 Sprint)

| Sprint | Yang Dikerjakan | Resiko | Verifikasi |
|---|---|---|---|
| **1** | `EventBus` + `FullscreenHelper` + `AudioContextManager` + fix `deviceDetection` usage | Sangat rendah | `npm run build` hijau |
| **2** | Lengkapi `config.js` + ganti semua magic number | Rendah | Build + visual check |
| **3** | `VRStateManager` + fix reticle iOS stereo-aware | Medium | Test di HP langsung |
| **4** | Pecah `PanoramaViewer` → 4 + `DataService` + JSON | Medium | Hotspot muncul benar |
| **5** | Deduplikasi `SubMenu` + pecah `AdminPanel` → 4 | Rendah | Admin panel berfungsi |
| **6** | Slim `main.js` + final wiring + smoke test | Rendah | Full test desktop + mobile |

**Aturan setiap sprint:**
- Buat branch baru per sprint
- `npm run build` harus hijau sebelum commit
- Test di browser (desktop + mobile) sebelum lanjut
- Kalau sprint gagal → revert, investigasi, baru retry

---

## 10. Ukuran File: Sebelum vs Sesudah

| File | Sebelum | Sesudah |
|---|---|---|
| `PanoramaViewer.js` | 1725 baris | ~200 baris |
| `AdminPanel.js` | 1150 baris | ~300 baris |
| `main.js` | 600 baris | ~120 baris |
| `SubMenu.js` | 416 baris | ~280 baris |
| `tourData.js` | 567 baris JS | 2 file JSON + DataService.js ~50 baris |
| File duplikasi fullscreen | 3 | 1 (`FullscreenHelper`) |
| File duplikasi iOS detection | 4+ | 1 (`deviceDetection.js`) |
| Magic number di kode | 20+ | 0 |
| Bug reticle iOS | Ada | Fixed |
