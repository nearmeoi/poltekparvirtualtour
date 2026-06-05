import { AudioContextManager } from '../../utils/AudioContextManager.js';
import { SubtitlePanel3D } from './SubtitlePanel3D.js';

export class NarrationController {
    constructor(bus, camera, scene) {
        this._bus = bus;
        this._audio = null;
        this._subtitles = [];
        this._subtitlePanel = new SubtitlePanel3D(camera, scene);

        this._unsubscribe = this._bus.on('scene:loaded', ({ sceneData }) => this._loadScene(sceneData));
    }

    _loadScene(sceneData) {
        this._disposeAudio();
        if (!sceneData?.audio) return;

        this._subtitles = sceneData.subtitles || [];
        this._audio = new Audio(sceneData.audio);
        this._audio.volume = 0.8;

        AudioContextManager.resume().then(() => {
            this._audio?.play().catch(err => {
                console.warn('[NarrationController] Autoplay blocked:', err);
            });
        });
    }

    update(delta) {
        this._subtitlePanel.update();

        if (!this._audio || this._audio.paused || this._audio.ended) {
            this._subtitlePanel.hide();
            return;
        }

        const t = this._audio.currentTime;
        const segment = this._subtitles.find(s => t >= s.start && t < s.end);
        if (segment) {
            this._subtitlePanel.show(segment.text);
        } else {
            this._subtitlePanel.hide();
        }
    }

    pause() {
        if (!this._audio) return;
        if (this._audio.paused) {
            this._audio.play().catch(() => {});
        } else {
            this._audio.pause();
            this._subtitlePanel.hide();
        }
    }

    isPaused() {
        return !this._audio || this._audio.paused;
    }

    skip() {
        this._disposeAudio();
    }

    isActive() {
        return this._audio !== null;
    }

    _disposeAudio() {
        if (this._audio) {
            this._audio.pause();
            this._audio.src = '';
            this._audio = null;
        }
        this._subtitles = [];
        this._subtitlePanel.hide();
    }

    dispose() {
        this._unsubscribe?.();
        this._disposeAudio();
        this._subtitlePanel.dispose();
    }
}
