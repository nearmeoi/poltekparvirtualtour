/**
 * Shared schema for the tunable VR/reticle settings. Used by both the flat
 * pre-experience panel (SettingsPanel) and the in-VR gaze panel (SettingsPanel3D)
 * so the two can never drift apart.
 *
 * Each entry:
 *   group  — section heading
 *   label  — display name
 *   path   — CONFIG dot-path (also the SettingsStore override key)
 *   min/max/step — slider/stepper bounds
 *   modes  — VR modes where the knob actually has an effect ('webxr' | 'cardboard')
 */
export const SETTINGS_SCHEMA = [
    { group: 'Reticle',            label: 'Reticle size',        path: 'gaze.reticleSize',      min: 0.002, max: 0.03, step: 0.001, modes: ['webxr', 'cardboard'] },
    { group: 'Reticle',            label: 'Reticle distance',    path: 'gaze.reticleDistance',  min: 0.5,   max: 5,    step: 0.1,   modes: ['webxr', 'cardboard'] },
    { group: 'Reticle',            label: 'Dwell time (sec)',    path: 'gaze.activationTime',   min: 0.5,   max: 4,    step: 0.1,   modes: ['webxr', 'cardboard'] },
    { group: 'Stereo (double-vision)', label: 'Eye separation (IPD)', path: 'vr.cardboardIPD',  min: 0.04,  max: 0.09, step: 0.001, modes: ['cardboard'] },
    { group: 'Stereo (double-vision)', label: 'Lens distortion',      path: 'vr.lensDistortion', min: 0,    max: 0.4,  step: 0.01,  modes: ['cardboard'] },
    { group: 'Stereo (double-vision)', label: 'VR field of view',     path: 'fov.vr',           min: 30,    max: 110,  step: 5,     modes: ['cardboard'] },
    { group: 'Stereo (double-vision)', label: 'Panorama distance',    path: 'panorama.sphereRadius', min: 20, max: 90, step: 1,    modes: ['webxr', 'cardboard'] },
    { group: 'Subtitle',           label: 'Subtitle size',       path: 'narration.subtitleScale', min: 0.5, max: 2.5, step: 0.1, modes: ['webxr', 'cardboard'] },
    { group: 'Control Dock',       label: 'Dock depth (Z)',      path: 'controlDock.dockZ',       min: -4.0, max: -0.5, step: 0.1, modes: ['webxr', 'cardboard'] },
    { group: 'Control Dock',       label: 'Dock height (Y)',     path: 'controlDock.dockY',       min: -3.0, max: 1.0,  step: 0.1, modes: ['webxr', 'cardboard'] },
    { group: 'Control Dock',       label: 'Dock offset (X)',     path: 'controlDock.dockX',       min: -2.0, max: 2.0,  step: 0.1, modes: ['webxr', 'cardboard'] },
];

/** Round to the schema step's decimal count to avoid float drift (e.g. 0.065000001). */
export function clampToStep(def, value) {
    const v = Math.min(def.max, Math.max(def.min, value));
    const decimals = (String(def.step).split('.')[1] || '').length;
    return Number(v.toFixed(decimals));
}
