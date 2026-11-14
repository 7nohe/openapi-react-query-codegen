#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./runCli.mjs";

/**
 * `fetch` and `axios` select the generated HTTP client. The `@hey-api/*`
 * spellings are accepted as deprecated aliases for v3 command lines.
 */
export type ClientChoice =
  | "fetch"
  | "axios"
  | "@hey-api/client-fetch"
  | "@hey-api/client-axios";

export type LimitedUserConfig = {
  input: string;
  output: string;
  client?: ClientChoice;
  format?: "biome" | "prettier";
  lint?: "biome" | "eslint";
  noOperationId?: boolean;
  enums?: "javascript" | "typescript" | false;
  useDateType?: boolean;
  debug?: boolean;
  noSchemas?: boolean;
  schemaType?: "form" | "json";
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string | number;
  omitInitialPageParam?: boolean;
  /** `--mock`: also generate mock data and request handlers for this library. */
  mock?: "msw";
  /** `--agentsMd`: the file to keep the agent guide in, or `true` for `AGENTS.md`. */
  agentsMd?: string | boolean;
};

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const file = await readFile(join(__dirname, "../package.json"), "utf-8");
  const packageJson = JSON.parse(file);
  process.exitCode = await runCli(process.argv, packageJson.version);
}

main();
