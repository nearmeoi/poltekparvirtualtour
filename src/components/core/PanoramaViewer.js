import * as THREE from 'three';
import { TOUR_DATA } from '../../data/tourData.js'; // Import data for reference if needed
import { CanvasUI } from '../../utils/CanvasUI.js';
import { AudioControls } from '../ui/AudioControls.js';
import { CONFIG } from '../../config.js';
// import HOTSPOTS_DATA from '../../data/hotspots.json'; // Removed static import
import { SCENE_MAP } from '../../data/sceneMap.js';
import { HotspotManager } from './HotspotManager.js';
import HOTSPOTS_DATA from '../../data/hotspots.json';

export class PanoramaViewer {
    constructor(scene, onBack, camera, renderer, bus) {
        this.scene = scene;
        this.onBack = onBack;
        this.camera = camera;
        this.renderer = renderer;
        this.panoramaBrightness = 1.0; // Default multiplier
        this.group = new THREE.Group();
        this.group.position.set(0, CONFIG.layout.panoramaGroupY, 0);
        this.scene.add(this.group);
        this.group.visible = false; // Hidden initially

        // State Tracking
        this.currentPath = null;
        this.currentSceneId = null;

        // Audio managed by NarrationController via scene:loaded event
        this.isAdminMode = false;

        // 1. Sphere Pano (radius must be < camera far clip)
        const geometry = new THREE.SphereGeometry(
            CONFIG.panorama.sphereRadius,
            CONFIG.panorama.sphereSegments.width,
            CONFIG.panorama.sphereSegments.height
        );
        geometry.scale(-1, 1, 1);

        // Basic material only - Boosted for maximum brightness
        this.basicMaterial = new THREE.MeshBasicMaterial({
            map: null,
            color: 0xffffff,
            toneMapped: false // Don't dim it with global tonemapping
        });

        // ControlDock camera following state
        this.dockCenterOffset = 0; // Will be set by setAudioButtonsPosition

        this.sphere = new THREE.Mesh(geometry, this.basicMaterial);
        this.group.add(this.sphere);

        // 2. Control Dock (follows camera)
        this.controlDock = new THREE.Group();
        this.group.add(this.controlDock);

        this.createBackButton();
        this.createNarrationButtons();
        this.createSettingsButton();
        this.audioControls = new AudioControls(this.controlDock);
        this.audioControls.setVisible(false); // Hide legacy buttons (we use Unified Dock now)
        this.createLoadingIndicator();

        this.textureLoader = new THREE.TextureLoader();
        this.isLoading = false;

        // Ensure GazeController can hit this
        this.group.userData.isInteractable = false; // Container not interactable

        // Optional bus — use no-op shim when not provided (bus wired in Task 19)
        this.bus = bus || null;
        const _bus = bus || { on: () => {}, emit: () => {}, off: () => {} };
        // Attach hotspots under this.group (not the bare scene) so they're inside
        // the interactable raycast tree — required for click/gaze nav + admin drag/select.
        this.hotspotManager = new HotspotManager(this.group, _bus);

        // Initialize Hotspots Data — start from bundled JSON, localStorage takes priority
        this.hotspotsData = HOTSPOTS_DATA || {};
        this.fetchHotspots(); // Fetch on init

        // Developer Back Feature
        this._navHistory = [];
        this._isNavigatingBack = false;

        if (import.meta.env.DEV) {
            window.addEventListener('keydown', (e) => {
                const activeTag = document.activeElement?.tagName;
                if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

                if (e.key === 'Backspace' || (e.key.toLowerCase() === 'b' && !e.shiftKey)) {
                    e.preventDefault();
                    this.navigateBack();
                } else if (e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    this.autoAddReturnHotspot();
                }
            });
        }
    }

    setInfoOverlay(overlay) {
        this.infoOverlay = overlay;
    }

    setInfoPanel3D(panel) {
        this.infoPanel3D = panel;
    }

    fetchHotspots() {
        // Offline: hotspots live in localStorage (`hotspots_<scenePath>`), written
        // by the admin panel — no backend. checkAndLoadHotspots reads localStorage
        // per scene directly, so just (re)load the current scene's hotspots here.
        // Don't wipe bundled HOTSPOTS_DATA — just refresh current scene from localStorage.
        if (this.currentPath) this.checkAndLoadHotspots(this.currentPath);
    }

    createBackButton() {
        // Same footprint as the narration buttons so BACK/PAUSE/SKIP form a uniform row.
        const geometry = new THREE.PlaneGeometry(0.2, 0.18);
        const canvas = CanvasUI.createIconButtonTexture('back', {
            width: 200,
            height: 180,
            radius: 40
        });

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.backBtn = new THREE.Mesh(geometry, material);
        this.backBtn.position.set(-0.3, CONFIG.layout.backButtonOffsetY, -1.6); // left slot of centered row
        this.backBtn.lookAt(0, CONFIG.layout.menuY, 0);

        this.backBtn.userData.isInteractable = true;
        this.backBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.animProgress = 1;
        this.backBtn.userData.label = 'Back Button';
        this.backBtn.userData.noReentryGuard = true;
        this.backBtn.userData.activationTime = 2.5; // Longer activation for back button to prevent accidental VR triggers
        this.backBtn.onHoverIn = () => this.backBtn.userData.targetScale.set(1.1, 1.1, 1.1);
        this.backBtn.onHoverOut = () => this.backBtn.userData.targetScale.copy(this.backBtn.userData.originalScale);
        this.backBtn.onClick = () => {
            if (this.onBack) this.onBack();
        };

        this.backBtn.visible = false; // Hidden by default as per user request (menu is "ga guna")
        this.controlDock.add(this.backBtn);
    }

    createNarrationButtons() {
        const makeBtn = (icon) => {
            const canvas = CanvasUI.createIconButtonTexture(icon, {
                width: 200, height: 180, radius: 40
            });
            const texture = new THREE.CanvasTexture(canvas);
            const mat = new THREE.MeshBasicMaterial({
                map: texture, transparent: true, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), mat);
            mesh.userData.isInteractable = true;
            mesh.userData.originalScale = new THREE.Vector3(1, 1, 1);
            mesh.userData.targetScale   = new THREE.Vector3(1, 1, 1);
            mesh.userData.animProgress  = 1;
            mesh.onHoverIn  = () => mesh.userData.targetScale.set(1.1, 1.1, 1.1);
            mesh.onHoverOut = () => mesh.userData.targetScale.copy(mesh.userData.originalScale);
            return { mesh, canvas };
        };

        const y = CONFIG.layout.backButtonOffsetY;

        // Pause / Resume button
        const { mesh: pauseMesh, canvas: pauseCanvas } = makeBtn('pause');
        this.pauseBtn = pauseMesh;
        this.pauseBtn.userData.label = 'Pause Button';
        this.pauseBtn.userData.noReentryGuard = true;
        this._pauseBtnCanvas = pauseCanvas;
        this.pauseBtn.position.set(0, y, -1.6); // centre slot
        this.pauseBtn.lookAt(0, CONFIG.layout.menuY, 0);
        this.pauseBtn.onClick = () => {
            const nc = this._narrationController;
            if (!nc) return;
            if (nc.getState() === 'replay') nc.replay();
            else nc.pause();
        };
        this.pauseBtn.visible = false;
        this.controlDock.add(this.pauseBtn);

        // Skip button
        const { mesh: skipMesh } = makeBtn('skip');
        this.skipBtn = skipMesh;
        this.skipBtn.userData.label = 'Skip Button';
        this.skipBtn.userData.noReentryGuard = true;
        this.skipBtn.position.set(0.3, y, -1.6); // right slot
        this.skipBtn.lookAt(0, CONFIG.layout.menuY, 0);
        this.skipBtn.onClick = () => { this._narrationController?.skip(); };
        this.skipBtn.visible = false;
        this.controlDock.add(this.skipBtn);

        this._narrationPaused = false;
    }

    /** Gear button on the control-dock that opens the in-VR settings panel. */
    createSettingsButton() {
        const canvas = CanvasUI.createIconButtonTexture('settings', { width: 200, height: 180, radius: 40 });
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        this.settingsBtn = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), material);
        this.settingsBtn.position.set(0.6, CONFIG.layout.backButtonOffsetY, -1.6); // right of the skip slot
        this.settingsBtn.lookAt(0, CONFIG.layout.menuY, 0);
        this.settingsBtn.userData.isInteractable = true;
        this.settingsBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.settingsBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.settingsBtn.userData.animProgress = 1;
        this.settingsBtn.userData.label = 'Settings Button';
        this.settingsBtn.userData.noReentryGuard = true;
        this.settingsBtn.onHoverIn = () => this.settingsBtn.userData.targetScale.set(1.1, 1.1, 1.1);
        this.settingsBtn.onHoverOut = () => this.settingsBtn.userData.targetScale.copy(this.settingsBtn.userData.originalScale);
        this.settingsBtn.onClick = () => this.bus?.emit('ui:toggle-settings');
        this.settingsBtn.visible = false;
        this.controlDock.add(this.settingsBtn);
    }

    setSettingsButtonVisible(visible) {
        if (this.settingsBtn) this.settingsBtn.visible = visible;
    }

    updateDockPosition() {
        const z = CONFIG.controlDock.dockZ ?? -1.6;
        const y = CONFIG.controlDock.dockY ?? -0.9;
        const x = CONFIG.controlDock.dockX ?? 0;
        if (this.backBtn)     this.backBtn.position.set(x - 0.3, y, z);
        if (this.pauseBtn)    this.pauseBtn.position.set(x + 0.0, y, z);
        if (this.skipBtn)     this.skipBtn.position.set(x + 0.3, y, z);
        if (this.settingsBtn) this.settingsBtn.position.set(x + 0.6, y, z);
    }

    setNarrationController(controller) {
        this._narrationController = controller;
    }

    setAudioButtonsPosition(mode, subLocationCount = 0, lastItemTheta = undefined) {
        // Delegate to AudioControls component
        if (mode === 'with-dock') {
            this.dockCenterOffset = 0.2; // Match SubMenu centerOffset
            this.audioControls.setPosition(mode, { subLocationCount, lastItemTheta });
        } else {
            this.dockCenterOffset = 0;
            this.audioControls.setPosition(mode);
        }
    }

    load(index) {
        const location = TOUR_DATA[index];
        if (!location) {
            console.error('Invalid location index:', index);
            return;
        }
        this.loadFromLocation(location);
    }

    loadFromLocation(location) {
        if (!location) {
            console.error('Invalid location');
            return;
        }

        this.currentLocation = location;
        this._stopVideo(); // clean up any previous 360° video

        // Audio is handled by NarrationController via scene:loaded event

        // Check for multi-scene data
        if (location.scenes && location.scenes.length > 0) {
            this.loadScene(location.scenes[0]);
            // Lazy load other scenes in background
            this.preloadScenes(location.scenes.slice(1));
        } else if (location.video) {
            // 360° video scene (dev only — served by videoFsPlugin)
            this.clearHotspots();
            this._loadVideoScene(location.video, location);
        } else if (location.panorama) {
            // Clear first so cached-texture sync path can't be undone by a later clear.
            this.clearHotspots();
            // Load with depth map if available
            this.loadTextureWithDepth(location.panorama, location.depthMap);

            // Emit scene:loaded so NarrationController picks up audio + subtitles
            if (this.bus) {
                this.bus.emit('scene:loaded', {
                    sceneId: location.id ?? location.panorama,
                    sceneData: location,
                });
            }
        }

        this.group.visible = true;

        // Reset controlDock rotation to face user when loading new location
        this.resetControlDockRotation();
    }

    loadScene(sceneData) {
        console.log('Loading scene:', sceneData.id);
        this.currentSceneId = sceneData.id; // Track ID
        this.loadTexture(sceneData.path);
        this.renderHotspots(sceneData.links);

        // Preload linked scenes in background
        if (sceneData.links && this.currentLocation) {
            const linkedPaths = sceneData.links
                .map(link => {
                    const linkedScene = this.currentLocation?.scenes?.find(s => s.id === link.target);
                    return linkedScene?.path;
                })
                .filter(Boolean);
            this.preloadTextures(linkedPaths);
        }

        if (this.bus) {
            this.bus.emit('scene:loaded', { sceneId: sceneData.id, sceneData });
        }
    }

    /**
     * Insert a texture into the cache as most-recently-used, evicting the
     * least-recently-used entries once over CONFIG.panorama.textureCacheLimit.
     * Never disposes the texture currently displayed (this.currentPath).
     */
    _cacheTexture(path, texture) {
        if (!this.textureCache) this.textureCache = new Map();
        // Re-insert so this path is most-recently-used (Map keeps insertion order).
        this.textureCache.delete(path);
        this.textureCache.set(path, texture);

        const limit = CONFIG.panorama.textureCacheLimit || 8;
        while (this.textureCache.size > limit) {
            const oldestKey = this.textureCache.keys().next().value;
            if (oldestKey === this.currentPath) {
                // In use — promote to MRU and stop rather than dispose a live texture.
                const live = this.textureCache.get(oldestKey);
                this.textureCache.delete(oldestKey);
                this.textureCache.set(oldestKey, live);
                break;
            }
            const oldTex = this.textureCache.get(oldestKey);
            this.textureCache.delete(oldestKey);
            if (oldTex && oldTex.dispose) oldTex.dispose();
            console.log('Evicted texture from cache (LRU):', oldestKey);
        }
    }

    loadTexture(path) {
        this._stopVideo(); // clean up any active 360° video
        this.currentPath = path; // Track Path

        // PROTOTYPE MODE: If path starts with "placeholder", generate strictly procedural texture
        if (path && path.startsWith('placeholder')) {
            // Extract zone name/number for display
            // e.g. "placeholder_zone1"
            this.loadFallbackTexture(path.replace('placeholder_', 'ZONE ').toUpperCase());
            this.hideLoading();
            return;
        }

        // Check cache first
        if (this.textureCache && this.textureCache.has(path)) {
            console.log('Using cached texture:', path);
            const cachedTexture = this.textureCache.get(path);
            // LRU touch: re-insert so this path becomes the most-recently-used.
            this.textureCache.delete(path);
            this.textureCache.set(path, cachedTexture);
            this.basicMaterial.map = cachedTexture;
            this.basicMaterial.needsUpdate = true;
            // Ensure sphere uses basic material (not parallax from previous location)
            this.sphere.material = this.basicMaterial;
            this.useParallax = false;
            this.hideLoading(); // Ensure loading is hidden immediately
            console.log('Texture loaded from cache. Loading hotspots...');
            this.checkAndLoadHotspots(path);
            return;
        }


        // Show loading indicator
        this.showLoading();

        this.textureLoader.load(
            path,
            (texture) => {
                // No colorSpace: raw JPEG bytes pass straight to screen (LinearSRGBColorSpace output)
                this._cacheTexture(path, texture);

                this.basicMaterial.map = texture;
                this.basicMaterial.needsUpdate = true;
                // Ensure sphere uses basic material (not parallax from previous location)
                this.sphere.material = this.basicMaterial;
                this.useParallax = false;
                // Hide loading indicator
                this.hideLoading();
                console.log('Texture load complete. Loading hotspots for:', path);
                this.checkAndLoadHotspots(path);
            },
            (xhr) => {
                // Progress
                // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.warn('Error loading panorama (using fallback):', path);
                this.loadFallbackTexture('ZONE ' + (this.currentLocation?.id || '?'));
                this.hideLoading();
            }
        );
    }

    /**
     * Load panorama texture (Depth map support removed)
     */
    loadTextureWithDepth(colorPath, depthPath) {
        // We ignore depthPath now as parallax is removed.
        // Just call standard loadTexture
        this.loadTexture(colorPath);
    }

    // Preload multiple textures in background (lazy loading)
    preloadTextures(paths) {
        if (!this.textureCache) this.textureCache = new Map();
        if (!this.pendingTextures) this.pendingTextures = new Set();

        paths.forEach(path => {
            // Skip if already cached OR matches current texture (optimization)
            if (!path || this.textureCache.has(path)) return;

            // Skip if already being loaded
            if (this.pendingTextures.has(path)) return;

            this.pendingTextures.add(path); // Mark as pending

            // Load in background without showing loading indicator
            this.textureLoader.load(
                path,
                (texture) => {
                    this._cacheTexture(path, texture);
                    this.pendingTextures.delete(path); // Remove from pending
                    console.log('Preloaded texture:', path);
                },
                undefined,
                (error) => {
                    console.warn('Failed to preload:', path, error);
                    this.pendingTextures.delete(path); // Remove from pending on error too
                }
            );
        });
    }

    // Preload scenes array
    preloadScenes(scenes) {
        if (!scenes || scenes.length === 0) return;
        const paths = scenes.map(s => s.path).filter(Boolean);
        this.preloadTextures(paths);
    }

    createLoadingIndicator() {
        // Create a simple loading overlay
        this.loadingGroup = new THREE.Group();
        this.loadingGroup.visible = false;

        // Dark semi-transparent background sphere
        const bgGeometry = new THREE.SphereGeometry(49, 32, 32);
        bgGeometry.scale(-1, 1, 1);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            opacity: 0.7,
            transparent: true
        });
        this.loadingBg = new THREE.Mesh(bgGeometry, bgMaterial);
        this.loadingGroup.add(this.loadingBg);

        // 1. Static Spinner Texture (No redraw loop)
        const spinnerCanvas = CanvasUI.createLoadingTexture();
        const spinnerTexture = new THREE.CanvasTexture(spinnerCanvas);
        const spinnerGeom = new THREE.PlaneGeometry(0.5, 0.5);
        const spinnerMat = new THREE.MeshBasicMaterial({
            map: spinnerTexture,
            transparent: true,
            depthTest: false
        });

        this.loadingSpinner = new THREE.Mesh(spinnerGeom, spinnerMat);
        this.loadingSpinner.position.set(0, 0, -2);
        this.loadingSpinner.renderOrder = 1000;
        this.loadingGroup.add(this.loadingSpinner);

        // 2. Static Text Texture (Separate, so it doesn't rotate)
        const textCanvas = CanvasUI.createLoadingTextTexture();
        const textTexture = new THREE.CanvasTexture(textCanvas);
        // Aspect ratio of text canvas 256x64 is 4:1
        const textGeom = new THREE.PlaneGeometry(0.5, 0.125);
        const textMat = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            depthTest: false
        });
        this.loadingText = new THREE.Mesh(textGeom, textMat);
        this.loadingText.position.set(0, -0.4, -2); // Below spinner
        this.loadingText.renderOrder = 1000;
        this.loadingGroup.add(this.loadingText);

        this.group.add(this.loadingGroup);
        this.loadingRotation = 0;
    }

    updateLoadingSpinner() {
        if (!this.loadingGroup.visible) return;
        // Simple rotation on GPU is extremely cheap
        if (this.loadingSpinner) {
            this.loadingSpinner.rotation.z -= 0.1;
        }
    }

    /**
     * Update loading indicator to follow camera direction
     * Unlike controlDock, loading always follows immediately (no threshold)
     */
    updateLoadingPosition() {
        if (!this.loadingGroup?.visible || !this.camera) return;

        // Get camera's horizontal direction
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);

        // Calculate target angle (face the camera)
        const targetAngle = Math.atan2(cameraDirection.x, cameraDirection.z) + Math.PI;

        // Smoothly rotate to target
        let currentAngle = this.loadingGroup.rotation.y;
        let diff = targetAngle - currentAngle;

        // Normalize difference to [-PI, PI]
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        // Fast follow for loading indicator
        this.loadingGroup.rotation.y += diff * 0.15;
    }

    showLoading() {
        this.isLoading = true;
        if (this.loadingGroup) {
            this.loadingGroup.visible = true;
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.loadingGroup) {
            this.loadingGroup.visible = false;
        }
    }

    renderHotspots(hotspots) {
        this.hotspotManager.loadHotspots(hotspots);
    }

    clearHotspots() {
        this.hotspotManager.clearHotspots();
    }

    navigateToScene(target) {
        // Ensure panorama is visible
        this.group.visible = true;

        // Close any open info panels before navigating
        if (this.infoOverlay) this.infoOverlay.hide();
        if (this.infoPanel3D) this.infoPanel3D.hide();

        // Sync current hotspots to data before leaving this scene
        this.syncCurrentHotspotsToData();

        // Save history in DEV mode before loading new scene
        if (import.meta.env.DEV && !this._isNavigatingBack) {
            const currentTarget = this.currentSceneId || this.currentPath;
            if (currentTarget && currentTarget !== target) {
                this._navHistory.push(currentTarget);
                console.log('[Dev History] Saved navigation point:', currentTarget);
            }
        }

        // target can be an ID (key in SCENE_MAP) or a direct path
        const sceneData = SCENE_MAP[target];

        if (sceneData) {
            console.log(`Navigating to ID: ${target} (${sceneData.path})`);
            this.currentSceneId = target; // Track ID
            this.clearHotspots();
            this.loadTexture(sceneData.path);
        } else if (typeof target === 'string' && (target.includes('/') || target.includes('.'))) {
            // Assume it's a direct path
            console.log(`Navigating to Path: ${target}`);
            this.currentSceneId = target; // Track ID
            console.log('Calling clearHotspots() before loading new texture...');
            this.clearHotspots();
            // Manually set currentLocation for saving later
            this.currentLocation = { path: target, id: null };
            this.loadTexture(target);
        } else {
            console.warn(`Target scene invalid or not found: ${target}`);
        }
    }

    navigateBack() {
        if (this._navHistory && this._navHistory.length > 0) {
            const prevTarget = this._navHistory.pop();
            console.log('[Dev History] Navigating back to:', prevTarget);
            this._isNavigatingBack = true;
            this.navigateToScene(prevTarget);
            this._isNavigatingBack = false;
        } else {
            console.log('[Dev History] No previous scene history.');
        }
    }

    autoAddReturnHotspot() {
        if (!this._navHistory || this._navHistory.length === 0) {
            console.warn('[Dev History] No history to create a return hotspot.');
            return;
        }

        const prevTarget = this._navHistory[this._navHistory.length - 1];

        // Convert camera forward vector to yaw & pitch
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);

        const pitchRad = Math.asin(dir.y);
        const yawRad = Math.atan2(dir.x, -dir.z);

        let yaw = THREE.MathUtils.radToDeg(yawRad) - 90;
        let pitch = THREE.MathUtils.radToDeg(pitchRad);

        if (yaw < -180) yaw += 360;
        if (yaw > 180) yaw -= 360;

        yaw = parseFloat(yaw.toFixed(2));
        pitch = parseFloat(pitch.toFixed(2));

        const newData = {
            type: 'arrow',
            yaw: yaw,
            pitch: pitch,
            target: prevTarget,
            label: 'Kembali'
        };

        const mesh = this.hotspotManager._createHotspotMesh(newData);
        if (mesh) {
            this.hotspotManager.group.add(mesh);
            this.hotspotManager.hotspots.push(mesh);

            // Save to localStorage
            const payload = this.getCurrentSceneHotspots();
            if (payload) {
                localStorage.setItem(`hotspots_${payload.sceneId}`, JSON.stringify(payload.hotspots));
                console.log(`[Dev History] Auto-saved return hotspot to: ${payload.sceneId}`);
                
                // Sync with admin panel UI if active
                if (window.adminPanel && window.adminPanel.isAdminMode) {
                    window.adminPanel.selectHotspot(mesh.userData.hotspotData);
                    window.adminPanel.renderSceneInfo();
                    window.adminPanel.renderHotspotChips();
                }
            }
        }
    }

    syncCurrentHotspotsToData() {
        const data = this.getCurrentSceneHotspots();
        if (data && data.sceneId && data.hotspots.length > 0) {
            this.hotspotsData[data.sceneId] = data.hotspots;
            console.log(`[Sync] Saved ${data.hotspots.length} hotspots for: ${data.sceneId}`);
        }
    }

    checkAndLoadHotspots(path) {
        // Offline source of truth: per-scene hotspots saved by the admin in
        // localStorage (`hotspots_<path>`). Read it fresh so edits show on
        // re-entry without a reload.
        let hotspots = null;
        try {
            const raw = localStorage.getItem(`hotspots_${path}`);
            if (raw) hotspots = JSON.parse(raw);
        } catch { /* ignore corrupt entry */ }

        // Fallback to any bundled data (exact, then fuzzy match).
        if (!hotspots) hotspots = this.hotspotsData[path];
        if (!hotspots) {
            const key = Object.keys(this.hotspotsData).find(k => path.includes(k) || k.includes(path));
            if (key) hotspots = this.hotspotsData[key];
        }

        if (hotspots) {
            console.log(`Loaded ${hotspots.length} hotspots for path: ${path}`);
            // Adapt hotspot format if needed, but if we migrated data, it should be clean?
            // Migration script preserved old data structure { yaw, pitch, target, target_name, type? }
            // So we just pass it through.

            const adaptedHotspots = hotspots.map(h => ({
                ...h, // Preserve all fields (size, color, offset, etc.)
                type: h.type || 'arrow', // Default to arrow
                label: h.target_name || h.label // Ensure label field exists
            }));

            this.renderHotspots(adaptedHotspots);

            if (this.bus) {
                this.bus.emit('scene:change', {
                    sceneId: path,
                    hotspots: adaptedHotspots,
                    sceneData: { id: path }
                });
            }
        } else {
            console.log(`No hotspots found for path: ${path}`);
        }
    }

    /**
     * Live-adjust the apparent panorama distance by scaling the sphere.
     * Used by the Settings panel; built radius is read from the geometry so
     * repeated calls stay absolute, not cumulative.
     */
    setSphereRadius(radius) {
        if (!this.sphere) return;
        const built = this.sphere.geometry?.parameters?.radius || CONFIG.panorama.sphereRadius;
        const s = radius / built;
        this.sphere.scale.setScalar(s);
    }

    setAdminMode(isActive) {
        this.isAdminMode = isActive;

        // Show/Hide "Add Hotspot" phantom or cursor logic could go here
        // For now, we rely on click handlers checking this.isAdminMode

        if (isActive) {
            console.log('Admin Mode Enabled');
            // Ensure icons are refreshed if we want to show edit-specific visuals (e.g. bounding boxes)
        } else {
            console.log('Admin Mode Disabled');
        }
    }

    // --- Admin / Editing Methods ---

    getCurrentSceneHotspots() {
        // 1. Get current path
        let currentPath = this.currentPath;
        if (!currentPath && this.currentSceneId) {
            const sceneData = SCENE_MAP[this.currentSceneId];
            if (sceneData) currentPath = sceneData.path;
        }

        if (!currentPath) return null;

        // 2. Build list from meshes
        const hotspots = this.hotspotManager.hotspots.map(mesh => {
            const data = mesh.userData.hotspotData;
            const p = mesh.position.clone().normalize();
            const pitch = THREE.MathUtils.radToDeg(Math.asin(p.y));
            let standardYaw = THREE.MathUtils.radToDeg(Math.atan2(p.x, -p.z));
            let yaw = standardYaw - 90;
            if (yaw < -180) yaw += 360;
            if (yaw > 180) yaw -= 360;

            const result = {
                yaw: parseFloat(yaw.toFixed(2)),
                pitch: parseFloat(pitch.toFixed(2)),
                target: data.target || '',
                target_name: (typeof data.label === 'string') ? data.label : (data.target_name || ''),
                type: data.type || 'arrow',
                label: data.label || '',
                size: data.size !== undefined ? data.size : 3,
                textSize: data.textSize !== undefined ? data.textSize : 1.0,
                color: data.color || null,
                icon_url: data.icon_url || null,
                labelOffset: data.labelOffset !== undefined ? data.labelOffset : 0,
                labelWrap: data.labelWrap || false
            };

            // Only add extra fields if they are relevant to the type to save space
            if (result.type === 'info') {
                result.title = data.title || '';
                result.description = data.description || '';
                result.infoWidth = data.infoWidth || 1.0;
                result.infoHeight = data.infoHeight || 0.8;
                result.infoColor = data.infoColor || '#1e293b';
                result.infoOpacity = data.infoOpacity !== undefined ? data.infoOpacity : 0.95;
            } else if (result.type === 'photo') {
                result.description = data.description || ''; // Used as caption
            }

            return result;
        });

        return {
            sceneId: currentPath,
            hotspots: hotspots
        };
    }

    getAllHotspotsData() {
        const currentData = this.getCurrentSceneHotspots();
        if (!currentData) return this.hotspotsData;

        const fullData = { ...this.hotspotsData };
        fullData[currentData.sceneId] = currentData.hotspots;
        return fullData;
    }

    addHotspot(yaw, pitch) {
        if (!this.isAdminMode) return;

        const newData = {
            type: 'arrow',
            yaw: yaw,
            pitch: pitch,
            target: '',
            label: 'New Hotspot'
        };

        const mesh = this.hotspotManager._createHotspotMesh(newData);
        if (mesh) {
            this.hotspotManager.group.add(mesh);
            this.hotspotManager.hotspots.push(mesh);

            // Select it immediately + mark dirty so it auto-saves
            if (window.adminPanel) {
                window.adminPanel.selectHotspot(mesh.userData.hotspotData);
                window.adminPanel.markDirty();
            }
        }
    }

    removeHotspot(data) {
        const mesh = this.hotspotManager.hotspots.find(m => m.userData.hotspotData === data);
        if (mesh) {
            // Remove the label first if it exists
            if (mesh.userData.labelSprite) {
                this.hotspotManager.group.remove(mesh.userData.labelSprite);
                if (mesh.userData.labelSprite.geometry) mesh.userData.labelSprite.geometry.dispose();
                if (mesh.userData.labelSprite.material.map) mesh.userData.labelSprite.material.map.dispose();
                mesh.userData.labelSprite.material.dispose();
            }

            this.hotspotManager.group.remove(mesh);
            this.hotspotManager.hotspots = this.hotspotManager.hotspots.filter(m => m !== mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        }
    }

    refreshHotspot(data) {
        // Called when data (like icon type, size, or color) changes
        // Easiest way: remove and re-create
        const oldMesh = this.hotspotManager.hotspots.find(m => m.userData.hotspotData === data);
        if (oldMesh) {
            // Remove the label first if it exists
            if (oldMesh.userData.labelSprite) {
                this.hotspotManager.group.remove(oldMesh.userData.labelSprite);
                if (oldMesh.userData.labelSprite.material.map) oldMesh.userData.labelSprite.material.map.dispose();
                if (oldMesh.userData.labelSprite.geometry) oldMesh.userData.labelSprite.geometry.dispose();
                oldMesh.userData.labelSprite.material.dispose();
            }

            this.hotspotManager.group.remove(oldMesh);
            this.hotspotManager.hotspots = this.hotspotManager.hotspots.filter(m => m !== oldMesh);
            if (oldMesh.geometry) oldMesh.geometry.dispose();
            if (oldMesh.material.map) oldMesh.material.map.dispose();
            oldMesh.material.dispose();
        }

        const newMesh = this.hotspotManager._createHotspotMesh(data);
        if (newMesh) {
            this.hotspotManager.group.add(newMesh);
            this.hotspotManager.hotspots.push(newMesh);
        }
    }






    // --- Interaction Override ---

    // We need to inject logic into the existing click handler or Raycaster
    // In constructor, we set this.onDebugClick. We should standardize this.

    handleAdminClick(intersects) {
        if (!this.isAdminMode) return false;

        // If we were dragging, click should be ignored or handled as "end drag"
        if (this.isDraggingHotspot) {
            this.isDraggingHotspot = false;
            this.draggedMesh = null;
            return true;
        }

        if (intersects.length > 0) {
            const hit = intersects[0];
            const object = hit.object;

            // 1. Clicked Existing Hotspot - Select it
            if (object.userData.hotspotData) {
                if (window.adminPanel) {
                    window.adminPanel.selectHotspot(object.userData.hotspotData);
                }
                return true; // Handled
            }

            // 2. Clicked Background (Sphere) -> Deselect
            if (object === this.sphere) {
                if (window.adminPanel) {
                    window.adminPanel.selectHotspot(null);
                }
                return true;
            }
        }
        return false;
    }

    handleAdminRightClick(intersects) {
        if (!this.isAdminMode) return false;

        if (intersects.length > 0) {
            const hit = intersects[0];
            const object = hit.object;

            // Only place new hotspot if clicked on sphere
            if (object === this.sphere) {
                const point = hit.point.normalize();
                const pitch = THREE.MathUtils.radToDeg(Math.asin(point.y));
                let standardYaw = THREE.MathUtils.radToDeg(Math.atan2(point.x, -point.z));
                let yaw = standardYaw - 90;
                if (yaw < -180) yaw += 360;
                if (yaw > 180) yaw -= 360;

                this.addHotspot(parseFloat(yaw.toFixed(2)), parseFloat(pitch.toFixed(2)));
                return true;
            }
        }
        return false;
    }

    // --- Drag Logic ---

    handleAdminMouseDown(intersects) {
        if (!this.isAdminMode) return false;

        if (intersects.length > 0) {
            // Iterate through hits to find the first valid hotspot
            const hit = intersects.find(h => h.object.userData.hotspotData);

            if (hit) {
                const object = hit.object;
                this.isDraggingHotspot = true;
                this.draggedMesh = object;

                // Record initial state for UNDO
                const data = this.draggedMesh.userData.hotspotData;
                this.dragInitialState = {
                    data: data,
                    yaw: data.yaw,
                    pitch: data.pitch
                };

                // Select it too
                if (window.adminPanel) {
                    window.adminPanel.selectHotspot(data);
                }

                return true; // Capture event
            }
        }
        return false;
    }

    handleAdminMouseMove(raycaster) {
        if (!this.isAdminMode || !this.isDraggingHotspot || !this.draggedMesh) return false;

        // Raycast against the sphere to find new position
        const intersects = raycaster.intersectObject(this.sphere);
        if (intersects.length > 0) {
            const point = intersects[0].point;

            const radius = 45;
            const worldUp = new THREE.Vector3(0, 1, 0);
            const type = this.draggedMesh.userData.hotspotData?.type;
            const isNavArrow = type === 'arrow' || type === 'back';

            const p = point.clone().normalize().multiplyScalar(radius);
            this.draggedMesh.position.copy(p);

            if (isNavArrow) {
                // Flat Google Maps orientation during drag
                const facingCamera = p.clone().normalize().negate();
                const hotspotData = this.draggedMesh.userData.hotspotData;
                const navTilt = hotspotData?.navTilt ?? 0.40;
                const localZ = new THREE.Vector3().lerpVectors(worldUp, facingCamera, navTilt).normalize();
                const sign = type === 'back' ? -1 : 1;
                const horizontalDir = new THREE.Vector3(sign * p.x, 0, sign * p.z).normalize();
                const localY = horizontalDir.clone();
                let localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
                localY.crossVectors(localZ, localX).normalize();
                const navRoll = THREE.MathUtils.degToRad(hotspotData?.navRoll || 0);
                if (navRoll !== 0) {
                    const cosR = Math.cos(navRoll);
                    const sinR = Math.sin(navRoll);
                    const rx = new THREE.Vector3().addScaledVector(localX, cosR).addScaledVector(localY, sinR);
                    const ry = new THREE.Vector3().addScaledVector(localX, -sinR).addScaledVector(localY, cosR);
                    localX = rx;
                    localY.copy(ry);
                }
                const matrix = new THREE.Matrix4();
                matrix.makeBasis(localX, localY, localZ);
                this.draggedMesh.setRotationFromMatrix(matrix);
            } else {
                // Rigid vertical billboard for other hotspot types
                const forward = p.clone().normalize().negate();
                const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
                const up = new THREE.Vector3().crossVectors(forward, right).normalize();
                const matrix = new THREE.Matrix4();
                matrix.makeBasis(right, up, forward);
                this.draggedMesh.setRotationFromMatrix(matrix);
            }

            // SYNC Label Position
            if (this.draggedMesh.userData.labelSprite) {
                const labelMesh = this.draggedMesh.userData.labelSprite;
                const data = this.draggedMesh.userData.hotspotData;
                const size = data.size || 3;
                const textSize = data.textSize || 1.0;
                const labelOffset = data.labelOffset !== undefined ? data.labelOffset : 0;

                // Calculate current yaw/pitch from current position to position label
                const currentPos = p.clone().normalize();
                const currentPitch = Math.asin(currentPos.y);
                const currentYawRad = Math.atan2(currentPos.x, -currentPos.z);

                // Position label slightly below
                const baseOffset = size * 0.8 + 2 * textSize;
                const labelPitchOffset = THREE.MathUtils.degToRad(baseOffset + labelOffset);
                const labelPitch = currentPitch - labelPitchOffset;

                const lx = radius * Math.sin(currentYawRad) * Math.cos(labelPitch);
                const ly = radius * Math.sin(labelPitch);
                const lz = -radius * Math.cos(currentYawRad) * Math.cos(labelPitch);

                labelMesh.position.set(lx, ly, lz);

                // Update Label Rotation (Rigid Vertical)
                const lForward = new THREE.Vector3().copy(labelMesh.position).normalize().negate();
                const lRight = new THREE.Vector3().crossVectors(worldUp, lForward).normalize();
                const lUp = new THREE.Vector3().crossVectors(lForward, lRight).normalize();
                const lMatrix = new THREE.Matrix4();
                lMatrix.makeBasis(lRight, lUp, lForward);
                labelMesh.setRotationFromMatrix(lMatrix);
            }
        }
        return true;
    }

    handleAdminMouseUp() {
        if (this.isDraggingHotspot && this.draggedMesh) {
            this.isDraggingHotspot = false;

            // Sync new position to global data structure
            const p = this.draggedMesh.position.clone().normalize();
            const pitch = THREE.MathUtils.radToDeg(Math.asin(p.y));
            let standardYaw = THREE.MathUtils.radToDeg(Math.atan2(p.x, -p.z));
            let yaw = standardYaw - 90;
            if (yaw < -180) yaw += 360;
            if (yaw > 180) yaw -= 360;

            const data = this.draggedMesh.userData.hotspotData;
            const oldYaw = this.dragInitialState.yaw;
            const oldPitch = this.dragInitialState.pitch;
            const newYaw = parseFloat(yaw.toFixed(2));
            const newPitch = parseFloat(pitch.toFixed(2));

            // Only push to undo if it actually moved
            if (oldYaw !== newYaw || oldPitch !== newPitch) {
                data.yaw = newYaw;
                data.pitch = newPitch;

                if (window.adminPanel) {
                    window.adminPanel.pushUndoCommand({
                        type: 'move',
                        hotspot: data,
                        oldYaw: oldYaw,
                        oldPitch: oldPitch,
                        newYaw: newYaw,
                        newPitch: newPitch
                    });
                    window.adminPanel.selectHotspot(data);
                    window.adminPanel.markDirty();
                }
            }

            this.draggedMesh = null;
            this.dragInitialState = null;
            return true;
        }
        return false;
    }

    loadFallbackTexture(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 4096; // Higher res for VR
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Cinematic Dark Background (Requested: Hitam Gelap)
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, w, h);

        // Minimalist Grid (Requested: Sedikit garis penanda arah)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;

        // A. Horizon Line
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // B. Vertical Cardinal Lines (North, East, South, West)
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < w; i += w / 4) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
        }
        ctx.stroke();

        // C. Zenith/Nadir Rims
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w, 0);
        ctx.moveTo(0, h); ctx.lineTo(w, h);
        ctx.stroke();

        // SCENE INFO TEXT (Floating in front)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Front Text (0 deg = Forward direction)
        // For equirectangular: x=0 and x=w are the front, x=w/2 is behind
        // To place at ~90° from center (which is front in 360), use w*0.25 or w*0.75
        const drawText = (offsetX) => {
            // Title - larger and more prominent
            ctx.font = 'bold 140px Roboto, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(name, offsetX, h / 2 - 150);

            // Description
            if (this.currentLocation) {
                ctx.font = '70px Roboto, sans-serif';
                ctx.fillStyle = '#888888';
                ctx.fillText(this.currentLocation.description || '', offsetX, h / 2 + 150);
            }
        };

        // Draw at FRONT (0°) - the left edge area represents forward direction
        // Using w*0.25 places text 90° to the left (front when facing forward from sphere center)
        drawText(w * 0.25);

        const texture = new THREE.CanvasTexture(canvas);
        this.basicMaterial.map = texture;
        this.basicMaterial.needsUpdate = true;
    }

    setBackButtonVisibility(visible) {
        if (this.backBtn) {
            this.backBtn.visible = false; // Forced false - Menu is gone
        }
    }

    hide() {
        this.group.visible = false;
    }

    setVRMode(isVR) {
        this.isVR = isVR;

        // Boost brightness significantly in VR mode to ensure clarity
        this.panoramaBrightness = isVR ? 1.5 : 1.0;
        if (this.basicMaterial) {
            this.basicMaterial.color.setScalar(this.panoramaBrightness);
        }

        // In VR, we might want to hide the floating back button 
        // because the SubMenu handles it, or use Gaze.
        // For now, let's keep it simple.
        this.setBackButtonVisibility(!isVR);

        // If exiting VR, hide 3D panel
        if (!isVR && this.infoPanel3D) {
            this.infoPanel3D.hide();
        }
    }

    /**
     * Update controlDock rotation to follow camera horizontally
     * Stops following when user looks down to allow interaction
     */
    updateControlDockRotation() {
        if (!this.camera || !this.controlDock) return;

        // Get camera's direction
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);

        // Check if looking down (negative Y component means looking down)
        const pitch = Math.asin(cameraDirection.y); // Radians, negative = looking down

        // Target angle based on camera direction
        // Add centerOffset to match the dock's shifted position
        const targetAngle = Math.atan2(cameraDirection.x, cameraDirection.z) + Math.PI + this.dockCenterOffset;

        // Use CONFIG threshold (default -0.45 rad ≈ -26 degrees)
        const threshold = CONFIG.controlDock?.lookDownThreshold || -0.45;

        // If looking down more than threshold, stop rotating (let user select)
        if (pitch > threshold) {
            // Smoothly rotate to target (ease out)
            let currentAngle = this.controlDock.rotation.y;
            let diff = targetAngle - currentAngle;

            // Normalize difference to [-PI, PI]
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            // Ease out: faster at start, slower at end
            const easeSpeed = CONFIG.controlDock?.followEaseSpeed || 0.08;
            this.controlDock.rotation.y += diff * easeSpeed;
        }
        // Otherwise, dock stays in place so user can interact
    }

    /**
     * Reset controlDock rotation to face the camera
     * Call this when showing panorama to align dock with user's view
     */
    resetControlDockRotation() {
        if (!this.camera || !this.controlDock) return;

        const vector = new THREE.Vector3();
        this.camera.getWorldDirection(vector);
        this.controlDock.rotation.y = Math.atan2(vector.x, vector.z) + Math.PI + this.dockCenterOffset;
    }


    update(delta) {
        const animSpeed = 6;

        // Helper function for smooth animation
        const animateObject = (obj) => {
            if (!obj || !obj.userData.targetScale) return;

            const diff = obj.scale.distanceTo(obj.userData.targetScale);

            if (diff > 0.01 && obj.userData.animProgress >= 1) {
                obj.userData.animProgress = 0;
                obj.userData.startScale = obj.scale.clone();
            }

            if (obj.userData.animProgress < 1 && obj.userData.startScale) {
                obj.userData.animProgress = Math.min(1, obj.userData.animProgress + delta * animSpeed);
                // Ease-in-out (smoothstep)
                const t = obj.userData.animProgress;
                const easeInOut = t * t * (3 - 2 * t);
                obj.scale.lerpVectors(obj.userData.startScale, obj.userData.targetScale, easeInOut);
            }
        };

        // Animate all buttons
        animateObject(this.backBtn);
        animateObject(this.pauseBtn);
        animateObject(this.skipBtn);

        // Narration controls. Centre button shows pause/play while narrating and
        // becomes a replay button once narration finishes/is skipped; skip only
        // shows while there is active narration to skip.
        if (this._narrationController) {
            const state = this._narrationController.getState(); // playing|paused|replay|none
            const icon = state === 'playing' ? 'pause'
                       : state === 'paused'  ? 'play'
                       : state === 'replay'  ? 'replay'
                       : null;

            if (this.pauseBtn) this.pauseBtn.visible = icon !== null;
            if (this.skipBtn)  this.skipBtn.visible  = state === 'playing' || state === 'paused';

            if (icon && icon !== this._pauseBtnIcon) {
                this._pauseBtnIcon = icon;
                const newCanvas = CanvasUI.createIconButtonTexture(icon, {
                    width: 200, height: 180, radius: 40
                });
                const oldMap = this.pauseBtn.material.map;
                this.pauseBtn.material.map = new THREE.CanvasTexture(newCanvas);
                this.pauseBtn.material.needsUpdate = true;
                if (oldMap) oldMap.dispose();
                this._pauseBtnCanvas = newCanvas;
            }
        }

        // Animate hotspots
        if (this.hotspotManager) {
            this.hotspotManager.hotspots.forEach(animateObject);
        }

        // Update loading spinner animation and position
        this.updateLoadingSpinner();
        this.updateLoadingPosition();

        // === ControlDock camera following ===
        // Make controlDock follow camera's horizontal rotation (like SubMenu)
        // BUT stop following when user looks DOWN toward the dock for interaction
        this.updateControlDockRotation();

        // === VR FIX: Sync sphere AND hotspots with camera position for proper stereo ===
        // In VR/stereo mode, the sphere MUST be centered exactly at the camera 
        // position to prevent "double vision" where left/right eyes see different content
        // Hotspots must also follow to stay aligned with the panorama
        // NOTE: Only move sphere + hotspots, NOT the controlDock (keep UI stable)
        if (this.sphere && this.renderer?.xr?.isPresenting) {
            const cameraWorldPos = new THREE.Vector3();
            const xrCamera = this.renderer.xr.getCamera();
            xrCamera.getWorldPosition(cameraWorldPos);

            // Move sphere AND hotspots to camera position, keep controlDock at fixed height
            const offset = cameraWorldPos.clone().sub(this.group.position);
            this.sphere.position.copy(offset);
            if (this.hotspotManager) {
                this.hotspotManager.group.position.copy(offset);
            }
        }
    }

    // ── 360° Video ──────────────────────────────────────────────────────────────

    /**
     * Load a 360° video as the sphere texture using THREE.VideoTexture.
     * Requires the dev-only videoFsPlugin to serve the file at the given URL.
     */
    _loadVideoScene(videoUrl, sceneData) {
        this.showLoading();

        const video = document.createElement('video');
        video.src = videoUrl;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        this._activeVideo = video;

        const onCanPlay = () => {
            if (this._activeVideo !== video) return; // superseded

            const texture = new THREE.VideoTexture(video);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            this._videoTexture = texture;

            this.basicMaterial.map = texture;
            this.basicMaterial.needsUpdate = true;
            this.sphere.material = this.basicMaterial;
            this.useParallax = false;
            this.hideLoading();

            video.play().catch(err => {
                console.warn('[VideoScene] Autoplay blocked — user interaction required:', err);
            });

            this._addNadirCap(sceneData?.nadirLogo);

            if (this.bus && sceneData) {
                this.bus.emit('scene:loaded', {
                    sceneId: sceneData.id ?? videoUrl,
                    sceneData,
                });
            }
        };

        const onError = () => {
            if (this._activeVideo !== video) return;
            console.error('[VideoScene] Failed to load video:', videoUrl);
            this.hideLoading();
            if (sceneData?.panorama) {
                // Fall back to the still panorama so audio/hotspots still work.
                this.clearHotspots();
                this.loadTexture(sceneData.panorama);
                if (this.bus) {
                    this.bus.emit('scene:loaded', {
                        sceneId: sceneData.id ?? videoUrl,
                        sceneData,
                    });
                }
            } else {
                this.loadFallbackTexture('VIDEO ERROR');
            }
        };

        video.addEventListener('canplay', onCanPlay, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.load();
    }

    /** Stop + discard the active 360° video and its Three.js texture. */
    _stopVideo() {
        this._removeNadirCap();
        if (this._activeVideo) {
            this._activeVideo.pause();
            this._activeVideo.src = '';
            try { this._activeVideo.load(); } catch (_) { /* ignore */ }
            this._activeVideo = null;
        }
        if (this._videoTexture) {
            this._videoTexture.dispose();
            this._videoTexture = null;
        }
    }

    /**
     * Add a circular cap at the nadir (bottom of sphere) to hide the camera
     * person / tripod. Optionally loads a logo texture; falls back to a solid
     * dark circle.
     */
    _addNadirCap(logoPath) {
        this._removeNadirCap();

        const R = CONFIG.panorama.sphereRadius;
        // Inscribed-circle formula: place the disk so its rim sits exactly on the
        // sphere's inner surface. This way both eyes see the cap at the correct
        // stereo depth and it doesn't cause double-vision in VR.
        const capRadius = R * 0.28;
        const capY = -Math.sqrt(R * R - capRadius * capRadius); // ≈ -48 for R=50

        const geo = new THREE.CircleGeometry(capRadius, 64);

        // Procedural dark circle canvas (shown until logo loads, or if no logo)
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        ctx.beginPath();
        ctx.arc(256, 256, 248, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);

        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthTest: true,  // must be true for correct stereo depth in VR
            side: THREE.DoubleSide,
        });

        const cap = new THREE.Mesh(geo, mat);
        cap.rotation.x = Math.PI / 2; // face upward (visible from inside sphere looking down)
        cap.position.set(0, capY, 0);

        this._nadirCap = cap;
        this.group.add(cap);

        if (logoPath) {
            new THREE.TextureLoader().load(logoPath, (logoTex) => {
                if (this._nadirCap) {
                    mat.map = logoTex;
                    mat.needsUpdate = true;
                    tex.dispose();
                }
            });
        }
    }

    _removeNadirCap() {
        if (this._nadirCap) {
            this.group.remove(this._nadirCap);
            if (this._nadirCap.material.map) this._nadirCap.material.map.dispose();
            this._nadirCap.material.dispose();
            this._nadirCap.geometry.dispose();
            this._nadirCap = null;
        }
    }

    // ────────────────────────────────────────────────────────────────────────────

    dispose() {
        this._stopVideo();

        // Remove event listeners
        if (this.onDebugClick) {
            window.removeEventListener('click', this.onDebugClick);
        }

        // Dispose Managers & Components
        if (this.audioManager) this.audioManager.dispose();
        if (this.photoOverlay) this.photoOverlay.dispose();
        if (this.curvedInfoPanel) this.curvedInfoPanel.dispose();

        // Dispose sphere
        if (this.sphere) {
            this.sphere.geometry.dispose();
            if (this.sphere.material.map) this.sphere.material.map.dispose();
            this.sphere.material.dispose();
        }

        // Dispose controls
        if (this.backBtn) {
            this.backBtn.geometry.dispose();
            if (this.backBtn.material.map) this.backBtn.material.map.dispose();
            this.backBtn.material.dispose();
        }
        if (this.pauseBtn) {
            if (this.pauseBtn.material.map) this.pauseBtn.material.map.dispose();
            this.pauseBtn.material.dispose();
            this.pauseBtn.geometry.dispose();
        }
        if (this.skipBtn) {
            if (this.skipBtn.material.map) this.skipBtn.material.map.dispose();
            this.skipBtn.material.dispose();
            this.skipBtn.geometry.dispose();
        }
        // Removed Play/Mute btns logic earlier so no need to dispose them here if they aren't created.
        // But for safety:
        /* if (this.playBtn) ... */
        if (this.playBtn) {
            this.playBtn.geometry.dispose();
            if (this.playBtn.material.map) this.playBtn.material.map.dispose();
            this.playBtn.material.dispose();
        }
        if (this.muteBtn) {
            this.muteBtn.geometry.dispose();
            if (this.muteBtn.material.map) this.muteBtn.material.map.dispose();
            this.muteBtn.material.dispose();
        }

        // Dispose loading
        if (this.loadingGroup) {
            this.loadingGroup.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
        }

        // Dispose hotspots
        if (this.hotspotManager) this.hotspotManager.dispose();

        // Dispose group
        if (this.group && this.scene) {
            this.scene.remove(this.group);
        }
    }
}
