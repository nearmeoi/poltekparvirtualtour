import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
import { isIOS, isAndroid } from '../../utils/deviceDetection.js';

/**
 * VROverlay.js
 * Multi-step VR instruction overlay like Google Cardboard.
 * Step 1: Ask for VR mode permission
 * Step 2: Detect orientation - show "Rotate to Landscape" or "Scroll down" based on orientation
 */
export class VROverlay {
    constructor(onEnterVR) {
        this.onEnterVR = onEnterVR;
        this.overlay = null;
        this.currentStep = 0;
        this.isLandscape = false;
        this.orientationHandler = null;
        this.isFullscreenAchieved = false;
        this.createOverlay();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'vr-instruction-overlay';

        // White background, Google Cardboard style
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            width: '100%',
            height: '100%',
            minWidth: '100vw',
            minHeight: '100vh',
            margin: '0',
            padding: '0',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            zIndex: '99999',
            display: 'none',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#333',
            fontFamily: "'Roboto', sans-serif"
        });

        document.body.appendChild(this.overlay);
    }

    show() {
        this.isFullscreenAchieved = false; // Reset so overlay can appear again
        this.overlay.style.display = 'flex';
        this.currentStep = 1;
        this.renderStep1();
    }

    hide() {
        this.overlay.style.display = 'none';
        this.cleanupScrollMode();
        this.stopOrientationWatch();
    }

    // Remove all iOS scroll-related modifications
    cleanupScrollMode() {
        document.documentElement.classList.remove('ios-scroll-active');
        document.body.classList.remove('ios-scroll-active');
        if (this.scrollSpacer && this.scrollSpacer.parentNode) {
            this.scrollSpacer.parentNode.removeChild(this.scrollSpacer);
            this.scrollSpacer = null;
        }
        window.scrollTo(0, 0);
    }

    // Step 1: VR Mode Permission
    renderStep1() {
        // If no gyroscope API at all, skip sensor permission and go to orientation check
        const hasGyroAPI = 'DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window;
        if (!hasGyroAPI) {
            console.log('No gyroscope API detected, skipping sensor permission step');
            this.goToStep2();
            return;
        }

        this.overlay.innerHTML = `
            <div class="vr-overlay-content">
                <div class="vr-overlay-logo">
                    <svg viewBox="0 0 24 24" fill="#EA4335"><path d="M20.74 6H3.21C2.55 6 2 6.57 2 7.28v10.44c0 .7.55 1.28 1.23 1.28h4.79c.52 0 .98-.34 1.14-.84l.99-3.11c.23-.71.88-1.19 1.62-1.19h.46c.74 0 1.39.48 1.62 1.19l.99 3.11c.16.5.63.84 1.14.84h4.79c.68 0 1.23-.57 1.23-1.28V7.28c0-.71-.55-1.28-1.26-1.28zM7.5 14.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                    <span>Google<br>Cardboard</span>
                </div>
                <p class="vr-overlay-desc">Untuk melanjutkan ke mode VR, izinkan akses sensor gyroscope dan accelerometer.</p>
                <div class="vr-overlay-actions">
                    <button id="vr-step1-continue" class="vr-overlay-btn primary">IZINKAN</button>
                    <button id="vr-step1-cancel" class="vr-overlay-btn secondary">BATAL</button>
                </div>
            </div>
        `;

        this.overlay.querySelector('#vr-step1-continue').addEventListener('click', () => {
            this.requestSensorPermission();
        });
        this.overlay.querySelector('#vr-step1-cancel').addEventListener('click', () => {
            this.hide();
        });
    }

    async requestSensorPermission() {
        // Request DeviceMotion/Orientation permission (iOS 13+)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response === 'granted') {
                    console.log('DeviceMotion permission granted');
                    this.goToStep2();
                } else {
                    alert('Izin sensor ditolak. Mode VR membutuhkan akses sensor.');
                }
            } catch (e) {
                console.log('DeviceMotion permission error:', e);
                // Fallback - proceed anyway (non-iOS or older iOS)
                this.goToStep2();
            }
        } else {
            // Not iOS 13+ or desktop - proceed directly
            console.log('DeviceMotion permission not required');
            this.goToStep2();
        }
    }

    // Step 2: Orientation Check
    goToStep2() {
        this.currentStep = 2;
        this.renderStep2();
        this.startOrientationWatch();
    }

    renderStep2() {
        this.checkOrientation();

        if (this.isLandscape) {
            // Android with native WebXR: Enter VR directly (skip swipe)
            // Android without WebXR: go through fullscreen flow (cardboard fallback)
            const hasWebXR = 'xr' in navigator;
            if (isAndroid() && hasWebXR) {
                console.log('Android + WebXR + Landscape: Auto-entering VR...');
                this.hide();
                if (this.onEnterVR) this.onEnterVR();
                return;
            }
            // Android without WebXR or iOS/Others: Show fullscreen instruction
            if (isAndroid() && !hasWebXR) {
                // Android fallback: use requestFullscreen API directly
                console.log('Android fallback + Landscape: Requesting fullscreen...');
                this._androidFullscreenAndEnter();
                return;
            }
            // iOS/Others: Show swipe instruction (needed for fullscreen)
            this.renderLandscapeInstruction();
        } else {
            this.renderPortraitInstruction();
        }
    }

    async _androidFullscreenAndEnter() {
        try {
            await FullscreenHelper.request(document.body);
            await FullscreenHelper.lockLandscape();
        } catch (err) {
            console.warn('[VROverlay] Fullscreen request failed, entering VR without fullscreen:', err);
        }
        // Always proceed — VR without fullscreen is degraded but usable
        this.hide();
        if (this.onEnterVR) this.onEnterVR();
    }

    renderPortraitInstruction() {
        this.overlay.innerHTML = `
            <div class="vr-overlay-content">
                <div class="vr-overlay-corner-logo">
                    <svg viewBox="0 0 24 24" fill="#EA4335"><path d="M20.74 6H3.21C2.55 6 2 6.57 2 7.28v10.44c0 .7.55 1.28 1.23 1.28h4.79c.52 0 .98-.34 1.14-.84l.99-3.11c.23-.71.88-1.19 1.62-1.19h.46c.74 0 1.39.48 1.62 1.19l.99 3.11c.16.5.63.84 1.14.84h4.79c.68 0 1.23-.57 1.23-1.28V7.28c0-.71-.55-1.28-1.26-1.28zM7.5 14.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                    <span>Google Cardboard</span>
                </div>
                <div class="vr-overlay-center">
                    <svg class="vr-overlay-gesture-icon" viewBox="0 0 100 100">
                        <rect x="30" y="15" width="40" height="70" rx="5" fill="none" stroke="#555" stroke-width="2.5"/>
                        <path d="M50 8 L58 16 L54 16 L54 24 L46 24 L46 16 L42 16 Z" fill="#555"/>
                        <text x="50" y="58" text-anchor="middle" font-size="10" fill="#999">90°</text>
                    </svg>
                    <p class="vr-overlay-instruction">Putar ponsel ke mode<br><strong>Landscape</strong></p>
                </div>
            </div>
        `;
    }

    renderLandscapeInstruction() {
        // If fullscreen was already achieved, skip overlay and enter VR directly
        if (this.isFullscreenAchieved) {
            this.hide();
            if (this.onEnterVR) this.onEnterVR();
            return;
        }

        // MUST record height BEFORE any CSS changes
        this.initialViewportHeight = window.innerHeight;
        console.log(`Initial viewport height recorded: ${this.initialViewportHeight}`);

        // Enable page scroll to hide address bar
        document.documentElement.classList.add('ios-scroll-active');
        document.body.classList.add('ios-scroll-active');

        // Add spacer element to make page taller than viewport
        if (!this.scrollSpacer) {
            this.scrollSpacer = document.createElement('div');
            this.scrollSpacer.id = 'ios-scroll-spacer';
            Object.assign(this.scrollSpacer.style, {
                width: '100%',
                height: '50vh',
                pointerEvents: 'none',
                background: 'transparent'
            });
            document.body.appendChild(this.scrollSpacer);
        }

        // Prime the scroll
        setTimeout(() => window.scrollTo(0, 1), 100);

        this.overlay.innerHTML = `
            <div class="vr-overlay-content">
                <div class="vr-overlay-corner-logo">
                    <svg viewBox="0 0 24 24" fill="#EA4335"><path d="M20.74 6H3.21C2.55 6 2 6.57 2 7.28v10.44c0 .7.55 1.28 1.23 1.28h4.79c.52 0 .98-.34 1.14-.84l.99-3.11c.23-.71.88-1.19 1.62-1.19h.46c.74 0 1.39.48 1.62 1.19l.99 3.11c.16.5.63.84 1.14.84h4.79c.68 0 1.23-.57 1.23-1.28V7.28c0-.71-.55-1.28-1.26-1.28zM7.5 14.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                    <span>Google Cardboard</span>
                </div>
                <div class="vr-overlay-center">
                    <svg class="vr-overlay-gesture-icon" viewBox="0 0 80 100">
                        <!-- Hand -->
                        <ellipse cx="40" cy="72" rx="16" ry="12" fill="none" stroke="#555" stroke-width="2"/>
                        <line x1="40" y1="60" x2="40" y2="22" stroke="#555" stroke-width="2.5"/>
                        <!-- Arrow -->
                        <path d="M30 32 L40 18 L50 32" stroke="#555" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
                    </svg>
                    <p class="vr-overlay-instruction">Geser ke atas untuk masuk<br><strong>Fullscreen Mode</strong></p>
                </div>
                <button id="vr-step2-enter" class="vr-overlay-btn primary">MASUK VR</button>
            </div>
        `;

        // Fallback button — lets user proceed if swipe detection fails on their device
        const enterBtn = this.overlay.querySelector('#vr-step2-enter');
        if (enterBtn) {
            enterBtn.addEventListener('click', () => {
                console.log('[VROverlay] Fallback button clicked');
                this.stopFullscreenWatch();
                this.hide();
                if (this.onEnterVR) this.onEnterVR();
            });
        }

        // Start watching for fullscreen (toolbar hide)
        this.startFullscreenWatch();
    }


    // Detect when browser toolbar is hidden using viewport/screen ratio
    startFullscreenWatch() {
        // Fullscreen check: ratio AND delta — prevents false-positive when device is
        // already in landscape with minimal browser chrome before the user swipes.
        const checkFullscreen = () => {
            const windowHeight = window.innerHeight;

            // Visual Viewport API (most accurate for iOS Safari)
            const visualViewport = window.visualViewport;
            const viewportHeight = visualViewport ? visualViewport.height : windowHeight;

            // Ratio vs shortest screen dimension (landscape: portrait height)
            const screenShort = Math.min(screen.width, screen.height);
            const heightRatio = viewportHeight / screenShort;

            // Require BOTH: near-screen-edge AND the viewport actually grew from baseline
            const baseline = this.initialViewportHeight || 0;
            const viewportGrew = (viewportHeight - baseline) > 30;
            const isFullscreen = heightRatio > 0.95 && viewportGrew;

            console.log(`FS check: viewport=${viewportHeight.toFixed(0)}, baseline=${baseline}, grew=${(viewportHeight - baseline).toFixed(0)}, ratio=${heightRatio.toFixed(3)}, full=${isFullscreen}`);

            return isFullscreen;
        };

        this.fullscreenHandler = () => {
            if (this.currentStep !== 2 || !this.isLandscape) return;

            if (checkFullscreen()) {
                console.log('Fullscreen detected! Entering VR...');
                this.isFullscreenAchieved = true;
                this.stopFullscreenWatch();
                this.hide();
                if (this.onEnterVR) this.onEnterVR();
            }
        };

        // Don't check immediately — wait for CSS layout to settle
        setTimeout(() => {
            // Visual Viewport API (paling akurat untuk iOS Safari)
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', this.fullscreenHandler);
            }

            // Fallback: window resize event
            window.addEventListener('resize', this.fullscreenHandler);

            // Periodic polling fallback (some browsers don't fire events)
            this.fullscreenPollInterval = setInterval(() => {
                this.fullscreenHandler();
            }, 500);
        }, 800);

        // Touch events for swipe detection
        this.touchStartY = 0;
        this.touchHandler = (e) => {
            if (e.type === 'touchstart') {
                this.touchStartY = e.touches[0].clientY;
            } else if (e.type === 'touchend') {
                const touchEndY = e.changedTouches[0].clientY;
                const swipeUp = this.touchStartY - touchEndY > 30;
                if (swipeUp) {
                    // Check after a delay for toolbar to hide
                    setTimeout(() => {
                        this.fullscreenHandler();
                        // If still on step 2 (not entered VR), reset scroll for retry
                        if (this.currentStep === 2) {
                            window.scrollTo(0, 0);
                            setTimeout(() => window.scrollTo(0, 1), 200);
                        }
                    }, 500);
                }
            }
        };

        this.overlay.addEventListener('touchstart', this.touchHandler, { passive: true });
        this.overlay.addEventListener('touchend', this.touchHandler, { passive: true });
    }

    stopFullscreenWatch() {
        if (this.fullscreenHandler) {
            window.removeEventListener('resize', this.fullscreenHandler);
            window.removeEventListener('scroll', this.fullscreenHandler);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this.fullscreenHandler);
            }
            this.fullscreenHandler = null;
        }
        if (this.fullscreenPollInterval) {
            clearInterval(this.fullscreenPollInterval);
            this.fullscreenPollInterval = null;
        }
        if (this.touchHandler && this.overlay) {
            this.overlay.removeEventListener('touchstart', this.touchHandler);
            this.overlay.removeEventListener('touchend', this.touchHandler);
            this.touchHandler = null;
        }
    }

    checkOrientation() {
        this.isLandscape = window.innerWidth > window.innerHeight;
    }

    startOrientationWatch() {
        this.orientationHandler = () => {
            const wasLandscape = this.isLandscape;
            this.checkOrientation();

            // Only re-render if orientation changed
            if (wasLandscape !== this.isLandscape && this.currentStep === 2) {
                this.stopFullscreenWatch(); // Stop old watcher
                this.renderStep2();
            }
        };

        window.addEventListener('resize', this.orientationHandler);
        window.addEventListener('orientationchange', this.orientationHandler);
    }

    stopOrientationWatch() {
        if (this.orientationHandler) {
            window.removeEventListener('resize', this.orientationHandler);
            window.removeEventListener('orientationchange', this.orientationHandler);
            this.orientationHandler = null;
        }
        this.stopFullscreenWatch();
    }

    dispose() {
        this.stopOrientationWatch();
        this.cleanupScrollMode();
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}

