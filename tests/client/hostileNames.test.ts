import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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
      ]),
    );
    expect(generated.serviceNames).toEqual(
      expect.arrayContaining(["client_", "options_", "useQuery_", "_1Abc2"]),
    );
    expect(types?.content).toContain(
      "upload?: globalThis.Blob | globalThis.File",
    );
    expect(types?.content).toContain("blob?: Blob;");
  });
});
