import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { CanvasUI } from '../../utils/CanvasUI.js';

export class SubtitlePanel3D {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        this._tmp = new THREE.Vector3();
        this._currentText = '';

        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.visible = false;

        this._createPanel();
    }

    _createPanel() {
        this._canvasW = 1024;
        this._padX = 40;
        this._padY = 30;
        this._fontSize = 52;
        this._lineHeight = 68;
        this._maxLines = 5;

        // FIXED canvas sized for the max line count — never resized. Resizing a
        // canvas-backed texture left the previous (taller) caption ghosting above
        // a shorter one, because the GPU texture kept stale pixels. With a fixed
        // canvas we just clear + draw a content-sized box centered in it.
        this._canvasH = this._padY * 2 + this._maxLines * this._lineHeight;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this._canvasW;
        this.canvas.height = this._canvasH;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        // Plane matches the canvas aspect (no text distortion); size is fixed,
        // short captions simply leave transparent margins above/below the box.
        const worldH = CONFIG.narration.subtitleWidth * (this._canvasH / this._canvasW);
        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(CONFIG.narration.subtitleWidth, worldH),
            this.material
        );
        this.mesh.renderOrder = 9990;
        this.group.add(this.mesh);
    }

    /**
     * Greedily wrap text into lines that fit maxWidth. Words longer than a
     * line are hard-broken by character. Caps at _maxLines, ellipsizing the
     * last line if content remains.
     */
    _wrapLines(ctx, text, maxWidth) {
        const lines = [];
        const pushWrapped = (word) => {
            // Hard-break a single word too wide to fit on its own line.
            let chunk = '';
            for (const ch of word) {
                if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
                    lines.push(chunk);
                    chunk = ch;
                } else {
                    chunk += ch;
                }
            }
            return chunk;
        };

        let line = '';
        for (const word of text.split(/\s+/).filter(Boolean)) {
            const candidate = line ? line + ' ' + word : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                line = candidate;
                continue;
            }
            if (line) lines.push(line);
            if (ctx.measureText(word).width > maxWidth) {
                line = pushWrapped(word);
            } else {
                line = word;
            }
        }
        if (line) lines.push(line);

        if (lines.length > this._maxLines) {
            lines.length = this._maxLines;
            lines[this._maxLines - 1] = lines[this._maxLines - 1].replace(/.$/, '…');
        }
        return lines.length ? lines : [''];
    }

    _drawText(text) {
        const cw = this._canvasW;
        const chFull = this._canvasH;
        const ctx = this.canvas.getContext('2d');

        ctx.clearRect(0, 0, cw, chFull);
        ctx.font = `bold ${this._fontSize}px Roboto, sans-serif`;

        const lines = this._wrapLines(ctx, text, cw - this._padX * 2);

        // Content-sized box, vertically centered in the fixed-height canvas.
        const contentH = this._padY * 2 + lines.length * this._lineHeight;
        const top = (chFull - contentH) / 2;

        CanvasUI.roundRect(ctx, 8, top + 8, cw - 16, contentH - 16, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${this._fontSize}px Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;

        const startY = top + this._padY + this._lineHeight / 2;
        lines.forEach((line, i) => {
            ctx.fillText(line, cw / 2, startY + i * this._lineHeight);
        });

        this.texture.needsUpdate = true;
    }

    show(text) {
        if (!text) { this.hide(); return; }
        if (text === this._currentText && this.group.visible) return;
        this._currentText = text;
        this._drawText(text);
        this.group.visible = true;
    }

    hide() {
        if (!this.group.visible) return;
        this.group.visible = false;
        this._currentText = '';
    }

    update() {
        if (!this.group.visible) return;

        const dir = this.camera.getWorldDirection(this._tmp).setY(0);
        if (dir.lengthSq() < 0.001) return;
        dir.normalize();

        this.group.position
            .copy(this.camera.position)
            .addScaledVector(dir, CONFIG.narration.subtitleDistance)
            .setY(this.camera.position.y + CONFIG.narration.subtitleY);

        this.group.lookAt(this.camera.position);
    }

    dispose() {
        this.texture.dispose();
        this.material.dispose();
        this.mesh.geometry.dispose();
        this.scene.remove(this.group);
    }
}
