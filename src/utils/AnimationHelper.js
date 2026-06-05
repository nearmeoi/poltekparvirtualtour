import * as THREE from 'three';

/**
 * AnimationHelper - Shared animation utilities for Three.js objects
 * Extracted to reduce code duplication across components
 */

/**
 * Animate object scale with easing
 * Requires userData: { targetScale, animProgress, startScale }
 * 
 * @param {THREE.Object3D} obj - Object to animate
 * @param {number} delta - Delta time from clock
 * @param {number} animSpeed - Animation speed multiplier (default: 6)
 */
export function animateScale(obj, delta, animSpeed = 6) {
    if (!obj || !obj.userData.targetScale) return;

    const diff = obj.scale.distanceTo(obj.userData.targetScale);

    // Start new animation if target changed
    if (diff > 0.01 && obj.userData.animProgress >= 1) {
        obj.userData.animProgress = 0;
        obj.userData.startScale = obj.scale.clone();
    }

    // Animate
    if (obj.userData.animProgress < 1 && obj.userData.startScale) {
        obj.userData.animProgress = Math.min(1, obj.userData.animProgress + delta * animSpeed);

        // Smoothstep easing
        const t = obj.userData.animProgress;
        const easeInOut = t * t * (3 - 2 * t);

        obj.scale.lerpVectors(obj.userData.startScale, obj.userData.targetScale, easeInOut);
    }
}

/**
 * Animate object scale with opacity (for SubMenu-style items)
 * Requires userData: { targetScale, targetOpacity, animProgress, startScale, startOpacity }
 * 
 * @param {THREE.Mesh} mesh - Mesh to animate (must have material.opacity)
 * @param {number} delta - Delta time
 * @param {number} animSpeed - Animation speed multiplier
 */
export function animateScaleAndOpacity(mesh, delta, animSpeed = 6) {
    if (!mesh || !mesh.userData.targetScale) return;

    const diff = mesh.scale.distanceTo(mesh.userData.targetScale);

    if (diff > 0.01 && mesh.userData.animProgress >= 1) {
        mesh.userData.animProgress = 0;
        mesh.userData.startScale = mesh.scale.clone();
        mesh.userData.startOpacity = mesh.material.opacity;
    }

    if (mesh.userData.animProgress < 1 && mesh.userData.startScale) {
        mesh.userData.animProgress = Math.min(1, mesh.userData.animProgress + delta * animSpeed);

        const t = mesh.userData.animProgress;
        const easeInOut = t * t * (3 - 2 * t);

        mesh.scale.lerpVectors(mesh.userData.startScale, mesh.userData.targetScale, easeInOut);

        // Opacity transition
        if (mesh.userData.startOpacity !== undefined && mesh.userData.targetOpacity !== undefined) {
            mesh.material.opacity = mesh.userData.startOpacity +
                (mesh.userData.targetOpacity - mesh.userData.startOpacity) * easeInOut;
        }
    }
}

/**
 * Setup interactable userData for an object
 * @param {THREE.Object3D} obj - Object to setup
 * @param {object} options - Configuration options
 */
export function setupInteractable(obj, options = {}) {
    const {
        hoverScale = 1.1,
        onClick = null,
        onHoverIn = null,
        onHoverOut = null
    } = options;

    obj.userData.isInteractable = true;
    obj.userData.originalScale = new THREE.Vector3(1, 1, 1);
    obj.userData.targetScale = new THREE.Vector3(1, 1, 1);
    obj.userData.animProgress = 1;

    obj.onHoverIn = onHoverIn || (() => obj.userData.targetScale.setScalar(hoverScale));
    obj.onHoverOut = onHoverOut || (() => obj.userData.targetScale.copy(obj.userData.originalScale));
    obj.onClick = onClick;
}
