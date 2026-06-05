# WebVR-V3 Developer & AI Guide

> **Dokumen Referensi Utama** — Baca ini sebelum menyentuh kode apapun.
> Terakhir diperbarui berdasarkan audit lengkap seluruh source code.

---

## 1. Arsitektur Tingkat Tinggi

```
index.html                  ← Entry point HTML (Landing Screen + canvas)
  └─ src/main.js            ← Kelas App — Orchestrator utama
       ├─ src/config.js     ← Single Source of Truth untuk semua angka
       ├─ src/core/EventBus.js ← Pub/Sub bus antar komponen
       ├─ src/components/    ← Semua modul UI, Core, VR, Admin
       ├─ src/data/          ← Tour data, Scene map, DataService
       └─ src/utils/         ← Helper: Canvas, Animation, Device, Audio, Fullscreen
```

### Alur Hidup Aplikasi (Lifecycle)

1. `index.html` memuat → Landing Screen tampil (HTML/CSS murni)
2. User klik "Start Experience" → `LandingScreen.js` meminta fullscreen + gyro
3. State berubah ke `'menu'` → `OrbitalMenu` tampil (pilih museum)
4. User pilih museum → `SubMenu` tampil (pilih ruangan/scene)
5. User pilih scene → `PanoramaViewer.loadFromLocation()` memuat panorama 360°
6. Di dalam panorama: `HotspotManager` merender hotspot, user navigasi antar scene
7. Kapan saja: user bisa masuk Cardboard VR via `CardboardModeManager`

---

## 2. Terminologi Wajib

| Istilah | Definisi | ⛔ Jangan Pakai |
|---|---|---|
| **Scene / Panorama** | Satu lokasi 360° (equirectangular pada SphereGeometry) | "Room", "Space", "Level" |
| **Hotspot** | Titik interaktif di dalam Scene — navigasi atau info | "Marker", "Pin" |
| **Gaze / Dwell-to-Click** | Menatap reticle ke objek selama N detik untuk "klik" | "Stare", "Focus" |
| **OrbitalMenu** | Menu utama melengkung — pilih museum/destinasi | "Main Menu", "Hub" |
| **SubMenu** | Dock bawah — pilih sub-lokasi dalam satu museum | "Bottom Bar", "Navbar" |
| **ControlDock** | Group 3D yang mengikuti arah pandang kamera | "HUD", "Toolbar" |
| **Cardboard Mode** | Stereo split-screen + gyroscope (iOS/fallback) | "VR Mode" (ambigu) |
| **WebXR Mode** | Native VR via WebXR API (Android/desktop) | — |
| **Reticle** | Kursor bulat di tengah viewport (GazeController) | "Crosshair" |
| **Zero-Origin** | Semua UI diposisikan relatif ke `y=0` (eye level) | Hardcode `y=1.6` |

---

## 3. Peta File Lengkap

### 3.1 Orchestrator — `src/main.js`

| Aspek | Detail |
|---|---|
| **Kelas** | `App` |
| **Tanggung Jawab** | Init Three.js renderer, camera, scene, controls. Menginisiasi semua komponen. Menjalankan render loop. Mengelola state (`menu`/`viewing`/`submenu`). |
| **State Machine** | `this.currentState` — `'menu'` / `'submenu'` / `'viewing'` |
| **Render Loop** | `requestAnimationFrame` → update controls → update components → render (atau stereo render jika cardboard) |
| **VR Integration** | Membuat `CardboardModeManager` untuk iOS, `VRButton` untuk WebXR. Callback `onModeChange` menyinkronkan GazeController dan komponen lain. |

### 3.2 Konfigurasi — `src/config.js`

**🔴 ATURAN MUTLAK: Semua "magic number" HARUS ada di sini.**

```
CONFIG.fov          → { default: 85, vr: 50, min: 30, max: 120 }
CONFIG.camera       → { y: 0, zOffset: 0.1 }
CONFIG.layout       → { menuY, subMenuOffsetY, backButtonOffsetY, videoPlayerY, panoramaGroupY }
CONFIG.menu         → { radius, itemWidth, itemHeight, subMenuRadius, easeSpeed, lookDownThreshold, hoverScale }
CONFIG.gaze         → { activationTime, reticleDistance, reticleSize, triggerLockTime }
CONFIG.animation    → { hoverScale, buttonHoverScale, speed, dampingFactor, rotateSpeed }
CONFIG.video        → { curvedRadius, curvedHeight, flatWidth, flatHeight, ... }
CONFIG.background   → { radius, topColor, bottomColor }
CONFIG.panorama     → { sphereRadius, sphereSegments, hotspotRadius, loadingSpinnerSpeed }
CONFIG.controlDock  → { radius, yPosition, lookAtY, followEaseSpeed, lookDownThreshold }
CONFIG.tour         → { transitionDuration, peakFOV, motionBlur, dockRadius }
CONFIG.vr           → { cardboardIPD, fadeTime, swipeThreshold, ... }
API_BASE            → 'https://api.neardev.my.id'
```

### 3.3 Event Bus — `src/core/EventBus.js`

Sistem pub/sub sederhana. Semua komunikasi antar-komponen wajib melalui ini.

| Method | Penggunaan |
|---|---|
| `bus.on(event, callback)` | Daftar listener |
| `bus.off(event, callback)` | Hapus listener |
| `bus.emit(event, data)` | Kirim event |

**Event yang Terdaftar:**

| Event | Emitter | Payload | Konsumer |
|---|---|---|---|
| `'vr:entered'` | VRStateManager | `{ mode, isStereoscopic, ipd }` | main.js, GazeController |
| `'vr:exited'` | VRStateManager | `{ prevMode }` | main.js |
| `'scene:loaded'` | PanoramaViewer | `{ sceneId, sceneData }` | AdminPanel |
| `'scene:change'` | PanoramaViewer | `{ sceneId, hotspots, sceneData }` | AdminPanel |
| `'hotspot:click'` | HotspotManager | `{ hotspotData }` | PanoramaViewer |

### 3.4 Komponen — `src/components/`

#### 3.4.1 Core (`components/core/`)

| File | Kelas | Tanggung Jawab |
|---|---|---|
| `PanoramaViewer.js` | `PanoramaViewer` | Membuat SphereGeometry (r=50) dengan textur panorama. Mengelola loading indicator, audio playback, ControlDock (back button + audio buttons), texture cache, dan hotspot lifecycle. Menerima `bus` dan `textureManager` opsional. |
| `HotspotManager.js` | `HotspotManager` | Mengkonversi data hotspot (yaw/pitch) ke posisi XYZ pada sphere (r=45). Membuat mesh + label sprite per hotspot. Mendukung tipe: `arrow`, `info`, `photo`. Emit `hotspot:click` via bus. |
| `GazeController.js` | `GazeController` | Membuat reticle (ring + inner dot) di depan kamera. Raycast setiap frame ke `isInteractable` objects. Timer dwell → trigger `onClick()`. Mendukung mode `gaze` (timer) dan `button` (tap langsung). |
| `InputHandler.js` | `InputHandler` | Sentralisasi semua input: mouse click/move, touch, wheel zoom, right-click (admin). Raycast ke scene objects dan panggil `onClick/onHoverIn/onHoverOut`. Mengelola admin drag hotspot. |

**Konvensi Interaksi 3D:**
```js
mesh.userData.isInteractable = true;   // WAJIB agar raycast mendeteksi
mesh.userData.label = 'Nama Objek';    // Opsional, untuk debug
mesh.userData.activationTime = 2.5;    // Override dwell time (detik)
mesh.onHoverIn  = () => { ... };       // Callback saat reticle masuk
mesh.onHoverOut = () => { ... };       // Callback saat reticle keluar
mesh.onClick    = () => { ... };       // Callback saat diklik/gaze selesai
```

#### 3.4.2 Menu (`components/menu/`)

| File | Kelas | Detail |
|---|---|---|
| `OrbitalMenu.js` | `OrbitalMenu` | Menampilkan kartu museum dalam arc ~81° (π×0.45). Radius dari `CONFIG.menu.radius`. Posisi Y dari `CONFIG.layout.menuY`. Snap-to-view: jika user melihat >117° dari menu, menu snap ke arah pandang baru. Thumbnail dimuat async via `CanvasUI.createMenuCardTexture()`. |

**Catatan OrbitalMenu:**
- Hanya `imgMesh` yang `isInteractable` (bukan `textMesh`) — mengurangi area klik yang terlalu besar.
- `itemGroup.userData.targetScale` untuk animasi hover (smoothstep easing).
- `show()` reset rotasi group agar arc menghadap kamera.

#### 3.4.3 UI (`components/ui/`)

| File | Kelas | Detail |
|---|---|---|
| `SubMenu.js` | `SubMenu` | Dock sub-lokasi: arc 90° (π×0.5), radius `CONFIG.menu.subMenuRadius × 0.9`. Posisi Y hardcoded `0.7` (**TODO: pindah ke config**). Rotasi mengikuti kamera dengan threshold `CONFIG.controlDock.lookDownThreshold`. Back button di `(0, 0.5, -1.5)`. |
| `LandingScreen.js` | `LandingScreen` | Mengelola `#landing-screen` dan `#enter-vr-btn` di HTML. Saat klik: request fullscreen → lock landscape → resume AudioContext → enable gyroscope → fade out → show OrbitalMenu. |
| `InfoOverlay.js` | `InfoOverlay` | Panel info 2D HTML (overlay fullscreen). Glassmorphism backdrop. Tampil saat hotspot tipe `info` diklik di mode desktop. |
| `InfoPanel3D.js` | `InfoPanel3D` | Panel info 3D (CanvasTexture pada PlaneGeometry). Muncul 1.2m di depan kamera. Mendukung pagination via `[PAGE]` separator di deskripsi. Tombol NEXT/PREV + Close button. Digunakan di VR mode. |
| `AudioControls.js` | `AudioControls` | Tombol Play/Pause dan Mute/Unmute (3D mesh). Posisi dinamis: mode `'standalone'` atau `'with-dock'` (di samping SubMenu). Bind ke HTML5 Audio element. |

#### 3.4.4 VR (`components/vr/`)

| File | Kelas | Detail |
|---|---|---|
| `CardboardModeManager.js` | `CardboardModeManager` | Orchestrator VR untuk iOS/fallback. Enter: resume audio → enable gyroscope → enable stereo → fullscreen → set VR FOV. Exit: exit fullscreen → disable stereo → reset FOV. Callback `onModeChange(bool)` dan `onInteractionModeChange(mode)`. |
| `StereoEffect.js` | `StereoEffect` | Rendering stereoscopic side-by-side. Menggunakan `THREE.StereoCamera`. Barrel distortion shader (GLSL) + exposure boost 250%. Render ke 2 WebGLRenderTarget → post-process → scissor ke left/right viewport. |
| `CardboardButton.js` | `CardboardButton` | Tombol HTML "ENTER VR" / "EXIT VR". Muncul untuk mobile tanpa WebXR, iOS, atau `?cardboard=true`. |
| `CardboardUI.js` | `CardboardUI` | HUD overlay 2D mirrored (left+right) untuk VR mode. Back button, settings gear, orientation alert. Modal settings: pilih Cardboard v1/v2/none, onboarding flow. |
| `VROverlay.js` | `VROverlay` | Multi-step instruction overlay sebelum masuk VR: Step 1 = izin sensor gyro, Step 2 = deteksi orientasi (portrait → "putar ke landscape", landscape → "geser ke atas untuk fullscreen"). Auto-detect Android WebXR untuk skip. |

#### 3.4.5 Admin (`components/admin/`) — Dev-only

| File | Kelas | Detail |
|---|---|---|
| `AdminPanel.js` | `AdminPanel` | UI editor hotspot lengkap. Lazy-loaded hanya saat `npm run dev`. Fitur: select/add/delete/drag hotspot, edit properti (type, target, label, size, color, icon), save ke API, load JSON. |
| `AdminFormBuilder.js` | `AdminFormBuilder` | Helper pembuatan form field HTML untuk AdminPanel. |
| `AdminPersistence.js` | `AdminPersistence` | Save/Load hotspot data ke `API_BASE/api/save-hotspots`. |
| `AdminStateManager.js` | `AdminStateManager` | Track state admin: selected hotspot, edit mode, undo history. |

### 3.5 Data Layer — `src/data/`

| File | Ekspor | Detail |
|---|---|---|
| `tourData.js` | `TOUR_DATA[]`, `LAGALIGO_SCENES[]` | Array lokasi utama (Museum Kota, La Galigo, Pantai Losari). Setiap entry: `{ id, title, subtitle, panorama, thumbnail, audio, hotspots[] }`. `LAGALIGO_SCENES` = 86 scene untuk Museum La Galigo dengan `order`, `file`, `title`, `group`. |
| `sceneMap.js` | `SCENE_MAP{}` | Mapping `panorama_ID → { path, shortHex }`. Auto-generated. 76 entries Museum Kota Makassar. Digunakan oleh `PanoramaViewer.navigateToScene()` untuk resolve target hotspot. |
| `DataService.js` | `DataService` | Async loader menggunakan `import.meta.glob('./tours/*.json')`. Cache results. Methods: `getTour(id)`, `getScenes(tourId)`, `getHotspots(sceneId, tourId)`. |

**Format Data Hotspot:**
```js
{
  yaw: -45.2,           // Derajat horizontal (-180..180)
  pitch: 12.5,          // Derajat vertikal (-90..90)
  target: "panorama_ID" // atau path langsung
  target_name: "Lobby",
  type: "arrow"|"info"|"photo",
  label: "Ke Lobby",
  size: 3,              // Skala ikon (default 3)
  textSize: 1.0,        // Skala label text
  color: "#ff0000",     // Warna ikon (null = default)
  icon_url: null,       // Custom icon texture URL
  labelOffset: 0,       // Offset vertikal label
  labelWrap: false,     // Multi-line label
  // Khusus type "info":
  title: "...",
  description: "...",   // Gunakan [PAGE] untuk pagination
  infoWidth: 1.0,
  infoHeight: 0.8,
  infoColor: "#1e293b",
  infoOpacity: 0.95
}
```

### 3.6 Utilities — `src/utils/`

| File | Ekspor | Detail |
|---|---|---|
| `CanvasUI.js` | `CanvasUI` (object) | Factory untuk semua texture UI berbasis Canvas2D: `roundRect`, `createButtonTexture`, `createPlayButtonTexture`, `drawPlayButton`, `createMuteButtonTexture`, `drawMuteButton`, `createLoadingTexture`, `createLoadingTextTexture`, `createMenuCardTexture`, `createMenuTextTexture`, `curveGeometry` (bend PlaneGeometry). |
| `AnimationHelper.js` | `animateScale()`, `animateScaleAndOpacity()`, `setupInteractable()` | Shared animation: smoothstep easing untuk scale + opacity. `setupInteractable()` = shortcut untuk set `userData.isInteractable` + hover/click callbacks. |
| `deviceDetection.js` | `isIOS()`, `isAndroid()`, `isWebXRSupported()`, `hasGyroscope()`, `requestGyroscopePermission()`, `isMobile()`, `isCardboardForced()` | Deteksi perangkat. `isCardboardForced()` cek URL param `?cardboard=true` untuk testing. |
| `GyroscopeControls.js` | `GyroscopeControls` | Kontrol kamera berbasis DeviceOrientation. Smoothed quaternion (factor 0.3). `gotAnyData` flag mencegah overwrite kamera dengan zeros. Mendukung iOS permission flow dan `deviceorientationabsolute` fallback Android. |
| `FullscreenHelper.js` | `FullscreenHelper` (object) | Cross-browser fullscreen: `request()`, `exit()`, `lockLandscape()`, `unlockOrientation()`, `isFullscreen()`. Prefix handling: webkit, moz, ms. |
| `iOSFullscreenHelper.js` | `iOSFullscreenHelper` | Hack fullscreen iOS via hidden video element `webkitEnterFullscreen`. Membuat video transparan, lalu z-index swap canvas di atasnya. |
| `AudioContextManager.js` | `AudioContextManager` (object) | Wrapper `THREE.AudioContext`. `resume()` dipanggil setelah user gesture untuk memenuhi autoplay policy. |

### 3.7 State Machine VR — `src/vr/VRStateManager.js`

State: `'idle'` → `'entering'` → `'webxr'`|`'cardboard'` → `'exiting'` → `'idle'`

| Method | Fungsi |
|---|---|
| `enterWebXR()` | Resume audio, set state `entering`. VRButton yang melakukan sesi XR sebenarnya. |
| `confirmWebXR()` | Dipanggil saat XR session berhasil start. Emit `vr:entered`. |
| `enterCardboard()` | Resume audio → fullscreen → lock landscape → enable stereo → set VR FOV → emit `vr:entered`. |
| `exit()` | Disable stereo → reset FOV → exit fullscreen → emit `vr:exited`. |
| `reset()` | Force state ke `idle` (untuk error recovery). |

---

## 4. Pola Desain & Konvensi Kode

### 4.1 Config-Driven Design
```
✅ BENAR:  mesh.position.y = CONFIG.layout.menuY;
❌ SALAH:  mesh.position.y = 0;     // Magic number!
❌ SALAH:  mesh.position.y = 1.6;   // Hardcoded eye level!
```

### 4.2 Interaksi 3D — Unified Pattern
Setiap mesh yang bisa diklik/di-hover HARUS mengikuti pola ini:
```js
mesh.userData.isInteractable = true;
mesh.userData.originalScale = new THREE.Vector3(1, 1, 1);
mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
mesh.userData.animProgress = 1;
mesh.onHoverIn = () => mesh.userData.targetScale.set(1.1, 1.1, 1.1);
mesh.onHoverOut = () => mesh.userData.targetScale.copy(mesh.userData.originalScale);
mesh.onClick = () => { /* action */ };
```
Atau gunakan shortcut: `setupInteractable(mesh, { hoverScale: 1.1, onClick: fn })` dari `AnimationHelper.js`.

### 4.3 Komunikasi Antar Komponen
```
✅ BENAR:  bus.emit('scene:loaded', { sceneId })    // Decoupled
❌ SALAH:  this.app.adminPanel.refresh()             // Tight coupling
```
Pengecualian: `main.js` boleh memanggil method komponen langsung karena ia adalah orchestrator.

### 4.4 Dispose Pattern
Setiap komponen yang membuat Three.js resources HARUS punya `dispose()`:
```js
dispose() {
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
    this.scene.remove(this.group);
}
```

### 4.5 ControlDock Camera-Follow
Pattern yang digunakan SubMenu dan PanoramaViewer untuk UI yang mengikuti pandangan:
```js
// Di update(delta):
const dir = camera.getWorldDirection(new THREE.Vector3());
const pitch = Math.asin(dir.y);
if (pitch > CONFIG.controlDock.lookDownThreshold) {
    const targetAngle = Math.atan2(dir.x, dir.z) + Math.PI + centerOffset;
    let diff = targetAngle - group.rotation.y;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * CONFIG.controlDock.followEaseSpeed;
}
```

### 4.6 Koordinat Hotspot (Yaw/Pitch → XYZ)
```js
// Konversi: HotspotManager._createHotspotMesh()
const adjustedYaw = yaw + 90;  // Offset 90° dari standard
const yawRad = THREE.MathUtils.degToRad(adjustedYaw);
const pitchRad = THREE.MathUtils.degToRad(pitch);
const radius = 45; // Hotspot sphere radius (< panorama sphere 50)

x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
y = radius * Math.sin(pitchRad);
z = -radius * Math.cos(pitchRad) * Math.cos(yawRad);
```

---

## 5. Panduan untuk AI Agent

### Sebelum Mengubah Apapun:
1. **Baca `src/config.js`** — Cek apakah nilai yang perlu diubah sudah ada di sana
2. **Baca file komponen target** — Pahami lifecycle dan dependencies-nya
3. **Cek EventBus** — Apakah ada event yang perlu di-emit atau di-listen

### Rules:
- **JANGAN** hardcode angka di file komponen — tambahkan ke `CONFIG` lalu referensikan
- **JANGAN** gunakan `document.getElementById()` untuk logika 3D — gunakan `userData` + callbacks
- **JANGAN** buat coupling langsung antar komponen — gunakan `EventBus`
- **JANGAN** lupa `dispose()` saat membuat geometri/material/texture baru
- **INGAT** Zero-Origin: kamera di `y=0`, semua UI relatif ke `y=0`

### Debugging VR di Desktop:
- Tambahkan `?cardboard=true` ke URL untuk memaksa mode Cardboard
- `CardboardModeManager` akan aktif meski di desktop
- `isCardboardForced()` dari `deviceDetection.js` mengecek parameter ini

### Menambah Scene/Museum Baru:
1. Tambah entry di `TOUR_DATA` (`tourData.js`) dengan panorama path + thumbnail
2. Jika punya sub-lokasi: tambah `subLocations[]` array
3. Scene map (jika pakai ID hotspot): tambah di `sceneMap.js`
4. Hotspot data di-fetch dari API (`API_BASE/api/get-hotspots`) atau hardcode di `hotspotsData`

### Menambah Tipe Hotspot Baru:
1. Tambah case di `HotspotManager._createHotspotMesh()` untuk rendering
2. Tambah handler di `PanoramaViewer.navigateToScene()` atau `hotspot:click` listener
3. Tambah form fields di `AdminPanel.js` untuk editing

---

## 6. Struktur Direktori

```
webvr-v3/
├── index.html                          # Entry point
├── src/
│   ├── main.js                         # App orchestrator
│   ├── config.js                       # Semua konstanta
│   ├── core/
│   │   └── EventBus.js                 # Pub/sub messaging
│   ├── components/
│   │   ├── admin/
│   │   │   ├── AdminPanel.js           # Hotspot editor UI
│   │   │   ├── AdminFormBuilder.js     # Form field factory
│   │   │   ├── AdminPersistence.js     # Save/load to API
│   │   │   └── AdminStateManager.js    # Edit state tracking
│   │   ├── core/
│   │   │   ├── PanoramaViewer.js       # 360° sphere + controls
│   │   │   ├── HotspotManager.js       # Hotspot positioning
│   │   │   ├── GazeController.js       # Reticle + dwell-to-click
│   │   │   └── InputHandler.js         # Mouse/touch/wheel input
│   │   ├── menu/
│   │   │   └── OrbitalMenu.js          # Museum selection arc
│   │   ├── ui/
│   │   │   ├── SubMenu.js              # Sub-location dock
│   │   │   ├── LandingScreen.js        # Start screen handler
│   │   │   ├── InfoOverlay.js          # 2D info panel (HTML)
│   │   │   ├── InfoPanel3D.js          # 3D info panel (VR)
│   │   │   └── AudioControls.js        # Play/Pause + Mute
│   │   └── vr/
│   │       ├── CardboardModeManager.js # iOS VR orchestrator
│   │       ├── StereoEffect.js         # Side-by-side rendering
│   │       ├── CardboardButton.js      # Enter/Exit VR button
│   │       ├── CardboardUI.js          # Mirrored HUD overlay
│   │       └── VROverlay.js            # Pre-VR instruction flow
│   ├── vr/
│   │   └── VRStateManager.js           # VR state machine
│   ├── data/
│   │   ├── tourData.js                 # Museum + scene data
│   │   ├── sceneMap.js                 # Panorama ID → path
│   │   └── DataService.js              # Async data loader
│   ├── utils/
│   │   ├── CanvasUI.js                 # Canvas2D texture factory
│   │   ├── AnimationHelper.js          # Scale/opacity animation
│   │   ├── deviceDetection.js          # Platform detection
│   │   ├── GyroscopeControls.js        # Device orientation
│   │   ├── FullscreenHelper.js         # Cross-browser fullscreen
│   │   ├── iOSFullscreenHelper.js      # iOS video fullscreen hack
│   │   └── AudioContextManager.js      # Web Audio context
│   └── style/                          # CSS files
└── docs/
    ├── DEVELOPER_GUIDE.md              # ← Dokumen ini
    └── superpowers/plans/              # Implementation plans
```

---

## 7. Technical Debt & Known Issues

| Issue | Lokasi | Deskripsi |
|---|---|---|
| Hardcoded Y positions | `SubMenu.js:153,157` | `y: 0.7` dan `lookAt(0, 0.7, 0)` harus dipindah ke `CONFIG.layout` |
| Hardcoded back button pos | `SubMenu.js:243-244` | `position.set(0, 0.5, -1.5)` harus ke `CONFIG` |
| PanoramaViewer group Y | `PanoramaViewer.js:18` | `group.position.set(0, 1.6, 0)` — masih pakai 1.6, belum Zero-Origin |
| Back button Y di Panorama | `PanoramaViewer.js:118` | `position.set(0, -1.0, -1.6)` harus dari `CONFIG.controlDock` |
| Duplikasi animasi | `SubMenu.js`, `OrbitalMenu.js` | Animasi scale smoothstep di-copy-paste, bisa pakai `animateScale()` dari `AnimationHelper.js` |
| Console.log spam | `InfoPanel3D.js` | Banyak `console.log` debug yang harus dihapus untuk production |

---

## 8. Quick Reference: CONFIG Keys per Component

| Komponen | CONFIG Keys yang Digunakan |
|---|---|
| `main.js` | `fov.*`, `camera.*`, `animation.dampingFactor`, `animation.rotateSpeed` |
| `OrbitalMenu` | `menu.radius`, `layout.menuY` |
| `SubMenu` | `menu.subMenuRadius`, `controlDock.lookDownThreshold`, `controlDock.followEaseSpeed` |
| `GazeController` | `gaze.*` |
| `PanoramaViewer` | `controlDock.*`, `panorama.*` |
| `CardboardModeManager` | `fov.vr`, `fov.default` |
| `VRStateManager` | `fov.vr`, `fov.default`, `vr.cardboardIPD` |
| `AudioControls` | (posisi diatur oleh caller, bukan langsung dari CONFIG) |
