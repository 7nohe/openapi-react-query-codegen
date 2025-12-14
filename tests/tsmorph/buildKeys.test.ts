import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildMutationKeyExport,
  buildMutationKeyFnExport,
  buildQueryKeyExport,
  buildQueryKeyFnExport,
  getMutationKeyFnName,
  getMutationKeyName,
  getQueryKeyFnName,
  getQueryKeyName,
} from "../../src/tsmorph/buildKeys.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockQueryOperation: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "limit", typeName: "number", optional: true }],
  allParamsOptional: true,
  isPaginatable: false,
};

const mockRequiredParamsOperation: OperationInfo = {
  methodName: "findPetById",
  capitalizedMethodName: "FindPetById",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "id", typeName: "number", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

const mockNoParamsOperation: OperationInfo = {
  methodName: "listAllPets",
  capitalizedMethodName: "ListAllPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [],
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
  modelNames: [
    "Pet",
    "NewPet",
    "FindPetsData",
    "FindPetByIdData",
    "AddPetData",
  ],
  serviceNames: ["findPets", "findPetById", "listAllPets", "addPet"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildKeys", () => {
  describe("getQueryKeyName", () => {
    it("should return query key name", () => {
      expect(getQueryKeyName(mockQueryOperation)).toBe("findPetsQueryKey");
    });

    it("should use method name as base", () => {
      expect(getQueryKeyName(mockRequiredParamsOperation)).toBe(
        "findPetByIdQueryKey",
      );
    });
  });

  describe("getMutationKeyName", () => {
    it("should return mutation key name", () => {
      expect(getMutationKeyName(mockMutationOperation)).toBe(
        "addPetMutationKey",
      );
    });
  });

  describe("getQueryKeyFnName", () => {
    it("should return query key function name", () => {
      expect(getQueryKeyFnName(mockQueryOperation)).toBe("FindPetsQueryKeyFn");
    });

    it("should use capitalized method name", () => {
      expect(getQueryKeyFnName(mockRequiredParamsOperation)).toBe(
        "FindPetByIdQueryKeyFn",
      );
    });
  });

  describe("getMutationKeyFnName", () => {
    it("should return mutation key function name", () => {
      expect(getMutationKeyFnName(mockMutationOperation)).toBe(
        "AddPetMutationKeyFn",
      );
    });
  });

  describe("buildQueryKeyExport", () => {
    it("should build query key constant", () => {
      const result = buildQueryKeyExport(mockQueryOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations).toHaveLength(1);
      expect(result.declarations[0].name).toBe("findPetsQueryKey");
      expect(result.declarations[0].initializer).toBe('"FindPets"');
    });

    it("should use capitalized method name as value", () => {
      const result = buildQueryKeyExport(mockRequiredParamsOperation);

      expect(result.declarations[0].name).toBe("findPetByIdQueryKey");
      expect(result.declarations[0].initializer).toBe('"FindPetById"');
    });
  });

  describe("buildMutationKeyExport", () => {
    it("should build mutation key constant", () => {
      const result = buildMutationKeyExport(mockMutationOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("addPetMutationKey");
      expect(result.declarations[0].initializer).toBe('"AddPet"');
    });
  });

  describe("buildQueryKeyFnExport", () => {
    it("should build query key function with parameters", () => {
      const result = buildQueryKeyFnExport(mockQueryOperation, mockContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarations[0].name).toBe("FindPetsQueryKeyFn");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true>",
      );
      expect(initializer).toContain("= {}"); // default value for optional params
      expect(initializer).toContain("queryKey?: Array<unknown>");
      expect(initializer).toContain("[findPetsQueryKey,");
      expect(initializer).toContain("[clientOptions]"); // fallback array
      expect(initializer).toContain("as const");
    });

    it("should build query key function without default value for required params", () => {
      const result = buildQueryKeyFnExport(
        mockRequiredParamsOperation,
        mockContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>",
      );
      expect(initializer).not.toContain("= {}");
    });

    it("should build query key function without clientOptions for no params operation", () => {
      const result = buildQueryKeyFnExport(mockNoParamsOperation, mockContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).not.toContain("clientOptions");
      expect(initializer).toContain("queryKey?: Array<unknown>");
      expect(initializer).toContain("queryKey ?? []"); // empty fallback
    });

    it("should use unknown for missing data type", () => {
      const op: OperationInfo = {
        ...mockQueryOperation,
        methodName: "unknownMethod",
        capitalizedMethodName: "UnknownMethod",
      };

      const result = buildQueryKeyFnExport(op, mockContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("Options<unknown, true>");
    });
  });

  describe("buildMutationKeyFnExport", () => {
    it("should build mutation key function", () => {
      const result = buildMutationKeyFnExport(mockMutationOperation);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarations[0].name).toBe("AddPetMutationKeyFn");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("mutationKey?: Array<unknown>");
      expect(initializer).toContain("[addPetMutationKey,");
      expect(initializer).toContain("mutationKey ?? []");
      expect(initializer).toContain("as const");
    });
  });
});
