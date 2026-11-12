#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./runCli.mjs";

export type LimitedUserConfig = {
  input: string;
  output: string;
  client?: "@hey-api/client-fetch" | "@hey-api/client-axios";
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
};

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const file = await readFile(join(__dirname, "../package.json"), "utf-8");
  const packageJson = JSON.parse(file);
  process.exitCode = await runCli(process.argv, packageJson.version);
}

main();
