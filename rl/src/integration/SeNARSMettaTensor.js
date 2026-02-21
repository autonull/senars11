/**
 * SeNARS-MeTTa-Tensor Integration Layer
 * Deep neurosymbolic synergy for breakthrough cognitive capabilities.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { CausalGraph, CausalReasoner } from '../reasoning/CausalReasoning.js';
import { Experience } from '../experience/ExperienceSystem.js';
import { compose, pipe, Maybe, Either } from '../functional/FunctionalUtils.js';

/**
 * SeNARS Bridge with enhanced neurosymbolic integration
 */
export class EnhancedSeNARSBridge extends Component {
    constructor(config = {}) {
        super({
            senarsConfig: config.senarsConfig ?? {},
            mettaInterpreter: config.mettaInterpreter ?? null,
            tensorBridge: config.tensorBridge ?? new TensorLogicBridge(),
            autoGround: config.autoGround ?? true,
            ...config
        });
        
        this.bridge = null;
        this.metta = this.config.mettaInterpreter;
        this.tensorBridge = this.config.tensorBridge;
        this.beliefBase = new Map();
        this.goalStack = [];
        this.inferenceHistory = [];
    }

    async onInitialize() {
        // Initialize SeNARS bridge if available
        try {
            const { SeNARS } = await import('@senars/core');
            this.bridge = new SeNARS(this.config.senarsConfig);
            await this.bridge.start();
            
            // Connect to MeTTa if available
            if (this.metta) {
                this._connectMetta();
            }
            
            this.emit('initialized', { senars: true, metta: !!this.metta });
        } catch (e) {
            console.warn('SeNARS not available, using fallback mode');
            this.bridge = null;
        }
    }

    _connectMetta() {
        // Register SeNARS operations in MeTTa
        if (this.metta?.ground) {
            this.metta.ground.register('senars-input', (narsese) => {
                return this.input(narsese.toString());
            });
            
            this.metta.ground.register('senars-ask', (question) => {
                return this.ask(question.toString());
            });
            
            this.metta.ground.register('senars-achieve', (goal) => {
                return this.achieve(goal.toString());
            });
        }
    }

    /**
     * Input Narsese statement
     */
    async input(narsese, options = {}) {
        const { priority = 1.0, confidence = 0.9 } = options;
        
        if (this.bridge) {
            return this.bridge.nar.input(narsese);
        }
        
        // Fallback: store in belief base
        const belief = {
            narsese,
            priority,
            confidence,
            timestamp: Date.now()
        };
        this.beliefBase.set(narsese, belief);
        
        return { success: true, belief };
    }

    /**
     * Ask a question
     */
    async ask(question, options = {}) {
        const { cycles = 50, timeout = 5000 } = options;
        
        if (this.bridge) {
            return this.bridge.ask(question, { cycles });
        }
        
        // Fallback: pattern matching on belief base
        return this._fallbackAsk(question);
    }

    /**
     * Achieve a goal
     */
    async achieve(goal, options = {}) {
        const { cycles = 100, planning = true } = options;
        
        this.goalStack.push({ goal, timestamp: Date.now() });
        
        if (this.bridge) {
            const result = await this.bridge.achieve(goal, { cycles });
            
            if (result?.executedOperations) {
                this.inferenceHistory.push({
                    type: 'achieve',
                    goal,
                    operations: result.executedOperations,
                    timestamp: Date.now()
                });
            }
            
            return result;
        }
        
        // Fallback: symbolic planning
        return this._fallbackAchieve(goal);
    }

    /**
     * Run inference cycles
     */
    async runCycles(count) {
        if (this.bridge) {
            return this.bridge.runCycles(count);
        }
        
        // Fallback: process belief base
        return this._processBeliefs();
    }

    /**
     * Convert observation to Narsese
     */
    observationToNarsese(observation, context = {}) {
        const { prefix = 'obs', confidence = 0.9 } = context;

        if (Array.isArray(observation)) {
            // Vector observation - use simple inheritance statements
            const statements = observation
                .map((v, i) => `<f${i} --> ${prefix}>.`);
            
            return statements.join(' ');
        }

        if (typeof observation === 'object') {
            // Structured observation
            return Object.entries(observation)
                .map(([k, v]) => `<${k} --> ${prefix}>.`)
                .join(' ');
        }

        // Simple observation
        return `<${observation} --> ${prefix}>.`;
    }

    /**
     * Convert action to Narsese operation
     */
    actionToNarsese(action, context = {}) {
        const { prefix = 'op' } = context;
        
        if (typeof action === 'number') {
            return `^${prefix}_${action}`;
        }
        
        if (Array.isArray(action)) {
            return `^${prefix}(${action.join(' ')})`;
        }
        
        return `^${action}`;
    }

    /**
     * Lift tensor to Narsese terms
     */
    tensorToNarsese(tensor, options = {}) {
        const symbols = this.tensorBridge.liftToSymbols(tensor, options);
        
        const terms = symbols.map(s => {
            const symbol = s.symbol || `f${s.index}`;
            const confidence = s.confidence?.toFixed(2) || '1.00';
            return `${symbol}:${confidence}`;
        });
        
        return `<(*, ${terms.join(' ')}) --> tensor>.`;
    }

    /**
     * Ground Narsese to tensor
     */
    narseseToTensor(narsese, shape, options = {}) {
        // Parse Narsese term
        const match = narsese.match(/\(\*,\s*(.*?)\)/);
        if (!match) return null;
        
        const symbols = match[1].split(',').map(s => s.trim());
        
        // Ground to tensor
        return this.tensorBridge.groundToTensor(
            symbols.map((s, i) => ({ index: i, symbol: s, confidence: 1.0 })),
            shape
        );
    }

    /**
     * Fallback ask implementation
     */
    _fallbackAsk(question) {
        // Simple pattern matching
        const questionStr = question.toString();
        
        for (const [narsese, belief] of this.beliefBase) {
            if (narsese.includes(questionStr)) {
                return {
                    term: narsese,
                    truth: { confidence: belief.confidence, priority: belief.priority }
                };
            }
        }
        
        return null;
    }

    /**
     * Fallback achieve implementation
     */
    _fallbackAchieve(goal) {
        // Simple goal achievement through belief matching
        const goalStr = goal.toString();
        
        // Find beliefs that could achieve this goal
        const relevant = Array.from(this.beliefBase.values())
            .filter(b => b.narsese.includes(goalStr));
        
        if (relevant.length > 0) {
            return {
                achieved: true,
                evidence: relevant.map(r => r.narsese)
            };
        }
        
        return { achieved: false };
    }

    /**
     * Process beliefs (fallback inference)
     */
    _processBeliefs() {
        // Simple belief consolidation
        const now = Date.now();
        
        for (const [key, belief] of this.beliefBase) {
            // Decay priority over time
            const age = (now - belief.timestamp) / 60000; // minutes
            belief.priority *= Math.exp(-age * 0.1);
            
            // Remove low-priority beliefs
            if (belief.priority < 0.1) {
                this.beliefBase.delete(key);
            }
        }
        
        return { processed: this.beliefBase.size };
    }

    /**
     * Get current beliefs
     */
    getBeliefs(options = {}) {
        const { minPriority = 0.1, limit = 100 } = options;
        
        return Array.from(this.beliefBase.values())
            .filter(b => b.priority >= minPriority)
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
    }

    /**
     * Get goal stack
     */
    getGoals() {
        return [...this.goalStack];
    }

    /**
     * Clear goal stack
     */
    clearGoals() {
        this.goalStack = [];
    }

    /**
     * Get inference history
     */
    getHistory(limit = 100) {
        return this.inferenceHistory.slice(-limit);
    }

    async onShutdown() {
        if (this.bridge) {
            await this.bridge.dispose();
        }
        this.clearGoals();
    }
}

/**
 * MeTTa Policy Network with Tensor operations
 */
export class MeTTaPolicyNetwork extends Component {
    constructor(config = {}) {
        super({
            mettaInterpreter: config.mettaInterpreter ?? null,
            tensorBridge: config.tensorBridge ?? new TensorLogicBridge(),
            policyScript: config.policyScript ?? null,
            inputDim: config.inputDim ?? 64,
            hiddenDim: config.hiddenDim ?? 128,
            outputDim: config.outputDim ?? 16,
            actionType: config.actionType ?? 'discrete', // 'discrete' or 'continuous'
            ...config
        });
        
        this.metta = this.config.mettaInterpreter;
        this.tensorBridge = this.config.tensorBridge;
        this.policyLoaded = false;
        this.parameters = new Map();
    }

    async onInitialize() {
        if (!this.metta) {
            try {
                const { MeTTaInterpreter } = await import('@senars/metta');
                this.metta = new MeTTaInterpreter();
                
                // Register tensor primitives
                const { registerTensorPrimitives } = await import('../core/TensorPrimitives.js');
                registerTensorPrimitives(this.metta);
            } catch (e) {
                console.warn('MeTTa not available, using fallback policy');
            }
        }
        
        // Load policy script if provided
        if (this.config.policyScript) {
            await this.loadPolicy(this.config.policyScript);
        }
        
        // Initialize default policy if no script
        if (!this.policyLoaded) {
            this._initializeDefaultPolicy();
        }
    }

    async loadPolicy(scriptOrPath) {
        if (!this.metta) return false;
        
        try {
            let script = scriptOrPath;
            
            // Check if it's a file path
            if (typeof scriptOrPath === 'string' && !scriptOrPath.includes('(')) {
                const fs = await import('fs');
                script = fs.readFileSync(scriptOrPath, 'utf8');
            }
            
            this.metta.run(script);
            this.policyLoaded = true;
            
            this.emit('policyLoaded', { script: scriptOrPath });
            return true;
        } catch (e) {
            console.error('Failed to load policy:', e);
            return false;
        }
    }

    _initializeDefaultPolicy() {
        // Create a simple default policy using tensor operations
        if (!this.metta) return;
        
        const policyScript = `
            ; Default neural policy
            ; Input: observation vector
            ; Output: action probabilities
            
            (= (get-action $obs)
               (let* (
                   ($x (&tensor $obs))
                   ($logits (forward $x))
               ) (&argmax $logits))
            )
            
            (= (get-action-continuous $obs)
               (let* (
                   ($x (&tensor $obs))
                   ($output (forward $x))
               ) (&tanh $output))
            )
        `;
        
        this.metta.run(policyScript);
        this.policyLoaded = true;
    }

    /**
     * Select action for discrete action space
     */
    async selectAction(observation, options = {}) {
        if (!this.metta || !this.policyLoaded) {
            return this._fallbackAction(observation, 'discrete');
        }
        
        const { temperature = 1.0, sample = false } = options;
        
        // Convert observation to tensor string
        const obsStr = this._observationToString(observation);
        
        try {
            // Execute policy
            const result = this.metta.run(`! (get-action ${obsStr})`);
            
            if (result && result.length > 0) {
                const actionStr = result[0].toString();
                const action = parseInt(actionStr);
                
                if (!isNaN(action)) {
                    return action;
                }
            }
        } catch (e) {
            console.warn('Policy execution failed:', e);
        }
        
        return this._fallbackAction(observation, 'discrete');
    }

    /**
     * Select action for continuous action space
     */
    async selectContinuousAction(observation, options = {}) {
        if (!this.metta || !this.policyLoaded) {
            return this._fallbackAction(observation, 'continuous');
        }
        
        const { actionLow = -1, actionHigh = 1 } = options;
        
        const obsStr = this._observationToString(observation);
        
        try {
            const result = this.metta.run(`! (get-action-continuous ${obsStr})`);
            
            if (result && result.length > 0) {
                const output = result[0];
                
                // Parse tensor output
                if (output.type === 'Value' && output.value?.data) {
                    const action = Array.from(output.value.data);
                    
                    // Scale to action space
                    return action.map(v => {
                        const normalized = (v + 1) / 2; // tanh output is [-1, 1]
                        return actionLow + normalized * (actionHigh - actionLow);
                    });
                }
            }
        } catch (e) {
            console.warn('Continuous policy execution failed:', e);
        }
        
        return this._fallbackAction(observation, 'continuous');
    }

    /**
     * Update policy from experience
     */
    async updatePolicy(transition, options = {}) {
        if (!this.metta || !this.policyLoaded) return null;
        
        const { learningRate = 0.01, gamma = 0.99 } = options;
        const { state, action, reward, nextState, done } = transition;
        
        const obsStr = this._observationToString(state);
        
        // Compute target (simple TD target)
        const target = done ? reward : reward + gamma * reward; // Simplified
        
        const targetStr = this._createTargetTensor(action, target);
        
        try {
            const result = this.metta.run(`! (update-policy ${obsStr} ${targetStr})`);
            return { success: true, result };
        } catch (e) {
            console.warn('Policy update failed:', e);
            return { success: false, error: e.message };
        }
    }

    _observationToString(observation) {
        if (Array.isArray(observation)) {
            return `(${observation.map(v => v.toFixed(4)).join(' ')})`;
        }
        
        if (observation instanceof SymbolicTensor) {
            return `(${Array.from(observation.data).map(v => v.toFixed(4)).join(' ')})`;
        }
        
        return `(${observation})`;
    }

    _createTargetTensor(action, value) {
        // Create target tensor for policy update
        return `(${action.toFixed(4)} ${value.toFixed(4)})`;
    }

    _fallbackAction(observation, type) {
        if (type === 'continuous') {
            const { actionLow = -1, actionHigh = 1 } = this.config;
            const dim = this.config.outputDim;
            return Array.from({ length: dim }, () => 
                actionLow + Math.random() * (actionHigh - actionLow)
            );
        }
        
        // Discrete
        return Math.floor(Math.random() * this.config.outputDim);
    }

    /**
     * Get policy parameters
     */
    getParameters() {
        return Object.fromEntries(this.parameters);
    }

    /**
     * Set policy parameters
     */
    setParameters(params) {
        for (const [key, value] of Object.entries(params)) {
            this.parameters.set(key, value);
        }
    }

    async onShutdown() {
        this.parameters.clear();
    }
}

/**
 * Unified Neuro-Symbolic Agent
 * Integrates SeNARS, MeTTa, and Tensor Logic for both discrete and continuous domains
 */
export class UnifiedNeuroSymbolicAgent extends Component {
    constructor(config = {}) {
        super({
            // SeNARS configuration
            senarsConfig: config.senarsConfig ?? {},
            
            // MeTTa configuration
            mettaConfig: config.mettaConfig ?? {},
            policyScript: config.policyScript ?? null,
            
            // Tensor configuration
            tensorConfig: config.tensorConfig ?? {},
            
            // Action space configuration
            actionSpace: config.actionSpace ?? null,
            actionType: config.actionType ?? 'auto', // 'auto', 'discrete', 'continuous'
            
            // Integration configuration
            integrationMode: config.integrationMode ?? 'full', // 'full', 'senars-only', 'metta-only'
            reasoningCycles: config.reasoningCycles ?? 50,
            
            ...config
        });
        
        this.senarsBridge = null;
        this.policyNetwork = null;
        this.tensorBridge = new TensorLogicBridge(this.config.tensorConfig);
        this.causalReasoner = null;
        
        this.experienceBuffer = [];
        this.currentGoal = null;
        this.actionHistory = [];
    }

    async onInitialize() {
        // Initialize SeNARS bridge
        if (this.config.integrationMode !== 'metta-only') {
            this.senarsBridge = new EnhancedSeNARSBridge({
                ...this.config.senarsConfig,
                tensorBridge: this.tensorBridge
            });
            await this.senarsBridge.initialize();
        }
        
        // Initialize MeTTa policy network
        if (this.config.integrationMode !== 'senars-only') {
            this.policyNetwork = new MeTTaPolicyNetwork({
                ...this.config.mettaConfig,
                policyScript: this.config.policyScript,
                tensorBridge: this.tensorBridge,
                actionType: this._detectActionType()
            });
            await this.policyNetwork.initialize();
        }
        
        // Initialize causal reasoner
        this.causalReasoner = new CausalReasoner({
            graph: new CausalGraph({ maxNodes: 100 })
        });
        await this.causalReasoner.initialize();
        
        this.emit('initialized', {
            senars: !!this.senarsBridge,
            metta: !!this.policyNetwork,
            actionType: this._detectActionType()
        });
    }

    _detectActionType() {
        if (this.config.actionType !== 'auto') {
            return this.config.actionType;
        }
        
        if (this.config.actionSpace) {
            if (this.config.actionSpace.type === 'Discrete') {
                return 'discrete';
            }
            if (this.config.actionSpace.type === 'Box') {
                return 'continuous';
            }
        }
        
        return 'discrete'; // Default
    }

    /**
     * Select action based on observation
     */
    async act(observation, options = {}) {
        const {
            useReasoning = true,
            usePolicy = true,
            explorationRate = 0.1,
            goal = this.currentGoal
        } = options;
        
        const actionType = this._detectActionType();
        let action = null;
        let source = 'unknown';
        
        // Try reasoning-based action first
        if (useReasoning && this.senarsBridge) {
            const reasoningAction = await this._reasoningAction(observation, goal);
            if (reasoningAction !== null) {
                action = reasoningAction;
                source = 'reasoning';
            }
        }
        
        // Try policy-based action
        if (!action && usePolicy && this.policyNetwork) {
            if (actionType === 'continuous') {
                action = await this.policyNetwork.selectContinuousAction(observation, {
                    explorationRate
                });
            } else {
                action = await this.policyNetwork.selectAction(observation, {
                    explorationRate
                });
            }
            source = 'policy';
        }
        
        // Fallback to random action
        if (!action) {
            action = this._randomAction(actionType);
            source = 'random';
        }
        
        // Record action
        this.actionHistory.push({
            observation,
            action,
            source,
            timestamp: Date.now()
        });
        
        // Keep history bounded
        if (this.actionHistory.length > 1000) {
            this.actionHistory.shift();
        }
        
        return action;
    }

    /**
     * Get action from SeNARS reasoning
     */
    async _reasoningAction(observation, goal) {
        if (!this.senarsBridge) return null;
        
        // Convert observation to Narsese
        const obsNarsese = this.senarsBridge.observationToNarsese(observation);
        await this.senarsBridge.input(obsNarsese);
        
        // Run inference
        await this.senarsBridge.runCycles(this.config.reasoningCycles);
        
        // If goal specified, try to achieve it
        if (goal) {
            const goalNarsese = this._goalToNarsese(goal);
            const result = await this.senarsBridge.achieve(goalNarsese, {
                cycles: this.config.reasoningCycles
            });
            
            if (result?.executedOperations?.length > 0) {
                return this._parseOperation(result.executedOperations[0]);
            }
        }
        
        // Query for best action
        const query = '<(?action) --> good_action>?';
        const result = await this.senarsBridge.ask(query);
        
        if (result?.substitution?.['?action']) {
            return this._parseOperation(result.substitution['?action']);
        }
        
        return null;
    }

    _goalToNarsese(goal) {
        if (typeof goal === 'string') {
            return `${goal}!`;
        }
        
        if (typeof goal === 'object') {
            const terms = Object.entries(goal)
                .map(([k, v]) => `${k}_${v}`)
                .join(' ');
            return `<(*, ${terms}) --> goal>!`;
        }
        
        return `${goal}!`;
    }

    _parseOperation(operation) {
        const opStr = operation.toString();
        
        // Extract action number from operation like "^op_0" or "^op(1 2 3)"
        const match = opStr.match(/\^op_?(\d+|\(.*?\))/);
        if (match) {
            const actionStr = match[1];
            
            if (actionStr.startsWith('(')) {
                // Continuous action
                const values = actionStr.slice(1, -1).split(/\s+/).map(Number);
                return values;
            }
            
            // Discrete action
            return parseInt(actionStr);
        }
        
        return null;
    }

    _randomAction(actionType) {
        if (actionType === 'continuous') {
            const { actionLow = -1, actionHigh = 1 } = this.config;
            const dim = this.config.actionSpace?.shape?.[0] ?? 4;
            return Array.from({ length: dim }, () =>
                actionLow + Math.random() * (actionHigh - actionLow)
            );
        }
        
        // Discrete
        const n = this.config.actionSpace?.n ?? 4;
        return Math.floor(Math.random() * n);
    }

    /**
     * Learn from experience
     */
    async learn(transition, reward, options = {}) {
        const { state, action, nextState, done } = transition;
        
        // Store experience
        const experience = new Experience({
            state,
            action,
            reward,
            nextState,
            done,
            info: { timestamp: Date.now() }
        });
        this.experienceBuffer.push(experience);
        
        // Update policy
        if (this.policyNetwork) {
            await this.policyNetwork.updatePolicy(transition, options);
        }
        
        // Update causal model
        if (this.causalReasoner) {
            this._updateCausalModel(transition);
        }
        
        // Update SeNARS beliefs
        if (this.senarsBridge && reward !== 0) {
            const valence = reward > 0 ? 'good' : 'bad';
            await this.senarsBridge.input(`<(*, ${this._stateToTerm(nextState)}) --> ${valence}>.`);
        }
        
        // Keep buffer bounded
        if (this.experienceBuffer.length > 10000) {
            this.experienceBuffer.shift();
        }
        
        return { stored: true, experience };
    }

    _stateToTerm(state) {
        if (Array.isArray(state)) {
            return state.map(v => Math.round(v * 10)).join('_');
        }
        return String(state);
    }

    _updateCausalModel(transition) {
        const { state, action, nextState, reward } = transition;
        const graph = this.causalReasoner.graph;
        
        // Add nodes for state variables
        const stateVars = this._extractVariables(state);
        const nextVars = this._extractVariables(nextState);
        
        for (const [varId, value] of Object.entries(stateVars)) {
            if (!graph.nodes.has(varId)) {
                graph.addNode(varId, { type: 'state' });
            }
            graph.observe(varId, value);
        }
        
        // Learn causal structure from transitions
        if (this.experienceBuffer.length > 100) {
            const trajectories = this._extractTrajectories();
            graph.learnStructure(trajectories, { minStrength: 0.1 });
        }
    }

    _extractVariables(state) {
        if (Array.isArray(state)) {
            return Object.fromEntries(state.map((v, i) => [`var_${i}`, v]));
        }
        if (typeof state === 'object') {
            return state;
        }
        return { value: state };
    }

    _extractTrajectories() {
        // Group experiences into trajectories
        const trajectories = [];
        let current = [];
        
        for (const exp of this.experienceBuffer) {
            current.push({
                state: exp.state,
                action: exp.action,
                nextState: exp.nextState,
                reward: exp.reward
            });
            
            if (exp.done) {
                if (current.length > 1) {
                    trajectories.push({ states: current.map(e => e.state) });
                }
                current = [];
            }
        }
        
        return trajectories;
    }

    /**
     * Set current goal
     */
    setGoal(goal) {
        this.currentGoal = goal;
        
        if (this.senarsBridge) {
            this.senarsBridge.input(this._goalToNarsese(goal));
        }
        
        this.emit('goalSet', { goal });
    }

    /**
     * Get current goal
     */
    getGoal() {
        return this.currentGoal;
    }

    /**
     * Clear current goal
     */
    clearGoal() {
        this.currentGoal = null;
        if (this.senarsBridge) {
            this.senarsBridge.clearGoals();
        }
    }

    /**
     * Get experience buffer
     */
    getExperiences(options = {}) {
        const { limit = 100, filter = null } = options;
        
        let experiences = [...this.experienceBuffer];
        
        if (filter) {
            experiences = experiences.filter(filter);
        }
        
        return experiences.slice(-limit);
    }

    /**
     * Get action history
     */
    getActionHistory(limit = 100) {
        return this.actionHistory.slice(-limit);
    }

    /**
     * Get agent statistics
     */
    getStats() {
        return {
            experienceCount: this.experienceBuffer.length,
            actionHistoryCount: this.actionHistory.length,
            currentGoal: this.currentGoal,
            actionType: this._detectActionType(),
            senarsBeliefs: this.senarsBridge?.getBeliefs()?.length ?? 0,
            causalGraphNodes: this.causalReasoner?.graph?.nodes?.size ?? 0
        };
    }

    async onShutdown() {
        await this.senarsBridge?.shutdown();
        await this.policyNetwork?.shutdown();
        await this.causalReasoner?.shutdown();
        this.experienceBuffer = [];
        this.actionHistory = [];
    }
}

/**
 * Factory for creating unified agents
 */
export class UnifiedAgentFactory {
    static create(config = {}) {
        return new UnifiedNeuroSymbolicAgent(config);
    }

    static async createWithDefaults(env) {
        const config = {
            actionSpace: env.actionSpace,
            reasoningCycles: 50,
            integrationMode: 'full'
        };
        
        const agent = this.create(config);
        await agent.initialize();
        
        return agent;
    }

    static createDiscrete(config = {}) {
        return this.create({
            ...config,
            actionType: 'discrete'
        });
    }

    static createContinuous(config = {}) {
        return this.create({
            ...config,
            actionType: 'continuous'
        });
    }
}
