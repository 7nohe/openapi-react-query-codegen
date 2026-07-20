import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { LimitedUserConfig } from "../src/cli.mts";
import { findNearestTsConfigPath, generate } from "../src/generate.mjs";

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
  });

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

describe("findNearestTsConfigPath", () => {
  let fixtureRoot: string;

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), "openapi-rq-tsconfig-"));
  });

  afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  test("finds tsconfig.json in the start directory", async () => {
    const dir = await mkdtemp(path.join(fixtureRoot, "same-dir-"));
    await writeFile(path.join(dir, "tsconfig.json"), "{}");
    expect(findNearestTsConfigPath(dir)).toBe(path.join(dir, "tsconfig.json"));
  });

  test("walks up to an ancestor directory", async () => {
    const ancestor = await mkdtemp(path.join(fixtureRoot, "ancestor-"));
    await writeFile(path.join(ancestor, "tsconfig.json"), "{}");
    const nested = path.join(ancestor, "packages", "app");
    await mkdir(nested, { recursive: true });
    expect(findNearestTsConfigPath(nested)).toBe(
      path.join(ancestor, "tsconfig.json"),
    );
  });

  test("prefers exact tsconfig.json over other tsconfig*.json files", async () => {
    const dir = await mkdtemp(path.join(fixtureRoot, "prefers-"));
    await writeFile(path.join(dir, "tsconfig.build.json"), "{}");
    await writeFile(path.join(dir, "tsconfig.json"), "{}");
    expect(findNearestTsConfigPath(dir)).toBe(path.join(dir, "tsconfig.json"));
  });

  test("returns undefined when no ancestor has a tsconfig", async () => {
    const dir = await mkdtemp(path.join(fixtureRoot, "empty-"));
    // Real filesystem walk-up, so this only holds if no ancestor of `dir`
    // (up to and including `/`) happens to contain a tsconfig*.json — true
    // for a fresh os.tmpdir() fixture in CI and local dev.
    expect(findNearestTsConfigPath(dir)).toBeUndefined();
  });
});

describe("generate - import extension follows the caller's tsconfig", () => {
  const readGenerated = async (outputDir: string, fileName: string) =>
    readFile(path.join(outputDir, "requests", fileName), "utf-8");

  const runInFixture = async (moduleResolution: string) => {
    const fixtureDir = await mkdtemp(
      path.join(tmpdir(), "openapi-rq-generate-"),
    );
    await writeFile(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { moduleResolution } }),
    );
    const originalCwd = process.cwd();
    try {
      process.chdir(fixtureDir);
      await generate(
        {
          input: path.join(__dirname, "inputs", "petstore.yaml"),
          // `generate()` joins this against `process.cwd()` internally, so
          // it must be relative (matching how the CLI is always invoked).
          output: "output",
          client: "@hey-api/client-fetch",
          pageParam: "page",
          nextPageParam: "meta.next",
          initialPageParam: "initial",
        },
        "1.0.0",
      );
    } finally {
      process.chdir(originalCwd);
    }
    return { fixtureDir, outputDir: path.join(fixtureDir, "output") };
  };

  test("bundler resolution: no extension on relative imports", async () => {
    const { fixtureDir, outputDir } = await runInFixture("bundler");
    try {
      const sdkGen = await readGenerated(outputDir, "sdk.gen.ts");
      const shim = await readGenerated(outputDir, "services.gen.ts");
      expect(sdkGen).toContain("from './client.gen'");
      expect(sdkGen).not.toContain("from './client.gen.js'");
      expect(shim).toBe(
        "// This file is auto-generated for backward compatibility\nexport * from './client.gen';\nexport * from './sdk.gen';\n",
      );
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test("NodeNext resolution: .js extension on relative imports, mirrored by the shim", async () => {
    const { fixtureDir, outputDir } = await runInFixture("nodenext");
    try {
      const sdkGen = await readGenerated(outputDir, "sdk.gen.ts");
      const shim = await readGenerated(outputDir, "services.gen.ts");
      expect(sdkGen).toContain("from './client.gen.js'");
      expect(shim).toBe(
        "// This file is auto-generated for backward compatibility\nexport * from './client.gen.js';\nexport * from './sdk.gen.js';\n",
      );
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
