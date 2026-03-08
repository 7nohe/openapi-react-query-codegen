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
    // In v0.73+, the order may differ slightly but should contain all methods
    expect(methodNames).toContain("findPets");
    expect(methodNames).toContain("addPet");
    expect(methodNames).toContain("getNotDefined");
    expect(methodNames).toContain("postNotDefined");
    expect(methodNames).toContain("findPetById");
    expect(methodNames).toContain("deletePet");
    expect(methodNames).toContain("findPaginatedPets");
    expect(methodNames).toHaveLength(7);
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

  // In v0.73+, getMethodsFromService skips invalid entries instead of throwing
  test("getMethodsFromService - skips non-arrow functions", () => {
    const source = `
    const foo = "bar"
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    const result = getMethodsFromService(sourceFile);
    expect(result).toEqual([]);
  });

  test("getMethodsFromService - skips variables without initializer", () => {
    const source = `
    declare const foo: string
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    const result = getMethodsFromService(sourceFile);
    expect(result).toEqual([]);
  });

  test("getMethodsFromService - skips arrow functions without HTTP method call", () => {
    const source = `
    const foo = () => {}
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    const result = getMethodsFromService(sourceFile);
    expect(result).toEqual([]);
  });

  test("getMethodsFromService - skips expression body without call expression", () => {
    const source = `
    const foo = () => "bar"
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    const result = getMethodsFromService(sourceFile);
    expect(result).toEqual([]);
  });

  test("getMethodsFromService - parses valid SDK function with expression body", () => {
    const source = `
    const findPets = (options) => client.get({ url: '/pets', ...options })
    `;
    const project = new Project();
    const sourceFile = project.createSourceFile("test.ts", source);

    const result = getMethodsFromService(sourceFile);
    expect(result).toHaveLength(1);
    expect(result[0].httpMethodName).toBe("get");
  });
});
