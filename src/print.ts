import fs from "fs";
import path from "path";
import { CLIOptions } from "./cli";
import { defaultOutputPath, queriesOutputPath } from "./constants";

function printGeneratedTS(result: string, options: CLIOptions) {
  const dir = path.join(options.output ?? defaultOutputPath, queriesOutputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "index.ts"), result);
}

export function print(result: string, options: CLIOptions) {
  const outputPath = options.output ?? defaultOutputPath;
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }

  printGeneratedTS(result, options);
}
