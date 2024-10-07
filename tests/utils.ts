import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { type UserConfig, createClient } from "@hey-api/openapi-ts";
export const outputPath = (prefix: string) =>
  path.join("tests", `${prefix}-outputs`);

export const generateTSClients = async (prefix: string, inputFile?: string) => {
  const options: UserConfig = {
    input: path.join(__dirname, "inputs", inputFile ?? "petstore.yaml"),
    client: "@hey-api/client-fetch",
    output: outputPath(prefix),
    services: {
      asClass: false,
    },
  };
  await createClient(options);
};

export const cleanOutputs = async (prefix: string) => {
  const output = `${prefix}-outputs`;
  if (existsSync(path.join(__dirname, output))) {
    await rm(path.join(__dirname, output), { recursive: true });
  }
};
