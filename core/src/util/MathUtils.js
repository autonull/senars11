export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalize = (value, max) => Math.min(value / max, 1);
export const isBetween = (value, min, max) => value >= min && value <= max;

export const clampAndFreeze = (obj, min = 0, max = 1) =>
    typeof obj === 'number'
        ? Object.freeze(clamp(obj, min, max))
        : Object.freeze(Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key,
                typeof value === 'number' ? clamp(value, min, max) : value
            ])
        ));

export const isNumber = value => typeof value === 'number' && !isNaN(value);
export const round = (value, decimals = 2) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);

export const formatNumber = (num, decimals = 2) =>
    typeof num === 'number' ? num.toFixed(decimals) : String(num ?? '0');
