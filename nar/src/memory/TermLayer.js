import {Layer} from './Layer.js';
import {Bag} from './Bag.js';

export class TermLayer extends Layer {
    constructor(config = {}) {
        super(config);

        this.linkBag = new Bag(this.capacity, 'priority', (item) => this._onLinkRemoved(item));
        this.linkMap = new Map();
    }

    get count() {
        return this.linkBag.size;
    }

    _onLinkRemoved(linkEntry) {
        this._removeFromSimpleLinkMap(linkEntry);
    }

    add(source, target, data = {}) {
        const sourceLinks = this._getOrCreateSourceMap(source.name);
        const priority = data.priority ?? 1;

        const linkEntry = this._createLinkEntry(source, target, {...data, priority});
        const added = this.linkBag.add(linkEntry);

        if (added) {
            sourceLinks.set(target.name, linkEntry);
        }

        return added;
    }

    get(source) {
        const sourceLinks = this.linkMap.get(source.name);
        return sourceLinks ?
            Array.from(sourceLinks.values()).map(this._mapLinkEntryToResult)
            : [];
    }

    _mapLinkEntryToResult(linkEntry) {
        return {
            target: linkEntry.target,
            data: linkEntry.data
        };
    }

    remove(source, target) {
        const sourceLinks = this.linkMap.get(source.name);
        if (!sourceLinks?.has(target.name)) return false;

        const linkEntry = sourceLinks.get(target.name);
        // We call bag.remove, which triggers _onLinkRemoved, which updates linkMap.
        // But for clarity and explicit behavior in 'remove' method, we can leave it to the callback or do it here.
        // Doing it via bag.remove ensures consistency.

        return this.linkBag.remove(linkEntry);
    }

    has(source, target) {
        const sourceLinks = this.linkMap.get(source.name);
        return sourceLinks?.has(target.name) ?? false;
    }

    getSources() {
        return Array.from(this.linkMap.keys())
            .map(name => this._getSourceTermByName(name))
            .filter(Boolean);
    }

    update(source, target, data) {
        const sourceLinks = this.linkMap.get(source.name);
        if (!sourceLinks?.has(target.name)) return false;

        const linkEntry = sourceLinks.get(target.name);
        Object.assign(linkEntry.data, data);

        if (data.priority !== undefined) {
            this._updatePriorityInBag(linkEntry);
        }

        return true;
    }

    clear() {
        this.linkMap.clear();
        this.linkBag.clear();
        // Since we cleared bag, callback won't be called for each item (Bag.clear doesn't loop remove).
        // That's correct because we cleared map manually.
    }

    getStats() {
        return {
            linkCount: this.count,
            capacity: this.capacity,
            utilization: this.count / this.capacity,
            bagSize: this.linkBag.size,
            avgPriority: this.linkBag.getAveragePriority()
        };
    }

    getLinksByPriority() {
        return this.linkBag.getItemsInPriorityOrder();
    }

    _createLinkEntry(source, target, data) {
        return {
            id: this._createLinkId(source, target),
            source,
            target,
            data,
            budget: {priority: data.priority},
            toString() {
                return this.id;
            }
        };
    }

    _createLinkId(source, target) {
        return `${source.name}_${target.name}`;
    }

    _getSourceTermByName(name) {
        return {name};
    }

    _getOrCreateSourceMap(sourceName) {
        if (!this.linkMap.has(sourceName)) {
            this.linkMap.set(sourceName, new Map());
        }
        return this.linkMap.get(sourceName);
    }

    _removeFromSimpleLinkMap(item) {
        const sourceLinks = this.linkMap.get(item.source.name);
        if (sourceLinks) {
            sourceLinks.delete(item.target.name);
            if (sourceLinks.size === 0) {
                this.linkMap.delete(item.source.name);
            }
        }
    }

    _updatePriorityInBag(linkEntry) {
        // Removing from bag triggers the callback which removes from the map.
        // We must re-add the entry to the map after adding it back to the bag.
        this.linkBag.remove(linkEntry); // triggers map removal
        this.linkBag.add(linkEntry);

        // Add back to map
        const sourceLinks = this._getOrCreateSourceMap(linkEntry.source.name);
        sourceLinks.set(linkEntry.target.name, linkEntry);
    }
}
