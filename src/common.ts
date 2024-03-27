export const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const lowercaseFirstLetter = (str: string) => {
  return str.charAt(0).toLowerCase() + str.slice(1);
};

/**
 * Safely parse a string into a number. Checks for NaN and Infinity.
 * Returns NaN if the string is not a valid number.
 * @param str The string to parse.
 * @returns The parsed number or NaN if the string is not a valid number.
 */
export function safeParseNumber(str: string): number {
  const parsed = Number(str);
  if (!isNaN(parsed) && isFinite(parsed)) {
    return parsed;
  }
  return NaN;
}
