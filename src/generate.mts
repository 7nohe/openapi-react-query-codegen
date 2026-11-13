import type { ClientChoice, LimitedUserConfig } from "./cli.mjs";
import {
  type ClientKind,
  detectImportExtension,
  findNearestTsConfigPath,
  generateClient,
  SpecError,
  writeGeneratedFiles,
} from "./client/index.mjs";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  formatOptions,
} from "./common.mjs";
import { createSource } from "./createSource.mjs";
import { CodegenError, ErrorCodes, toCodegenError } from "./errors.mjs";
import { processOutput } from "./format.mjs";
import { print } from "./print.mjs";

export { findNearestTsConfigPath };

/** Map a `--client` value (including the v3 `@hey-api/*` aliases) to a kind. */
export function resolveClientKind(
  client: ClientChoice | undefined,
): ClientKind {
  switch (client) {
    case "axios":
    case "@hey-api/client-axios":
      return "axios";
    default:
      return "fetch";
  }
}

export type GenerateRuntimeOptions = {
  /**
   * Keep the generator's warnings off stderr. Used by `--json` (stderr must
   * carry only our JSON) and by `--check`.
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
 * Translate a failure of the client generator into our stable error codes.
 * This is the only place that knows how `src/client/` reports them.
 */
export function mapClientError(error: unknown, input: unknown): CodegenError {
  if (error instanceof CodegenError) {
    return error;
  }
  const inputDescription = describeInput(input);
  const reason = error instanceof Error ? error.message : String(error);
  if (error instanceof SpecError) {
    return error.reason === "not-found"
      ? new CodegenError(
          ErrorCodes.inputNotFound,
          `OpenAPI input could not be read: ${inputDescription}`,
          { input: inputDescription, reason },
          { cause: error },
        )
      : new CodegenError(
          ErrorCodes.inputParseError,
          `OpenAPI input could not be parsed: ${inputDescription}`,
          { input: inputDescription, reason },
          { cause: error },
        );
  }
  return new CodegenError(
    ErrorCodes.clientGenerationFailed,
    `The client could not be generated: ${reason}`,
    {
      input: inputDescription,
      reason,
      name: error instanceof Error ? error.name : "Error",
    },
    { cause: error },
  );
}

async function runGenerate(
  options: LimitedUserConfig,
  version: string,
  runtime: GenerateRuntimeOptions,
) {
  const openApiOutputPath = buildRequestsOutputPath(options.output);
  const formattedOptions = formatOptions(options);
  const client = resolveClientKind(formattedOptions.client);

  // One answer for both directories: the queries import the requests.
  const importExtension = detectImportExtension(process.cwd());

  let generated: Awaited<ReturnType<typeof generateClient>>;
  try {
    generated = await generateClient({
      input: formattedOptions.input,
      client,
      enums: formattedOptions.enums,
      importExtension,
      noOperationId: formattedOptions.noOperationId,
      pageParam: formattedOptions.pageParam,
      schemas: formattedOptions.noSchemas
        ? false
        : (formattedOptions.schemaType ?? "json"),
      useDateType: formattedOptions.useDateType,
    });
  } catch (error) {
    throw mapClientError(error, formattedOptions.input);
  }
  if (!runtime.silent) {
    for (const warning of generated.warnings) console.warn(warning);
  }
  await writeGeneratedFiles(openApiOutputPath, generated.files);

  const source = createSource({
    generated,
    client,
    version,
    pageParam: formattedOptions.pageParam,
    nextPageParam: formattedOptions.nextPageParam,
    initialPageParam: formattedOptions.initialPageParam.toString(),
    omitInitialPageParam: formattedOptions.omitInitialPageParam ?? false,
    importExtension,
  });
  await print(source, formattedOptions);
  const queriesOutputPath = buildQueriesOutputPath(options.output);
  await processOutput({
    output: queriesOutputPath,
    format: formattedOptions.format,
    lint: formattedOptions.lint,
  });
}

/**
 * Generate the client and the React Query hooks into `options.output`.
 * Rejects only with {@link CodegenError}, so callers can branch on `code`.
 */
export async function generate(
  options: LimitedUserConfig,
  version: string,
  runtime: GenerateRuntimeOptions = {},
) {
  try {
    await runGenerate(options, version, runtime);
  } catch (error) {
    throw toCodegenError(error);
  }
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
