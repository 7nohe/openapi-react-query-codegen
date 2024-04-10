#!/usr/bin/env node
import { generate } from "./generate.mjs";
import { Command, Option } from "commander";
import { UserConfig } from "@hey-api/openapi-ts";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";

const program = new Command();

export type LimitedUserConfig = Omit<UserConfig, "useOptions">;

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
      "OpenAPI specification, can be a path, url or string content (required)"
    )
    .option("-o, --output <value>", "Output directory", "openapi")
    .addOption(
      new Option("-c, --client <value>", "HTTP client to generate")
        .choices(["angular", "axios", "fetch", "node", "xhr"])
        .default("fetch")
    )
    .option("--request <value>", "Path to custom request file")
    .option("--format", "Process output folder with formatter?")
    .option("--lint", "Process output folder with linter?")
    .option("--operationId", "Use operation ID to generate operation names?")
    .addOption(
      new Option(
        "--serviceResponse <value>",
        "Define shape of returned value from service calls"
      ).choices(["body", "generics", "response"])
    )
    .option(
      "--base <value>",
      "Manually set base in OpenAPI config instead of inferring from server value"
    )
    .option("--enums", "Generate JavaScript objects from enum definitions?")
    .option(
      "--useDateType",
      "Use Date type instead of string for date types for models, this will not convert the data to a Date object"
    )
    .parse();

  const options = program.opts<LimitedUserConfig>();

  generate(options, version);
}

setupProgram();
