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

const TOKEN =
  /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\.\.\.|\.\s*[\p{ID_Start}_$][\p{ID_Continue}$]*|[\p{ID_Start}_$][\p{ID_Continue}$]*/gu;
const IDENTIFIER_START = /^[\p{ID_Start}_$]/u;

/**
 * The identifiers a piece of generated code mentions. What stands in a string
 * literal or after the dot of a member access is not a reference to anything a
 * file could import, so it is left out.
 */
export function referencedNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const [token] of code.matchAll(TOKEN)) {
    if (IDENTIFIER_START.test(token)) {
      names.add(token);
    }
  }
  return names;
}
