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

  const clientPlugin = formattedOptions.client ?? "@hey-api/client-fetch";

  const config: UserConfig = {
    input: formattedOptions.input,
    output: {
      format: formattedOptions.format,
      lint: formattedOptions.lint,
      path: openApiOutputPath,
    },
    plugins: [
      clientPlugin,
      {
        name: "@hey-api/typescript",
        enums: formattedOptions.enums,
      },
      {
        name: "@hey-api/sdk",
        asClass: false,
        operationId: !formattedOptions.noOperationId,
      },
      ...(formattedOptions.noSchemas
        ? []
        : [
            {
              name: "@hey-api/schemas" as const,
              type: formattedOptions.schemaType,
            },
          ]),
    ],
  };
  await createClient(config);
  const source = await createSource({
    outputPath: openApiOutputPath,
    client: clientPlugin as "@hey-api/client-fetch" | "@hey-api/client-axios",
    version,
    pageParam: formattedOptions.pageParam,
    nextPageParam: formattedOptions.nextPageParam,
    initialPageParam: formattedOptions.initialPageParam.toString(),
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
