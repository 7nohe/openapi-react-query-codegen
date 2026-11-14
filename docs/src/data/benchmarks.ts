// The numbers the site shows, read from the benchmark results in the
// repository when the site is built. Point these two imports at new result
// files to update every chart and table.

import agentRows from "../../../benchmarks/agent/results/2026-11-14.jsonl?raw";
import results from "../../../benchmarks/results/2026-11-13.json";

type Pair = {
  generate?: { medianMs?: number; failed?: boolean };
  output?: { files: number; lines: number };
  typecheck?: Record<string, { medianMs: number; errors: number }>;
};

/** The tools in the order they are shown, this library first. */
export const tools = [
  { id: "orqc", name: "openapi-react-query-codegen", own: true },
  { id: "openapi-ts", name: "openapi-typescript", own: false },
  { id: "kubb", name: "Kubb", own: false },
  { id: "hey-api", name: "@hey-api/openapi-ts", own: false },
  { id: "orval", name: "Orval", own: false },
] as const;

export const specs = {
  petstore: "Petstore",
  stripe: "Stripe",
  github: "GitHub",
} as const;
export type SpecId = keyof typeof specs;

const pairs = results.pairs as Record<string, Pair>;
const installs = results.install as Record<
  string,
  {
    versions: Record<string, string>;
    addedPackages: number;
    addedKilobytes: number;
  }
>;

export const environment = results.environment;
export const operations = (spec: SpecId) => results.specs[spec].operations;

/** The version of this library the results were measured with. */
export const ownVersion = Object.values(installs.orqc.versions)[0];

export const versions = tools.map((tool) => ({
  ...tool,
  versions: Object.entries(installs[tool.id].versions)
    .map(([name, version]) => `${name} ${version}`)
    .join(", "),
}));

/** Median wall-clock time of one generation, in seconds. */
export const generationSeconds = (spec: SpecId) =>
  tools.map((tool) => ({
    ...tool,
    value: (pairs[`${tool.id}/${spec}`]?.generate?.medianMs ?? 0) / 1000,
  }));

/** Packages the generator adds to a project that has React and TanStack Query. */
export const addedPackages = tools.map((tool) => ({
  ...tool,
  value: installs[tool.id].addedPackages,
}));

/** Type errors `tsc` reports in the generated output (TypeScript 7). */
export const typeErrors = (spec: SpecId) =>
  tools.map((tool) => ({
    ...tool,
    value: pairs[`${tool.id}/${spec}`]?.typecheck?.ts7?.errors ?? 0,
  }));

type AgentRow = {
  variant: string;
  model: string;
  pass: boolean;
  turns: number;
  costUsd: number;
  inputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const agent: AgentRow[] = agentRows
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

/** Medians of the agent runs of one model and variant. */
export function agentRuns(model: string, variant: string) {
  const rows = agent.filter(
    (row) => row.model === model && row.variant === variant,
  );
  return {
    runs: rows.length,
    passed: rows.filter((row) => row.pass).length,
    turns: median(rows.map((row) => row.turns)),
    costUsd: median(rows.map((row) => row.costUsd)),
    inputTokens: median(
      rows.map(
        (row) =>
          (row.inputTokens ?? 0) +
          (row.cacheReadInputTokens ?? 0) +
          (row.cacheCreationInputTokens ?? 0),
      ),
    ),
  };
}
