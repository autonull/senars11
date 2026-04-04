/**
 * config.js - MeTTa Configuration (legacy compatibility removed)
 * All code should use configManager from config/config.js
 */

import { configManager, getConfig } from './config/config.js';

export { configManager, getConfig };

// Legacy export for backward compatibility
export const METTA_CONFIG = configManager.getAll();
