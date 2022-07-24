import fs from "fs";
import path from "path";
import { CLIOptions } from "./cli";

function printGeneratedTS(result: string, options: CLIOptions) {
  const dir = path.join(options.outputDir, "queries")
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}
  fs.writeFileSync(path.join(dir, 'index.ts'), result);
}

export function print(result: string, options: CLIOptions) {
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir);
  }

  printGeneratedTS(result, options);
}
