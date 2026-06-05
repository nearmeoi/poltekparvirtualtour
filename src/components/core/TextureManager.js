import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this._cache = new Map();
        this._loader = new THREE.TextureLoader();
    }

    load(url) {
        if (this._cache.has(url)) {
            return Promise.resolve(this._cache.get(url));
        }
        return new Promise((resolve, reject) => {
            this._loader.load(
                url,
                (texture) => {
                    this._cache.set(url, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    preload(urls) {
        return Promise.allSettled(urls.map(url => this.load(url)));
    }

    get(url) {
        return this._cache.get(url) || null;
    }

    dispose(url) {
        const texture = this._cache.get(url);
        if (texture) {
            texture.dispose();
            this._cache.delete(url);
        }
    }

    disposeAll() {
        this._cache.forEach(texture => texture.dispose());
        this._cache.clear();
    }
}
