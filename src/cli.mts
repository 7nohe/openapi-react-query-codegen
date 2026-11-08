#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { defaultOutputPath } from "./constants.mjs";
import { generate } from "./generate.mjs";

/**
 * `fetch` and `axios` select the generated HTTP client. The `@hey-api/*`
 * spellings are accepted as deprecated aliases for v3 command lines.
 */
export type ClientChoice =
  | "fetch"
  | "axios"
  | "@hey-api/client-fetch"
  | "@hey-api/client-axios";

const program = new Command();

export type LimitedUserConfig = {
  input: string;
  output: string;
  client?: ClientChoice;
  format?: "biome" | "prettier";
  lint?: "biome" | "eslint";
  noOperationId?: boolean;
  enums?: "javascript" | "typescript" | false;
  debug?: boolean;
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string | number;
  omitInitialPageParam?: boolean;
};

async function setupProgram() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const file = await readFile(join(__dirname, "../package.json"), "utf-8");
  const packageJson = JSON.parse(file);
  const version = packageJson.version;

  program
    .name("openapi-rq")
    .version(version)
    .description("Generate React Query code based on OpenAPI")
    .requiredOption(
      "-i, --input <value>",
      "OpenAPI specification, can be a path, url or string content (required)",
    )
    .option("-o, --output <value>", "Output directory", defaultOutputPath)
    .addOption(
      new Option("-c, --client <value>", "HTTP client to generate")
        .choices([
          "fetch",
          "axios",
          "@hey-api/client-fetch",
          "@hey-api/client-axios",
        ])
        .default("fetch"),
    )
    .addOption(
      new Option(
        "--format <value>",
        "Process output folder with formatter?",
      ).choices(["biome", "prettier"]),
    )
    .addOption(
      new Option(
        "--lint <value>",
        "Process output folder with linter?",
      ).choices(["biome", "eslint"]),
    )
    .option(
      "--noOperationId",
      "Do not use operationId to generate operation names",
    )
    .addOption(
      new Option(
        "--enums <value>",
        "Generate JavaScript objects from enum definitions?",
      ).choices(["javascript", "typescript"]),
    )
    .option("--debug", "Run in debug mode?")
    .option(
      "--pageParam <value>",
      "Name of the query parameter used for pagination",
      "page",
    )
    .option(
      "--nextPageParam <value>",
      "Name of the response parameter used for next page",
      "nextPage",
    )
    .option("--initialPageParam <value>", "Initial page value to query", "1")
    .option(
      "--omitInitialPageParam",
      "Send no initial page parameter at all (overrides --initialPageParam)",
    )
    .parse();

  const options = program.opts<LimitedUserConfig>();

  await generate(options, version);
}

setupProgram();
