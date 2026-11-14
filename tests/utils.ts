import path from "node:path";
import {
  type ClientGenOptions,
  type GeneratedClient,
  generateClient,
} from "../src/client/index.mjs";

export const outputPath = (prefix: string) =>
  path.join("tests", `${prefix}-outputs`);

export const inputPath = (inputFile = "petstore.yaml") =>
  path.join(__dirname, "inputs", inputFile);

/** Generate the client (types, SDK, runtime) for a spec under tests/inputs. */
export const generateTestClient = (
  inputFile = "petstore.yaml",
  overrides: Partial<ClientGenOptions> = {},
): Promise<GeneratedClient> =>
  generateClient({
    input: inputPath(inputFile),
    client: "fetch",
    importExtension: "",
    pageParam: "page",
    ...overrides,
  });
