/** Escapes a value for interpolation inside a single-quoted QBO query string literal. */
export const escapeQboLiteral = (value: string) => value.replace(/[\\']/g, '\\$&')
