import * as THREE from 'three';

/**
 * StereoEffect - Creates a stereoscopic (side-by-side) rendering effect
 * With barrel distortion and vignette to simulate VR headset lens
 * For use with VR headsets like Google Cardboard on iOS devices
 */
export class StereoEffect {
    constructor(renderer) {
        this.renderer = renderer;

        // Stereo camera setup
        this.stereo = new THREE.StereoCamera();
        this.stereo.eyeSep = 0.064; // Default IPD

        // Store original renderer settings
        this._size = new THREE.Vector2();
        this._rendererSize = new THREE.Vector2();

        this.enabled = false;

        // Create render targets for post-processing
        this.renderTargetL = null;
        this.renderTargetR = null;

        // Create barrel distortion material
        this.distortionMaterial = this.createDistortionMaterial();

        // Create full-screen quad for post-processing
        this.quadGeometry = new THREE.PlaneGeometry(2, 2);
        this.quadMeshL = new THREE.Mesh(this.quadGeometry, this.distortionMaterial.clone());
        this.quadMeshR = new THREE.Mesh(this.quadGeometry, this.distortionMaterial.clone());

        // Orthographic camera for post-processing
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
        this.orthoCamera.position.z = 1;

        // Scene for post-processing
        this.postScene = new THREE.Scene();

        // Black divider
        this.divider = null;
        this.createDivider();
    }

    createDistortionMaterial() {
        // Barrel distortion shader - simulates VR lens
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform sampler2D tDiffuse;
            uniform vec2 resolution;
            uniform float distortion;
            uniform float exposure; // Added for brightness control
            
            varying vec2 vUv;

            void main() {
                vec2 uv = vUv;
                
                // Normalizing coordinates to [-1, 1] relative to center
                vec2 center = vec2(0.5, 0.5);
                vec2 p = (uv - center) * 2.0;
                
                // Barrel distortion math
                float r2 = dot(p, p);
                vec2 distortedP = p * (1.0 + distortion * r2);
                
                // Convert back to [0, 1] UV space
                vec2 distortedUv = (distortedP / 2.0) + center;
                
                // Sampling with safety check
                if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    vec4 color = texture2D(tDiffuse, distortedUv);
                    
                    // Apply exposure and gamma lift (HD High Fidelity)
                    vec3 res = color.rgb * exposure;
                    
                    // Simple Gamma lift for shadows (1.0/1.2 approx)
                    res = pow(res, vec3(0.8)); // 0.8 power lifts shadows
                    
                    gl_FragColor = vec4(res, color.a);
                }
            }
        `;

        return new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new THREE.Vector2() },
                distortion: { value: 0.12 },
                exposure: { value: 2.5 } // Extreme boost (250% Brightness)
            },

            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    createDivider() {
        // Divider is now handled by 2D UI overlay, hiding this 3D one or keeping it as backup
        // Keeping it invisible for now to rely on UI overlay
        const dividerGeometry = new THREE.PlaneGeometry(0.002, 2); // Thinner
        const dividerMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            depthTest: false,
            depthWrite: false,
            visible: false // Hiding 3D divider
        });
        this.divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
        this.divider.position.set(0, 0, -0.5);
    }

    setEyeSeparation(eyeSep) {
        this.stereo.eyeSep = eyeSep;
    }

    setDistortion(value) {
        this.quadMeshL.material.uniforms.distortion.value = value;
        this.quadMeshR.material.uniforms.distortion.value = value;
    }

    enable() {
        this.enabled = true;
        const dpr = window.devicePixelRatio || 1;
        this.renderer.setPixelRatio(dpr);

        // Save original clear color
        this._originalClearColor = new THREE.Color();
        this.renderer.getClearColor(this._originalClearColor);
        this._originalClearAlpha = this.renderer.getClearAlpha();

        // Create render targets at current size
        this.renderer.getSize(this._size);

        // Calculate physical pixel dimensions
        const width = Math.max(this._size.width, 100);
        const height = Math.max(this._size.height, 100);
        const halfWidth = Math.floor(width / 2);

        // Important: Multiply by DPR for HD quality
        const renderWidth = halfWidth * dpr;
        const renderHeight = height * dpr;

        console.log('StereoEffect enabling with HD size:', renderWidth, 'x', renderHeight);

        // Dispose existing render targets if any
        if (this.renderTargetL) this.renderTargetL.dispose();
        if (this.renderTargetR) this.renderTargetR.dispose();

        this.renderTargetL = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false,
            samples: 4,
            colorSpace: THREE.SRGBColorSpace // Ensure correct color vibrancy
        });

        this.renderTargetR = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false,
            samples: 4,
            colorSpace: THREE.SRGBColorSpace // Ensure correct color vibrancy
        });

        // Update material uniforms
        this.quadMeshL.material.uniforms.tDiffuse.value = this.renderTargetL.texture;
        this.quadMeshR.material.uniforms.tDiffuse.value = this.renderTargetR.texture;
        this.quadMeshL.material.uniforms.resolution.value.set(halfWidth, height);
        this.quadMeshR.material.uniforms.resolution.value.set(halfWidth, height);

        // Mark materials as needing update
        this.quadMeshL.material.needsUpdate = true;
        this.quadMeshR.material.needsUpdate = true;

        console.log('StereoEffect enabled successfully');
    }

    disable() {
        this.enabled = false;
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Dispose render targets
        if (this.renderTargetL) {
            this.renderTargetL.dispose();
            this.renderTargetL = null;
        }
        if (this.renderTargetR) {
            this.renderTargetR.dispose();
            this.renderTargetR = null;
        }
    }

    getSize() {
        this.renderer.getSize(this._rendererSize);
        return this._rendererSize;
    }

    setSize(width, height) {
        this.renderer.setSize(width, height);

        if (this.enabled) {
            const dpr = this.renderer.getPixelRatio();
            const halfWidth = Math.floor(width / 2);
            const renderWidth = halfWidth * dpr;
            const renderHeight = height * dpr;

            this.renderTargetL?.setSize(renderWidth, renderHeight);
            this.renderTargetR?.setSize(renderWidth, renderHeight);
            this.quadMeshL.material.uniforms.resolution.value.set(renderWidth, renderHeight);
            this.quadMeshR.material.uniforms.resolution.value.set(renderWidth, renderHeight);
        }
    }

    render(scene, camera) {
        if (!this.enabled) {
            this.renderer.render(scene, camera);
            return;
        }

        // Safety check - ensure render targets exist
        if (!this.renderTargetL || !this.renderTargetR) {
            console.warn('StereoEffect: Render targets not ready, falling back to normal render');
            this.renderer.render(scene, camera);
            return;
        }

        this.renderer.getSize(this._size);
        const width = this._size.width;
        const height = this._size.height;

        // Ensure valid size
        if (width === 0 || height === 0) return;

        try {
            // 1. Update stereo cameras from the main camera
            camera.updateMatrixWorld();

            const originalAspect = camera.aspect;
            camera.aspect = (width / 2) / height;
            camera.updateProjectionMatrix();

            this.stereo.update(camera);

            // Restore original aspect ratio
            camera.aspect = originalAspect;
            camera.updateProjectionMatrix();

            // 2. Render eyes to intermediate textures
            const currentAutoClear = this.renderer.autoClear;
            this.renderer.autoClear = true;

            // Render Left Eye
            this.renderer.setRenderTarget(this.renderTargetL);
            this.renderer.render(scene, this.stereo.cameraL);

            // Render Right Eye
            this.renderer.setRenderTarget(this.renderTargetR);
            this.renderer.render(scene, this.stereo.cameraR);

            // 3. Final Pass with Distortion to Screen
            this.renderer.setRenderTarget(null);
            this.renderer.setScissorTest(true);
            this.renderer.autoClear = false;
            this.renderer.clear();

            // Left Quad pass
            this.renderer.setScissor(0, 0, width / 2, height);
            this.renderer.setViewport(0, 0, width / 2, height);
            this.postScene.add(this.quadMeshL);
            this.renderer.render(this.postScene, this.orthoCamera);
            this.postScene.remove(this.quadMeshL);

            // Right Quad pass
            this.renderer.setScissor(width / 2, 0, width / 2, height);
            this.renderer.setViewport(width / 2, 0, width / 2, height);
            this.postScene.add(this.quadMeshR);
            this.renderer.render(this.postScene, this.orthoCamera);
            this.postScene.remove(this.quadMeshR);

            // 4. Draw narrow center divider line (Physical alignment aid)
            const dividerWidth = 2;
            this.renderer.setScissor(width / 2 - dividerWidth / 2, 0, dividerWidth, height);
            this.renderer.setViewport(width / 2 - dividerWidth / 2, 0, dividerWidth, height);
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clearColor();

            // Cleanup
            this.renderer.setScissorTest(false);
            this.renderer.autoClear = currentAutoClear;
            this.renderer.setViewport(0, 0, width, height);
        } catch (e) {
            console.error('StereoEffect render error:', e);
            // Fallback to normal render
            this.renderer.setRenderTarget(null);
            this.renderer.setScissorTest(false);
            this.renderer.setViewport(0, 0, width, height);
            this.renderer.render(scene, camera);
        }
    }

    dispose() {
        this.disable();
        this.quadGeometry.dispose();
        this.quadMeshL.material.dispose();
        this.quadMeshR.material.dispose();
        this.divider.geometry.dispose();
        this.divider.material.dispose();
    }
}
