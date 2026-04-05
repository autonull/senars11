export class SkillResult {
    static REQUIRED = ['skill', 'success'];

    constructor({ skill, success, data, error, result } = {}) {
        this.skill = skill;
        this.success = success !== false && error == null;
        this.data = data ?? result ?? (this.success ? null : undefined);
        this.result = this.data;
        this.error = error ?? (this.success ? null : undefined);
    }

    static ok(skill, data) {
        return new SkillResult({ skill, success: true, data });
    }

    static fail(skill, error) {
        return new SkillResult({ skill, success: false, error });
    }
}
