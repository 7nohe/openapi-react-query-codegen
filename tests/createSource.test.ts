import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from "../src/createSource.mjs";
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
