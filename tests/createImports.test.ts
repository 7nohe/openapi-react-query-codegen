import path from "node:path";
import { Project } from "ts-morph";
import { describe, expect, test } from "vitest";
import { createImports } from "../src/createImports.mts";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

const fileName = "createImports";

describe(fileName, () => {
  test("createImports", async () => {
    await generateTSClients(fileName);
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const imports = createImports({
      project,
    });

    // @ts-ignore
    const moduleNames = imports.map((i) => i.moduleSpecifier.text);
    expect(moduleNames).toStrictEqual([
      "@tanstack/react-query",
      "../requests/services.gen",
      "../requests/types.gen",
    ]);
    await cleanOutputs(fileName);
  });

  test("createImports (No models)", async () => {
    const fileName = "createImportsNoModels";
    await generateTSClients(fileName, "no-models.yaml");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const imports = createImports({
      project,
    });

    // @ts-ignore
    const moduleNames = imports.map((i) => i.moduleSpecifier.text);
    expect(moduleNames).toStrictEqual([
      "@tanstack/react-query",
      "../requests/services.gen",
      "../requests/types.gen",
    ]);
    await cleanOutputs(fileName);
  });
});
