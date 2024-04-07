import { generate as generateTSClients } from "openapi-typescript-codegen";
import { print } from "./print";
import { CLIOptions } from "./cli";
import path from "path";
import { createSources } from "./createSource";
import { defaultOutputPath, requestsOutputPath } from "./constants";

export async function generate(options: CLIOptions) {
  const openApiOutputPath = path.join(
    options.output ?? defaultOutputPath,
    requestsOutputPath
  );

  await generateTSClients({
    ...options,
    httpClient: options.client,
    output: openApiOutputPath,
  });
  const sources = createSources(openApiOutputPath);
  print(sources, options);
}
