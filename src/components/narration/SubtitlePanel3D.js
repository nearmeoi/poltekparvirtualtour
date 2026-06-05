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
        const w = CONFIG.narration.subtitleWidth;
        const h = CONFIG.narration.subtitleHeight;

        const canvasW = 1024;
        const canvasH = Math.round(canvasW * (h / w));

        this.canvas = document.createElement('canvas');
        this.canvas.width = canvasW;
        this.canvas.height = canvasH;

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
            new THREE.PlaneGeometry(w, h),
            this.material
        );
        this.mesh.renderOrder = 9990;
        this.group.add(this.mesh);
    }

    _drawText(text) {
        const { width: cw, height: ch } = this.canvas;
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);

        CanvasUI.roundRect(ctx, 8, 8, cw - 16, ch - 16, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 52px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;

        const maxWidth = cw - 80;
        const words = text.split(' ');
        let line1 = '';
        let line2 = '';
        let onLine2 = false;

        for (const word of words) {
            const candidate = (onLine2 ? line2 : line1) + word + ' ';
            if (!onLine2 && ctx.measureText(candidate).width > maxWidth) {
                onLine2 = true;
            }
            if (onLine2) line2 += word + ' ';
            else line1 += word + ' ';
        }

        const l1 = line1.trim();
        const l2 = line2.trim();
        if (l2) {
            ctx.fillText(l1, cw / 2, ch / 2 - 34);
            ctx.fillText(l2, cw / 2, ch / 2 + 34);
        } else {
            ctx.fillText(l1, cw / 2, ch / 2);
        }

        this.texture.needsUpdate = true;
    }

    show(text) {
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
