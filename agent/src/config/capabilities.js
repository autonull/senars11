/**
 * capabilities.js — Capability flag resolution for METTACLAW agent.json
 *
 * Two exports:
 *   isEnabled(config, flag)  — resolves flag against profile + explicit overrides
 *   validateDeps(config)     — throws on unsatisfied dependency
 */

const DEFAULTS = {
  // Parity tier
  mettaControlPlane:  true,
  sExprSkillDispatch: true,
  semanticMemory:     true,
  persistentHistory:  true,
  loopBudget:         true,
  contextBudgets:     true,
  fileReadSkill:      true,
  webSearchSkill:     true,
  fileWriteSkill:     false,
  shellSkill:         false,
  // Evolution tier
  multiModelRouting:  false,
  modelExploration:   false,
  modelScoreUpdates:  false,
  multiEmbodiment:    false,
  virtualEmbodiment:  false,
  autonomousLoop:     false,
  attentionSalience:  false,
  safetyLayer:        false,
  auditLog:           false,
  rlhfCollection:     false,
  // Experimental tier
  selfModifyingSkills: false,
  harnessOptimization: false,
  memoryConsolidation: false,
  goalPursuit:         false,
  subAgentSpawning:    false,
  selfEvaluation:      false,
  harnessDiffusion:    false,
};

const PROFILES = {
  minimal: {
    mettaControlPlane:  false,
    sExprSkillDispatch: false,
    semanticMemory:     false,
    persistentHistory:  false,
    loopBudget:         false,
    contextBudgets:     false,
    fileReadSkill:      false,
    fileWriteSkill:     false,
    shellSkill:         false,
    webSearchSkill:     true,
  },

  parity: {
    mettaControlPlane:  true,
    sExprSkillDispatch: true,
    semanticMemory:     true,
    persistentHistory:  true,
    loopBudget:         true,
    contextBudgets:     true,
    fileReadSkill:      true,
    fileWriteSkill:     false,
    shellSkill:         false,
    webSearchSkill:     true,
    auditLog:           true,
  },

  evolved: {
    mettaControlPlane:  true,
    sExprSkillDispatch: true,
    semanticMemory:     true,
    persistentHistory:  true,
    loopBudget:         true,
    contextBudgets:     true,
    fileReadSkill:      true,
    fileWriteSkill:     true,
    shellSkill:         false,
    webSearchSkill:     true,
    multiModelRouting:  true,
    modelExploration:   true,
    modelScoreUpdates:  true,
    multiEmbodiment:    true,
    virtualEmbodiment:  true,
    autonomousLoop:     true,
    attentionSalience:  true,
    safetyLayer:        true,
    auditLog:           true,
    rlhfCollection:     true,
  },

  full: {
    mettaControlPlane:    true,
    sExprSkillDispatch:   true,
    semanticMemory:       true,
    persistentHistory:    true,
    loopBudget:           true,
    contextBudgets:       true,
    fileReadSkill:        true,
    fileWriteSkill:       true,
    shellSkill:           false,
    webSearchSkill:       true,
    multiModelRouting:    true,
    modelExploration:     true,
    modelScoreUpdates:    true,
    multiEmbodiment:      true,
    virtualEmbodiment:    true,
    autonomousLoop:       true,
    attentionSalience:    true,
    safetyLayer:          true,
    auditLog:             true,
    rlhfCollection:       true,
    selfModifyingSkills:  true,
    harnessOptimization:  true,
    memoryConsolidation:  true,
    goalPursuit:          true,
    subAgentSpawning:     true,
    selfEvaluation:       true,
    harnessDiffusion:     false,
  },
};

const DEPENDENCY_TABLE = {
  autonomousLoop:      ['loopBudget'],
  goalPursuit:         ['autonomousLoop', 'virtualEmbodiment'],
  selfModifyingSkills: ['safetyLayer', 'auditLog'],
  harnessOptimization: ['selfModifyingSkills', 'auditLog', 'persistentHistory'],
  subAgentSpawning:    ['virtualEmbodiment'],
  memoryConsolidation: ['semanticMemory'],
  modelExploration:    ['multiModelRouting', 'modelScoreUpdates'],
  harnessDiffusion:    ['harnessOptimization'],
};

/**
 * Resolve whether a capability flag is enabled.
 * Resolution order (highest priority first):
 *   1. explicit config.capabilities[flag]
 *   2. profile defaults (config.profile → PROFILES[profile][flag])
 *   3. DEFAULTS[flag]
 *   4. false
 */
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

/**
 * Validate all capability dependencies are satisfied.
 * Throws on the first unsatisfied dependency with a clear message.
 */
export function validateDeps(config) {
  for (const [flag, deps] of Object.entries(DEPENDENCY_TABLE)) {
    if (!isEnabled(config, flag)) continue;
    for (const dep of deps) {
      if (!isEnabled(config, dep)) {
        throw new Error(
          `Capability '${flag}' requires '${dep}' to be enabled. ` +
          `Check agent.json capabilities or profile setting.`
        );
      }
    }
  }
}
