import * as THREE from 'three';
import { StereoEffect } from './StereoEffect.js';
import { CardboardButton } from './CardboardButton.js';
import { CardboardUI } from './CardboardUI.js';
import { CONFIG } from '../../config.js';
import { iOSFullscreenHelper } from '../../utils/iOSFullscreenHelper.js';
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
import { AudioContextManager } from '../../utils/AudioContextManager.js';
import { isIOS } from '../../utils/deviceDetection.js';

/**
 * CardboardModeManager - Handles iOS Cardboard/Stereo VR mode
 * Extracted from main.js to reduce complexity
 */
export class CardboardModeManager {
    constructor(renderer, camera, controls, gyroscopeControls) {
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.gyroscopeControls = gyroscopeControls || null;

        this.stereoEffect = null;
        this.cardboardButton = null;
        this.cardboardUI = null;

        this.isCardboardMode = false;
        this.gyroscopeEnabled = false;

        // iOS fullscreen helper
        this.iOSFullscreen = new iOSFullscreenHelper();

        // Callbacks for component sync
        this.onModeChange = null;
    }

    /**
     * Initialize cardboard components (call for iOS/mobile devices)
     */
    init() {
        this.stereoEffect = new StereoEffect(this.renderer);
        this.cardboardButton = new CardboardButton(
            () => this.enter(),
            () => this.exit()
        );
        this.cardboardUI = new CardboardUI(
            () => this.exit(),
            (viewer) => this.onViewerChange(viewer)
        );
    }

    onViewerChange(viewer) {
        console.log('Viewer changed to:', viewer);
        if (this.onInteractionModeChange) {
            // v2 means button trigger, others use gaze timer for now
            const mode = (viewer === 'v2') ? 'button' : 'gaze';
            this.onInteractionModeChange(mode);
        }
    }

    /**
     * Enable the shared gyroscope controls instance (must be called after user gesture)
     */
    async enableGyroscope() {
        if (this.gyroscopeEnabled) return true;

        if (!this.gyroscopeControls) {
            console.warn('No gyroscopeControls instance provided to CardboardModeManager');
            return false;
        }

        try {
            console.log('Requesting gyroscope access...');
            const success = await this.gyroscopeControls.enable();

            if (success) {
                this.gyroscopeEnabled = true;
                console.log('Gyroscope controls enabled successfully');
                return true;
            } else {
                console.warn('Gyroscope enable failed (Permission denied or sensor unavailable)');
                return false;
            }
        } catch (err) {
            console.error('Error during gyroscope enable:', err);
            return false;
        }
    }

    /**
     * Enter Cardboard VR mode
     */
    async enter() {
        if (this.isCardboardMode) return;

        // Skip onboarding check
        const skipOnboarding = localStorage.getItem('skip-vr-onboarding') === 'true';
        if (!skipOnboarding && this.cardboardUI) {
            // Enter VR mode (Stereo) first so the modal is mirrored correctly
            await this.actuallyEnterVR();
            this.cardboardUI.showOnboarding((mode, dontShow) => {
                if (dontShow) {
                    localStorage.setItem('skip-vr-onboarding', 'true');
                    localStorage.setItem('vr-interaction-mode', mode);
                }
                if (this.onInteractionModeChange) this.onInteractionModeChange(mode);
            });
        } else {
            // Apply saved preference if skipped
            const savedMode = localStorage.getItem('vr-interaction-mode') || 'gaze';
            if (this.onInteractionModeChange) this.onInteractionModeChange(savedMode);
            await this.actuallyEnterVR();
        }
    }

    async actuallyEnterVR() {
        // Resume AudioContext if suspended (standard Web Audio policy)
        console.log('Resuming AudioContext if needed...');
        await AudioContextManager.resume();

        // Enable gyroscope if needed
        console.log('Enabling Gyroscope if needed...');
        if (!this.gyroscopeEnabled) {
            const gyroSuccess = await this.enableGyroscope();
            console.log('Gyro enable success:', gyroSuccess);
        }

        // Enable stereo effect
        if (this.stereoEffect) {
            this.stereoEffect.enable();
        }

        // Request fullscreen — BEST-EFFORT ONLY. requestFullscreen() can hang
        // indefinitely (or reject) in some browsers/embeds without ever resolving;
        // awaiting it previously stalled VR entry so the stereo split never started.
        // Fire it without blocking the rest of entry (same approach as LandingScreen).
        if (isIOS() && this.iOSFullscreen) {
            console.log('Using iOS video fullscreen hack...');
            this.iOSFullscreen.enterFullscreen()
                .then((success) => console.log('iOS fullscreen result:', success))
                .catch((e) => console.warn('iOS fullscreen failed (continuing):', e));
        } else {
            FullscreenHelper.request().catch((e) => console.warn('Fullscreen failed (continuing):', e));
        }

        // Set VR FOV
        this.camera.fov = CONFIG.fov.vr;
        this.camera.updateProjectionMatrix();

        this.isCardboardMode = true;

        // Show UI overlay (Mirrored HUD)
        if (this.cardboardUI) this.cardboardUI.show();

        // Notify listeners
        if (this.onModeChange) {
            this.onModeChange(true);
        }

        // ALWAYS keep touch controls enabled for accessibility
        // Gyroscope will ADD to the rotation, but touch swipe remains active
        if (this.controls) {
            this.controls.enabled = true;
            console.log('VR Control Mode: TOUCH ENABLED (Gyro will supplement if available)');
        }

        console.log('Entered Cardboard VR mode');
    }

    update() {
        // Only update GyroscopeControls if it has actually received valid data
        // Otherwise, it overwrites the camera quaternion with zeros, blocking OrbitControls
        if (this.isCardboardMode && this.gyroscopeEnabled && this.gyroscopeControls && this.gyroscopeControls.gotAnyData) {
            this.gyroscopeControls.update();
        }
    }

    /**
     * Exit Cardboard VR mode
     * @param {boolean} keepFullscreen - If true, don't exit fullscreen
     */
    async exit(keepFullscreen = false) {
        if (!this.isCardboardMode) return;

        // Exit fullscreen first and wait — disabling stereo before the browser
        // exits fullscreen causes a stretched non-stereo frame flash.
        if (!keepFullscreen) {
            await FullscreenHelper.exit();
        }

        // Sync button state
        if (this.cardboardButton) {
            this.cardboardButton.isInVR = false;
            this.cardboardButton.updateButtonStyle(false);
        }

        // Disable stereo effect
        if (this.stereoEffect) {
            this.stereoEffect.disable();
        }

        // Re-enable OrbitControls
        if (this.controls) {
            this.controls.enabled = true;
        }

        // Reset camera FOV
        this.camera.fov = CONFIG.fov.default;
        this.camera.updateProjectionMatrix();

        this.isCardboardMode = false;

        // Hide UI overlay
        if (this.cardboardUI) this.cardboardUI.hide();

        // Notify listeners
        if (this.onModeChange) {
            this.onModeChange(false);
        }

        console.log('Exited Cardboard VR mode');
    }

    /**
     * Render with stereo effect if in cardboard mode
     */
    render(scene, camera) {
        if (this.isCardboardMode && this.stereoEffect) {
            this.stereoEffect.render(scene, camera);
            return true;
        }
        return false;
    }

    dispose() {
        if (this.cardboardUI) this.cardboardUI.dispose();
        if (this.cardboardButton) this.cardboardButton.dispose?.();
    }
}
