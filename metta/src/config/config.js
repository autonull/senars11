/**
 * config.js - MeTTa Configuration
 * Uses ConfigManager for centralized, runtime-modifiable configuration
 */

import { ConfigManager, Validators } from './config/ConfigManager.js';

// Create and export the singleton config instance
export const configManager = new ConfigManager();

// Define all configuration keys
configManager
  // P1: Performance Core
  .define('zipperThreshold', 8, Validators.positive, 'Depth at which Zipper replaces recursive traversal')
  .define('pathTrie', false, Validators.boolean, 'Enable PathTrie rule index')
  .define('jit', true, Validators.boolean, 'Enable JIT compilation')
  .define('jitThreshold', 50, Validators.positive, 'Calls before JIT compiling')
  .define('parallelThreshold', 200, Validators.positive, 'Min superpose width for Workers')

  // P2: Graph & Space
  .define('persist', false, Validators.boolean, 'Enable PersistentSpace checkpointing')
  .define('persistThreshold', 50000, Validators.positive, 'Atoms before checkpoint')

  // P3: Reasoning Extensions
  .define('il', false, Validators.boolean, 'Enable MeTTa-IL compilation')
  .define('tensor', true, Validators.boolean, 'Enable NeuralBridge tensor ops')
  .define('smt', false, Validators.boolean, 'Enable SMT constraint solver')
  .define('smtVarThreshold', 5, Validators.positive, 'Min vars to trigger SMT')

  // P4: Debugging
  .define('debugging', false, Validators.boolean, 'Enable debug mode')
  .define('tracing', false, Validators.boolean, 'Enable execution tracing')
  .define('profiling', false, Validators.boolean, 'Enable performance profiling')

  // Tier 1 optimizations
  .define('interning', true, Validators.boolean, 'Symbol interning')
  .define('fastPaths', true, Validators.boolean, 'Monomorphic type guards')
  .define('indexing', true, Validators.boolean, 'Multi-level rule indexing')
  .define('caching', true, Validators.boolean, 'Reduction result caching')
  .define('pooling', true, Validators.boolean, 'Object pooling')
  .define('tco', true, Validators.boolean, 'Tail call optimization')
  .define('bloomFilter', false, Validators.boolean, 'Fast negative lookups')

  .freeze();

// Export for backward compatibility (returns current config snapshot)
export function getConfig() {
  return configManager.getAll();
}
