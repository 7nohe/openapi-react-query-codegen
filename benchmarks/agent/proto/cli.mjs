#!/usr/bin/env node
// Prototype of `openapi-rq --list` and `--describe`: answers from records built
// beforehand, and hands every other invocation to the real CLI.
import { readFileSync } from "node:fs";
import { describe, listLine, search } from "./records.mjs";

const args = process.argv.slice(2);
const flag = args.find((arg) => arg === "--list" || arg === "--describe");
if (!flag) {
  await import("../@7nohe/openapi-react-query-codegen/dist/cli.mjs");
} else {
  const records = readFileSync(
    new URL("./operations.jsonl", import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const words = args
    .slice(args.indexOf(flag) + 1)
    .filter((a) => !a.startsWith("-"));
  if (flag === "--describe") {
    const record = records.find((r) => r.id === words[0]);
    if (!record) {
      const near = search(records, words)
        .slice(0, 10)
        .map((r) => r.id);
      console.error(
        `No operation named ${words[0] ?? "(none)"}.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Try --list <words>."}`,
      );
      process.exit(1);
    }
    console.log(describe(record));
  } else {
    const found = search(records, words);
    const shown = found.slice(0, 30);
    console.log(shown.map(listLine).join("\n"));
    if (found.length > shown.length) {
      console.log(
        `… ${found.length - shown.length} more; add a word to narrow the list.`,
      );
    }
    if (found.length === 0) console.log("No operation matches.");
  }
}
