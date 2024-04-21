import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getServices } from "../src/service.mjs";
import { Project } from "ts-morph";
import { cleanOutputs, generateTSClients } from "./utils";
const fileName = "service"
describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(() => cleanOutputs(fileName));

  test("getServices", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(`tests/${fileName}-outputs/**/*`);
    const service = await getServices(project);
    const klass = service.klasses[0];
    expect(klass.className).toBe('DefaultService');
    const methodNames = klass.methods.map((m) => m.method.getName());
    expect(methodNames).toEqual(['findPets', 'addPet', 'getNotDefined', 'postNotDefined', 'findPetById', 'deletePet']);
  });

  test("getServices (No service node found)", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(`no/services/**/*`);
    await expect(() => getServices(project)).rejects.toThrowError("No service node found");
  });
});