import { basicDemos } from './basic.js';
import { proceduralDemos } from './procedural.js';
import { interactiveDemos } from './interactive.js';

export const DEMOS = {
    ...basicDemos,
    ...proceduralDemos,
    ...interactiveDemos
};
