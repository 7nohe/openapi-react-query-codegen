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
export function detectImportExtension(
  startDir: string,
  host: ts.System | null = ts.sys,
): "" | ".js" {
  const configPath = findNearestTsConfigPath(startDir);
  if (!configPath) return "";
  try {
    const read = ts.readConfigFile(configPath, (host as ts.System).readFile);
    if (read.error || !read.config) return "";
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      host as ts.System,
      path.dirname(configPath),
    );
    const { moduleResolution, module } = parsed.options;
    if (moduleResolution !== undefined) {
      return moduleResolution === ts.ModuleResolutionKind.Node16 ||
        moduleResolution === ts.ModuleResolutionKind.NodeNext
        ? ".js"
        : "";
    }
    // A range, so that `node18`, `node20` and later ones count as well.
    return module !== undefined &&
      module >= ts.ModuleKind.Node16 &&
      module <= ts.ModuleKind.NodeNext
      ? ".js"
      : "";
  } catch {
    // An unusual TypeScript build without the compiler host API: fall back
    // to the bundler convention rather than failing the whole run.
    return "";
  }
}
