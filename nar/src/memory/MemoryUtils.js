export const getWithDefaultSet = (map, key) => map.get(key) ?? map.set(key, new Set()).get(key);

export const getOrDefault = (map, key, defaultValue) => map.get(key) ?? defaultValue;

export const getOrCreate = (map, key, creatorFn) => map.get(key) ?? map.set(key, creatorFn()).get(key);

export const addToMapSet = (map, key, item) => getWithDefaultSet(map, key).add(item);

export const removeFromMapSet = (map, key, item) => {
    const set = map.get(key);
    if (set) {
        set.delete(item);
        if (set.size === 0) {
            map.delete(key);
        }
    }
};

export const hasInMapSet = (map, key, item) => map.get(key)?.has(item) ?? false;

export const getMultipleFromMap = (map, keys) => keys.flatMap(key => map.get(key) ?? []);

export const collectTasksFromAllConcepts = (memory, filterFn = null) =>
    memory.getAllConcepts().flatMap(concept => filterFn ? concept.getAllTasks().filter(filterFn) : concept.getAllTasks());