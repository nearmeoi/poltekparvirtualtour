import { SettingsStore } from '../../utils/SettingsStore.js';
import { isIOS, isAndroid, isMobile } from '../../utils/deviceDetection.js';
import { SETTINGS_SCHEMA } from '../../data/settingsSchema.js';

/**
 * SettingsPanel — a flat HTML overlay (works on every device, used BEFORE
 * entering VR) for live-tuning a few VR/reticle values. Reads/writes through
 * SettingsStore; live application to running objects is delegated to
 * App.applySetting(path, value).
 *
 * Knobs not active in the device's detected VR mode are greyed and annotated,
 * so no control is ever silently dead.
 */

const SCHEMA = SETTINGS_SCHEMA;

export class SettingsPanel {
    constructor(app) {
        this.app = app;
        this.root = null;
        this._rows = [];      // { def, input, valueEl, noteEl }
        this._vrMode = 'cardboard';
    }

    async open() {
        if (!this.root) this._build();
        await this._detectMode();
        this._syncValues();
        this.root.style.display = 'flex';
    }

    close() {
        if (this.root) this.root.style.display = 'none';
    }

    /** Resolve which VR mode this device will actually use. */
    async _detectMode() {
        let supported = false;
        try {
            supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
        } catch { supported = false; }
        this._vrMode = supported ? 'webxr' : 'cardboard';

        const device = isIOS() ? 'iOS' : isAndroid() ? 'Android' : (isMobile() ? 'Mobile' : 'Desktop');
        const modeLabel = supported ? 'Native WebXR' : 'Cardboard (custom stereo)';
        this._deviceEl.textContent = `Device: ${device}  ·  Native WebXR: ${supported ? 'yes' : 'no'}`;
        this._modeEl.textContent = `Active VR mode: ${modeLabel}`;

        // grey/annotate knobs that don't apply to this mode
        for (const r of this._rows) {
            const active = r.def.modes.includes(this._vrMode);
            r.input.disabled = !active;
            r.row.style.opacity = active ? '1' : '0.45';
            r.noteEl.textContent = active ? '' : `no effect in ${modeLabel}`;
        }
    }

    _syncValues() {
        for (const r of this._rows) {
            const v = SettingsStore.get(r.def.path);
            if (v != null) {
                r.input.value = v;
                r.valueEl.textContent = this._fmt(v, r.def);
            }
        }
    }

    _fmt(v, def) {
        const mult = def.displayMult || 1;
        const displayStep = def.step * mult;
        const decimals = (String(displayStep).split('.')[1] || '').length;
        return Number(v * mult).toFixed(decimals);
    }

    _build() {
        const root = document.createElement('div');
        root.id = 'settings-panel';

        const card = document.createElement('div');
        card.className = 'settings-card';

        const h = document.createElement('h2');
        h.textContent = 'VR Settings';
        card.appendChild(h);

        this._deviceEl = document.createElement('div');
        this._deviceEl.className = 'settings-device';
        this._modeEl = document.createElement('div');
        this._modeEl.className = 'settings-mode';
        card.appendChild(this._deviceEl);
        card.appendChild(this._modeEl);

        // group rows
        let lastGroup = null;
        for (const def of SCHEMA) {
            if (def.group !== lastGroup) {
                const g = document.createElement('div');
                g.className = 'settings-group';
                g.textContent = def.group;
                card.appendChild(g);
                lastGroup = def.group;
            }
            card.appendChild(this._buildRow(def));
        }

        // actions
        const actions = document.createElement('div');
        actions.className = 'settings-actions';

        const copyBtn = this._btn('Copy values', () => this._copy(copyBtn));
        const resetBtn = this._btn('Reset to defaults', () => this._reset());
        const doneBtn = this._btn('Done', () => this.close(), 'primary');

        actions.append(copyBtn, resetBtn, doneBtn);
        card.appendChild(actions);

        root.appendChild(card);
        root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
        document.body.appendChild(root);
        this.root = root;
    }

    _buildRow(def) {
        const row = document.createElement('label');
        row.className = 'settings-row';

        const head = document.createElement('div');
        head.className = 'settings-row-head';
        const name = document.createElement('span');
        name.textContent = def.label;
        const value = document.createElement('span');
        value.className = 'settings-value';
        head.append(name, value);

        const input = document.createElement('input');
        input.type = 'range';
        input.min = def.min; input.max = def.max; input.step = def.step;
        input.addEventListener('input', () => {
            const v = Number(input.value);
            value.textContent = this._fmt(v, def);
            this.app.applySetting(def.path, v);
        });

        const note = document.createElement('div');
        note.className = 'settings-note';

        row.append(head, input, note);
        this._rows.push({ def, input, valueEl: value, noteEl: note, row });
        return row;
    }

    _btn(text, onClick, variant) {
        const b = document.createElement('button');
        b.className = 'settings-btn' + (variant ? ' ' + variant : '');
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
    }

    async _copy(btn) {
        const text = SettingsStore.exportSnippet();
        const original = btn.textContent;
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = 'Copied!';
        } catch {
            // Clipboard blocked (insecure context) — show the text so it can be copied by hand.
            window.prompt('Copy these values:', text);
            btn.textContent = original;
        }
        setTimeout(() => { btn.textContent = original; }, 1500);
    }

    _reset() {
        SettingsStore.reset();
        // CONFIG was mutated in-memory; reload to rebuild everything at defaults.
        window.location.reload();
    }
}
