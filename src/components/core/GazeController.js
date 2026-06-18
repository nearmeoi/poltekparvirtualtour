import * as THREE from 'three';
import { CONFIG } from '../../config.js';

export class GazeController {
    constructor(scene, camera, renderer, bus) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer; // For WebXR camera access
        this.raycaster = new THREE.Raycaster();
        this.center = new THREE.Vector2(0, 0); // Normalized center screen

        // Reticle (Simple dot cursor)
        this.reticleDistance = CONFIG.gaze.reticleDistance || 1.0;
        const reticleSize = CONFIG.gaze.reticleSize || 0.008;

        const geometry = new THREE.CircleGeometry(reticleSize, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.9,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(geometry, material);
        // Position will be updated in update() loop
        this.scene.add(this.mesh);
        this.mesh.renderOrder = 10001; // Higher than hotspots (9999)

        // Progress indicator (Inner circle filling up)
        const progressGeo = new THREE.CircleGeometry(reticleSize * 1.5, 32);
        const progressMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        this.progressMesh = new THREE.Mesh(progressGeo, progressMat);
        this.progressMesh.renderOrder = 10002;
        this.progressMesh.scale.set(0, 0, 1);
        this.mesh.add(this.progressMesh);

        this.hoveredObject = null;
        this.hoverTime = 0;

        // Interaction Mode: 'gaze' (timer) or 'button' (manual)
        this.interactionMode = 'gaze';

        // Base activation time from config (fallback)
        this.baseActivationTime = CONFIG.gaze.activationTime || 1.5;
        this.currentActivationTime = this.baseActivationTime;

        // Trigger lock to prevent "through-click" navigation issues
        this.triggerLockTime = 0;

        this.isStereoscopic = false;
        this.ipd = 0;
        this._origin = new THREE.Vector3();
        this._direction = new THREE.Vector3();

        if (bus) {
            bus.on('vr:entered', ({ isStereoscopic, ipd }) => {
                this.isStereoscopic = isStereoscopic;
                this.ipd = ipd || 0;
            });
            bus.on('vr:exited', () => {
                this.isStereoscopic = false;
                this.ipd = 0;
            });
        }
    }

    setInteractionMode(mode) {
        console.log('[GAZE] Setting interaction mode to:', mode);
        this.interactionMode = mode;
        this.clearHover();
    }

    _updateReticlePosition() {
        const xrCamera = this.renderer?.xr?.isPresenting
            ? this.renderer.xr.getCamera?.()
            : null;

        if (xrCamera?.cameras?.length === 2) {
            // Native WebXR stereo — average of both eye positions
            const left  = xrCamera.cameras[0].position;
            const right = xrCamera.cameras[1].position;
            this._origin.addVectors(left, right).multiplyScalar(0.5);
            xrCamera.getWorldDirection(this._direction);
        } else if (this.isStereoscopic) {
            // Cardboard fallback — camera is at y=0 (eye level), read actual position
            this.camera.getWorldPosition(this._origin);
            this._origin.y = CONFIG.camera.y;
            this.camera.getWorldDirection(this._direction);
        } else {
            // Desktop / mono
            this.camera.getWorldPosition(this._origin);
            this.camera.getWorldDirection(this._direction);
        }

        this.mesh.position
            .copy(this._origin)
            .add(this._direction.clone().multiplyScalar(this.reticleDistance));
        this.mesh.lookAt(this._origin);
    }

    update(scene, interactables, delta) {
        // Use world position/direction for robust VR gaze
        this._updateReticlePosition();
        const origin    = this._origin;
        const direction = this._direction;

        let currentCamera = this.camera;
        if (this.renderer?.xr?.isPresenting) {
            const xrCamera = this.renderer.xr.getCamera?.();
            if (xrCamera) currentCamera = xrCamera;
        }

        if (this.triggerLockTime > 0) {
            this.triggerLockTime -= delta;
            if (this.triggerLockTime <= 0) {
                // Lock just lifted. Whatever is centred under the reticle right now must
                // NOT auto-trigger — the user has to look away / onto another item first.
                // Without this, opening the orbital menu (which centres an item on the
                // reticle) instantly gaze-selects that item and the menu vanishes.
                this._lockJustEnded = true;
            }
            this.clearHover();
            // Reticle position is already updated above
            return;
        }

        this.raycaster.set(origin, direction);
        this.raycaster.camera = currentCamera; // Critical for Sprite raycasting

        // Force update world matrices before raycasting
        if (scene) scene.updateMatrixWorld(true);

        const intersects = this.raycaster.intersectObjects(interactables, true); // Recursive check

        if (intersects.length > 0) {
            // Find first VISIBLE interactable object
            let target = null;
            let firstIntersect = null;
            for (let i = 0; i < intersects.length; i++) {
                let candidate = intersects[i].object;
                const intersect = intersects[i];
                // Traverse up to find the interactable group/mesh
                while (candidate && !candidate.userData.isInteractable && candidate.parent) {
                    candidate = candidate.parent;
                }
                // Check if it's valid (interactable AND visible AND recursively visible)
                if (candidate && candidate.userData.isInteractable && candidate.visible) {
                    let isVisible = true;
                    let parent = candidate.parent;
                    while (parent) {
                        if (!parent.visible) {
                            isVisible = false;
                            break;
                        }
                        parent = parent.parent;
                    }

                    if (isVisible) {
                        target = candidate;
                        firstIntersect = intersect;
                        break;
                    }
                }
            }

            if (target) {
                // Re-entry guard: if a gaze lock just lifted, the object centred at that
                // instant is suppressed until the reticle leaves it once. The user must
                // make a deliberate selection rather than auto-triggering whatever spawned
                // under the reticle.
                if (this._lockJustEnded) {
                    this._lockJustEnded = false;
                    this._suppressObject = target;
                }
                const suppressed = this._suppressObject === target;
                if (!suppressed) this._suppressObject = null;

                if (this.hoveredObject !== target) {
                    console.log('[GAZE] Found interactable:', target.userData?.label || target.name || 'unlabeled');
                    if (this.hoveredObject) this.onHoverOut(this.hoveredObject);
                    this.hoveredObject = target;
                    this.hoveredIntersect = firstIntersect;

                    this.currentActivationTime = target.userData.activationTime || this.baseActivationTime;
                    this.onHoverIn(this.hoveredObject);
                    this.hoverTime = 0;
                }

                if (this.interactionMode === 'gaze') {
                    if (suppressed) {
                        // Hovered but waiting for re-entry — keep the ring empty, no dwell.
                        this.progressMesh.scale.set(0, 0, 1);
                    } else {
                        // Increment timer
                        this.hoverTime += delta;

                        // Calculate progress based on DYNAMIC time
                        const progress = Math.min(this.hoverTime / this.currentActivationTime, 1);
                        this.progressMesh.scale.set(progress, progress, 1);

                        if (this.hoverTime >= this.currentActivationTime) {
                            this.trigger(target, firstIntersect);
                            this.hoverTime = 0; // Reset
                            this.progressMesh.scale.set(0, 0, 1);
                        }
                    }
                } else {
                    // Button mode: Just show the reticle ring at 100% or slightly larger but don't fill
                    this.progressMesh.scale.set(1, 1, 1);
                }
            } else {
                this._lockJustEnded = false;
                this.clearHover();
            }
        } else {
            this._lockJustEnded = false;
            this.clearHover();
        }
    }

    clearHover() {
        if (this.hoveredObject) {
            this.onHoverOut(this.hoveredObject);
            this.hoveredObject = null;
        }
        this.hoverTime = 0;
        // Reticle left everything → re-arm any suppressed object so it can be
        // deliberately re-selected when the user looks back at it.
        this._suppressObject = null;
        this.progressMesh.scale.set(0, 0, 1);
    }

    onHoverIn(object) {
        if (object.onHoverIn) object.onHoverIn();
    }

    onHoverOut(object) {
        if (object.onHoverOut) object.onHoverOut();
    }

    trigger(object, intersection) {
        console.log('[GAZE] trigger() called. hasOnClick:', !!object.onClick, 'label:', object.userData?.label);

        // Lock gaze for a short duration after triggering to prevent accidental "through-clicks"
        // in the next scene or state.
        this.triggerLockTime = CONFIG.gaze.triggerLockTime;

        if (object.onClick) {
            console.log('[GAZE] Calling onClick now!');
            try {
                object.onClick(intersection);
            } catch (err) {
                console.error('[GAZE] onClick ERROR:', err);
            }
        } else {
            console.log('[GAZE] WARNING: No onClick handler on object!');
        }
    }

    dispose() {
        if (this.mesh && this.scene) {
            this.scene.remove(this.mesh);
        }
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.progressMesh) {
            this.progressMesh.geometry.dispose();
            this.progressMesh.material.dispose();
        }
    }
}
