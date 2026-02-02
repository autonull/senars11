export class HUDLayoutManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = null;
        this.zones = {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null
        };
        this.components = new Map();
        this.mode = 'default';
    }

    initialize() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`HUDLayoutManager: Container #${this.containerId} not found`);
            return;
        }

        // Create Zones
        this._createZone('top');
        this._createZone('left');
        this._createZone('right');
        this._createZone('bottom');
        this._createZone('center');
    }

    _createZone(name) {
        const el = document.createElement('div');
        el.className = `hud-zone hud-${name}`;
        el.id = `hud-zone-${name}`;
        this.container.appendChild(el);
        this.zones[name] = el;
    }

    addComponent(component, region) {
        if (!this.zones[region]) {
            console.error(`HUDLayoutManager: Invalid region "${region}"`);
            return;
        }

        // Create a wrapper for the component so it doesn't overwrite the zone
        const wrapper = document.createElement('div');
        wrapper.className = 'hud-component-wrapper';
        this.zones[region].appendChild(wrapper);

        // Mount component to the wrapper
        if (component.mount) {
            component.mount(wrapper);
        } else if (component.container) {
            wrapper.appendChild(component.container);
        } else {
             console.error(`HUDLayoutManager: Component missing mount() or container`, component);
             return;
        }

        // Store reference to wrapper for removal
        component._hudWrapper = wrapper;

        this.components.set(component, region);
    }

    removeComponent(component) {
        const region = this.components.get(component);
        if (region && this.zones[region]) {
            // Unmount/Remove logic would depend on Component implementation
            // For now, assume component handles its own DOM removal on destroy/unmount
            // or we just remove its container from the zone
            if (component.container && component.container.parentNode === this.zones[region]) {
                this.zones[region].removeChild(component.container);
            }
            this.components.delete(component);
        }
    }

    clear() {
        Object.values(this.zones).forEach(zone => {
            if (zone) zone.innerHTML = '';
        });
        this.components.clear();
    }
}
