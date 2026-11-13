import { isValidIdentifier, propertyKey } from "../client/naming.mjs";
import type { GenerationContext } from "../types.mjs";
import { type HookOperation, hookNames } from "./hookNames.mjs";
import {
  dataModels,
  errorModels,
  getDataTypeName,
  getErrorType,
  operationConst,
} from "./operationNames.mjs";
import type { ConstStatement } from "./statement.mjs";

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
export function getPageParamType(op: HookOperation): string {
  return op.pageParamType ?? "number";
}

/**
 * Build the client options parameter string.
 */
export function buildClientOptionsParam(op: HookOperation): string {
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  return `clientOptions: Options<${getDataTypeName(op)}, true>${defaultValue}`;
}

/**
 * Build the clientOptions parameter typed with the page-less infinite
 * options type — the page parameter is supplied by TanStack Query's
 * pageParam mechanism.
 */
export function buildInfiniteClientOptionsParam(op: HookOperation): string {
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  return `clientOptions: Common.${hookNames(op).infiniteClientOptions}${defaultValue}`;
}

/**
 * The type of a single page. TanStack Query instantiates the infinite options
 * with this as TQueryFnData, so it is what `getNextPageParam` receives as
 * `lastPage` (#203). NonNullable because `throwOnError: true` means a resolved
 * page is always present.
 */
export function getPageType(op: HookOperation): string {
  return `NonNullable<Common.${hookNames(op).defaultResponse}>`;
}

/**
 * The models a paginated query names: the Data type in `buildPagedQueryFn`,
 * and whatever the page parameter's type refers to.
 */
export function pagedModels(op: HookOperation): string[] {
  return [...dataModels(op), ...(op.pageParamModels ?? [])];
}

/**
 * Build the paginated SDK call shared by every infinite query builder.
 * The resolved response is narrowed to the page type so it matches the
 * TQueryFnData the infinite options are instantiated with (#203). Spelled as
 * a cast rather than `!` because generated code is linted downstream, and a
 * non-null assertion trips biome's noNonNullAssertion.
 */
export function buildPagedQueryFn(
  op: HookOperation,
  ctx: GenerationContext,
): string {
  const dataTypeName = getDataTypeName(op);
  const thenClause = `.then(response => response.data as ${getPageType(op)})`;
  const pageParamType = getPageParamType(op);
  // When the initial page param is omitted, the first request must send no
  // page param at all, so spread it in only once TanStack Query provides one.
  const pageKey = propertyKey(ctx.pageParam);
  const pageQuery = ctx.omitInitialPageParam
    ? `...(pageParam === undefined ? {} : { ${pageKey}: pageParam as ${pageParamType} })`
    : `${pageKey}: pageParam as ${pageParamType}`;
  return `({ pageParam, signal }) => ${op.methodName}({ ...clientOptions, query: { ...clientOptions.query, ${pageQuery} }, signal, throwOnError: true } as Options<${dataTypeName}, true>)${thenClause}`;
}

/**
 * Format the initialPageParam literal. Emits `undefined` when the caller opted
 * to omit it (#177); otherwise a numeric literal when possible so the inferred
 * pageParam type matches what getNextPageParam returns.
 */
export function formatInitialPageParam(
  ctx: GenerationContext,
  op?: HookOperation,
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
  // `001` would be an octal literal, which TypeScript rejects.
  return /^-?(0|[1-9]\d*)$/.test(ctx.initialPageParam)
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
    return `{ ${propertyKey(segment)}: ${acc} }`;
  }, pageParamType);
}

/**
 * Build the getNextPageParam expression. The parameter is annotated because
 * not every TanStack entry point contextually types it (prefetchInfiniteQuery
 * does not, which would fail noImplicitAny).
 */
export function buildGetNextPageParamExpr(
  ctx: GenerationContext,
  op?: HookOperation,
): string {
  const nestedType = buildNestedNextPageType(
    ctx.nextPageParam,
    op ? getPageParamType(op) : "number",
  );
  const access = ctx.nextPageParam
    .split(".")
    .map((segment, index) => {
      // The last page can leave out what holds the next one, or set it to null.
      const optional = index > 0 ? "?." : "";
      return isValidIdentifier(segment)
        ? `${optional || "."}${segment}`
        : `${optional}[${JSON.stringify(segment)}]`;
    })
    .join("");
  return `(response: unknown) => (response as ${nestedType})${access}`;
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
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
  const hookName = hookNames(op).hook;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `Common.${hookNames(op).defaultResponse}`;
  const clientOptionsParam = buildClientOptionsParam(op);

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

  const body = `useQuery<TData, TError>({ queryKey: Common.${hookNames(op).keyFn}(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return operationConst(
    op,
    hookName,
    `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${clientOptionsParam}, queryKey?: TQueryKey, options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => ${body}`,
    [...dataModels(op), ...errorModels(op)],
  );
}

/**
 * Build useSuspenseQuery hook.
 */
export function buildUseSuspenseQueryHook(
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
  const hookName = hookNames(op).suspenseHook;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = `NonNullable<Common.${hookNames(op).defaultResponse}>`;
  const clientOptionsParam = buildClientOptionsParam(op);

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

  const body = `useSuspenseQuery<TData, TError>({ queryKey: Common.${hookNames(op).keyFn}(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return operationConst(
    op,
    hookName,
    `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${clientOptionsParam}, queryKey?: TQueryKey, options?: Omit<UseSuspenseQueryOptions<TData, TError>, "queryKey" | "queryFn">) => ${body}`,
    [...dataModels(op), ...errorModels(op)],
  );
}

/**
 * Build a useInfiniteQuery / useSuspenseInfiniteQuery hook. Both variants
 * share the infinite query key (and therefore the cache); they differ only
 * in the TanStack hook called, the options type, and the NonNullable TData
 * default of the suspense variant.
 */
function buildInfiniteHook(
  op: HookOperation,
  ctx: GenerationContext,
  suspense: boolean,
): ConstStatement {
  const hookCall = suspense ? "useSuspenseInfiniteQuery" : "useInfiniteQuery";
  const optionsTypeName = suspense
    ? "UseSuspenseInfiniteQueryOptions"
    : "UseInfiniteQueryOptions";
  const hookName = suspense
    ? hookNames(op).suspenseInfiniteHook
    : hookNames(op).infiniteHook;

  const errorType = getErrorType(op, ctx);
  const baseDataType = `Common.${hookNames(op).defaultResponse}`;
  const dataTypeDefault = suspense
    ? `InfiniteData<NonNullable<${baseDataType}>>`
    : `InfiniteData<${baseDataType}>`;

  const queryFn = buildPagedQueryFn(op, ctx);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx, op)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx, op)}`;

  const body = `${hookCall}({ queryKey: Common.${hookNames(op).infiniteKeyFn}(clientOptions, queryKey), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return operationConst(
    op,
    hookName,
    `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${buildInfiniteClientOptionsParam(op)}, queryKey?: TQueryKey, options?: ${buildOverridableInfiniteOptionsType(optionsTypeName, getPageType(op))}) => ${body}`,
    [...pagedModels(op), ...errorModels(op)],
  );
}

/**
 * Build useInfiniteQuery hook.
 */
export function buildUseInfiniteQueryHook(
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
  return buildInfiniteHook(op, ctx, false);
}

/**
 * Build useSuspenseInfiniteQuery hook.
 */
export function buildUseSuspenseInfiniteQueryHook(
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
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
export function buildPrefetchFn(op: HookOperation): ConstStatement {
  const fnName = hookNames(op).prefetch;

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data)`;

  const optionsParam = `options?: Omit<FetchQueryOptions<Common.${hookNames(op).defaultResponse}>, "queryKey" | "queryFn">`;
  const body = `queryClient.prefetchQuery({ queryKey: Common.${hookNames(op).keyFn}(clientOptions), queryFn: ${queryFn}, ...options })`;

  return operationConst(
    op,
    fnName,
    `(queryClient: QueryClient, ${buildClientOptionsParam(op)}, ${optionsParam}) => ${body}`,
    dataModels(op),
  );
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
  op: HookOperation,
  ctx: GenerationContext,
): ConstStatement {
  const fnName = hookNames(op).prefetchInfinite;

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
  const body = `queryClient.prefetchInfiniteQuery({ queryKey: Common.${hookNames(op).infiniteKeyFn}(clientOptions), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return operationConst(
    op,
    fnName,
    `(queryClient: QueryClient, ${buildInfiniteClientOptionsParam(op)}, ${optionsParam}) => ${body}`,
    pagedModels(op),
  );
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
export function buildEnsureQueryDataFn(op: HookOperation): ConstStatement {
  const fnName = hookNames(op).ensureData;

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data)`;

  const optionsParam = `options?: Omit<EnsureQueryDataOptions<Common.${hookNames(op).defaultResponse}>, "queryKey" | "queryFn">`;
  const body = `queryClient.ensureQueryData({ queryKey: Common.${hookNames(op).keyFn}(clientOptions), queryFn: ${queryFn}, ...options })`;

  return operationConst(
    op,
    fnName,
    `(queryClient: QueryClient, ${buildClientOptionsParam(op)}, ${optionsParam}) => ${body}`,
    dataModels(op),
  );
}
