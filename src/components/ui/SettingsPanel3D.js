import * as THREE from 'three';
import { CanvasUI } from '../../utils/CanvasUI.js';
import { SettingsStore } from '../../utils/SettingsStore.js';
import { SETTINGS_SCHEMA, clampToStep } from '../../data/settingsSchema.js';

/**
 * SettingsPanel3D — an in-VR, gaze-driven version of the settings panel. Each
 * row shows "Label  value" with [-] and [+] buttons you adjust by dwelling on
 * them (the GazeController auto-repeats a held dwell, so values ramp). Changes
 * route through the same App.applySetting() used by the flat panel, so they take
 * effect in stereo immediately.
 *
 * The panel is world-anchored in front of the user when shown (it does NOT chase
 * the gaze) so you can look around it to target the +/- buttons.
 */
const PANEL_DISTANCE = 1.6;   // metres in front of the user when opened
const ROW_H = 0.13;           // world height per row
const PANEL_W = 1.5;
const STEP_ACTIVATION = 0.7;  // dwell seconds per +/- step (snappier than nav buttons)

export class SettingsPanel3D {
    constructor(scene, camera, applyFn) {
        this.scene = scene;
        this.camera = camera;
        this.applyFn = applyFn;
        this.visible = false;
        this._rows = [];
        this._buttons = [];
        this._camPos = new THREE.Vector3();
        this._fwd = new THREE.Vector3();

        this.group = new THREE.Group();
        this.group.visible = false;
        this.scene.add(this.group);

        this._build();
    }

    // ---- public ----
    toggle() { this.visible ? this.hide() : this.show(); }

    show() {
        this._anchorInFront();
        this._syncAllRows();
        this.visible = true;
        this.group.visible = true;
    }

    hide() {
        this.visible = false;
        this.group.visible = false;
    }

    /** Per-frame: only animate button hover-scale; position is fixed while open. */
    update(delta) {
        if (!this.visible) return;
        for (const b of this._buttons) {
            const t = b.userData.targetScale;
            b.scale.lerp(t, Math.min(1, delta * 12));
        }
    }

    // ---- build ----
    _build() {
        const count = SETTINGS_SCHEMA.length;
        const panelH = (count + 1.4) * ROW_H;

        // backing panel
        const bg = new THREE.Mesh(
            new THREE.PlaneGeometry(PANEL_W, panelH),
            new THREE.MeshBasicMaterial({ color: 0x0b0e16, transparent: true, opacity: 0.72, depthTest: false, side: THREE.DoubleSide })
        );
        bg.renderOrder = 11000;
        this.group.add(bg);

        const topY = panelH / 2 - ROW_H * 0.7;

        // title
        const title = this._makeTextPlane('VR Settings', { w: 0.9, h: 0.13, font: 'bold 48px Roboto, sans-serif', color: '#ffffff', align: 'center' });
        title.position.set(0, topY, 0.002);
        this.group.add(title);

        // rows
        SETTINGS_SCHEMA.forEach((def, i) => {
            const yRow = topY - ROW_H * (i + 1.2);
            const row = { def };

            const { mesh, canvas, ctx } = this._makeLabelPlane();
            mesh.position.set(-0.26, yRow, 0.002);
            this.group.add(mesh);
            row.canvas = canvas; row.ctx = ctx; row.mesh = mesh;
            row.texture = mesh.material.map;

            row.minus = this._makeStepButton('−', def, -1);
            row.minus.position.set(0.36, yRow, 0.004);
            this.group.add(row.minus);

            row.plus = this._makeStepButton('+', def, +1);
            row.plus.position.set(0.58, yRow, 0.004);
            this.group.add(row.plus);

            this._rows.push(row);
        });

        // close button
        const closeCanvas = CanvasUI.createIconButtonTexture('close', { width: 180, height: 160, radius: 40 });
        const close = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.142),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(closeCanvas), transparent: true, depthTest: false, side: THREE.DoubleSide })
        );
        close.renderOrder = 11002;
        close.position.set(PANEL_W / 2 - 0.09, topY, 0.004);
        this._makeInteractive(close, 'Close settings', () => this.hide(), 1.2);
        this.group.add(close);
    }

    _makeStepButton(symbol, def, dir) {
        const canvas = CanvasUI.createButtonTexture(symbol, { width: 180, height: 160, radius: 40, fontSize: 110 });
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.142),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, side: THREE.DoubleSide })
        );
        mesh.renderOrder = 11002;
        this._makeInteractive(mesh, `${def.label} ${dir > 0 ? '+' : '-'}`, () => this._adjust(def, dir), STEP_ACTIVATION);
        return mesh;
    }

    _makeInteractive(mesh, label, onClick, activationTime) {
        mesh.userData.isInteractable = true;
        mesh.userData.label = label;
        mesh.userData.noReentryGuard = true;
        mesh.userData.activationTime = activationTime;
        mesh.userData.targetScale = new THREE.Vector3(1, 1, 1);
        mesh.userData.originalScale = new THREE.Vector3(1, 1, 1);
        mesh.onHoverIn = () => mesh.userData.targetScale.set(1.18, 1.18, 1.18);
        mesh.onHoverOut = () => mesh.userData.targetScale.set(1, 1, 1);
        mesh.onClick = onClick;
        this._buttons.push(mesh);
    }

    _adjust(def, dir) {
        const cur = Number(SettingsStore.get(def.path));
        const next = clampToStep(def, cur + dir * def.step);
        this.applyFn(def.path, next);
        const row = this._rows.find(r => r.def === def);
        if (row) this._drawRow(row, next);
    }

    // ---- drawing ----
    _makeLabelPlane() {
        const canvas = document.createElement('canvas');
        canvas.width = 760; canvas.height = 120;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.92, 0.92 * 120 / 760),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, side: THREE.DoubleSide })
        );
        mesh.renderOrder = 11001;
        return { mesh, canvas, ctx };
    }

    _drawRow(row, value) {
        const ctx = row.ctx;
        const { width: w, height: h } = row.canvas;
        ctx.clearRect(0, 0, w, h);
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 6;
        // label (left)
        ctx.fillStyle = '#ffffff';
        ctx.font = '34px Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(row.def.label, 12, h / 2);
        // value (right)
        ctx.fillStyle = '#4ea1ff';
        ctx.font = 'bold 40px Roboto, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(this._fmt(value, row.def), w - 16, h / 2);
        row.texture.needsUpdate = true;
    }

    _syncAllRows() {
        for (const row of this._rows) {
            this._drawRow(row, Number(SettingsStore.get(row.def.path)));
        }
    }

    _makeTextPlane(text, opt) {
        const canvas = document.createElement('canvas');
        canvas.width = 760; canvas.height = Math.round(760 * opt.h / opt.w);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = opt.color;
        ctx.font = opt.font;
        ctx.textAlign = opt.align || 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 6;
        ctx.fillText(text, opt.align === 'left' ? 8 : canvas.width / 2, canvas.height / 2);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(opt.w, opt.h),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, side: THREE.DoubleSide })
        );
        mesh.renderOrder = 11001;
        return mesh;
    }

    _fmt(v, def) {
        const mult = def.displayMult || 1;
        const displayStep = def.step * mult;
        const decimals = (String(displayStep).split('.')[1] || '').length;
        return Number(v * mult).toFixed(decimals);
    }

    // ---- placement ----
    _anchorInFront() {
        this.camera.getWorldPosition(this._camPos);
        this.camera.getWorldDirection(this._fwd);
        this._fwd.y = 0;
        if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, -1);
        this._fwd.normalize();

        this.group.position.copy(this._camPos).addScaledVector(this._fwd, PANEL_DISTANCE);
        this.group.position.y = this._camPos.y;
        this.group.lookAt(this._camPos);
    }

    dispose() {
        this.group.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (o.material.map) o.material.map.dispose();
                o.material.dispose();
            }
        });
        this.scene.remove(this.group);
    }
}
