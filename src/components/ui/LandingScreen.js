import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
import { AudioContextManager } from '../../utils/AudioContextManager.js';

/**
 * LandingScreen — Handles the landing page UI and initial setup
 * (fullscreen, landscape lock, gyroscope permission, panorama load).
 */
export class LandingScreen {
    /**
     * @param {object} app - The main App instance
     */
    constructor(app) {
        this.app = app;
        this._init();
    }

    _init() {
        const landingScreen = document.getElementById('landing-screen');
        const btnStart = document.getElementById('enter-vr-btn');

        const enterTour = () => {
            // Best-effort device setup. These run inside the click gesture (so iOS audio/gyro
            // permission prompts still fire), but are NEVER awaited on the critical path:
            // requestFullscreen() can hang indefinitely in some browsers/embeds without ever
            // resolving or rejecting, which previously left the user stuck on the landing
            // screen with no orbital menu. The menu must always appear after the click.
            FullscreenHelper.request()
                .then(() => FullscreenHelper.lockLandscape())
                .catch(() => {});

            // Resume audio context (required for autoplay policies)
            AudioContextManager.resume().catch(() => {});

            // Enable Gyroscope Controls (iOS 13+ permission must be requested from within the
            // user gesture — fire it now, but don't block the menu on the result).
            if (this.app.gyroscopeControls) {
                this.app.gyroscopeControls.enable()
                    .then((gyroEnabled) => {
                        this.app.isGyroEnabled = !!gyroEnabled;
                        // OrbitControls stays enabled as touch-drag fallback when gyro has no data
                        console.log(gyroEnabled
                            ? 'Gyroscope enabled for Magic Window mode'
                            : 'No gyroscope available, using OrbitControls');
                    })
                    .catch((e) => console.warn('Gyroscope enable failed:', e));
            }

            // Fade out landing screen
            landingScreen.style.opacity = '0';
            setTimeout(() => {
                landingScreen.style.display = 'none';
            }, 500);

            // Show Orbital Menu
            this.app.currentState = 'menu';
            console.log('Opening Orbital Menu...');
            if (this.app.orbitalMenu) {
                this.app.orbitalMenu.show();
            }

            if (this.app.gazeController) {
                this.app.gazeController.triggerLockTime = 1.0; // 1 second lock to prevent instant gaze selection
            }

            this.app.panoramaViewer.setBackButtonVisibility(false);
            this.app.panoramaViewer.setAudioButtonsPosition('standalone');

            // Show VR Button after user starts experience
            if (this.app.vrButton) {
                this.app.vrButton.style.display =
                    (this.app.vrButton.id === 'vr-goggle-button') ? 'flex' : '';
            }
        };

        if (btnStart) {
            btnStart.addEventListener('click', (e) => {
                e.stopPropagation();
                enterTour();
            });
        }
    }

}
