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
        // Canvas width is fixed for resolution; height grows with line count.
        // World height is derived from the canvas aspect so text is never distorted.
        this._canvasW = 1024;
        this._padX = 40;
        this._padY = 30;
        this._fontSize = 52;
        this._lineHeight = 68;
        this._maxLines = 5;
        this._worldH = null; // tracks current plane height to avoid rebuilds

        this.canvas = document.createElement('canvas');
        this.canvas.width = this._canvasW;
        this.canvas.height = this._padY * 2 + this._lineHeight; // single-line baseline

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(CONFIG.narration.subtitleWidth, CONFIG.narration.subtitleHeight),
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
        const ctx = this.canvas.getContext('2d');
        ctx.font = `bold ${this._fontSize}px Roboto, sans-serif`;

        const lines = this._wrapLines(ctx, text, cw - this._padX * 2);

        // Resize canvas to fit the wrapped lines (resets the 2D context).
        const ch = this._padY * 2 + lines.length * this._lineHeight;
        this.canvas.height = ch;

        ctx.clearRect(0, 0, cw, ch);
        CanvasUI.roundRect(ctx, 8, 8, cw - 16, ch - 16, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${this._fontSize}px Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;

        const startY = this._padY + this._lineHeight / 2;
        lines.forEach((line, i) => {
            ctx.fillText(line, cw / 2, startY + i * this._lineHeight);
        });

        this._syncGeometry(ch);
        this.texture.needsUpdate = true;
    }

    /** Rebuild the plane so its world aspect matches the canvas (no distortion). */
    _syncGeometry(canvasH) {
        const worldH = CONFIG.narration.subtitleWidth * (canvasH / this._canvasW);
        if (worldH === this._worldH) return;
        this._worldH = worldH;
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(CONFIG.narration.subtitleWidth, worldH);
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
