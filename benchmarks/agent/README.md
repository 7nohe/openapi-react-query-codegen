# Agent runs

Measures what it costs a coding agent to use the generated client, and whether telling it how to look operations up changes that. The static numbers in [../README.md](../README.md) say how many tokens the output holds; this says what an agent actually spends.

`run.mjs` copies a template project once per run, adds the files of one variant ([variants.mjs](./variants.mjs)), gives Claude Code a task in headless mode and records cost, tokens, turns and tool calls. A run passes when the file the task asks for exists, uses the expected hook and the project type-checks.

`agents-md` runs the package's own `--agentsMd` from this checkout (`dist/cli.mjs`, so build first). The other lookups under test (`--list`, `--describe`, `operations.jsonl`, an MCP server) are prototypes in [proto/](./proto/) and [records.mjs](./records.mjs), not features of the package.

## Running

The template is a project with `node_modules` installed (the package, React, TanStack Query, TypeScript), the specification as `openapi.json`, a `codegen` script and its output in `src/openapi`. The tasks in `run.mjs` are written for the GitHub REST API description.

```bash
node benchmarks/agent/run.mjs --work /tmp/orqc-agent --template /path/to/template --reps 2
node benchmarks/agent/report.mjs /tmp/orqc-agent
```

| Option | Meaning |
| --- | --- |
| `--variants a,b`, `--tasks a,b` | Only these |
| `--reps <n>` | Runs per task and variant (default 3). Finished runs in `results.jsonl` are skipped |
| `--parallel <n>` | Runs at a time (default 3) |
| `--model <id>` | Model (default `claude-sonnet-5-5`) |
| `--quota <share>` | Start no further run once this share of the weekly allowance is used (default 0.45) |

Runs use your Claude Code login. User settings, plugins, memory and MCP servers are switched off, and shell commands outside a small allowlist are denied.

The latest results are in [results/](./results/).
