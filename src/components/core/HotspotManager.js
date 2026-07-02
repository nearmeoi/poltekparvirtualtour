import * as THREE from 'three';
import { CONFIG } from '../../config.js';

export class HotspotManager {
    constructor(parent, bus) {
        // `parent` is the Object3D the hotspot group attaches to. It MUST be the
        // PanoramaViewer's group (not the bare scene): every interactable raycast
        // (admin drag/select + normal gaze/click) traverses pv.group recursively,
        // so hotspots have to live under it or they can never be hit.
        this.parent = parent;
        this.bus = bus;
        this.hotspots = [];
        this.textureCache = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.clock = new THREE.Clock();

        this.group = new THREE.Group();
        this.parent.add(this.group);

        bus.on('scene:change', ({ hotspots }) => {
            this.loadHotspots(hotspots);
        });

        bus.on('admin:hotspot-save', ({ hotspots }) => {
            this.loadHotspots(hotspots);
        });
    }

    loadHotspots(hotspotDataArray) {
        this.clearHotspots();
        (hotspotDataArray || []).forEach(data => {
            const mesh = this._createHotspotMesh(data);
            if (mesh) {
                this.group.add(mesh);
                this.hotspots.push(mesh);
            }
        });
    }

    clearHotspots() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
            this.group.remove(child);
        }
        this.hotspots = [];
    }

    getInteractables() {
        return this.hotspots;
    }

    _createHotspotMesh(data) {
        if (!data) return null;

        const type = data.type || 'arrow';
        const size = data.size || CONFIG.panorama.hotspotRadius;
        const color = data.color || null;
        const iconUrl = data.icon_url || null;

        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        if (iconUrl) {
            this.textureLoader.load(iconUrl, (tex) => {
                material.map = tex;
                material.needsUpdate = true;
            });
        } else {
            material.map = this._createIconTexture(type, color);
        }

        const mesh = new THREE.Mesh(geometry, material);

        const radius = 45;
        const yawRad = THREE.MathUtils.degToRad((data.yaw || 0) + 90);
        const isNavArrow = type === 'arrow' || type === 'back';
        const pitchRad = THREE.MathUtils.degToRad(data.pitch || 0);

        const x = radius * Math.sin(yawRad) * Math.cos(pitchRad);
        const y = radius * Math.sin(pitchRad);
        const z = -radius * Math.cos(yawRad) * Math.cos(pitchRad);

        const worldUp = new THREE.Vector3(0, 1, 0);

        mesh.position.set(x, y, z);

        if (isNavArrow) {
            mesh.scale.set(2.2, 2.2, 2.2);

            const facingCamera = new THREE.Vector3().copy(mesh.position).normalize().negate();
            const navTilt = data.navTilt !== undefined ? data.navTilt : 0.40;
            const localZ = new THREE.Vector3().lerpVectors(worldUp, facingCamera, navTilt).normalize();

            // next (arrow): chevron points AWAY from center
            // back:         chevron points TOWARD center (negate horizontal direction)
            const sign = type === 'back' ? -1 : 1;
            const horizontalDir = new THREE.Vector3(sign * x, 0, sign * z).normalize();
            const localY = horizontalDir.clone();

            let localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
            localY.crossVectors(localZ, localX).normalize();

            // navRoll: left-right tilt in degrees — rotates localX/localY around localZ
            const navRoll = THREE.MathUtils.degToRad(data.navRoll || 0);
            if (navRoll !== 0) {
                const cosR = Math.cos(navRoll);
                const sinR = Math.sin(navRoll);
                const rx = new THREE.Vector3().addScaledVector(localX, cosR).addScaledVector(localY, sinR);
                const ry = new THREE.Vector3().addScaledVector(localX, -sinR).addScaledVector(localY, cosR);
                localX = rx;
                localY.copy(ry);
            }

            const matrix = new THREE.Matrix4();
            matrix.makeBasis(localX, localY, localZ);
            mesh.setRotationFromMatrix(matrix);

            // --- Animation child: per-pin canvas updated every frame ---
            // Canvas clip keeps the sweeping chevron strictly inside the oval.
            const animCanvas = document.createElement('canvas');
            animCanvas.width = 256; animCanvas.height = 256;
            const animTex = new THREE.CanvasTexture(animCanvas);
            animTex.minFilter = THREE.LinearFilter;
            const animGeo = new THREE.PlaneGeometry(size, size);
            const animMat = new THREE.MeshBasicMaterial({
                map: animTex, transparent: true, depthTest: false, opacity: 1
            });
            const animMesh = new THREE.Mesh(animGeo, animMat);
            animMesh.renderOrder = 10000;
            mesh.add(animMesh);
            mesh.userData.chevronMesh = animMesh;
            mesh.userData.animCanvas = animCanvas;
            mesh.userData.animTex = animTex;
            mesh.userData.chevronPhase = 0;
            mesh.userData.scaleProgress = 0; // 0=normal, 1=fully hovered
            mesh.userData.scaleDirection = 0; // +1 growing, -1 shrinking

            // Bounce-in: start from zero scale
            mesh.userData.birthTime = this.clock.getElapsedTime();
            mesh.scale.set(0.001, 0.001, 0.001);
        } else {
            // Vertical billboard facing center
            const forward = new THREE.Vector3().copy(mesh.position).normalize().negate();
            const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
            const up = new THREE.Vector3().crossVectors(forward, right).normalize();
            const matrix = new THREE.Matrix4();
            matrix.makeBasis(right, up, forward);
            mesh.setRotationFromMatrix(matrix);
        }

        mesh.userData.isInteractable = true;
        mesh.userData.label = data.label || 'Hotspot';
        mesh.userData.hotspotData = data;

        if (data.label) {
            const textSize = data.textSize || 1.0;
            const labelOffset = data.labelOffset !== undefined ? data.labelOffset : 0;
            const wrapLabel = data.labelWrap || false;
            const labelMesh = this._createLabel(data.label, textSize, wrapLabel, color);

            const labelRadius = radius;
            const baseOffset = size * 0.8 + 2 * textSize;
            const finalOffsetDeg = baseOffset + labelOffset;
            const labelPitchRad = THREE.MathUtils.degToRad((data.pitch || 0) - finalOffsetDeg);
            const labelX = labelRadius * Math.sin(yawRad) * Math.cos(labelPitchRad);
            const labelY = labelRadius * Math.sin(labelPitchRad);
            const labelZ = -labelRadius * Math.cos(yawRad) * Math.cos(labelPitchRad);

            labelMesh.position.set(labelX, labelY, labelZ);

            const lForward = new THREE.Vector3().copy(labelMesh.position).normalize().negate();
            const lRight = new THREE.Vector3().crossVectors(worldUp, lForward).normalize();
            const lUp = new THREE.Vector3().crossVectors(lForward, lRight).normalize();
            const lMatrix = new THREE.Matrix4();
            lMatrix.makeBasis(lRight, lUp, lForward);
            labelMesh.setRotationFromMatrix(lMatrix);
            labelMesh.renderOrder = 9999;

            this.group.add(labelMesh);
            mesh.userData.labelSprite = labelMesh;
        }

        mesh.userData.isNavArrow = isNavArrow;
        mesh.userData.originalScale = new THREE.Vector3().copy(isNavArrow ? new THREE.Vector3(2.2, 2.2, 2.2) : mesh.scale);
        mesh.userData.isHovered = false;
        mesh.onHoverIn = () => {
            mesh.userData.isHovered = true;
            if (isNavArrow) mesh.userData.scaleDirection = 1;
        };
        mesh.onHoverOut = () => {
            mesh.userData.isHovered = false;
            if (isNavArrow) mesh.userData.scaleDirection = -1;
        };

        mesh.onClick = () => {
            this.bus.emit('hotspot:click', { data, position: mesh.position.clone() });
        };

        mesh.renderOrder = 9999;
        return mesh;
    }

    _createLabel(text, scale = 1.0, wrapLabel = false, themeColor = null) {
        const baseFontSize = 42;
        const fontSize = baseFontSize * scale;
        const margin = 20 * scale; // space for shadow
        const lineHeight = fontSize * 1.3;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `bold ${fontSize}px 'Roboto', 'Segoe UI', sans-serif`;

        let lines = [text];
        let maxLineWidth;

        if (wrapLabel && text.length > 12) {
            const maxWidth = 300 * scale;
            const words = text.split(' ');
            lines = [];
            let currentLine = '';
            for (const word of words) {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);
            maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
        } else {
            maxLineWidth = ctx.measureText(text).width;
        }

        const rectW = maxLineWidth;
        const rectH = lineHeight * lines.length;
        
        canvas.width = rectW + margin * 2;
        canvas.height = rectH + margin * 2;

        ctx.translate(margin, margin);

        // Orbital menu text style - pure text, no box
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12 * scale;
        ctx.shadowOffsetY = 2 * scale;
        
        ctx.font = `bold ${fontSize}px 'Roboto', 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Convert text to uppercase just like orbital menu
        const displayLines = lines.map(l => l.toUpperCase());
        const startY = (rectH - lineHeight * displayLines.length) / 2 + lineHeight / 2;
        
        displayLines.forEach((line, i) => {
            // Draw twice for a more solid, legible shadow in VR
            ctx.fillText(line, rectW / 2, startY + i * lineHeight);
            ctx.fillText(line, rectW / 2, startY + i * lineHeight); 
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const geometry = new THREE.PlaneGeometry(canvas.width * 0.018, canvas.height * 0.018);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        return new THREE.Mesh(geometry, material);
    }

    _createIconTexture(type, customColor = null) {
        if (type === 'arrow' || type === 'back') {
            return this._createNavArrowTexture();
        }

        const key = 'icon_svg_' + type + '_' + (customColor || '');
        if (this.textureCache.has(key)) return this.textureCache.get(key);

        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Vibrant Colors
        const defaultColors = {
            arrow: '#ff2a2a', location: '#ff2a2a', scene: '#ff2a2a', 
            info: '#00f0ff', plus: '#00ff66', home: '#bc13fe', 
            back: '#ffaa00', photo: '#ff00a0', video: '#ff3300'
        };
        const color = customColor || defaultColors[type] || '#ffffff';

        // Standard standing icons (info, photo, location, etc.)
        const svgPaths = {
            location: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            scene: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            info: 'M12 2c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm-.5 4.5c0-.5.5-1 1-1h1c.5 0 1 .5 1 1v5.5c0 .5.5 1 1 1h.5c.3 0 .5.2.5.5s-.2.5-.5.5h-1c-1.1 0-2-.9-2-2v-5.5h-.5c-.5 0-1-.5-1-1z',
            plus: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z',
            home: 'M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
            photo: 'M12 12c1.65 0 3-1.35 3-3s-1.35-3-3-3-3 1.35-3 3 1.35 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm9.4 1.6l-1.8-2h-3.6l-1.8 2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7.6c0-1.1-.9-2-2-2z',
            video: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'
        };

        const pathStr = svgPaths[type] || svgPaths['location'];
        const path = new Path2D(pathStr);

        const scale = 8;
        const offset = (size - (24 * scale)) / 2;

        // Draw shadow
        ctx.translate(offset, offset + 10);
        ctx.scale(scale, scale);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.fill(path);

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(offset, offset);
        ctx.scale(scale, scale);

        // Core fill with glow
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 0;
        ctx.fill(path);

        ctx.shadowBlur = 0;
        ctx.fill(path);

        // Stroke
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.stroke(path);

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        this.textureCache.set(key, texture);
        return texture;
    }

    _createNavArrowTexture() {
        const key = 'nav_arrow_gmaps';
        if (this.textureCache.has(key)) return this.textureCache.get(key);

        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const cx = size / 2;       // 128
        const cy = size / 2 + 20;  // 148 — oval sits slightly below center

        // Oval base — dark so it's visible on both bright and dark floors
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 110, 70, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.60)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.40)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Chevron arrow — white for contrast against dark oval
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(55, 168);
        ctx.lineTo(128, 92);
        ctx.lineTo(201, 168);
        ctx.lineTo(181, 168);
        ctx.lineTo(128, 112);
        ctx.lineTo(75, 168);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.shadowBlur = 0;

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        this.textureCache.set(key, texture);
        return texture;
    }

    update() {
        const elapsed = this.clock.getElapsedTime();
        // Elastic overshoot for bounce-in
        const elasticOut = (t) => {
            if (t <= 0) return 0; if (t >= 1) return 1;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
        };
        // Smoothstep ease-in-out for hover scale
        const smoothstep = (t) => t * t * (3 - 2 * t);

        // Delta from previous frame (used for chevron phase and scale progress)
        const delta = elapsed - (this._prevElapsed ?? elapsed);
        this._prevElapsed = elapsed;

        this.hotspots.forEach((mesh, i) => {
            if (!mesh.userData.isNavArrow) return;

            const base = mesh.userData.originalScale;
            const age = elapsed - (mesh.userData.birthTime ?? elapsed);

            // --- Scale: bounce-in then ease-in-out hover ---
            if (age < 0.7) {
                // Bounce-in overrides everything
                mesh.scale.set(base.x * elasticOut(age / 0.7), base.y * elasticOut(age / 0.7), base.z * elasticOut(age / 0.7));
                mesh.userData.scaleProgress = 0;
                mesh.userData.scaleDirection = 0;
            } else {
                // Ease-in-out hover scale (0=normal, 1=1.25×)
                const dir = mesh.userData.scaleDirection ?? 0;
                if (dir !== 0) {
                    mesh.userData.scaleProgress = Math.max(0, Math.min(1,
                        (mesh.userData.scaleProgress ?? 0) + dir * delta / 0.22
                    ));
                    if (mesh.userData.scaleProgress <= 0 || mesh.userData.scaleProgress >= 1) {
                        mesh.userData.scaleDirection = 0;
                    }
                }
                const mult = 1.0 + smoothstep(mesh.userData.scaleProgress ?? 0) * 0.25;
                mesh.scale.set(base.x * mult, base.y * mult, base.z * mult);
            }

            // --- Chevron: only animates while hovered ---
            const animCanvas = mesh.userData.animCanvas;
            const animTex = mesh.userData.animTex;
            if (!animCanvas || !animTex) return;

            const isHovered = mesh.userData.isHovered;

            if (isHovered) {
                // Advance phase (0→1 per cycle)
                mesh.userData.chevronPhase = ((mesh.userData.chevronPhase ?? 0) + delta / 1.4) % 1;
                const cycle = mesh.userData.chevronPhase;

                const ctx = animCanvas.getContext('2d');
                ctx.clearRect(0, 0, 256, 256);

                // Paint dark oval to cover the static chevron from the base layer
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 16;
                ctx.beginPath();
                ctx.ellipse(128, 148, 110, 70, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.60)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.40)';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.save();
                ctx.beginPath();
                ctx.ellipse(128, 148, 107, 67, 0, 0, Math.PI * 2);
                ctx.clip();

                // Chevron sweeps bottom→top inside oval: canvas y 205 → 100
                const chevY = 205 - cycle * 105;
                const tipY = chevY - 36;
                const fadeOp = cycle < 0.2
                    ? (cycle / 0.2) * 0.92
                    : cycle < 0.75
                        ? 0.92
                        : Math.max(0, (1 - (cycle - 0.75) / 0.25) * 0.92);

                ctx.shadowColor = 'rgba(255,255,255,1.0)';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(72, chevY); ctx.lineTo(128, tipY); ctx.lineTo(184, chevY);
                ctx.lineTo(168, chevY); ctx.lineTo(128, tipY + 18); ctx.lineTo(88, chevY);
                ctx.closePath();
                ctx.fillStyle = `rgba(255,255,255,${fadeOp})`;
                ctx.fill();
                ctx.restore();
                animTex.needsUpdate = true;
            } else if ((mesh.userData.chevronPhase ?? 0) !== 0) {
                // Clear canvas and reset phase once when hover ends
                mesh.userData.chevronPhase = 0;
                animCanvas.getContext('2d').clearRect(0, 0, 256, 256);
                animTex.needsUpdate = true;
            }
        });
    }

    _adjustColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return `rgb(${r},${g},${b})`;
    }

    _hexToRgba(hex, alpha) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = (num >> 16) & 0xFF;
        const g = (num >> 8) & 0xFF;
        const b = num & 0xFF;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    dispose() {
        this.clearHotspots();
        this.textureCache.forEach(t => t.dispose());
        this.textureCache.clear();
        this.parent.remove(this.group);
    }
}
