/**
 * App Configuration - Centralized parameter management
 * @deprecated Use config/config-manager.js instead
 */
import configManager from './config-manager.js';

// Export the same structure for backward compatibility
const AppConfig = configManager.getConfig();

export default AppConfig;