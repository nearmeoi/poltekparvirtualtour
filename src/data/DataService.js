export const DataService = {
    _cache: {},
    _modules: import.meta.glob('./tours/*.json'),
    _captionModules: import.meta.glob('./captions/*.json'),

    /**
     * Lazily load a caption file (array of { start, end, text } cues) by id.
     * Returns [] when the id is missing or the file does not exist, so callers
     * can treat "no captions" as a normal case.
     */
    async getCaptions(id) {
        if (!id) return [];
        const cacheKey = `caption:${id}`;
        if (this._cache[cacheKey]) return this._cache[cacheKey];
        const loader = this._captionModules[`./captions/${id}.json`];
        if (!loader) {
            console.warn(`Captions not found: ${id}`);
            return [];
        }
        const mod = await loader();
        this._cache[cacheKey] = mod.default;
        return this._cache[cacheKey];
    },

    async getTour(id) {
        if (this._cache[id]) return this._cache[id];
        const loader = this._modules[`./tours/${id}.json`];
        if (!loader) throw new Error(`Tour not found: ${id}`);
        const mod = await loader();
        this._cache[id] = mod.default;
        return this._cache[id];
    },

    async getScenes(tourId) {
        return this.getTour(tourId);
    },

    async getHotspots(sceneId, tourId = 'makassar') {
        const scenes = await this.getTour(tourId);
        const scene = scenes.find(s => s.id === sceneId);
        return scene?.hotspots || [];
    }
};
