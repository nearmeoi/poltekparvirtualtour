export class HotspotEditor {
    constructor(panoramaViewer, bus = null) {
        this.viewer = panoramaViewer;
        this.bus = bus;
        this._enabled = false;
        this._onOpen  = () => this.enable();
        this._onClose = () => this.disable();
        if (bus) {
            bus.on('admin:open',  this._onOpen);
            bus.on('admin:close', this._onClose);
        }
    }

    enable() {
        this._enabled = true;
        this.viewer.setAdminMode(true);
    }

    disable() {
        this._enabled = false;
        this.viewer.setAdminMode(false);
    }

    addHotspot(yaw, pitch) {
        this.viewer.addHotspot(yaw, pitch);
    }

    removeHotspot(data) {
        this.viewer.removeHotspot(data);
    }

    refreshHotspot(data) {
        this.viewer.refreshHotspot(data);
    }

    getCurrentSceneHotspots() {
        return this.viewer.getCurrentSceneHotspots();
    }

    getAllHotspotsData() {
        return this.viewer.getAllHotspotsData();
    }

    syncCurrentHotspotsToData() {
        return this.viewer.syncCurrentHotspotsToData();
    }

    // Admin interaction handlers — called by InputHandler
    handleClick(intersects) {
        return this.viewer.handleAdminClick(intersects);
    }

    handleRightClick(intersects) {
        return this.viewer.handleAdminRightClick(intersects);
    }

    handleMouseDown(intersects) {
        return this.viewer.handleAdminMouseDown(intersects);
    }

    handleMouseMove(raycaster) {
        return this.viewer.handleAdminMouseMove(raycaster);
    }

    handleMouseUp() {
        return this.viewer.handleAdminMouseUp();
    }

    dispose() {
        if (this.bus) {
            this.bus.off('admin:open',  this._onOpen);
            this.bus.off('admin:close', this._onClose);
        }
        this.disable();
    }
}
