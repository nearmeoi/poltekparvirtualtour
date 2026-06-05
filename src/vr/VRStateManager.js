import { CONFIG } from '../config.js';
import { FullscreenHelper } from '../utils/FullscreenHelper.js';
import { AudioContextManager } from '../utils/AudioContextManager.js';

export class VRStateManager {
    constructor(renderer, camera, bus) {
        this.renderer = renderer;
        this.camera   = camera;
        this.bus      = bus;

        // 'idle' | 'entering' | 'webxr' | 'cardboard' | 'exiting'
        this._mode = 'idle';
        this._stereoEffect = null;
    }

    setStereoEffect(stereoEffect) {
        this._stereoEffect = stereoEffect;
    }

    getMode()         { return this._mode; }
    isStereoscopic()  { return this._mode === 'cardboard'; }
    isPresenting()    { return this._mode === 'webxr' || this._mode === 'cardboard'; }

    async enterWebXR() {
        if (this._mode !== 'idle') return;
        this._mode = 'entering';

        try {
            await AudioContextManager.resume();
        } catch (err) {
            this._mode = 'idle';
            console.error('[VRStateManager] WebXR entry failed:', err);
            return;
        }

        // VRButton starts the actual XR session — call confirmWebXR() once it succeeds,
        // or reset() if it fails. Don't auto-commit here.
    }

    /**
     * Call this when VRButton confirms the XR session is actually running.
     * Separating this from enterWebXR() prevents the mode from getting stuck
     * in 'webxr' if VRButton fails after enterWebXR() was called.
     */
    confirmWebXR() {
        if (this._mode !== 'entering') return;
        this._mode = 'webxr';
        this.bus.emit('vr:entered', {
            mode: 'webxr',
            isStereoscopic: false,
            ipd: 0
        });
    }

    /** Force state back to idle — call this from VRButton's error/end handler. */
    reset() {
        this._mode = 'idle';
    }

    async enterCardboard() {
        if (this._mode !== 'idle') return;
        this._mode = 'entering';

        try {
            await AudioContextManager.resume();
            await FullscreenHelper.request(document.body);
            await FullscreenHelper.lockLandscape();

            if (this._stereoEffect) this._stereoEffect.enable();

            // Camera FOV for cardboard
            this.camera.fov = CONFIG.fov.vr;
            this.camera.updateProjectionMatrix();

            this._mode = 'cardboard';
            this.bus.emit('vr:entered', {
                mode: 'cardboard',
                isStereoscopic: true,
                ipd: CONFIG.vr.cardboardIPD
            });
        } catch (err) {
            this._mode = 'idle';
            console.error('[VRStateManager] Cardboard entry failed:', err);
        }
    }

    async exit() {
        if (this._mode === 'idle') return;
        const prevMode = this._mode;
        this._mode = 'exiting';

        if (prevMode === 'cardboard' && this._stereoEffect) {
            this._stereoEffect.disable();
            this.camera.fov = CONFIG.fov.default;
            this.camera.updateProjectionMatrix();
        }

        if (FullscreenHelper.isFullscreen()) {
            await FullscreenHelper.exit();
        }

        this._mode = 'idle';
        this.bus.emit('vr:exited', { prevMode });
    }
}
