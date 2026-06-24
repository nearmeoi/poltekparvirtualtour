import { CONFIG } from '../config.js';

/**
 * SettingsStore — persists a small set of user-tuned CONFIG overrides to
 * localStorage and merges them back into CONFIG at startup. Pure data layer:
 * it knows nothing about the scene. Live-applying a change to running objects
 * (reticle, sphere, stereo) is the App's job — see App.applySetting().
 *
 * Overrides are stored as a flat map of dot-path -> value, e.g.
 *   { "gaze.reticleSize": 0.012, "vr.cardboardIPD": 0.062 }
 */
const STORAGE_KEY = 'vrSettings';

function getByPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setByPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => {
        if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
        return o[k];
    }, obj);
    target[last] = value;
}

export const SettingsStore = {
    _overrides: {},

    /** Load overrides from localStorage and merge into CONFIG. Call before the scene is built. */
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this._overrides = raw ? JSON.parse(raw) : {};
        } catch {
            this._overrides = {};
        }
        for (const [path, value] of Object.entries(this._overrides)) {
            setByPath(CONFIG, path, value);
        }
        return this._overrides;
    },

    /** Current effective value of a CONFIG path. */
    get(path) {
        return getByPath(CONFIG, path);
    },

    /** Set a CONFIG value by dot-path and persist it as an override. */
    set(path, value) {
        setByPath(CONFIG, path, value);
        this._overrides[path] = value;
        this._persist();
        return value;
    },

    /** True if the user has changed this path from its default. */
    isOverridden(path) {
        return Object.prototype.hasOwnProperty.call(this._overrides, path);
    },

    hasOverrides() {
        return Object.keys(this._overrides).length > 0;
    },

    /** Clear all overrides. CONFIG stays mutated in-memory until a reload. */
    reset() {
        this._overrides = {};
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },

    _persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._overrides)); } catch { /* ignore */ }
    },

    /** Readable snippet of the current overrides, for pasting into src/config.js. */
    exportSnippet() {
        const entries = Object.entries(this._overrides);
        if (!entries.length) return '// No settings changed from defaults.';
        const lines = entries.map(([p, v]) => `CONFIG.${p} = ${JSON.stringify(v)};`);
        return ['// VR calibration overrides (current values):', ...lines].join('\n');
    }
};
