import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@hey-api/openapi-ts";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from "../src/createSource.mjs";
import { formatOutput } from "../src/format.mjs";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

const fileName = "createSource";

describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("createSource - @hey-api/client-fetch", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "@hey-api/client-fetch",
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

  test("createSource - @hey-api/client-axios", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "@hey-api/client-axios",
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
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: true,
      client: "@hey-api/client-fetch",
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

// End-to-end pin for #213: hey-api names the SDK function `_123NumericLead`
// but the Data type `NumericLeadData`. The full pipeline must still detect
// pagination and produce output that typechecks — the bug's two symptoms were
// a silently missing infinite hook and `Options<unknown, true>` failing TS2344.
describe("createSource - digit-leading operationId (#213)", () => {
  const prefix = "createSource-digit-leading";
  const dir = outputPath(prefix);

  beforeAll(async () => {
    await createClient({
      input: path.join(__dirname, "inputs", "digit-leading.yaml"),
      output: path.join(dir, "requests"),
      plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
    });
  });
  afterAll(async () => await cleanOutputs(prefix));

  test("emits infinite hooks and output that typechecks", async () => {
    const source = await createSource({
      outputPath: path.join(dir, "requests"),
      version: "1.0.0",
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "1",
      omitInitialPageParam: false,
      client: "@hey-api/client-fetch",
    });

    const infiniteQueriesTs = source.find(
      (s) => s.name === "infiniteQueries.ts",
    );
    expect(infiniteQueriesTs?.content).toContain("use_123NumericLeadInfinite");
    expect(infiniteQueriesTs?.content).toContain(
      "Options<NumericLeadData, true>",
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
