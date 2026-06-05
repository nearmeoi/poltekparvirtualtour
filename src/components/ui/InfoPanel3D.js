
import * as THREE from 'three';

export class InfoPanel3D {
    constructor(camera, scene) {
        console.log('[InfoPanel3D] Constructor called');
        this.camera = camera;
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.group.visible = false;

        this.width = 1.0;
        this.height = 0.8;

        // Paging State
        this.pages = [];
        this.currentPageIndex = 0;
        this.currentData = null;

        if (!camera || !scene) {
            console.error('[InfoPanel3D] ERROR: Camera or Scene missing!');
        }

        this.init();
    }

    init() {
        console.log('[InfoPanel3D] Initializing panel');
        // Plane for content
        this.geometry = new THREE.PlaneGeometry(this.width, this.height);
        this.material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.renderOrder = 9999;
        this.group.add(this.mesh);

        // Close Button
        this.createCloseButton();

        // Navigation Buttons
        this.createNavigationButtons();
    }

    createCloseButton() {
        const size = 0.05;
        const closeGeo = new THREE.CircleGeometry(size, 32);
        const closeMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            transparent: true
        });
        this.closeBtn = new THREE.Mesh(closeGeo, closeMat);
        this.closeBtn.renderOrder = 10000;

        this.closeBtn.userData.isInteractable = true;
        this.closeBtn.onClick = () => this.hide();

        this.closeBtn.onHoverIn = () => {
            document.body.style.cursor = 'pointer';
            this.closeBtn.scale.set(1.2, 1.2, 1.2);
        };
        this.closeBtn.onHoverOut = () => {
            document.body.style.cursor = 'default';
            this.closeBtn.scale.set(1, 1, 1);
        };

        const xMesh = this.createIconMesh('×', size);
        xMesh.position.z = 0.01;
        xMesh.renderOrder = 10001;
        this.closeBtn.add(xMesh);
        this.group.add(this.closeBtn);
    }

    createNavigationButtons() {
        // Next Button
        this.nextBtn = this.createGenericButton('NEXT', 0x10b981); // Emerald 500
        this.nextBtn.onClick = () => this.nextPage();
        this.group.add(this.nextBtn);

        // Prev Button
        this.prevBtn = this.createGenericButton('PREV', 0x6366f1); // Indigo 500
        this.prevBtn.onClick = () => this.prevPage();
        this.group.add(this.prevBtn);
    }

    createGenericButton(text, colorHex) {
        const w = 0.25;
        const h = 0.12;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Bg
        const color = new THREE.Color(colorHex);
        ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
        this.roundRect(ctx, 0, 0, 256, 128, 30);
        ctx.fill();

        // Text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 60px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.renderOrder = 10000;
        mesh.userData.isInteractable = true;

        mesh.onHoverIn = () => {
            document.body.style.cursor = 'pointer';
            mesh.scale.set(1.1, 1.1, 1.1);
        };
        mesh.onHoverOut = () => {
            document.body.style.cursor = 'default';
            mesh.scale.set(1, 1, 1);
        };

        return mesh;
    }

    createIconMesh(char, size) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.font = `bold 40px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 32, 32);
        const tex = new THREE.CanvasTexture(canvas);
        return new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
        );
    }

    drawTexture(title, description, bgColor = 'rgba(30, 41, 59, 0.95)', pageInfo = '') {
        const w = 1024;
        const h = 800;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = bgColor;
        this.roundRect(ctx, 0, 0, w, h, 40);
        ctx.fill();

        // Border
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();

        // Title
        ctx.fillStyle = '#f3f4f6';
        ctx.font = 'bold 65px Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, 60, 60);

        // Separator
        ctx.beginPath();
        ctx.moveTo(60, 150);
        ctx.lineTo(w - 60, 150);
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Description
        ctx.fillStyle = '#d1d5db';
        ctx.font = '40px Roboto, sans-serif';
        this.wrapText(ctx, description, 60, 190, w - 120, 60);

        // Page Indicator
        if (pageInfo) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = 'italic 30px Roboto, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(pageInfo, w - 60, h - 50);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        if (!text) return;
        const words = text.split(' ');
        let line = '';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
    }

    roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    show(data) {
        console.log('[InfoPanel3D] show() called with:', data?.label);
        if (!data) return;
        this.currentData = data;

        const rawDescription = data.description || 'No description available.';

        // Split by [PAGE]
        this.pages = rawDescription.split('[PAGE]').map(p => p.trim());
        this.currentPageIndex = 0;

        this.updateContent();

        // Position 1.2m in front of camera
        this.group.visible = true;
        console.log('[InfoPanel3D] Panel visibility set to true');

        const dist = 1.2;
        const vec = new THREE.Vector3(0, 0, -dist);
        vec.applyQuaternion(this.camera.quaternion);
        this.group.position.copy(this.camera.position).add(vec);
        this.group.lookAt(this.camera.position);
    }

    updateContent() {
        console.log('[InfoPanel3D] updateContent() for page:', this.currentPageIndex);
        const data = this.currentData;
        const title = data.title || data.label || 'Information';
        const description = this.pages[this.currentPageIndex];

        const width = data.infoWidth || 1.0;
        const height = data.infoHeight || 0.8;
        const hexColor = data.infoColor || '#1e293b';
        const opacity = data.infoOpacity !== undefined ? data.infoOpacity : 0.95;

        // Robust color parsing
        const color = new THREE.Color(hexColor);
        const rgba = `rgba(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)}, 1.0)`;

        const pageInfo = this.pages.length > 1 ? `Page ${this.currentPageIndex + 1} of ${this.pages.length}` : '';

        // Update Mesh
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(width, height);

        if (this.material.map) this.material.map.dispose();
        this.material.map = this.drawTexture(title, description, rgba, pageInfo);
        this.material.opacity = opacity;
        this.material.needsUpdate = true;

        // UI Positions
        this.closeBtn.position.set(width / 2 - 0.02, height / 2 - 0.02, 0.05);

        // Navigation Buttons
        const buttonY = -height / 2 - 0.1;
        this.prevBtn.position.set(-width / 4, buttonY, 0.02);
        this.nextBtn.position.set(width / 4, buttonY, 0.02);

        this.prevBtn.visible = this.currentPageIndex > 0;
        this.nextBtn.visible = this.currentPageIndex < this.pages.length - 1;
    }

    nextPage() {
        if (this.currentPageIndex < this.pages.length - 1) {
            this.currentPageIndex++;
            this.updateContent();
        }
    }

    prevPage() {
        if (this.currentPageIndex > 0) {
            this.currentPageIndex--;
            this.updateContent();
        }
    }

    hide() {
        this.group.visible = false;
    }

    update(delta) {
        // Optional animation logic
    }
}
