/**
 * iOS Fullscreen Hack
 * Uses the video element's webkitEnterFullscreen to achieve true fullscreen on iOS Safari
 */
export class iOSFullscreenHelper {
    constructor() {
        this.video = null;
        this.isFullscreen = false;
        this.onFullscreenChange = null;

        // Only create on iOS
        if (this.isIOS()) {
            this.createVideo();
        }
    }

    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    createVideo() {
        // Create a tiny video element that will trigger fullscreen
        this.video = document.createElement('video');
        this.video.id = 'ios-fullscreen-video';

        // Use a tiny transparent video or data URI
        // This is a 1x1 transparent WebM video encoded as base64
        this.video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU4Ljc2LjEwMA==';

        // Critical attributes for iOS
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('webkit-playsinline', '');
        this.video.muted = true;
        this.video.loop = true;
        this.video.autoplay = false;

        // Style it to be invisible but present
        Object.assign(this.video.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: '-1', // Behind everything initially
            opacity: '0',
            pointerEvents: 'none',
            backgroundColor: 'black'
        });

        document.body.appendChild(this.video);

        // Listen for fullscreen changes
        this.video.addEventListener('webkitbeginfullscreen', () => {
            console.log('iOS: Entered video fullscreen');
            this.isFullscreen = true;
            this.showVideoBackground();
            if (this.onFullscreenChange) this.onFullscreenChange(true);
        });

        this.video.addEventListener('webkitendfullscreen', () => {
            console.log('iOS: Exited video fullscreen');
            this.isFullscreen = false;
            this.hideVideoBackground();
            if (this.onFullscreenChange) this.onFullscreenChange(false);
        });
    }

    showVideoBackground() {
        if (!this.video) return;
        // Make video visible as black background when fullscreen
        this.video.style.zIndex = '1';
        this.video.style.opacity = '1';

        // Move the canvas and UI on top
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.style.position = 'fixed';
            canvas.style.zIndex = '10';
            canvas.style.top = '0';
            canvas.style.left = '0';
        }

        // Move VR UI on top
        const vrUI = document.querySelector('.vr-hud-container');
        if (vrUI) {
            vrUI.style.zIndex = '100';
        }
    }

    hideVideoBackground() {
        if (!this.video) return;
        this.video.style.zIndex = '-1';
        this.video.style.opacity = '0';

        // Reset canvas positioning
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.style.position = '';
            canvas.style.zIndex = '';
        }
    }

    async enterFullscreen() {
        if (!this.video) {
            console.log('iOS fullscreen: No video element (not iOS?)');
            return false;
        }

        try {
            // Need to play first (user gesture required)
            await this.video.play();

            // Then request fullscreen
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
                return true;
            } else if (this.video.webkitEnterFullScreen) {
                this.video.webkitEnterFullScreen();
                return true;
            } else {
                console.log('iOS fullscreen: webkitEnterFullscreen not available');
                return false;
            }
        } catch (e) {
            console.error('iOS fullscreen error:', e);
            return false;
        }
    }

    exitFullscreen() {
        if (!this.video) return;

        try {
            if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
            } else if (this.video.webkitExitFullScreen) {
                this.video.webkitExitFullScreen();
            }
            this.video.pause();
        } catch (e) {
            console.error('iOS exit fullscreen error:', e);
        }
    }

    dispose() {
        if (this.video && this.video.parentNode) {
            this.video.parentNode.removeChild(this.video);
        }
        this.video = null;
    }
}
