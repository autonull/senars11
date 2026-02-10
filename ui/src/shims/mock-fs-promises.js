import nodeShim from './mock-node.js';

export const readFile = nodeShim.readFile;
export const writeFile = nodeShim.writeFile;
export const access = nodeShim.access;
export const stat = nodeShim.stat;
export const mkdir = nodeShim.mkdir;
export const readdir = nodeShim.readdir;
export const rm = nodeShim.rm;

export default nodeShim;
