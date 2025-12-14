import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildEnsureQueryDataFn,
  buildPrefetchFn,
  buildUseInfiniteQueryHook,
  buildUseQueryHook,
  buildUseSuspenseQueryHook,
} from "../../src/tsmorph/buildQueryHooks.mjs";
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

const mockFetchContext: GenerationContext = {
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

const mockAxiosContext: GenerationContext = {
  ...mockFetchContext,
  client: "@hey-api/client-axios",
};

describe("buildQueryHooks", () => {
  describe("buildUseQueryHook", () => {
    it("should build useQuery hook with fetch client", () => {
      const result = buildUseQueryHook(mockOperation, mockFetchContext);

      expect(result.kind).toBe(StructureKind.VariableStatement);
      expect(result.isExported).toBe(true);
      expect(result.declarationKind).toBe(VariableDeclarationKind.Const);
      expect(result.declarations[0].name).toBe("useFindPets");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("TData = Common.FindPetsDefaultResponse");
      expect(initializer).toContain("TError = FindPetsError");
      expect(initializer).toContain("useQuery<TData, TError>");
      expect(initializer).toContain(
        "Common.UseFindPetsKeyFn(clientOptions, queryKey)",
      );
      expect(initializer).toContain("findPets({ ...clientOptions })");
      expect(initializer).toContain("response.data as TData");
    });

    it("should build useQuery hook with axios client and AxiosError", () => {
      const result = buildUseQueryHook(mockOperation, mockAxiosContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("TError = AxiosError<FindPetsError>");
    });

    it("should include default value for optional params", () => {
      const result = buildUseQueryHook(mockOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true> = {}",
      );
    });

    it("should not include default value for required params", () => {
      const result = buildUseQueryHook(
        mockRequiredParamsOperation,
        mockFetchContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>",
      );
      expect(initializer).not.toContain("= {}");
    });
  });

  describe("buildUseSuspenseQueryHook", () => {
    it("should build useSuspenseQuery hook", () => {
      const result = buildUseSuspenseQueryHook(mockOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("useFindPetsSuspense");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain(
        "TData = NonNullable<Common.FindPetsDefaultResponse>",
      );
      expect(initializer).toContain("useSuspenseQuery<TData, TError>");
      expect(initializer).toContain("UseSuspenseQueryOptions<TData, TError>");
    });

    it("should use NonNullable wrapper for data type", () => {
      const result = buildUseSuspenseQueryHook(mockOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "NonNullable<Common.FindPetsDefaultResponse>",
      );
    });
  });

  describe("buildUseInfiniteQueryHook", () => {
    it("should return null for non-paginatable operation", () => {
      const result = buildUseInfiniteQueryHook(mockOperation, mockFetchContext);

      expect(result).toBeNull();
    });

    it("should build useInfiniteQuery hook for paginatable operation", () => {
      const result = buildUseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );

      expect(result).not.toBeNull();
      expect(result?.declarations[0].name).toBe("useFindPaginatedPetsInfinite");

      const initializer = result?.declarations[0].initializer as string;
      expect(initializer).toContain(
        "InfiniteData<Common.FindPaginatedPetsDefaultResponse>",
      );
      expect(initializer).toContain("useInfiniteQuery");
      expect(initializer).toContain("pageParam");
      expect(initializer).toContain("getNextPageParam");
      expect(initializer).toContain('initialPageParam: "1"');
    });

    it("should include pageParam in queryFn", () => {
      const result = buildUseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain("page: pageParam as number");
    });
  });

  describe("buildPrefetchFn", () => {
    it("should build prefetch function", () => {
      const result = buildPrefetchFn(mockOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("prefetchUseFindPets");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true>",
      );
      expect(initializer).toContain("queryClient.prefetchQuery");
      expect(initializer).toContain("Common.UseFindPetsKeyFn(clientOptions)");
      expect(initializer).toContain("findPets({ ...clientOptions })");
      expect(initializer).toContain("response.data");
    });

    it("should include default value for optional params", () => {
      const result = buildPrefetchFn(mockOperation, mockFetchContext);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("= {}");
    });

    it("should not include default value for required params", () => {
      const result = buildPrefetchFn(
        mockRequiredParamsOperation,
        mockFetchContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>",
      );
      // The line should not have " = {}" after the type
      expect(initializer).toMatch(/Options<FindPetByIdData, true>\)/);
    });
  });

  describe("buildEnsureQueryDataFn", () => {
    it("should build ensureQueryData function", () => {
      const result = buildEnsureQueryDataFn(mockOperation, mockFetchContext);

      expect(result.declarations[0].name).toBe("ensureUseFindPetsData");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain("queryClient.ensureQueryData");
      expect(initializer).toContain("Common.UseFindPetsKeyFn(clientOptions)");
    });

    it("should be similar to prefetch but use ensureQueryData", () => {
      const prefetchResult = buildPrefetchFn(mockOperation, mockFetchContext);
      const ensureResult = buildEnsureQueryDataFn(
        mockOperation,
        mockFetchContext,
      );

      const prefetchInit = prefetchResult.declarations[0].initializer as string;
      const ensureInit = ensureResult.declarations[0].initializer as string;

      expect(prefetchInit).toContain("prefetchQuery");
      expect(ensureInit).toContain("ensureQueryData");
      expect(ensureInit).not.toContain("prefetchQuery");
    });
  });
});
