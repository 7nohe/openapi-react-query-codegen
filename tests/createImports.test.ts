import {  afterAll, beforeAll, describe, expect, test } from "vitest";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";
import { Project } from "ts-morph";
import { createImports } from "../src/createImports.mts";
import path from "path";

const fileName = "createImports"

describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));


  test('createImports', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), '**', '*'));
    const imports = createImports({
      serviceEndName: "Service",
      project,
    });

    // @ts-ignore
    const moduleNames = imports.map((i) => i.moduleSpecifier.text);
    expect(moduleNames).toStrictEqual([
      "@tanstack/react-query",
      "../requests",
      "../requests/models",
    ]);
  })
});