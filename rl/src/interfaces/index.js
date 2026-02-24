/**
 * RL Module Interfaces
 * 
 * Formal interfaces defining contracts for RL components.
 * Implementations should use JSDoc @implements tag.
 * 
 * @example
 * ```javascript
 * import { IAgent } from '@senars/rl/interfaces';
 * 
 * /**
 *  * @implements {IAgent}
 *  *\/
 * class MyAgent extends Component {
 *     async act(observation, options) {
 *         // Implementation
 *     }
 *     
 *     async learn(obs, action, reward, nextObs, done) {
 *         // Implementation
 *     }
 *     
 *     // ... other required methods
 * }
 * ```
 */

export { IAgent } from './IAgent.js';
export { IEnvironment } from './IEnvironment.js';
export { IArchitecture } from './IArchitecture.js';
export { IPolicy } from './IPolicy.js';
