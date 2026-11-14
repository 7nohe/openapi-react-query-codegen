#!/usr/bin/env node
// Summarises results.jsonl of run.mjs as Markdown.
//
// usage: report.mjs <work dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { variants } from "./variants.mjs";

const work = process.argv[2];
const rows = readFileSync(join(work, "results.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const median = (list) => {
  const sorted = list.filter((v) => v !== undefined).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const thousands = (n) =>
  n === undefined ? "–" : Math.round(n).toLocaleString("en-US");
const table = (head, body) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");

/** Tokens the model was sent, however they were billed. */
const input = (row) =>
  (row.inputTokens ?? 0) +
  (row.cacheReadInputTokens ?? 0) +
  (row.cacheCreationInputTokens ?? 0);
const toolCalls = (row) =>
  Object.values(row.tools ?? {}).reduce((sum, n) => sum + n, 0);

/**
 * Whether a run used the lookup its variant offers. `root-grep` has none to
 * detect: its guide is in the context from the start.
 */
const USED = {
  // For the grep recipes: whether the run read the guide at all.
  "nested-grep": /AGENTS\.md|CLAUDE\.md/,
  "nested-cli": /openapi-rq (.* )?--(list|describe)/,
  "root-cli": /openapi-rq (.* )?--(list|describe)/,
  "skill-cli": /openapi-rq (.* )?--(list|describe)/,
  "nested-index": /operations\.jsonl/,
  mcp: /^mcp__/,
};
const usedLookup = (row) =>
  USED[row.variant]
    ? (row.commands ?? []).some((command) => USED[row.variant].test(command))
    : undefined;

const summarise = (list) => [
  `${list.filter((r) => r.pass).length} / ${list.length}`,
  `$${median(list.map((r) => r.costUsd))?.toFixed(3)}`,
  thousands(median(list.map(input))),
  thousands(median(list.map((r) => r.outputTokens))),
  median(list.map((r) => r.turns)),
  median(list.map(toolCalls)),
  `${Math.round((median(list.map((r) => r.wallMs)) ?? 0) / 1000)} s`,
  list.some((r) => usedLookup(r) !== undefined)
    ? `${list.filter(usedLookup).length} / ${list.length}`
    : "–",
  list.reduce((sum, r) => sum + (r.denials ?? 0), 0),
];

const head = [
  "passed",
  "cost",
  "input tokens",
  "output tokens",
  "turns",
  "tool calls",
  "time",
  "used the lookup",
  "denials",
];
const present = variants.filter((v) => rows.some((r) => r.variant === v.id));
const tasks = [...new Set(rows.map((r) => r.task))];
const lines = [
  "# Agent runs",
  "",
  `${rows.length} runs with ${[...new Set(rows.map((r) => r.model))].join(", ")}. Medians per variant; "input tokens" counts everything the model was sent, cached or not; "passed" means the file exists, uses the expected hook and the project type-checks.`,
  "",
  "## All tasks",
  "",
  table(
    ["variant", ...head],
    present.map((v) => [
      v.id,
      ...summarise(rows.filter((r) => r.variant === v.id)),
    ]),
  ),
  ...tasks.flatMap((task) => [
    `## Task: ${task}`,
    "",
    table(
      ["variant", ...head],
      present.map((v) => [
        v.id,
        ...summarise(rows.filter((r) => r.variant === v.id && r.task === task)),
      ]),
    ),
  ]),
  "## Variants",
  "",
  ...present.map((v) => `- **${v.id}**: ${v.label}`),
  "",
];
console.log(lines.join("\n"));
