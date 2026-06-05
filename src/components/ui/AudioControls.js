import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';

/**
 * Reusable audio controls (Play/Pause + Mute buttons)
 * Can be used standalone or alongside other UI elements
 */
export class AudioControls {
    constructor(parentGroup) {
        this.parentGroup = parentGroup;
        this.group = new THREE.Group();
        this.parentGroup.add(this.group);

        this.currentAudio = null;
        this.isPlaying = false;
        this.isMuted = false;

        this.createButtons();
    }

    createButtons() {
        // Play/Pause Button
        this.playBtnCanvas = CanvasUI.createPlayButtonTexture(false);
        const playTexture = new THREE.CanvasTexture(this.playBtnCanvas);
        const playGeometry = new THREE.PlaneGeometry(0.18, 0.18);
        const playMaterial = new THREE.MeshBasicMaterial({
            map: playTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.playBtn = new THREE.Mesh(playGeometry, playMaterial);
        this.playBtn.userData.isInteractable = true;
        this.playBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.playBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.playBtn.userData.animProgress = 1;
        this.playBtn.onHoverIn = () => this.playBtn.userData.targetScale.set(1.2, 1.2, 1.2);
        this.playBtn.onHoverOut = () => this.playBtn.userData.targetScale.copy(this.playBtn.userData.originalScale);
        this.playBtn.onClick = () => this.togglePlay();
        this.playBtn.userData.label = 'AudioControls Play';
        this.group.add(this.playBtn);

        // Mute Button
        this.muteBtnCanvas = CanvasUI.createMuteButtonTexture(false);
        const muteTexture = new THREE.CanvasTexture(this.muteBtnCanvas);
        const muteGeometry = new THREE.PlaneGeometry(0.18, 0.18);
        const muteMaterial = new THREE.MeshBasicMaterial({
            map: muteTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.muteBtn = new THREE.Mesh(muteGeometry, muteMaterial);
        this.muteBtn.userData.isInteractable = true;
        this.muteBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.muteBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.muteBtn.userData.animProgress = 1;
        this.muteBtn.onHoverIn = () => this.muteBtn.userData.targetScale.set(1.2, 1.2, 1.2);
        this.muteBtn.onHoverOut = () => this.muteBtn.userData.targetScale.copy(this.muteBtn.userData.originalScale);
        this.muteBtn.onClick = () => this.toggleMute();
        this.muteBtn.userData.label = 'AudioControls Mute';
        this.group.add(this.muteBtn);
    }

    /**
     * Set button positions based on mode
     * @param {string} mode - 'standalone' or 'with-dock'
     * @param {object} options - Optional overrides { radius, y, lookAtY, playAngle, muteAngle, subLocationCount }
     */
    setPosition(mode, options = {}) {
        const radius = options.radius || 1.6;

        let y, lookAtY, playAngle, muteAngle;

        if (mode === 'with-dock') {
            // New Dynamic Positioning based on actual SubMenu position
            if (options.lastItemTheta !== undefined) {
                const lastItemTheta = options.lastItemTheta; // From SubMenu

                // Angular Widths (Approximate based on geometry widths and radii)
                // Thumbnail: Width 0.3, Radius 2.25 -> Angle = 0.3 / 2.25 ≈ 0.133. Half ≈ 0.067
                // AudioButton: Width 0.18, Radius 1.6 -> Angle = 0.18 / 1.6 ≈ 0.112. Half ≈ 0.056

                const halfThumb = 0.067;
                const halfBtn = 0.056;
                const visualGap = 0.12; // Nice loose gap as requested (0.2+ might be too much, 0.12 is solid)

                // Total offset to Subtract from Theta (Right = decreasing Theta)
                const totalOffset = halfThumb + halfBtn + visualGap;

                const targetTheta = lastItemTheta - totalOffset;

                // Convert to Audio Coordinate System (z = -cos vs z = cos)
                playAngle = Math.PI - targetTheta;

                // Mute button further right (increase Angle)
                muteAngle = playAngle + 0.16;
            } else {
                // Fallback if no angle provided (should not happen in production flow)
                // Use legacy hardcoded approximation or center
                playAngle = 0.7;
                muteAngle = 0.7 + 0.16;
            }

            y = options.y ?? -0.9;
            lookAtY = options.lookAtY ?? 0.7;
        } else {
            // Standalone mode - close to Back button (Rotterdam-style)
            y = options.y ?? -1.0;
            lookAtY = options.lookAtY ?? 0.6;
            playAngle = options.playAngle ?? Math.PI * 0.075; // ~13.5°
            muteAngle = options.muteAngle ?? Math.PI * 0.115; // ~20.7°
        }

        this.playBtn.position.set(
            Math.sin(playAngle) * radius,
            y,
            -Math.cos(playAngle) * radius
        );
        this.muteBtn.position.set(
            Math.sin(muteAngle) * radius,
            y,
            -Math.cos(muteAngle) * radius
        );

        this.playBtn.lookAt(0, lookAtY, 0);
        this.muteBtn.lookAt(0, lookAtY, 0);
    }

    /**
     * Bind to an HTML5 Audio element
     */
    setAudio(audioElement) {
        this.currentAudio = audioElement;
        if (audioElement) {
            this.currentAudio.muted = this.isMuted;
        }
    }

    togglePlay() {
        if (!this.currentAudio) return;

        if (this.isPlaying) {
            this.currentAudio.pause();
            this.isPlaying = false;
        } else {
            this.currentAudio.play().catch(e => console.log('Audio play error:', e));
            this.isPlaying = true;
        }
        this.updatePlayButton();
    }

    toggleMute() {
        if (!this.currentAudio) return;

        this.isMuted = !this.isMuted;
        this.currentAudio.muted = this.isMuted;
        this.updateMuteButton();
    }

    updatePlayButton() {
        CanvasUI.drawPlayButton(this.playBtnCanvas, this.isPlaying);
        if (this.playBtn && this.playBtn.material.map) {
            this.playBtn.material.map.needsUpdate = true;
        }
    }

    updateMuteButton() {
        CanvasUI.drawMuteButton(this.muteBtnCanvas, this.isMuted);
        if (this.muteBtn && this.muteBtn.material.map) {
            this.muteBtn.material.map.needsUpdate = true;
        }
    }

    /**
     * Update state and visuals externally
     */
    setState(isPlaying, isMuted) {
        this.isPlaying = isPlaying;
        this.isMuted = isMuted;
        this.updatePlayButton();
        this.updateMuteButton();
    }

    /**
     * Get button meshes for GazeController or raycasting
     */
    getButtons() {
        return [this.playBtn, this.muteBtn];
    }

    /**
     * Show/hide controls
     */
    setVisible(visible) {
        this.group.visible = visible;
    }

    dispose() {
        if (this.playBtn) {
            this.playBtn.material.map?.dispose();
            this.playBtn.material.dispose();
            this.playBtn.geometry.dispose();
            this.group.remove(this.playBtn);
        }
        if (this.muteBtn) {
            this.muteBtn.material.map?.dispose();
            this.muteBtn.material.dispose();
            this.muteBtn.geometry.dispose();
            this.group.remove(this.muteBtn);
        }
        this.parentGroup.remove(this.group);
    }
}
