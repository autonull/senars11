import { OperationHelpers } from './OperationHelpers.js';
import { Space } from '../Space.js';
import { match } from '../Reduce.js';
import { sym, exp } from '../Term.js';

const error = (...args) => exp(sym('Error'), args);
const getSpace = (ctx, spaceId) => ctx?.spaces?.get(spaceId?.name);
const validateContext = ctx => ctx?.spaces ? null : error(sym('NoContext'));
const validateSpace = (ctx, spaceId) => {
    const err = validateContext(ctx);
    if (err) return err;
    const space = getSpace(ctx, spaceId);
    return space ? null : error(spaceId, sym('SpaceNotFound'));
};

export function registerSpaceOps(registry, interpreterContext) {
    registry.register('&add-atom', (s, a) => (s.add(a), a));
    registry.register('&rm-atom', (s, a) => s.remove(a));
    registry.register('&get-atoms', s => OperationHelpers.listify(s.all()));

    registry.register('new-space', () => {
        const newSpace = new Space();
        const id = `space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        interpreterContext?.spaces?.set(id, newSpace);
        return sym(id);
    });

    registry.register('add-atom-to', (spaceId, atom) => {
        const err = validateSpace(interpreterContext, spaceId);
        if (err) return err;
        getSpace(interpreterContext, spaceId).add(atom);
        return sym('ok');
    });

    registry.register('match-in', (spaceId, pattern, template) => {
        const err = validateSpace(interpreterContext, spaceId);
        if (err) return err;
        return OperationHelpers.listify(match(getSpace(interpreterContext, spaceId), pattern, template));
    }, { lazy: true });

    registry.register('merge-spaces', (sourceId, targetId) => {
        const err = validateContext(interpreterContext);
        if (err) return err;
        const source = getSpace(interpreterContext, sourceId);
        const target = getSpace(interpreterContext, targetId);
        if (!source || !target) return error(sym('SpaceNotFound'));
        source.all().forEach(atom => target.add(atom));
        return sym('ok');
    });
}
