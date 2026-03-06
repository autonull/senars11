/**
 * MeTTaIL.js
 * MORK-parity Phase P3-A: MeTTa-IL Intermediate Representation
 */
export class ILNode {
  constructor(kind, arity, opId, value) {
    this.kind = kind;
    this.arity = arity;
    this.opId = opId;
    this.value = value;
    this.children = [];
  }
}

export const ILLower = {};
export const ILOpt = {};
export const ILEmit = {};
