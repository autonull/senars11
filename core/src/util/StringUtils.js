export const capitalize = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
export const kebabCase = str => str?.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() ?? '';
export const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/^["']|["']$/g, '').replace(/[.,;!?]+$/, '').trim();
};
export const isValidLength = (text, min, max) =>
    text && text.length >= min && text.length <= max;
