import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
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
      client: "fetch",
      lint: "biome",
      format: "biome",
      pageParam: "page",
      nextPageParam: "meta.next",
      initialPageParam: "initial",
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

  test("queryOptions.ts", () => {
    expect(readOutput("queryOptions.ts")).toMatchSnapshot();
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
      client: "axios",
      enums: "javascript",
      noOperationId: true,
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

describe("generate - optional request files", () => {
  const outputDir = "outputs-generate-optional";
  const requests = (name: string, fileName: string) =>
    path.join(__dirname, outputDir, name, "requests", fileName);
  const run = (name: string, options: Partial<LimitedUserConfig>) =>
    generate(
      {
        input: path.join(__dirname, "inputs", "dates.yaml"),
        output: path.join("tests", outputDir, name),
        pageParam: "page",
        nextPageParam: "nextPage",
        initialPageParam: "1",
        ...options,
      },
      "1.0.0",
    );

  afterAll(async () => {
    await rm(path.join(__dirname, outputDir), { recursive: true, force: true });
  });

  test("JSON schemas by default, and no transformers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run("default", {});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    const schemas = await readFile(
      requests("default", "schemas.gen.ts"),
      "utf-8",
    );
    expect(schemas).toContain("export const EventSchema = {");
    expect(existsSync(requests("default", "transformers.gen.ts"))).toBe(false);
  });

  test("--schemaType form leaves the documentation out", async () => {
    await run("form", {
      input: path.join(__dirname, "inputs", "features.yaml"),
      schemaType: "form",
    });
    await run("json", {
      input: path.join(__dirname, "inputs", "features.yaml"),
      schemaType: "json",
    });
    expect(
      await readFile(requests("json", "schemas.gen.ts"), "utf-8"),
    ).toContain('description: "A stored item"');
    expect(
      await readFile(requests("form", "schemas.gen.ts"), "utf-8"),
    ).not.toContain("description:");
  });

  test("--noSchemas and --useDateType", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run("dates", { noSchemas: true, useDateType: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      "--useDateType: the dates in these schemas stay strings",
    );
    warn.mockRestore();
    // `--json` and `--check` keep stderr to themselves.
    const silenced = vi.spyOn(console, "warn").mockImplementation(() => {});
    await generate(
      {
        input: path.join(__dirname, "inputs", "dates.yaml"),
        output: path.join("tests", outputDir, "silent"),
        useDateType: true,
        pageParam: "page",
        nextPageParam: "nextPage",
        initialPageParam: "1",
      },
      "1.0.0",
      { silent: true },
    );
    expect(silenced).not.toHaveBeenCalled();
    silenced.mockRestore();
    expect(existsSync(requests("dates", "schemas.gen.ts"))).toBe(false);
    expect(
      await readFile(requests("dates", "transformers.gen.ts"), "utf-8"),
    ).toContain("export const listEventsResponseTransformer");
    expect(await readFile(requests("dates", "sdk.gen.ts"), "utf-8")).toContain(
      "responseTransformer: listEventsResponseTransformer",
    );
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

  /** Every relative module specifier in the generated queries directory. */
  const queriesSpecifiers = async (outputDir: string) => {
    const dir = path.join(outputDir, "queries");
    const specifiers = new Set<string>();
    for (const name of await readdir(dir)) {
      const content = await readFile(path.join(dir, name), "utf-8");
      for (const match of content.matchAll(/from "(\.[^"]*)"/g)) {
        specifiers.add(match[1]);
      }
    }
    return [...specifiers].sort();
  };

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
          client: "fetch",
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
      expect(sdkGen).toContain('from "./client.gen"');
      expect(sdkGen).not.toContain('from "./client.gen.js"');
      expect(shim).toBe(
        '// This file is auto-generated for backward compatibility\nexport * from "./client.gen";\nexport * from "./sdk.gen";\n',
      );
      expect(await queriesSpecifiers(outputDir)).toEqual([
        "../requests/sdk.gen",
        "../requests/types.gen",
        "./common",
        "./queries",
        "./queryOptions",
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test("NodeNext resolution: .js extension on relative imports, mirrored by the shim", async () => {
    const { fixtureDir, outputDir } = await runInFixture("nodenext");
    try {
      const sdkGen = await readGenerated(outputDir, "sdk.gen.ts");
      const shim = await readGenerated(outputDir, "services.gen.ts");
      expect(sdkGen).toContain('from "./client.gen.js"');
      expect(shim).toBe(
        '// This file is auto-generated for backward compatibility\nexport * from "./client.gen.js";\nexport * from "./sdk.gen.js";\n',
      );
      // The queries import the requests, so they follow the same rule.
      expect(await queriesSpecifiers(outputDir)).toEqual([
        "../requests/sdk.gen.js",
        "../requests/types.gen.js",
        "./common.js",
        "./queries.js",
        "./queryOptions.js",
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
