#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import { defaultOutputPath } from "./constants.mjs";
import { generate } from "./generate.mjs";

const program = new Command();

export type LimitedUserConfig = {
  input: string;
  output: string;
  client?: "@hey-api/client-fetch" | "@hey-api/client-axios";
  format?: "biome" | "prettier";
  lint?: "biome" | "eslint";
  operationId?: boolean;
  serviceResponse?: "body" | "response";
  enums?: "javascript" | "typescript" | false;
  useDateType?: boolean;
  debug?: boolean;
  noSchemas?: boolean;
  schemaType?: "form" | "json";
  pageParam: string;
  nextPageParam: string;
  initialPageParam: string | number;
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
        .choices(["@hey-api/client-fetch", "@hey-api/client-axios"])
        .default("@hey-api/client-fetch"),
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
    .option("--operationId", "Use operation ID to generate operation names?")
    .addOption(
      new Option(
        "--serviceResponse <value>",
        "Define shape of returned value from service calls",
      )
        .choices(["body", "response"])
        .default("body"),
    )
    .addOption(
      new Option(
        "--enums <value>",
        "Generate JavaScript objects from enum definitions?",
      ).choices(["javascript", "typescript"]),
    )
    .option(
      "--useDateType",
      "Use Date type instead of string for date types for models, this will not convert the data to a Date object",
    )
    .option("--debug", "Run in debug mode?")
    .option("--noSchemas", "Disable generating JSON schemas")
    .addOption(
      new Option(
        "--schemaType <value>",
        "Type of JSON schema [Default: 'json']",
      ).choices(["form", "json"]),
    )
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
    .parse();

  const options = program.opts<LimitedUserConfig>();

  await generate(options, version);
}

setupProgram();
