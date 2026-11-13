#!/usr/bin/env node
// Compares this library with other OpenAPI → TanStack Query generators.
// See README.md in this directory for what is measured and how to run it.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { cpus, platform, release } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs, stripVTControlCharacters } from "node:util";
import { createAnalyzer, outputSize } from "./analyze.mjs";
import { report } from "./report.mjs";
import { BASE, tools as defineTools } from "./tools.mjs";

const STEPS = ["install", "generate", "typecheck", "analyze", "report"];
const { values } = parseArgs({
  options: {
    work: { type: "string" },
    spec: { type: "string", multiple: true },
    tools: { type: "string" },
    steps: { type: "string" },
    runs: { type: "string", default: "5" },
    orqc: {
      type: "string",
      default: "@7nohe/openapi-react-query-codegen@beta",
    },
    before: { type: "string" },
  },
});
if (!values.work || !values.spec?.length) {
  console.error(
    "usage: run.mjs --work <dir> --spec <name>=<file> [--spec …] [--tools a,b] [--steps a,b] [--runs 5] [--orqc <package spec>] [--before <ISO date>|none]",
  );
  process.exit(2);
}

const work = resolve(values.work);
const harness = join(work, "_harness");
const steps = values.steps ? values.steps.split(",") : STEPS;
const runs = Number(values.runs);
const specs = values.spec.map((entry) => {
  const [name, file] = entry.split("=");
  return { name, file: resolve(file) };
});
const allTools = defineTools({ orqc: values.orqc });
const tools = values.tools
  ? allTools.filter((t) => values.tools.split(",").includes(t.id))
  : allTools;
// Releases younger than this are not installed, as everywhere in this repository.
const before =
  values.before === "none"
    ? undefined
    : (values.before ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

mkdirSync(work, { recursive: true });
const resultsPath = join(work, "results.json");
const results = existsSync(resultsPath)
  ? JSON.parse(readFileSync(resultsPath, "utf8"))
  : { install: {}, pairs: {} };
const save = () =>
  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

const log = (message) => console.error(`[bench] ${message}`);
const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    error: result.error,
  };
}

function timed(command, args, options) {
  const start = performance.now();
  const result = sh(command, args, options);
  return { ...result, ms: performance.now() - start };
}

function npmInstall(dir, packages, dev = false) {
  const result = sh(
    "npm",
    [
      "install",
      ...(dev ? ["-D"] : []),
      "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      ...(before ? ["--before", before] : []),
      ...packages,
    ],
    { cwd: dir },
  );
  if (result.status !== 0) {
    throw new Error(
      `npm install failed in ${dir}:\n${result.output.slice(-2000)}`,
    );
  }
}

function footprint(dir) {
  const listed = sh("npm", ["ls", "--all", "--parseable"], { cwd: dir });
  const packages = listed.output.split("\n").filter(Boolean).length - 1;
  const size = sh("du", ["-sk", "node_modules"], { cwd: dir });
  return { packages, kilobytes: Number(size.output.split(/\s/)[0]) };
}

function freshProject(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "bench", private: true, type: "module" }, null, 2)}\n`,
  );
}

function install() {
  log("installing the harness");
  freshProject(harness);
  npmInstall(harness, [
    "typescript@7",
    "ts6@npm:typescript@6",
    "gpt-tokenizer",
    "esbuild",
    "yaml",
  ]);
  for (const tool of tools) {
    if (results.install[tool.project]?.fresh) continue;
    log(`installing ${tool.project}`);
    const dir = join(work, tool.project);
    freshProject(dir);
    npmInstall(dir, [...BASE, `typescript@${tool.typescript}`]);
    const base = footprint(dir);
    npmInstall(dir, tool.install, true);
    const full = footprint(dir);
    const manifest = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    );
    const versions = {};
    for (const name of Object.keys(manifest.devDependencies ?? {})) {
      versions[name] = JSON.parse(
        readFileSync(join(dir, "node_modules", name, "package.json"), "utf8"),
      ).version;
    }
    results.install[tool.project] = {
      fresh: true,
      typescript: JSON.parse(
        readFileSync(join(dir, "node_modules/typescript/package.json"), "utf8"),
      ).version,
      versions,
      addedPackages: full.packages - base.packages,
      addedKilobytes: full.kilobytes - base.kilobytes,
    };
    save();
  }
  for (const entry of Object.values(results.install)) delete entry.fresh;
  save();
}

const outOf = (tool, spec) => `out/${tool.id}/${spec.name}`;
const pair = (tool, spec) => {
  const key = `${tool.id}/${spec.name}`;
  results.pairs[key] ??= { tool: tool.id, spec: spec.name };
  return results.pairs[key];
};

function generate() {
  for (const spec of specs) {
    for (const tool of tools) {
      const dir = join(work, tool.project);
      const out = outOf(tool, spec);
      const entry = pair(tool, spec);
      const context = { dir, spec: spec.file, out };
      const { bin, args } = tool.generate(context);
      const script = realpathSync(join(dir, "node_modules/.bin", bin));
      const once = () => {
        rmSync(join(dir, out), { recursive: true, force: true });
        return timed(process.execPath, [script, ...args], {
          cwd: dir,
          timeout: 20 * 60 * 1000,
        });
      };
      log(`generate ${tool.id} / ${spec.name}`);
      const first = once();
      if (first.status !== 0 || !existsSync(join(dir, out))) {
        entry.generate = {
          failed: true,
          output: stripVTControlCharacters(first.output).slice(-600),
        };
        delete entry.output;
        save();
        continue;
      }
      // The first run warms the file cache. A run that takes half a minute is
      // measured three times in total instead of being repeated `runs` times.
      const slow = first.ms >= 30_000;
      const times = slow ? [first.ms] : [];
      const count = slow ? 2 : runs;
      for (let i = 0; i < count; i++) times.push(once().ms);
      tool.afterGenerate?.(context);
      entry.generate = {
        medianMs: Math.round(median(times)),
        minMs: Math.round(Math.min(...times)),
        runs: times.length,
      };
      entry.output = outputSize(join(dir, out));
      save();
    }
  }
}

function typecheck() {
  const compilers = [
    { name: "ts7", script: join(harness, "node_modules/typescript/bin/tsc") },
    { name: "ts6", script: join(harness, "node_modules/ts6/bin/tsc") },
  ];
  for (const spec of specs) {
    for (const tool of tools) {
      const entry = pair(tool, spec);
      if (!entry.output) continue;
      const dir = join(work, tool.project);
      const config = `tsconfig.${tool.id}.${spec.name}.json`;
      writeFileSync(
        join(dir, config),
        `${JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["ES2022", "DOM", "DOM.Iterable"],
              module: "ESNext",
              moduleResolution: "Bundler",
              jsx: "react-jsx",
              strict: true,
              noEmit: true,
              skipLibCheck: true,
              types: [],
            },
            include: [outOf(tool, spec)],
          },
          null,
          2,
        )}\n`,
      );
      entry.typecheck = {};
      for (const compiler of compilers) {
        log(`typecheck ${tool.id} / ${spec.name} with ${compiler.name}`);
        const once = () =>
          timed(process.execPath, [compiler.script, "-p", config], {
            cwd: dir,
            timeout: 20 * 60 * 1000,
          });
        const first = once();
        const times = [first.ms];
        if (first.ms < 60_000) times.push(once().ms, once().ms);
        const errors = first.output.match(/error TS\d+/g) ?? [];
        entry.typecheck[compiler.name] = {
          medianMs: Math.round(median(times)),
          errors: errors.length,
          firstErrors: first.output
            .split("\n")
            .filter((line) => /error TS\d+/.test(line))
            .slice(0, 3)
            .map((line) => line.slice(0, 240)),
        };
        save();
      }
    }
  }
}

/** Three operations an application would typically call, in document order. */
function sampleOperations(file) {
  const { parse } = createRequire(join(harness, "package.json"))("yaml");
  const document = parse(readFileSync(file, "utf8"), { maxAliasCount: -1 });
  const all = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = item?.[method];
      if (!operation?.operationId) continue;
      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ];
      all.push({
        id: operation.operationId,
        method,
        path,
        pathParams: (path.match(/\{/g) ?? []).length,
        hasQuery: parameters.some((p) => p?.in === "query"),
        hasBody: Boolean(operation.requestBody),
      });
    }
  }
  const pick = (test) => all.find(test);
  const picked = [
    pick(
      (o) => o.method === "get" && o.pathParams === 1 && o.path.endsWith("}"),
    ),
    pick((o) => o.method === "get" && o.pathParams === 0 && o.hasQuery),
    pick((o) => o.method === "post" && o.pathParams === 0 && o.hasBody),
  ].filter(Boolean);
  return { operations: all.length, picked };
}

function analyze() {
  const analyzer = createAnalyzer(harness);
  results.specs ??= {};
  for (const spec of specs) {
    const { operations, picked } = sampleOperations(spec.file);
    results.specs[spec.name] = {
      bytes: statSync(spec.file).size,
      operations,
      sampled: picked.map(
        (o) => `${o.method.toUpperCase()} ${o.path} (${o.id})`,
      ),
    };
    for (const tool of tools) {
      const entry = pair(tool, spec);
      if (!entry.output) continue;
      log(`analyze ${tool.id} / ${spec.name}`);
      entry.analysis = analyzer.analyze({
        dir: join(work, tool.project),
        out: outOf(tool, spec),
        tool,
        operations: picked,
      });
      save();
    }
  }
}

results.environment = {
  date: new Date().toISOString().slice(0, 10),
  node: process.version,
  os: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  releasedBefore: before ?? "no limit",
  tokenizer: "o200k_base (gpt-tokenizer)",
};

if (steps.includes("install")) install();
if (steps.includes("generate")) generate();
if (steps.includes("typecheck")) typecheck();
if (steps.includes("analyze")) analyze();
save();
if (steps.includes("report")) {
  const markdown = report(results, allTools);
  writeFileSync(join(work, "results.md"), markdown);
  console.log(markdown);
}
