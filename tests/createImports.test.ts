import {  afterAll, beforeAll, describe, expect, test } from "vitest";
import { cleanOutputs, generateTSClients } from "./utils";
import { Project } from "ts-morph";
import { createImports } from "../src/createImports.mts";

const fileName = "createImports"

describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(() => cleanOutputs(fileName));


  test('createImports', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(`tests/${fileName}-outputs/**/*`);
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