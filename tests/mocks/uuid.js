const crypto = await import('crypto');

export const v1 = () => crypto.randomUUID();
export const v3 = () => crypto.randomUUID();
export const v4 = () => crypto.randomUUID();
export const v5 = () => crypto.randomUUID();
export const v6 = () => crypto.randomUUID();
export const v7 = () => crypto.randomUUID();
export const NIL = '00000000-0000-0000-0000-000000000000';
export const parse = (uuid) => uuid;
export const stringify = (arr) => arr;
export const validate = (uuid) => typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
export const version = (uuid) => parseInt(uuid.split('-')[2]?.[0], 16);
