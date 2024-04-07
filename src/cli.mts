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
    .option("--exportSchemas <value>", "Write schemas to disk")
    .option("--postfixServices <value>", "Service name postfix", "Service")
    .option(
      "--postfixModels <value>",
      "Depreciated - now unused - left for backwards compatibility"
    )
    .option("--request <value>", "Path to custom request file")
    .option(
      "--exportCore <value>",
      "Export core - Generate Core client classes?"
    )
    .option("--exportModels <value>", "Generate models?")
    .option("--exportServices <value>", "Generate services?")
    .option("--format", "Process output folder with formatter?")
    .option("--lint", "Process output folder with linter?")
    .option("--name", "Custom client class name")
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
    /* TODO: Implement this feature - useOptions
     * currently this will not work because the options are new exports of the Services
     * we new to be able to import any of the options from each service into the queries files
     */
    // .option("--useOptions <value>", "Use options or arguments functions")
    .option("--write", "Write the files to disk (true or false)")
    // TODO: remove these options in the next major release
    .addOption(
      new Option(
        "--indent <value>",
        "Depreciated - now unused - left for backwards compatibility"
      ).hideHelp()
    )
    // TODO: remove these options in the next major release
    .addOption(
      new Option(
        "--useUnionTypes <value>",
        "Depreciated - now unused - left for backwards compatibility"
      ).hideHelp()
    )
    .parse();

  const options = program.opts<LimitedUserConfig>();

  generate(options, version);
}

setupProgram();
