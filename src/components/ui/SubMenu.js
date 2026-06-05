import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { animateScaleAndOpacity, animateScale } from '../../utils/AnimationHelper.js';
import { CONFIG } from '../../config.js';

export class SubMenu {
    constructor(scene, camera, parentLocation, onSelect, onBack) {
        this.scene = scene;
        this.camera = camera;
        this.parentLocation = parentLocation;
        this.subLocations = parentLocation.subLocations || [];
        this.onSelect = onSelect;
        this.onBack = onBack;

        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.visible = false;

        this.thumbnails = [];
        this.radius = CONFIG.menu.subMenuRadius; // Slightly larger radius for more items
        this.textureLoader = new THREE.TextureLoader();

        this.initMenu();
        this.createBackButton();
        // Title removed per user request
    }

    getLastItemTheta() {
        const totalAngle = Math.PI * 0.5;
        const centerOffset = 0.2;
        // The rightmost item (last in visual order because of reversed loop logic or startAngle?)
        // In initMenu: theta = startAngle + (itemCount - 1 - i) * step
        // Last item in array (i=count-1) -> theta = startAngle.
        // StartAngle is the smallest angle value.
        // Coordinate system: X=sin(theta), Z=cos(theta).
        return Math.PI + centerOffset - totalAngle / 2;
    }

    initMenu() {
        const itemCount = this.subLocations.length;

        // Use shared roundRect from CanvasUI
        const roundRect = CanvasUI.roundRect;

        // Create thumbnail card with image
        const createThumbnailTexture = (location, img) => {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 280;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Glass Background - Premium Dark
            roundRect(ctx, 8, 8, 384, 264, 24);
            ctx.fillStyle = 'rgba(20, 20, 35, 0.6)'; // Dark semi-transparent
            ctx.fill();

            // Gradient Overlay
            const gradient = ctx.createLinearGradient(0, 0, 0, 280);
            gradient.addColorStop(0, 'rgba(60, 60, 80, 0.2)');
            gradient.addColorStop(1, 'rgba(10, 10, 20, 0.8)');
            ctx.fillStyle = gradient;
            ctx.fill();

            // Border - White/Silver Glow
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.stroke();

            // Draw thumbnail image
            if (img) {
                ctx.save();
                roundRect(ctx, 20, 20, 360, 180, 16);
                ctx.clip();
                const imgRatio = img.width / img.height;
                const boxRatio = 360 / 180;
                let sx = 0, sy = 0, sw = img.width, sh = img.height;
                if (imgRatio > boxRatio) {
                    sw = img.height * boxRatio;
                    sx = (img.width - sw) / 2;
                } else {
                    sh = img.width / boxRatio;
                    sy = (img.height - sh) / 2;
                }
                ctx.drawImage(img, sx, sy, sw, sh, 20, 20, 360, 180);
                ctx.restore();
            } else {
                ctx.save();
                roundRect(ctx, 20, 20, 360, 180, 16);
                ctx.clip();
                const hue = (location.id * 50 + 180) % 360;
                ctx.fillStyle = `hsl(${hue}, 50%, 35%)`;
                ctx.fillRect(20, 20, 360, 180);
                ctx.restore();
            }

            // Text label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 5;
            ctx.fillText(location.name.toUpperCase(), 200, 240);

            return new THREE.CanvasTexture(canvas);
        };

        // Bottom Dock Layout
        // Arc is smaller and lower
        const totalAngle = Math.PI * 0.5; // 90 degrees arc for tighter packing
        // Shift arc center to the left to balance audio buttons on the right
        const centerOffset = 0.2;
        const startAngle = Math.PI + centerOffset - totalAngle / 2;
        const step = itemCount > 1 ? totalAngle / (itemCount - 1) : 0;

        for (let i = 0; i < itemCount; i++) {
            const location = this.subLocations[i];
            // Smaller geometry for dock
            const geometry = new THREE.PlaneGeometry(0.3, 0.2);

            const material = new THREE.MeshBasicMaterial({
                color: 0x333333,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.5 // Semi-transparent by default
            });
            const mesh = new THREE.Mesh(geometry, material);

            // Load thumbnail image
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const texture = createThumbnailTexture(location, img);
                mesh.material.map = texture;
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            };
            img.onerror = () => {
                const texture = createThumbnailTexture(location, null);
                mesh.material.map = texture;
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            };
            img.src = location.thumbnail;

            // Position Lower (Bottom Dock)
            const theta = startAngle + (itemCount - 1 - i) * step;

            const eyeY = CONFIG.layout.menuY + CONFIG.layout.subMenuOffsetY;
            mesh.position.set(
                Math.sin(theta) * this.radius * 0.9,
                eyeY,
                Math.cos(theta) * this.radius * 0.9
            );

            mesh.lookAt(0, eyeY, 0);

            // User Data for interaction
            mesh.userData.id = i;
            mesh.userData.locationData = location;
            mesh.userData.isInteractable = true;
            mesh.userData.originalScale = new THREE.Vector3(1, 1, 1);
            mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
            mesh.userData.animProgress = 1;
            mesh.userData.targetOpacity = 0.5;
            mesh.userData.active = false;

            // Callbacks - use targetScale for smooth animation
            mesh.onHoverIn = () => {
                if (!mesh.userData.active) {
                    mesh.userData.targetScale.set(1.2, 1.2, 1.2);
                    mesh.userData.targetOpacity = 1.0;
                }
            };
            mesh.onHoverOut = () => {
                if (!mesh.userData.active) {
                    mesh.userData.targetScale.copy(mesh.userData.originalScale);
                    mesh.userData.targetOpacity = 0.5;
                }
            };
            mesh.onClick = () => {
                this.setActive(i);
                this.onSelect(location);
            };

            this.group.add(mesh);
            this.thumbnails.push(mesh);
        }
    }

    setActive(index) {
        this.thumbnails.forEach((mesh, i) => {
            if (i === index) {
                mesh.userData.active = true;
                mesh.scale.set(1.2, 1.2, 1.2); // Same as hover
                mesh.material.opacity = 1.0;
                mesh.material.color.set(0xffffff); // No tint, just like hover
            } else {
                mesh.userData.active = false;
                mesh.scale.copy(mesh.userData.originalScale);
                mesh.material.opacity = 0.5;
                mesh.material.color.set(0xffffff);
            }
        });
    }

    createBackButton() {
        const geometry = new THREE.PlaneGeometry(0.4, 0.15);

        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');

        // Rounded rect helper
        const roundRect = CanvasUI.roundRect;

        ctx.clearRect(0, 0, 400, 150);
        roundRect(ctx, 8, 8, 384, 134, 40);
        ctx.fillStyle = 'rgba(180, 80, 80, 0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 120, 120, 0.7)';
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText('BACK', 200, 75);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.backBtn = new THREE.Mesh(geometry, material);
        const backY = CONFIG.layout.menuY + CONFIG.layout.backButtonOffsetY;
        this.backBtn.position.set(0, backY, -1.5);
        this.backBtn.lookAt(0, backY, 0);

        this.backBtn.userData.isInteractable = true;
        this.backBtn.userData.originalScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.targetScale = new THREE.Vector3(1, 1, 1);
        this.backBtn.userData.animProgress = 1;
        this.backBtn.onHoverIn = () => this.backBtn.userData.targetScale.set(1.1, 1.1, 1.1);
        this.backBtn.onHoverOut = () => this.backBtn.userData.targetScale.copy(this.backBtn.userData.originalScale);
        this.backBtn.onClick = () => {
            if (this.onBack) this.onBack();
        };

        this.group.add(this.backBtn);
    }

    update(delta) {
        if (!this.group.visible) return;

        // --- Synchronized Rotation Logic (Matches PanoramaViewer ControlDock) ---
        if (this.camera) {
            const cameraDir = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDir);
            const pitch = Math.asin(cameraDir.y);

            // Only rotate if not looking down too much (avoids jitter/conflicts)
            if (pitch > CONFIG.controlDock.lookDownThreshold) {
                // Target angle: Face camera + Center Offset (0.2)
                const targetAngle = Math.atan2(cameraDir.x, cameraDir.z) + Math.PI + 0.2;

                let diff = targetAngle - this.group.rotation.y;

                // Normalize angle to -PI..PI
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                // Apply rotation with same smoothing speed as ControlDock
                this.group.rotation.y += diff * CONFIG.controlDock.followEaseSpeed;
            }
        }
        // ------------------------------------------------------------------------

        const animSpeed = 6;

        // Smooth scale animation for thumbnails
        this.thumbnails.forEach(mesh => {
            if (mesh.userData.targetScale) {
                const diff = mesh.scale.distanceTo(mesh.userData.targetScale);

                if (diff > 0.01 && mesh.userData.animProgress >= 1) {
                    mesh.userData.animProgress = 0;
                    mesh.userData.startScale = mesh.scale.clone();
                    mesh.userData.startOpacity = mesh.material.opacity;
                }

                if (mesh.userData.animProgress < 1 && mesh.userData.startScale) {
                    mesh.userData.animProgress = Math.min(1, mesh.userData.animProgress + delta * animSpeed);
                    // Ease-in-out (smoothstep)
                    const t = mesh.userData.animProgress;
                    const easeInOut = t * t * (3 - 2 * t);
                    mesh.scale.lerpVectors(mesh.userData.startScale, mesh.userData.targetScale, easeInOut);

                    // Smooth opacity transition
                    if (mesh.userData.startOpacity !== undefined && mesh.userData.targetOpacity !== undefined) {
                        mesh.material.opacity = mesh.userData.startOpacity + (mesh.userData.targetOpacity - mesh.userData.startOpacity) * easeInOut;
                    }
                }
            }
        });

        // Smooth scale animation for back button
        if (this.backBtn && this.backBtn.userData.targetScale) {
            const btn = this.backBtn;
            const diff = btn.scale.distanceTo(btn.userData.targetScale);

            if (diff > 0.01 && btn.userData.animProgress >= 1) {
                btn.userData.animProgress = 0;
                btn.userData.startScale = btn.scale.clone();
            }

            if (btn.userData.animProgress < 1 && btn.userData.startScale) {
                btn.userData.animProgress = Math.min(1, btn.userData.animProgress + delta * animSpeed);
                const t = btn.userData.animProgress;
                const easeInOut = t * t * (3 - 2 * t);
                btn.scale.lerpVectors(btn.userData.startScale, btn.userData.targetScale, easeInOut);
            }
        }

    }

    setVRMode(isVR) {
        this.isVRMode = isVR;
    }

    show() {
        this.group.visible = true;

        // Reset rotation to face the user (with centerOffset)
        if (this.camera) {
            const vector = new THREE.Vector3();
            this.camera.getWorldDirection(vector);
            const angle = Math.atan2(vector.x, vector.z);
            this.group.rotation.y = Math.atan2(vector.x, vector.z) + Math.PI + 0.2; // +0.2 to match centerOffset
        }
    }

    hide() {
        this.group.visible = false;
    }

    dispose() {
        // Cleanup thumbnails
        this.thumbnails.forEach(mesh => {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
            mesh.geometry.dispose();
        });

        // Cleanup back button
        if (this.backBtn) {
            if (this.backBtn.material.map) this.backBtn.material.map.dispose();
            this.backBtn.material.dispose();
            this.backBtn.geometry.dispose();
        }

        // Remove from scene
        if (this.scene) {
            this.scene.remove(this.group);
        }
    }
}
