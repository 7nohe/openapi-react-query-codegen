import { readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
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
    output: {
      path: openApiOutputPath,
      tsConfigPath: findNearestTsConfigPath(process.cwd()) ?? null,
    },
    plugins,
  };
  await createClient(config);

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
