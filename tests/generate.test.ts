import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LimitedUserConfig } from "../src/cli.mts";
import { generate } from "../src/generate.mjs";

const readOutput = (fileName: string) => {
  return readFileSync(
    path.join(__dirname, "outputs", "queries", fileName),
    "utf-8",
  );
};

describe("generate", () => {
  beforeAll(async () => {
    const options: LimitedUserConfig = {
      input: path.join(__dirname, "inputs", "petstore.yaml"),
      output: path.join("tests", "outputs"),
      client: "@hey-api/client-fetch",
      lint: "biome",
      format: "biome",
      pageParam: "page",
      nextPageParam: "meta.next",
      initialPageParam: "initial",
      operationId: true,
    };
    await generate(options, "1.0.0");
  }, 60000);

  afterAll(async () => {
    if (existsSync(path.join(__dirname, "outputs"))) {
      await rm(path.join(__dirname, "outputs"), {
        recursive: true,
      });
    }
  });

  test("common.ts", () => {
    expect(readOutput("common.ts")).toMatchSnapshot();
  });

  test("queries.ts", () => {
    expect(readOutput("queries.ts")).toMatchSnapshot();
  });

  test("infiniteQueries.ts", () => {
    expect(readOutput("infiniteQueries.ts")).toMatchSnapshot();
  });

  test("index.ts", () => {
    expect(readOutput("index.ts")).toMatchSnapshot();
  });

  test("suspense.ts", () => {
    expect(readOutput("suspense.ts")).toMatchSnapshot();
  });

  test("prefetch.ts", () => {
    expect(readOutput("prefetch.ts")).toMatchSnapshot();
  });

  test("ensureQueryData.ts", () => {
    expect(readOutput("ensureQueryData.ts")).toMatchSnapshot();
  });
});

describe("generate - axios client with enums, noOperationId, schemaType", () => {
  const outputDir = "outputs-generate-axios";
  const readAxiosOutput = (fileName: string) => {
    return readFileSync(
      path.join(__dirname, outputDir, "queries", fileName),
      "utf-8",
    );
  };

  beforeAll(async () => {
    const options: LimitedUserConfig = {
      input: path.join(__dirname, "inputs", "petstore.yaml"),
      output: path.join("tests", outputDir),
      client: "@hey-api/client-axios",
      enums: "javascript",
      noOperationId: true,
      schemaType: "json",
      pageParam: "page",
      nextPageParam: "meta.next",
      initialPageParam: "initial",
    };
    await generate(options, "1.0.0");
  });

  afterAll(async () => {
    if (existsSync(path.join(__dirname, outputDir))) {
      await rm(path.join(__dirname, outputDir), { recursive: true });
    }
  });

  test("queries.ts", () => {
    expect(readAxiosOutput("queries.ts")).toMatchSnapshot();
  });
});

describe("generate - noSchemas option", () => {
  const outputDir = "outputs-generate-noschemas";
  const readNoSchemasOutput = (fileName: string) => {
    return readFileSync(
      path.join(__dirname, outputDir, "queries", fileName),
      "utf-8",
    );
  };

  beforeAll(async () => {
    const options: LimitedUserConfig = {
      input: path.join(__dirname, "inputs", "petstore.yaml"),
      output: path.join("tests", outputDir),
      client: "@hey-api/client-fetch",
      noSchemas: true,
      pageParam: "page",
      nextPageParam: "meta.next",
      initialPageParam: "initial",
    };
    await generate(options, "1.0.0");
  });

  afterAll(async () => {
    if (existsSync(path.join(__dirname, outputDir))) {
      await rm(path.join(__dirname, outputDir), { recursive: true });
    }
  });

  test("queries.ts", () => {
    expect(readNoSchemasOutput("queries.ts")).toMatchSnapshot();
  });
});
