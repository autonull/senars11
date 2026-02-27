export const getWithDefaultSet = (map, key) => {
    return map.get(key) ?? map.set(key, new Set()).get(key);
};

export const getOrDefault = (map, key, defaultValue) => {
    return map.get(key) ?? defaultValue;
};

export const getOrCreate = (map, key, creatorFn) => {
    return map.get(key) ?? map.set(key, creatorFn()).get(key);
};

export const addToMapSet = (map, key, item) => {
    return getWithDefaultSet(map, key).add(item);
};

export const removeFromMapSet = (map, key, item) => {
    const set = map.get(key);
    if (set) {
        set.delete(item);
        if (set.size === 0) map.delete(key);
    }
};

export const hasInMapSet = (map, key, item) => {
    const set = map.get(key);
    return set?.has(item) ?? false;
};

export const getMultipleFromMap = (map, keys) => {
    return keys.flatMap(key => map.get(key) ?? []);
};

export const collectTasksFromAllConcepts = (memory, filterFn = null) => {
    return memory.getAllConcepts()
        .flatMap(concept => filterFn ? concept.getAllTasks().filter(filterFn) : concept.getAllTasks());
};