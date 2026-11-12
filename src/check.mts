import { existsSync, statSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LimitedUserConfig } from "./cli.mjs";
import { queriesOutputPath, requestsOutputPath } from "./constants.mjs";
import { CodegenError, ErrorCodes, toCodegenError } from "./errors.mjs";
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

/** Name prefix of the throwaway directory `check` generates into. */
export const scratchPrefix = ".openapi-rq-check-";

function isDirectory(target: string) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

async function listFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const walk = async (relativeDirectory: string) => {
    const entries = await readdir(path.join(root, relativeDirectory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      // Scratch directories live inside the existing `queries/`. Skip them
      // before descending: one that belongs to another check running at the
      // same time can disappear while it is being read.
      if (entry.name.startsWith(scratchPrefix)) {
        continue;
      }
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  await walk("");
  return files;
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
 * Pick where the throwaway generation goes.
 *
 * `--format`/`--lint` run on the scratch `queries/` files, and formatter and
 * linter configuration is matched by path (overrides, ignore rules). So the
 * scratch directory is created inside the existing `<output>/queries`, and
 * the output's own path is repeated underneath it:
 *
 *   src/openapi/queries/.openapi-rq-check-XXXX/src/openapi/queries/*.ts
 *
 * A rule for `src/openapi/**` or `src/openapi/queries/**` matches through the
 * leading part, a rule for a folder named `openapi` or for
 * `**\/openapi/queries/*.ts` through the trailing part. Only a rule anchored
 * at the project root that also pins the depth or file name (for example
 * `src/openapi/queries/*.ts`) does not carry over.
 *
 * When there is no `queries/` yet every query file is reported as `added`
 * whatever its content, so the scratch directory goes next to the output, or
 * into the OS temp dir when the parent does not exist either.
 */
export async function createScratchOutput(output: string) {
  const resolvedOutput = path.resolve(output);
  const existingQueries = path.join(resolvedOutput, queriesOutputPath);
  const parent = path.dirname(resolvedOutput);
  const scratchParent = isDirectory(existingQueries)
    ? existingQueries
    : existsSync(parent)
      ? parent
      : tmpdir();
  const scratchRoot = await mkdtemp(path.join(scratchParent, scratchPrefix));
  const relativeOutput = path.relative(process.cwd(), resolvedOutput);
  const insideCwd =
    relativeOutput !== "" &&
    !relativeOutput.startsWith("..") &&
    !path.isAbsolute(relativeOutput);
  return {
    scratchRoot,
    scratchOutput: path.join(
      scratchRoot,
      insideCwd ? relativeOutput : path.basename(resolvedOutput),
    ),
  };
}

async function runCheck(
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
          // Reported paths are cwd-relative even for an absolute output.
          displayRoot: path.relative(
            process.cwd(),
            path.resolve(options.output, subdirectory),
          ),
        }),
      ),
    );
    const files = changesPerDir.flat().sort(byPath);
    return { upToDate: files.length === 0, files };
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

/**
 * Generate into a temporary location and compare it with the existing
 * output under `options.output`. Never modifies the existing files.
 * Rejects only with {@link CodegenError}.
 */
export async function check(
  options: LimitedUserConfig,
  version: string,
): Promise<CheckResult> {
  try {
    return await runCheck(options, version);
  } catch (error) {
    throw toCodegenError(error);
  }
}

export function outOfDateError(files: FileChange[]): CodegenError {
  return new CodegenError(
    ErrorCodes.outputOutOfDate,
    `Generated output is out of date (${files.length} ${files.length === 1 ? "file differs" : "files differ"}). Re-run openapi-rq without --check to update it.`,
    { files },
  );
}
