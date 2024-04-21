import { UserConfig, createClient } from "@hey-api/openapi-ts";
import { existsSync } from "node:fs";
import { rmdir } from "node:fs/promises";
import path from "node:path";
export const outputPath = (prefix: string) => path.join("tests", `${prefix}-outputs`);

export const generateTSClients = async (prefix: string) => {
  const options: UserConfig = {
    input: path.join(__dirname, "inputs", "petstore.yaml"),
    output: outputPath(prefix),
  };
  await createClient(options);
}

export const cleanOutputs = async (prefix: string) => {
  const output = `${prefix}-outputs`;
  if (existsSync(path.join(__dirname, output))) {
    await rmdir(path.join(__dirname, output), { recursive: true });
  }
}