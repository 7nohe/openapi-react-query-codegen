import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from '../src/createSource.mjs'
import path from "path";
import { cleanOutputs, generateTSClients } from "./utils";
const outputPath = path.join("tests", "outputs");
const fileName = "createSource";
describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(() => cleanOutputs(fileName));


  test("createSource", async () => {
    const source = await createSource({
      outputPath,
      version: "1.0.0",
      serviceEndName: "Service",
    });

    const indexTs = source.find((s) => s.name === "index.ts");
    expect(indexTs?.content).toMatchSnapshot();

    const commonTs = source.find((s) => s.name === "common.ts");
    expect(commonTs?.content).toMatchSnapshot();

    const queriesTs = source.find((s) => s.name === "queries.ts");
    expect(queriesTs?.content).toMatchSnapshot();

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs?.content).toMatchSnapshot();
  });
});
