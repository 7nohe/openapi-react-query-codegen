import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from "../../src/createSource.mjs";
import { generate } from "../../src/generate.mjs";
import { inputPath } from "../utils";

/** Compile everything the real pipeline writes for a spec of awkward names. */
describe("names that collide with what generated code uses", () => {
  let dir: string;
  beforeAll(async () => {
    // Inside the repo so that `axios` and TanStack Query resolve.
    dir = await mkdtemp(path.join(__dirname, "compile-names-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const client of ["fetch", "axios"] as const) {
    test(`${client} output compiles`, async () => {
      const relative = path.relative(process.cwd(), path.join(dir, client));
      await generate(
        {
          input: inputPath("hostile-names.yaml"),
          output: relative,
          client,
          pageParam: "page",
          nextPageParam: "nextPage",
          initialPageParam: "1",
        },
        "1.0.0",
      );
      await writeFile(
        path.join(dir, client, "package.json"),
        '{"type":"module"}',
      );
      const files = (
        await readdir(path.join(dir, client), { recursive: true })
      ).filter((file) => file.endsWith(".ts"));
      const program = ts.createProgram(
        files.map((file) => path.join(dir, client, file)),
        {
          strict: true,
          // An import a hook file does not use is an error here.
          noUnusedLocals: true,
          noEmit: true,
          skipLibCheck: true,
          lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          types: [],
        },
      );
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map(
          (d) =>
            `${path.basename(d.file?.fileName ?? "")}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
        );
      expect(diagnostics).toEqual([]);
    }, 120_000);
  }
});

describe("what the awkward names become", () => {
  test("schemas and functions are renamed only where they must be", async () => {
    const { generateTestClient } = await import("../utils");
    const generated = await generateTestClient("hostile-names.yaml");
    const types = generated.files.find((f) => f.name === "types.gen.ts");

    expect(generated.modelNames).toEqual(
      expect.arrayContaining([
        "Array2",
        "Options2",
        "ClientOptions2",
        "Promise2",
        // These stay: only `types.gen.ts` needs the global of that name.
        "Blob",
        "File",
        "Client",
        // An operation's type gives way to the TanStack import as well.
        "InfiniteData3",
        // The hooks' type parameters would shadow a model of the same name,
        // whether it comes from a schema or from the operation `t`.
        "TData2",
        "TData3",
        "TError2",
        "TError3",
        "TQueryKey2",
        "TContext2",
      ]),
    );
    expect(generated.serviceNames).toEqual(
      expect.arrayContaining([
        "client_",
        "options_",
        "useQuery_",
        "undefined_",
        "_1Abc2",
      ]),
    );
    expect(types?.content).toContain(
      "upload?: globalThis.Blob | globalThis.File",
    );
    expect(types?.content).toContain("blob?: Blob;");
  });

  test("a name the hooks derive gives way to the one already there", async () => {
    const { generateTestClient } = await import("../utils");
    const generated = await generateTestClient("hostile-names.yaml", {
      useDateType: true,
    });
    const declared = Object.fromEntries(
      createSource({
        generated,
        client: "fetch",
        version: "1.0.0",
        pageParam: "page",
        nextPageParam: "nextPage",
        initialPageParam: "1",
        omitInitialPageParam: false,
      }).map((file) => [
        file.name,
        [...file.content.matchAll(/^export (?:const|type) (\w+)/gm)].map(
          (match) => match[1],
        ),
      ]),
    );

    // The specification's names stay; what is derived from `getUser` and
    // `findPets` moves out of the way of the functions of those names.
    expect(generated.serviceNames).toEqual(
      expect.arrayContaining(["getUserOptions", "useFindPets", "getApiKey"]),
    );
    expect(declared["queryOptions.ts"]).toEqual(
      expect.arrayContaining(["getUserOptions2", "getUserOptionsOptions"]),
    );
    expect(declared["queryOptions.ts"]).not.toContain("getUserOptions");
    expect(declared["queries.ts"]).toEqual(
      expect.arrayContaining(["useFindPets2", "useUseFindPets"]),
    );
    expect(declared["queries.ts"]).not.toContain("useFindPets");

    // `index.ts` re-exports both files: the hook of `getApiKey` keeps the
    // name, and the key of `getApi` gets the number.
    expect(declared["queries.ts"]).toContain("useGetApiKey");
    expect(declared["common.ts"]).toEqual(
      expect.arrayContaining(["useGetApiKey2", "UseGetApiKeyFn"]),
    );
    expect(declared["common.ts"]).not.toContain("useGetApiKey");

    // The infinite variants of `findPets` meet the names of `findPetsInfinite`.
    expect(declared["common.ts"]).toEqual(
      expect.arrayContaining([
        "useFindPetsInfiniteKey",
        "useFindPetsInfiniteKey2",
        "UseFindPetsInfiniteKeyFn",
        "UseFindPetsInfiniteKeyFn2",
      ]),
    );
    expect(declared["queryOptions.ts"]).toEqual(
      expect.arrayContaining([
        "findPetsInfiniteOptions",
        "findPetsInfiniteOptions2",
      ]),
    );
    expect(declared["prefetch.ts"]).toEqual(
      expect.arrayContaining([
        "prefetchUseFindPetsInfinite",
        "prefetchUseFindPetsInfinite2",
      ]),
    );

    // What a file imports from TanStack Query.
    expect(declared["queries.ts"]).toEqual(
      expect.arrayContaining([
        "useQuery2",
        "useMutation2",
        "useInfiniteQuery2",
      ]),
    );
    expect(declared["queryOptions.ts"]).toEqual(
      expect.arrayContaining(["queryOptions2", "infiniteQueryOptions2"]),
    );

    // Nothing moves where two files only happen to use one name: no file
    // holds both, and `index.ts` does not re-export them together.
    expect(declared["suspense.ts"]).toContain("useFindPetsSuspense");
    expect(declared["queries.ts"]).toContain("useFindPetsSuspense");
    expect(declared["infiniteQueries.ts"]).toContain("useFindPetsInfinite");
    expect(declared["queries.ts"]).toContain("useFindPetsInfinite");
    expect(generated.modelNames).toEqual(
      expect.arrayContaining([
        "ListPetsDefaultResponse",
        "FindPetsQueryResult",
      ]),
    );
    expect(declared["common.ts"]).toEqual(
      expect.arrayContaining([
        "ListPetsDefaultResponse",
        "FindPetsQueryResult",
      ]),
    );

    // `sdk.gen.ts` imports the transformers next to its functions.
    const sdk = generated.files.find((f) => f.name === "sdk.gen.ts")?.content;
    expect(generated.serviceNames).toContain("getPetResponseTransformer");
    expect(sdk).toContain(
      "import { getPetResponseTransformer2, getPetResponseTransformerResponseTransformer, listPetsResponseTransformer }",
    );
  });
});
