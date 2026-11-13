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

/**
 * Names generated code already uses wherever it calls an operation: the client
 * instance, the TanStack helpers the hook files import, and the parameters and
 * locals of the generated hooks. A function with one of these names could not
 * be called there.
 */
const RESERVED_FUNCTION_NAMES = new Set([
  "client",
  "clientOptions",
  "infiniteQueryOptions",
  "mutationKey",
  "options",
  "pageParam",
  "queryClient",
  "queryKey",
  "queryOptions",
  "signal",
  "undefined",
  "useInfiniteQuery",
  "useMutation",
  "useQuery",
  "useSuspenseInfiniteQuery",
  "useSuspenseQuery",
]);

export function isValidIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const SEPARATORS = "_.$+:\\- `\\\\[\\](){}/";
const LEADING_SEPARATORS = new RegExp(`^[${SEPARATORS}]+`);
const SEPARATED = new RegExp(`[${SEPARATORS}]+([\\p{L}\\p{N}_]|$)`, "gu");
/** The last capital of an acronym, when its `s` starts a word (`APIs2` → `AP-Is2`). */
const ACRONYM_THEN_S = new RegExp(
  `(?<=[^-]\\p{Lu})(\\p{Lu})(?=s[${SEPARATORS}]*[^\\p{Lu}${SEPARATORS}])`,
  "gu",
);

/**
 * Mark where the words of a name start: a lowercase letter before a capital,
 * and a capital before a lowercase letter, so `getHTTPStatus` becomes
 * `get-HTTP-Status`. A plural acronym at the end of a word stays whole (`APIs`).
 */
function markWords(input: string): string {
  return input
    .replace(/(\p{Ll})(?=\p{Lu})/gu, "$1-")
    .replace(/(?<!^)(\p{Lu})(?=(?!s)\p{Ll})/gu, "-$1")
    .replace(ACRONYM_THEN_S, "-$1");
}

/**
 * `find pet by id` → `findPetById`; `getHTTPStatus` → `getHttpStatus`;
 * `123numericLead` → `_123NumericLead`. Acronyms are folded like any other word
 * and other characters become `_`, which is what the v3 generator did, so
 * existing imports keep working.
 */
export function toCamelCase(input: string): string {
  const joined = markWords(input.trim())
    .replace(LEADING_SEPARATORS, "")
    .toLowerCase()
    .replace(/\d+\p{Ll}(?![_\-.])/gu, (match) => match.toUpperCase())
    .replace(SEPARATED, (_match, next: string) => next.toUpperCase())
    .replace(/[^\p{ID_Continue}]/gu, "_");
  if (!/[\p{L}\p{N}]/u.test(joined)) return "";
  return /^\d/.test(joined) ? `_${joined}` : joined;
}

/** Name of a function generated for an operation. */
export function toFunctionName(input: string): string {
  const name = toCamelCase(input);
  if (!name) return "operation";
  return RESERVED_WORDS.has(name) || RESERVED_FUNCTION_NAMES.has(name)
    ? `${name}_`
    : name;
}

/**
 * Name of a type generated from a schema key: the PascalCase form of the same
 * name (`FineTuneDPOHyperparameters` → `FineTuneDpoHyperparameters`,
 * `account_annual_revenue` → `AccountAnnualRevenue`).
 */
export function toTypeName(input: string): string {
  const name = capitalize(toCamelCase(input)).replace(
    /(\d)(\p{Lu})$/u,
    (_match, digit: string, letter: string) => digit + letter.toLowerCase(),
  );
  return name || "Schema";
}

/** Build a camelCase name for an operation that has no operationId. */
export function nameFromPath(method: string, path: string): string {
  return toCamelCase(`${method} ${path.replace(/\{([^{}]+)\}/g, " By $1 ")}`);
}

/** Object key, quoted only when it is not a valid identifier. */
export function propertyKey(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

/**
 * Make `base` unique inside `used` by appending a counter. A name in `taken`
 * is passed over as well; `taken` itself is left as it is.
 */
export function uniqueName(
  base: string,
  used: Set<string>,
  taken?: ReadonlySet<string>,
): string {
  let name = base;
  let counter = 2;
  while (used.has(name) || taken?.has(name)) {
    name = `${base}${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}

/**
 * Name for an enum member generated from its value, in UPPER_SNAKE_CASE
 * (`in-progress` → `IN_PROGRESS`). A number gets a `_` prefix, except when
 * `numericKeys` is set (valid as an object key, so `{ 1: 1 }` stays readable).
 * The result can need quoting (`-X`, `2A`).
 */
export function toEnumMemberName(
  value: unknown,
  options: { numericKeys?: boolean } = {},
): string {
  if (value === null) return "NULL";
  const name = markWords(String(value).trim())
    .toUpperCase()
    .replace(new RegExp(`(?<!^)[${SEPARATORS}]+`, "g"), "_")
    .replace(/_$/, "");
  return /^-?\d+$/.test(name) && !options.numericKeys ? `_${name}` : name;
}

export { capitalize as capitalizeFirst };
