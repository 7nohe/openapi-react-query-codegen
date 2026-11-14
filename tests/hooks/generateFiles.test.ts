import { describe, expect, it } from "vitest";
import { generateAllFiles } from "../../src/hooks/generateFiles.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const query: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  dataTypeName: "FindPetsData",
  errorTypeName: "FindPetsError",
  httpMethod: "GET",
  jsDoc: "/**\n * Lists every Pet, see NewPet and response.\n */",
  allParamsOptional: true,
  isPaginatable: false,
};

// Named like a local of the generated hooks, which the other files mention.
const mutation: OperationInfo = {
  methodName: "response",
  capitalizedMethodName: "Response",
  dataTypeName: "ResponseData",
  httpMethod: "POST",
  allParamsOptional: false,
  isPaginatable: false,
};

const ctx: GenerationContext = {
  client: "fetch",
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  omitInitialPageParam: false,
  version: "1.0.0",
};

const importsOf = (files: { name: string; content: string }[], name: string) =>
  files
    .find((file) => file.name === name)
    ?.content.split("\n")
    .filter((line) => line.startsWith("import "));

describe("generateAllFiles", () => {
  const files = generateAllFiles([query, mutation], ctx);

  it("should import only what the code of a file refers to", () => {
    expect(importsOf(files, "queries.ts")).toEqual([
      'import { useMutation, type UseMutationOptions, useQuery, type UseQueryOptions } from "@tanstack/react-query";',
      'import { findPets, type Options, response } from "../requests/sdk.gen";',
      'import type { FindPetsData, FindPetsError, ResponseData } from "../requests/types.gen";',
      'import * as Common from "./common";',
    ]);
  });

  it("should not import a service whose name only matches a local", () => {
    // suspense.ts has no mutations, but every hook in it has a `response`.
    expect(importsOf(files, "suspense.ts")).toEqual([
      'import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";',
      'import { findPets, type Options } from "../requests/sdk.gen";',
      'import type { FindPetsData, FindPetsError } from "../requests/types.gen";',
      'import * as Common from "./common";',
    ]);
  });

  it("should import only the models a statement declares", () => {
    // ensureQueryData.ts names the Data type but not the Error type.
    expect(importsOf(files, "ensureQueryData.ts")).toContain(
      'import type { FindPetsData } from "../requests/types.gen";',
    );
    // common.ts names the Data type of a query (in its key function) only.
    expect(importsOf(files, "common.ts")).toContain(
      'import type { FindPetsData } from "../requests/types.gen";',
    );
  });

  it("should leave a file with nothing to export as a bare import", () => {
    expect(
      files.find((file) => file.name === "infiniteQueries.ts")?.content,
    ).toBe(
      '// generated with @7nohe/openapi-react-query-codegen@1.0.0 \n\nimport "../requests/sdk.gen";\n',
    );
  });

  it("should carry the import extension into every relative import", () => {
    const js = generateAllFiles([query, mutation], {
      ...ctx,
      importExtension: ".js",
    });
    expect(importsOf(js, "queries.ts")?.slice(1)).toEqual([
      'import { findPets, type Options, response } from "../requests/sdk.gen.js";',
      'import type { FindPetsData, FindPetsError, ResponseData } from "../requests/types.gen.js";',
      'import * as Common from "./common.js";',
    ]);
    expect(js.find((file) => file.name === "index.ts")?.content).toContain(
      'export * from "./common.js";',
    );
  });

  // The page parameter's type is text from the specification: its keys and
  // its comments can spell anything, and only what it refers to is imported.
  it("should import the models of the page type, not what its text spells", () => {
    const paginated = generateAllFiles(
      [
        {
          ...query,
          isPaginatable: true,
          pageParamType:
            "{\n  /**\n   * A Page token, see QueryClient.\n   */\n  Size?: number;\n  Cursor?: Cursor;\n}",
          pageParamModels: ["Cursor"],
        },
      ],
      { ...ctx, pageParam: "Page", nextPageParam: "Meta.NextPage" },
    );
    for (const [name, models] of [
      ["queryOptions.ts", "Cursor, FindPetsData"],
      ["suspense.ts", "Cursor, FindPetsData, FindPetsError"],
      ["infiniteQueries.ts", "Cursor, FindPetsData, FindPetsError"],
      ["prefetch.ts", "Cursor, FindPetsData"],
    ]) {
      const content = paginated.find((file) => file.name === name)?.content;
      expect(content).toContain("Page: pageParam as {");
      expect(importsOf(paginated, name)).toContain(
        `import type { ${models} } from "../requests/types.gen";`,
      );
    }
    // Nothing in the paginated code calls for `QueryClient` except prefetch.
    expect(importsOf(paginated, "infiniteQueries.ts")?.[0]).toBe(
      'import { type InfiniteData, useInfiniteQuery, type UseInfiniteQueryOptions } from "@tanstack/react-query";',
    );
  });
});

describe("generateAllFiles with a derived name that is taken", () => {
  const get = (methodName: string): OperationInfo => ({
    methodName,
    capitalizedMethodName: methodName[0].toUpperCase() + methodName.slice(1),
    httpMethod: "GET",
    allParamsOptional: true,
    isPaginatable: false,
  });
  const declarations = (operations: OperationInfo[], name: string) =>
    generateAllFiles(operations, ctx)
      .find((file) => file.name === name)
      ?.content.split("\n")
      .filter((line) => line.startsWith("export "))
      .map((line) => line.split(" ")[2]);

  it("should number the options of one operation named like another", () => {
    const operations = [get("getUser"), get("getUserOptions")];
    expect(declarations(operations, "queryOptions.ts")).toEqual([
      "getUserOptions2",
      "getUserOptionsOptions",
    ]);
    // Whichever comes first: the SDK function is the one imported.
    expect(declarations(operations.toReversed(), "queryOptions.ts")).toEqual([
      "getUserOptionsOptions",
      "getUserOptions2",
    ]);
  });

  it("should leave the name alone when the file does not import the other", () => {
    // queryOptions.ts has no mutations, so it never imports this function.
    const operations = [
      get("getUser"),
      { ...get("getUserOptions"), httpMethod: "POST" },
    ];
    expect(declarations(operations, "queryOptions.ts")).toEqual([
      "getUserOptions",
    ]);
  });

  it("should refer to a numbered name wherever it is used", () => {
    const files = generateAllFiles([get("getApi"), get("getApiKey")], ctx);
    const content = (name: string) =>
      files.find((file) => file.name === name)?.content;
    // The hook of `getApiKey` and the key of `getApi` are both re-exported
    // from index.ts. The hook keeps the name.
    expect(content("queries.ts")).toContain("export const useGetApiKey = ");
    expect(content("common.ts")).toContain(
      'export const useGetApiKey2 = "GetApi";',
    );
    expect(content("common.ts")).toContain(
      "=> [useGetApiKey2, ...(queryKey ?? [clientOptions])];",
    );
    expect(content("common.ts")).not.toContain("useGetApiKey ");
  });

  it("should not build anything twice when every name is free", () => {
    const first = generateAllFiles([query, mutation], ctx);
    expect(generateAllFiles([query, mutation], ctx)).toEqual(first);
    expect(first.map((file) => file.content).join("")).not.toMatch(
      /export (const|type) \w+\d /,
    );
  });
});
