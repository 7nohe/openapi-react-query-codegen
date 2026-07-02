import { writeFile } from "node:fs/promises";
import path from "node:path";
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

  const sdkPlugin: NonNullable<UserConfig["plugins"]>[number] =
    formattedOptions.noOperationId
      ? {
          name: "@hey-api/sdk" as const,
          // `operationId: false` was deprecated in favor of `operations.nesting`
          operations: {
            nesting: "id" as const,
          },
        }
      : "@hey-api/sdk";

  const plugins: NonNullable<UserConfig["plugins"]>[number][] = [
    clientPlugin,
    typescriptPlugin,
    sdkPlugin,
  ];

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
    output: openApiOutputPath,
    plugins,
  };
  await createClient(config);

  // Generate backward-compatible services.gen.ts shim
  // client.gen.ts has the `client` instance; sdk.gen.ts has SDK functions
  const shimContent = `// This file is auto-generated for backward compatibility\nexport * from './client.gen.js';\nexport * from './sdk.gen.js';\n`;
  await writeFile(path.join(openApiOutputPath, "services.gen.ts"), shimContent);

  const source = await createSource({
    outputPath: openApiOutputPath,
    client: formattedOptions.client,
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
