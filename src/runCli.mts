import { Command, CommanderError, Option } from "commander";
import { type CheckResult, check, outOfDateError } from "./check.mjs";
import type { LimitedUserConfig } from "./cli.mjs";
import { defaultOutputPath } from "./constants.mjs";
import {
  CodegenError,
  ErrorCodes,
  ExitCodes,
  formatErrorJson,
  formatErrorText,
  toCodegenError,
} from "./errors.mjs";
import { type GenerateRuntimeOptions, generate } from "./generate.mjs";

export type CliIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type CliDependencies = {
  generate: (
    options: LimitedUserConfig,
    version: string,
    runtime?: GenerateRuntimeOptions,
  ) => Promise<void>;
  check: (options: LimitedUserConfig, version: string) => Promise<CheckResult>;
};

type CliOptions = LimitedUserConfig & { check?: boolean; json?: boolean };

const defaultIO: CliIO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const defaultDependencies: CliDependencies = { generate, check };

export function buildProgram(
  version: string,
  io: CliIO,
  { json }: { json: boolean },
) {
  return new Command()
    .name("orqc")
    .version(version)
    .description("Generate React Query code based on OpenAPI")
    .exitOverride()
    .configureOutput({
      writeOut: io.stdout,
      writeErr: io.stderr,
      // With --json the error is reported once, as JSON, by runCli.
      outputError: (text, write) => {
        if (!json) write(text);
      },
    })
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
    .option(
      "--useDateType",
      "Use Date for date/date-time model properties and convert response values to Date objects",
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
    .option(
      "--omitInitialPageParam",
      "Send no initial page parameter at all (overrides --initialPageParam)",
    )
    .addOption(
      new Option(
        "--mock <value>",
        "Also generate mock data and request handlers from the specification, into <output>/mocks",
      ).choices(["msw"]),
    )
    .option(
      "--agentsMd [file]",
      "Also keep a short guide for coding agents (how to look operations up in the output) in AGENTS.md, or in the file named",
    )
    .option(
      "--check",
      "Do not update the output; exit 1 and list the files that differ if the existing output is out of date",
    )
    .option(
      "--json",
      "Print errors to stderr as a single line of JSON ({ code, message, details })",
    );
}

function reportError(error: CodegenError, io: CliIO, json: boolean) {
  if (json) {
    io.stderr(`${formatErrorJson(error)}\n`);
    return;
  }
  io.stderr(`${formatErrorText(error)}\n`);
  if (error.code === ErrorCodes.outputOutOfDate) {
    const files = (error.details as { files: CheckResult["files"] }).files;
    for (const file of files) {
      io.stderr(`  ${file.status.padEnd(8)} ${file.path}\n`);
    }
  }
}

/**
 * Run the CLI and resolve with the process exit code:
 * 0 = success / up to date, 1 = `--check` found drift, 2 = error.
 */
export async function runCli(
  argv: readonly string[],
  version: string,
  io: CliIO = defaultIO,
  dependencies: CliDependencies = defaultDependencies,
): Promise<number> {
  // Decided before parsing so that argument errors can be JSON too.
  const json = argv.includes("--json");
  const program = buildProgram(version, io, { json });

  try {
    program.parse([...argv]);
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    // --help and --version also exit through exitOverride.
    if (error.exitCode === 0) return ExitCodes.success;
    const codegenError = new CodegenError(
      ErrorCodes.invalidArgument,
      error.message.replace(/^error: /, ""),
      { commanderCode: error.code },
    );
    // Commander already printed its own message in text mode.
    if (json) reportError(codegenError, io, json);
    return ExitCodes.error;
  }

  const {
    check: checkMode,
    json: _json,
    ...options
  } = program.opts<CliOptions>();

  try {
    if (checkMode) {
      const result = await dependencies.check(options, version);
      if (result.upToDate) {
        io.stdout("✔ Generated output is up to date.\n");
        return ExitCodes.success;
      }
      reportError(outOfDateError(result.files), io, json);
      return ExitCodes.outOfDate;
    }
    await dependencies.generate(options, version, { silent: json });
    return ExitCodes.success;
  } catch (error) {
    reportError(toCodegenError(error), io, json);
    return ExitCodes.error;
  }
}
