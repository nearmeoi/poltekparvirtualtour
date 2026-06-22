import { AudioContextManager } from '../../utils/AudioContextManager.js';
import { DataService } from '../../data/DataService.js';
import { SubtitlePanel3D } from './SubtitlePanel3D.js';

export class NarrationController {
    constructor(bus, camera, scene) {
        this._bus = bus;
        this._audio = null;
        this._subtitles = [];
        // Bumped on every load/dispose so async caption fetches that resolve late
        // (after the user already moved to another scene) can be discarded.
        this._loadToken = 0;
        // Remember the current scene's data so the narration can be replayed
        // after it ends or is skipped (the audio element itself is disposed).
        this._lastSceneData = null;
        this._subtitlePanel = new SubtitlePanel3D(camera, scene);

        this._unsubscribe = this._bus.on('scene:loaded', ({ sceneData }) => this._loadScene(sceneData));
    }

    _loadScene(sceneData) {
        this._disposeAudio();
        this._lastSceneData = sceneData || null;
        if (!sceneData?.audio) return;

        const token = ++this._loadToken;
        this._subtitles = [];
        this._audio = new Audio(sceneData.audio);
        this._audio.volume = 0.8;

        AudioContextManager.resume().then(() => {
            if (this._loadToken !== token) return;
            this._audio?.play().catch(err => {
                console.warn('[NarrationController] Autoplay blocked:', err);
            });
        });

        // Captions: prefer external file (captions id), fall back to inline array.
        if (Array.isArray(sceneData.subtitles)) {
            this._subtitles = sceneData.subtitles;
        } else if (sceneData.captions) {
            DataService.getCaptions(sceneData.captions).then(cues => {
                if (this._loadToken === token) this._subtitles = cues || [];
            });
        }
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

    /** Restart this scene's narration from the beginning. */
    replay() {
        if (this._lastSceneData?.audio) this._loadScene(this._lastSceneData);
    }

    /**
     * Control-dock state for the narration buttons:
     * 'playing' | 'paused' | 'replay' (finished/skipped but replayable) | 'none'.
     */
    getState() {
        const a = this._audio;
        if (a && !a.paused && !a.ended) return 'playing';
        if (a && a.paused && !a.ended) return 'paused';
        if (this._lastSceneData?.audio) return 'replay';
        return 'none';
    }

    _disposeAudio() {
        // Invalidate any in-flight caption fetch so it can't repopulate subtitles.
        this._loadToken++;
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
