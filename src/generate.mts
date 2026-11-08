import type { ClientChoice, LimitedUserConfig } from "./cli.mjs";
import {
  type ClientKind,
  detectImportExtension,
  findNearestTsConfigPath,
  generateClient,
  writeGeneratedFiles,
} from "./client/index.mjs";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  formatOptions,
} from "./common.mjs";
import { createSource } from "./createSource.mjs";
import { formatOutput, processOutput } from "./format.mjs";
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

export async function generate(options: LimitedUserConfig, version: string) {
  const openApiOutputPath = buildRequestsOutputPath(options.output);
  const formattedOptions = formatOptions(options);
  const client = resolveClientKind(formattedOptions.client);

  const generated = await generateClient({
    input: formattedOptions.input,
    client,
    enums: formattedOptions.enums,
    importExtension: detectImportExtension(process.cwd()),
    noOperationId: formattedOptions.noOperationId,
    pageParam: formattedOptions.pageParam,
  });
  await writeGeneratedFiles(openApiOutputPath, generated.files);

  const source = createSource({
    generated,
    client,
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
