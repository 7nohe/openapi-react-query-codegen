import { StructureKind, VariableDeclarationKind } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  buildEnsureQueryDataFn,
  buildGetNextPageParamExpr,
  buildInfiniteClientOptionsParam,
  buildPrefetchFn,
  buildPrefetchInfiniteQueryFn,
  buildUseInfiniteQueryHook,
  buildUseQueryHook,
  buildUseSuspenseInfiniteQueryHook,
  buildUseSuspenseQueryHook,
  formatInitialPageParam,
} from "../../src/tsmorph/buildQueryHooks.mjs";
import type { GenerationContext, OperationInfo } from "../../src/types.mjs";

const mockOperation: OperationInfo = {
  methodName: "findPets",
  capitalizedMethodName: "FindPets",
  dataTypeName: "FindPetsData",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "limit", typeName: "number", optional: true }],
  allParamsOptional: true,
  isPaginatable: false,
};

const mockPaginatableOperation: OperationInfo = {
  methodName: "findPaginatedPets",
  capitalizedMethodName: "FindPaginatedPets",
  dataTypeName: "FindPaginatedPetsData",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [{ name: "page", typeName: "number", optional: true }],
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
  isDeprecated: false,
  parameters: [{ name: "id", typeName: "number", optional: false }],
  allParamsOptional: false,
  isPaginatable: false,
};

// No dataTypeName: the SDK signature exposed no Options<XData, ...> parameter
const mockNoDataTypeOperation: OperationInfo = {
  methodName: "getStatus",
  capitalizedMethodName: "GetStatus",
  httpMethod: "GET",
  isDeprecated: false,
  parameters: [],
  allParamsOptional: true,
  isPaginatable: false,
};

// hey-api prefixes a digit-leading operationId in the function name but strips
// the digits from the Data type, so the two names diverge (#213)
const mockDigitLeadingOperation: OperationInfo = {
  ...mockPaginatableOperation,
  methodName: "_123NumericLead",
  capitalizedMethodName: "_123NumericLead",
  dataTypeName: "NumericLeadData",
};

const mockFetchContext: GenerationContext = {
  client: "@hey-api/client-fetch",
  modelNames: [
    "Pet",
    "FindPetsError",
    "FindPaginatedPetsError",
    "FindPetByIdError",
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
  describe("infinite query helpers", () => {
    it("should omit the default value when a paginatable op has required params", () => {
      const result = buildInfiniteClientOptionsParam({
        ...mockPaginatableOperation,
        allParamsOptional: false,
      });

      expect(result).toBe(
        "clientOptions: Common.FindPaginatedPetsInfiniteClientOptions",
      );
    });

    it("should fall back to a numeric page param when no operation is given", () => {
      expect(formatInitialPageParam(mockFetchContext)).toBe("1");
      expect(buildGetNextPageParamExpr(mockFetchContext)).toBe(
        "(response: unknown) => (response as { nextPage: number }).nextPage",
      );
    });
  });

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
      expect(initializer).toContain(
        "findPets({ ...clientOptions, signal, throwOnError: true })",
      );
      expect(initializer).toContain("queryFn: ({ signal }) =>");
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

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const result = buildUseQueryHook(
        mockNoDataTypeOperation,
        mockFetchContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<unknown, true> = {}",
      );
      expect(initializer).toContain(
        "getStatus({ ...clientOptions, signal, throwOnError: true })",
      );
    });

    it("should use the signature Data type for digit-leading operationIds (#213)", () => {
      const ctx: GenerationContext = {
        ...mockFetchContext,
        modelNames: [...mockFetchContext.modelNames, "NumericLeadError"],
      };
      const result = buildUseQueryHook(mockDigitLeadingOperation, ctx);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<NumericLeadData, true> = {}",
      );
      // The Error type shares the Data type stem, not the method name
      expect(initializer).toContain("TError = NumericLeadError");
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

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const result = buildUseSuspenseQueryHook(
        mockNoDataTypeOperation,
        mockFetchContext,
      );
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<unknown, true> = {}",
      );
      expect(initializer).toContain(
        "getStatus({ ...clientOptions, signal, throwOnError: true })",
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
      expect(initializer).toContain("initialPageParam: 1");
    });

    it("should cast to the signature Data type for digit-leading operationIds (#213)", () => {
      const result = buildUseInfiniteQueryHook(
        mockDigitLeadingOperation,
        mockFetchContext,
      );

      expect(result).not.toBeNull();
      const initializer = result?.declarations[0].initializer as string;
      expect(initializer).toContain("as Options<NumericLeadData, true>");
    });

    it("should make initialPageParam and getNextPageParam optional overrides", () => {
      const result = buildUseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      // The options type must not require initialPageParam/getNextPageParam
      // (#156) while still allowing callers to override them (#146)
      expect(initializer).toContain(
        '"queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"',
      );
      expect(initializer).toContain(
        'Partial<Pick<UseInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>, TError, TData>, "initialPageParam" | "getNextPageParam">>',
      );
      // options spread last so caller overrides win at runtime
      expect(initializer).toMatch(/\.\.\.options\s*\}\)/);
    });

    it("should type the options with a single page as TQueryFnData (#203)", () => {
      const result = buildUseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      // TQueryFnData is one page, so getNextPageParam receives a page rather
      // than the aggregated InfiniteData
      expect(initializer).toContain(
        "UseInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>, TError, TData>",
      );
      expect(initializer).not.toContain(
        "UseInfiniteQueryOptions<TData, TError>",
      );
      // queryFn resolves to a page, matching that TQueryFnData
      expect(initializer).toContain(
        "response.data as NonNullable<Common.FindPaginatedPetsDefaultResponse>",
      );
      expect(initializer).not.toContain("response.data as TData");
    });

    it("should include pageParam in queryFn", () => {
      const result = buildUseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain("page: pageParam as number");
      expect(initializer).toContain("({ pageParam, signal }) =>");
      expect(initializer).toContain("signal, throwOnError: true");
    });

    it("should preserve string cursor types and quote the initial value", () => {
      const result = buildUseInfiniteQueryHook(
        mockStringPaginatableOperation,
        mockFetchContext,
      );
      const initializer = result?.declarations[0].initializer as string;

      expect(initializer).toContain("page: pageParam as Cursor");
      expect(initializer).toContain('initialPageParam: "1"');
      expect(initializer).toContain(
        "(response as { nextPage: Cursor }).nextPage",
      );
    });
  });

  describe("buildPrefetchFn", () => {
    it("should build prefetch function", () => {
      const result = buildPrefetchFn(mockOperation);

      expect(result.declarations[0].name).toBe("prefetchUseFindPets");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain(
        "clientOptions: Options<FindPetsData, true>",
      );
      expect(initializer).toContain("queryClient.prefetchQuery");
      expect(initializer).toContain("Common.UseFindPetsKeyFn(clientOptions)");
      expect(initializer).toContain(
        "findPets({ ...clientOptions, signal, throwOnError: true })",
      );
      expect(initializer).toContain("queryFn: ({ signal }) =>");
      expect(initializer).toContain("response.data");
    });

    it("should include default value for optional params", () => {
      const result = buildPrefetchFn(mockOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain("= {}");
    });

    it("should not include default value for required params", () => {
      const result = buildPrefetchFn(mockRequiredParamsOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<FindPetByIdData, true>",
      );
      // The line should not have " = {}" after the type
      expect(initializer).toMatch(/Options<FindPetByIdData, true>,/);
      expect(initializer).not.toContain("Options<FindPetByIdData, true> = {}");
    });

    it("should accept fetch query options (#157)", () => {
      const result = buildPrefetchFn(mockOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        'options?: Omit<FetchQueryOptions<Common.FindPetsDefaultResponse>, "queryKey" | "queryFn">',
      );
      expect(initializer).toMatch(/\.\.\.options\s*\}\)/);
    });

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const result = buildPrefetchFn(mockNoDataTypeOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<unknown, true> = {}",
      );
      expect(initializer).toContain(
        "getStatus({ ...clientOptions, signal, throwOnError: true })",
      );
    });
  });

  describe("buildEnsureQueryDataFn", () => {
    it("should build ensureQueryData function", () => {
      const result = buildEnsureQueryDataFn(mockOperation);

      expect(result.declarations[0].name).toBe("ensureUseFindPetsData");

      const initializer = result.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient: QueryClient");
      expect(initializer).toContain("queryClient.ensureQueryData");
      expect(initializer).toContain("Common.UseFindPetsKeyFn(clientOptions)");
    });

    it("should be similar to prefetch but use ensureQueryData", () => {
      const prefetchResult = buildPrefetchFn(mockOperation);
      const ensureResult = buildEnsureQueryDataFn(mockOperation);

      const prefetchInit = prefetchResult.declarations[0].initializer as string;
      const ensureInit = ensureResult.declarations[0].initializer as string;

      expect(prefetchInit).toContain("prefetchQuery");
      expect(ensureInit).toContain("ensureQueryData");
      expect(ensureInit).not.toContain("prefetchQuery");
    });

    it("should fall back to unknown when the SDK signature exposes no Data type", () => {
      const result = buildEnsureQueryDataFn(mockNoDataTypeOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        "clientOptions: Options<unknown, true> = {}",
      );
      expect(initializer).toContain(
        "getStatus({ ...clientOptions, signal, throwOnError: true })",
      );
    });

    it("should accept ensure query data options (#157)", () => {
      const result = buildEnsureQueryDataFn(mockOperation);
      const initializer = result.declarations[0].initializer as string;

      expect(initializer).toContain(
        'options?: Omit<EnsureQueryDataOptions<Common.FindPetsDefaultResponse>, "queryKey" | "queryFn">',
      );
      expect(initializer).toMatch(/\.\.\.options\s*\}\)/);
    });
  });

  describe("buildPrefetchInfiniteQueryFn", () => {
    it("should return null for non-paginatable operation", () => {
      const result = buildPrefetchInfiniteQueryFn(
        mockOperation,
        mockFetchContext,
      );

      expect(result).toBeNull();
    });

    it("should build prefetchInfiniteQuery function (#155)", () => {
      const result = buildPrefetchInfiniteQueryFn(
        mockPaginatableOperation,
        mockFetchContext,
      );

      expect(result).not.toBeNull();
      expect(result?.declarations[0].name).toBe(
        "prefetchUseFindPaginatedPetsInfinite",
      );

      const initializer = result?.declarations[0].initializer as string;
      expect(initializer).toContain("queryClient.prefetchInfiniteQuery");
      expect(initializer).toContain(
        "Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions)",
      );
      expect(initializer).toContain(
        "clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}",
      );
      expect(initializer).toContain("initialPageParam: 1");
      expect(initializer).toContain("getNextPageParam");
      expect(initializer).toContain("throwOnError: true");
      expect(initializer).toContain("({ pageParam, signal }) =>");
    });

    it("should allow overriding the pagination options (#203)", () => {
      const result = buildPrefetchInfiniteQueryFn(
        mockPaginatableOperation,
        mockFetchContext,
      );

      const initializer = result?.declarations[0].initializer as string;

      // ...options is spread after the defaults, so the type must not forbid
      // what the runtime honours
      expect(initializer).toContain(
        'Partial<Pick<FetchInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>>, "initialPageParam">>',
      );
      // FetchInfiniteQueryOptions only exposes getNextPageParam on the union
      // member that also requires `pages`, so it cannot be Picked
      expect(initializer).toContain(
        "getNextPageParam?: GetNextPageParamFunction<unknown, NonNullable<Common.FindPaginatedPetsDefaultResponse>>",
      );
      expect(initializer).toMatch(/\.\.\.options\s*\}\)/);
    });
  });

  describe("buildUseSuspenseInfiniteQueryHook", () => {
    it("should return null for non-paginatable operation", () => {
      const result = buildUseSuspenseInfiniteQueryHook(
        mockOperation,
        mockFetchContext,
      );

      expect(result).toBeNull();
    });

    it("should build useSuspenseInfiniteQuery hook", () => {
      const result = buildUseSuspenseInfiniteQueryHook(
        mockPaginatableOperation,
        mockFetchContext,
      );

      expect(result).not.toBeNull();
      expect(result?.declarations[0].name).toBe(
        "useFindPaginatedPetsSuspenseInfinite",
      );

      const initializer = result?.declarations[0].initializer as string;
      expect(initializer).toContain("useSuspenseInfiniteQuery");
      expect(initializer).toContain(
        "InfiniteData<NonNullable<Common.FindPaginatedPetsDefaultResponse>>",
      );
      // Shares the infinite key (and cache) with the non-suspense hook
      expect(initializer).toContain(
        "Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey)",
      );
      // Pagination options are optional overrides, same as useInfiniteQuery
      expect(initializer).toContain(
        'Partial<Pick<UseSuspenseInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>, TError, TData>, "initialPageParam" | "getNextPageParam">>',
      );
      expect(initializer).toContain("({ pageParam, signal }) =>");
    });
  });
});
