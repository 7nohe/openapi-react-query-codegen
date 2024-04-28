import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { generate } from "../src/generate.mjs";
import { rm } from "node:fs/promises";
import { LimitedUserConfig } from "../src/cli.mts";

const readOutput = (fileName: string) => {
  return readFileSync(
    path.join(__dirname, "outputs", "queries", fileName),
    "utf-8"
  );
};

describe("generate", () => {
  beforeAll(async () => {
    const options: LimitedUserConfig = {
      input: path.join(__dirname, "inputs", "petstore.yaml"),
      output: path.join("tests", "outputs"),
      lint: "eslint",
    };
    await generate(options, "1.0.0");
  });

  afterAll(async () => {
    if (existsSync(path.join(__dirname, "outputs"))) {
      await rm(path.join(__dirname, "outputs"), {
        recursive: true,
      });
    }
  });

  test("common.ts", () => {
    expect(readOutput("common.ts")).toMatchSnapshot();
  });

  test("queries.ts", () => {
    expect(readOutput("queries.ts")).toMatchSnapshot();
  });

  test("index.ts", () => {
    expect(readOutput("index.ts")).toMatchSnapshot();
  });

  test("suspense.ts", () => {
    expect(readOutput("suspense.ts")).toMatchSnapshot();
  });

  test("prefetch.ts", () => {
    expect(readOutput("prefetch.ts")).toMatchSnapshot();
  });
});
