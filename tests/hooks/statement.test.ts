import { describe, expect, it } from "vitest";
import {
  printStatements,
  referencedNames,
  type Statement,
  statementCode,
} from "../../src/hooks/statement.mjs";

const keyConst: Statement = {
  kind: "const",
  name: "useFindPetsKey",
  initializer: '"FindPets"',
};
const resultType: Statement = {
  kind: "type",
  name: "FindPetsQueryResult",
  typeParameters: [
    { name: "TData", default: "FindPetsDefaultResponse" },
    { name: "TError", default: "unknown" },
  ],
  type: "UseQueryResult<TData, TError>",
};

describe("statementCode", () => {
  it("should print an exported const", () => {
    expect(statementCode(keyConst)).toBe(
      'export const useFindPetsKey = "FindPets";',
    );
  });

  it("should print an exported type alias with its type parameters", () => {
    expect(statementCode(resultType)).toBe(
      "export type FindPetsQueryResult<TData = FindPetsDefaultResponse, TError = unknown> = UseQueryResult<TData, TError>;",
    );
  });

  it("should print a type alias without type parameters", () => {
    expect(statementCode({ kind: "type", name: "A", type: "Awaited<B>" })).toBe(
      "export type A = Awaited<B>;",
    );
  });

  it("should leave the JSDoc out", () => {
    expect(statementCode({ ...keyConst, jsDoc: "/** Finds pets. */" })).toBe(
      'export const useFindPetsKey = "FindPets";',
    );
  });
});

describe("printStatements", () => {
  it("should put a blank line where the kind changes", () => {
    expect(
      printStatements([resultType, resultType, keyConst, keyConst, resultType]),
    ).toBe(
      [
        statementCode(resultType),
        statementCode(resultType),
        "",
        statementCode(keyConst),
        statementCode(keyConst),
        "",
        statementCode(resultType),
        "",
      ].join("\n"),
    );
  });

  it("should put the JSDoc above its declaration", () => {
    expect(
      printStatements([
        { ...keyConst, jsDoc: "/**\n * Finds pets.\n */" },
        keyConst,
      ]),
    ).toBe(
      [
        "/**",
        " * Finds pets.",
        " */",
        statementCode(keyConst),
        statementCode(keyConst),
        "",
      ].join("\n"),
    );
  });

  it("should print nothing for no statements", () => {
    expect(printStatements([])).toBe("");
  });
});

describe("referencedNames", () => {
  it("should collect identifiers", () => {
    expect(
      referencedNames(
        "(clientOptions: Options<FindPetsData, true>) => findPets(clientOptions)",
      ),
    ).toEqual(
      new Set(["clientOptions", "Options", "FindPetsData", "true", "findPets"]),
    );
  });

  it("should skip what stands in a string literal", () => {
    const names = referencedNames(
      `Omit<A, "queryKey" | 'queryFn'> & { "next-page": \`Pet \${1}\` }; const k = "say \\"Pet\\"";`,
    );
    expect(names).toEqual(new Set(["Omit", "A", "const", "k"]));
  });

  it("should skip the name after the dot of a member access", () => {
    const names = referencedNames(
      "Common.UseFindPetsKeyFn(a).then(response => response.data)?.next",
    );
    expect(names).toEqual(new Set(["Common", "a", "response"]));
  });

  it("should keep the name after a spread", () => {
    expect(referencedNames("{ ...options, ...Common.x }")).toEqual(
      new Set(["options", "Common"]),
    );
  });
});
