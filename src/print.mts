import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { defaultOutputPath, queriesOutputPath } from "./constants.mjs";
import { LimitedUserConfig } from "./cli.mjs";
import { exists } from "./common.mjs";

async function printGeneratedTS(
  result: {
    name: string;
    content: string;
  },
  options: LimitedUserConfig
) {
  const dir = path.join(options.output ?? defaultOutputPath, queriesOutputPath);
  const dirExists = await exists(dir);
  if (!dirExists) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path.join(dir, result.name), result.content);
}

export async function print(
  results: {
    name: string;
    content: string;
  }[],
  options: LimitedUserConfig
) {
  const outputPath = options.output ?? defaultOutputPath;
  const dirExists = await exists(outputPath);
  if (!dirExists) {
    await mkdir(outputPath);
  }

  const promises = results.map(async (result) => {
    await printGeneratedTS(result, options);
  });

  await Promise.all(promises);
}
