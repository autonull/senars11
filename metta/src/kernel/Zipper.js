/**
 * Zipper.js
 * MORK-parity Phase P1-A: Zipper-Based Traversal
 */
export class Zipper {
  constructor(root) {
    this.root = root;
    this.path = new Uint32Array(32);
    this.depth = 0;
    this.focus = root;
  }
}
