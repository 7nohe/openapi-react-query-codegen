import { describe, expect, it } from "vitest";
import {
  buildDefaultResponseType,
  buildInfiniteClientOptionsType,
  buildInfiniteQueryKeyConst,
  buildInfiniteQueryKeyFn,
  buildKeyConst,
  buildMutationKeyFn,
  buildMutationResultType,
  buildQueryKeyFn,
  buildQueryResultType,
} from "../../src/hooks/buildCommon.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockOperation: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  dataTypeName: "FindPetsData",
  httpMethod: "GET",
  allParamsOptional: true,
  isPaginatable: false,
};

const mockMutationOperation: OperationInfo = {
  methodName: "addPet",
  capitalizedMethodName: "AddPet",
  dataTypeName: "AddPetData",
  httpMethod: "POST",
  allParamsOptional: false,
  isPaginatable: false,
};

const mockPaginatableOperation: OperationInfo = {
  methodName: "findPaginatedPets",
  capitalizedMethodName: "FindPaginatedPets",
  dataTypeName: "FindPaginatedPetsData",
  httpMethod: "GET",
  allParamsOptional: true,
  isPaginatable: true,
};

const mockContext: GenerationContext = {
  client: "fetch",
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildCommon", () => {
  describe("buildDefaultResponseType", () => {
    it("should build default response type alias", () => {
      const result = buildDefaultResponseType(mockOperation);

      expect(result.kind).toBe("type");
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

      expect(result.kind).toBe("type");
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

      expect(result.kind).toBe("type");
      expect(result.name).toBe("AddPetMutationResult");
      expect(result.type).toBe("Awaited<ReturnType<typeof addPet>>");
    });
  });

  describe("buildKeyConst", () => {
    it("should build the key constant of a query", () => {
      const result = buildKeyConst(mockOperation);

      expect(result.kind).toBe("const");
      expect(result.name).toBe("useFindPetsKey");
      expect(result.initializer).toBe('"FindPets"');
    });

    it("should build the key constant of a mutation", () => {
      const result = buildKeyConst(mockMutationOperation);

      expect(result.name).toBe("useAddPetKey");
      expect(result.initializer).toBe('"AddPet"');
    });
  });

  describe("buildQueryKeyFn", () => {
    it("should build query key function with parameters", () => {
      const result = buildQueryKeyFn(mockOperation);

      expect(result.kind).toBe("const");
      expect(result.name).toBe("UseFindPetsKeyFn");

      const initializer = result.initializer as string;
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
        dataTypeName: "GetPetByIdData",
        allParamsOptional: false,
      };

      const result = buildQueryKeyFn(op);
      const initializer = result.initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<GetPetByIdData, true>",
      );
      expect(initializer).not.toContain("= {}");
    });

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const op: OperationInfo = {
        ...mockOperation,
        methodName: "unknownMethod",
        capitalizedMethodName: "UnknownMethod",
        dataTypeName: undefined,
      };

      const result = buildQueryKeyFn(op);
      const initializer = result.initializer as string;

      expect(initializer).toContain("Options<unknown, true>");
    });

    it("should use the signature Data type for digit-leading operationIds (#213)", () => {
      const op: OperationInfo = {
        ...mockOperation,
        methodName: "_123NumericLead",
        capitalizedMethodName: "_123NumericLead",
        dataTypeName: "NumericLeadData",
      };

      const result = buildQueryKeyFn(op);
      const initializer = result.initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<NumericLeadData, true>",
      );
    });
  });

  describe("buildMutationKeyFn", () => {
    it("should build mutation key function", () => {
      const result = buildMutationKeyFn(mockMutationOperation);

      expect(result.kind).toBe("const");
      expect(result.name).toBe("UseAddPetKeyFn");

      const initializer = result.initializer as string;
      expect(initializer).toContain("mutationKey?: Array<unknown>");
      expect(initializer).toContain("[useAddPetKey,");
      expect(initializer).toContain("mutationKey ?? []");
    });
  });
  describe("buildInfiniteClientOptionsType", () => {
    it("should exclude the page param from the query type", () => {
      const result = buildInfiniteClientOptionsType(
        mockPaginatableOperation,
        mockContext,
      );
      expect(result.name).toBe("FindPaginatedPetsInfiniteClientOptions");
      expect(result.type).toBe(
        'Omit<Options<FindPaginatedPetsData, true>, "query"> & { query?: Omit<NonNullable<FindPaginatedPetsData["query"]>, "page"> }',
      );
    });
  });

  describe("buildInfiniteQueryKeyConst", () => {
    it("should build a hierarchical key sharing the plain key prefix", () => {
      const result = buildInfiniteQueryKeyConst(mockPaginatableOperation);

      expect(result.name).toBe("useFindPaginatedPetsInfiniteKey");
      expect(result.initializer).toBe(
        '[useFindPaginatedPetsKey, "infinite"] as const',
      );
    });
  });

  describe("buildInfiniteQueryKeyFn", () => {
    it("should build a key fn typed with the infinite client options", () => {
      const result = buildInfiniteQueryKeyFn(mockPaginatableOperation);

      expect(result.name).toBe("UseFindPaginatedPetsInfiniteKeyFn");
      expect(result.initializer).toBe(
        "(clientOptions: FindPaginatedPetsInfiniteClientOptions = {}, queryKey?: Array<unknown>) => [...useFindPaginatedPetsInfiniteKey, ...(queryKey ?? [clientOptions])]",
      );
    });

    it("should omit the default value when the operation has required params", () => {
      const result = buildInfiniteQueryKeyFn({
        ...mockPaginatableOperation,
        allParamsOptional: false,
      });

      expect(result.initializer).toBe(
        "(clientOptions: FindPaginatedPetsInfiniteClientOptions, queryKey?: Array<unknown>) => [...useFindPaginatedPetsInfiniteKey, ...(queryKey ?? [clientOptions])]",
      );
    });
  });
});
