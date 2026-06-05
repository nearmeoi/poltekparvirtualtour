/**
 * initPolyfill.js
 * ---------------
 * Initializes the WebXR Polyfill for devices without native WebXR support.
 *
 * Rules:
 *  - iOS (Safari/Chrome): always needs polyfill (no native WebXR)
 *  - Android Chrome 79+: has native WebXR — DO NOT override with polyfill
 *  - Desktop with ?cardboard=true: forced polyfill for testing
 *
 * Must be imported BEFORE any WebXR code runs (i.e. at the top of main.js).
 */

import WebXRPolyfill from 'webxr-polyfill';

const needsPolyfill =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    new URLSearchParams(window.location.search).get('cardboard') === 'true';

if (needsPolyfill) {
    const polyfill = new WebXRPolyfill({
        cardboard: true,
        webvr: true,
        allowCardboardOnDesktop: false,
        cardboardConfig: {
            CARDBOARD_UI_DISABLED: false,
            ROTATE_INSTRUCTIONS_DISABLED: true,
            BUFFER_SCALE: 0.75
        }
    });
    console.log('WebXR Polyfill initialized (iOS/Cardboard):', polyfill);
} else {
    console.log('Using native WebXR (no polyfill needed)');
}
