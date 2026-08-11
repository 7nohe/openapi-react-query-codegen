import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

/**
 * Get the error type string based on client type.
 */
function getErrorType(op: OperationInfo, ctx: GenerationContext): string {
  const errorTypeName = `${op.capitalizedMethodName}Error`;
  // Operations without error responses have no generated Error type
  const errorType = ctx.modelNames.includes(errorTypeName)
    ? errorTypeName
    : "unknown";
  if (ctx.client === "@hey-api/client-axios") {
    return `AxiosError<${errorType}>`;
  }
  return errorType;
}

/**
 * Resolve the generated Data type name for an operation, falling back to
 * unknown when the operation has no generated Data type.
 */
export function getDataTypeName(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  return ctx.modelNames.includes(`${op.capitalizedMethodName}Data`)
    ? `${op.capitalizedMethodName}Data`
    : "unknown";
}

/**
 * SDK call arguments shared by every generated queryFn/mutationFn.
 * throwOnError: true forces the SDK call to reject on error responses; the
 * hey-api runtime default is false, which would resolve undefined data and
 * swallow the error instead of surfacing it to TanStack Query (#172).
 */
export const SDK_CALL_ARGS = "{ ...clientOptions, throwOnError: true }";

/** SDK call arguments for TanStack query functions with cancellation. */
export const QUERY_SDK_CALL_ARGS =
  "{ ...clientOptions, signal, throwOnError: true }";

/** Resolve the OpenAPI page parameter type, preserving older numeric output. */
export function getPageParamType(op: OperationInfo): string {
  return op.pageParamType ?? "number";
}

/**
 * Build the client options parameter string.
 */
export function buildClientOptionsParam(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  const dataTypeName = getDataTypeName(op, ctx);

  const hasParams = op.parameters.length > 0;
  if (!hasParams) {
    return `clientOptions: Options<${dataTypeName}, true> = {}`;
  }

  const defaultValue = op.allParamsOptional ? " = {}" : "";
  return `clientOptions: Options<${dataTypeName}, true>${defaultValue}`;
}

/**
 * Build the clientOptions parameter typed with the page-less infinite
 * options type — the page parameter is supplied by TanStack Query's
 * pageParam mechanism.
 */
export function buildInfiniteClientOptionsParam(op: OperationInfo): string {
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  return `clientOptions: Common.${op.capitalizedMethodName}InfiniteClientOptions${defaultValue}`;
}

/**
 * The type of a single page. TanStack Query instantiates the infinite options
 * with this as TQueryFnData, so it is what `getNextPageParam` receives as
 * `lastPage` (#203). NonNullable because `throwOnError: true` means a resolved
 * page is always present.
 */
export function getPageType(op: OperationInfo): string {
  return `NonNullable<Common.${op.capitalizedMethodName}DefaultResponse>`;
}

/**
 * Build the paginated SDK call shared by every infinite query builder.
 * The resolved response is narrowed to the page type so it matches the
 * TQueryFnData the infinite options are instantiated with (#203). Spelled as
 * a cast rather than `!` because generated code is linted downstream, and a
 * non-null assertion trips biome's noNonNullAssertion.
 */
export function buildPagedQueryFn(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  const dataTypeName = getDataTypeName(op, ctx);
  const thenClause = `.then(response => response.data as ${getPageType(op)})`;
  const pageParamType = getPageParamType(op);
  // When the initial page param is omitted, the first request must send no
  // page param at all, so spread it in only once TanStack Query provides one.
  const pageQuery = ctx.omitInitialPageParam
    ? `...(pageParam === undefined ? {} : { ${ctx.pageParam}: pageParam as ${pageParamType} })`
    : `${ctx.pageParam}: pageParam as ${pageParamType}`;
  return `({ pageParam, signal }) => ${op.methodName}({ ...clientOptions, query: { ...clientOptions.query, ${pageQuery} }, signal, throwOnError: true } as Options<${dataTypeName}, true>)${thenClause}`;
}

/**
 * Format the initialPageParam literal. Emits `undefined` when the caller opted
 * to omit it (#177); otherwise a numeric literal when possible so the inferred
 * pageParam type matches what getNextPageParam returns.
 */
export function formatInitialPageParam(
  ctx: GenerationContext,
  op?: OperationInfo,
): string {
  if (ctx.omitInitialPageParam) {
    return "undefined";
  }
  const isStringPageParam = op
    ? op.pageParamTypeKind === "string" ||
      (op.pageParamTypeKind === undefined &&
        /\bstring\b/.test(getPageParamType(op)))
    : false;
  if (isStringPageParam) {
    return JSON.stringify(ctx.initialPageParam);
  }
  return /^-?\d+$/.test(ctx.initialPageParam)
    ? ctx.initialPageParam
    : JSON.stringify(ctx.initialPageParam);
}

/**
 * Build the nested type for getNextPageParam.
 * E.g., "meta.next" becomes "{ meta: { next: number } }"
 */
export function buildNestedNextPageType(
  nextPageParam: string,
  pageParamType = "number",
): string {
  const segments = nextPageParam.split(".");
  return segments.reduceRight((acc, segment) => {
    return `{ ${segment}: ${acc} }`;
  }, pageParamType);
}

/**
 * Build the getNextPageParam expression. The parameter is annotated because
 * not every TanStack entry point contextually types it (prefetchInfiniteQuery
 * does not, which would fail noImplicitAny).
 */
export function buildGetNextPageParamExpr(
  ctx: GenerationContext,
  op?: OperationInfo,
): string {
  const nestedType = buildNestedNextPageType(
    ctx.nextPageParam,
    op ? getPageParamType(op) : "number",
  );
  return `(response: unknown) => (response as ${nestedType}).${ctx.nextPageParam}`;
}

/**
 * Build an options type where the pagination fields TanStack Query marks as
 * required become optional overrides: the generator supplies them, and
 * callers may replace them for custom pagination schemes (#156, #146).
 *
 * The first type argument is TQueryFnData — a single page — not TData (#203).
 * Passing TData there made `getNextPageParam` receive the aggregated
 * `InfiniteData<...>` as `lastPage`, so any custom pagination logic failed to
 * compile. Only the first three type arguments are written: TanStack Query
 * dropped TQueryData from `UseInfiniteQueryOptions` within the v5 line, so
 * positions beyond TData are not stable across the supported peer range.
 */
export function buildOverridableInfiniteOptionsType(
  optionsTypeName: string,
  pageType: string,
): string {
  const instantiated = `${optionsTypeName}<${pageType}, TError, TData>`;
  return `Omit<${instantiated}, "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"> & Partial<Pick<${instantiated}, "initialPageParam" | "getNextPageParam">>`;
}

/**
 * Build useQuery hook.
 * Example:
 * export const useFindPets = <TData = Common.FindPetsDefaultResponse, TError = FindPetsError, TQueryKey extends Array<unknown> = unknown[]>(
 *   clientOptions: Options<FindPetsData, true> = {},
 *   queryKey?: TQueryKey,
 *   options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">
 * ) => useQuery<TData, TError>({
 *   queryKey: Common.UseFindPetsKeyFn(clientOptions, queryKey),
 *   queryFn: () => findPets({ ...clientOptions, throwOnError: true }).then(response => response.data as TData) as TData,
 *   ...options
 * });
 */
export function buildUseQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const hookName = `use${op.capitalizedMethodName}`;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `Common.${op.capitalizedMethodName}DefaultResponse`;
  const clientOptionsParam = buildClientOptionsParam(op, ctx);

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

  const body = `useQuery<TData, TError>({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: hookName,
        initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${clientOptionsParam}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => ${body}`,
      },
    ],
  };
}

/**
 * Build useSuspenseQuery hook.
 */
export function buildUseSuspenseQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const hookName = `use${op.capitalizedMethodName}Suspense`;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `NonNullable<Common.${op.capitalizedMethodName}DefaultResponse>`;
  const clientOptionsParam = buildClientOptionsParam(op, ctx);

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

  const body = `useSuspenseQuery<TData, TError>({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: hookName,
        initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${clientOptionsParam}, queryKey?: TQueryKey, options?: Omit<UseSuspenseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => ${body}`,
      },
    ],
  };
}

/**
 * Build a useInfiniteQuery / useSuspenseInfiniteQuery hook. Both variants
 * share the infinite query key (and therefore the cache); they differ only
 * in the TanStack hook called, the options type, and the NonNullable TData
 * default of the suspense variant.
 */
function buildInfiniteHook(
  op: OperationInfo,
  ctx: GenerationContext,
  suspense: boolean,
): VariableStatementStructure | null {
  if (!op.isPaginatable) {
    return null;
  }

  const hookCall = suspense ? "useSuspenseInfiniteQuery" : "useInfiniteQuery";
  const optionsTypeName = suspense
    ? "UseSuspenseInfiniteQueryOptions"
    : "UseInfiniteQueryOptions";
  const hookName = suspense
    ? `use${op.capitalizedMethodName}SuspenseInfinite`
    : `use${op.capitalizedMethodName}Infinite`;

  const errorType = getErrorType(op, ctx);
  const baseDataType = `Common.${op.capitalizedMethodName}DefaultResponse`;
  const dataTypeDefault = suspense
    ? `InfiniteData<NonNullable<${baseDataType}>>`
    : `InfiniteData<${baseDataType}>`;

  const queryFn = buildPagedQueryFn(op, ctx);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx, op)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx, op)}`;

  const body = `${hookCall}({ queryKey: Common.Use${op.capitalizedMethodName}InfiniteKeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: hookName,
        initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${buildInfiniteClientOptionsParam(op)}, queryKey?: TQueryKey, options?: ${buildOverridableInfiniteOptionsType(optionsTypeName, getPageType(op))}) => ${body}`,
      },
    ],
  };
}

/**
 * Build useInfiniteQuery hook.
 */
export function buildUseInfiniteQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  return buildInfiniteHook(op, ctx, false);
}

/**
 * Build useSuspenseInfiniteQuery hook.
 */
export function buildUseSuspenseInfiniteQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  return buildInfiniteHook(op, ctx, true);
}

/**
 * Build prefetch function.
 * Example:
 * export const prefetchUseFindPets = (queryClient: QueryClient, clientOptions: Options<FindPetsData, true> = {}, options?: Omit<FetchQueryOptions<Common.FindPetsDefaultResponse>, "queryKey" | "queryFn">) =>
 *   queryClient.prefetchQuery({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions),
 *     queryFn: () => findPets({ ...clientOptions, throwOnError: true }).then(response => response.data),
 *     ...options
 *   });
 */
export function buildPrefetchFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `prefetchUse${op.capitalizedMethodName}`;

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data)`;

  const optionsParam = `options?: Omit<FetchQueryOptions<Common.${op.capitalizedMethodName}DefaultResponse>, "queryKey" | "queryFn">`;
  const body = `queryClient.prefetchQuery({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(queryClient: QueryClient, ${buildClientOptionsParam(op, ctx)}, ${optionsParam}) => ${body}`,
      },
    ],
  };
}

/**
 * Build prefetchInfiniteQuery function for a paginatable operation.
 * Example:
 * export const prefetchUseFindPaginatedPetsInfinite = (queryClient: QueryClient, clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}, options?: Omit<FetchInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>>, "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"> & Partial<Pick<FetchInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>>, "initialPageParam">> & { getNextPageParam?: GetNextPageParamFunction<unknown, NonNullable<Common.FindPaginatedPetsDefaultResponse>> }) =>
 *   queryClient.prefetchInfiniteQuery({
 *     queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions),
 *     queryFn: ({ pageParam }) => findPaginatedPets({ ...clientOptions, query: { ...clientOptions.query, page: pageParam as number }, throwOnError: true } as Options<FindPaginatedPetsData, true>).then(response => response.data as NonNullable<Common.FindPaginatedPetsDefaultResponse>),
 *     initialPageParam: 1,
 *     getNextPageParam: (response: unknown) => (response as { nextPage: number }).nextPage,
 *     ...options
 *   });
 */
export function buildPrefetchInfiniteQueryFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  if (!op.isPaginatable) {
    return null;
  }

  const fnName = `prefetchUse${op.capitalizedMethodName}Infinite`;

  const queryFn = buildPagedQueryFn(op, ctx);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx, op)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx, op)}`;

  // The pagination fields are re-added as optional overrides: `...options` is
  // spread after the defaults, so replacing them works at runtime and must not
  // be forbidden by the type (#203). getNextPageParam is spelled out rather
  // than Picked, because FetchInfiniteQueryOptions only exposes it on the
  // union member that also requires `pages`.
  const pageType = getPageType(op);
  const instantiated = `FetchInfiniteQueryOptions<${pageType}>`;
  const overrides = `Partial<Pick<${instantiated}, "initialPageParam">> & { getNextPageParam?: GetNextPageParamFunction<unknown, ${pageType}> }`;
  const optionsParam = `options?: Omit<${instantiated}, "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"> & ${overrides}`;
  const body = `queryClient.prefetchInfiniteQuery({ queryKey: Common.Use${op.capitalizedMethodName}InfiniteKeyFn(clientOptions), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(queryClient: QueryClient, ${buildInfiniteClientOptionsParam(op)}, ${optionsParam}) => ${body}`,
      },
    ],
  };
}

/**
 * Build ensureQueryData function.
 * Example:
 * export const ensureUseFindPetsData = (queryClient: QueryClient, clientOptions: Options<FindPetsData, true> = {}, options?: Omit<EnsureQueryDataOptions<Common.FindPetsDefaultResponse>, "queryKey" | "queryFn">) =>
 *   queryClient.ensureQueryData({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions),
 *     queryFn: () => findPets({ ...clientOptions, throwOnError: true }).then(response => response.data),
 *     ...options
 *   });
 */
export function buildEnsureQueryDataFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `ensureUse${op.capitalizedMethodName}Data`;

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data)`;

  const optionsParam = `options?: Omit<EnsureQueryDataOptions<Common.${op.capitalizedMethodName}DefaultResponse>, "queryKey" | "queryFn">`;
  const body = `queryClient.ensureQueryData({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(queryClient: QueryClient, ${buildClientOptionsParam(op, ctx)}, ${optionsParam}) => ${body}`,
      },
    ],
  };
}
