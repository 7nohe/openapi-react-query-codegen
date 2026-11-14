// `--mock`, from the options down: the version of MSW the project has, the
// files written, and `--check` over them.

import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { check } from "../src/check.mjs";
import type { LimitedUserConfig } from "../src/cli.mjs";
import { detectMswMajor } from "../src/client/index.mjs";
import { generate } from "../src/generate.mjs";
import { inputPath } from "./utils";

/** A project directory outside the repo, with the given MSW installed. */
async function projectWithMsw(version?: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "orqc-msw-"));
  if (version !== undefined) {
    const msw = path.join(dir, "node_modules", "msw");
    await mkdir(msw, { recursive: true });
    await writeFile(
      path.join(msw, "package.json"),
      JSON.stringify({ name: "msw", version }),
    );
  }
  return dir;
}

const dirs: string[] = [];
async function project(version?: string) {
  const dir = await projectWithMsw(version);
  dirs.push(dir);
  return dir;
}
afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("detectMswMajor", () => {
  test("reads the installed version", async () => {
    expect(detectMswMajor(await project("3.0.4"))).toEqual({ major: 3 });
    expect(detectMswMajor(await project("2.15.0"))).toEqual({ major: 2 });
    // A later major is taken to keep the entry points of version 3.
    expect(detectMswMajor(await project("4.1.0"))).toEqual({ major: 3 });
  });

  test("is version 3 when MSW is not installed", async () => {
    expect(detectMswMajor(await project())).toEqual({ major: 3 });
  });

  test("finds the repo's own MSW from a directory inside it", () => {
    expect(detectMswMajor(process.cwd())).toEqual({ major: 3 });
  });

  test("warns about a version the handlers cannot run on", async () => {
    const detected = detectMswMajor(await project("1.3.5"));
    expect(detected.major).toBe(2);
    expect(detected.warning).toContain("MSW 2 or later");
    expect(detected.warning).toContain("1.3.5");
  });
});

describe("generate with --mock", () => {
  const options = (output: string): LimitedUserConfig => ({
    input: inputPath("mocks.yaml"),
    output,
    pageParam: "page",
    nextPageParam: "nextPage",
    initialPageParam: "1",
    mock: "msw",
  });

  afterEach(() => vi.restoreAllMocks());

  test("writes the handlers for the MSW of the project, and its warnings", async () => {
    const dir = await project("1.3.5");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generate(options(path.join(dir, "openapi")), "1.0.0");

    const handlers = await readFile(
      path.join(dir, "openapi", "mocks", "handlers.ts"),
      "utf-8",
    );
    expect(handlers).toContain('} from "msw";');
    const warnings = warn.mock.calls.map(([message]) => String(message));
    expect(warnings[0]).toContain("MSW 2 or later");
    expect(warnings).toContainEqual(expect.stringContaining("TRACE /pets"));
  });

  test("says nothing when silent", async () => {
    const dir = await project("1.3.5");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await generate(options(path.join(dir, "openapi")), "1.0.0", {
      silent: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test("writes no mocks directory without the option", async () => {
    const dir = await project();
    const output = path.join(dir, "openapi");
    await generate({ ...options(output), mock: undefined }, "1.0.0", {
      silent: true,
    });
    await expect(
      readFile(path.join(output, "mocks", "index.ts")),
    ).rejects.toThrow();
  });

  test("formats and lints the mocks with the queries", async () => {
    const dir = await project();
    const output = path.join(dir, "openapi");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await generate(
      { ...options(output), format: "biome", lint: "biome" },
      "1.0.0",
      { silent: true },
    );
    const messages = log.mock.calls.map(([message]) => String(message));
    expect(messages).toContainEqual(expect.stringContaining("on queries"));
    expect(messages).toContainEqual(
      expect.stringContaining("Biome (Format) on mocks"),
    );
    expect(messages).toContainEqual(
      expect.stringContaining("Biome (Lint) on mocks"),
    );
  });
});

describe("check with --mock", () => {
  const output = path.join("tests", "outputs-check-mocks");
  const options: LimitedUserConfig = {
    input: inputPath("petstore.yaml"),
    output,
    pageParam: "page",
    nextPageParam: "nextPage",
    initialPageParam: "1",
    mock: "msw",
  };

  beforeAll(async () => {
    await generate({ ...options }, "1.0.0", { silent: true });
  }, 60_000);
  afterAll(async () => {
    await rm(output, { recursive: true, force: true });
  });

  test("the mocks are part of what is checked", async () => {
    expect(await check({ ...options }, "1.0.0")).toEqual({
      upToDate: true,
      files: [],
    });

    const handlers = path.join(output, "mocks", "handlers.ts");
    const original = await readFile(handlers, "utf-8");
    await appendFile(handlers, "// edited\n");
    try {
      expect((await check({ ...options }, "1.0.0")).files).toEqual([
        {
          path: "tests/outputs-check-mocks/mocks/handlers.ts",
          status: "modified",
        },
      ]);
    } finally {
      await writeFile(handlers, original);
    }
  });

  test("without the option a mocks directory is not the generator's", async () => {
    const result = await check({ ...options, mock: undefined }, "1.0.0");
    expect(result).toEqual({ upToDate: true, files: [] });
  });
});
