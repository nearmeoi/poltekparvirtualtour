import * as THREE from 'three';
import { CONFIG } from '../../config.js';

/**
 * InputHandler — Centralized input handling for the WebVR application.
 * Handles click, touch, wheel, context menu, and admin drag interactions.
 */
export class InputHandler {
    /**
     * @param {object} app - The main App instance
     */
    constructor(app) {
        this.app = app;

        // Reusable raycaster and mouse vector (avoid GC pressure)
        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        // Touch tap state
        this._touchStartPos = null;
        this._touchStartTime = 0;

        // Admin triple-tap state
        this._tapCount = 0;
        this._tapTimer = null;

        // Admin double-tap state
        this._lastTapTime = 0;
        this._lastTapX = 0;
        this._lastTapY = 0;

        // Bound handlers (for cleanup)
        this._onResize = this._handleResize.bind(this);
        this._onWheel = this._handleWheel.bind(this);
        this._onClick = this._handleClick.bind(this);
        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchEnd = this._handleTouchEnd.bind(this);
        this._onContextMenu = this._handleContextMenu.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseUp = this._handleMouseUp.bind(this);
        this._onAdminTouchStart = this._handleAdminTouchStart.bind(this);
        this._onAdminTouchMove = this._handleAdminTouchMove.bind(this);
        this._onAdminTouchEnd = this._handleAdminTouchEnd.bind(this);

        this._attach();
    }

    // ==================== PRIVATE HELPERS ====================

    /**
     * Set mouse coordinates from a screen position and perform raycast.
     * Reuses the class-level raycaster and mouse vector.
     * @returns {{ raycaster: THREE.Raycaster, intersects: THREE.Intersection[] }}
     */
    _raycastFromScreen(clientX, clientY) {
        const rect = this.app.renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, this.app.camera);

        const interactables = [...this.app.getInteractables()];
        if (this.app.panoramaViewer?.sphere) {
            interactables.push(this.app.panoramaViewer.sphere);
        }

        const intersects = this._raycaster.intersectObjects(interactables, true);
        return { raycaster: this._raycaster, intersects };
    }

    /**
     * Handle admin-mode raycast (shared between click and touch).
     * Returns true if admin handled the interaction.
     */
    _handleAdminInteraction(clientX, clientY) {
        const pv = this.app.panoramaViewer;
        if (!pv?.isAdminMode) return false;

        const rect = this.app.renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._mouse, this.app.camera);

        this.app.scene.updateMatrixWorld(true);

        const adminObjects = [pv.sphere];
        if (pv.group) {
            pv.group.traverse(child => {
                if (child.userData?.hotspotData) {
                    adminObjects.push(child);
                }
            });
        }

        const adminIntersects = this._raycaster.intersectObjects(adminObjects, false);
        return pv.handleAdminClick(adminIntersects);
    }

    /**
     * Handle normal (non-admin) interactable raycast from screen coords.
     * Traverses up the hierarchy to find the interactable parent.
     */
    _handleNormalInteraction(clientX, clientY) {
        const rect = this.app.renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, this.app.camera);
        this.app.scene.updateMatrixWorld(true);

        const interactables = this.app.getInteractables();
        const intersects = this._raycaster.intersectObjects(interactables, true);

        if (intersects.length > 0) {
            let target = intersects[0].object;
            while (target && !target.userData.isInteractable && target.parent) {
                target = target.parent;
            }
            if (target?.userData.isInteractable && target.onClick) {
                target.onClick(intersects[0]);
            }
        }
    }

    // ==================== EVENT HANDLERS ====================

    _handleResize() {
        this.app.camera.aspect = window.innerWidth / window.innerHeight;
        this.app.camera.updateProjectionMatrix();
        this.app.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _handleWheel(e) {
        e.preventDefault();
        const zoomSpeed = 2;
        this.app.camera.fov += e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
        this.app.camera.fov = Math.max(CONFIG.fov.min, Math.min(CONFIG.fov.max, this.app.camera.fov));
        this.app.camera.updateProjectionMatrix();
    }

    _handleClick(event) {
        // Ignore clicks if in WebXR presenting mode
        if (this.app.renderer.xr.enabled && this.app.renderer.xr.isPresenting) return;

        // Admin interaction takes priority
        if (this._handleAdminInteraction(event.clientX, event.clientY)) return;

        // Normal interaction (desktop)
        this._handleNormalInteraction(event.clientX, event.clientY);
    }

    _handleTouchStart(e) {
        if (e.touches.length === 1) {
            this._touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            this._touchStartTime = Date.now();
        }
    }

    _handleTouchEnd(e) {
        if (!this._touchStartPos) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - this._touchStartPos.x;
        const dy = touch.clientY - this._touchStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const duration = Date.now() - this._touchStartTime;

        this._touchStartPos = null;

        // Only treat as tap if short duration and minimal movement
        if (duration > 300 || dist > 10) return;

        // Skip if in VR
        if (this.app.renderer.xr.enabled && this.app.renderer.xr.isPresenting) return;

        // Admin interaction takes priority
        if (this._handleAdminInteraction(touch.clientX, touch.clientY)) return;

        // Normal interaction
        this._handleNormalInteraction(touch.clientX, touch.clientY);

        // Admin triple-tap gesture
        if (!e.target.closest('#admin-panel')) {
            this._tapCount++;
            if (this._tapCount === 3) {
                this._tapCount = 0;
                clearTimeout(this._tapTimer);
                this.app.adminPanel?.toggle();
            } else {
                clearTimeout(this._tapTimer);
                this._tapTimer = setTimeout(() => { this._tapCount = 0; }, 500);
            }
        }

        // Admin double-tap gesture (add hotspot, like right-click)
        if (this.app.panoramaViewer?.isAdminMode && !e.target.closest('#admin-panel')) {
            const now = Date.now();
            const ddx = touch.clientX - this._lastTapX;
            const ddy = touch.clientY - this._lastTapY;
            const ddist = Math.sqrt(ddx * ddx + ddy * ddy);

            if (now - this._lastTapTime < 300 && ddist < 30) {
                e.preventDefault();
                this._handleAdminRightClickAt(touch.clientX, touch.clientY);
                this._lastTapTime = 0;
            } else {
                this._lastTapTime = now;
                this._lastTapX = touch.clientX;
                this._lastTapY = touch.clientY;
            }
        }
    }

    _handleContextMenu(event) {
        if (!this.app.panoramaViewer?.isAdminMode) return;
        event.preventDefault();
        this._handleAdminRightClickAt(event.clientX, event.clientY);
    }

    _handleAdminRightClickAt(clientX, clientY) {
        const rect = this.app.renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._mouse, this.app.camera);

        const intersects = this._raycaster.intersectObject(this.app.panoramaViewer.sphere);
        this.app.panoramaViewer.handleAdminRightClick(intersects);
    }

    // --- Admin Drag Handlers (Mouse) ---

    _handleMouseDown(e) {
        if (!this.app.panoramaViewer?.isAdminMode) return;

        const { intersects } = this._raycastFromScreen(e.clientX, e.clientY);
        if (this.app.panoramaViewer.handleAdminMouseDown(intersects)) {
            this.app.controls.enabled = false;
        }
    }

    _handleMouseMove(e) {
        if (!this.app.panoramaViewer?.isAdminMode) return;
        if (!this.app.panoramaViewer.isDraggingHotspot) return;

        this._raycastFromScreen(e.clientX, e.clientY);
        this.app.panoramaViewer.handleAdminMouseMove(this._raycaster);
    }

    _handleMouseUp() {
        if (this.app.panoramaViewer?.isDraggingHotspot) {
            this.app.panoramaViewer.handleAdminMouseUp();
            this.app.controls.enabled = true;
        }
    }

    // --- Admin Drag Handlers (Touch) ---

    _handleAdminTouchStart(e) {
        if (!this.app.panoramaViewer?.isAdminMode) return;
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const { intersects } = this._raycastFromScreen(touch.clientX, touch.clientY);

        if (this.app.panoramaViewer.handleAdminMouseDown(intersects)) {
            this.app.controls.enabled = false;
        }
    }

    _handleAdminTouchMove(e) {
        if (!this.app.panoramaViewer?.isAdminMode) return;
        if (!this.app.panoramaViewer.isDraggingHotspot) return;

        e.preventDefault();
        const touch = e.touches[0];
        this._raycastFromScreen(touch.clientX, touch.clientY);
        this.app.panoramaViewer.handleAdminMouseMove(this._raycaster);
    }

    _handleAdminTouchEnd() {
        if (this.app.panoramaViewer?.isDraggingHotspot) {
            this.app.panoramaViewer.handleAdminMouseUp();
            this.app.controls.enabled = true;
        }
    }

    // ==================== LIFECYCLE ====================

    _attach() {
        window.addEventListener('resize', this._onResize);
        this.app.container.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('click', this._onClick);
        window.addEventListener('touchstart', this._onTouchStart, { passive: true });
        window.addEventListener('touchend', this._onTouchEnd);
        window.addEventListener('contextmenu', this._onContextMenu);

        // Admin drag (mouse)
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mouseup', this._onMouseUp);

        // Admin drag (touch)
        window.addEventListener('touchstart', this._onAdminTouchStart, { passive: false });
        window.addEventListener('touchmove', this._onAdminTouchMove, { passive: false });
        window.addEventListener('touchend', this._onAdminTouchEnd);

        // WebXR session events
        if (this.app.renderer.xr.enabled) {
            this.app.renderer.xr.addEventListener('sessionstart', () => {
                this.app.camera.fov = CONFIG.fov.vr;
                this.app.camera.updateProjectionMatrix();
            });
            this.app.renderer.xr.addEventListener('sessionend', () => {
                this.app.camera.fov = CONFIG.fov.default;
                this.app.camera.updateProjectionMatrix();
            });

            // VR Controller / Cardboard v2 Button Trigger
            this.app.renderer.xr.getController(0).addEventListener('select', () => {
                const gc = this.app.gazeController;
                if (gc?.hoveredObject) {
                    console.log('[VR] Manual trigger via button');
                    gc.trigger(gc.hoveredObject, gc.hoveredIntersect);
                }
            });
        }
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.app.container.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('click', this._onClick);
        window.removeEventListener('touchstart', this._onTouchStart);
        window.removeEventListener('touchend', this._onTouchEnd);
        window.removeEventListener('contextmenu', this._onContextMenu);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('touchstart', this._onAdminTouchStart);
        window.removeEventListener('touchmove', this._onAdminTouchMove);
        window.removeEventListener('touchend', this._onAdminTouchEnd);

        clearTimeout(this._tapTimer);
    }
}
