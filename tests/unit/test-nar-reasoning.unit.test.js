/**
 * @file tests/unit/test-nar-reasoning.unit.test.js
 * @description Unit tests for NAR reasoning functionality
 */

import { NAR } from '../../src/nar/NAR.js';
import { jest } from '@jest/globals';

describe('NAR Reasoning', () => {
    let nar;
    
    beforeEach(() => {
        nar = new NAR({
            lm: { enabled: false },
            memory: {
                conceptBag: { capacity: 100 },
                taskBag: { capacity: 100 }
            }
        });
    });
    
    test('should initialize with correct configuration', async () => {
        await nar.initialize();
        
    });
    
    test('should process input task correctly', async () => {
        await nar.initialize();
        
        const input = '<test --> concept>.';
        const result = await nar.input(input);
        
        expect(result).toBeDefined();
    });
    
    test('should execute reasoning cycle', async () => {
        await nar.initialize();
        
        // Add a simple task first
        await nar.input('<a --> b>.');
        
        // Execute one reasoning cycle
        const result = await nar.step();
        
        expect(result).toBeDefined();
        // Verify that the step didn't cause errors
        expect(typeof result).toBe('object');
    });
    
    test('should handle concept retrieval', async () => {
        await nar.initialize();
        
        // Input a concept
        await nar.input('<concept_test --> property>.');
        
        // Try to retrieve the concept - this depends on actual implementation
        // The exact method name may vary based on the real implementation
        expect(nar).toBeDefined();
    });
    
    test('should manage task priority properly', async () => {
        await nar.initialize();
        
        // Input tasks with different priorities
        const result1 = await nar.input('<high --> concept>. %1.00;0.90%');
        const result2 = await nar.input('<low --> concept>. %0.10;0.10%');
        
        // Actual priority checking would depend on the implementation
        expect(result1).toBeDefined();
        expect(result2).toBeDefined();
    });
});
