import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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
 * Parse a tsconfig, which is JSON with comments and trailing commas. Done here
 * and not with the `typescript` package, so that the generator works with
 * whatever TypeScript the project has: version 7 has no API to read a config.
 */
function parseJsonWithComments(text: string): unknown {
  let json = "";
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      // A string, copied as it is so that nothing inside it is touched.
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }
      json += text.slice(index, end + 1);
      index = end + 1;
    } else if (char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      json += char;
      index += 1;
    }
  }
  // The comments are gone, so a comma before a closing bracket is a trailing
  // one. Strings are skipped as a whole by the first alternative.
  return JSON.parse(
    json.replace(/("(?:[^"\\]|\\.)*")|,(\s*[}\]])/g, (_match, string, close) =>
      string === undefined ? close : string,
    ),
  );
}

/** Where an `extends` entry points to, the way TypeScript looks it up. */
function resolveExtends(target: string, from: string): string | undefined {
  if (target.startsWith(".") || path.isAbsolute(target)) {
    const file = path.resolve(path.dirname(from), target);
    return [file, `${file}.json`].find(
      (candidate) => candidate.endsWith(".json") && existsSync(candidate),
    );
  }
  // A package: its `exports`, or else the file itself or its tsconfig.json.
  const require = createRequire(from);
  for (const candidate of [
    target,
    `${target}.json`,
    `${target}/tsconfig.json`,
  ]) {
    try {
      const file = require.resolve(candidate);
      if (file.endsWith(".json")) return file;
    } catch {
      // Not this spelling.
    }
  }
  return undefined;
}

type ModuleOptions = { module?: string; moduleResolution?: string };

/** `module` and `moduleResolution` of a tsconfig, with what it extends. */
function readModuleOptions(
  configPath: string,
  // The files on the way here, so that a circle of `extends` ends.
  chain: ReadonlySet<string> = new Set(),
): ModuleOptions {
  if (chain.has(configPath)) return {};
  const config = parseJsonWithComments(readFileSync(configPath, "utf-8")) as {
    extends?: unknown;
    compilerOptions?: Record<string, unknown>;
  } | null;
  if (!config || typeof config !== "object") return {};

  const options: ModuleOptions = {};
  const apply = (source: ModuleOptions) => {
    for (const key of ["module", "moduleResolution"] as const) {
      if (source[key] !== undefined) options[key] = source[key];
    }
  };
  // Later entries win over earlier ones, and the file itself over all of them.
  const parents = Array.isArray(config.extends)
    ? config.extends
    : [config.extends];
  for (const parent of parents) {
    if (typeof parent !== "string") continue;
    const file = resolveExtends(parent, configPath);
    if (file === undefined) continue;
    try {
      apply(readModuleOptions(file, new Set(chain).add(configPath)));
    } catch {
      // A parent that cannot be read adds nothing.
    }
  }
  const own = config.compilerOptions ?? {};
  apply({
    module:
      typeof own.module === "string" ? own.module.toLowerCase() : undefined,
    moduleResolution:
      typeof own.moduleResolution === "string"
        ? own.moduleResolution.toLowerCase()
        : undefined,
  });
  return options;
}

/**
 * Relative imports must spell out `.js` under Node16/NodeNext module
 * resolution and must not under bundler-style resolution. Read the caller's
 * tsconfig to pick the matching convention.
 */
export function detectImportExtension(startDir: string): "" | ".js" {
  const configPath = findNearestTsConfigPath(startDir);
  if (!configPath) return "";
  let options: ModuleOptions;
  try {
    options = readModuleOptions(configPath);
  } catch {
    // A tsconfig that cannot be read: fall back to the bundler convention
    // rather than failing the whole run.
    return "";
  }
  if (options.moduleResolution !== undefined) {
    return options.moduleResolution === "node16" ||
      options.moduleResolution === "nodenext"
      ? ".js"
      : "";
  }
  // `node16`, `node18`, `node20` and later ones resolve the Node way.
  return /^node(1[6-9]|[2-9]\d|next)$/.test(options.module ?? "") ? ".js" : "";
}
