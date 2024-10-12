import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createExports } from "../src/createExports.mts";
import { getServices } from "../src/service.mts";
import { cleanOutputs, generateTSClients, outputPath } from "./utils";

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
    const exports = createExports({
      service,
      project,
      pageParam: "page",
      nextPageParam: "nextPage",
      initialPageParam: "initial",
      client: "@hey-api/client-fetch",
    });

    const commonTypes = exports.allCommon
      .filter((c) => c.kind === SyntaxKind.TypeAliasDeclaration)
      // @ts-ignore
      .map((e) => e.name.escapedText);
    expect(commonTypes).toStrictEqual([
      "FindPetsDefaultResponse",
      "FindPetsQueryResult",
      "GetNotDefinedDefaultResponse",
      "GetNotDefinedQueryResult",
      "FindPetByIdDefaultResponse",
      "FindPetByIdQueryResult",
      "FindPaginatedPetsDefaultResponse",
      "FindPaginatedPetsQueryResult",
      "AddPetMutationResult",
      "PostNotDefinedMutationResult",
      "DeletePetMutationResult",
    ]);

    const constants = exports.allCommon
      .filter((c) => c.kind === SyntaxKind.VariableStatement)
      // @ts-ignore
      .map((c) => c.declarationList.declarations[0].name.escapedText);
    expect(constants).toStrictEqual([
      "useFindPetsKey",
      "UseFindPetsKeyFn",
      "useGetNotDefinedKey",
      "UseGetNotDefinedKeyFn",
      "useFindPetByIdKey",
      "UseFindPetByIdKeyFn",
      "useFindPaginatedPetsKey",
      "UseFindPaginatedPetsKeyFn",
    ]);

    const mainExports = exports.mainExports.map(
      // @ts-ignore
      (e) => e.declarationList.declarations[0].name.escapedText,
    );
    expect(mainExports).toStrictEqual([
      "useFindPets",
      "useGetNotDefined",
      "useFindPetById",
      "useFindPaginatedPets",
      "useAddPet",
      "usePostNotDefined",
      "useDeletePet",
    ]);

    const suspenseExports = exports.suspenseExports.map(
      // @ts-ignore
      (e) => e.declarationList.declarations[0].name.escapedText,
    );
    expect(suspenseExports).toStrictEqual([
      "useFindPetsSuspense",
      "useGetNotDefinedSuspense",
      "useFindPetByIdSuspense",
      "useFindPaginatedPetsSuspense",
    ]);
  });
});
