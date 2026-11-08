/**
 * Identifier helpers shared by the client generator.
 *
 * The rules mirror what the SDK generator the project used before: words are
 * split on non-alphanumerics, a leading digit run is split from the letters
 * that follow it, and an identifier that would start with a digit gets a `_`
 * prefix.
 */

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const RESERVED_WORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "await",
  "async",
  "arguments",
  "eval",
]);

const PREDEFINED_TYPE_NAMES = new Set([
  "string",
  "number",
  "boolean",
  "any",
  "unknown",
  "never",
  "object",
  "void",
  "null",
  "undefined",
  "symbol",
  "bigint",
]);

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name);
}

/** Split a free-form string into words. */
export function splitWords(input: string): string[] {
  const words: string[] = [];
  for (const token of input.split(/[^A-Za-z0-9]+/)) {
    if (!token) continue;
    const match = /^(\d+)([A-Za-z].*)$/.exec(token);
    if (match) {
      words.push(match[1], match[2]);
    } else {
      words.push(token);
    }
  }
  return words;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function lowerFirst(word: string): string {
  // An all-caps word such as "GET" reads better fully lowercased.
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word.toLowerCase();
  }
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/** `find pet by id` → `findPetById`; `123numericLead` → `_123NumericLead`. */
export function toCamelCase(input: string): string {
  const words = splitWords(input);
  if (words.length === 0) return "";
  const joined = words
    .map((word, index) => (index === 0 ? lowerFirst(word) : capitalize(word)))
    .join("");
  return /^\d/.test(joined) ? `_${joined}` : joined;
}

/** Name of a function generated for an operation. */
export function toFunctionName(input: string): string {
  const name = toCamelCase(input);
  if (!name) return "operation";
  return RESERVED_WORDS.has(name) ? `${name}_` : name;
}

/** Name of a type generated from a schema key. */
export function toTypeName(input: string): string {
  let name = input;
  if (!isValidIdentifier(name)) {
    const words = splitWords(input);
    name = words.map(capitalize).join("");
    if (!name) name = "Schema";
    if (/^\d/.test(name)) name = `_${name}`;
  }
  if (PREDEFINED_TYPE_NAMES.has(name) || RESERVED_WORDS.has(name)) {
    name = capitalize(name);
  }
  return name;
}

/** Build a camelCase name for an operation that has no operationId. */
export function nameFromPath(method: string, path: string): string {
  const parts = [method.toLowerCase()];
  for (const segment of path.split("/")) {
    if (!segment) continue;
    const param = /^\{(.+)\}$/.exec(segment);
    if (param) {
      parts.push("By", ...splitWords(param[1]).map(capitalize));
    } else {
      parts.push(...splitWords(segment).map(capitalize));
    }
  }
  return parts.join(" ");
}

/** Object key, quoted only when it is not a valid identifier. */
export function propertyKey(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

/** Make `base` unique inside `used` by appending a counter. */
export function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  let counter = 2;
  while (used.has(name)) {
    name = `${base}${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}

/** Name for an enum member generated from its value. */
export function toEnumMemberName(value: unknown): string {
  if (value === null) return "Null";
  const text = String(value);
  const words = splitWords(text);
  let name = words.map(capitalize).join("");
  if (!name) name = text === "" ? "Empty" : "Value";
  if (/^\d/.test(name)) name = `_${name}`;
  return name;
}

export { capitalize as capitalizeFirst };
