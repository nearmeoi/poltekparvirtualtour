export const FullscreenHelper = {
    async request(element) {
        const el = element || document.documentElement;
        const fn = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.mozRequestFullScreen
            || el.msRequestFullscreen;
        if (fn) {
            await fn.call(el).catch(err =>
                console.warn('[FullscreenHelper] request failed:', err)
            );
        }
    },

    async exit() {
        const fn = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.mozCancelFullScreen
            || document.msExitFullscreen;
        if (fn && this.isFullscreen()) {
            await fn.call(document).catch(err =>
                console.warn('[FullscreenHelper] exit failed:', err)
            );
        }
    },

    async lockLandscape() {
        try {
            await screen.orientation.lock('landscape');
        } catch (err) {
            console.warn('[FullscreenHelper] orientation lock not supported:', err);
        }
    },

    isFullscreen() {
        return !!(
            document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
        );
    },

    unlockOrientation() {
        try {
            screen.orientation.unlock();
        } catch (err) {
            console.warn('[FullscreenHelper] orientation unlock not supported:', err);
        }
    }
};
