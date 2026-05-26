import {beforeEach, describe, expect, it} from '@jest/globals';
import {MemoryResourceManager} from '@senars/nar';

describe('MemoryResourceManager', () => {
    let manager;
    let config;

    beforeEach(() => {
        config = {
            maxConcepts: 100,
            maxTasksPerConcept: 10,
            resourceBudget: 1000,
            memoryPressureThreshold: 0.8
        };
        manager = new MemoryResourceManager(config);
    });

    describe('Constructor', () => {
        it('should initialize with config', () => {
            expect(manager).toBeDefined();
            expect(manager.getStats()).toEqual({
                totalResourceUsage: 0,
                peakResourceUsage: 0,
                memoryPressureEvents: 0
            });
        });
    });

    describe('updateResourceUsage', () => {
        it('should track resource usage for a concept', () => {
            const concept = {term: {toString: () => 'A'}};

            manager.updateResourceUsage(concept, 10);

            const stats = manager.getStats();
            expect(stats.totalResourceUsage).toBe(10);
            expect(stats.peakResourceUsage).toBe(10);
        });

        it('should accumulate resource usage', () => {
            const concept = {term: {toString: () => 'A'}};

            manager.updateResourceUsage(concept, 10);
            manager.updateResourceUsage(concept, 5);

            const stats = manager.getStats();
            expect(stats.totalResourceUsage).toBe(15);
            expect(manager.getResourceUsage(concept.term)).toBe(15);
        });

        it('should track peak resource usage', () => {
            const concept = {term: {toString: () => 'A'}};

            manager.updateResourceUsage(concept, 50);
            expect(manager.getStats().peakResourceUsage).toBe(50);

            manager.updateResourceUsage(concept, -30); // Reduce
            expect(manager.getStats().totalResourceUsage).toBe(20);
            expect(manager.getStats().peakResourceUsage).toBe(50); // Peak stays
        });

        it('should not allow negative resource usage for a concept', () => {
            const concept = {term: {toString: () => 'A'}};

            manager.updateResourceUsage(concept, 10);
            manager.updateResourceUsage(concept, -20); // Try to go negative

            expect(manager.getResourceUsage(concept.term)).toBe(0);
        });

        it('should track multiple concepts separately', () => {
            const conceptA = {term: {toString: () => 'A'}};
            const conceptB = {term: {toString: () => 'B'}};

            manager.updateResourceUsage(conceptA, 10);
            manager.updateResourceUsage(conceptB, 20);

            expect(manager.getResourceUsage(conceptA.term)).toBe(10);
            expect(manager.getResourceUsage(conceptB.term)).toBe(20);
            expect(manager.getStats().totalResourceUsage).toBe(30);
        });
    });

    describe('isUnderMemoryPressure', () => {
        it('should return false when not under pressure', () => {
            const memoryStats = {
                totalConcepts: 10,
                totalTasks: 50
            };

            expect(manager.isUnderMemoryPressure(memoryStats)).toBe(false);
        });

        it('should return true when concept count exceeds threshold', () => {
            const memoryStats = {
                totalConcepts: 85, // 85/100 = 0.85 > 0.8
                totalTasks: 50
            };

            expect(manager.isUnderMemoryPressure(memoryStats)).toBe(true);
        });

        it('should return true when resource usage exceeds threshold', () => {
            const concept = {term: {toString: () => 'A'}};
            manager.updateResourceUsage(concept, 850); // 850/1000 = 0.85 > 0.8

            const memoryStats = {
                totalConcepts: 10,
                totalTasks: 50
            };

            expect(manager.isUnderMemoryPressure(memoryStats)).toBe(true);
        });

        it('should return true when task count exceeds threshold', () => {
            const memoryStats = {
                totalConcepts: 10,
                totalTasks: 850 // 850/(100*10) = 0.85 > 0.8
            };

            expect(manager.isUnderMemoryPressure(memoryStats)).toBe(true);
        });

        it('should use maximum of all pressure metrics', () => {
            const memoryStats = {
                totalConcepts: 50,  // 0.5
                totalTasks: 700     // 0.7
            };

            const concept = {term: {toString: () => 'A'}};
            manager.updateResourceUsage(concept, 900); // 0.9 (highest)

            expect(manager.isUnderMemoryPressure(memoryStats)).toBe(true);
        });
    });

    describe('applyAdaptiveForgetting', () => {
        it('should increment memory pressure event counter', () => {
            const mockMemory = {
                stats: {totalConcepts: 100},
                _applyConceptForgetting: () => {
                }
            };

            manager.applyAdaptiveForgetting(mockMemory);

            expect(manager.getStats().memoryPressureEvents).toBe(1);
        });

        it('should trigger forgetting based on concept count', () => {
            let forgetCount = 0;
            const mockMemory = {
                stats: {totalConcepts: 50},
                _applyConceptForgetting: () => {
                    forgetCount++;
                }
            };

            manager.applyAdaptiveForgetting(mockMemory);

            // Should forget Math.floor(50 * 0.1) = 5 concepts
            expect(forgetCount).toBe(5);
        });

        it('should cap forgetting at 5 concepts maximum', () => {
            let forgetCount = 0;
            const mockMemory = {
                stats: {totalConcepts: 100}, // Would be 10, but caps at 5
                _applyConceptForgetting: () => {
                    forgetCount++;
                }
            };

            manager.applyAdaptiveForgetting(mockMemory);

            expect(forgetCount).toBe(5);
        });
    });

    describe('cleanup', () => {
        it('should remove resource tracking for non-existent concepts', () => {
            const conceptA = {term: {toString: () => 'A'}};
            const conceptB = {term: {toString: () => 'B'}};
            const conceptC = {term: {toString: () => 'C'}};

            manager.updateResourceUsage(conceptA, 10);
            manager.updateResourceUsage(conceptB, 20);
            manager.updateResourceUsage(conceptC, 30);

            const conceptMap = new Map();
            conceptMap.set(conceptA.term, conceptA);
            conceptMap.set(conceptB.term, conceptB);
            // conceptC is missing (was forgotten)

            manager.cleanup(conceptMap);

            expect(manager.getResourceUsage(conceptA.term)).toBe(10);
            expect(manager.getResourceUsage(conceptB.term)).toBe(20);
            expect(manager.getResourceUsage(conceptC.term)).toBe(0);
            expect(manager.getStats().totalResourceUsage).toBe(30);
        });
    });

    describe('getMemoryPressureStats', () => {
        it('should provide detailed pressure statistics', () => {
            const concept = {term: {toString: () => 'A'}};
            manager.updateResourceUsage(concept, 500);

            const memoryStats = {
                totalConcepts: 60,
                totalTasks: 400
            };

            const stats = manager.getMemoryPressureStats(memoryStats);

            expect(stats.conceptPressure).toBe(0.6); // 60/100
            expect(stats.taskPressure).toBe(0.4);    // 400/1000
            expect(stats.resourcePressure).toBe(0.5); // 500/1000
            expect(stats.resourceBudget).toBe(1000);
            expect(stats.currentResourceUsage).toBe(500);
            expect(stats.peakResourceUsage).toBe(500);
            expect(stats.memoryPressureEvents).toBe(0);
            expect(stats.isUnderPressure).toBe(false);
        });
    });

    describe('getConceptsByResourceUsage', () => {
        it('should return concepts sorted by resource usage descending', () => {
            const termA = {toString: () => 'A'};
            const termB = {toString: () => 'B'};
            const termC = {toString: () => 'C'};

            const conceptA = {term: termA};
            const conceptB = {term: termB};
            const conceptC = {term: termC};

            manager.updateResourceUsage(conceptA, 10);
            manager.updateResourceUsage(conceptB, 30);
            manager.updateResourceUsage(conceptC, 20);

            const conceptMap = new Map([
                [termA, conceptA],
                [termB, conceptB],
                [termC, conceptC]
            ]);

            const sorted = manager.getConceptsByResourceUsage(conceptMap, false);

            expect(sorted[0].resourceUsage).toBe(30);
            expect(sorted[1].resourceUsage).toBe(20);
            expect(sorted[2].resourceUsage).toBe(10);
        });

        it('should return concepts sorted by resource usage ascending', () => {
            const termA = {toString: () => 'A'};
            const termB = {toString: () => 'B'};

            const conceptA = {term: termA};
            const conceptB = {term: termB};

            manager.updateResourceUsage(conceptA, 10);
            manager.updateResourceUsage(conceptB, 30);

            const conceptMap = new Map([
                [termA, conceptA],
                [termB, conceptB]
            ]);

            const sorted = manager.getConceptsByResourceUsage(conceptMap, true);

            expect(sorted[0].resourceUsage).toBe(10);
            expect(sorted[1].resourceUsage).toBe(30);
        });
    });

    describe('serialization', () => {
        it('should get and set resource tracker', () => {
            const concept = {term: {toString: () => 'A'}};
            manager.updateResourceUsage(concept, 100);

            const tracker = manager.getResourceTracker();
            expect(tracker.get('A')).toBe(100);

            const newManager = new MemoryResourceManager(config);
            newManager.setResourceTracker(tracker);

            expect(newManager.getResourceUsage({toString: () => 'A'})).toBe(100);
            expect(newManager.getStats().totalResourceUsage).toBe(100);
        });
    });
});
