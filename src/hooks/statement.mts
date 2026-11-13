/** What a statement's code needs imported from the generated client. */
type References = {
  /** The SDK function the code calls or takes the type of. */
  service?: string;
  /** The types from `types.gen` the code names. */
  models?: string[];
};

/** An exported `const` of a generated file. */
export type ConstStatement = References & {
  kind: "const";
  name: string;
  /** The expression after `=`. */
  initializer: string;
  /** A complete JSDoc comment to put above the declaration. */
  jsDoc?: string;
};

/** An exported type alias of a generated file. */
export type TypeStatement = References & {
  kind: "type";
  name: string;
  typeParameters?: Array<{ name: string; default: string }>;
  type: string;
};

export type Statement = ConstStatement | TypeStatement;

/** The declaration itself, without its JSDoc. */
export function statementCode(statement: Statement): string {
  if (statement.kind === "const") {
    return `export const ${statement.name} = ${statement.initializer};`;
  }
  const typeParameters = statement.typeParameters?.length
    ? `<${statement.typeParameters
        .map((parameter) => `${parameter.name} = ${parameter.default}`)
        .join(", ")}>`
    : "";
  return `export type ${statement.name}${typeParameters} = ${statement.type};`;
}

/**
 * One statement per line, with a blank line wherever a `const` follows a type
 * alias or the other way round.
 */
export function printStatements(statements: Statement[]): string {
  let text = "";
  statements.forEach((statement, index) => {
    if (index > 0 && statements[index - 1].kind !== statement.kind) {
      text += "\n";
    }
    if (statement.kind === "const" && statement.jsDoc) {
      text += `${statement.jsDoc}\n`;
    }
    text += `${statementCode(statement)}\n`;
  });
  return text;
}

// A comment, a string literal, a spread, a member access, an identifier (the
// one group), or any other character. The last only matters as what precedes
// an identifier.
const TOKEN =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\.\.\.|\.\s*[\p{ID_Start}_$][\p{ID_Continue}$]*|([\p{ID_Start}_$][\p{ID_Continue}$]*)|\S/gu;
/** What precedes the key of a property or the name of a parameter. */
const KEY_START = new Set(["{", ",", "(", ";"]);
/** What follows one. */
const KEY_END = /\s*\??:/y;

/**
 * The identifiers a piece of generated code mentions. Some places hold a name
 * without referring to anything a file could import, and are left out: a
 * comment, a string literal, the name after the dot of a member access, and
 * the key of a property or the name of a parameter (`{ page: 1 }`,
 * `(options?: T)`).
 */
export function referencedNames(code: string): Set<string> {
  const names = new Set<string>();
  let previous = "";
  for (const match of code.matchAll(TOKEN)) {
    const [token, identifier] = match;
    if (token.startsWith("/*") || token.startsWith("//")) {
      continue;
    }
    if (identifier !== undefined) {
      KEY_END.lastIndex = match.index + token.length;
      const isKey = KEY_START.has(previous) && KEY_END.test(code);
      if (!isKey) {
        names.add(identifier);
      }
    }
    previous = token;
  }
  return names;
}
