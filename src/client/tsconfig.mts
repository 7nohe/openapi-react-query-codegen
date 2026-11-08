import { readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Find the tsconfig that applies to the generated output by walking up from
 * `startDir`. Anchoring the search at the caller's directory finds the
 * tsconfig the caller's own `tsc` will use.
 */
export function findNearestTsConfigPath(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidates = readdirSync(dir).filter(
      (file) => file.startsWith("tsconfig") && file.endsWith(".json"),
    );
    if (candidates.length > 0) {
      candidates.sort((a) => (a === "tsconfig.json" ? -1 : 1));
      return path.join(dir, candidates[0]);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Relative imports must spell out `.js` under Node16/NodeNext module
 * resolution and must not under bundler-style resolution. Read the caller's
 * tsconfig to pick the matching convention.
 */
export function detectImportExtension(startDir: string): "" | ".js" {
  const configPath = findNearestTsConfigPath(startDir);
  if (!configPath) return "";
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return "";
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
  );
  const { moduleResolution, module } = parsed.options;
  if (moduleResolution !== undefined) {
    return moduleResolution === ts.ModuleResolutionKind.Node16 ||
      moduleResolution === ts.ModuleResolutionKind.NodeNext
      ? ".js"
      : "";
  }
  return module === ts.ModuleKind.Node16 || module === ts.ModuleKind.NodeNext
    ? ".js"
    : "";
}
