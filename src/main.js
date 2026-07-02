/**
 * main.js — WebVR Virtual Tour Application Entry Point
 * =====================================================
 * Orchestrates all components: renderer, scene, VR, menus, panorama.
 *
 * Architecture:
 *   App class initializes sub-systems in this order:
 *   1. Renderer + Camera + Controls
 *   2. Scene (background, lighting)
 *   3. Components (gaze, panorama, orbital menu, info panels)
 *   4. WebXR / Cardboard fallback
 *   5. Input + Landing Screen
 *   6. Render loop
 */

import * as THREE from 'three';
import './style/index.css';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Utilities
import './utils/initPolyfill.js';
import { GyroscopeControls }    from './utils/GyroscopeControls.js';
import { iOSFullscreenHelper }  from './utils/iOSFullscreenHelper.js';
import { FullscreenHelper }     from './utils/FullscreenHelper.js';
import { isIOS, isAndroid, isMobile, isCardboardForced } from './utils/deviceDetection.js';

// Config & Data
import { CONFIG } from './config.js';

// EventBus + Core Systems
import { EventBus }       from './core/EventBus.js';

// Core Components
import { GazeController }  from './components/core/GazeController.js';
import { PanoramaViewer }  from './components/core/PanoramaViewer.js';
import { InputHandler }    from './components/core/InputHandler.js';

// Menu
import { OrbitalMenu } from './components/menu/OrbitalMenu.js';

// Narration
import { NarrationController } from './components/narration/NarrationController.js';

// VR Components
import { VROverlay }           from './components/vr/VROverlay.js';
import { CardboardModeManager } from './components/vr/CardboardModeManager.js';
import { XRDiagnostics }       from './utils/XRDiagnostics.js';
import { SettingsStore }       from './utils/SettingsStore.js';
import { SettingsPanel }       from './components/ui/SettingsPanel.js';
import { SettingsPanel3D }     from './components/ui/SettingsPanel3D.js';

// UI Components
import { LandingScreen } from './components/ui/LandingScreen.js';
import { InfoOverlay }   from './components/ui/InfoOverlay.js';
import { InfoPanel3D }   from './components/ui/InfoPanel3D.js';

class App {
    constructor() {
        // ── EventBus + Core Systems ─────────────────────────────────────────
        this.bus     = new EventBus();

        // ── Device Detection ────────────────────────────────────────────────
        this.isIOSDevice    = isIOS() || isCardboardForced();
        this.isAndroidDevice = isAndroid();
        this.isMobileDevice  = isMobile();
        console.log(`Device — iOS: ${this.isIOSDevice}, Android: ${this.isAndroidDevice}, Mobile: ${this.isMobileDevice}`);

        // iOS Fullscreen Helper (video fullscreen wrapper)
        if (this.isIOSDevice) {
            this.iOSFullscreenHelper = new iOSFullscreenHelper();
        }

        // VR Overlay (pre-VR instruction screen)
        this.vrOverlay = new VROverlay(() => this.startVRSession());

        // ── Application State ───────────────────────────────────────────────
        this.currentState    = 'welcome';
        this.isVRMode        = false;
        this.isGyroEnabled   = false;
        this.hasRealGyroscope = false;

        // Cardboard fallback (for devices without WebXR)
        this.useCardboardFallback = false;
        this.cardboardManager     = null;

        // Merge any saved user calibration into CONFIG BEFORE the scene is built,
        // so the camera/reticle/sphere are created with the tuned values.
        SettingsStore.load();

        // ── Initialization Sequence ─────────────────────────────────────────
        this.initRenderer();
        this.initCamera();
        this.initControls();
        this.initScene();
        this.initComponents();
        this.panoramaViewer?.updateDockPosition(); // apply persisted dock position

        this._setupBusListeners();

        this.initWebXR();
        this.initAdminPanel();

        // Input handler and landing screen run last (need all systems ready)
        this.inputHandler  = new InputHandler(this);
        this.settingsPanel = new SettingsPanel(this);
        this.settingsPanel3D = new SettingsPanel3D(this.scene, this.camera, (p, v) => this.applySetting(p, v));
        this._createSettingsFab();
        this.landingScreen = new LandingScreen(this);

        // ── Render Loop ─────────────────────────────────────────────────────
        this.clock = new THREE.Clock();
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    // ======================== RENDERER ========================

    initRenderer() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);

        // Debug label (hidden by default, visible only in dev mode)
        this.debugInfo = document.createElement('div');
        Object.assign(this.debugInfo.style, {
            position:     'fixed',
            bottom:       '10px',
            left:         '10px',
            fontSize:     '10px',
            color:        'rgba(255,255,255,0.5)',
            zIndex:       '10000',
            pointerEvents: 'none',
            fontFamily:   'monospace',
            display:      'none'
        });
        document.body.appendChild(this.debugInfo);

        this.renderer = new THREE.WebGLRenderer({
            antialias: CONFIG.renderer.antialias,
            preserveDrawingBuffer: CONFIG.renderer.preserveDrawingBuffer,
            // Force WebGL1 so the polyfill WebXR (canvas.getContext('webgl'))
            // doesn't conflict with a webgl2 context
            forceWebGL1: true
        });
        // Clamp DPR so high-density phones don't render far more pixels than needed.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.renderer.maxPixelRatio));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);
    }

    // ======================== CAMERA ========================

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.fov.default,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(0, CONFIG.camera.y, CONFIG.camera.zOffset);
    }

    // ======================== CONTROLS ========================

    initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping     = true;
        this.controls.dampingFactor     = CONFIG.animation.dampingFactor;
        this.controls.screenSpacePanning = false;
        this.controls.enableZoom        = false;
        this.controls.rotateSpeed       = CONFIG.animation.rotateSpeed;
        this.controls.target.set(0, CONFIG.camera.y, 0);

        // Gyroscope Controls — created here but NOT enabled yet.
        // enable() must be called from a user gesture (see LandingScreen).
        this.gyroscopeControls = new GyroscopeControls(this.camera, this.renderer.domElement);
    }

    // ======================== BUS LISTENERS ========================

    _setupBusListeners() {
        this.bus.on('vr:entered', ({ mode }) => {
            this.isVRMode = true;
            this._showVRModeBadge(mode);
            if (this.panoramaViewer) {
                this.panoramaViewer.setVRMode(true);
                this.panoramaViewer.setSettingsButtonVisible(true); // gear opens in-VR calibration
                if (this.panoramaViewer.currentPath && !this.panoramaViewer.group.visible) {
                    this.panoramaViewer.group.visible = true;
                }
            }
            if (this.vrButton)    this.vrButton.style.display = 'none';
            if (this.settingsFab) this.settingsFab.style.display = 'none'; // DOM hidden in immersive VR
        });

        this.bus.on('vr:exited', () => {
            this.isVRMode = false;
            if (this.panoramaViewer) {
                this.panoramaViewer.setVRMode(false);
                this.panoramaViewer.setSettingsButtonVisible(false);
            }
            this.settingsPanel3D?.hide();
            if (this.vrButton) {
                this.vrButton.style.display =
                    (this.vrButton.id === 'vr-goggle-button') ? 'flex' : '';
            }
            if (this.settingsFab) this.settingsFab.style.display = 'flex';
        });

        // Gear button (control-dock) toggles the in-VR settings panel.
        this.bus.on('ui:toggle-settings', () => this.settingsPanel3D?.toggle());

        // Scene history for back-type nav pins
        this._sceneHistory = [];

        // Navigation & Info hotspots
        this.bus.on('hotspot:click', ({ data, position }) => {
            if (data?.type === 'info') {
                this.infoPanel3D?.show(data, position);
            } else if (data?.type === 'back') {
                // Auto-navigate to previous scene; fall back to explicit target if no history
                const prev = this._sceneHistory.pop();
                const dest = prev ?? data.target;
                if (dest) this.panoramaViewer?.navigateToScene(dest);
            } else if (data?.target) {
                // Push current scene before navigating forward
                const cur = this.panoramaViewer?.currentSceneId;
                if (cur) this._sceneHistory.push(cur);
                this.panoramaViewer?.navigateToScene(data.target);
            }
        });
    }

    // ======================== WEBXR ========================

    initWebXR() {
        if (!navigator.xr) {
            console.log('No WebXR — using Cardboard fallback');
            this._setupCardboardFallback();
            return;
        }

        navigator.xr.isSessionSupported('immersive-vr').then(supported => {
            if (supported) {
                console.log('WebXR immersive-vr supported');
                this._setupWebXR();
            } else {
                console.log('WebXR not supported — using Cardboard fallback');
                this._setupCardboardFallback();
            }
        }).catch(e => {
            console.log('WebXR check failed, using Cardboard fallback:', e);
            this._setupCardboardFallback();
        });
    }

    /** Sets up the Three.js Cardboard stereo renderer as a WebXR fallback. */
    _setupCardboardFallback() {
        this.useCardboardFallback = true;
        this.cardboardManager = new CardboardModeManager(
            this.renderer, this.camera, this.controls, this.gyroscopeControls
        );
        this.cardboardManager.init();

        this.cardboardManager.onModeChange = (isVR) => {
            // Cardboard is split-screen stereo — GazeController needs isStereoscopic
            // to take its stereo reticle branch.
            if (isVR) this.bus.emit('vr:entered', { mode: 'cardboard', isStereoscopic: true, ipd: CONFIG.vr.cardboardIPD });
            else       this.bus.emit('vr:exited');
        };

        this.createVRButton();
        console.log('Cardboard fallback initialized');
    }

    /** Sets up native WebXR rendering path (Android Chrome / polyfill on iOS). */
    _setupWebXR() {
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType('local');
        this.xrDiag = new XRDiagnostics(this.renderer, () => this.panoramaViewer?.sphere);
        this.createVRButton();

        // Session start
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('WebXR session started');
            this.camera.fov = CONFIG.fov.vr;
            this.camera.updateProjectionMatrix();
            if (this.gyroscopeControls) this.gyroscopeControls.enabled = false;
            this.xrDiag?.reset();
            this.bus.emit('vr:entered', { mode: 'webxr', isStereoscopic: true });
        });

        // Session end
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('WebXR session ended');
            this.xrDiag?.showReport();
            this.camera.fov = CONFIG.fov.default;
            this.camera.updateProjectionMatrix();
            if (this.gyroscopeControls && this.isGyroEnabled) {
                this.gyroscopeControls.enabled = true;
            }
            this.bus.emit('vr:exited');

            // Restore renderer after VR polyfill session ends
            // (prevents "drawElements: no buffer" error)
            const resetRenderer = () => {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(window.devicePixelRatio);
            };
            resetRenderer();
            setTimeout(resetRenderer, 100);
            setTimeout(resetRenderer, 500);
            this.renderer.state.reset();
        });

        // VR controller (Cardboard v2 button / Android controller trigger).
        // Must be set up here — InputHandler is constructed before this async
        // method resolves, so renderer.xr.enabled is still false at that point.
        const vrController = this.renderer.xr.getController(0);
        vrController.addEventListener('select', () => {
            const gc = this.gazeController;
            if (gc?.hoveredObject) {
                console.log('[VR] Manual trigger via controller button');
                gc.trigger(gc.hoveredObject, gc.hoveredIntersect);
            }
        });
        this.scene.add(vrController);
    }

    /**
     * Briefly shows which VR path actually started, so it's obvious on-device
     * whether you're in native WebXR or the Cardboard fallback. Debug aid.
     */
    _showVRModeBadge(mode) {
        const label = mode === 'webxr' ? 'NATIVE WEBXR' : (mode === 'cardboard' ? 'CARDBOARD (custom)' : String(mode));
        let el = document.getElementById('vr-mode-badge');
        if (!el) {
            el = document.createElement('div');
            el.id = 'vr-mode-badge';
            Object.assign(el.style, {
                position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
                zIndex: '100000', background: 'rgba(0,0,0,0.8)', color: '#0ff',
                padding: '6px 14px', font: 'bold 14px/1 monospace',
                border: '1px solid #0ff', borderRadius: '6px', pointerEvents: 'none'
            });
            document.body.appendChild(el);
        }
        el.textContent = `VR: ${label}`;
        el.style.display = 'block';
        clearTimeout(this._vrBadgeTimer);
        this._vrBadgeTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
    }

    /**
     * Floating corner gear button (shown after Start) that opens the flat
     * settings panel on a normal screen. In immersive VR the DOM is hidden, so
     * the in-VR 3D panel is opened by the control-dock gear instead.
     */
    _createSettingsFab() {
        const btn = document.createElement('button');
        btn.id = 'settings-fab';
        btn.setAttribute('aria-label', 'Settings');
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="26" height="26">
                <path d="M19.14 12.94a7.49 7.49 0 0 0 .05-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>
            </svg>`;
        Object.assign(btn.style, {
            position: 'fixed', bottom: '84px', right: '25px',
            width: '50px', height: '50px', borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'none',
            alignItems: 'center', justifyContent: 'center', zIndex: '9999'
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.settingsPanel3D?.toggle(); // same in-scene panel used in VR; click −/+ with mouse
        });
        document.body.appendChild(btn);
        this.settingsFab = btn;
    }

    /** Creates the floating VR goggle button shown after the experience starts. */
    createVRButton() {
        const button = document.createElement('button');
        button.id = 'vr-goggle-button';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="32" height="32">
                <path d="M20.74 6H3.21C2.55 6 2 6.57 2 7.28v10.44c0 .7.55 1.28 1.23 1.28h4.79c.52 0 .98-.34 1.14-.84l.99-3.11c.23-.71.88-1.19 1.62-1.19h.46c.74 0 1.39.48 1.62 1.19l.99 3.11c.16.5.63.84 1.14.84h4.79c.68 0 1.23-.57 1.23-1.28V7.28c0-.71-.55-1.28-1.26-1.28zM7.5 14.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
        `;

        Object.assign(button.style, {
            position:       'fixed',
            bottom:         '20px',
            right:          '25px',
            width:          '50px',
            height:         '50px',
            borderRadius:   '50%',
            border:         '2px solid rgba(255, 255, 255, 0.8)',
            background:     'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(4px)',
            cursor:         'pointer',
            display:        'none',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         '9999',
            transition:     'all 0.3s ease'
        });

        button.onmouseenter = () => {
            button.style.transform   = 'scale(1.1)';
            button.style.background  = 'rgba(0, 0, 0, 0.5)';
            button.style.borderColor = 'white';
        };
        button.onmouseleave = () => {
            button.style.transform   = 'scale(1)';
            button.style.background  = 'rgba(0, 0, 0, 0.3)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        };

        // Show VR instruction overlay before entering VR
        button.addEventListener('click', () => {
            if (this.vrOverlay) this.vrOverlay.show();
        });

        document.body.appendChild(button);
        this.vrButton = button;
    }

    /** Called by VROverlay when user confirms "ENTER VR". */
    async startVRSession() {
        // Cardboard fallback path
        if (this.useCardboardFallback && this.cardboardManager) {
            console.log('Entering Cardboard fallback mode...');
            await this.cardboardManager.enter();
            return;
        }

        try {
            if (this.isIOSDevice) {
                console.log('iOS: Triggering scroll-to-hide trick...');
                await this.triggerIOSFullscreen();
            }
            const session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor']
            });
            this.renderer.xr.setSession(session);
            console.log('WebXR session started via overlay');
        } catch (e) {
            console.log('Failed to start WebXR session:', e.message);
        }
    }

    /**
     * iOS Safari trick: briefly make the page taller than the viewport,
     * then scroll so iOS hides the address bar.
     */
    triggerIOSFullscreen() {
        return new Promise((resolve) => {
            const originalHeight   = document.body.style.height;
            const originalOverflow = document.body.style.overflow;

            document.body.style.height   = (window.innerHeight + 100) + 'px';
            document.body.style.overflow = 'auto';

            setTimeout(() => {
                window.scrollTo(0, 1);
                setTimeout(() => {
                    document.body.style.height   = originalHeight || '';
                    document.body.style.overflow = originalOverflow || '';
                    window.scrollTo(0, 0);
                    console.log('iOS scroll trick completed');
                    resolve();
                }, 300);
            }, 100);
        });
    }

    // ======================== SCENE ========================

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.add(this.camera);

        this._createGradientBackground();

        // Hemisphere light — boosted intensity for VR brightness
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 10);
        this.scene.add(light);
    }

    /**
     * Creates a dark sphere with subtle grid lines that serves as the
     * environment background visible when no panorama is loaded.
     */
    _createGradientBackground() {
        const geometry = new THREE.SphereGeometry(CONFIG.background.radius, 32, 32);
        geometry.scale(-1, 1, 1);

        const canvas = document.createElement('canvas');
        canvas.width  = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const { width: w, height: h } = canvas;

        // Vertical gradient base (top → bottom)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, CONFIG.background.topColor);
        grad.addColorStop(1, CONFIG.background.bottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Horizon line + cardinal verticals (N/E/S/W)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        for (let i = 0; i < w; i += w / 4) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
        }
        ctx.stroke();

        // Zenith / Nadir rim markers
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w, 0);
        ctx.moveTo(0, h); ctx.lineTo(w, h);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({ map: texture });
        this.scene.add(new THREE.Mesh(geometry, material));
    }

    // ======================== COMPONENTS ========================

    initComponents() {
        // Gaze controller (reticle + dwell-to-click)
        this.gazeController = new GazeController(this.scene, this.camera, this.renderer, this.bus);

        // 2D info overlay (HTML)
        this.infoOverlay = new InfoOverlay();

        // 3D info panel (shown in VR / stereo mode)
        this.infoPanel3D = new InfoPanel3D(this.camera, this.scene);

        // Panorama viewer (main 360° scene renderer)
        this.panoramaViewer = new PanoramaViewer(
            this.scene,
            () => this.onPanoramaBack(),
            this.camera,
            this.renderer,
            this.bus
        );
        this.panoramaViewer.setInfoOverlay(this.infoOverlay);
        this.panoramaViewer.setInfoPanel3D(this.infoPanel3D);

        // Orbital Menu (main hub — shown before entering a panorama)
        this.orbitalMenu = new OrbitalMenu(this.scene, this.camera, (index) => {
            console.log('Orbital Menu selected:', index);
            this.orbitalMenu.hide();
            this.panoramaViewer.load(index);
            this.panoramaViewer.backBtn.visible = true;
        });
        this.orbitalMenu.hide(); // Hidden until user starts the experience

        // Narration controller — audio + subtitle system
        this.narrationController = new NarrationController(this.bus, this.camera, this.scene);
        this.panoramaViewer.setNarrationController(this.narrationController);
    }

    // ======================== ADMIN PANEL ========================

    initAdminPanel() {
        // AdminPanel and HotspotEditor are excluded from production builds (lazy import = tree-shaken by Vite)
        if (import.meta.env.PROD) {
            console.log('[AdminPanel] Disabled in production build.');
            return;
        }
        Promise.all([
            import('./components/admin/AdminPanel.js'),
            import('./components/core/HotspotEditor.js')
        ]).then(([{ AdminPanel }, { HotspotEditor }]) => {
            this.hotspotEditor = new HotspotEditor(this.panoramaViewer);
            this.adminPanel = new AdminPanel(this.panoramaViewer);
            window.adminPanel = this.adminPanel;
            window.hotspotEditor = this.hotspotEditor;
        });
    }

    // ======================== EVENT HANDLERS ========================

    /**
     * Called when the user taps the Back button inside a panorama.
     * Hides the panorama, resets state, and shows the Orbital Menu.
     */
    onPanoramaBack() {
        console.log('Back clicked — returning to Orbital Menu.');
        this.panoramaViewer.group.visible = false;
        this.panoramaViewer.hotspotManager.clearHotspots();
        this.panoramaViewer.currentSceneId = null;
        this.panoramaViewer.currentPath    = null; // Force full reload on next entry

        if (this.panoramaViewer.basicMaterial) {
            this.panoramaViewer.basicMaterial.map = null;
            this.panoramaViewer.basicMaterial.needsUpdate = true;
        }
        this.narrationController?.skip();

        this.currentState = 'menu';
        this.orbitalMenu.show();
    }

    // ======================== UTILITIES ========================

    /**
     * Returns the list of Three.js groups/objects that should be
     * tested by the raycaster for hover and click interactions.
     */
    getInteractables() {
        const list = [];
        // The in-VR settings panel is MODAL: while open, only its controls are
        // gaze-targets. Otherwise the gaze ray slips through the gaps between
        // buttons and selects hotspots / menu cards sitting behind the panel.
        if (this.settingsPanel3D?.visible) return [this.settingsPanel3D.group];

        if (this.panoramaViewer?.group?.visible) list.push(this.panoramaViewer.group);
        if (this.infoPanel3D?.group?.visible)    list.push(this.infoPanel3D.group);
        if (this.orbitalMenu?.group?.visible)    list.push(this.orbitalMenu.group);
        return list;
    }

    /**
     * Persist a tuned setting and apply it to the live scene immediately.
     * Called by SettingsPanel. Paths map to CONFIG dot-paths.
     */
    applySetting(path, value) {
        SettingsStore.set(path, value); // updates CONFIG + localStorage

        switch (path) {
            case 'gaze.reticleSize':
                this.gazeController?.setReticleSize(value);
                break;
            case 'gaze.reticleDistance':
                this.gazeController?.setReticleDistance(value);
                break;
            case 'gaze.activationTime':
                this.gazeController?.setDwellTime(value);
                break;
            case 'panorama.sphereRadius':
                this.panoramaViewer?.setSphereRadius(value);
                break;
            case 'narration.subtitleScale':
                this.narrationController?.setSubtitleScale(value);
                break;
            case 'controlDock.dockZ':
            case 'controlDock.dockY':
            case 'controlDock.dockX':
                this.panoramaViewer?.updateDockPosition();
                break;
            case 'vr.cardboardIPD':
                this.cardboardManager?.stereoEffect?.setEyeSeparation(value);
                break;
            case 'vr.lensDistortion':
                this.cardboardManager?.stereoEffect?.setDistortion(value);
                break;
            case 'fov.vr':
                // Applied on the next VR entry; if already in cardboard VR, apply now.
                if (this.cardboardManager?.isCardboardMode) {
                    this.camera.fov = value;
                    this.camera.updateProjectionMatrix();
                }
                break;
        }
    }

    // ======================== RENDER LOOP ========================

    render() {
        const delta = this.clock.getDelta();

        // Controls are mutually exclusive to avoid gyroscope / cardboard
        // being overridden by OrbitControls every frame.
        // Gyro only takes over once it has received at least one valid sensor event;
        // before that, OrbitControls serves as a touch-drag fallback.
        if (this.cardboardManager?.isCardboardMode) {
            this.cardboardManager.update();
        } else if (this.isGyroEnabled && this.gyroscopeControls?.gotAnyData) {
            this.gyroscopeControls.update();
        } else if (this.controls) {
            this.controls.update();
        }

        // Gaze controller (handles dwell-to-click reticle). Skipped in admin mode:
        // editing is mouse-driven, so the per-frame raycast is pure overhead there.
        if (this.gazeController && !this.panoramaViewer?.isAdminMode) {
            const interactables = this.getInteractables();
            this.gazeController.update(this.scene, interactables, delta);
        }

        // Per-frame component updates
        this.narrationController?.update(delta);
        this.panoramaViewer?.update(delta);
        this.panoramaViewer?.hotspotManager?.update();
        this.infoPanel3D?.update(delta);
        this.settingsPanel3D?.update(delta);
        if (this.orbitalMenu?.group.visible) {
            this.orbitalMenu.update(delta);
        }

        // XR stereo diagnostics (native WebXR only; no-op unless presenting)
        this.xrDiag?.capture();

        // Render — use Cardboard stereo if in cardboard mode, otherwise normal
        if (this.cardboardManager?.render(this.scene, this.camera)) {
            // Rendered by CardboardModeManager (stereo split-screen)
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // ======================== CLEANUP ========================

    dispose() {
        // Stop the render loop first so render() can't fire on half-torn-down state.
        this.renderer?.setAnimationLoop(null);

        this.inputHandler?.dispose();
        this.narrationController?.dispose();
        this.panoramaViewer?.dispose?.();
        this.orbitalMenu?.dispose?.();
        this.gazeController?.dispose?.();
        this.cardboardManager?.dispose?.();

        this.debugInfo?.remove();
        this.vrButton?.remove();
        this.container?.remove();
        this.renderer?.dispose();
    }
}

let app = new App();

// Dev hot-reload: tear down the old App and rebuild a fresh one *in place* so a
// stale render loop, narration audio, or 3D panels can't stack on top of a new
// App (which showed up as duplicated/overlapping subtitles in a long dev tab).
// accept() makes this module re-run on any update in its graph; dispose() runs
// first to fully clean up the previous App (it now stops the loop + disposes the
// renderer + removes the canvas). Both are required — dispose without accept
// kills the renderer without recreating the App.
if (import.meta.hot) {
    import.meta.hot.dispose(() => app?.dispose());
    import.meta.hot.accept();
}