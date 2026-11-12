import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LimitedUserConfig } from "./cli.mjs";
import { queriesOutputPath, requestsOutputPath } from "./constants.mjs";
import { CodegenError, ErrorCodes } from "./errors.mjs";
import { generate } from "./generate.mjs";

export type FileChangeStatus = "added" | "modified" | "removed";

export type FileChange = {
  /** Path of the file in the existing output, relative to cwd, `/`-separated. */
  path: string;
  /**
   * - `added`: regeneration would create it (missing from the existing output)
   * - `modified`: content differs
   * - `removed`: present in the existing output but no longer generated
   */
  status: FileChangeStatus;
};

export type CheckResult = {
  upToDate: boolean;
  files: FileChange[];
};

/** The generator owns exactly these subdirectories of the output path. */
const checkedSubdirectories = [requestsOutputPath, queriesOutputPath];

async function listFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) {
    return [];
  }
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)),
    );
}

// Code-unit order, not localeCompare, so the listing is identical everywhere.
const byPath = (a: FileChange, b: FileChange) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

function toPosix(filePath: string) {
  return filePath.split(path.sep).join("/");
}

/**
 * Compare a freshly generated directory with the existing one.
 * Returned paths are `displayRoot` joined with the file's relative path.
 */
export async function diffDirectories({
  expectedRoot,
  actualRoot,
  displayRoot,
}: {
  expectedRoot: string;
  actualRoot: string;
  displayRoot: string;
}): Promise<FileChange[]> {
  const [expectedFiles, actualFiles] = await Promise.all([
    listFiles(expectedRoot),
    listFiles(actualRoot),
  ]);
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  const changes: FileChange[] = [];

  for (const file of expectedFiles) {
    const display = toPosix(path.join(displayRoot, file));
    if (!actualSet.has(file)) {
      changes.push({ path: display, status: "added" });
      continue;
    }
    const [expected, actual] = await Promise.all([
      readFile(path.join(expectedRoot, file)),
      readFile(path.join(actualRoot, file)),
    ]);
    if (!expected.equals(actual)) {
      changes.push({ path: display, status: "modified" });
    }
  }
  for (const file of actualFiles) {
    if (!expectedSet.has(file)) {
      changes.push({
        path: toPosix(path.join(displayRoot, file)),
        status: "removed",
      });
    }
  }

  return changes.sort(byPath);
}

/**
 * Pick where the throwaway generation goes. It sits next to the real output
 * and keeps the output's directory name, so formatters and linters run with
 * `--format`/`--lint` resolve the same config files and ignore rules as they
 * do for the real output. Falls back to the OS temp dir when the parent does
 * not exist yet (nothing generated so far, everything will be `added`).
 */
async function createScratchOutput(output: string) {
  const resolvedOutput = path.resolve(output);
  const parent = path.dirname(resolvedOutput);
  const scratchParent = existsSync(parent) ? parent : tmpdir();
  const scratchRoot = await mkdtemp(
    path.join(scratchParent, ".openapi-rq-check-"),
  );
  return {
    scratchRoot,
    scratchOutput: path.join(scratchRoot, path.basename(resolvedOutput)),
  };
}

/**
 * Generate into a temporary location and compare it with the existing
 * output under `options.output`. Never modifies the existing output.
 */
export async function check(
  options: LimitedUserConfig,
  version: string,
): Promise<CheckResult> {
  const { scratchRoot, scratchOutput } = await createScratchOutput(
    options.output,
  );
  try {
    await generate({ ...options, output: scratchOutput }, version, {
      silent: true,
    });
    const changesPerDir = await Promise.all(
      checkedSubdirectories.map((subdirectory) =>
        diffDirectories({
          expectedRoot: path.join(scratchOutput, subdirectory),
          actualRoot: path.join(options.output, subdirectory),
          displayRoot: path.join(options.output, subdirectory),
        }),
      ),
    );
    const files = changesPerDir.flat().sort(byPath);
    return { upToDate: files.length === 0, files };
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

export function outOfDateError(files: FileChange[]): CodegenError {
  return new CodegenError(
    ErrorCodes.outputOutOfDate,
    `Generated output is out of date (${files.length} ${files.length === 1 ? "file differs" : "files differ"}). Re-run openapi-rq without --check to update it.`,
    { files },
  );
}
