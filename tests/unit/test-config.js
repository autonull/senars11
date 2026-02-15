/**
 * Test configuration for SeNARS integration tests
 * Defines different test scenarios and parameters for various testing modes
 */

export const TestConfig = {
    // Different server configurations for testing
    serverConfigs: {
        // Configuration for testing normal operations
        normal: {
            port: 8080,
            uiPort: 5173,
            narOptions: {
                lm: { enabled: false },
                memory: {
                    conceptBag: { capacity: 1000 },
                    taskBag: { capacity: 1000 }
                },
                cycle: {
                    maxTasksPerCycle: 10
                }
            }
        },
        
        // Configuration for testing buffering/batching mechanisms with small capacities
        smallBuffer: {
            port: 8081,
            uiPort: 5174,
            narOptions: {
                lm: { enabled: false },
                memory: {
                    conceptBag: { capacity: 5 },  // Small capacity to test buffering
                    taskBag: { capacity: 5 }      // Small capacity to test batching
                },
                cycle: {
                    maxTasksPerCycle: 2          // Small batch size
                }
            }
        },
        
        // Configuration for performance testing
        performance: {
            port: 8082,
            uiPort: 5175,
            narOptions: {
                lm: { enabled: false },
                memory: {
                    conceptBag: { capacity: 5000 },
                    taskBag: { capacity: 5000 }
                },
                cycle: {
                    maxTasksPerCycle: 50
                }
            }
        }
    },
    
    // UI configurations for different test scenarios
    uiConfigs: {
        normal: {
            headless: false,
            timeout: 30000,
            retryAttempts: 2
        },
        ci: {
            headless: true,
            timeout: 20000,
            retryAttempts: 3
        }
    },
    
    // Common test parameters
    testParams: {
        defaultWaitTime: 1000,
        longWaitTime: 3000,
        timeout: 15000,
        maxRetries: 3,
        batchSize: 5
    },
    
    // NAR reasoning modes for testing
    reasoningModes: {
        stepMode: {
            command: '*step',
            description: 'Single reasoning step execution'
        },
        continuousMode: {
            command: '*run',
            description: 'Continuous reasoning execution'
        }
    }
};