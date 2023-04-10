#!/usr/bin/env node
import { generate } from "./generate";
import { Command } from "commander";
import packageJson from "../package.json";
import { Options } from "openapi-typescript-codegen";

export type CLIOptions = {
  output?: string;
  client?: Options["httpClient"];
} & Pick<Options, 'exportSchemas' | 'postfixModels' | 'postfixServices' | 'request' | 'indent' | 'input' | 'useUnionTypes'>;

const program = new Command();

program
  .name("openapi-rq")
  .version(packageJson.version)
  .description("Generate React Query code based on OpenAPI")
  .requiredOption(
    "-i, --input <value>",
    "OpenAPI specification, can be a path, url or string content (required)"
  )
  .option("-o, --output <value>", "Output directory", "openapi")
  .option(
    "-c, --client <value>",
    "HTTP client to generate [fetch, xhr, node, axios, angular]",
    "fetch"
  )
  .option("--useUnionTypes", "Use union types", false)
  .option("--exportSchemas <value>", "Write schemas to disk", false)
  .option("--indent <value>", "Indentation options [4, 2, tabs]", "4")
  .option("--postfixServices <value>", "Service name postfix", "Service")
  .option("--postfixModels <value>", "Modal name postfix")
  .option("--request <value>", "Path to custom request file")
  .parse();

const options = program.opts<CLIOptions>();

console.log(`Generating React Query code using OpenApi file ${options.output}`);
generate(options);
