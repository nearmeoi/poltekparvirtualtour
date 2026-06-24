import * as THREE from 'three';

/**
 * XRDiagnostics — captures the real per-eye WebXR render state on-device and
 * shows it in a DOM overlay when the session ends (so it's readable on a phone
 * without chrome://inspect). Use to debug native-WebXR stereo problems
 * (double/ghosted image, wrong split, wrong FOV, off-center parallax).
 *
 * Wire-up (in main.js):
 *   this.xrDiag = new XRDiagnostics(this.renderer, () => this.panoramaViewer?.sphere);
 *   // in render(), when presenting:        this.xrDiag.capture();
 *   // in xr 'sessionend' handler:          this.xrDiag.showReport();
 */
export class XRDiagnostics {
    constructor(renderer, getSphere) {
        this.renderer = renderer;
        this.getSphere = getSphere || (() => null);
        this._samples = [];
        this._frame = 0;
        this._tmpA = new THREE.Vector3();
        this._tmpB = new THREE.Vector3();
        this._tmpMid = new THREE.Vector3();
        this._tmpSphere = new THREE.Vector3();
    }

    /** Vertical FOV (deg) extracted from a perspective projection matrix. */
    _vfovDeg(projMatrix) {
        const m5 = projMatrix.elements[5]; // = 1 / tan(vFov/2)
        if (!m5) return 0;
        return +(2 * Math.atan(1 / m5) * 180 / Math.PI).toFixed(2);
    }

    /** Call every frame while presenting. Samples ~4x/sec to keep it cheap. */
    capture() {
        const xr = this.renderer.xr;
        if (!xr?.isPresenting) return;
        this._frame++;
        if (this._frame % 15 !== 0) return; // sample roughly 4x/sec at 60fps

        const arrayCam = xr.getCamera();
        const subs = arrayCam?.cameras || [];
        arrayCam.getWorldPosition(this._tmpMid);

        const sphere = this.getSphere();
        let camToSphere = null;
        if (sphere) {
            sphere.getWorldPosition(this._tmpSphere);
            camToSphere = +this._tmpMid.distanceTo(this._tmpSphere).toFixed(4);
        }

        let ipd = null;
        if (subs.length >= 2) {
            subs[0].getWorldPosition(this._tmpA);
            subs[1].getWorldPosition(this._tmpB);
            ipd = +this._tmpA.distanceTo(this._tmpB).toFixed(4);
        }

        const eyes = subs.map((c, i) => {
            const vp = c.viewport || {};
            return {
                eye: i,
                vp: vp.width !== undefined ? `${vp.x|0},${vp.y|0} ${vp.width|0}x${vp.height|0}` : 'n/a',
                vfov: this._vfovDeg(c.projectionMatrix)
            };
        });

        this._samples.push({
            views: subs.length,
            ipd,
            camToSphere,
            mid: `${this._tmpMid.x.toFixed(2)},${this._tmpMid.y.toFixed(2)},${this._tmpMid.z.toFixed(2)}`,
            sphere: sphere ? `${this._tmpSphere.x.toFixed(2)},${this._tmpSphere.y.toFixed(2)},${this._tmpSphere.z.toFixed(2)}` : 'n/a',
            eyes
        });

        // keep memory bounded
        if (this._samples.length > 40) this._samples.shift();
    }

    _summary() {
        if (!this._samples.length) return 'No XR samples captured (session may not have presented).';
        const last = this._samples[this._samples.length - 1];
        const camToSphereVals = this._samples.map(s => s.camToSphere).filter(v => v != null);
        const maxC2S = camToSphereVals.length ? Math.max(...camToSphereVals) : null;
        const minC2S = camToSphereVals.length ? Math.min(...camToSphereVals) : null;

        const lines = [];
        lines.push('=== WebXR STEREO DIAGNOSTICS ===');
        lines.push(`samples: ${this._samples.length}`);
        lines.push(`views (eyes): ${last.views}  ${last.views === 2 ? 'OK' : 'EXPECTED 2!'}`);
        lines.push(`IPD (m): ${last.ipd}  ${last.ipd != null && last.ipd > 0.04 && last.ipd < 0.08 ? 'OK' : 'CHECK'}`);
        lines.push(`cam->sphere dist (m): last=${last.camToSphere}  min=${minC2S}  max=${maxC2S}`);
        lines.push(`  (should be ~0; large/varying => parallax = double vision)`);
        lines.push(`midpoint pos: ${last.mid}`);
        lines.push(`sphere pos:   ${last.sphere}`);
        last.eyes.forEach(e => lines.push(`eye${e.eye}: vfov=${e.vfov}deg  viewport=${e.vp}`));
        if (last.eyes.length === 2) {
            const fovDiff = Math.abs(last.eyes[0].vfov - last.eyes[1].vfov);
            lines.push(`eye vfov match: ${fovDiff < 1 ? 'OK' : 'MISMATCH ' + fovDiff.toFixed(2)}`);
        }
        return lines.join('\n');
    }

    /** Call from sessionend — renders a readable overlay on the phone screen. */
    showReport() {
        const text = this._summary();
        console.log(text);

        let el = document.getElementById('xr-diag-overlay');
        if (!el) {
            el = document.createElement('pre');
            el.id = 'xr-diag-overlay';
            Object.assign(el.style, {
                position: 'fixed', left: '10px', top: '10px', right: '10px',
                maxHeight: '80vh', overflow: 'auto', zIndex: '100000',
                background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '12px',
                font: '12px/1.4 monospace', whiteSpace: 'pre-wrap',
                border: '1px solid #0f0', borderRadius: '8px'
            });
            document.body.appendChild(el);
        }
        el.textContent = text + '\n';
        const close = document.createElement('button');
        close.textContent = '✕ close';
        Object.assign(close.style, {
            display: 'block', marginTop: '10px', padding: '8px 14px',
            background: '#0f0', color: '#000', border: 'none', borderRadius: '6px'
        });
        close.onclick = () => el.remove();
        el.appendChild(close);
        return text;
    }

    reset() { this._samples = []; this._frame = 0; }
}
