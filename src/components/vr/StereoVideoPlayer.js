import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { FullscreenHelper } from '../../utils/FullscreenHelper.js';
import { CONFIG } from '../../config.js';

/**
 * StereoVideoPlayer - Displays side-by-side stereo video in VR/Cardboard mode
 * Video format: Left half = left eye, Right half = right eye
 * Provides 3D depth perception but NOT 360° view
 */
export class StereoVideoPlayer {
    constructor(scene, camera, renderer, onBack, onEnterVR, onExitVR) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.onBack = onBack;
        this.onEnterVR = onEnterVR;
        this.onExitVR = onExitVR;

        this.group = new THREE.Group();
        this.group.position.set(0, CONFIG.layout.videoPlayerY, 0);
        this.scene.add(this.group);
        this.group.visible = false;


        this.videoTexture = null;
        this.isPlaying = false;
        this.isStereoMode = false;

        // Video planes (one for each eye in stereo mode)
        this.leftPlane = null;
        this.rightPlane = null;
        this.monoPlane = null; // For non-stereo viewing

        this.createVideoPlanes();
        this.createControls();
        this.createLoadingIndicator();
        this.createFullscreenOverlay();
    }

    createFullscreenOverlay() {
        // HTML overlay for fullscreen video playback
        this.videoOverlay = document.createElement('div');
        Object.assign(this.videoOverlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            display: 'none',
            zIndex: '1000',
            justifyContent: 'center',
            alignItems: 'center'
        });

        // Video element for fullscreen
        this.fullscreenVideo = document.createElement('video');
        Object.assign(this.fullscreenVideo.style, {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none' // Click-through to overlay for gesture detection
        });
        this.fullscreenVideo.playsInline = true;
        this.fullscreenVideo.loop = true;
        this.fullscreenVideo.muted = false;
        this.fullscreenVideo.volume = 0.5;

        this.videoOverlay.appendChild(this.fullscreenVideo);
        document.body.appendChild(this.videoOverlay);

        // --- Gesture Logic ---
        // 1 Tap: Pause/Play
        // 2 Taps: Back

        this.lastClickTime = 0;
        this.clickTimeout = null;

        this.videoOverlay.addEventListener('click', (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - this.lastClickTime;

            if (timeDiff < 300 && timeDiff > 0) {
                // DOUBLE TAP -> BACK
                console.log('Double Tap Detected: BACK');
                if (this.clickTimeout) clearTimeout(this.clickTimeout);
                this.hideFullscreen();
                this.stop();
                if (this.onBack) this.onBack();
                this.lastClickTime = 0;
            } else {
                // SINGLE TAP -> START TIMER
                this.lastClickTime = currentTime;

                // Clear any existing timeout just in case
                if (this.clickTimeout) clearTimeout(this.clickTimeout);

                this.clickTimeout = setTimeout(() => {
                    // If no second tap occurred, trigger Play/Pause
                    console.log('Single Tap Detected: TOGGLE PLAY');
                    this.togglePlay();
                    this.lastClickTime = 0;
                }, 300);
            }
        });
    }

    showFullscreen() {
        this.videoOverlay.style.display = 'flex';
    }

    hideFullscreen() {
        this.videoOverlay.style.display = 'none';
    }

    createVideoPlanes() {
        // --- 1. Curved Screen (IMAX/Orbital style) ---
        const radius = 3.5;
        const height = 2.5;
        const segments = 32;
        const thetaLength = Math.PI / 2.5; // ~72 degrees

        // Curved - Mono (Left Eye)
        const monoGeoCurved = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true, -thetaLength / 2, thetaLength);
        monoGeoCurved.scale(-1, 1, 1);
        const monoUvsCurved = monoGeoCurved.attributes.uv;
        for (let i = 0; i < monoUvsCurved.count; i++) {
            monoUvsCurved.setX(i, monoUvsCurved.getX(i) * 0.5);
        }
        this.monoPlaneCurved = new THREE.Mesh(monoGeoCurved, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.monoPlaneCurved.rotation.y = Math.PI;
        this.monoPlaneCurved.visible = false;
        this.group.add(this.monoPlaneCurved);

        // Curved - Left
        const leftGeoCurved = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true, -thetaLength / 2, thetaLength);
        leftGeoCurved.scale(-1, 1, 1);
        const leftUvsCurved = leftGeoCurved.attributes.uv;
        for (let i = 0; i < leftUvsCurved.count; i++) {
            leftUvsCurved.setX(i, leftUvsCurved.getX(i) * 0.5);
        }
        this.leftPlaneCurved = new THREE.Mesh(leftGeoCurved, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.leftPlaneCurved.rotation.y = Math.PI;
        this.leftPlaneCurved.layers.set(1);
        this.leftPlaneCurved.visible = false;
        this.group.add(this.leftPlaneCurved);

        // Curved - Right
        const rightGeoCurved = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true, -thetaLength / 2, thetaLength);
        rightGeoCurved.scale(-1, 1, 1);
        const rightUvsCurved = rightGeoCurved.attributes.uv;
        for (let i = 0; i < rightUvsCurved.count; i++) {
            rightUvsCurved.setX(i, 0.5 + rightUvsCurved.getX(i) * 0.5);
        }
        this.rightPlaneCurved = new THREE.Mesh(rightGeoCurved, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.rightPlaneCurved.rotation.y = Math.PI;
        this.rightPlaneCurved.layers.set(2);
        this.rightPlaneCurved.visible = false;
        this.group.add(this.rightPlaneCurved);


        // --- 2. Flat Screen (Standard) ---
        const planeWidth = 5; // Slightly larger flatscreen
        const planeHeight = 2.8;
        const distance = 4; // Further away

        // Flat - Mono (Left Eye)
        const monoGeoFlat = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const monoUvsFlat = monoGeoFlat.attributes.uv;
        for (let i = 0; i < monoUvsFlat.count; i++) {
            monoUvsFlat.setX(i, monoUvsFlat.getX(i) * 0.5);
        }
        this.monoPlaneFlat = new THREE.Mesh(monoGeoFlat, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.monoPlaneFlat.position.set(0, 0, -distance);
        this.monoPlaneFlat.visible = false;
        this.group.add(this.monoPlaneFlat);

        // Flat - Left
        const leftGeoFlat = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const leftUvsFlat = leftGeoFlat.attributes.uv;
        for (let i = 0; i < leftUvsFlat.count; i++) {
            leftUvsFlat.setX(i, leftUvsFlat.getX(i) * 0.5);
        }
        this.leftPlaneFlat = new THREE.Mesh(leftGeoFlat, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.leftPlaneFlat.position.set(0, 0, -distance);
        this.leftPlaneFlat.layers.set(1);
        this.leftPlaneFlat.visible = false;
        this.group.add(this.leftPlaneFlat);

        // Flat - Right
        const rightGeoFlat = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const rightUvsFlat = rightGeoFlat.attributes.uv;
        for (let i = 0; i < rightUvsFlat.count; i++) {
            rightUvsFlat.setX(i, 0.5 + rightUvsFlat.getX(i) * 0.5);
        }
        this.rightPlaneFlat = new THREE.Mesh(rightGeoFlat, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        this.rightPlaneFlat.position.set(0, 0, -distance);
        this.rightPlaneFlat.layers.set(2);
        this.rightPlaneFlat.visible = false;
        this.group.add(this.rightPlaneFlat);

        // Background (Black Sphere)
        const bgGeometry = new THREE.SphereGeometry(20, 32, 32);
        bgGeometry.scale(-1, 1, 1);
        const bgMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide
        });
        this.background = new THREE.Mesh(bgGeometry, bgMaterial);
        this.background.visible = true;
        this.background.renderOrder = -1;
        this.group.add(this.background);
    }


    createControls() {
        // Control dock
        this.controlDock = new THREE.Group();
        this.group.add(this.controlDock);

        // Back button
        this.createBackButton();

        // Play/Pause button
        this.createPlayButton();
    }

    createBackButton() {
        const geometry = new THREE.PlaneGeometry(0.4, 0.18);
        const canvas = CanvasUI.createButtonTexture('BACK', {
            width: 400,
            height: 180,
            radius: 40,
            fontSize: 40
        });

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.backBtn = new THREE.Mesh(geometry, material);
        this.backBtn.position.set(-0.4, CONFIG.layout.backButtonOffsetY, -2.5);
        this.backBtn.lookAt(-0.4, CONFIG.layout.menuY, 0);

        this.backBtn.userData.isInteractable = true;
        this.backBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.animProgress = 1;
        this.backBtn.onHoverIn = () => this.backBtn.userData.targetScale.set(1.1, 1.1, 1.1);
        this.backBtn.onHoverOut = () => this.backBtn.userData.targetScale.copy(this.backBtn.userData.originalScale);
        this.backBtn.onClick = () => {
            this.stop();
            if (this.onBack) this.onBack();
        };

        this.controlDock.add(this.backBtn);
    }

    createPlayButton() {
        this.playBtnCanvas = CanvasUI.createPlayButtonTexture(false);
        const texture = new THREE.CanvasTexture(this.playBtnCanvas);

        const geometry = new THREE.PlaneGeometry(0.18, 0.18);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.playBtn = new THREE.Mesh(geometry, material);
        this.playBtn.position.set(0.4, CONFIG.layout.backButtonOffsetY, -2.5);
        this.playBtn.lookAt(0.4, CONFIG.layout.menuY, 0);

        this.playBtn.userData.isInteractable = true;
        this.playBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.playBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.playBtn.userData.animProgress = 1;
        this.playBtn.onHoverIn = () => this.playBtn.userData.targetScale.set(1.2, 1.2, 1.2);
        this.playBtn.onHoverOut = () => this.playBtn.userData.targetScale.copy(this.playBtn.userData.originalScale);
        this.playBtn.onClick = () => this.togglePlay();

        this.controlDock.add(this.playBtn);
    }

    updatePlayButton(isPlaying) {
        // Redraw to existing canvas or create new one if needed (but we usually just redraw)
        // Since CanvasUI.createPlayButtonTexture creates a NEW canvas, we might want a 'draw' method instead.
        // I added drawPlayButton to CanvasUI for this purpose!
        CanvasUI.drawPlayButton(this.playBtnCanvas, isPlaying);

        if (this.playBtn && this.playBtn.material.map) {
            this.playBtn.material.map.needsUpdate = true;
        }
    }

    createLoadingIndicator() {
        this.loadingGroup = new THREE.Group();
        this.loadingGroup.visible = false;

        // 1. Static Spinner Mesh (Rotates)
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
        this.loadingGroup.add(this.loadingSpinner);

        // 2. Static Text Mesh (Fixed)
        // Reuse createLoadingTextTexture from CanvasUI? I added it!
        const textCanvas = CanvasUI.createLoadingTextTexture();
        this.loadingCtx = textCanvas.getContext('2d'); // Keep context if needed, but here it's static "Loading..." 
        // Wait, StereoVideoPlayer changes text to "Loading Video..."!
        // So let's just clear and write "Loading Video..." here manually or add a param to CanvasUI later.
        // For now, manual is fine for custom text.

        const customTextCanvas = document.createElement('canvas');
        customTextCanvas.width = 256;
        customTextCanvas.height = 64;
        const ctx = customTextCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Loading Video...', 128, 32);

        const textTexture = new THREE.CanvasTexture(customTextCanvas);
        const textGeom = new THREE.PlaneGeometry(0.5, 0.125);
        const textMat = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            depthTest: false
        });

        this.loadingText = new THREE.Mesh(textGeom, textMat);
        this.loadingText.position.set(0, -0.4, -2);
        this.loadingGroup.add(this.loadingText);

        this.group.add(this.loadingGroup);
    }

    updateLoadingSpinner() {
        if (!this.loadingGroup.visible) return;

        // GPU Rotation
        if (this.loadingSpinner) {
            this.loadingSpinner.rotation.z -= 0.1;
        }
    }

    load(videoPath, autoPlay = true, projection = 'curved', format = 'stereo') {
        // Set video source
        this.fullscreenVideo.src = videoPath;
        this.fullscreenVideo.load();

        // Ensure texture is created for the new video
        this.createVideoTexture();

        this.projection = projection;
        this.format = format;

        // Do NOT force Enter VR (User requested manual entry)
        // if (this.onEnterVR) this.onEnterVR();

        this.hideFullscreen();
        this.group.visible = true;
        this.updateVisibility(this.isStereoMode); // Respect current VR state (Mono for desktop default)

        if (this.projection === 'flat') {
            // --- FLAT MODE (Clean Cinema) ---
            // Hide Pointer mechanism (simulated by hiding controls or disabling gaze)
            this.toggleInteractiveButtons(false);
            this.gestureEnabled = true;
        } else {
            // --- ORBITAL/CURVED MODE (VR) ---
            this.toggleInteractiveButtons(true);
            this.gestureEnabled = false;
        }

        this.fullscreenVideo.onloadeddata = () => {
            console.log('Video loaded successfully:', this.fullscreenVideo.videoWidth, 'x', this.fullscreenVideo.videoHeight);
            if (autoPlay) {
                console.log('Attempting autoplay...');
                this.play();
            }
        };

        this.fullscreenVideo.onerror = (e) => {
            console.error('Video load error:', e);
            console.error('Video Error Code:', this.fullscreenVideo.error ? this.fullscreenVideo.error.code : 'unknown');
            console.error('Video Src:', this.fullscreenVideo.src);
        };

        // Reset gesture tracking
        this.lastQuaternion = new THREE.Quaternion();
        this.gestureCooldown = 3.0; // 3 second cooldown to prevent immediate exit on load
    }

    play2D(videoPath) {
        // Pure 2D mode - just show the HTML video overlay
        this.fullscreenVideo.src = videoPath;
        this.fullscreenVideo.load();

        // Hide 3D elements
        this.group.visible = false;

        // Show HTML overlay
        this.showFullscreen();

        // FORCE LANDSCAPE & FULLSCREEN for Mobile
        // If already in fullscreen (e.g. from VR mode), we don't need to request again
        // Requesting again without user gesture (Gaze) causes failure on Android
        if (!FullscreenHelper.isFullscreen()) {
            FullscreenHelper.request().then(() => {
                FullscreenHelper.lockLandscape();
            }).catch(e => {
                console.warn('Fullscreen request failed:', e);
                // Try locking anyway
                FullscreenHelper.lockLandscape();
            });
        } else {
            console.log('Already in Fullscreen, skipping request');
            FullscreenHelper.lockLandscape();
        }

        // Hide 2D UI Overlay (CardboardUI) if active, just in case
        // (Handled by main.js usually, but good to ensure)

        this.fullscreenVideo.onloadeddata = () => {
            console.log('2D Video loaded:', this.fullscreenVideo.videoWidth, 'x', this.fullscreenVideo.videoHeight);
            this.play();
        };

        this.fullscreenVideo.onerror = (e) => {
            console.error('2D Video load error:', e);
        };
    }

    hide() {
        this.stop(false); // don't exit VR — caller decides whether to stay in VR
        this.group.visible = false;
        this.hideFullscreen();
    }

    updateVisibility(isStereo) {
        // Hide all first
        this.monoPlaneCurved.visible = false;
        this.leftPlaneCurved.visible = false;
        this.rightPlaneCurved.visible = false;
        this.monoPlaneFlat.visible = false;
        this.leftPlaneFlat.visible = false;
        this.rightPlaneFlat.visible = false;

        const isCurved = this.projection === 'curved';

        if (isStereo) {
            // Stereo Mode
            if (this.format === 'mono') {
                // Mono Source in VR: Use Mono Plane (Full Res) for both eyes
                // We must enable layers 1 & 2 on the mono plane so both eyes see it
                if (isCurved) {
                    this.monoPlaneCurved.visible = true;
                    this.monoPlaneCurved.layers.enable(1); // Left Eye
                    this.monoPlaneCurved.layers.enable(2); // Right Eye
                } else {
                    this.monoPlaneFlat.visible = true;
                    this.monoPlaneFlat.layers.enable(1);
                    this.monoPlaneFlat.layers.enable(2);
                }
            } else {
                // Stereo Source (Top/Bottom or Side-by-Side): Use separate planes
                if (isCurved) {
                    this.leftPlaneCurved.visible = true;
                    this.rightPlaneCurved.visible = true;
                } else {
                    this.leftPlaneFlat.visible = true;
                    this.rightPlaneFlat.visible = true;
                }
            }
        } else {
            // Mono Mode (Desktop) - Standard Layer 0
            if (isCurved) {
                this.monoPlaneCurved.visible = true;
                // Ensure layer 0 is enabled (default)
            } else {
                this.monoPlaneFlat.visible = true;
            }
        }
    }

    setStereoMode(enabled) {
        this.isStereoMode = enabled;
        this.updateVisibility(enabled);
    }

    createVideoTexture() {
        if (this.videoTexture) {
            this.videoTexture.dispose();
        }

        this.videoTexture = new THREE.VideoTexture(this.fullscreenVideo);  // Use fullscreenVideo element
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;
        this.videoTexture.generateMipmaps = false;

        // Apply texture to all planes
        const mats = [
            this.monoPlaneCurved.material, this.leftPlaneCurved.material, this.rightPlaneCurved.material,
            this.monoPlaneFlat.material, this.leftPlaneFlat.material, this.rightPlaneFlat.material
        ];

        mats.forEach(mat => {
            mat.map = this.videoTexture;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
        });
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.fullscreenVideo) return;
        this.fullscreenVideo.play().then(() => {
            this.isPlaying = true;
            this.updatePlayButton(true);
            if (this.htmlPlayBtn) this.htmlPlayBtn.innerHTML = '⏸ &nbsp; PAUSE';
        }).catch(e => {
            console.log('Video autoplay blocked:', e);
            this.isPlaying = false;
            this.updatePlayButton(false);
            if (this.htmlPlayBtn) this.htmlPlayBtn.innerHTML = '▶ &nbsp; PLAY';
        });
    }

    pause() {
        if (!this.fullscreenVideo) return;
        this.fullscreenVideo.pause();
        this.isPlaying = false;
        this.updatePlayButton(false);
        if (this.htmlPlayBtn) this.htmlPlayBtn.innerHTML = '▶ &nbsp; PLAY';
    }

    stop(triggerExitVR = true) {
        if (this.fullscreenVideo) {
            this.fullscreenVideo.pause();
            this.fullscreenVideo.currentTime = 0;
        }
        this.isPlaying = false;
        this.updatePlayButton(false);
        if (this.htmlPlayBtn) this.htmlPlayBtn.innerHTML = '▶ &nbsp; PLAY';

        if (triggerExitVR && this.onExitVR) {
            this.onExitVR();
        }

        // Always hide HTML overlay on stop
        this.hideFullscreen();

        this.gestureEnabled = false;
    }

    toggleInteractiveButtons(visible) {
        if (this.controlDock) {
            this.controlDock.visible = visible;
        }
    }

    updateGestures(delta) {
        if (!this.gestureEnabled || !this.camera) return;

        if (this.gestureCooldown > 0) {
            this.gestureCooldown -= delta;
            this.lastQuaternion.copy(this.camera.quaternion);
            return;
        }

        // Current rotation
        const currentQ = this.camera.quaternion;

        // Calculate angular difference
        // We focus on Y-axis rotation (Yaw) for "Flick Left/Right"
        // But quaternion diff angle is general.
        // Let's use Euler for simpler "Directional" velocity check
        const currentEuler = new THREE.Euler().setFromQuaternion(currentQ, 'YXZ');

        if (!this.lastEuler) {
            this.lastEuler = currentEuler.clone();
            this.lastQuaternion.copy(currentQ);
            return;
        }

        // Calculate Yaw Velocity (rad/s)
        let yawDiff = currentEuler.y - this.lastEuler.y;

        // Handle wrap-around (PI to -PI)
        if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        const yawVelocity = yawDiff / delta;

        // Thresholds
        const flickThreshold = 1.5; // rad/s (Approx 90 deg/s)

        // "Flick Left" means turning head LEFT (Positive Rotation if Y is Up? confirm coords)
        // Three.js: +Y is Up. Rotating Left usually increases Y (Right Hand Rule).
        // Let's test Magnitude first.

        if (Math.abs(yawVelocity) > flickThreshold) {
            console.log("Gesture Detected: High Velocity", yawVelocity);

            // Check direction: Turning Left vs Right
            // User asked "Flick ke kiri untuk back" (Flick to left for back)
            // Usually flipping pages left-to-right means dragging left? 
            // Turning head left = Rotation +Y.

            if (yawVelocity > flickThreshold) {
                console.log("Flick Left Detected -> BACK");
                this.stop();
                if (this.onBack) this.onBack();
                this.gestureCooldown = 1.0; // 1 second cooldown
            }
        }

        this.lastEuler.copy(currentEuler);
        this.lastQuaternion.copy(currentQ);
    }

    update(delta) {
        // Update video texture
        if (this.videoTexture && this.isPlaying) {
            this.videoTexture.needsUpdate = true;
        }

        // Update loading spinner
        this.updateLoadingSpinner();

        // Animate buttons
        const animSpeed = 6;
        const animateObject = (obj) => {
            if (!obj || !obj.userData.targetScale) return;
            const diff = obj.scale.distanceTo(obj.userData.targetScale);
            if (diff > 0.01 && obj.userData.animProgress >= 1) {
                obj.userData.animProgress = 0;
                obj.userData.startScale = obj.scale.clone();
            }
            if (obj.userData.animProgress < 1 && obj.userData.startScale) {
                obj.userData.animProgress = Math.min(1, obj.userData.animProgress + delta * animSpeed);
                const t = obj.userData.animProgress;
                const easeInOut = t * t * (3 - 2 * t);
                obj.scale.lerpVectors(obj.userData.startScale, obj.userData.targetScale, easeInOut);
            }
        };

        if (this.controlDock && this.controlDock.visible) {
            animateObject(this.backBtn);
            animateObject(this.playBtn);
        }

        // Gesture Update
        this.updateGestures(delta);
    }

    dispose() {
        // Cancel pending single-tap timer to prevent it firing on a destroyed object
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        // Cleanup video
        if (this.fullscreenVideo) {
            this.fullscreenVideo.pause();
            this.fullscreenVideo.src = '';
        }
        if (this.videoTexture) {
            this.videoTexture.dispose();
        }

        // Remove overlay from DOM
        if (this.videoOverlay?.parentNode) {
            this.videoOverlay.parentNode.removeChild(this.videoOverlay);
        }

        this.scene.remove(this.group);
    }
}
