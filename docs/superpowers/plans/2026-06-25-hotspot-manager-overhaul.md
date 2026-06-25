# Hotspot Manager Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dev-only admin hotspot manager fast and easy — a live scene catalog, a thumbnail file picker with search and drag-drop upload, a compact editor that keeps every existing control, and no per-frame gaze raycast while editing.

**Architecture:** A Vite **dev-only** plugin (`apply: 'serve'`) exposes two endpoints — `GET /__admin/scenes` (live folder scan) and `POST /__admin/upload` (save + optimize + thumbnail). A browser data layer (`SceneCatalog`) reads the live endpoint in dev and falls back to the static `scenesManifest.json` otherwise. A new `ScenePicker` thumbnail grid replaces the 264-option `<select>`. `AdminPanel`'s editor is re-laid-out compactly. The 3D gaze raycast is gated off in admin mode.

**Tech Stack:** Vanilla JS ES modules, Three.js, Vite dev server middleware (Node `http`/`fs`), `ffmpeg` CLI for image scaling.

## Global Constraints

- **No test runner exists** (CLAUDE.md: "No test runner is configured. There is no linter either"). Do NOT add one. Verify each task with: `npm run build` (must succeed), dev-server checks via `curl`, and the browser preview tools. Each task still ends with a commit.
- **Admin is dev-only** — gated by `import.meta.env.PROD`. All new HTTP endpoints live in the Vite plugin with `apply: 'serve'` so they never ship in `npm run build`.
- **Hotspots stay in `localStorage`** via `AdminPersistence.saveHotspots(sceneId, hotspots)` + the existing debounced auto-save in `AdminPanel.markDirty()`. Do not change persistence.
- **`E:/VTD` is read-only** — never written by any code here. Uploads write only under `public/assets/<location>/Media/`.
- **Preserve every editor control** — see the field-inventory table in the spec `docs/superpowers/specs/2026-06-25-hotspot-manager-overhaul-design.md`. The compact editor is a layout change only; no control may be dropped.
- **Thumbnails** live in `public/assets/<location>/Media/.thumbs/<same-filename>`, ~320px. The `.thumbs/` dir must be excluded from every scene scan.
- **`ffmpeg` must be on PATH** (already required by `scripts/optimize-panoramas.mjs`).
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- Create `vite-plugins/thumb.js` — ffmpeg image helpers: `makeThumb()`, `optimizeImage()`.
- Create `vite-plugins/admin-fs.js` — the dev plugin (`adminFsPlugin()`): scenes list + upload.
- Create `scripts/generate-thumbs.mjs` — batch thumbnail generator.
- Create `src/utils/SceneCatalog.js` — browser catalog data layer (live + manifest fallback).
- Create `src/components/admin/ScenePicker.js` — thumbnail grid + search + dropzone popover.
- Modify `vite.config.js` — register `adminFsPlugin()`.
- Modify `src/main.js:679-683` — gate gaze in admin mode.
- Modify `src/components/admin/AdminPanel.js` — use `SceneCatalog`, replace `createSceneSelector` with a `ScenePicker` launch, compact layout (header, chip row, Advanced collapsible).
- Modify `CLAUDE.md` — document the live-vs-snapshot catalog.

---

## Task 1: ffmpeg image helpers + batch thumbnail script

**Files:**
- Create: `vite-plugins/thumb.js`
- Create: `scripts/generate-thumbs.mjs`

**Interfaces:**
- Produces: `makeThumb(srcPath, destPath, { force? }) → boolean`, `optimizeImage(srcPath, destPath, { width?, quality? }) → boolean` (both in `vite-plugins/thumb.js`).

- [ ] **Step 1: Create the ffmpeg helper module**

Create `vite-plugins/thumb.js`:

```js
/**
 * thumb.js — ffmpeg image helpers shared by the admin-fs dev plugin and the
 * batch thumbnail script. Each function only READS srcPath and WRITES destPath.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const THUMB_WIDTH = 320;   // px — small, ~20KB, enough for a picker tile
const FULL_WIDTH = 8192;   // px — matches optimize-panoramas.mjs

function run(args) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
    return r.status === 0;
}

/** Write a ~320px thumbnail of srcPath to destPath. Returns true on success. */
export function makeThumb(srcPath, destPath, { force = false } = {}) {
    if (!force && existsSync(destPath)) return true;
    mkdirSync(dirname(destPath), { recursive: true });
    return run(['-i', srcPath, '-vf', `scale=${THUMB_WIDTH}:-1`, '-q:v', '6', destPath]);
}

/** Write a web-sized (≤8192px) re-encoded copy of srcPath to destPath. */
export function optimizeImage(srcPath, destPath, { width = FULL_WIDTH, quality = 3 } = {}) {
    mkdirSync(dirname(destPath), { recursive: true });
    return run(['-i', srcPath, '-vf', `scale=${width}:-1`, '-q:v', String(quality), destPath]);
}
```

- [ ] **Step 2: Create the batch thumbnail script**

Create `scripts/generate-thumbs.mjs`:

```js
/**
 * generate-thumbs.mjs — make ~320px thumbnails for every panorama so the admin
 * ScenePicker stays light. Writes to public/assets/<loc>/Media/.thumbs/<file>.
 * Run:  node scripts/generate-thumbs.mjs            (skips existing)
 *       node scripts/generate-thumbs.mjs --force    (rebuild all)
 * Requires ffmpeg on PATH.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeThumb } from '../vite-plugins/thumb.js';

const ASSETS = 'public/assets';
const IMG_RE = /\.(jpe?g|png|webp)$/i;
const FORCE = process.argv.includes('--force');

let made = 0, skipped = 0, failed = 0;
for (const loc of readdirSync(ASSETS)) {
    const mediaDir = join(ASSETS, loc, 'Media');
    if (!existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) continue;
    const thumbsDir = join(mediaDir, '.thumbs');
    for (const f of readdirSync(mediaDir)) {
        if (!IMG_RE.test(f)) continue;
        const src = join(mediaDir, f);
        if (!statSync(src).isFile()) continue;
        const dest = join(thumbsDir, f);
        if (!FORCE && existsSync(dest)) { skipped++; continue; }
        if (makeThumb(src, dest, { force: FORCE })) { made++; console.log(`  ✓ ${loc}/${f}`); }
        else { failed++; console.warn(`  ✗ ${loc}/${f}`); }
    }
}
console.log(`\nThumbs: made=${made} skipped=${skipped} failed=${failed}`);
```

- [ ] **Step 3: Run the batch script**

Run: `node scripts/generate-thumbs.mjs`
Expected: prints `✓` lines and a final `Thumbs: made=264 skipped=0 failed=0` (counts may vary). A `.thumbs/` folder now exists inside each `Media/` folder with small JPGs.

- [ ] **Step 4: Verify a thumbnail is small and valid**

Run: `node -e "const{statSync}=require('fs');const f=require('fs').readdirSync('public/assets/Lagaligo/Media/.thumbs')[0];console.log(f, statSync('public/assets/Lagaligo/Media/.thumbs/'+f).size)"`
Expected: a filename and a byte size well under 100000 (≈10–40 KB).

- [ ] **Step 5: Commit**

```bash
git add vite-plugins/thumb.js scripts/generate-thumbs.mjs public/assets
git commit -m "feat: thumbnail pipeline (ffmpeg helper + batch generator)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: admin-fs Vite dev plugin (live scenes + upload)

**Files:**
- Create: `vite-plugins/admin-fs.js`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: `makeThumb`, `optimizeImage` from `vite-plugins/thumb.js`.
- Produces: dev endpoints `GET /__admin/scenes` → `[{ location, count, scenes:[{ filename, path, thumb }] }]`; `POST /__admin/upload?location=<loc>&name=<file>` (body = raw image bytes) → `{ filename, path, thumb, thumbOk }`. Plugin factory `adminFsPlugin()`.

- [ ] **Step 1: Create the plugin**

Create `vite-plugins/admin-fs.js`:

```js
/**
 * admin-fs.js — DEV-ONLY Vite plugin powering the admin hotspot manager.
 * apply:'serve' means it never ships in `vite build` (production).
 *   GET  /__admin/scenes                       → live folder scan
 *   POST /__admin/upload?location=&name=       → save + optimize + thumbnail
 * Writes only under public/assets/<loc>/Media/. Never touches E:/VTD.
 */
import { readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeThumb, optimizeImage } from './thumb.js';

const ASSETS = 'public/assets';
const IMG_RE = /\.(jpe?g|png|webp)$/i;
const BAD = (s) => !s || /[\\/]|\.\./.test(s);

function scanScenes() {
    const locations = [];
    for (const loc of readdirSync(ASSETS)) {
        const mediaDir = join(ASSETS, loc, 'Media');
        if (!existsSync(mediaDir) || !statSync(mediaDir).isDirectory()) continue;
        const scenes = readdirSync(mediaDir)
            .filter(f => IMG_RE.test(f) && statSync(join(mediaDir, f)).isFile())
            .sort()
            .map(f => ({
                filename: f,
                path: `assets/${loc}/Media/${f}`,
                thumb: `assets/${loc}/Media/.thumbs/${f}`,
            }));
        if (scenes.length) locations.push({ location: loc, count: scenes.length, scenes });
    }
    return locations;
}

function send(res, code, obj) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
}

export function adminFsPlugin() {
    return {
        name: 'admin-fs',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url || '';
                if (req.method === 'GET' && url.startsWith('/__admin/scenes')) {
                    try { send(res, 200, scanScenes()); }
                    catch (e) { send(res, 500, { error: String(e) }); }
                    return;
                }
                if (req.method === 'POST' && url.startsWith('/__admin/upload')) {
                    const params = new URLSearchParams(url.split('?')[1] || '');
                    const location = params.get('location') || '';
                    const name = params.get('name') || '';
                    if (BAD(location)) return send(res, 400, { error: 'bad location' });
                    if (BAD(name) || !IMG_RE.test(name)) return send(res, 400, { error: 'bad filename' });
                    const mediaDir = join(ASSETS, location, 'Media');
                    if (!existsSync(mediaDir)) return send(res, 400, { error: 'unknown location' });

                    const chunks = [];
                    req.on('data', (c) => chunks.push(c));
                    req.on('end', () => {
                        try {
                            const tmp = join(mediaDir, `.upload-tmp-${name}`);
                            writeFileSync(tmp, Buffer.concat(chunks));
                            const dest = join(mediaDir, name);
                            const optimized = optimizeImage(tmp, dest);
                            if (!optimized) writeFileSync(dest, Buffer.concat(chunks)); // fallback: store raw
                            try { unlinkSync(tmp); } catch {}
                            const thumbOk = makeThumb(dest, join(mediaDir, '.thumbs', name), { force: true });
                            send(res, 200, {
                                filename: name,
                                path: `assets/${location}/Media/${name}`,
                                thumb: `assets/${location}/Media/.thumbs/${name}`,
                                thumbOk,
                            });
                        } catch (e) { send(res, 500, { error: String(e) }); }
                    });
                    return;
                }
                next();
            });
        },
    };
}
```

- [ ] **Step 2: Register the plugin in vite.config.js**

Modify `vite.config.js` — add the import at top and put the plugin in the array:

```js
import { defineConfig } from 'vite';
import { adminFsPlugin } from './vite-plugins/admin-fs.js';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        cors: true,
        hmr: true,
        watch: {
            ignored: ['**/hotspots.json']
        }
    },
    plugins: [adminFsPlugin()]
});
```

- [ ] **Step 3: Start the dev server (background) and verify the scenes endpoint**

Run: `npm run dev` (in the background), then:
`curl -s http://localhost:5173/__admin/scenes | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.length,'locations', j.reduce((n,l)=>n+l.count,0),'scenes'); console.log(j[0].scenes[0]);})"`
Expected: prints the location count, total scene count, and a sample scene object with `filename`, `path`, and `thumb` keys.

- [ ] **Step 4: Verify production build excludes the plugin**

Run: `npm run build`
Expected: build succeeds. (The plugin uses `apply: 'serve'`, so it contributes nothing to the production bundle.)

- [ ] **Step 5: Commit**

```bash
git add vite-plugins/admin-fs.js vite.config.js
git commit -m "feat: admin-fs dev plugin (live scenes endpoint + upload)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: SceneCatalog browser data layer

**Files:**
- Create: `src/utils/SceneCatalog.js`

**Interfaces:**
- Consumes: `GET /__admin/scenes` (Task 2); `src/data/scenesManifest.json` (fallback).
- Produces: `SceneCatalog.getLocations() → Promise<Location[]>`, `SceneCatalog.refresh() → Promise<Location[]>`, `SceneCatalog.flat() → {filename,path,thumb,location}[]`. `Location = { location, count, scenes:[{filename,path,thumb}] }`.

- [ ] **Step 1: Create the data layer**

Create `src/utils/SceneCatalog.js`:

```js
/**
 * SceneCatalog — single source the admin reads for the scene list.
 * In dev it fetches the LIVE folder listing from the admin-fs plugin, so file
 * renames/adds/deletes show up immediately. If that fetch fails (e.g. a static
 * production preview) it falls back to the committed scenesManifest.json snapshot.
 */
import SCENES_MANIFEST from '../data/scenesManifest.json';

class SceneCatalogImpl {
    constructor() {
        this._locations = null;
    }

    /** Cached. Returns the catalog, fetching live data once if possible. */
    async getLocations() {
        if (this._locations) return this._locations;
        return this.refresh();
    }

    /** Force a re-fetch of the live catalog (call after an upload). */
    async refresh() {
        try {
            const res = await fetch('/__admin/scenes', { cache: 'no-store' });
            if (!res.ok) throw new Error(`status ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length) {
                this._locations = data;
                return data;
            }
        } catch (e) {
            console.warn('[SceneCatalog] live fetch failed, using manifest snapshot:', e.message);
        }
        this._locations = SCENES_MANIFEST || [];
        return this._locations;
    }

    /** Flatten every scene across locations (adds `location` to each scene). */
    flat() {
        return (this._locations || []).flatMap(
            (loc) => loc.scenes.map((s) => ({ ...s, location: loc.location }))
        );
    }
}

export const SceneCatalog = new SceneCatalogImpl();
```

- [ ] **Step 2: Verify it loads in the browser (live)**

With the dev server running, open the app, then in the browser preview run an eval:
`import('/src/utils/SceneCatalog.js').then(m => m.SceneCatalog.getLocations()).then(l => JSON.stringify({locations:l.length, scenes:l.reduce((n,x)=>n+x.count,0), sample:l[0].scenes[0]}))`
Expected: a string with non-zero `locations`/`scenes` and a `sample` having `filename`, `path`, `thumb`.

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: build succeeds (the JSON fallback import resolves; no dev-only code leaks).

- [ ] **Step 4: Commit**

```bash
git add src/utils/SceneCatalog.js
git commit -m "feat: SceneCatalog data layer (live catalog + manifest fallback)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: ScenePicker thumbnail popover

**Files:**
- Create: `src/components/admin/ScenePicker.js`

**Interfaces:**
- Consumes: `SceneCatalog` (Task 3); `POST /__admin/upload` (Task 2).
- Produces: `class ScenePicker` with `open({ location?, onSelect }) → void`. `onSelect(path:string)` is called with the chosen `assets/...` path (or `''` for "none"). Self-contained DOM overlay; renders only filtered thumbnails.

- [ ] **Step 1: Create the component**

Create `src/components/admin/ScenePicker.js`:

```js
/**
 * ScenePicker — a thumbnail grid popover for choosing a scene (hotspot target,
 * first-panorama, jump-to). Grouped by location, type-ahead filter, and an OS
 * drag-drop dropzone that uploads via the admin-fs plugin. Renders only the
 * filtered subset, so it stays fast with hundreds of scenes.
 */
import { SceneCatalog } from '../../utils/SceneCatalog.js';

export class ScenePicker {
    constructor() {
        this.onSelect = null;
        this._build();
    }

    _build() {
        this.overlay = document.createElement('div');
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0', zIndex: '10001',
            background: 'rgba(0,0,0,0.45)', display: 'none',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto', system-ui, sans-serif",
        });
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };

        this.panel = document.createElement('div');
        Object.assign(this.panel.style, {
            width: 'min(720px, 92vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        });
        this.overlay.appendChild(this.panel);

        const header = document.createElement('div');
        Object.assign(header.style, { display: 'flex', gap: '8px', padding: '12px', borderBottom: '1px solid #eee' });
        this.search = document.createElement('input');
        this.search.placeholder = 'Search scene or location…';
        Object.assign(this.search.style, { flex: '1', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none' });
        this.search.oninput = () => this._renderGrid();
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        Object.assign(closeBtn.style, { border: 'none', background: '#f3f4f6', borderRadius: '8px', width: '38px', cursor: 'pointer', fontSize: '15px' });
        closeBtn.onclick = () => this.close();
        header.appendChild(this.search);
        header.appendChild(closeBtn);
        this.panel.appendChild(header);

        this.grid = document.createElement('div');
        Object.assign(this.grid.style, { overflowY: 'auto', padding: '12px', flex: '1' });
        this.panel.appendChild(this.grid);

        this.drop = document.createElement('div');
        this.drop.textContent = 'Drop a photo here to add it to this location';
        Object.assign(this.drop.style, { padding: '10px 12px', borderTop: '1px dashed #d1d5db', textAlign: 'center', color: '#6b7280', fontSize: '12px' });
        this._wireDropzone();
        this.panel.appendChild(this.drop);

        document.body.appendChild(this.overlay);
    }

    async open({ location = null, onSelect } = {}) {
        this.onSelect = onSelect;
        this._uploadLocation = location;
        this.drop.style.display = location ? 'block' : 'none';
        this.overlay.style.display = 'flex';
        this.search.value = '';
        this.grid.textContent = 'Loading…';
        await SceneCatalog.getLocations();
        this._renderGrid();
        this.search.focus();
    }

    close() { this.overlay.style.display = 'none'; }

    _thumbUrl(scene) {
        return scene.thumb || scene.path.replace('/Media/', '/Media/.thumbs/');
    }

    _renderGrid() {
        const q = this.search.value.trim().toLowerCase();
        const locations = SceneCatalog._locations || [];
        this.grid.innerHTML = '';

        const noneBtn = document.createElement('button');
        noneBtn.textContent = '(none)';
        Object.assign(noneBtn.style, { display: 'block', margin: '0 0 12px', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '12px' });
        noneBtn.onclick = () => this._choose('');
        this.grid.appendChild(noneBtn);

        for (const loc of locations) {
            const matches = loc.scenes.filter(s =>
                s.filename.toLowerCase().includes(q) || loc.location.toLowerCase().includes(q));
            if (!matches.length) continue;

            const h = document.createElement('div');
            h.textContent = `${loc.location} (${matches.length})`;
            Object.assign(h.style, { fontSize: '12px', fontWeight: '600', color: '#374151', margin: '10px 0 6px' });
            this.grid.appendChild(h);

            const row = document.createElement('div');
            Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' });
            for (const s of matches) {
                row.appendChild(this._tile(s));
            }
            this.grid.appendChild(row);
        }
    }

    _tile(scene) {
        const tile = document.createElement('button');
        Object.assign(tile.style, { padding: '0', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer', overflow: 'hidden', textAlign: 'left' });
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = this._thumbUrl(scene);
        img.onerror = () => { img.onerror = null; img.src = scene.path; };
        Object.assign(img.style, { width: '100%', height: '70px', objectFit: 'cover', display: 'block', background: '#f3f4f6' });
        const cap = document.createElement('div');
        cap.textContent = scene.filename;
        Object.assign(cap.style, { fontSize: '11px', padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#374151' });
        tile.appendChild(img);
        tile.appendChild(cap);
        tile.onclick = () => this._choose(scene.path);
        return tile;
    }

    _choose(path) {
        this.onSelect?.(path);
        this.close();
    }

    _wireDropzone() {
        const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover'].forEach(ev => this.drop.addEventListener(ev, (e) => { stop(e); this.drop.style.background = '#eef2ff'; }));
        ['dragleave', 'drop'].forEach(ev => this.drop.addEventListener(ev, (e) => { stop(e); this.drop.style.background = ''; }));
        this.drop.addEventListener('drop', async (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (!file || !this._uploadLocation) return;
            this.drop.textContent = `Uploading ${file.name}…`;
            try {
                const url = `/__admin/upload?location=${encodeURIComponent(this._uploadLocation)}&name=${encodeURIComponent(file.name)}`;
                const res = await fetch(url, { method: 'POST', body: file });
                if (!res.ok) throw new Error((await res.json()).error || res.statusText);
                await SceneCatalog.refresh();
                this._renderGrid();
                this.drop.textContent = `Added ${file.name}`;
            } catch (err) {
                this.drop.textContent = `Upload failed: ${err.message}`;
            }
        });
    }
}
```

- [ ] **Step 2: Verify it opens and filters in the browser**

With the dev server running and the app open, in the preview run an eval:
`import('/src/components/admin/ScenePicker.js').then(m => { const p = new m.ScenePicker(); p.open({ onSelect: v => console.log('picked', v) }); return 'opened'; })`
Expected: returns `"opened"`; the picker overlay appears with thumbnail tiles grouped by location; typing in the search box narrows the grid; clicking a tile logs `picked <path>` and closes.

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ScenePicker.js
git commit -m "feat: ScenePicker thumbnail popover (search + drag-drop upload)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Gate gaze raycast off in admin mode

**Files:**
- Modify: `src/main.js:679-683`

**Interfaces:**
- Consumes: `this.panoramaViewer.isAdminMode` (already set by `PanoramaViewer.setAdminMode`).

- [ ] **Step 1: Gate the gaze update**

In `src/main.js`, replace the gaze block (currently lines 679-683):

```js
        // Gaze controller (handles dwell-to-click reticle)
        const interactables = this.getInteractables();
        if (this.gazeController) {
            this.gazeController.update(this.scene, interactables, delta);
        }
```

with (skip the per-frame raycast while editing — admin uses the mouse, not gaze):

```js
        // Gaze controller (handles dwell-to-click reticle). Skipped in admin mode:
        // editing is mouse-driven, so the per-frame raycast is pure overhead there.
        if (this.gazeController && !this.panoramaViewer?.isAdminMode) {
            const interactables = this.getInteractables();
            this.gazeController.update(this.scene, interactables, delta);
        }
```

- [ ] **Step 2: Verify gaze is gated in admin, active otherwise**

With the dev server running and the app open, in the preview run an eval that toggles admin and counts gaze raycasts. First confirm `isAdminMode` flips:
`(() => { const v = window.adminPanel.viewer; v.setAdminMode(true); const a = v.isAdminMode; v.setAdminMode(false); const b = v.isAdminMode; return JSON.stringify({ adminOn: a, adminOff: b }); })()`
Expected: `{"adminOn":true,"adminOff":false}`. (The render loop now reads this flag; with admin on, `gazeController.update` is not called.)

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "perf: skip gaze raycast while in admin mode" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire SceneCatalog + ScenePicker into AdminPanel (replace 264-option select)

**Files:**
- Modify: `src/components/admin/AdminPanel.js` (imports/constructor; `toggle` ~843; `renderForm` target section ~455-496; remove `createSceneSelector` usage)

**Interfaces:**
- Consumes: `SceneCatalog` (Task 3), `ScenePicker` (Task 4).
- Produces: `AdminPanel.refreshCatalog() → Promise<void>`; the Target control is now a button launching `this.scenePicker`.

- [ ] **Step 1: Add imports and picker instance**

In `src/components/admin/AdminPanel.js`, after the existing imports (lines 1-4) add:

```js
import { SceneCatalog } from '../../utils/SceneCatalog.js';
import { ScenePicker } from './ScenePicker.js';
```

In the constructor, immediately after `this.filteredScenes = this.availableScenes;` (line 19) add:

```js
        this.scenePicker = new ScenePicker();
```

- [ ] **Step 2: Add `refreshCatalog()` and call it when entering admin**

Add this method to the class (e.g. just before `setupKeyboardShortcuts()` at line 778):

```js
    /** Pull the live scene catalog (dev) so renames/adds show up without a script. */
    async refreshCatalog() {
        const locations = await SceneCatalog.getLocations();
        this.locations = locations;
        this.availableScenes = SceneCatalog.flat();
        this.filteredScenes = this.availableScenes;
    }
```

In `toggle()` (line 843), inside the `if (this.isAdminMode) {` branch (line 847), add a catalog refresh as the first line of that branch:

```js
            this.refreshCatalog();
```

- [ ] **Step 3: Replace the scene `<select>` with a ScenePicker launch button**

In `renderForm`, replace the `else { … createSceneSelector … }` target block. The current code (lines 455-496) ends with:

```js
            if (this.useCustomPath) {
                const pathInput = this.createInput(hotspot.target || '', (val) => {
                    hotspot.target = val;
                    this.markDirty();
                });
                pathInput.placeholder = 'assets/folder/scene.jpg';
                this.form.appendChild(pathInput);
            } else {
                this.form.appendChild(this.createSceneSelector(hotspot));
            }
```

Replace the `else` branch body so the list mode launches the picker instead of building a `<select>`:

```js
            if (this.useCustomPath) {
                const pathInput = this.createInput(hotspot.target || '', (val) => {
                    hotspot.target = val;
                    this.markDirty();
                });
                pathInput.placeholder = 'assets/folder/scene.jpg';
                this.form.appendChild(pathInput);
            } else {
                const pickBtn = this.createButton(
                    hotspot.target ? `→ ${hotspot.target.split('/').pop()}` : 'Choose target scene…',
                    '#4f46e5',
                    () => {
                        this.scenePicker.open({
                            location: this.currentLocationName(),
                            onSelect: (path) => {
                                hotspot.target = path;
                                this.markDirty();
                                this.renderForm(hotspot);
                            },
                        });
                    }
                );
                pickBtn.style.width = '100%';
                this.form.appendChild(pickBtn);
            }
```

- [ ] **Step 4: Add the `currentLocationName()` helper**

The picker's dropzone uploads into the scene's location. Add this helper to the class (near `refreshCatalog`):

```js
    /** Best-guess location folder for the current scene (for upload target). */
    currentLocationName() {
        const path = this.viewer.currentPath || '';
        const m = path.match(/assets\/([^/]+)\/Media\//);
        return m ? m[1] : null;
    }
```

- [ ] **Step 5: Delete the now-unused `createSceneSelector` method**

Remove the entire `createSceneSelector(hotspot) { … }` method (lines ~697-776) — it built the 264-option `<select>` that caused the per-keystroke rebuild. Nothing else calls it (verify with a search before deleting).

Run: `grep -rn "createSceneSelector" src/` — Expected: no matches after deletion.

- [ ] **Step 6: Verify the target picker works end-to-end in the browser**

With the dev server running, open the app, enter admin (`window.adminPanel.toggle()` if needed), select/create a hotspot of type arrow, click the new "Choose target scene…" button → the ScenePicker opens with thumbnails → click a tile. Then eval:
`(() => { const ap = window.adminPanel; const hs = ap.selectedHotspot; return JSON.stringify({ target: hs?.target, dirtyCleared: !ap.unsavedChanges }); })()`
Expected: `target` is the chosen `assets/...` path; the button label updates to `→ <filename>`; auto-save fires (dirty clears within ~1s).

- [ ] **Step 7: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/AdminPanel.js
git commit -m "feat: admin uses live SceneCatalog + ScenePicker for target selection" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Compact editor layout (header, hotspot chip row, Advanced collapsible)

**Files:**
- Modify: `src/components/admin/AdminPanel.js` (`initUI` panel width; `renderForm` density; new `renderHotspotChips`; `renderSceneInfo`)

**Interfaces:**
- Consumes: `this.viewer.getCurrentSceneHotspots()` (existing), `this.selectHotspot(hotspot)` (existing).
- Produces: `AdminPanel.renderHotspotChips() → void`.

- [ ] **Step 1: Add a hotspot chip row renderer**

Add this method to the class (near `renderSceneInfo`, line 239):

```js
    /** Render a compact clickable chip per hotspot in the current scene. */
    renderHotspotChips() {
        if (!this.chipRow) return;
        this.chipRow.innerHTML = '';
        const payload = this.viewer.getCurrentSceneHotspots?.();
        const hotspots = payload?.hotspots || [];
        hotspots.forEach((hs) => {
            const chip = document.createElement('button');
            chip.textContent = hs.label || hs.type || 'hotspot';
            const active = this.selectedHotspot === hs;
            Object.assign(chip.style, {
                fontSize: '11px', padding: '3px 9px', borderRadius: '999px', cursor: 'pointer',
                border: active ? '1px solid #4f46e5' : '0.5px solid #d1d5db',
                background: active ? '#eef2ff' : '#f9fafb',
                color: active ? '#4f46e5' : '#4b5563',
                whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis',
            });
            chip.onclick = () => { this.selectHotspot(hs); };
            this.chipRow.appendChild(chip);
        });
    }
```

- [ ] **Step 2: Create the chip-row container in `initUI` and shrink the panel**

In `initUI`, change the panel width from `width: '260px'` (line 49) to:

```js
            width: '300px',
```

Then, after the scene-info element is appended (search for where `renderSceneInfo` content/header is added in `initUI`), append a chip-row container. Add this block right after the header/scene-info is inserted into `this.container`:

```js
        this.chipRow = document.createElement('div');
        Object.assign(this.chipRow.style, {
            display: 'flex', gap: '6px', flexWrap: 'wrap',
            padding: '8px 12px', borderBottom: '1px solid #eee',
        });
        this.container.appendChild(this.chipRow);
```

(Place it above `this.form` so the chips sit between the header and the form. If `this.form` is created later, move this block to immediately precede the `this.form` append.)

- [ ] **Step 3: Keep the chip row in sync**

Call `this.renderHotspotChips()` at the end of `renderSceneInfo()` (line 239 method) and at the end of `selectHotspot(...)` (line ~854) and in the delete handler (line ~522, after `renderSceneInfo()`). Add the single line:

```js
        this.renderHotspotChips();
```

to each of those three places.

- [ ] **Step 4: Group Wrap + Custom Icon URL under an Advanced collapsible**

In `renderForm`, the Wrap toggle (lines 355-390) and the Custom Icon URL block (lines 396-428) are currently always shown. Wrap them in a `<details>` so the panel is shorter by default. Replace the construction of `wrapRow` … through the icon preview append with a details element that contains them:

```js
        // Advanced (collapsed): wrap toggle + custom icon URL + preview
        const adv = document.createElement('details');
        adv.style.marginTop = '12px';
        const advSummary = document.createElement('summary');
        advSummary.textContent = 'Advanced';
        Object.assign(advSummary.style, { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: '600', cursor: 'pointer', marginBottom: '8px' });
        adv.appendChild(advSummary);
```

Then change the subsequent `this.form.appendChild(...)` calls for the wrap row, the Custom Icon URL label, `iconInput`, and `iconPreviewWrapper` to append to `adv` instead of `this.form`, and finally append `adv` to the form:

```js
        adv.appendChild(wrapRow);
        adv.appendChild(this.createLabel('Custom Icon URL'));
        adv.appendChild(iconInput);
        adv.appendChild(iconPreviewWrapper);
        this.form.appendChild(adv);
```

(Concretely: keep building `wrapRow`, `iconInput`, `iconPreviewWrapper` exactly as today, but their parent becomes `adv`, not `this.form`. The Color picker stays directly in the form, above Advanced.)

- [ ] **Step 5: Tighten the sizing trio into one labelled grid**

The Icon Size / Text Size / Label Offset sliders (lines 318-353) are three stacked blocks. Leave their slider creation calls intact but place all three in the existing `sizesGrid` flex column with reduced gap, and move Label Offset into it (so they read as one compact group). Change `sizesGrid` gap from `'12px'` to `'8px'` and append the Label Offset column into `sizesGrid` instead of appending it separately to the form:

```js
        const offsetCol = document.createElement('div');
        offsetCol.appendChild(this.createLabel('Label Offset'));
        offsetCol.appendChild(this.createSlider(hotspot.labelOffset !== undefined ? hotspot.labelOffset : 0, -5, 10, 0.5, (val) => {
            hotspot.labelOffset = parseFloat(val);
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));
        sizesGrid.appendChild(offsetCol);
```

Remove the old standalone Label Offset label+slider appends (lines 347-353).

- [ ] **Step 6: Verify the compact editor in the browser (all controls present + working)**

With the dev server running, open the app, enter admin, and create two hotspots in a scene. Then visually confirm via a preview screenshot, and assert structure via eval:
`(() => { const ap = window.adminPanel; const chips = ap.chipRow.querySelectorAll('button').length; const hasAdvanced = !!ap.form.querySelector('details'); const sliders = ap.form.querySelectorAll('input[type=range]').length; return JSON.stringify({ chips, hasAdvanced, sliders }); })()`
Expected: `chips` ≥ 2 (one per hotspot), `hasAdvanced` is `true`, `sliders` is 3 (icon size, text size, label offset). Clicking a chip selects that hotspot (its label appears in the form). Take a `preview_screenshot` to confirm the panel is visibly shorter/denser.

- [ ] **Step 7: Verify auto-save round-trip still works**

In the preview, edit a hotspot label, wait ~1s, reload the scene, and confirm the label persisted (uses the existing localStorage auto-save):
`(() => { const ap = window.adminPanel, v = ap.viewer; const hs = ap.selectedHotspot; hs.label='Test Compact'; ap.markDirty(); return 'edited'; })()` then after ~1s eval `JSON.parse(localStorage.getItem('hotspots_'+window.adminPanel.viewer.currentPath)||'[]').map(h=>h.label)`
Expected: the array includes `"Test Compact"`.

- [ ] **Step 8: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/AdminPanel.js
git commit -m "feat: compact hotspot editor (header, chip row, Advanced collapsible)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Document the live-vs-snapshot catalog + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a docs note**

In `CLAUDE.md`, under the "Admin Panel" section, append:

```markdown
**Scene catalog (dev vs prod):** In dev, the admin reads a LIVE folder listing
from the `admin-fs` Vite plugin (`vite-plugins/admin-fs.js`, `GET /__admin/scenes`),
so renaming/adding/deleting a photo in `public/assets/<location>/Media/` shows up
immediately (use the ScenePicker's refresh). The committed
`src/data/scenesManifest.json` (built by `scripts/generate-scenes-manifest.mjs`)
is the production/offline fallback. Thumbnails for the picker live in
`Media/.thumbs/` — regenerate with `node scripts/generate-thumbs.mjs`. Dropping a
photo onto the ScenePicker uploads it (dev only) via `POST /__admin/upload`, which
optimizes it to ~8192px and makes a thumbnail.
```

- [ ] **Step 2: Full build + dev smoke check**

Run: `npm run build`
Expected: build succeeds with no reference to `/__admin/` endpoints in the output bundle.

Run (dev server up): `curl -s http://localhost:5173/__admin/scenes | head -c 80`
Expected: JSON beginning with `[{"location":`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document live dev scene catalog + thumbnail/upload flow" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** live catalog → Tasks 2,3; thumbnails → Task 1; drag-drop upload → Tasks 2,4; ScenePicker search → Task 4; gaze gating → Task 5; replace 264-option select → Task 6; compact editor preserving all fields → Task 7; prod fallback + docs → Tasks 3,8. All spec sections mapped.
- **Field preservation:** Task 7 keeps label, type, icon size, text size, label offset, wrap, color, custom icon URL (under Advanced), type-conditional Target/Custom-Path and info/photo customizer (untouched in `renderForm`), and delete. No control removed.
- **Type consistency:** `SceneCatalog.getLocations/refresh/flat`, `ScenePicker.open({location,onSelect})`, `adminFsPlugin()`, `makeThumb`/`optimizeImage` signatures are used identically across tasks.
- **No unit tests** by design (no runner) — verification is build + curl + browser preview, per Global Constraints.
