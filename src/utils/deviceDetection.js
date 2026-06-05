/**
 * Device Detection Utilities
 * Provides functions to detect iOS devices and WebXR support
 */

/**
 * Detects if the current device is running iOS
 * Includes detection for iPadOS (which reports as MacIntel)
 */
export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detects if the current device is running Android
 */
export function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}


/**
 * Detects if the browser supports WebXR API
 */
export function isWebXRSupported() {
    return 'xr' in navigator;
}

/**
 * Detects if the device supports DeviceOrientation events (gyroscope)
 */
export function hasGyroscope() {
    return 'DeviceOrientationEvent' in window;
}

/**
 * Requests permission for DeviceOrientation on iOS 13+
 * Returns a promise that resolves to true if permission granted
 */
export async function requestGyroscopePermission() {
    console.log('Detecting DeviceOrientationEvent.requestPermission...');
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            console.log('Gyroscope permission response:', permission);
            return permission === 'granted';
        } catch (e) {
            console.error('Gyroscope permission exception:', e);
            return false;
        }
    }
    console.log('Standard DeviceOrientationEvent.requestPermission not found or not required');
    return true;
}

/**
 * Detects if the device is mobile (touch-enabled)
 */
export function isMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Check if Cardboard mode is forced via URL parameter (?cardboard=true)
 * Useful for testing iOS Cardboard mode on PC
 */
export function isCardboardForced() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('cardboard') === 'true';
}
