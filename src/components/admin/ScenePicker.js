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
        const locations = SceneCatalog.locations;
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
