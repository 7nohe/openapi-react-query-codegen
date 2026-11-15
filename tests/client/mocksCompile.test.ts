// The mocks are typed by the generated types, so a value the mock generator
// writes has to be one the type generator accepts. Compile them for every
// specification under tests/inputs, in each mode that changes the types.

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LimitedUserConfig } from "../../src/cli.mjs";
import { generate } from "../../src/generate.mjs";
import { inputPath } from "../utils";

const cases: Array<{
  input: string;
  name: string;
  options?: Partial<LimitedUserConfig>;
}> = [
  { input: "petstore.yaml", name: "petstore" },
  { input: "features.yaml", name: "features" },
  { input: "hostile-names.yaml", name: "hostile-names" },
  { input: "dates.yaml", name: "dates" },
  { input: "digit-leading.yaml", name: "digit-leading" },
  { input: "string-pagination.yaml", name: "string-pagination" },
  { input: "mocks.yaml", name: "mocks" },
  {
    input: "mocks.yaml",
    name: "mocks-ts-enums-dates",
    options: { enums: "typescript", useDateType: true },
  },
  {
    input: "mocks.yaml",
    name: "mocks-js-enums",
    options: { enums: "javascript" },
  },
  {
    input: "features.yaml",
    name: "features-ts-enums-dates",
    options: { enums: "typescript", useDateType: true },
  },
  {
    input: "features.yaml",
    name: "features-js-enums",
    options: { enums: "javascript" },
  },
  {
    input: "dates.yaml",
    name: "dates-date-type",
    options: { useDateType: true },
  },
  {
    // Nothing to mock and no operation: no import may be left unused, in the
    // mocks or in the client.
    input:
      '{"openapi":"3.1.0","info":{"title":"Empty","version":"1"},"paths":{}}',
    name: "empty",
  },
  {
    input: "hostile-names.yaml",
    name: "hostile-names-ts-enums",
    options: { enums: "typescript", useDateType: true },
  },
];

describe("generated mocks compile", () => {
  let dir: string;
  beforeAll(async () => {
    // Inside the repo so that `msw` resolves.
    dir = await mkdtemp(path.join(__dirname, "compile-mocks-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const { input, name, options } of cases) {
    test(name, async () => {
      const output = path.join(dir, name);
      await generate(
        {
          input: input.startsWith("{") ? input : inputPath(input),
          output: path.relative(process.cwd(), output),
          pageParam: "page",
          nextPageParam: "nextPage",
          initialPageParam: "1",
          mock: "msw",
          ...options,
        },
        "1.0.0",
        { silent: true },
      );
      await writeFile(path.join(output, "package.json"), '{"type":"module"}');
      // The whole output: the mocks import the client, and an empty
      // specification must leave nothing unused in any of the three.
      const files = (await readdir(output, { recursive: true })).filter(
        (file) => file.endsWith(".ts"),
      );
      const program = ts.createProgram(
        files.map((file) => path.join(output, file)),
        {
          strict: true,
          // An import or a helper the handlers do not use is an error here.
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          types: [],
        },
      );
      const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => {
        const where = d.file
          ? `${path.basename(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}`
          : "";
        return `${where}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
      });
      expect(diagnostics).toEqual([]);
    }, 120_000);
  }
});
