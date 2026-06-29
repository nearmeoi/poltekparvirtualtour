import { SCENE_MAP } from '../../data/sceneMap.js';
import SCENES_MANIFEST from '../../data/scenesManifest.json';
import { AdminStateManager } from './AdminStateManager.js';
import { AdminPersistence }  from './AdminPersistence.js';
import { SceneCatalog } from '../../utils/SceneCatalog.js';
import { ScenePicker } from './ScenePicker.js';

export class AdminPanel {
    constructor(viewer) {
        this.viewer = viewer;
        this.isAdminMode = false;
        this.selectedHotspot = null;
        this.unsavedChanges = false;
        this.sceneId = null;
        // Offline scene catalog: every scene across ALL locations, flattened
        // from scenesManifest.json (regenerate via scripts/generate-scenes-manifest.mjs).
        this.locations = SCENES_MANIFEST || [];
        this.availableScenes = this.locations.flatMap(
            loc => loc.scenes.map(s => ({ filename: s.filename, path: s.path, location: loc.location }))
        );
        this.filteredScenes = this.availableScenes;
        this.scenePicker = new ScenePicker();
        this.useCustomPath = false;
        this.stateManager = new AdminStateManager(null);
        this.stateManager.push(null); // sentinel so canUndo() is true after first command

        // Preset colors
        this.colorPresets = [
            '#ef4444', // Red (Location style)
            '#4f46e5', // Indigo
            '#0ea5e9', // Sky
            '#10b981', // Emerald
            '#8b5cf6', // Violet
            '#f59e0b', // Amber
            '#ec4899', // Pink
            '#06b6d4', // Cyan
            '#84cc16', // Lime
            '#64748b'  // Slate
        ];

        this.initUI();
        this.setupKeyboardShortcuts();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.id = 'admin-panel';
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '300px',
            maxHeight: 'calc(100vh - 20px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '10px',
            padding: '0',
            color: '#1f2937',
            fontFamily: "'Roboto', 'Segoe UI', system-ui, sans-serif",
            display: 'none',
            zIndex: '10000',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            boxSizing: 'border-box',
            fontSize: '12px'
        });

        // Add a style tag for global box-sizing within this container
        const style = document.createElement('style');
        style.textContent = `
            #admin-panel * { box-sizing: border-box; }
            #admin-panel input[type=range] { width: 100%; min-width: 0; }
            #admin-panel ::-webkit-scrollbar { width: 6px; }
            #admin-panel ::-webkit-scrollbar-track { background: transparent; }
            #admin-panel ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
            #admin-panel ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

            @media (max-width: 640px) {
                #admin-panel {
                    position: fixed !important;
                    top: auto !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    width: 100% !important;
                    max-height: 55vh !important;
                    border-radius: 16px 16px 0 0 !important;
                    box-shadow: 0 -10px 30px rgba(0,0,0,0.15) !important;
                    font-size: 13px !important;
                }
                #admin-panel label {
                    font-size: 10px !important;
                }
                #admin-panel input, #admin-panel select, #admin-panel textarea {
                    font-size: 13px !important;
                    padding: 8px 10px !important;
                }
                #admin-panel button {
                    font-size: 12px !important;
                    padding: 8px 12px !important;
                }
            }
        `;
        document.head.appendChild(style);

        ['mousedown', 'mousemove', 'mouseup', 'click', 'contextmenu', 'wheel', 'touchstart', 'touchend', 'touchmove'].forEach(event => {
            this.container.addEventListener(event, (e) => e.stopPropagation());
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(0,0,0,0.06)'
        });
        header.innerHTML = `
            <span style="font-weight: 600; font-size: 13px; color: #111827;">Hotspot Editor</span>
            <button id="admin-close-btn" style="
                background: transparent;
                border: none;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                color: #6b7280;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            ">×</button>
        `;
        this.container.appendChild(header);

        setTimeout(() => {
            const closeBtn = document.getElementById('admin-close-btn');
            if (closeBtn) {
                closeBtn.onclick = () => this.toggle();
                closeBtn.onmouseover = () => { closeBtn.style.color = '#1f2937'; closeBtn.style.background = '#f3f4f6'; };
                closeBtn.onmouseout = () => { closeBtn.style.color = '#6b7280'; closeBtn.style.background = 'transparent'; };
            }
        }, 0);

        const content = document.createElement('div');
        content.style.padding = '12px';
        this.container.appendChild(content);

        this.sceneInfo = document.createElement('div');
        Object.assign(this.sceneInfo.style, {
            background: '#f9fafb',
            borderRadius: '6px',
            padding: '8px 12px',
            marginBottom: '12px',
            fontSize: '11px',
            border: '1px solid #e5e7eb',
            color: '#374151'
        });
        content.appendChild(this.sceneInfo);

        this.chipRow = document.createElement('div');
        Object.assign(this.chipRow.style, {
            display: 'flex', gap: '6px', flexWrap: 'wrap',
            padding: '8px 0', borderBottom: '1px solid #eee',
            marginBottom: '8px',
        });
        content.appendChild(this.chipRow);

        this.form = document.createElement('div');
        content.appendChild(this.form);

        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '10px 14px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            gap: '10px',
            background: '#ffffff',
            borderRadius: '0 0 12px 12px'
        });

        this.saveBtn = this.createButton('Save', '#10b981', () => this.saveToDisk());
        this.saveBtn.style.flex = '1';
        this.saveBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        footer.appendChild(this.saveBtn);

        const refreshBtn = this.createButton('Refresh', '#f3f4f6', () => {
            this.viewer.fetchHotspots?.();
            this.showToast('Refreshed');
        });
        refreshBtn.style.flex = '0';
        refreshBtn.style.color = '#4b5563';
        refreshBtn.style.border = '1px solid #e5e7eb';
        refreshBtn.onmouseover = () => { refreshBtn.style.background = '#e5e7eb'; };
        refreshBtn.onmouseout = () => { refreshBtn.style.background = '#f3f4f6'; };
        footer.appendChild(refreshBtn);

        this.container.appendChild(footer);

        this.toast = document.createElement('div');
        Object.assign(this.toast.style, {
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ffffff',
            padding: '10px 20px',
            borderRadius: '50px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#111827',
            opacity: '0',
            transition: 'opacity 0.2s',
            zIndex: '10001',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.05)'
        });
        document.body.appendChild(this.toast);

        document.body.appendChild(this.container);
        this.renderSceneInfo();
        this.renderForm(null);
    }

    createButton(text, bg, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: '10px 16px',
            background: bg,
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: '13px',
            transition: 'opacity 0.15s'
        });
        btn.onmouseover = () => btn.style.opacity = '0.85';
        btn.onmouseout = () => btn.style.opacity = '1';
        btn.onclick = onClick;
        return btn;
    }

    renderSceneInfo() {
        const path = this.viewer.currentPath || 'No scene loaded';
        const filename = path.split('/').pop() || path;
        const hotspotCount = this.viewer.hotspotManager?.hotspots?.length || 0;

        this.sceneInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #6b7280; font-weight: 500;">Scene</span>
                <span style="color: #10b981; font-size: 11px; background: rgba(16, 185, 129, 0.1); padding: 2px 6px; borderRadius: 4px;">${hotspotCount} hotspot${hotspotCount !== 1 ? 's' : ''}</span>
            </div>
            <div style="font-family: 'Roboto Mono', monospace; font-size: 12px; color: #111827; margin-top: 8px; word-break: break-all;">
                ${filename}
            </div>
        `;
        this.renderHotspotChips();
    }

    /** Render a compact clickable chip per hotspot in the current scene. */
    renderHotspotChips() {
        if (!this.chipRow) return;
        this.chipRow.innerHTML = '';
        const payload = this.viewer.getCurrentSceneHotspots?.();
        const hotspots = payload?.hotspots || [];
        hotspots.forEach((hs) => {
            const chip = document.createElement('button');
            chip.textContent = hs.label || hs.type || 'hotspot';
            const active = this.selectedHotspot === hs;
            Object.assign(chip.style, {
                fontSize: '11px', padding: '3px 9px', borderRadius: '999px', cursor: 'pointer',
                border: active ? '1px solid #4f46e5' : '0.5px solid #d1d5db',
                background: active ? '#eef2ff' : '#f9fafb',
                color: active ? '#4f46e5' : '#4b5563',
                whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis',
            });
            chip.onclick = () => { this.selectHotspot(hs); };
            this.chipRow.appendChild(chip);
        });
    }

    renderForm(hotspot) {
        this.form.innerHTML = '';

        if (!hotspot) {
            const emptyState = document.createElement('div');
            Object.assign(emptyState.style, {
                textAlign: 'center',
                padding: '30px 16px',
                border: '1px dashed #e5e7eb',
                borderRadius: '8px',
                color: '#9ca3af',
                fontSize: '13px',
                background: '#f9fafb'
            });
            emptyState.innerHTML = `
                <div style="margin-bottom: 8px; font-weight: 500; color: #6b7280;">No hotspot selected</div>
                <div style="color: #9ca3af; font-size: 12px;">Right-click on the panorama to add new</div>
            `;
            this.form.appendChild(emptyState);
            return;
        }

        // Coordinates
        const coords = document.createElement('div');
        Object.assign(coords.style, {
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#6b7280',
            marginBottom: '14px',
            fontFamily: 'monospace'
        });
        coords.innerHTML = `
            <span>yaw: ${hotspot.yaw?.toFixed(1) || '0'}°</span>
            <span>pitch: ${hotspot.pitch?.toFixed(1) || '0'}°</span>
        `;
        this.form.appendChild(coords);

        // Label
        this.form.appendChild(this.createLabel('Label'));
        this.form.appendChild(this.createInput(hotspot.label, (val) => {
            hotspot.label = val;
            hotspot.target_name = val; // Sync legacy field to prevent fallback issues
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));

        // Type
        this.form.appendChild(this.createLabel('Type'));
        const iconOptions = [
            { value: 'arrow', label: 'Navigation (Pin)' },
            { value: 'info', label: 'Information' },
            { value: 'photo', label: 'Photo' },
            { value: 'video', label: 'Video' },
            { value: 'home', label: 'Home' }
        ];
        this.form.appendChild(this.createSelect(iconOptions, hotspot.type || 'arrow', (val) => {
            hotspot.type = val;
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));

        // Layout with three rows for Size, Text Size, and Label Offset (vertical stacking to avoid overflow)
        const sizesGrid = document.createElement('div');
        Object.assign(sizesGrid.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });

        // Icon Size
        const iconSizeCol = document.createElement('div');
        iconSizeCol.appendChild(this.createLabel('Icon Size'));
        iconSizeCol.appendChild(this.createSlider(hotspot.size || 3, 1, 6, 0.5, (val) => {
            hotspot.size = parseFloat(val);
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));
        sizesGrid.appendChild(iconSizeCol);

        // Text Size
        const textSizeCol = document.createElement('div');
        textSizeCol.appendChild(this.createLabel('Text Size'));
        textSizeCol.appendChild(this.createSlider(hotspot.textSize || 1.0, 0.5, 2.5, 0.1, (val) => {
            hotspot.textSize = parseFloat(val);
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));
        sizesGrid.appendChild(textSizeCol);

        // Label Offset (moved into sizesGrid for compact trio)
        const offsetCol = document.createElement('div');
        offsetCol.appendChild(this.createLabel('Label Offset'));
        offsetCol.appendChild(this.createSlider(hotspot.labelOffset !== undefined ? hotspot.labelOffset : 0, -5, 10, 0.5, (val) => {
            hotspot.labelOffset = parseFloat(val);
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        }));
        sizesGrid.appendChild(offsetCol);

        this.form.appendChild(sizesGrid);

        // Nav arrow tilt + roll — only for arrow/back types
        if (hotspot.type === 'arrow' || hotspot.type === 'back') {
            const tiltCol = document.createElement('div');
            tiltCol.appendChild(this.createLabel('Arrow Tilt  (0 = flat · 1 = upright)'));
            tiltCol.appendChild(this.createSlider(hotspot.navTilt !== undefined ? hotspot.navTilt : 0.40, 0, 1, 0.05, (val) => {
                hotspot.navTilt = parseFloat(val);
                this.viewer.refreshHotspot?.(hotspot);
                this.markDirty();
            }));
            this.form.appendChild(tiltCol);

            const rollCol = document.createElement('div');
            rollCol.appendChild(this.createLabel('Kemiringan Kiri-Kanan  (° negatif = kiri)'));
            rollCol.appendChild(this.createSlider(hotspot.navRoll !== undefined ? hotspot.navRoll : 0, -45, 45, 1, (val) => {
                hotspot.navRoll = parseFloat(val);
                this.viewer.refreshHotspot?.(hotspot);
                this.markDirty();
            }));
            this.form.appendChild(rollCol);
        }

        // Color
        this.form.appendChild(this.createLabel('Color'));
        this.form.appendChild(this.createColorPicker(hotspot));

        // Advanced (collapsed): wrap toggle + custom icon URL + preview
        const adv = document.createElement('details');
        adv.style.marginTop = '12px';
        const advSummary = document.createElement('summary');
        advSummary.textContent = 'Advanced';
        Object.assign(advSummary.style, { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: '600', cursor: 'pointer', marginBottom: '8px' });
        adv.appendChild(advSummary);

        // Label Wrap Toggle
        const wrapRow = document.createElement('div');
        Object.assign(wrapRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            marginBottom: '4px'
        });
        const wrapCheckbox = document.createElement('input');
        wrapCheckbox.type = 'checkbox';
        wrapCheckbox.checked = hotspot.labelWrap || false;
        wrapCheckbox.id = 'label-wrap-toggle';
        Object.assign(wrapCheckbox.style, {
            width: '16px',
            height: '16px',
            cursor: 'pointer',
            accentColor: '#10b981'
        });
        wrapCheckbox.onchange = (e) => {
            hotspot.labelWrap = e.target.checked;
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        };
        const wrapLabel = document.createElement('label');
        wrapLabel.textContent = 'Wrap Long Label';
        wrapLabel.htmlFor = 'label-wrap-toggle';
        Object.assign(wrapLabel.style, {
            fontSize: '12px',
            color: '#4b5563',
            cursor: 'pointer',
            fontWeight: '500'
        });
        wrapRow.appendChild(wrapCheckbox);
        wrapRow.appendChild(wrapLabel);

        // Custom Icon URL
        const iconInput = this.createInput(hotspot.icon_url, (val) => {
            hotspot.icon_url = val;
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
            // Update preview if exists
            if (iconPreview) iconPreview.src = val || '';
            iconPreviewWrapper.style.display = val ? 'block' : 'none';
        });
        iconInput.placeholder = 'https://example.com/icon.png';

        // Icon Preview
        const iconPreviewWrapper = document.createElement('div');
        Object.assign(iconPreviewWrapper.style, {
            marginTop: '8px',
            padding: '8px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            textAlign: 'center',
            display: hotspot.icon_url ? 'block' : 'none'
        });
        const iconPreview = document.createElement('img');
        Object.assign(iconPreview.style, {
            maxWidth: '100%',
            maxHeight: '40px',
            objectFit: 'contain'
        });
        iconPreview.src = hotspot.icon_url || '';
        iconPreviewWrapper.appendChild(iconPreview);

        adv.appendChild(wrapRow);
        adv.appendChild(this.createLabel('Custom Icon URL'));
        adv.appendChild(iconInput);
        adv.appendChild(iconPreviewWrapper);
        this.form.appendChild(adv);

        if (hotspot.type === 'info' || hotspot.type === 'photo') {
            const editBtn = this.createButton('Edit Content & Style', '#4f46e5', () => {
                this.openInfoCustomizer(hotspot);
            });
            editBtn.style.width = '100%';
            editBtn.style.marginTop = '16px';
            editBtn.style.padding = '12px';
            editBtn.style.background = '#4f46e5';
            editBtn.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.2)';
            editBtn.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit Content & Style
                </div>
            `;
            this.form.appendChild(editBtn);

            // Backwards compatibility/Quick links
            if (hotspot.type === 'photo') {
                this.form.appendChild(this.createLabel('Photo URL (Quick Edit)'));
                this.form.appendChild(this.createInput(hotspot.target || '', (val) => {
                    hotspot.target = val;
                    this.markDirty();
                }));
            }
        } else {
            // Navigation Target
            const targetHeader = document.createElement('div');
            Object.assign(targetHeader.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                marginBottom: '8px'
            });
            targetHeader.innerHTML = `<span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600;">Target Scene</span>`;

            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = this.useCustomPath ? 'Use List' : 'Custom Path';
            Object.assign(toggleBtn.style, {
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                color: '#4b5563',
                fontSize: '10px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontWeight: '500'
            });
            toggleBtn.onclick = () => {
                this.useCustomPath = !this.useCustomPath;
                this.renderForm(hotspot);
            };
            targetHeader.appendChild(toggleBtn);
            this.form.appendChild(targetHeader);

            if (this.useCustomPath) {
                const pathInput = this.createInput(hotspot.target || '', (val) => {
                    hotspot.target = val;
                    this.markDirty();
                });
                pathInput.placeholder = 'assets/folder/scene.jpg';
                this.form.appendChild(pathInput);
            } else {
                const pickBtn = this.createButton(
                    hotspot.target ? `→ ${hotspot.target.split('/').pop()}` : 'Choose target scene…',
                    '#4f46e5',
                    () => {
                        this.scenePicker.open({
                            location: this.currentLocationName(),
                            onSelect: (path) => {
                                hotspot.target = path;
                                this.markDirty();
                                this.renderForm(hotspot);
                            },
                        });
                    }
                );
                pickBtn.style.width = '100%';
                this.form.appendChild(pickBtn);
            }
        }

        // Delete
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        Object.assign(deleteBtn.style, {
            width: '100%',
            marginTop: '24px',
            padding: '12px',
            background: '#dc2626',
            border: 'none',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)'
        });
        deleteBtn.onmouseover = () => { deleteBtn.style.background = '#b91c1c'; deleteBtn.style.boxShadow = '0 4px 6px rgba(185, 28, 28, 0.3)'; };
        deleteBtn.onmouseout = () => { deleteBtn.style.background = '#dc2626'; deleteBtn.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.2)'; };
        deleteBtn.onclick = () => {
            if (confirm('Delete this hotspot?')) {
                this.viewer.removeHotspot(hotspot);
                this.selectedHotspot = null;
                this.renderForm(null);
                this.renderSceneInfo(); // sync count after delete
                this.renderHotspotChips();
                this.markDirty();
            }
        };
        this.form.appendChild(deleteBtn);
    }

    createLabel(text) {
        const label = document.createElement('label');
        label.textContent = text;
        Object.assign(label.style, {
            display: 'block',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: '#6b7280',
            fontWeight: '600',
            marginBottom: '6px',
            marginTop: '16px'
        });
        return label;
    }

    createInput(value, onChange) {
        const input = document.createElement('input');
        input.value = value || '';
        Object.assign(input.style, {
            width: '100%',
            padding: '10px 12px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            color: '#111827',
            fontSize: '14px',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: "'Roboto', sans-serif",
            transition: 'border-color 0.15s, box-shadow 0.15s'
        });
        input.onfocus = () => { input.style.borderColor = '#3b82f6'; input.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'; };
        input.onblur = () => { input.style.borderColor = '#d1d5db'; input.style.boxShadow = 'none'; };
        input.oninput = (e) => onChange(e.target.value);
        return input;
    }

    createSelect(options, value, onChange) {
        const select = document.createElement('select');
        Object.assign(select.style, {
            width: '100%',
            padding: '10px 12px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            color: '#111827',
            fontSize: '14px',
            cursor: 'pointer',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: "'Roboto', sans-serif"
        });

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.style.background = '#ffffff';
            option.style.color = '#111827';
            if (opt.value === value) option.selected = true;
            select.appendChild(option);
        });

        select.onchange = (e) => onChange(e.target.value);
        return select;
    }

    createSlider(value, min, max, step, onChange) {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        });

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        Object.assign(slider.style, {
            flex: '1',
            width: '100%',
            minWidth: '50px',
            height: '4px',
            background: '#e5e7eb',
            borderRadius: '2px',
            outline: 'none',
            cursor: 'pointer',
            accentColor: '#10b981',
            margin: '0'
        });

        const valueLabel = document.createElement('span');
        valueLabel.textContent = value;
        Object.assign(valueLabel.style, {
            fontSize: '12px',
            color: '#6b7280',
            minWidth: '20px',
            textAlign: 'right',
            fontFamily: 'monospace'
        });

        slider.oninput = (e) => {
            valueLabel.textContent = e.target.value;
            onChange(e.target.value);
        };

        wrapper.appendChild(slider);
        wrapper.appendChild(valueLabel);
        return wrapper;
    }

    createColorPicker(hotspot) {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: '4px'
        });

        this.colorPresets.forEach(color => {
            const swatch = document.createElement('button');
            Object.assign(swatch.style, {
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: color,
                border: hotspot.color === color ? '2px solid #111827' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'transform 0.1s, border-color 0.1s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            });
            swatch.onmouseover = () => swatch.style.transform = 'scale(1.1)';
            swatch.onmouseout = () => swatch.style.transform = 'scale(1)';
            swatch.onclick = () => {
                hotspot.color = color;
                this.viewer.refreshHotspot?.(hotspot);
                this.markDirty();
                this.renderForm(hotspot);
            };
            wrapper.appendChild(swatch);
        });

        const customPicker = document.createElement('input');
        customPicker.type = 'color';
        customPicker.value = hotspot.color || '#4f46e5';
        Object.assign(customPicker.style, {
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            padding: '0'
        });
        customPicker.oninput = (e) => {
            hotspot.color = e.target.value;
            this.viewer.refreshHotspot?.(hotspot);
            this.markDirty();
        };
        wrapper.appendChild(customPicker);

        return wrapper;
    }

    /** Pull the live scene catalog (dev) so renames/adds show up without a script. */
    async refreshCatalog() {
        const locations = await SceneCatalog.getLocations();
        this.locations = locations;
        this.availableScenes = SceneCatalog.flat();
        this.filteredScenes = this.availableScenes;
    }

    /** Best-guess location folder for the current scene (for upload target). */
    currentLocationName() {
        const path = this.viewer.currentPath || '';
        const m = path.match(/assets\/([^/]+)\/Media\//);
        return m ? m[1] : null;
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.saveToDisk();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                this.toggle();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.undo();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'c' && this.isAdminMode && this.selectedHotspot) {
                e.preventDefault();
                this.stateManager.copy(this.selectedHotspot);
                this.showToast('Hotspot copied!');
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'v' && this.isAdminMode && this.stateManager.hasClipboard()) {
                e.preventDefault();
                const clipData = this.stateManager.paste();
                const newYaw   = (clipData.yaw || 0) + 10;
                const newPitch = clipData.pitch || 0;

                this.viewer.addHotspot(newYaw, newPitch);

                const hotspots = this.viewer.hotspotManager.hotspots;
                const newMesh  = hotspots[hotspots.length - 1];
                if (newMesh) {
                    const data = newMesh.userData.hotspotData;
                    const { yaw: _y, pitch: _p, ...settings } = clipData;
                    Object.assign(data, settings);
                    data.yaw   = newYaw;
                    data.pitch = newPitch;
                    this.viewer.refreshHotspot?.(data);
                    this.selectHotspot(data);
                    this.markDirty();
                }
                this.showToast('Hotspot pasted!');
            }
            if (e.key === 'Escape' && this.isAdminMode) {
                this.selectHotspot(null);
            }
        });
    }

    pushUndoCommand(cmd) {
        this.stateManager.push(cmd);
    }

    undo() {
        if (!this.isAdminMode || !this.stateManager.canUndo()) return;
        const cmd = this.stateManager.peekUndo();
        this.stateManager.undo();
        if (!cmd || cmd.type !== 'move') return;
        const { hotspot, oldYaw, oldPitch } = cmd;
        hotspot.yaw   = oldYaw;
        hotspot.pitch = oldPitch;
        this.viewer.refreshHotspot?.(hotspot);
        if (this.selectedHotspot === hotspot) this.renderForm(hotspot);
        this.showToast('Undo Move');
    }

    toggle() {
        this.isAdminMode = !this.isAdminMode;
        this.container.style.display = this.isAdminMode ? 'block' : 'none';
        this.viewer.setAdminMode(this.isAdminMode);

        if (this.isAdminMode) {
            this.refreshCatalog();
            this.renderSceneInfo();
        }
    }

    selectHotspot(hotspot) {
        this.selectedHotspot = hotspot;
        this.renderForm(hotspot);
        this.renderSceneInfo(); // keep hotspot count in sync after add/select
        this.renderHotspotChips();
    }

    openInfoCustomizer(hotspot) {
        if (this.modalOverlay) this.modalOverlay.remove();

        this.modalOverlay = document.createElement('div');
        Object.assign(this.modalOverlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            zIndex: '20000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        });

        // Add Animation
        const animStyle = document.createElement('style');
        animStyle.textContent = `
            @keyframes modalSlideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(animStyle);

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '20px 24px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        });
        header.innerHTML = `
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">
                ${hotspot.type === 'info' ? 'Edit Info Panel' : 'Edit Photo Overlay'}
            </h3>
        `;
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        Object.assign(closeBtn.style, {
            background: 'transparent',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#9ca3af',
            lineHeight: '1'
        });
        closeBtn.onclick = () => this.modalOverlay.remove();
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Content
        const scrollArea = document.createElement('div');
        Object.assign(scrollArea.style, {
            padding: '24px',
            overflowY: 'auto',
            flex: '1'
        });
        modal.appendChild(scrollArea);

        const renderField = (label, element) => {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '20px';
            wrap.appendChild(this.createLabel(label));
            wrap.appendChild(element);
            scrollArea.appendChild(wrap);
        };

        // Title
        const titleInput = this.createInput(hotspot.title || hotspot.label, (val) => {
            hotspot.title = val;
            this.markDirty();
            if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
        });
        renderField('Title / Heading', titleInput);

        // Description / Pagination
        const descArea = document.createElement('textarea');
        descArea.value = hotspot.description || '';
        Object.assign(descArea.style, {
            width: '100%',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            minHeight: '120px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'vertical'
        });
        descArea.oninput = (e) => {
            hotspot.description = e.target.value;
            this.markDirty();
            if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
        };
        renderField('Description (Use [PAGE] to split pages)', descArea);

        if (hotspot.type === 'info') {
            // Style Grid
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr 1fr';
            grid.style.gap = '20px';
            scrollArea.appendChild(grid);

            const addGridCol = (label, element) => {
                const wrap = document.createElement('div');
                wrap.appendChild(this.createLabel(label));
                wrap.appendChild(element);
                grid.appendChild(wrap);
            };

            addGridCol('Width', this.createSlider(hotspot.infoWidth || 1.0, 0.5, 3.0, 0.1, (val) => {
                hotspot.infoWidth = parseFloat(val);
                this.markDirty();
                if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
            }));

            addGridCol('Height', this.createSlider(hotspot.infoHeight || 0.8, 0.5, 2.5, 0.1, (val) => {
                hotspot.infoHeight = parseFloat(val);
                this.markDirty();
                if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
            }));

            addGridCol('Bg Opacity', this.createSlider(hotspot.infoOpacity !== undefined ? hotspot.infoOpacity : 0.95, 0.1, 1, 0.05, (val) => {
                hotspot.infoOpacity = parseFloat(val);
                this.markDirty();
                if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
            }));

            // Color selection
            const colorWrap = document.createElement('div');
            colorWrap.style.marginTop = '20px';
            colorWrap.appendChild(this.createLabel('Background Color'));
            colorWrap.appendChild(this.createColorPickerModal(hotspot, (val) => {
                hotspot.infoColor = val;
                this.markDirty();
                if (this.viewer.infoPanel3D?.group.visible) this.viewer.infoPanel3D.show(hotspot);
            }));
            scrollArea.appendChild(colorWrap);
        } else if (hotspot.type === 'photo') {
            const photoInput = this.createInput(hotspot.target || '', (val) => {
                hotspot.target = val;
                this.markDirty();
            });
            renderField('Photo URL / Path', photoInput);
        }

        // Footer
        const footer = document.createElement('div');
        Object.assign(footer.style, {
            padding: '20px 24px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#f9fafb'
        });
        const doneBtn = this.createButton('Done', '#10b981', () => this.modalOverlay.remove());
        doneBtn.style.padding = '10px 30px';
        footer.appendChild(doneBtn);
        modal.appendChild(footer);

        this.modalOverlay.appendChild(modal);
        document.body.appendChild(this.modalOverlay);

        this.modalOverlay.onclick = (e) => {
            if (e.target === this.modalOverlay) this.modalOverlay.remove();
        };
    }

    createColorPickerModal(hotspot, onUpdate) {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
        });

        const activeColor = hotspot.infoColor || '#1e293b';

        this.colorPresets.concat(['#1e293b', '#000000', '#ffffff']).forEach(color => {
            const swatch = document.createElement('button');
            Object.assign(swatch.style, {
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: color,
                border: activeColor.toLowerCase() === color.toLowerCase() ? '2px solid #3b82f6' : '1px solid rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'all 0.1s'
            });
            swatch.onclick = () => {
                onUpdate(color);
                this.openInfoCustomizer(hotspot); // Re-render modal to show selection
            };
            wrapper.appendChild(swatch);
        });

        const custom = document.createElement('input');
        custom.type = 'color';
        custom.value = activeColor;
        Object.assign(custom.style, {
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid rgba(0,0,0,0.1)',
            padding: '0',
            cursor: 'pointer'
        });
        custom.oninput = (e) => onUpdate(e.target.value);
        wrapper.appendChild(custom);

        return wrapper;
    }

    markDirty() {
        this.unsavedChanges = true;
        this.saveBtn.style.background = '#10b981';
        this.saveBtn.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';
        // Auto-save: persist to localStorage shortly after the last edit, so the
        // admin never clicks Save or reloads. Debounced to coalesce rapid edits.
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => this._autosave(), 400);
    }

    /** Persist the current scene's hotspots to localStorage (offline) + reflect state. */
    _autosave() {
        const payload = this.viewer.getCurrentSceneHotspots();
        if (!payload) return;
        AdminPersistence.saveHotspots(payload.sceneId, payload.hotspots);
        this.unsavedChanges = false;
        this.saveBtn.style.boxShadow = 'none';
        this.saveBtn.textContent = 'Saved ✓';
        this.renderSceneInfo();
        clearTimeout(this._savedLabelTimer);
        this._savedLabelTimer = setTimeout(() => { this.saveBtn.textContent = 'Save'; }, 1200);
    }

    async saveToDisk() {
        if (!this.unsavedChanges) {
            this.showToast('No changes to save');
            return;
        }

        const payload = this.viewer.getCurrentSceneHotspots();
        if (!payload) {
            this.showToast('No scene data to save');
            return;
        }

        try {
            this.saveBtn.disabled = true;
            this.saveBtn.textContent = 'Saving...';

            // Offline: persist straight to localStorage (the API is gone).
            AdminPersistence.saveHotspots(payload.sceneId, payload.hotspots);

            this.unsavedChanges = false;
            this.saveBtn.style.boxShadow = 'none';
            this.saveBtn.textContent = 'Saved!';
            this.renderSceneInfo();              // keep the hotspot count in sync
            this.showToast('Saved (offline)');

            setTimeout(() => {
                this.saveBtn.textContent = 'Save';
                this.saveBtn.disabled = false;
            }, 1500);
        } catch (err) {
            console.error(err);
            this.saveBtn.textContent = 'Error!';
            this.saveBtn.style.background = '#ef4444';
            setTimeout(() => {
                this.saveBtn.textContent = 'Save';
                this.saveBtn.disabled = false;
                this.saveBtn.style.background = '#10b981';
            }, 3000);
        }
    }

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.style.opacity = '1';
        setTimeout(() => this.toast.style.opacity = '0', 2000);
    }
}
