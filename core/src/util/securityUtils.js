const SECRET_PATTERN = /(password|token|key|secret|auth|api)[=:]\s*[^\s\n\r]+/gi;
const SECRET_REPLACEMENT = '$1=[REDACTED]';

export const sanitizeOutput = (output) =>
    typeof output === 'string' ? output.replace(SECRET_PATTERN, SECRET_REPLACEMENT) : output;
