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

  // Map old client option to new plugins system
  const clientPlugin =
    formattedOptions.client === "@hey-api/client-axios"
      ? "@hey-api/client-axios"
      : "@hey-api/client-fetch";
  const plugins: UserConfig["plugins"] = [
    clientPlugin,
    "@hey-api/typescript",
    "@hey-api/sdk",
  ];

  const config: UserConfig = {
    dryRun: false,
    input: formattedOptions.input,
    output: openApiOutputPath,
    plugins,
  };
  await createClient(config);

  // Generate backward-compatible services.gen.ts shim
  // client.gen.ts has the `client` instance; sdk.gen.ts has SDK functions
  const shimContent = `// This file is auto-generated for backward compatibility\nexport * from './client.gen';\nexport * from './sdk.gen';\n`;
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
