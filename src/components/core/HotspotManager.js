import * as THREE from 'three';

export class HotspotManager {
    constructor(scene, bus) {
        this.scene = scene;
        this.bus = bus;
        this.hotspots = [];
        this.textureCache = new Map();
        this.textureLoader = new THREE.TextureLoader();

        this.group = new THREE.Group();
        this.scene.add(this.group);

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
        const size = data.size || 3;
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
                tex.colorSpace = THREE.SRGBColorSpace;
                material.map = tex;
                material.needsUpdate = true;
            });
        } else {
            material.map = this._createIconTexture(type, color);
        }

        const mesh = new THREE.Mesh(geometry, material);

        const radius = 45;
        const yawRad = THREE.MathUtils.degToRad((data.yaw || 0) + 90);
        const pitchRad = THREE.MathUtils.degToRad(data.pitch || 0);

        const x = radius * Math.sin(yawRad) * Math.cos(pitchRad);
        const y = radius * Math.sin(pitchRad);
        const z = -radius * Math.cos(yawRad) * Math.cos(pitchRad);

        mesh.position.set(x, y, z);

        const forward = new THREE.Vector3().copy(mesh.position).normalize().negate();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(right, up, forward);
        mesh.setRotationFromMatrix(matrix);

        mesh.userData.isInteractable = true;
        mesh.userData.label = data.label || 'Hotspot';
        mesh.userData.hotspotData = data;

        if (data.label) {
            const textSize = data.textSize || 1.0;
            const labelOffset = data.labelOffset !== undefined ? data.labelOffset : 0;
            const wrapLabel = data.labelWrap || false;
            const labelMesh = this._createLabel(data.label, textSize, wrapLabel);

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

        mesh.userData.originalScale = new THREE.Vector3().copy(mesh.scale);
        mesh.onHoverIn = () => {
            const s = mesh.userData.originalScale;
            mesh.scale.set(s.x * 1.3, s.y * 1.3, s.z * 1.3);
        };
        mesh.onHoverOut = () => mesh.scale.copy(mesh.userData.originalScale);

        mesh.onClick = () => {
            this.bus.emit('hotspot:click', { data });
        };

        mesh.renderOrder = 9999;
        return mesh;
    }

    _createLabel(text, scale = 1.0, wrapLabel = false) {
        const baseFontSize = 42;
        const fontSize = baseFontSize * scale;
        const padding = 24 * scale;
        const lineHeight = fontSize * 1.3;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `500 ${fontSize}px 'Roboto', 'Segoe UI', sans-serif`;

        let lines = [text];
        let maxLineWidth;

        if (wrapLabel && text.length > 12) {
            const maxWidth = 280 * scale;
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

        canvas.width = maxLineWidth + padding * 2;
        canvas.height = lineHeight * lines.length + padding * 1.5;

        const w = canvas.width;
        const h = canvas.height;
        const r = lines.length > 1 ? 20 * scale : h / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, r);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.font = `500 ${fontSize}px 'Roboto', 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (lines.length === 1) {
            ctx.fillText(text, w / 2, h / 2);
        } else {
            const startY = (h - lineHeight * lines.length) / 2 + lineHeight / 2;
            lines.forEach((line, i) => {
                ctx.fillText(line, w / 2, startY + i * lineHeight);
            });
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const geometry = new THREE.PlaneGeometry(w * 0.018, h * 0.018);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        return new THREE.Mesh(geometry, material);
    }

    _createIconTexture(type, customColor = null) {
        const key = 'icon_' + type + (customColor || '');
        if (this.textureCache.has(key)) return this.textureCache.get(key);

        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 8;

        const drawBase = (primaryColor, glowColor) => {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 20;
            const grad = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, radius);
            grad.addColorStop(0, primaryColor);
            grad.addColorStop(1, this._adjustColor(primaryColor, -30));
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 20, -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const defaultColors = {
            arrow: '#4f46e5', scene: '#4f46e5', info: '#0ea5e9',
            plus: '#10b981', home: '#8b5cf6', back: '#64748b',
            photo: '#f59e0b', video: '#ef4444'
        };

        const color = customColor || defaultColors[type] || '#64748b';
        const glowColor = this._hexToRgba(color, 0.6);

        if (type === 'arrow' || type === 'location' || type === 'scene') {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(cx, cy + 50);
            ctx.bezierCurveTo(cx - 50, cy + 10, cx - 45, cy - 55, cx, cy - 55);
            ctx.bezierCurveTo(cx + 45, cy - 55, cx + 50, cy + 10, cx, cy + 50);
            ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(cx, cy - 15, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else if (type === 'info') {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx, cy - 45, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(cx - 10, cy - 20, 20, 70);
            ctx.beginPath();
            ctx.arc(cx, cy + 50, 10, 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 'plus') {
            drawBase(color, glowColor);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 16;
            ctx.beginPath();
            ctx.moveTo(cx, cy - 40); ctx.lineTo(cx, cy + 40);
            ctx.moveTo(cx - 40, cy); ctx.lineTo(cx + 40, cy);
            ctx.stroke();
        } else if (type === 'home') {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - 50);
            ctx.lineTo(cx + 55, cy);
            ctx.lineTo(cx - 55, cy);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(cx - 40, cy, 80, 50);
            ctx.fillStyle = this._hexToRgba(color, 0.8);
            ctx.fillRect(cx - 15, cy + 15, 30, 35);
        } else if (type === 'back') {
            drawBase(color, glowColor);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.arc(cx + 10, cy - 10, 45, 0, -Math.PI * 0.75, true);
            ctx.stroke();
            const tipX = cx + 10 + 45 * Math.cos(-Math.PI * 0.75);
            const tipY = cy - 10 + 45 * Math.sin(-Math.PI * 0.75);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(tipX - 20, tipY - 8);
            ctx.lineTo(tipX + 2, tipY - 25);
            ctx.lineTo(tipX + 5, tipY + 12);
            ctx.closePath();
            ctx.fill();
        } else if (type === 'photo') {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.roundRect(cx - 50, cy - 25, 100, 65, 8);
            ctx.fill();
            ctx.fillStyle = this._hexToRgba(color, 0.9);
            ctx.beginPath();
            ctx.arc(cx, cy + 5, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx, cy + 5, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 20, cy - 40, 40, 15);
        } else if (type === 'video') {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(cx - 25, cy - 40);
            ctx.lineTo(cx + 40, cy);
            ctx.lineTo(cx - 25, cy + 40);
            ctx.closePath();
            ctx.fill();
        } else {
            drawBase(color, glowColor);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx, cy, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        this.textureCache.set(key, texture);
        return texture;
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
        this.scene.remove(this.group);
    }
}
