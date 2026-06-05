import * as THREE from 'three';
import { TOUR_DATA } from '../../data/tourData.js';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { CONFIG } from '../../config.js';

export class OrbitalMenu {
    constructor(scene, camera, onSelect) {
        this.scene = scene;
        this.camera = camera;
        this.onSelect = onSelect;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.thumbnails = [];
        this.radius = CONFIG.menu?.radius || 3.5;
        // Use CONFIG or default. 3.5m is better for large items.

        this.itemCount = TOUR_DATA.length;
        this.textureLoader = new THREE.TextureLoader();

        this.initMenu();
    }

    initMenu() {
        for (let i = 0; i < this.itemCount; i++) {
            const location = TOUR_DATA[i];
            const itemGroup = new THREE.Group();

            // --- Image Mesh ---
            const imgGeo = new THREE.PlaneGeometry(1.8, 1.2, 32, 1);
            CanvasUI.curveGeometry(imgGeo, 2.5);
            const imgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
            const imgMesh = new THREE.Mesh(imgGeo, imgMat);

            // --- Text Mesh ---
            const textGeo = new THREE.PlaneGeometry(1.8, 0.48, 32, 1);
            CanvasUI.curveGeometry(textGeo, 2.5);
            const textMat = new THREE.MeshBasicMaterial({ map: CanvasUI.createMenuTextTexture(location), transparent: true, side: THREE.DoubleSide, depthTest: false });
            const textMesh = new THREE.Mesh(textGeo, textMat);
            textMesh.position.y = -0.7; // Place text below the box

            itemGroup.add(imgMesh);
            itemGroup.add(textMesh);

            // Load thumbnail image asynchronously
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                imgMat.map = CanvasUI.createMenuCardTexture(location, img);
                imgMat.color.set(0xffffff);
                imgMat.needsUpdate = true;
            };
            img.onerror = () => {
                imgMat.map = CanvasUI.createMenuCardTexture(location, null);
                imgMat.color.set(0xffffff);
                imgMat.needsUpdate = true;
            };
            img.src = location.thumbnail;

            // Position Group in arc
            const totalAngle = Math.PI * 0.45; 
            const startAngle = Math.PI - totalAngle / 2;
            const step = this.itemCount > 1 ? totalAngle / (this.itemCount - 1) : 0;
            const theta = startAngle + i * step;

            itemGroup.position.set(
                Math.sin(theta) * this.radius,
                CONFIG.layout.menuY,
                Math.cos(theta) * this.radius
            );
            itemGroup.lookAt(0, CONFIG.layout.menuY, 0);

            // Animation data on Group
            itemGroup.userData.originalScale = new THREE.Vector3(1, 1, 1);
            itemGroup.userData.targetScale = new THREE.Vector3(1, 1, 1);

            // Interaction handlers (attach ONLY to image mesh to keep hit area tight and precise)
            const setupInteraction = (mesh) => {
                mesh.userData.id = i;
                mesh.userData.locationData = location;
                mesh.userData.isInteractable = true;
                mesh.onHoverIn = () => { itemGroup.userData.targetScale.set(1.15, 1.15, 1.15); };
                mesh.onHoverOut = () => { itemGroup.userData.targetScale.copy(itemGroup.userData.originalScale); };
                mesh.onClick = () => { this.onSelect(i); };
            };
            setupInteraction(imgMesh);
            // textMesh is intentionally NOT interactable to reduce accidental large-area hits

            this.group.add(itemGroup);
            this.thumbnails.push(itemGroup);
        }
    }

    update(delta) {
        // Smooth scale animation with ease-in-out
        const animSpeed = 5;

        this.thumbnails.forEach(mesh => {
            if (mesh.userData.targetScale) {
                if (mesh.userData.animProgress === undefined) {
                    mesh.userData.animProgress = 1;
                }
                const diff = mesh.scale.distanceTo(mesh.userData.targetScale);
                if (diff > 0.01 && mesh.userData.animProgress >= 1) {
                    mesh.userData.animProgress = 0;
                    mesh.userData.startScale = mesh.scale.clone();
                }
                if (mesh.userData.animProgress < 1 && mesh.userData.startScale) {
                    mesh.userData.animProgress = Math.min(1, mesh.userData.animProgress + delta * animSpeed);
                    const t = mesh.userData.animProgress;
                    const easeInOut = t * t * (3 - 2 * t);
                    mesh.scale.lerpVectors(mesh.userData.startScale, mesh.userData.targetScale, easeInOut);
                }
            }
        });

        // ── Snap-to-View ──────────────────────────────────────────────────────
        // Menu stays in place while user is looking at it.
        // If the user looks more than 90° away horizontally, the menu snaps
        // (with a fast ease) to the front of the user’s new view direction.
        // This prevents the drifting/floating feel of the old lerp-follow.
        if (this.camera && this.group.visible) {
            const dir = new THREE.Vector3();
            this.camera.getWorldDirection(dir);

            const cameraAngle = Math.atan2(dir.x, dir.z);
            const menuAngle   = this.group.rotation.y + Math.PI; // Group centre faces +PI offset

            let angularDiff = cameraAngle - menuAngle;
            while (angularDiff >  Math.PI) angularDiff -= Math.PI * 2;
            while (angularDiff < -Math.PI) angularDiff += Math.PI * 2;

            const SNAP_THRESHOLD = Math.PI * 0.65; // ~117° — wide enough not to snap mid-browse

            if (Math.abs(angularDiff) > SNAP_THRESHOLD) {
                // User looked far away — snap target to new view direction
                if (!this._snapTarget) this._snapTarget = this.group.rotation.y;
                this._snapTarget = cameraAngle - Math.PI;
            }

            if (this._snapTarget !== undefined) {
                let d = this._snapTarget - this.group.rotation.y;
                while (d >  Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;

                // Fast ease-out snap
                this.group.rotation.y += d * Math.min(1, 12.0 * delta);

                // Clear snap target once close enough
                if (Math.abs(d) < 0.005) {
                    this.group.rotation.y = this._snapTarget;
                    this._snapTarget = undefined;
                }
            }
        }
    }

    show() {
        this.group.visible = true;

        // Reset rotation to face the user
        if (this.camera) {
            // Get camera direction projected on XZ plane
            const vector = new THREE.Vector3();
            this.camera.getWorldDirection(vector);
            const angle = Math.atan2(vector.x, vector.z);

            // Rotate group to align with camera direction
            // Note: Menu items are at +Z relative to group center usually, or arranged in arc.
            // Our items are arranged around (0,0,0) facing center.
            // If user looks at angle A, we want the center of the arc to be at angle A.
            // The arc center is roughly at theta = PI (backwards).
            // Let's adjust offset based on layout.
            // Initial layout: center is at ~PI (back).
            // So if user looks at Angle, we want Group Angle to be matching.

            this.group.rotation.y = angle - Math.PI;
        }
    }

    hide() {
        this.group.visible = false;
    }

    dispose() {
        // Cleanup textures to prevent memory leaks
        this.thumbnails.forEach(itemGroup => {
            itemGroup.children.forEach(mesh => {
                if (mesh.material && mesh.material.map) {
                    mesh.material.map.dispose();
                }
                if (mesh.material) mesh.material.dispose();
                if (mesh.geometry) mesh.geometry.dispose();
            });
        });
        this.scene.remove(this.group);
    }
}
