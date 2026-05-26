import nodeShim from './mock-node.js';

export const {readFile} = nodeShim;
export const {writeFile} = nodeShim;
export const {access} = nodeShim;
export const {stat} = nodeShim;
export const {mkdir} = nodeShim;
export const {readdir} = nodeShim;
export const {rm} = nodeShim;

export default nodeShim;
