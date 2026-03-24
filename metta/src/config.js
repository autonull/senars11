/**
 * config.js - MeTTa Configuration (legacy compatibility removed)
 * All code should use configManager from config/config.js
 */

import { configManager } from './config/config.js';

// Re-export configManager as default export for new code
export { configManager as default, getConfig } from './config/config.js';

// Legacy export for backward compatibility
export const METTA_CONFIG = configManager.getAll();
