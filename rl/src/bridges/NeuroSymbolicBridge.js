/**
 * Unified Neuro-Symbolic Bridge
 * 
 * Deep integration of NARS, MeTTa, and Tensor Logic for breakthrough RL capabilities.
 * Provides bidirectional translation between all three representations with gradient tracking.
 */
import { Component } from '../composable/Component.js';
import { SymbolicTensor, TensorLogicBridge } from '../neurosymbolic/TensorLogicBridge.js';
import { CausalReasoner } from '../reasoning/CausalReasoning.js';
import { Experience } from '../experience/ExperienceSystem.js';
import { compose, pipe, Maybe, Either } from '../functional/FunctionalUtils.js';

/**
 * Unified bridge integrating NARS, MeTTa, and Tensor operations
 */
export class NeuroSymbolicBridge extends Component {
    constructor(config = {}) {
        super({
            // SeNARS configuration
            senarsConfig: config.senarsConfig ?? {},
            
            // MeTTa configuration
            mettaConfig: config.mettaConfig ?? {},
            mettaInterpreter: config.mettaInterpreter ?? null,
            
            // Tensor configuration
            tensorBackend: config.tensorBackend ?? null,
            
            // Integration settings
            autoGround: config.autoGround ?? true,
            gradientTracking: config.gradientTracking ?? true,
            cacheInference: config.cacheInference ?? true,
            
            // Resource management
            inferenceCacheSize: config.inferenceCacheSize ?? 1000,
            maxReasoningCycles: config.maxReasoningCycles ?? 100,
            
            ...config
        });

        // Core components
        this.tensorBridge = this.config.tensorBridge || new TensorLogicBridge();
        this.causalReasoner = new CausalReasoner();
        this.senarsBridge = null;
        this.metta = this.config.mettaInterpreter;
        
        // Caches
        this.inferenceCache = new Map();
        this.symbolCache = new Map();
        
        // State
        this.beliefBase = new Map();
        this.goalStack = [];
        this.inferenceHistory = [];
        
        // Metrics
        this.metrics = {
            narseseConversions: 0,
            mettaExecutions: 0,
            tensorOperations: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    async onInitialize() {
        // Initialize SeNARS bridge if available
        try {
            const { SeNARS } = await import('@senars/core');
            this.senarsBridge = new SeNARS(this.config.senarsConfig);
            await this.senarsBridge.start();
            
            this.emit('senars:initialized');
        } catch (e) {
            console.warn('SeNARS not available, using fallback mode:', e.message);
            this.senarsBridge = null;
        }

        // Initialize MeTTa integration
        if (this.metta) {
            this._initializeMettaIntegration();
            this.emit('metta:initialized');
        }

        // Initialize tensor backend
        if (!this.config.tensorBackend) {
            try {
                const { NativeBackend } = await import('@senars/tensor');
                this.tensorBridge.backend = new NativeBackend();
            } catch (e) {
                console.warn('Tensor backend not available, using fallback');
            }
        }

        this.emit('initialized', {
            senars: !!this.senarsBridge,
            metta: !!this.metta,
            tensor: !!this.tensorBridge.backend
        });
    }

    _initializeMettaIntegration() {
        if (!this.metta?.ground) return;

        // Register NARS operations in MeTTa
        this.metta.ground.register('senars-input', async (narsese) => {
            const result = await this.inputNarsese(narsese.toString());
            return result.success ? { type: 'ok', value: true } : { type: 'error', value: result.error };
        });

        this.metta.ground.register('senars-ask', async (question) => {
            const result = await this.askNarsese(question.toString());
            return result ? { type: 'ok', value: result } : { type: 'error', value: 'no_answer' };
        });

        this.metta.ground.register('senars-achieve', async (goal) => {
            const result = await this.achieveGoal(goal.toString());
            return result ? { type: 'ok', value: result } : { type: 'error', value: 'goal_failed' };
        });

        // Register tensor operations
        this.metta.ground.register('tensor-lift', (data, shape) => {
            const tensor = new SymbolicTensor(
                Array.from(data),
                Array.from(shape),
                { requiresGrad: this.config.gradientTracking }
            );
            this.metrics.tensorOperations++;
            return { type: 'tensor', value: tensor };
        });

        this.metta.ground.register('tensor-ground', (symbolicTensor, shape) => {
            const grounded = this.tensorBridge.groundToTensor(
                symbolicTensor,
                Array.from(shape)
            );
            this.metrics.tensorOperations++;
            return { type: 'tensor', value: grounded };
        });

        // Register causal reasoning
        this.metta.ground.register('learn-cause', async (cause, effect, context) => {
            await this.causalReasoner.learn(
                cause.toString(),
                effect.toString(),
                context ? context.toString() : null
            );
            return { type: 'ok', value: true };
        });

        this.metta.ground.register('query-cause', (effect) => {
            const causes = this.causalReasoner.queryCauses(effect.toString());
            return { type: 'list', value: causes };
        });
    }

    // =========================================================================
    // NARS Operations
    // =========================================================================

    /**
     * Input Narsese statement
     */
    async inputNarsese(narsese, options = {}) {
        const { priority = 1.0, confidence = 0.9 } = options;
        this.metrics.narseseConversions++;

        if (this.senarsBridge) {
            try {
                return this.senarsBridge.nar.input(narsese);
            } catch (e) {
                console.warn('SeNARS input failed, using fallback:', e.message);
            }
        }

        // Fallback: store in belief base
        const belief = {
            narsese,
            priority,
            confidence,
            timestamp: Date.now(),
            truth: { frequency: confidence, confidence: 0.8 }
        };
        this.beliefBase.set(narsese, belief);

        return { success: true, belief };
    }

    /**
     * Ask a Narsese question
     */
    async askNarsese(question, options = {}) {
        const { cycles = this.config.maxReasoningCycles, timeout = 5000 } = options;
        this.metrics.narseseConversions++;

        // Check cache
        if (this.config.cacheInference) {
            const cached = this.inferenceCache.get(question);
            if (cached && Date.now() - cached.timestamp < 5000) {
                this.metrics.cacheHits++;
                return cached.result;
            }
            this.metrics.cacheMisses++;
        }

        if (this.senarsBridge) {
            try {
                const result = await this.senarsBridge.ask(question, { cycles });
                if (this.config.cacheInference) {
                    this.inferenceCache.set(question, { result, timestamp: Date.now() });
                }
                return result;
            } catch (e) {
                console.warn('SeNARS ask failed, using fallback:', e.message);
            }
        }

        // Fallback: pattern matching on belief base
        return this._fallbackAsk(question);
    }

    _fallbackAsk(question) {
        // Simple pattern matching for fallback mode
        const questionStr = question.toString();
        const match = questionStr.match(/<(.+?) --> (.+?)>\?/);
        
        if (!match) return null;

        const [, subject, predicate] = match;
        
        // Search belief base for matching statements
        for (const [key, belief] of this.beliefBase) {
            if (key.includes(subject) && key.includes(predicate)) {
                return {
                    term: key,
                    truth: belief.truth,
                    confidence: belief.confidence
                };
            }
        }

        return null;
    }

    /**
     * Achieve a goal using NARS planning
     */
    async achieveGoal(goal, options = {}) {
        const { cycles = this.config.maxReasoningCycles, imagination = true } = options;
        
        if (this.senarsBridge) {
            try {
                return await this.senarsBridge.achieve(goal, { cycles });
            } catch (e) {
                console.warn('SeNARS achieve failed, using fallback:', e.message);
            }
        }

        // Fallback: goal stack management
        this.goalStack.push({ goal, timestamp: Date.now() });
        return { success: true, goal, planned: false };
    }

    // =========================================================================
    // MeTTa Operations
    // =========================================================================

    /**
     * Execute MeTTa program
     */
    async executeMetta(program, options = {}) {
        const { timeout = 5000, context = {} } = options;
        this.metrics.mettaExecutions++;

        if (!this.metta) {
            throw new Error('MeTTa interpreter not available');
        }

        // Add context to program
        const contextBindings = Object.entries(context)
            .map(([k, v]) => `(bind ${k} ${v})`)
            .join('\n');

        const fullProgram = `${contextBindings}\n${program}`;

        try {
            const result = await this.metta.run(fullProgram, { timeout });
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Convert Narsese to MeTTa expression
     */
    narseseToMetta(narsese) {
        // Parse Narsese statement
        const statement = narsese.toString();
        
        // Extract subject and predicate
        const match = statement.match(/<(.+?) --> (.+?)>\.?/);
        if (!match) return statement;

        const [, subject, predicate] = match;
        
        // Convert to MeTTa format
        return `(implies ${this._termToMetta(subject)} ${this._termToMetta(predicate)})`;
    }

    _termToMetta(term) {
        // Handle compound terms
        if (term.includes('(')) {
            return term
                .replace(/<(.+?) --> (.+?)>/g, '(inherits $1 $2)')
                .replace(/\(/g, '(')
                .replace(/\)/g, ')');
        }
        
        // Simple term
        return term.replace(/-->/g, '->');
    }

    /**
     * Convert MeTTa expression to Narsese
     */
    mettaToNarsese(mettaExpr) {
        const expr = mettaExpr.toString();
        
        // Handle implies
        if (expr.includes('implies')) {
            const match = expr.match(/\(implies (.+?) (.+?)\)/);
            if (match) {
                const [, antecedent, consequent] = match;
                return `<${this._mettaToTerm(antecedent)} --> ${this._mettaToTerm(consequent)}>.`;
            }
        }
        
        // Handle inherits
        if (expr.includes('inherits')) {
            const match = expr.match(/\(inherits (.+?) (.+?)\)/);
            if (match) {
                const [, subject, predicate] = match;
                return `<${this._mettaToTerm(subject)} --> ${this._mettaToTerm(predicate)}>.`;
            }
        }
        
        return expr;
    }

    _mettaToTerm(term) {
        return term.trim().replace(/->/g, '-->');
    }

    // =========================================================================
    // Tensor Operations
    // =========================================================================

    /**
     * Lift tensor to symbolic representation
     */
    liftToSymbols(tensor, options = {}) {
        const { threshold = 0.5, annotate = true } = options;
        this.metrics.tensorOperations++;

        const symbolic = this.tensorBridge.liftToSymbols(tensor, { threshold });
        
        if (annotate && this.metta) {
            // Create MeTTa annotations
            const annotations = [];
            for (const [key, symbol] of symbolic.symbols) {
                annotations.push(`(symbol ${key} ${symbol.symbol})`);
            }
            symbolic.annotations = annotations;
        }

        return symbolic;
    }

    /**
     * Ground symbols to tensor
     */
    groundToTensor(symbols, shape, options = {}) {
        const { interpolate = true } = options;
        this.metrics.tensorOperations++;

        return this.tensorBridge.groundToTensor(symbols, shape, { interpolate });
    }

    /**
     * Convert observation tensor to Narsese
     */
    observationToNarsese(observation, options = {}) {
        const { threshold = 0.5, predicates = [] } = options;
        this.metrics.narseseConversions++;

        // Convert to symbolic tensor
        const tensor = new SymbolicTensor(
            Array.isArray(observation) ? observation : Array.from(observation),
            [observation.length]
        );

        // Lift to symbols
        const symbolic = this.liftToSymbols(tensor, { threshold });

        // Generate Narsese statements
        const narsese = [];
        for (const [index, annotation] of symbolic.symbols) {
            const predicate = predicates[index] || `feature_${index}`;
            const truth = annotation.confidence > threshold ? 'true' : 'false';
            narsese.push(`<${predicate} --> observed>. :|:`);
        }

        return narsese.join('\n');
    }

    /**
     * Convert Narsese to tensor representation
     */
    narseseToTensor(narsese, dimensions, options = {}) {
        const { encoding = 'one-hot' } = options;
        this.metrics.narseseConversions++;

        const statements = narsese.split('\n').filter(s => s.trim());
        const tensor = new Float32Array(dimensions);

        for (const statement of statements) {
            // Hash statement to index
            const hash = this._hashStatement(statement, dimensions);
            tensor[hash] = 1.0;
        }

        return new SymbolicTensor(tensor, dimensions, {
            requiresGrad: this.config.gradientTracking
        });
    }

    _hashStatement(statement, dimensions) {
        // Simple hash function for statement → index mapping
        let hash = 0;
        for (let i = 0; i < statement.length; i++) {
            const char = statement.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash) % dimensions;
    }

    // =========================================================================
    // Causal Reasoning
    // =========================================================================

    /**
     * Learn causal relationship from experience
     */
    async learnCausal(transition) {
        const { state, action, nextState, reward } = transition;

        // Convert to symbolic representations
        const stateSymbols = this.liftToSymbols(
            new SymbolicTensor(Array.from(state), [state.length])
        );

        const nextStateSymbols = this.liftToSymbols(
            new SymbolicTensor(Array.from(nextState), [nextState.length])
        );

        // Learn causal graph
        await this.causalReasoner.learn(
            JSON.stringify(stateSymbols.symbols),
            JSON.stringify(nextStateSymbols.symbols),
            JSON.stringify({ action, reward })
        );

        // Update belief base
        const cause = stateSymbols.toNarseseTerm('state');
        const effect = nextStateSymbols.toNarseseTerm('next_state');
        await this.inputNarsese(`<<${cause} &/ ^${action}> ==> ${effect}>.`);
    }

    /**
     * Query causal graph for predictions
     */
    predictCausal(currentState, action) {
        const stateSymbols = this.liftToSymbols(
            new SymbolicTensor(Array.from(currentState), [currentState.length])
        );

        const causes = this.causalReasoner.queryCauses(
            JSON.stringify(stateSymbols.symbols)
        );

        return {
            predictedState: causes,
            confidence: causes.length > 0 ? 0.8 : 0.5,
            symbolic: stateSymbols
        };
    }

    // =========================================================================
    // Integrated Operations
    // =========================================================================

    /**
     * Complete perception-action cycle with all three systems
     */
    async perceiveReasonAct(observation, options = {}) {
        const {
            useNARS = true,
            useMeTTa = true,
            useTensor = true,
            exploration = 0.1,
            goal = null
        } = options;

        // 1. Perception: Convert observation to all representations
        const tensorObs = new SymbolicTensor(
            Array.isArray(observation) ? observation : Array.from(observation),
            [observation.length]
        );

        const symbolic = this.liftToSymbols(tensorObs);
        const narsese = this.observationToNarsese(observation);

        // 2. Reasoning: Run NARS inference
        let reasoningResult = null;
        if (useNARS && this.senarsBridge) {
            await this.inputNarsese(narsese);
            if (goal) {
                await this.inputNarsese(goal);
            }
            await this.senarsBridge?.runCycles(50);
            
            if (goal) {
                reasoningResult = await this.askNarsese('<(?action) --> candidate_action>?');
            }
        }

        // 3. Policy: Execute MeTTa/tensor policy
        let policyResult = null;
        if (useMeTTa && this.metta) {
            const policyProgram = `(agent-act ${JSON.stringify(symbolic.symbols)})`;
            const result = await this.executeMetta(policyProgram);
            if (result.success) {
                policyResult = result.result;
            }
        }

        // 4. Action selection: Combine reasoning and policy
        let action;
        if (reasoningResult && policyResult) {
            // Hybrid: use reasoning to guide policy
            action = this._combineReasoningAndPolicy(reasoningResult, policyResult, exploration);
        } else if (reasoningResult) {
            action = this._extractActionFromReasoning(reasoningResult, exploration);
        } else if (policyResult) {
            action = this._extractActionFromPolicy(policyResult, exploration);
        } else {
            // Fallback: random action
            action = Math.floor(Math.random() * observation.length);
        }

        return {
            action,
            reasoning: reasoningResult,
            policy: policyResult,
            symbolic,
            narsese
        };
    }

    _combineReasoningAndPolicy(reasoning, policy, exploration) {
        // Use reasoning to bias policy selection
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * 4);
        }

        // Extract action from reasoning if available
        if (reasoning?.substitution?.['?action']) {
            const actionStr = reasoning.substitution['?action'].toString();
            const match = actionStr.match(/op_(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }

        // Fall back to policy
        return this._extractActionFromPolicy(policy, 0);
    }

    _extractActionFromReasoning(reasoning, exploration) {
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * 4);
        }

        if (reasoning?.substitution?.['?action']) {
            const actionStr = reasoning.substitution['?action'].toString();
            const match = actionStr.match(/op_(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }

        return Math.floor(Math.random() * 4);
    }

    _extractActionFromPolicy(policy, exploration) {
        if (Math.random() < exploration) {
            return Math.floor(Math.random() * 4);
        }

        // Parse policy result
        if (Array.isArray(policy)) {
            return policy[0] || 0;
        }

        const policyStr = policy.toString();
        const val = parseFloat(policyStr);
        return isNaN(val) ? 0 : Math.floor(val);
    }

    // =========================================================================
    // State Management
    // =========================================================================

    /**
     * Get comprehensive bridge state
     */
    getState() {
        return {
            beliefs: Array.from(this.beliefBase.values()),
            goals: this.goalStack,
            causalGraph: this.causalReasoner.getGraph(),
            metrics: { ...this.metrics },
            senarsActive: !!this.senarsBridge,
            mettaActive: !!this.metta
        };
    }

    /**
     * Clear caches and temporary state
     */
    clear() {
        this.inferenceCache.clear();
        this.symbolCache.clear();
        this.goalStack = [];
        this.metrics = {
            narseseConversions: 0,
            mettaExecutions: 0,
            tensorOperations: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    async onShutdown() {
        await this.senarsBridge?.stop();
        this.clear();
    }
}

/**
 * Factory for creating specialized bridge configurations
 */
export class NeuroSymbolicBridgeFactory {
    /**
     * Create bridge optimized for reasoning
     */
    static createReasoningFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 200,
            cacheInference: true,
            inferenceCacheSize: 2000,
            useNARS: true,
            useMeTTa: false,
            useTensor: false
        });
    }

    /**
     * Create bridge optimized for policy execution
     */
    static createPolicyFocused(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false,
            useNARS: false,
            useMeTTa: true,
            useTensor: true
        });
    }

    /**
     * Create balanced bridge with all capabilities
     */
    static createBalanced(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 50,
            cacheInference: true,
            inferenceCacheSize: 1000,
            useNARS: true,
            useMeTTa: true,
            useTensor: true
        });
    }

    /**
     * Create minimal bridge for resource-constrained environments
     */
    static createMinimal(config = {}) {
        return new NeuroSymbolicBridge({
            ...config,
            maxReasoningCycles: 10,
            cacheInference: false,
            gradientTracking: false,
            useNARS: false,
            useMeTTa: true,
            useTensor: false
        });
    }
}
