import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  type GeneratedClient,
  writeGeneratedFiles,
} from "../src/client/index.mjs";
import { createSource } from "../src/createSource.mjs";
import { formatOutput } from "../src/format.mjs";
import { generateTestClient, outputPath } from "./utils";

const fileName = "createSource";

describe(fileName, () => {
  let generated: GeneratedClient;
  beforeAll(async () => {
    generated = await generateTestClient();
  });

  test("createSource - fetch client", async () => {
    const source = createSource({
      generated,
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "fetch",
    });

    expect(source).toHaveLength(8);
    expect(source.map((s) => s.name)).toEqual([
      "index.ts",
      "common.ts",
      "queries.ts",
      "queryOptions.ts",
      "suspense.ts",
      "infiniteQueries.ts",
      "prefetch.ts",
      "ensureQueryData.ts",
    ]);

    const indexTs = source.find((s) => s.name === "index.ts");
    expect(indexTs?.content).toMatchSnapshot();

    const commonTs = source.find((s) => s.name === "common.ts");
    expect(commonTs?.content).toMatchSnapshot();

    const queriesTs = source.find((s) => s.name === "queries.ts");
    expect(queriesTs?.content).toMatchSnapshot();

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs?.content).toMatchSnapshot();

    const prefetchTs = source.find((s) => s.name === "prefetch.ts");
    expect(prefetchTs?.content).toMatchSnapshot();
  });

  test("createSource - axios client", async () => {
    const source = createSource({
      generated,
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "axios",
    });

    const indexTs = source.find((s) => s.name === "index.ts");
    expect(indexTs?.content).toMatchSnapshot();

    const commonTs = source.find((s) => s.name === "common.ts");
    expect(commonTs?.content).toMatchSnapshot();

    const queriesTs = source.find((s) => s.name === "queries.ts");
    expect(queriesTs?.content).toMatchSnapshot();

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs?.content).toMatchSnapshot();

    const prefetchTs = source.find((s) => s.name === "prefetch.ts");
    expect(prefetchTs?.content).toMatchSnapshot();
  });

  test("createSource - omitInitialPageParam", async () => {
    const source = createSource({
      generated,
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: true,
      client: "fetch",
    });

    const infiniteQueriesTs = source.find(
      (s) => s.name === "infiniteQueries.ts",
    );

    // The initial page param is emitted as `undefined` instead of a literal.
    expect(infiniteQueriesTs?.content).toContain("initialPageParam: undefined");
    expect(infiniteQueriesTs?.content).not.toContain("initialPageParam: 1");

    // The page param is spread in only once TanStack Query supplies one, so the
    // first request sends no page param at all (#177).
    expect(infiniteQueriesTs?.content).toContain(
      "...(pageParam === undefined ? {} : { page: pageParam as number })",
    );
  });
});

// End-to-end pin for #213: a digit-leading operationId yields the function
// `_123NumericLead`. The full pipeline must detect pagination and produce
// output that typechecks — the bug's two symptoms were a silently missing
// infinite hook and `Options<unknown, true>` failing TS2344.
describe("createSource - digit-leading operationId (#213)", () => {
  const prefix = "createSource-digit-leading";
  const dir = outputPath(prefix);
  let generated: GeneratedClient;

  beforeAll(async () => {
    generated = await generateTestClient("digit-leading.yaml");
    await writeGeneratedFiles(path.join(dir, "requests"), generated.files);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("emits infinite hooks and output that typechecks", async () => {
    const source = createSource({
      generated,
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "fetch",
    });

    const infiniteQueriesTs = source.find(
      (s) => s.name === "infiniteQueries.ts",
    );
    expect(infiniteQueriesTs?.content).toContain("use_123NumericLeadInfinite");
    expect(infiniteQueriesTs?.content).toContain(
      "Options<_123NumericLeadData, true>",
    );

    const queriesDir = path.join(dir, "queries");
    await mkdir(queriesDir, { recursive: true });
    await Promise.all(
      source.map((file) =>
        writeFile(path.join(queriesDir, file.name), file.content),
      ),
    );
    // The real pipeline organizes imports after printing (generate.mts),
    // which dedupes the Options import shared by the client and service
    // import declarations — compile what users actually get.
    await formatOutput(queriesDir);

    const program = ts.createProgram(
      source.map((file) => path.join(queriesDir, file.name)),
      {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    );
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map(
        (d) =>
          `${d.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
      );
    expect(diagnostics).toEqual([]);
  });
});
