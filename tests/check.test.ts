import { existsSync, readdirSync } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  check,
  createScratchOutput,
  diffDirectories,
  outOfDateError,
  scratchPrefix,
} from "../src/check.mjs";
import type { LimitedUserConfig } from "../src/cli.mts";
import { CodegenError, ErrorCodes } from "../src/errors.mjs";
import { generate } from "../src/generate.mjs";

const outputDir = "outputs-check";
const output = path.join("tests", outputDir);

const options: LimitedUserConfig = {
  input: path.join(__dirname, "inputs", "petstore.yaml"),
  output,
  client: "@hey-api/client-fetch",
  // Formatter and linter run on the scratch output too; the round trip below
  // proves they resolve the same config there as for the real output.
  format: "biome",
  lint: "biome",
  pageParam: "page",
  nextPageParam: "meta.next",
  initialPageParam: "initial",
};

async function snapshotTree(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
  return Promise.all(
    files.map(async (file) => [file, await readFile(file, "utf-8")] as const),
  );
}

const scratchLeftovers = (dir: string) =>
  readdirSync(dir).filter((name) => name.startsWith(scratchPrefix));

const crashLogs = () =>
  readdirSync(process.cwd()).filter((name) =>
    name.startsWith("openapi-ts-error-"),
  );

describe("check", () => {
  beforeAll(async () => {
    await generate({ ...options }, "1.0.0");
  }, 60000);

  afterAll(async () => {
    await rm(path.join(__dirname, outputDir), { recursive: true, force: true });
  });

  test("reports up to date right after generate, without touching the output", async () => {
    const before = await snapshotTree(output);

    const result = await check({ ...options }, "1.0.0");

    expect(result).toEqual({ upToDate: true, files: [] });
    expect(await snapshotTree(output)).toEqual(before);
    expect(scratchLeftovers(__dirname)).toEqual([]);
    expect(scratchLeftovers(path.join(output, "queries"))).toEqual([]);
  });

  test("ignores a scratch directory left behind by an interrupted run", async () => {
    const leftover = path.join(output, "queries", `${scratchPrefix}stale`);
    await mkdir(leftover, { recursive: true });
    await writeFile(path.join(leftover, "queries.ts"), "// stale\n");
    try {
      expect(await check({ ...options }, "1.0.0")).toEqual({
        upToDate: true,
        files: [],
      });
    } finally {
      await rm(leftover, { recursive: true, force: true });
    }
  });

  test("works with an absolute output path", async () => {
    const result = await check(
      { ...options, output: path.resolve(output) },
      "1.0.0",
    );
    expect(result.upToDate).toBe(true);
  });

  test("lists added, modified and removed files", async () => {
    await appendFile(path.join(output, "queries", "queries.ts"), "// edit\n");
    await rm(path.join(output, "queries", "prefetch.ts"));
    await writeFile(path.join(output, "requests", "stale.ts"), "");

    const result = await check({ ...options }, "1.0.0");

    expect(result.upToDate).toBe(false);
    expect(result.files).toEqual([
      { path: "tests/outputs-check/queries/prefetch.ts", status: "added" },
      { path: "tests/outputs-check/queries/queries.ts", status: "modified" },
      { path: "tests/outputs-check/requests/stale.ts", status: "removed" },
    ]);
    expect(scratchLeftovers(__dirname)).toEqual([]);
  });

  test("reports cwd-relative paths for an absolute output path", async () => {
    // Relies on the drift created by the previous test.
    const relative = await check({ ...options }, "1.0.0");
    const absolute = await check(
      { ...options, output: path.resolve(output) },
      "1.0.0",
    );

    expect(absolute.files.length).toBeGreaterThan(0);
    expect(absolute.files).toEqual(relative.files);
  });

  test("cleans up and reports a typed error when generation fails", async () => {
    const before = crashLogs();
    await expect(
      check(
        {
          ...options,
          input: path.join(__dirname, "inputs", "does-not-exist.yaml"),
        },
        "1.0.0",
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.inputNotFound });
    expect(scratchLeftovers(__dirname)).toEqual([]);
    expect(crashLogs()).toEqual(before);
  });

  test("treats a missing output as all files added, using the OS temp dir", async () => {
    const missingParent = path.join("tests", "missing-parent", "openapi");

    const result = await check(
      { ...options, output: missingParent, format: undefined, lint: undefined },
      "1.0.0",
    );

    expect(result.upToDate).toBe(false);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.every((file) => file.status === "added")).toBe(true);
    expect(
      result.files.every((file) =>
        file.path.startsWith("tests/missing-parent/openapi/"),
      ),
    ).toBe(true);
    expect(existsSync(path.join("tests", "missing-parent"))).toBe(false);
    expect(scratchLeftovers(tmpdir())).toEqual([]);
  });
});

describe("check with formatter config anchored to the output path", () => {
  // biome.json has an override for exactly `tests/outputs-check-anchored/**`
  // that switches to single quotes. The scratch generation has to be
  // formatted by the same override, or every file would differ.
  const anchoredDir = "outputs-check-anchored";
  const anchoredOptions: LimitedUserConfig = {
    ...options,
    output: path.join("tests", anchoredDir),
    lint: undefined,
  };

  beforeAll(async () => {
    await generate({ ...anchoredOptions }, "1.0.0");
  }, 60000);

  afterAll(async () => {
    await rm(path.join(__dirname, anchoredDir), {
      recursive: true,
      force: true,
    });
  });

  test("applies the same path-specific override to the scratch output", async () => {
    const queries = await readFile(
      path.join(anchoredOptions.output, "queries", "queries.ts"),
      "utf-8",
    );
    expect(queries).toContain("from '@tanstack/react-query'");

    expect(await check({ ...anchoredOptions }, "1.0.0")).toEqual({
      upToDate: true,
      files: [],
    });
  });
});

describe("createScratchOutput", () => {
  let root: string;

  beforeAll(async () => {
    root = path.join("tests", "outputs-check-scratch");
    await mkdir(path.join(root, "with-queries", "queries"), {
      recursive: true,
    });
    await mkdir(path.join(root, "without-queries"), { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("nests inside the existing queries directory and repeats the output path", async () => {
    const output = path.join(root, "with-queries");
    const { scratchRoot, scratchOutput } = await createScratchOutput(output);
    try {
      expect(path.dirname(scratchRoot)).toBe(path.resolve(output, "queries"));
      expect(scratchOutput).toBe(path.join(scratchRoot, output));
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test("goes next to the output when there is no queries directory yet", async () => {
    const output = path.join(root, "without-queries");
    const { scratchRoot, scratchOutput } = await createScratchOutput(output);
    try {
      expect(path.dirname(scratchRoot)).toBe(path.resolve(root));
      expect(scratchOutput).toBe(path.join(scratchRoot, output));
    } finally {
      await rm(scratchRoot, { recursive: true, force: true });
    }
  });

  test("keeps only the directory name for an output outside cwd", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "openapi-rq-outside-"));
    try {
      const { scratchRoot, scratchOutput } = await createScratchOutput(
        path.join(outside, "openapi"),
      );
      expect(path.dirname(scratchRoot)).toBe(outside);
      expect(scratchOutput).toBe(path.join(scratchRoot, "openapi"));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("check errors", () => {
  const blocker = path.join("tests", "outputs-check-blocker");

  beforeAll(async () => {
    await writeFile(blocker, "");
  });

  afterAll(async () => {
    await rm(blocker, { force: true });
  });

  test("rejects with CodegenError when the scratch directory cannot be created", async () => {
    const error = await check(
      { ...options, output: path.join(blocker, "openapi") },
      "1.0.0",
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CodegenError);
    expect(error).toMatchObject({
      code: ErrorCodes.generationFailed,
      cause: { code: "ENOTDIR" },
    });
  });
});

describe("diffDirectories", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "openapi-rq-diff-"));
    await mkdir(path.join(root, "expected", "nested"), { recursive: true });
    await mkdir(path.join(root, "actual", "nested"), { recursive: true });
    await writeFile(path.join(root, "expected", "same.ts"), "same");
    await writeFile(path.join(root, "actual", "same.ts"), "same");
    await writeFile(path.join(root, "expected", "nested", "new.ts"), "new");
    await writeFile(path.join(root, "actual", "nested", "old.ts"), "old");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("compares nested files and reports POSIX paths under displayRoot", async () => {
    const changes = await diffDirectories({
      expectedRoot: path.join(root, "expected"),
      actualRoot: path.join(root, "actual"),
      displayRoot: path.join("out", "queries"),
    });
    expect(changes).toEqual([
      { path: "out/queries/nested/new.ts", status: "added" },
      { path: "out/queries/nested/old.ts", status: "removed" },
    ]);
  });

  test("treats a missing directory as empty", async () => {
    const changes = await diffDirectories({
      expectedRoot: path.join(root, "expected"),
      actualRoot: path.join(root, "does-not-exist"),
      displayRoot: "out",
    });
    expect(changes.map((change) => change.status)).toEqual(["added", "added"]);
  });
});

describe("outOfDateError", () => {
  test("carries the changed files in details", () => {
    const files = [{ path: "a.ts", status: "modified" as const }];
    const error = outOfDateError(files);
    expect(error.code).toBe(ErrorCodes.outputOutOfDate);
    expect(error.message).toContain("1 file differs");
    expect(error.details).toEqual({ files });
    expect(outOfDateError([...files, ...files]).message).toContain(
      "2 files differ",
    );
  });
});
