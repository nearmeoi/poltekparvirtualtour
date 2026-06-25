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
