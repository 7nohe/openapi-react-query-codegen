import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";
import { Project, SyntaxKind } from "ts-morph";
import { createExports } from "../src/createExports.mts";
import { getServices } from "../src/service.mts";
import path from "path";

const fileName = "createExports";

describe(fileName, () => {
  beforeAll(async () => await generateTSClients(fileName));
  afterAll(async () => await cleanOutputs(fileName));

  test("createExports", async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(path.join(outputPath(fileName), "**", "*"));
    const service = await getServices(project);
    const exports = createExports(service);

    const commonTypes = exports.allCommon
      .filter((c) => c.kind === SyntaxKind.TypeAliasDeclaration)
      // @ts-ignore
      .map((e) => e.name.escapedText);
    expect(commonTypes).toStrictEqual([
      "DefaultServiceFindPetsDefaultResponse",
      "DefaultServiceFindPetsQueryResult",
      "DefaultServiceGetNotDefinedDefaultResponse",
      "DefaultServiceGetNotDefinedQueryResult",
      "DefaultServiceFindPetByIdDefaultResponse",
      "DefaultServiceFindPetByIdQueryResult",
      "DefaultServiceAddPetMutationResult",
      "DefaultServicePostNotDefinedMutationResult",
      "DefaultServiceDeletePetMutationResult",
    ]);

    const constants = exports.allCommon
      .filter((c) => c.kind === SyntaxKind.VariableStatement)
      // @ts-ignore
      .map((c) => c.declarationList.declarations[0].name.escapedText);
    expect(constants).toStrictEqual([
      "useDefaultServiceFindPetsKey",
      "UseDefaultServiceFindPetsKeyFn",
      "useDefaultServiceGetNotDefinedKey",
      "UseDefaultServiceGetNotDefinedKeyFn",
      "useDefaultServiceFindPetByIdKey",
      "UseDefaultServiceFindPetByIdKeyFn",
    ]);

    const mainExports = exports.mainExports.map(
      // @ts-ignore
      (e) => e.declarationList.declarations[0].name.escapedText
    );
    expect(mainExports).toStrictEqual([
      "useDefaultServiceFindPets",
      "useDefaultServiceGetNotDefined",
      "useDefaultServiceFindPetById",
      "useDefaultServiceAddPet",
      "useDefaultServicePostNotDefined",
      "useDefaultServiceDeletePet",
    ]);

    const suspenseExports = exports.suspenseExports.map(
      // @ts-ignore
      (e) => e.declarationList.declarations[0].name.escapedText
    );
    expect(suspenseExports).toStrictEqual([
      "useDefaultServiceFindPetsSuspense",
      "useDefaultServiceGetNotDefinedSuspense",
      "useDefaultServiceFindPetByIdSuspense",
    ]);
  });
});
