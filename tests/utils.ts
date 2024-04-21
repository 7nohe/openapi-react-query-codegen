import { UserConfig, createClient } from "@hey-api/openapi-ts";
import { existsSync, rmdirSync } from "node:fs";
import path from "node:path";
const outputPath = (prefix: string) => path.join("tests", `${prefix}-outputs`);

export const generateTSClients = async (prefix: string) => {
  const options: UserConfig = {
    input: path.join(__dirname, "inputs", "petstore.yaml"),
    output: outputPath(prefix),
  };
  await createClient(options);
}

export const cleanOutputs = (prefix: string) => {
  const output = `${prefix}-outputs`;
  if (existsSync(path.join(__dirname, output))) {
    rmdirSync(path.join(__dirname, output), { recursive: true });
  }
}