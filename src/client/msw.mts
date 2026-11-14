import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { MswMajor } from "./emitMocks.mjs";

/**
 * The major version of MSW the project in `cwd` has installed, which decides
 * where the generated handlers import `http` from. Version 3 when MSW is not
 * installed yet: that is what installing it now gives.
 */
export function detectMswMajor(cwd: string): {
  major: MswMajor;
  /** Set when the installed version cannot run the handlers. */
  warning?: string;
} {
  let version: unknown;
  try {
    const require = createRequire(path.join(cwd, "package.json"));
    version = JSON.parse(
      readFileSync(require.resolve("msw/package.json"), "utf-8"),
    ).version;
  } catch {
    return { major: 3 };
  }
  const major = Number.parseInt(String(version), 10);
  if (major >= 3) return { major: 3 };
  if (major === 2) return { major: 2 };
  return {
    major: 2,
    warning: `--mock: the handlers need MSW 2 or later, and version ${String(version)} is installed.`,
  };
}
