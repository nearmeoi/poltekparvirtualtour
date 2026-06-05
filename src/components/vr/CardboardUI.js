/**
 * CardboardUI - Mirrored 2D overlay for Cardboard VR mode
 * Provides side-by-side UI for both eyes to ensure usability in VR.
 */
export class CardboardUI {
    constructor(onExit, onSettings) {
        this.onExit = onExit;
        this.onSettings = onSettings;
        this.container = null;
        this.modal = null;
        this.onResizeBound = this.checkOrientation.bind(this);
        this.createUI();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.className = 'vr-hud-container';
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: '2000',
            display: 'none',
            color: 'white'
        });

        // Create Left and Right HUDs
        this.hudL = this.createHUD('left');
        this.hudR = this.createHUD('right');

        this.container.appendChild(this.hudL);
        this.container.appendChild(this.hudR);

        // Orientation Alert Overlay
        this.orientationAlert = document.createElement('div');
        this.orientationAlert.className = 'vr-orientation-alert';
        this.orientationAlert.innerHTML = `
            <div style="text-align: center;">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/>
                    <path d="M12 11l3 3-3 3"/>
                    <path d="M12 7l3-3-3-3"/>
                </svg>
                <p>Please rotate your phone to landscape</p>
            </div>
        `;
        Object.assign(this.orientationAlert.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: '#111',
            display: 'none',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '5000',
            pointerEvents: 'auto'
        });
        this.container.appendChild(this.orientationAlert);

        document.body.appendChild(this.container);

        // Create Mirrored Modal
        this.createModal();
    }

    createHUD(side) {
        const hud = document.createElement('div');
        hud.className = `hud-eye hud-${side}`;
        Object.assign(hud.style, {
            position: 'absolute',
            top: '0',
            left: side === 'left' ? '0' : '50%',
            width: '50%',
            height: '100%',
            pointerEvents: 'none'
        });

        // Back Button
        const backBtn = document.createElement('div');
        backBtn.className = 'hud-btn hud-back';
        backBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
        `;
        Object.assign(backBtn.style, {
            position: 'absolute',
            top: '20px',
            left: '20px',
            width: '40px',
            height: '40px',
            pointerEvents: 'auto',
            cursor: 'pointer',
            opacity: '0.8'
        });
        backBtn.onclick = () => this.onExit();
        hud.appendChild(backBtn);

        // Settings Gear
        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'hud-btn hud-settings';
        settingsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
        `;
        Object.assign(settingsBtn.style, {
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            width: '36px',
            height: '36px',
            pointerEvents: 'auto',
            cursor: 'pointer',
            opacity: '0.8'
        });
        settingsBtn.onclick = () => this.showModal();
        hud.appendChild(settingsBtn);

        return hud;
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'vr-modal-overlay';
        Object.assign(this.modal.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', // Darker background
            zIndex: '3000',
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'auto'
        });

        const iconSVG = `
            <svg class="vr-modal-icon" viewBox="0 0 512 512" style="width: 60px; height: 60px; margin-bottom: 20px;">
                <path fill="#FF6D00" d="M448 96H64C28.7 96 0 124.7 0 160v192c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64z"/>
                <circle cx="128" cy="256" r="64" fill="#fff"/>
                <circle cx="384" cy="256" r="64" fill="#fff"/>
                <path fill="#fff" d="M256 320c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64 64z"/>
            </svg>
        `;

        const getWindowContent = (side) => `
            <div class="vr-modal-window">
                <div class="vr-step-1">
                    <div style="text-align: center;">${iconSVG}</div>
                    <h3>Ready to Start?</h3>
                    <p class="vr-small-desc">Place your phone into your Google Cardboard or VR viewer now.</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <svg width="120" height="80" viewBox="0 0 120 80" fill="none" stroke="#007bff" stroke-width="2">
                            <rect x="10" y="20" width="100" height="50" rx="5" />
                            <path d="M40 20 L40 10 L80 10 L80 20" />
                            <circle cx="35" cy="45" r="10" />
                            <circle cx="85" cy="45" r="10" />
                            <path d="M60 45 L60 55" />
                        </svg>
                    </div>
                    <button class="vr-next-btn">NEXT</button>
                </div>
                <div class="vr-step-2" style="display: none;">
                    <h3>Settings</h3>
                    <p class="vr-small-desc">Choose interaction mode for your headset.</p>
                    <div class="vr-options">
                        <label><input type="radio" name="viewer-${side}" value="v1"> Cardboard v1 (Gaze)</label>
                        <label><input type="radio" name="viewer-${side}" value="v2" checked> Cardboard v2 (Button)</label>
                        <label><input type="radio" name="viewer-${side}" value="none"> No lens correction</label>
                    </div>
                    <div class="vr-onboarding-only" style="display: none; margin-bottom: 15px;">
                        <label style="font-size: 0.8rem; color: #888;">
                            <input type="checkbox" class="vr-dont-show-check"> Don't display this info again
                        </label>
                    </div>
                    <button class="vr-save-btn">START VR</button>
                    <p style="text-align: center; margin-top: 15px;">
                        <a href="#" class="vr-back-link" style="font-size: 0.8rem; color: #007bff; text-decoration: none;">&larr; Back</a>
                    </p>
                </div>
            </div>
        `;

        this.modal.innerHTML = `
            <div class="vr-modal-split">
                <div class="vr-modal-side vr-modal-left">${getWindowContent('l')}</div>
                <div class="vr-modal-side vr-modal-right">${getWindowContent('r')}</div>
            </div>
        `;

        // Step Switching Logic
        const showStep = (step) => {
            this.modal.querySelectorAll('.vr-step-1').forEach(el => el.style.display = step === 1 ? 'block' : 'none');
            this.modal.querySelectorAll('.vr-step-2').forEach(el => el.style.display = step === 2 ? 'block' : 'none');
        };

        this.modal.querySelectorAll('.vr-next-btn').forEach(btn => {
            btn.onclick = () => showStep(2);
        });

        this.modal.querySelectorAll('.vr-back-link').forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                showStep(1);
            };
        });

        // Sync radio buttons
        const leftRadios = this.modal.querySelectorAll('input[name="viewer-l"]');
        const rightRadios = this.modal.querySelectorAll('input[name="viewer-r"]');
        const dontShowChecks = this.modal.querySelectorAll('.vr-dont-show-check');

        const syncRadios = (val) => {
            leftRadios.forEach(r => r.checked = r.value === val);
            rightRadios.forEach(r => r.checked = r.value === val);
        };

        const syncChecks = (checked) => {
            dontShowChecks.forEach(c => c.checked = checked);
        };

        leftRadios.forEach(r => r.onchange = () => syncRadios(r.value));
        rightRadios.forEach(r => r.onchange = () => syncRadios(r.value));
        dontShowChecks.forEach(c => c.onchange = (e) => syncChecks(e.target.checked));

        // Save buttons
        this.modal.querySelectorAll('.vr-save-btn').forEach(btn => {
            btn.onclick = () => {
                const selected = this.modal.querySelector('input[name="viewer-l"]:checked').value;
                const dontShow = this.modal.querySelector('.vr-dont-show-check').checked;

                if (this.currentCallback) {
                    this.currentCallback(selected, dontShow);
                } else {
                    this.onSettings(selected);
                }
                this.hideModal();
                showStep(1); // Reset for next time
            };
        });

        document.body.appendChild(this.modal);
    }

    showOnboarding(callback) {
        this.currentCallback = callback;
        this.modal.querySelectorAll('.vr-onboarding-only').forEach(el => el.style.display = 'block');
        this.showModal();
    }

    show() {
        if (this.container) this.container.style.display = 'block';
        this.checkOrientation();
        window.addEventListener('resize', this.onResizeBound);
        window.addEventListener('orientationchange', this.onResizeBound);
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.hideModal();
        window.removeEventListener('resize', this.onResizeBound);
        window.removeEventListener('orientationchange', this.onResizeBound);
    }

    checkOrientation() {
        if (!this.orientationAlert) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        const isInsecure = window.location.protocol !== 'https:' && window.location.hostname !== 'localhost';

        let msg = '<p>Please rotate your phone to landscape</p>';
        if (isInsecure && /iPhone|iPod|iPad/.test(navigator.userAgent)) {
            msg = '<p style="color: #ff4444; font-weight: bold;">⚠️ SENSOR BLOCKED</p><p style="font-size: 11px;">iOS blocks sensors on <b>IP Address (HTTP)</b> access. Use <b>Touch/Drag</b> to look around, or use <b>HTTPS</b> for Gyroscope.</p>' + msg;
        }

        const content = this.orientationAlert.querySelector('div');
        if (content) {
            content.querySelector('p:last-child').outerHTML = msg;
        }

        this.orientationAlert.style.display = isPortrait ? 'flex' : 'none';
    }

    showModal() {
        if (this.modal) this.modal.style.display = 'flex';
    }

    hideModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.modal.querySelectorAll('.vr-onboarding-only').forEach(el => el.style.display = 'none');
        }
        this.currentCallback = null;
    }

    dispose() {
        if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
        if (this.modal?.parentNode) this.modal.parentNode.removeChild(this.modal);
        window.removeEventListener('resize', this.onResizeBound);
        window.removeEventListener('orientationchange', this.onResizeBound);
    }
}
