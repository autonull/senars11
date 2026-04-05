import { mergeConfig } from '../../utils/ConfigHelper.js';
import { CognitiveModule } from './CognitiveModule.js';
import { SkillExtractor } from '../../experience/ExperienceSystem.js';

const SKILL_DEFAULTS = { skillExtractor: null, skillLibrary: null };

export class SkillModule extends CognitiveModule {
    constructor(config = {}) {
        super(mergeConfig(SKILL_DEFAULTS, { name: 'SkillModule', ...config }));
        this._config.skillExtractor ??= new SkillExtractor();
        this._config.skillLibrary ??= new Map();
        this.activeSkill = null;
        this.skillUsage = new Map();
    }
    async process(input, context = {}) {
        const { state, extractSkills = false } = context;
        if (extractSkills && context.episodes) {await this.extractSkills(context.episodes);}
        const selectedSkill = this.selectSkill(state);
        if (selectedSkill) {
            this.activeSkill = selectedSkill;
            const usage = this.skillUsage.get(selectedSkill.name) ?? 0;
            this.skillUsage.set(selectedSkill.name, usage + 1);
        }
        return { activeSkill: this.activeSkill, availableSkills: Array.from(this.config.skillLibrary.keys()) };
    }
    async extractSkills(episodes) {
        const skills = this.config.skillExtractor.extractSkills(episodes);
        skills.forEach(skill => { this.config.skillLibrary.set(skill.name, skill); this.emit('skillDiscovered', skill); });
        return skills;
    }
    selectSkill(state) {
        const lib = this.config.skillLibrary;
        if (!lib || !(lib instanceof Map)) {return null;}
        const applicable = Array.from(lib.values()).filter(skill => skill.precondition?.(state));
        if (applicable.length === 0) {return null;}
        applicable.sort((a, b) => (this.skillUsage.get(b.name) ?? 0) - (this.skillUsage.get(a.name) ?? 0));
        return applicable[0];
    }
    getSkill(name) { return this.config.skillLibrary.get(name); }
    getSkillStats() { return { totalSkills: this.config.skillLibrary.size, usage: Object.fromEntries(this.skillUsage) }; }
}
