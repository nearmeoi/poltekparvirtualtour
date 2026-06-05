import * as THREE from 'three';
import { requestGyroscopePermission, hasGyroscope, isIOS } from '../utils/deviceDetection.js';

/**
 * GyroscopeControls - Provides device orientation-based camera control
 * Primarily for iOS devices where WebXR is not available
 */
export class GyroscopeControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.enabled = false;
        this.permissionGranted = false;

        // Device orientation values
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.screenOrientation = 0;

        // Helper objects for rotation
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X

        // Initial camera state
        this.initialQuaternion = new THREE.Quaternion();

        // Smoothing
        this.smoothedQuaternion = new THREE.Quaternion();
        this.smoothFactor = 0.3; // More responsive (0.1 was too laggy)

        // Bind handlers
        this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
        this.onScreenOrientation = this.onScreenOrientation.bind(this);
    }

    /**
     * Request permission and enable controls
     * Must be called from a user gesture (click/tap)
     */
    // window.orientation is deprecated on modern Android Chrome — use screen.orientation.angle as fallback
    _getScreenOrientation() {
        if (typeof window.orientation === 'number') return window.orientation;
        return screen.orientation?.angle ?? 0;
    }

    async enable() {
        if (!hasGyroscope()) {
            console.log('Gyroscope not available');
            return false;
        }

        // Request permission on iOS 13+
        if (isIOS()) {
            this.permissionGranted = await requestGyroscopePermission();
            if (!this.permissionGranted) {
                console.log('Gyroscope permission denied');
                return false;
            }
        } else {
            this.permissionGranted = true;
        }

        // Store initial camera orientation
        this.initialQuaternion.copy(this.camera.quaternion);
        this.smoothedQuaternion.copy(this.camera.quaternion);

        // Add event listeners (Standard + Absolute fallback for Android)
        window.addEventListener('deviceorientation', this.onDeviceOrientation, false);
        window.addEventListener('deviceorientationabsolute', this.onDeviceOrientation, false);
        window.addEventListener('orientationchange', this.onScreenOrientation, false);

        // Get initial screen orientation (landscape-safe)
        this.screenOrientation = this._getScreenOrientation();

        this.enabled = true;
        this.gotAnyData = false; // Track if we ever got valid data
        console.log('Gyroscope controls enabled, screenOrientation:', this.screenOrientation);
        return true;
    }

    disable() {
        window.removeEventListener('deviceorientation', this.onDeviceOrientation);
        window.removeEventListener('deviceorientationabsolute', this.onDeviceOrientation);
        window.removeEventListener('orientationchange', this.onScreenOrientation);
        this.enabled = false;
    }

    onDeviceOrientation(event) {
        if (!this.enabled) return;

        // Check for valid data (some browsers send empty/null initially)
        // Prefer absolute orientation data if available in the event (for absolute event type)
        const alpha = event.alpha;
        const beta = event.beta;
        const gamma = event.gamma;

        if (alpha === null || beta === null || gamma === null) return;

        // Only mark gotAnyData when at least one axis has moved —
        // some browsers fire the event with all zeros before real sensor data arrives.
        if (!this.gotAnyData && (Math.abs(alpha) > 0.0001 || Math.abs(beta) > 0.0001 || Math.abs(gamma) > 0.0001)) {
            this.gotAnyData = true;
        }

        this.deviceOrientation = {
            alpha: alpha ?? 0,
            beta:  beta  ?? 0,
            gamma: gamma ?? 0
        };
    }

    onScreenOrientation() {
        this.screenOrientation = this._getScreenOrientation();
    }

    update() {
        if (!this.enabled) return;

        const alpha = THREE.MathUtils.degToRad(this.deviceOrientation.alpha);
        const beta = THREE.MathUtils.degToRad(this.deviceOrientation.beta);
        const gamma = THREE.MathUtils.degToRad(this.deviceOrientation.gamma);
        const orient = THREE.MathUtils.degToRad(this.screenOrientation);

        // Set rotation order
        this.euler.set(beta, alpha, -gamma, 'YXZ');

        // Create quaternion from euler
        const targetQuaternion = new THREE.Quaternion();
        targetQuaternion.setFromEuler(this.euler);

        // Adjust for screen orientation
        targetQuaternion.multiply(this.q1);
        targetQuaternion.multiply(this.q0.setFromAxisAngle(this.zee, -orient));

        // Smooth the rotation
        this.smoothedQuaternion.slerp(targetQuaternion, this.smoothFactor);

        // Apply to camera
        this.camera.quaternion.copy(this.smoothedQuaternion);
    }

    dispose() {
        this.disable();
    }
}
