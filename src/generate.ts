import { generate as generateTSClients } from "openapi-typescript-codegen";
import { print } from "./print";
import { CLIOptions } from "../bin/cli";
import path from "path";
import { createSource } from "./createSource";

export async function generate(options: CLIOptions) {
  const openApiOutputPath = path.join(options.outputDir, "requests");
  await generateTSClients({
    input: options.path,
    output: openApiOutputPath,
  });
  const source = createSource(openApiOutputPath);
  print(source, options);
}
