#!/usr/bin/env node
// Gives a coding agent small tasks in a project that uses a large generated
// client, once per way of telling it how to look operations up, and records
// what each run cost and whether the result type-checks.
//
// usage: run.mjs --work <dir> --template <dir> [--variants a,b] [--tasks a,b]
//                [--reps 3] [--parallel 3] [--model claude-sonnet-5-5]
//
// `--template` is a project with `node_modules` installed, `openapi.json` and
// the generated client in `src/openapi` (see README.md).
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildRecords } from "./records.mjs";
import { variants as allVariants, installPrototypes } from "./variants.mjs";

const { values } = parseArgs({
  options: {
    work: { type: "string" },
    template: { type: "string" },
    variants: { type: "string" },
    tasks: { type: "string" },
    reps: { type: "string", default: "3" },
    parallel: { type: "string", default: "3" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    // Start no further run once this share of the weekly allowance is used.
    quota: { type: "string", default: "0.45" },
  },
});
if (!values.work || !values.template) {
  console.error("usage: run.mjs --work <dir> --template <dir> [options]");
  process.exit(2);
}
const work = resolve(values.work);
const template = resolve(values.template);

const SUFFIX =
  " Use the generated API hooks in src/openapi. Do not change anything under src/openapi. Finish when `npx tsc --noEmit` passes.";
/** Tasks against the GitHub REST API description. */
const allTasks = [
  {
    id: "issues",
    file: "src/RepoIssues.tsx",
    uses: /\buseIssuesListForRepo(Suspense|Infinite|SuspenseInfinite)?\b|\bissuesListForRepo(Infinite)?Options\b/,
    prompt: `Create src/RepoIssues.tsx exporting a React component \`RepoIssues({ owner, repo }: { owner: string; repo: string })\` that lists the titles of the repository's open issues.${SUFFIX}`,
  },
  {
    id: "star",
    file: "src/StarButton.tsx",
    uses: /\buseActivityStarRepoForAuthenticatedUser\b/,
    prompt: `Create src/StarButton.tsx exporting a React component \`StarButton({ owner, repo }: { owner: string; repo: string })\`: a button that stars the repository for the signed-in user when clicked.${SUFFIX}`,
  },
  {
    id: "search",
    file: "src/RepoSearch.tsx",
    uses: /\buseSearchRepos(Suspense|Infinite|SuspenseInfinite)?\b|\bsearchRepos(Infinite)?Options\b/,
    prompt: `Create src/RepoSearch.tsx exporting a React component \`RepoSearch({ query }: { query: string })\` that searches repositories and lists each result's full name with its star count.${SUFFIX}`,
  },
  {
    id: "merge",
    file: "src/MergeButton.tsx",
    uses: /\busePullsMerge\b[\s\S]*\busePullsGet(Suspense)?\b|\busePullsGet(Suspense)?\b[\s\S]*\busePullsMerge\b|\bpullsGetOptions\b[\s\S]*\busePullsMerge\b|\busePullsMerge\b[\s\S]*\bpullsGetOptions\b/,
    prompt: `Create src/MergeButton.tsx exporting a React component \`MergeButton({ owner, repo, pullNumber }: { owner: string; repo: string; pullNumber: number })\` that shows the pull request's title and whether it is mergeable, with a button that merges it using the squash method.${SUFFIX}`,
  },
  {
    id: "rerun",
    file: "src/RerunFailed.tsx",
    uses: /\buseActionsReRunWorkflowFailedJobs\b/,
    prompt: `Create src/RerunFailed.tsx exporting a React component \`RerunFailed({ owner, repo, runId }: { owner: string; repo: string; runId: number })\`: a button that re-runs only the failed jobs of that GitHub Actions workflow run.${SUFFIX}`,
  },
];

const pick = (all, ids) =>
  ids ? all.filter((item) => ids.split(",").includes(item.id)) : all;
const variants = pick(allVariants, values.variants);
const tasks = pick(allTasks, values.tasks);

const ALLOWED = [
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  ...["npx tsc", "npx openapi-rq", "npm run typecheck", "npm run codegen"].map(
    (command) => `Bash(${command}:*)`,
  ),
  ...[
    "grep",
    "rg",
    "ls",
    "cat",
    "head",
    "tail",
    "wc",
    "sed",
    "awk",
    "find",
    "cut",
    "sort",
    "uniq",
    "jq",
  ].map((command) => `Bash(${command}:*)`),
];
const DISALLOWED = ["WebSearch", "WebFetch"];
const WALL_MS = 10 * 60 * 1000;

mkdirSync(join(work, "logs"), { recursive: true });
mkdirSync(join(work, "runs"), { recursive: true });
const resultsPath = join(work, "results.jsonl");
const done = new Set(
  existsSync(resultsPath)
    ? readFileSync(resultsPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line).run)
    : [],
);

console.error("[agent] building the records");
const records = await buildRecords(
  join(template, "node_modules/@7nohe/openapi-react-query-codegen/dist"),
  join(template, "openapi.json"),
);
installPrototypes(template, records);

const GENERATED = [
  "src/openapi/queries/queries.ts",
  "src/openapi/requests/types.gen.ts",
];
const sizes = (project) =>
  GENERATED.map((file) => statSync(join(project, file)).size).join(",");

/** What the stream of one `claude -p` run says it did. */
function readStream(path) {
  const tools = {};
  const commands = [];
  const seen = new Set();
  let result = {};
  let init = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "system" && event.subtype === "init") {
      init = {
        skills: event.skills,
        mcp: (event.mcp_servers ?? []).map((s) => `${s.name}:${s.status}`),
        memory: event.memory_paths,
      };
    }
    if (event.type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type !== "tool_use" || seen.has(block.id)) continue;
        seen.add(block.id);
        tools[block.name] = (tools[block.name] ?? 0) + 1;
        const input = block.input ?? {};
        commands.push(
          `${block.name} ${input.command ?? input.pattern ?? input.file_path ?? input.skill ?? JSON.stringify(input)}`.slice(
            0,
            240,
          ),
        );
      }
    }
    if (event.type === "rate_limit_event") {
      const used =
        event.rate_limit_info?.unifiedWindows?.seven_day?.utilization;
      if (used !== undefined) result.weeklyUse = used;
    }
    if (event.type === "result") {
      const usage = {};
      for (const model of Object.values(event.modelUsage ?? {})) {
        for (const key of [
          "inputTokens",
          "outputTokens",
          "cacheReadInputTokens",
          "cacheCreationInputTokens",
        ]) {
          usage[key] = (usage[key] ?? 0) + (model[key] ?? 0);
        }
      }
      result = {
        ...result,
        costUsd: event.total_cost_usd,
        turns: event.num_turns,
        durationMs: event.duration_ms,
        isError: event.is_error,
        stop: event.subtype,
        denials: (event.permission_denials ?? []).length,
        ...usage,
      };
    }
  }
  return { tools, commands, init, ...result };
}

function check(project, task, before) {
  const path = join(project, task.file);
  const written = existsSync(path);
  const source = written ? readFileSync(path, "utf8") : "";
  const tsc = spawnSync(
    process.execPath,
    [join(project, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "."],
    { cwd: project, encoding: "utf8" },
  );
  const usesHook = task.uses.test(source);
  const untouched = sizes(project) === before;
  return {
    written,
    usesHook,
    typechecks: tsc.status === 0,
    untouched,
    pass: written && usesHook && tsc.status === 0 && untouched,
    source,
    tscOutput: tsc.status === 0 ? "" : `${tsc.stdout}`.slice(0, 600),
  };
}

function runOne(variant, task, rep) {
  const run = `${variant.id}__${task.id}__${rep}`;
  const project = join(work, "runs", run);
  rmSync(project, { recursive: true, force: true });
  // `-c` clones on APFS, so a copy of the template costs next to nothing.
  const copied = spawnSync("cp", ["-cR", template, project]);
  if (copied.status !== 0) spawnSync("cp", ["-R", template, project]);
  variant.apply(project);
  const before = sizes(project);

  const stream = join(work, "logs", `${run}.jsonl`);
  const args = [
    "-p",
    task.prompt,
    "--model",
    values.model,
    "--max-turns",
    "50",
    "--max-budget-usd",
    "2",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
    "--strict-mcp-config",
    "--setting-sources",
    "project,local",
    "--no-session-persistence",
    ...(variant.flags ?? []),
    "--allowedTools",
    ...ALLOWED,
    ...(variant.allow ?? []),
    "--disallowedTools",
    ...DISALLOWED,
  ];
  const env = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
  delete env.CLAUDECODE;
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn("claude", args, {
      cwd: project,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(createWriteStream(stream));
    child.stderr.pipe(createWriteStream(`${stream}.stderr`));
    const timer = setTimeout(() => child.kill("SIGTERM"), WALL_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const row = {
        run,
        variant: variant.id,
        task: task.id,
        rep,
        model: values.model,
        exit: code,
        wallMs: Date.now() - started,
        ...readStream(stream),
        ...check(project, task, before),
      };
      appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
      rmSync(project, { recursive: true, force: true });
      console.error(
        `[agent] ${run}: ${row.pass ? "pass" : "FAIL"} $${row.costUsd?.toFixed(3)} ${row.turns} turns ${Math.round(row.wallMs / 1000)}s`,
      );
      done(row);
    });
  });
}

const queue = [];
for (let rep = 1; rep <= Number(values.reps); rep++) {
  for (const task of tasks) {
    for (const variant of variants) {
      if (!done.has(`${variant.id}__${task.id}__${rep}`)) {
        queue.push([variant, task, rep]);
      }
    }
  }
}
console.error(`[agent] ${queue.length} runs to go`);
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const row = await runOne(...next);
      if ((row.weeklyUse ?? 0) >= Number(values.quota)) {
        console.error(`[agent] weekly use ${row.weeklyUse}: stopping`);
        queue.length = 0;
      }
    }
  }),
);
