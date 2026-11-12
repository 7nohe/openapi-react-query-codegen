import { readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type UserConfig } from "@hey-api/openapi-ts";
import type { LimitedUserConfig } from "./cli.mjs";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  formatOptions,
} from "./common.mjs";
import { createSource } from "./createSource.mjs";
import { CodegenError, ErrorCodes } from "./errors.mjs";
import { formatOutput, processOutput } from "./format.mjs";
import { print } from "./print.mjs";

// openapi-ts's own tsconfig auto-detection walks up from its *install*
// location, which in this monorepo reaches this repo's own root tsconfig
// (NodeNext) instead of the caller's project config. Anchoring the search
// at cwd instead finds the tsconfig that actually applies to the generated
// output, matching the resolution the caller's own `tsc` will use.
export function findNearestTsConfigPath(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidates = readdirSync(dir).filter(
      (file) => file.startsWith("tsconfig") && file.endsWith(".json"),
    );
    if (candidates.length > 0) {
      candidates.sort((a) => (a === "tsconfig.json" ? -1 : 1));
      return path.join(dir, candidates[0]);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export type GenerateRuntimeOptions = {
  /**
   * Silence @hey-api/openapi-ts logs and stop it from writing crash-report
   * files into cwd. Used by `--json` (stderr must carry only our JSON) and
   * by `--check` (which must leave nothing behind).
   */
  silent?: boolean;
};

/** Keep inline spec content out of error details; it can be huge. */
function describeInput(input: unknown): string {
  if (typeof input === "string" && !input.includes("\n")) {
    return input;
  }
  return "(inline specification)";
}

/**
 * Translate @hey-api/openapi-ts failures into our stable error codes.
 * hey-api's error classes live in a transitive dependency, so they are
 * matched by name rather than imported. This is the only place that knows
 * about them (see the IR boundary notes in AGENTS.md).
 */
export function mapClientError(error: unknown, input: unknown): CodegenError {
  if (error instanceof CodegenError) {
    return error;
  }
  const inputDescription = describeInput(input);
  const err = error as {
    name?: string;
    message?: string;
    originalError?: { error?: { code?: string; message?: string } };
  } | null;
  const original = err?.originalError?.error;
  const reason = original?.message ?? err?.message ?? String(error);
  if (err?.name === "InputError") {
    return new CodegenError(
      ErrorCodes.inputNotFound,
      `OpenAPI input could not be read: ${inputDescription}`,
      { input: inputDescription, reason },
      { cause: error },
    );
  }
  if (err?.name === "JobError" && original?.code === "EPARSER") {
    return new CodegenError(
      ErrorCodes.inputParseError,
      `OpenAPI input could not be parsed: ${inputDescription}`,
      { input: inputDescription, reason },
      { cause: error },
    );
  }
  return new CodegenError(
    ErrorCodes.clientGenerationFailed,
    `@hey-api/openapi-ts failed to generate the client: ${reason}`,
    { input: inputDescription, reason, name: err?.name ?? "Error" },
    { cause: error },
  );
}

export async function generate(
  options: LimitedUserConfig,
  version: string,
  runtime: GenerateRuntimeOptions = {},
) {
  const openApiOutputPath = buildRequestsOutputPath(options.output);
  const formattedOptions = formatOptions(options);

  // Map CLI options to new plugins system
  const clientPlugin =
    formattedOptions.client === "@hey-api/client-axios"
      ? "@hey-api/client-axios"
      : "@hey-api/client-fetch";

  const typescriptPlugin: NonNullable<UserConfig["plugins"]>[number] =
    formattedOptions.enums
      ? {
          name: "@hey-api/typescript" as const,
          enums: formattedOptions.enums,
        }
      : "@hey-api/typescript";

  const sdkPlugin: NonNullable<UserConfig["plugins"]>[number] = {
    name: "@hey-api/sdk" as const,
    ...(formattedOptions.noOperationId
      ? {
          // `operationId: false` was deprecated in favor of `operations.nesting`
          operations: {
            nesting: "id" as const,
          },
        }
      : {}),
    ...(formattedOptions.useDateType
      ? { transformer: "@hey-api/transformers" as const }
      : {}),
  };

  const plugins: NonNullable<UserConfig["plugins"]>[number][] = [
    clientPlugin,
    typescriptPlugin,
    sdkPlugin,
  ];

  if (formattedOptions.useDateType) {
    plugins.push({
      name: "@hey-api/transformers",
      dates: "date",
    });
  }

  // Conditionally add schemas plugin
  if (!formattedOptions.noSchemas) {
    plugins.push(
      formattedOptions.schemaType
        ? {
            name: "@hey-api/schemas" as const,
            type: formattedOptions.schemaType,
          }
        : "@hey-api/schemas",
    );
  }

  const config: UserConfig = {
    dryRun: false,
    input: formattedOptions.input,
    output: {
      path: openApiOutputPath,
      tsConfigPath: findNearestTsConfigPath(process.cwd()) ?? null,
    },
    plugins,
    ...(runtime.silent
      ? { logs: { level: "silent" as const, file: false } }
      : {}),
  };
  let contexts: ReadonlyArray<unknown>;
  try {
    contexts = await createClient(config);
  } catch (error) {
    throw mapClientError(error, formattedOptions.input);
  }
  // openapi-ts swallows input errors (file not found, HTTP failure), logs
  // them and resolves with no contexts instead of throwing.
  if (contexts.length === 0) {
    const inputDescription = describeInput(formattedOptions.input);
    throw new CodegenError(
      ErrorCodes.inputNotFound,
      `OpenAPI input could not be read (file not found or request failed): ${inputDescription}`,
      { input: inputDescription },
    );
  }

  // Generate backward-compatible services.gen.ts shim
  // client.gen.ts has the `client` instance; sdk.gen.ts has SDK functions.
  // Mirror whatever extension convention openapi-ts used for its own
  // cross-file imports (e.g. `.js` for NodeNext, none for bundler resolution).
  const sdkGenContent = await readFile(
    path.join(openApiOutputPath, "sdk.gen.ts"),
    "utf-8",
  );
  const importExtension =
    sdkGenContent.match(/from ['"]\.\/client\.gen(\.\S*)?['"]/)?.[1] ?? "";
  const shimContent = `// This file is auto-generated for backward compatibility\nexport * from './client.gen${importExtension}';\nexport * from './sdk.gen${importExtension}';\n`;
  await writeFile(path.join(openApiOutputPath, "services.gen.ts"), shimContent);

  const source = await createSource({
    outputPath: openApiOutputPath,
    client: clientPlugin,
    version,
    pageParam: formattedOptions.pageParam,
    nextPageParam: formattedOptions.nextPageParam,
    initialPageParam: formattedOptions.initialPageParam.toString(),
    omitInitialPageParam: formattedOptions.omitInitialPageParam ?? false,
  });
  await print(source, formattedOptions);
  const queriesOutputPath = buildQueriesOutputPath(options.output);
  await formatOutput(queriesOutputPath);
  await processOutput({
    output: queriesOutputPath,
    format: formattedOptions.format,
    lint: formattedOptions.lint,
  });
}

// Public library surface for the agent-facing features. `check` imports
// `generate` from this module; the cycle is safe because both are hoisted
// function declarations.
export {
  type CheckResult,
  check,
  type FileChange,
  type FileChangeStatus,
} from "./check.mjs";
export {
  CodegenError,
  type ErrorCode,
  ErrorCodes,
  ExitCodes,
} from "./errors.mjs";
