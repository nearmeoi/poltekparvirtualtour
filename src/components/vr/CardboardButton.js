import { isIOS, isMobile, isCardboardForced } from '../../utils/deviceDetection.js';

/**
 * Creates a VR button specifically for iOS devices
 * Triggers Cardboard-style stereo rendering with gyroscope
 */
export class CardboardButton {
    constructor(onEnterVR, onExitVR) {
        this.onEnterVR = onEnterVR;
        this.onExitVR = onExitVR;
        this.isInVR = false;
        this.button = null;

        // Create button for mobile devices OR when forced via URL (?cardboard=true)
        // Only if it's NOT an iOS device (iOS handled via landing screen or forced check)
        // Actually, the button should appear if WebXR is NOT supported.
        const supportsWebXR = 'xr' in navigator;
        if (isCardboardForced() || (isMobile() && !supportsWebXR) || isIOS()) {
            this.createButton();
        }
    }

    createButton() {
        this.button = document.createElement('button');
        this.button.id = 'cardboard-vr-button';

        this.updateButtonStyle(false);
        this.button.textContent = 'ENTER VR';

        this.button.addEventListener('click', () => {
            if (this.isInVR) {
                this.exitVR();
            } else {
                this.enterVR();
            }
        });

        document.body.appendChild(this.button);
    }

    updateButtonStyle(inVR) {
        if (!this.button) return;

        Object.assign(this.button.style, {
            position: 'absolute',
            bottom: '20px',
            padding: '12px 24px',
            border: '1px solid #fff',
            borderRadius: '4px',
            background: inVR ? 'rgba(255,100,100,0.6)' : 'rgba(0,0,0,0.6)',
            color: '#fff',
            font: 'bold 14px sans-serif',
            textAlign: 'center',
            cursor: 'pointer',
            zIndex: '999',
            left: '50%',
            transform: 'translateX(-50%)',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            display: inVR ? 'none' : 'block' // Hide in VR
        });

        this.button.textContent = inVR ? 'EXIT VR' : 'ENTER VR';
    }

    async enterVR() {
        if (this.isInVR) return;

        this.isInVR = true;
        this.updateButtonStyle(true);

        // Fullscreen + stereo are handled by CardboardModeManager.actuallyEnterVR()
        if (this.onEnterVR) this.onEnterVR();
    }

    exitVR() {
        if (!this.isInVR) return;

        this.isInVR = false;
        this.updateButtonStyle(false);

        // Fullscreen exit + orientation unlock are handled by CardboardModeManager.exit()
        if (this.onExitVR) this.onExitVR();
    }


    /**
 * Updates internal state if VR mode is triggered externally (e.g. from landing screen)
 */
    setVRState(isVR) {
        if (this.isInVR === isVR) return;
        this.isInVR = isVR;
        this.updateButtonStyle(isVR);

        // Also try full screen logic if entering
        if (isVR) {
            // Try to hide address bar on iOS
            window.scrollTo(0, 1);
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed'; // Prevents bounce
            document.body.style.width = '100%';
            document.body.style.height = '100%';
        } else {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
        }
    }

    dispose() {
        if (this.button && this.button.parentNode) {
            this.button.parentNode.removeChild(this.button);
        }
    }
}
