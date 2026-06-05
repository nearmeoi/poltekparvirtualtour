export class AdminStateManager {
    constructor(bus) {
        this.bus          = bus;
        this._undoStack   = [];
        this._redoStack   = [];
        this._clipboard   = null;
        this._maxHistory  = 50;
    }

    push(state) {
        this._undoStack.push(JSON.parse(JSON.stringify(state)));
        if (this._undoStack.length > this._maxHistory) {
            this._undoStack.shift();
        }
        this._redoStack = [];
    }

    undo() {
        if (!this.canUndo()) return null;
        const state = this._undoStack.pop();
        this._redoStack.push(state);
        const prev  = this._undoStack[this._undoStack.length - 1] || null;
        if (this.bus) this.bus.emit('admin:state-change', { state: prev, action: 'undo' });
        return prev;
    }

    redo() {
        if (!this.canRedo()) return null;
        const state = this._redoStack.pop();
        this._undoStack.push(state);
        if (this.bus) this.bus.emit('admin:state-change', { state, action: 'redo' });
        return state;
    }

    copy(data) {
        this._clipboard = JSON.parse(JSON.stringify(data));
    }

    paste() {
        return this._clipboard
            ? JSON.parse(JSON.stringify(this._clipboard))
            : null;
    }

    peekUndo() {
        const len = this._undoStack.length;
        return len > 0 ? this._undoStack[len - 1] : null;
    }

    canUndo() { return this._undoStack.length > 1; }
    canRedo() { return this._redoStack.length > 0; }
    hasClipboard() { return this._clipboard !== null; }

    clear() {
        this._undoStack  = [];
        this._redoStack  = [];
        this._clipboard  = null;
    }
}
