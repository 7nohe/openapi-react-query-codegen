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
 * Build the paginated SDK call shared by every infinite query builder.
 */
export function buildPagedQueryFn(
  op: OperationInfo,
  ctx: GenerationContext,
  castTData: boolean,
): string {
  const dataTypeName = getDataTypeName(op, ctx);
  const thenClause = castTData
    ? ".then(response => response.data as TData) as TData"
    : ".then(response => response.data)";
  return `({ pageParam }) => ${op.methodName}({ ...clientOptions, query: { ...clientOptions.query, ${ctx.pageParam}: pageParam as number }, throwOnError: true } as Options<${dataTypeName}, true>)${thenClause}`;
}

/**
 * Format the initialPageParam literal. Emits a numeric literal when possible
 * so the inferred pageParam type matches what getNextPageParam returns.
 */
export function formatInitialPageParam(ctx: GenerationContext): string {
  return /^-?\d+$/.test(ctx.initialPageParam)
    ? ctx.initialPageParam
    : JSON.stringify(ctx.initialPageParam);
}

/**
 * Build the nested type for getNextPageParam.
 * E.g., "meta.next" becomes "{ meta: { next: number } }"
 */
export function buildNestedNextPageType(nextPageParam: string): string {
  const segments = nextPageParam.split(".");
  return segments.reduceRight((acc, segment) => {
    return `{ ${segment}: ${acc} }`;
  }, "number");
}

/**
 * Build the getNextPageParam expression. The parameter is annotated because
 * not every TanStack entry point contextually types it (prefetchInfiniteQuery
 * does not, which would fail noImplicitAny).
 */
export function buildGetNextPageParamExpr(ctx: GenerationContext): string {
  const nestedType = buildNestedNextPageType(ctx.nextPageParam);
  return `(response: unknown) => (response as ${nestedType}).${ctx.nextPageParam}`;
}

/**
 * Build an options type where the pagination fields TanStack Query marks as
 * required become optional overrides: the generator supplies them, and
 * callers may replace them for custom pagination schemes (#156, #146).
 */
export function buildOverridableInfiniteOptionsType(
  optionsTypeName: string,
): string {
  const instantiated = `${optionsTypeName}<TData, TError>`;
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

  const queryFn = `() => ${op.methodName}(${SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

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

  const queryFn = `() => ${op.methodName}(${SDK_CALL_ARGS}).then(response => response.data as TData) as TData`;

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

  const queryFn = buildPagedQueryFn(op, ctx, true);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx)}`;

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
        initializer: `<TData = ${dataTypeDefault}, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${buildInfiniteClientOptionsParam(op)}, queryKey?: TQueryKey, options?: ${buildOverridableInfiniteOptionsType(optionsTypeName)}) => ${body}`,
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

  const queryFn = `() => ${op.methodName}(${SDK_CALL_ARGS}).then(response => response.data)`;

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
 * export const prefetchUseFindPaginatedPetsInfinite = (queryClient: QueryClient, clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}, options?: Omit<FetchInfiniteQueryOptions<Common.FindPaginatedPetsDefaultResponse>, "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam">) =>
 *   queryClient.prefetchInfiniteQuery({
 *     queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions),
 *     queryFn: ({ pageParam }) => findPaginatedPets({ ...clientOptions, query: { ...clientOptions.query, page: pageParam as number }, throwOnError: true } as Options<FindPaginatedPetsData, true>).then(response => response.data),
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

  const queryFn = buildPagedQueryFn(op, ctx, false);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx)}`;

  const optionsParam = `options?: Omit<FetchInfiniteQueryOptions<Common.${op.capitalizedMethodName}DefaultResponse>, "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam">`;
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

  const queryFn = `() => ${op.methodName}(${SDK_CALL_ARGS}).then(response => response.data)`;

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
