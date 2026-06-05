/**
 * Application Configuration
 * Centralized constants for the WebVR application
 */

// API Base URL
export const API_BASE = 'https://api.neardev.my.id';

export const CONFIG = {
    // Camera FOV Settings
    fov: {
        default: 85,
        vr: 50,
        min: 30,
        max: 120
    },

    // Camera Position
    camera: {
        y: 0,         // eye level — was eyeLevel: 1.6
        zOffset: 0.1
    },

    // Layout — element Y positions; all 0 by default (eye level = y=0). Tune after testing.
    layout: {
        menuY: 0,
        subMenuOffsetY: 0,
        backButtonOffsetY: -0.9,
        videoPlayerY: 0,
        panoramaGroupY: 0,
    },

    // Narration — subtitle panel positioning and sizing
    narration: {
        subtitleDistance: 2.0,   // meters in front of camera
        subtitleY: -0.5,         // meters below camera.position.y
        subtitleWidth: 1.8,      // panel width in world units
        subtitleHeight: 0.25,    // panel height in world units
    },

    // Menu Settings
    menu: {
        radius: 2.5,
        itemWidth: 0.9,
        itemHeight: 0.6,
        subMenuRadius: 1.8,
        easeSpeed: 0.08,
        lookDownThreshold: -0.45,
        hoverScale: 1.2
    },

    // Gaze Controller
    gaze: {
        activationTime: 1.5,
        reticleDistance: 1.0,
        reticleSize: 0.008,
        triggerLockTime: 0.8
    },

    // Animation
    animation: {
        hoverScale: 1.15,
        buttonHoverScale: 1.1,
        playButtonHoverScale: 1.2,
        speed: 5,
        buttonSpeed: 6,
        dampingFactor: 0.05,
        rotateSpeed: 0.5
    },

    // Video Player
    video: {
        curvedRadius: 3.5,
        curvedHeight: 2.5,
        curvedSegments: 32,
        flatWidth: 5,
        flatHeight: 2.8,
        flatDistance: 4,
        gestureCooldown: 3.0,
        flickThreshold: 1.5
    },

    // Background
    background: {
        radius: 80,
        topColor: '#404040',
        bottomColor: '#101010'
    },

    // Panorama Viewer
    panorama: {
        sphereRadius: 50,
        sphereSegments: { width: 128, height: 64 },
        hotspotRadius: 4.5,
        loadingSpinnerSpeed: 0.1
    },

    // Control Dock
    controlDock: {
        radius: 1.6,
        yPosition: -1.0,
        lookAtY: 0.6,
        followEaseSpeed: 0.08,
        lookDownThreshold: -0.45 // radians (~-26°)
    },

    // Tour Director (Cinematic Mode)
    tour: {
        transitionDuration: 800,  // ms per phase
        peakFOV: 140,             // Wide "rushing" FOV
        motionBlur: 20,           // px blur at peak
        dockRadius: 1.8,
        dockFollowSpeed: 0.08
    },

    // VR Settings
    vr: {
        cardboardIPD: 0.065,
        fadeTime: 500,
        swipeThreshold: 30,
        fullscreenPollInterval: 500,
        fullscreenDelay: 800
    }
};
