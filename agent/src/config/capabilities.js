/**
 * capabilities.js — Capability flag resolution for METTACLAW agent.json
 */

const DEFAULTS = {
  mettaControlPlane: true, sExprSkillDispatch: true, semanticMemory: true,
  persistentHistory: true, loopBudget: true, contextBudgets: true,
  fileReadSkill: true, webSearchSkill: true, fileWriteSkill: false, shellSkill: false,
  multiModelRouting: false, modelExploration: false, modelScoreUpdates: false,
  multiEmbodiment: false, virtualEmbodiment: false, autonomousLoop: false,
  attentionSalience: false, safetyLayer: false, auditLog: false, rlhfCollection: false,
  dynamicSkillDiscovery: false, executionHooks: false, runtimeIntrospection: false,
  selfModifyingSkills: false, harnessOptimization: false, memoryConsolidation: false,
  goalPursuit: false, subAgentSpawning: false, selfEvaluation: false, harnessDiffusion: false,
  actionTrace: false, memorySnapshots: false, separateEvaluator: false, coordinatorMode: false,
};

const PROFILES = {
  minimal: {
    mettaControlPlane: false, sExprSkillDispatch: false, semanticMemory: false,
    persistentHistory: false, loopBudget: false, contextBudgets: false,
    fileReadSkill: false, fileWriteSkill: false, shellSkill: false, webSearchSkill: true,
    dynamicSkillDiscovery: false, executionHooks: false, runtimeIntrospection: false,
  },
  parity: {
    mettaControlPlane: true, sExprSkillDispatch: true, semanticMemory: true,
    persistentHistory: true, loopBudget: true, contextBudgets: true,
    fileReadSkill: true, fileWriteSkill: false, shellSkill: false, webSearchSkill: true,
    auditLog: true, dynamicSkillDiscovery: false, executionHooks: false, runtimeIntrospection: false,
  },
  evolved: {
    mettaControlPlane: true, sExprSkillDispatch: true, semanticMemory: true,
    persistentHistory: true, loopBudget: true, contextBudgets: true,
    fileReadSkill: true, fileWriteSkill: true, shellSkill: false, webSearchSkill: true,
    multiModelRouting: true, modelExploration: true, modelScoreUpdates: true,
    multiEmbodiment: true, virtualEmbodiment: true, autonomousLoop: true,
    attentionSalience: true, safetyLayer: true, auditLog: true, rlhfCollection: true,
    dynamicSkillDiscovery: false, executionHooks: false, runtimeIntrospection: false,
    actionTrace: true,
  },
  full: {
    mettaControlPlane: true, sExprSkillDispatch: true, semanticMemory: true,
    persistentHistory: true, loopBudget: true, contextBudgets: true,
    fileReadSkill: true, fileWriteSkill: true, shellSkill: false, webSearchSkill: true,
    multiModelRouting: true, modelExploration: true, modelScoreUpdates: true,
    multiEmbodiment: true, virtualEmbodiment: true, autonomousLoop: true,
    attentionSalience: true, safetyLayer: true, auditLog: true, rlhfCollection: true,
    selfModifyingSkills: true, harnessOptimization: true, memoryConsolidation: true,
    goalPursuit: true, subAgentSpawning: true, selfEvaluation: true, harnessDiffusion: false,
    dynamicSkillDiscovery: true, executionHooks: true, runtimeIntrospection: true,
    actionTrace: true, memorySnapshots: true, separateEvaluator: true, coordinatorMode: true,
  },
};

const DEPENDENCY_TABLE = {
  autonomousLoop: ['loopBudget'],
  goalPursuit: ['autonomousLoop', 'virtualEmbodiment'],
  selfModifyingSkills: ['safetyLayer', 'auditLog'],
  harnessOptimization: ['selfModifyingSkills', 'auditLog', 'persistentHistory'],
  subAgentSpawning: ['virtualEmbodiment'],
  memoryConsolidation: ['semanticMemory'],
  modelExploration: ['multiModelRouting', 'modelScoreUpdates'],
  harnessDiffusion: ['harnessOptimization'],
  dynamicSkillDiscovery: ['selfModifyingSkills'],
  executionHooks: ['safetyLayer', 'auditLog'],
  actionTrace: ['auditLog'],
  memorySnapshots: ['semanticMemory'],
  separateEvaluator: ['subAgentSpawning'],
  coordinatorMode: ['multiEmbodiment'],
};

export function isEnabled(config, flag) {
  if (config?.capabilities && flag in config.capabilities) {
    return Boolean(config.capabilities[flag]);
  }
  const profile = config?.profile;
  if (profile && PROFILES[profile] && flag in PROFILES[profile]) {
    return Boolean(PROFILES[profile][flag]);
  }
  return DEFAULTS[flag] ?? false;
}

export function validateDeps(config) {
  for (const [flag, deps] of Object.entries(DEPENDENCY_TABLE)) {
    if (!isEnabled(config, flag)) continue;
    for (const dep of deps) {
      if (!isEnabled(config, dep)) {
        throw new Error(
          `Capability '${flag}' requires '${dep}'. Check agent.json capabilities or profile.`
        );
      }
    }
  }
}
