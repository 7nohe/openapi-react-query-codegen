import { type UserConfig, createClient } from "@hey-api/openapi-ts";
import type { LimitedUserConfig } from "./cli.mjs";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  formatOptions,
} from "./common.mjs";
import { createSource } from "./createSource.mjs";
import { formatOutput, processOutput } from "./format.mjs";
import { print } from "./print.mjs";

export async function generate(options: LimitedUserConfig, version: string) {
  const openApiOutputPath = buildRequestsOutputPath(options.output);
  const formattedOptions = formatOptions(options);

  const config: UserConfig = {
    base: formattedOptions.base,
    client: formattedOptions.client,
    debug: formattedOptions.debug,
    dryRun: false,
    exportCore: true,
    output: {
      format: formattedOptions.format,
      lint: formattedOptions.lint,
      path: openApiOutputPath,
    },
    input: formattedOptions.input,
    request: formattedOptions.request,
    schemas: {
      export: !formattedOptions.noSchemas,
      type: formattedOptions.schemaType,
    },
    services: {
      export: true,
      response: formattedOptions.serviceResponse,
    },
    types: {
      dates: formattedOptions.useDateType,
      export: true,
      enums: formattedOptions.enums,
    },
    useOptions: true,
  };
  await createClient(config);
  const source = await createSource({
    outputPath: openApiOutputPath,
    version,
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
