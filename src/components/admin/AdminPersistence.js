export const AdminPersistence = {
    async saveHotspots(sceneId, hotspots) {
        const key = `hotspots_${sceneId}`;
        try {
            localStorage.setItem(key, JSON.stringify(hotspots));
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
