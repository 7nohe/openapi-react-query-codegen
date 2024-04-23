import { createClient, UserConfig } from "@hey-api/openapi-ts";
import { print } from "./print.mjs";
import { createSource } from "./createSource.mjs";
import {
  buildQueriesOutputPath,
  buildRequestsOutputPath,
  formatOptions,
} from "./common.mjs";
import { LimitedUserConfig } from "./cli.mjs";
import { formatOutput } from "./format.mjs";

export async function generate(options: LimitedUserConfig, version: string) {
  const openApiOutputPath = buildRequestsOutputPath(options.output);
  const formattedOptions = formatOptions(options);

  const config: UserConfig = {
    base: formattedOptions.base,
    client: formattedOptions.client,
    debug: formattedOptions.debug,
    dryRun: false,
    enums: formattedOptions.enums,
    exportCore: true,
    format: formattedOptions.format,
    input: formattedOptions.input,
    lint: formattedOptions.lint,
    output: openApiOutputPath,
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
    },
    useOptions: true,
  };
  await createClient(config);
  const source = await createSource({
    outputPath: openApiOutputPath,
    version,
    serviceEndName: "Service", // we are hard coding this because changing the service end name was depreciated in @hey-api/openapi-ts
  });
  await print(source, formattedOptions);
  const queriesOutputPath = buildQueriesOutputPath(options.output);
  await formatOutput(queriesOutputPath);
}
