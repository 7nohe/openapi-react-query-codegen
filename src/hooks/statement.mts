/** An exported `const` of a generated file. */
export type ConstStatement = {
  kind: "const";
  name: string;
  /** The expression after `=`. */
  initializer: string;
  /** A complete JSDoc comment to put above the declaration. */
  jsDoc?: string;
};

/** An exported type alias of a generated file. */
export type TypeStatement = {
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

// A string literal, a spread, a member access, an identifier, or any other
// character. The last one only matters as what comes before an identifier.
const TOKEN =
  /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\.\.\.|\.\s*[\p{ID_Start}_$][\p{ID_Continue}$]*|[\p{ID_Start}_$][\p{ID_Continue}$]*|\S/gu;
const IDENTIFIER_START = /^[\p{ID_Start}_$]/u;
/** What follows the key of a property or the name of a parameter. */
const KEY_END = /\s*\??:/y;

/**
 * The identifiers a piece of generated code refers to. Three places hold a
 * name without referring to anything a file could import, and are left out:
 * a string literal, the name after the dot of a member access, and the key of
 * a property or the name of a parameter (`{ page: 1 }`, `(options?: T)`).
 */
export function referencedNames(code: string): Set<string> {
  const names = new Set<string>();
  let previous = "";
  for (const match of code.matchAll(TOKEN)) {
    const [token] = match;
    if (IDENTIFIER_START.test(token)) {
      KEY_END.lastIndex = match.index + token.length;
      const isKey =
        (previous === "{" || previous === "," || previous === "(") &&
        KEY_END.test(code);
      if (!isKey) {
        names.add(token);
      }
    }
    previous = token;
  }
  return names;
}
