import path from "node:path";
import { Project } from "ts-morph";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getMethodsFromService, getServices } from "../src/service.mjs";
import { cleanOutputs, generateTSClients } from "./utils";
const fileName = "service";
describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("getServices", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(
      path.join("tests", `${fileName}-outputs`, "**", "*"),
    );
    const service = await getServices(project);

    const methodNames = service.methods.map((m) => m.method.getName());
    expect(methodNames).toEqual([
      "findPets",
      "addPet",
      "getNotDefined",
      "postNotDefined",
      "deletePet",
      "findPetById",
      "findPaginatedPets",
    ]);
  });

  test("getServices (No service node found)", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths("no/services/**/*");
    await expect(() => getServices(project)).rejects.toThrowError(
      "No service node found",
    );
  });

  test('getMethodsFromService - throw error "Return statement not found"', async () => {
    const source = `
    export const foo = () => {}
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    await expect(() => getMethodsFromService(sourceFile)).toThrowError(
      "Return statement not found",
    );
  });

  test('getMethodsFromService - throw error "Call expression not found"', async () => {
    const source = `
    export const foo = () => { return }
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    await expect(() => getMethodsFromService(sourceFile)).toThrowError(
      "Call expression not found",
    );
  });

  test('getMethodsFromService - throw error "httpMethodName not found"', async () => {
    const source = `
    export const foo = () => someFunction()
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    await expect(() => getMethodsFromService(sourceFile)).toThrowError(
      "httpMethodName not found",
    );
  });
});
