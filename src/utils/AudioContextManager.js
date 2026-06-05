import * as THREE from 'three';

/**
 * AudioContextManager - Centralized audio context handling
 * Manages Web Audio API context state (suspended/running)
 * Uses THREE.AudioContext wrapper for consistency
 */
export const AudioContextManager = {
    /**
     * Get the Web Audio API context via THREE.AudioContext
     * @returns {AudioContext|null} The audio context or null if not available
     */
    getContext() {
        return THREE.AudioContext.getContext();
    },

    /**
     * Resume the audio context if it's suspended
     * Called after user gesture (click/tap) to satisfy autoplay policies
     */
    async resume() {
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
            try {
                await ctx.resume();
                console.log('[AudioContextManager] Audio context resumed');
            } catch (err) {
                console.warn('[AudioContextManager] resume failed:', err);
            }
        }
    }
};
