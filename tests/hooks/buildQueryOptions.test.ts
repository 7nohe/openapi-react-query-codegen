import { describe, expect, it } from "vitest";
import {
  buildInfiniteQueryOptionsFn,
  buildQueryOptionsFn,
} from "../../src/hooks/buildQueryOptions.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockOperation: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  dataTypeName: "FindPetsData",
  httpMethod: "GET",
  allParamsOptional: true,
  isPaginatable: false,
};

const mockPaginatableOperation: OperationInfo = {
  methodName: "findPaginatedPets",
  capitalizedMethodName: "FindPaginatedPets",
  dataTypeName: "FindPaginatedPetsData",
  httpMethod: "GET",
  allParamsOptional: true,
  isPaginatable: true,
  pageParamType: "number",
  pageParamTypeKind: "number",
};

const mockStringPaginatableOperation: OperationInfo = {
  ...mockPaginatableOperation,
  pageParamType: "Cursor",
  pageParamTypeKind: "string",
};

const mockRequiredParamsOperation: OperationInfo = {
  methodName: "findPetById",
  capitalizedMethodName: "FindPetById",
  dataTypeName: "FindPetByIdData",
  httpMethod: "GET",
  allParamsOptional: false,
  isPaginatable: false,
};

const mockContext: GenerationContext = {
  client: "fetch",
  pageParam: "page",
  nextPageParam: "nextPage",
  initialPageParam: "1",
  version: "1.0.0",
};

describe("buildQueryOptions", () => {
  describe("buildQueryOptionsFn", () => {
    it("should build a queryOptions factory", () => {
      const result = buildQueryOptionsFn(mockOperation);

      expect(result.kind).toBe("const");
      expect(result.name).toBe("findPetsOptions");

      const initializer = result.initializer as string;
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true> = {}",
      );
      expect(initializer).toContain(
        "queryOptions({ queryKey: Common.UseFindPetsKeyFn(clientOptions, queryKey)",
      );
      expect(initializer).toContain(
        "queryFn: ({ signal }) => findPets({ ...clientOptions, signal, throwOnError: true }).then(response => response.data)",
      );
    });

    it("should not add a default value when the operation has required params", () => {
      const result = buildQueryOptionsFn(mockRequiredParamsOperation);
      const initializer = result.initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>,",
      );
      expect(initializer).not.toContain(
        "clientOptions: Options<FindPetByIdData, true> = {}",
      );
    });

    it("should copy the operation JSDoc", () => {
      const op: OperationInfo = {
        ...mockOperation,
        jsDoc: "/**\n * Returns all pets\n */",
      };
      const result = buildQueryOptionsFn(op);

      expect(result.jsDoc).toBe("/**\n * Returns all pets\n */");
    });
  });

  describe("buildInfiniteQueryOptionsFn", () => {
    it("should build an infiniteQueryOptions factory with the dedicated infinite key", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockPaginatableOperation,
        mockContext,
      );

      expect(result?.name).toBe("findPaginatedPetsInfiniteOptions");

      const initializer = result?.initializer as string;
      expect(initializer).toContain(
        "clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}",
      );
      expect(initializer).toContain(
        "infiniteQueryOptions({ queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey)",
      );
      expect(initializer).toContain(
        "query: { ...clientOptions.query, page: pageParam as number }, signal, throwOnError: true } as Options<FindPaginatedPetsData, true>",
      );
      expect(initializer).toContain(
        "getNextPageParam: (response: unknown) => (response as { nextPage: number }).nextPage",
      );
    });

    it("should accept pagination overrides (#203)", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockPaginatableOperation,
        mockContext,
      );
      const initializer = result?.initializer as string;

      expect(initializer).toContain(
        'options?: Partial<Pick<UseInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>>, "initialPageParam" | "getNextPageParam">>',
      );
      // spread last so the caller's overrides win
      expect(initializer).toMatch(/\.\.\.options\s*\}\)/);
    });

    it("should emit a numeric initialPageParam so the pageParam type matches getNextPageParam", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockPaginatableOperation,
        mockContext,
      );
      const initializer = result?.initializer as string;

      expect(initializer).toContain("initialPageParam: 1,");
      expect(initializer).not.toContain('initialPageParam: "1"');
    });

    it("should quote a non-numeric initialPageParam", () => {
      const ctx: GenerationContext = {
        ...mockContext,
        initialPageParam: "cursor-start",
      };
      const result = buildInfiniteQueryOptionsFn(mockPaginatableOperation, ctx);
      const initializer = result?.initializer as string;

      expect(initializer).toContain('initialPageParam: "cursor-start",');
    });

    it("should preserve a string cursor type even for numeric-looking values", () => {
      const result = buildInfiniteQueryOptionsFn(
        mockStringPaginatableOperation,
        mockContext,
      );
      const initializer = result?.initializer as string;

      expect(initializer).toContain("page: pageParam as Cursor");
      expect(initializer).toContain('initialPageParam: "1"');
      expect(initializer).toContain(
        "(response as { nextPage: Cursor }).nextPage",
      );
    });

    it("should respect a custom pageParam and nested nextPageParam", () => {
      const ctx: GenerationContext = {
        ...mockContext,
        pageParam: "offset",
        nextPageParam: "meta.next",
      };
      const result = buildInfiniteQueryOptionsFn(mockPaginatableOperation, ctx);
      const initializer = result?.initializer as string;

      expect(initializer).toContain("offset: pageParam");
      expect(initializer).toContain(
        "(response as { meta: { next: number } }).meta?.next",
      );
    });
  });
});
