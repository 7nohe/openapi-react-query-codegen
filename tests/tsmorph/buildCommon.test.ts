import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildDefaultResponseType,
  buildMutationKeyConst,
  buildMutationKeyFn,
  buildMutationResultType,
  buildQueryKeyConst,
  buildQueryKeyFn,
  buildQueryResultType,
} from "../../src/tsmorph/buildCommon.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockOperation: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "limit", typeName: "number", optional: true }],
  allParamsOptional: true,
  isPaginatable: false,
};

const mockMutationOperation: OperationInfo = {
  methodName: "addPet",
  capitalizedMethodName: "AddPet",
  httpMethod: "POST",
  isDeprecated: false,
  parameters: [{ name: "body", typeName: "NewPet", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: ["Pet", "NewPet", "FindPetsData", "AddPetData"],
  serviceNames: ["findPets", "addPet"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildCommon", () => {
  describe("buildDefaultResponseType", () => {
    it("should build default response type alias", () => {
      const result = buildDefaultResponseType(mockOperation);

      expect(result.kind).toBe(StructureKind.TypeAlias);
      expect(result.isExported).toBe(true);
      expect(result.name).toBe("FindPetsDefaultResponse");
      expect(result.type).toBe('Awaited<ReturnType<typeof findPets>>["data"]');
    });

    it("should use capitalized method name", () => {
      const op: OperationInfo = {
        ...mockOperation,
        methodName: "getPetById",
        capitalizedMethodName: "GetPetById",
      };
      const result = buildDefaultResponseType(op);

      expect(result.name).toBe("GetPetByIdDefaultResponse");
      expect(result.type).toContain("getPetById");
    });
  });

  describe("buildQueryResultType", () => {
    it("should build query result type alias", () => {
      const result = buildQueryResultType(mockOperation);

      expect(result.kind).toBe(StructureKind.TypeAlias);
      expect(result.isExported).toBe(true);
      expect(result.name).toBe("FindPetsQueryResult");
      expect(result.type).toBe("UseQueryResult<TData, TError>");
      expect(result.typeParameters).toHaveLength(2);
      expect(result.typeParameters?.[0]).toEqual({
        name: "TData",
        default: "FindPetsDefaultResponse",
      });
      expect(result.typeParameters?.[1]).toEqual({
        name: "TError",
        default: "unknown",
      });
    });
  });

  describe("buildMutationResultType", () => {
    it("should build mutation result type alias", () => {
      const result = buildMutationResultType(mockMutationOperation);

      expect(result.kind).toBe(StructureKind.TypeAlias);
      expect(result.isExported).toBe(true);
      expect(result.name).toBe("AddPetMutationResult");
      expect(result.type).toBe("Awaited<ReturnType<typeof addPet>>");
    });
  });

  describe("buildQueryKeyConst", () => {
    it("should build query key constant", () => {
      const result = buildQueryKeyConst(mockOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations).toHaveLength(1);
      expect(result.declarations[0].name).toBe("useFindPetsKey");
      expect(result.declarations[0].initializer).toBe('"FindPets"');
    });
  });

  describe("buildMutationKeyConst", () => {
    it("should build mutation key constant", () => {
      const result = buildMutationKeyConst(mockMutationOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("useAddPetKey");
      expect(result.declarations[0].initializer).toBe('"AddPet"');
    });
  });

  describe("buildQueryKeyFn", () => {
    it("should build query key function with parameters", () => {
      const result = buildQueryKeyFn(mockOperation, mockContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarations[0].name).toBe("UseFindPetsKeyFn");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true>",
      );
      expect(initializer).toContain("= {}"); // default value for optional params
      expect(initializer).toContain("queryKey?: Array<unknown>");
      expect(initializer).toContain("[useFindPetsKey,");
      expect(initializer).toContain("[clientOptions]"); // fallback array
    });

    it("should build query key function without default value for required params", () => {
      const op: OperationInfo = {
        ...mockOperation,
        methodName: "getPetById",
        capitalizedMethodName: "GetPetById",
        parameters: [{ name: "id", typeName: "number", optional: false }],
        allParamsOptional: false,
      };
      const ctx: GenerationContext = {
        ...mockContext,
        modelNames: [...mockContext.modelNames, "GetPetByIdData"],
      };

      const result = buildQueryKeyFn(op, ctx);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<GetPetByIdData, true>",
      );
      expect(initializer).not.toContain("= {}");
    });

    it("should use unknown for missing data type", () => {
      const op: OperationInfo = {
        ...mockOperation,
        methodName: "unknownMethod",
        capitalizedMethodName: "UnknownMethod",
      };

      const result = buildQueryKeyFn(op, mockContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<unknown, true>");
    });
  });

  describe("buildMutationKeyFn", () => {
    it("should build mutation key function", () => {
      const result = buildMutationKeyFn(mockMutationOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarations[0].name).toBe("UseAddPetKeyFn");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("mutationKey?: Array<unknown>");
      expect(initializer).toContain("[useAddPetKey,");
      expect(initializer).toContain("mutationKey ?? []");
    });
  });
});
