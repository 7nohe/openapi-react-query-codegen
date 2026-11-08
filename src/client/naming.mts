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
  "initialPageParam",
  "mutationKey",
  "options",
  "pageParam",
  "queryClient",
  "queryKey",
  "queryOptions",
  "response",
  "useInfiniteQuery",
  "useMutation",
  "useQuery",
  "useSuspenseInfiniteQuery",
  "useSuspenseQuery",
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
  return RESERVED_WORDS.has(name) || RESERVED_FUNCTION_NAMES.has(name)
    ? `${name}_`
    : name;
}

/**
 * Name of a type generated from a schema key, in PascalCase. Acronyms are
 * folded like any other word (`FineTuneDPOHyperparameters` →
 * `FineTuneDpoHyperparameters`, `account_annual_revenue` →
 * `AccountAnnualRevenue`), which is what the v3 generator did, so existing
 * imports of schema types keep working.
 */
export function toTypeName(input: string): string {
  const words = splitWords(
    input
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2"),
  );
  let name = words.map((word) => capitalize(word.toLowerCase())).join("");
  if (!name) name = "Schema";
  if (/^\d/.test(name)) name = `_${name}`;
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

/**
 * Name for an enum member generated from its value, in UPPER_SNAKE_CASE
 * (`in-progress` → `IN_PROGRESS`). A name that would start with a digit gets a
 * `_` prefix, except an all-digit name when `numericKeys` is set (valid as an
 * object key, so `{ 1: 1 }` stays readable).
 */
export function toEnumMemberName(
  value: unknown,
  options: { numericKeys?: boolean } = {},
): string {
  if (value === null) return "NULL";
  const text = String(value);
  const words = text
    .split(/[^A-Za-z0-9]+/)
    .flatMap((word) => word.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .filter(Boolean);
  let name = words.map((word) => word.toUpperCase()).join("_");
  if (!name) name = text === "" ? "EMPTY" : "VALUE";
  if (/^\d/.test(name) && !(options.numericKeys && /^\d+$/.test(name))) {
    name = `_${name}`;
  }
  return name;
}

export { capitalize as capitalizeFirst };
