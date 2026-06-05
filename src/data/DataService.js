export const DataService = {
    _cache: {},
    _modules: import.meta.glob('./tours/*.json'),

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
