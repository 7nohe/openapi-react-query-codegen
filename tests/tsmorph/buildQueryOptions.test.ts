import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildInfiniteQueryOptionsFn,
  buildQueryOptionsFn,
} from "../../src/tsmorph/buildQueryOptions.mjs";
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

const mockPaginatableOperation: OperationInfo = {
  methodName: "findPaginatedPets",
  capitalizedMethodName: "FindPaginatedPets",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "page", typeName: "number", optional: true }],
  allParamsOptional: true,
  isPaginatable: true,
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

const mockContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: [
    "Pet",
    "FindPetsData",
    "FindPaginatedPetsData",
    "FindPetByIdData",
  ],
  serviceNames: ["findPets", "findPaginatedPets", "findPetById"],
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildQueryOptions", () => {
  describe("buildQueryOptionsFn", () => {
    it("should build a queryOptions factory", () => {
      const result = buildQueryOptionsFn(mockOperation, mockContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("findPetsOptions");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true> = {}",
      );
      expect(initializer).toContain(
        "queryOptions({ queryKey: Common.UseFindPetsKeyFn(clientOptions, queryKey)",
      );
      expect(initializer).toContain(
        "queryFn: () => findPets({ ...clientOptions }).then(response => response.data)",
      );
    });

    it("should not add a default value when the operation has required params", () => {
      const result = buildQueryOptionsFn(
        mockRequiredParamsOperation,
        mockContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>,",
      );
      expect(initializer).not.toContain(
        "clientOptions: Options<FindPetByIdData, true> = {}",
      );
    });

    it("should copy the operation JSDoc as leading trivia", () => {
      const op: OperationInfo = {
        ...mockOperation,
        jsDoc: "/**\n * Returns all pets\n */",
      };
      const result = buildQueryOptionsFn(op, mockContext);

      expect(result.leadingTrivia).toBe("/**\n * Returns all pets\n */\n");
    });
  });

  describe("buildInfiniteQueryOptionsFn", () => {
    it("should return null for non-paginatable operations", () => {
      expect(buildInfiniteQueryOptionsFn(mockOperation, mockContext)).toBe(
        null,
      );
    });

    it("should build an infiniteQueryOptions factory with the dedicated infinite key", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockPaginatableOperation,
        mockContext,
      );

      expect(result?.declarations[0].name).toBe(
        "findPaginatedPetsInfiniteOptions",
      );

      const initializer = result?.declarations[0].initializer as string;
      expect(initializer).toContain(
        "clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}",
      );
      expect(initializer).toContain(
        "infiniteQueryOptions({ queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey)",
      );
      expect(initializer).toContain(
        "query: { ...clientOptions.query, page: pageParam } } as Options<FindPaginatedPetsData, true>",
      );
      expect(initializer).toContain(
        "getNextPageParam: (response) => (response as { nextPage: number }).nextPage",
      );
    });

    it("should emit a numeric initialPageParam so the pageParam type matches getNextPageParam", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockPaginatableOperation,
        mockContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain("initialPageParam: 1,");
      expect(initializer).not.toContain('initialPageParam: "1"');
    });

    it("should quote a non-numeric initialPageParam", () => {
      const ctx: GenerationContext = {
        ...mockContext,
        initialPageParam: "cursor-start",
      };
      const result = buildInfiniteQueryOptionsFn(mockPaginatableOperation, ctx);
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain('initialPageParam: "cursor-start",');
    });

    it("should respect a custom pageParam and nested nextPageParam", () => {
      const ctx: GenerationContext = {
        ...mockContext,
        pageParam: "offset",
        nextPageParam: "meta.next",
      };
      const result = buildInfiniteQueryOptionsFn(mockPaginatableOperation, ctx);
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain("offset: pageParam");
      expect(initializer).toContain(
        "(response as { meta: { next: number } }).meta.next",
      );
    });
  });
});
