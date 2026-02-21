
// Composable skill repository
export class SkillLibrary {
    constructor() {
        this.skills = new Map();
    }

    /**
     * Register a new skill.
     * @param {string} name
     * @param {*} skill
     */
    register(name, skill) {
        this.skills.set(name, skill);
    }

    /**
     * Retrieve a skill by name.
     * @param {string} name
     * @returns {*} skill
     */
    get(name) {
        return this.skills.get(name);
    }

    /**
     * List available skills for a given context.
     * @param {*} context
     * @returns {Array<string>} list of skill names
     */
    available(context) {
        return Array.from(this.skills.keys());
    }
}
