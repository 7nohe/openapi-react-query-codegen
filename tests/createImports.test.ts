import path from "node:path";
import { Project } from "ts-morph";
import type ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createImports } from "../src/createImports.mts";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

const fileName = "createImports";

describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("createImports", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const imports = createImports({
      project,
    });

    const moduleNames = imports.map(
      (i) => (i.moduleSpecifier as ts.StringLiteral).text,
    );
    expect(moduleNames).toStrictEqual([
      "../requests/sdk.gen",
      "@tanstack/react-query",
      "../requests/sdk.gen",
      "../requests/types.gen",
    ]);
  });

  test("createImports with axios client", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const imports = createImports({
      project,
      client: "@hey-api/client-axios",
    });

    const moduleNames = imports.map(
      (i) => (i.moduleSpecifier as ts.StringLiteral).text,
    );
    expect(moduleNames).toContain("axios");
  });

  // Skip: no-models.yaml causes upstream @hey-api/openapi-ts error
  test.skip("createImports (No models)", async () => {
    const fileName = "createImportsNoModels";
    await generateTSClients(fileName, "no-models.yaml");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const imports = createImports({
      project,
    });

    const moduleNames = imports.map(
      (i) => (i.moduleSpecifier as ts.StringLiteral).text,
    );
    expect(moduleNames).toStrictEqual([
      "../requests/sdk.gen",
      "@tanstack/react-query",
      "../requests/sdk.gen",
      "../requests/types.gen",
    ]);
    await cleanOutputs(fileName);
  });
});
