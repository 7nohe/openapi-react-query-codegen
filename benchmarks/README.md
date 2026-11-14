# Benchmarks

Compares this library with other generators that turn an OpenAPI specification into TanStack Query code for React. The scripts are not part of the package and do not run in CI.

The latest run is in [results/](./results/).

## What is measured

| Measure | How |
| --- | --- |
| Install footprint | Packages and disk size the generator adds to a project that already has React, TanStack Query and TypeScript |
| Generation time | Median wall-clock time of the CLI, after one warm-up run |
| Generated output | Files and lines |
| Type-checking | Median wall-clock time of `tsc --noEmit` over the output, with TypeScript 7 and TypeScript 6 |
| Tokens in the output | All generated source files, and the largest single file |
| Tokens to use one operation | The hook plus everything its declaration names, two levels deep: once as exact ranges, once as whole files |
| Browser bundle | Three hooks and the runtime they pull in, minified with esbuild |

Three operations are sampled from each specification, the first of each kind in document order: a `GET` with one path parameter, a `GET` with query parameters and a `POST` with a body.

Tokens are counted with the `o200k_base` encoding (`gpt-tokenizer`). Other tokenizers give different absolute numbers; the comparison between tools holds.

## Tools

Defined in [tools.mjs](./tools.mjs). Each is set up to produce TanStack Query v5 code on a fetch client and otherwise keeps its defaults.

- this library
- `@hey-api/openapi-ts` with the `@tanstack/react-query` plugin
- Orval, in `single` (default) and `tags-split` mode
- Kubb with `plugin-ts`, `plugin-fetch` and `plugin-react-query`
- `openapi-typescript` with `openapi-fetch` and `openapi-react-query`

The last one generates types only, so its "hook" is the typed path entry an application passes to `$api.useQuery()`.

## Running

Node.js 24 or later, npm, and network access to the registry.

```bash
node benchmarks/run.mjs \
  --work /tmp/orqc-bench \
  --spec petstore=./examples/petstore.yaml \
  --spec github=/path/to/github.json
```

| Option | Meaning |
| --- | --- |
| `--work <dir>` | Where projects are installed and results are written (`results.json`, `results.md`) |
| `--spec <name>=<file>` | A specification to measure; repeatable |
| `--tools a,b` | Only these tool ids |
| `--steps a,b` | Any of `install`, `generate`, `typecheck`, `analyze`, `report`. Results accumulate in `results.json`, so steps and specifications can be run separately |
| `--runs <n>` | Measured runs per generation (default 5). A run that takes 30 seconds or more is measured three times |
| `--orqc <spec>` | What to install for this library: a version, a tag or a tarball path (default `@7nohe/openapi-react-query-codegen@beta`) |
| `--before <date>` | Do not install releases newer than this (default: seven days ago; `none` disables it) |

Installs run with `--ignore-scripts`.

## Reading the numbers

- State the date, the tool versions and the machine with every number. `results.md` starts with them.
- Generation time on a small specification is mostly process start-up.
- The tools do not generate the same thing: hooks, options factories or types only. The notes at the end of `results.md` say which.
