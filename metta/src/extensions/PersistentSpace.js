import { Space } from '../kernel/Space.js';

/**
 * PersistentSpace.js
 * MORK-parity Phase P2-B: Scalable Persistence
 */
export class PersistentSpace extends Space {
  constructor(name, opts = {}) {
    super();
    this.dbName = name;
    this.checkpointThreshold = opts.checkpointThreshold ?? 50000;
    this.db = null;
    this._pendingWrites = 0;
  }

  add(atom) {
    super.add(atom);
    this._pendingWrites++;
    if (this._pendingWrites >= this.checkpointThreshold) {
      this._checkpoint();
    }
  }

  async _checkpoint() {
    this._pendingWrites = 0;
    // Stub: Serialize atoms and write to IndexedDB or fs.writeFile
    // with SubtleCrypto.digest('SHA-256') for Merkle hash integrity.
    // In full parity, this handles chunks of Uint8Array serialization.
  }

  async restore(dbName) {
    // Stub: Read back from IndexedDB / fs and re-intern all atoms
  }
}
