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
  modelNames: [
    "Pet",
    "NewPet",
    "FindPetsData",
    "FindPetsError",
    "ResponseData",
  ],
  serviceNames: ["findPets", "response"],
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

  it("should not import a model for a name in a JSDoc", () => {
    for (const file of files) {
      const models = importsOf([file], file.name)?.find((line) =>
        line.includes("types.gen"),
      );
      expect(models ?? "").not.toMatch(/\b(Pet|NewPet)\b/);
    }
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

  // A page parameter or a next-page path may be spelled like a schema.
  it("should not import a model for the key of a pagination property", () => {
    const paginated = generateAllFiles([{ ...query, isPaginatable: true }], {
      ...ctx,
      modelNames: [...ctx.modelNames, "Page", "Meta", "NextPage"],
      pageParam: "Page",
      nextPageParam: "Meta.NextPage",
    });
    for (const name of [
      "queryOptions.ts",
      "suspense.ts",
      "infiniteQueries.ts",
      "prefetch.ts",
    ]) {
      const content = paginated.find((file) => file.name === name)?.content;
      expect(content).toContain("Page: pageParam as number");
      expect(content).toContain("{ Meta: { NextPage: number } }");
      expect(
        importsOf(paginated, name)?.find((line) => line.includes("types.gen")),
      ).toMatch(/^import type \{ FindPetsData(, FindPetsError)? \} from/);
    }
  });
});
