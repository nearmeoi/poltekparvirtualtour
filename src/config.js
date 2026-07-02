/**
 * Application Configuration
 * Centralized constants for the WebVR application
 */

// API Base URL
export const API_BASE = 'https://api.neardev.my.id';

export const CONFIG = {
    // Renderer — main canvas. maxPixelRatio clamps DPR on high-density phones
    // to cap fill-rate (a DPR-3 budget phone renders 9x the pixels of DPR-1).
    renderer: {
        maxPixelRatio: 2,
        antialias: true,
        preserveDrawingBuffer: true
    },

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
        subtitleScale: 1.0,      // overall subtitle size multiplier (tunable in Settings)
    },

    // Menu Settings
    menu: {
        radius: 2.5,
        itemWidth: 1.8,          // orbital menu card width (world units)
        itemHeight: 1.2,         // orbital menu card height (world units)
        subMenuRadius: 1.8,
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

    // Background — vertical gradient of the placeholder environment sphere
    background: {
        radius: 80,
        topColor: '#404040',
        bottomColor: '#101010'
    },

    // Panorama Viewer
    panorama: {
        sphereRadius: 50,
        sphereSegments: { width: 64, height: 32 },  // parallax removed → modest segment count
        hotspotRadius: 3,        // default hotspot plane size (world units) when data.size unset
        loadingSpinnerSpeed: 0.1,
        textureCacheLimit: 8     // max panorama textures kept in memory (LRU eviction)
    },

    // Control Dock
    controlDock: {
        radius: 1.6,
        yPosition: -1.0,
        lookAtY: 0.6,
        followEaseSpeed: 0.08,
        lookDownThreshold: -0.45, // radians (~-26°)
        dockZ: -1.6,   // depth in front of camera (more negative = further)
        dockY: -0.9,   // vertical position
        dockX: 0,      // horizontal offset (+ = right)
    },

    // VR Settings
    vr: {
        cardboardIPD: 0.065,
        lensDistortion: 0.12,   // Cardboard barrel-distortion strength (StereoEffect)
        // Stereo path is the heaviest (2 scene renders + 2 post passes per frame).
        // Clamp DPR and MSAA here so budget phones don't tank FPS / overheat.
        stereoMaxPixelRatio: 2,
        stereoMSAASamples: 2,
        fadeTime: 500,
        swipeThreshold: 30,
        fullscreenPollInterval: 500,
        fullscreenDelay: 800
    }
};
