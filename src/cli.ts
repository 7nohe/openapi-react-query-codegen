#!/usr/bin/env node
import { generate } from "./generator";
import { Command } from "commander";
import packageJson from "../package.json";

export type CLIOptions = {
  packageVersion: string;
  outputDir: string;
  path: string;
  baseUrl: string;
  replacer: string[];
};

const program = new Command();

program
  .version(packageJson.version)
  .description("Generate React Query code based on OpenAPI")
  .requiredOption("-p, --path <path>", "Path to OpenAPI file")
  .option(
    "-o, --output-dir [directory]",
    "Directory to output the generated package",
    "openapi"
  )
  .parse();

const options = program.opts<CLIOptions>();

console.log(`Generating React Query code using OpenApi file ${options.path}`);
generate(options);