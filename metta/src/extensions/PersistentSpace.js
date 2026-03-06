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
}
