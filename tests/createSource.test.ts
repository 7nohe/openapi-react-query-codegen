import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSource } from "../src/createSource.mjs";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";
const fileName = "createSource";
describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("createSource", async () => {
    const source = await createSource({
      outputPath: outputPath(fileName),
      version: "1.0.0",
    });

    const indexTs = source.find((s) => s.name === "index.ts");
    expect(indexTs?.content).toMatchSnapshot();

    const commonTs = source.find((s) => s.name === "common.ts");
    expect(commonTs?.content).toMatchSnapshot();

    const queriesTs = source.find((s) => s.name === "queries.ts");
    expect(queriesTs?.content).toMatchSnapshot();

    const suspenseTs = source.find((s) => s.name === "suspense.ts");
    expect(suspenseTs?.content).toMatchSnapshot();

    const prefetchTs = source.find((s) => s.name === "prefetch.ts");
    expect(prefetchTs?.content).toMatchSnapshot();
  });
});
