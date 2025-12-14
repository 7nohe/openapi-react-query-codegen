import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";

type QueryHookType = "useQuery" | "useSuspenseQuery" | "useInfiniteQuery";

/**
 * Get the error type string based on client type.
 */
function getErrorType(op: OperationInfo, ctx: GenerationContext): string {
  const errorTypeName = `${op.capitalizedMethodName}Error`;
  if (ctx.client === "@hey-api/client-axios") {
    return `AxiosError<${errorTypeName}>`;
  }
  return errorTypeName;
}

/**
 * Get the data type based on hook type.
 */
function getDataTypeDefault(
  op: OperationInfo,
  hookType: QueryHookType,
): string {
  const baseType = `Common.${op.capitalizedMethodName}DefaultResponse`;
  if (hookType === "useSuspenseQuery") {
    return `NonNullable<${baseType}>`;
  }
  if (hookType === "useInfiniteQuery") {
    return `InfiniteData<${baseType}>`;
  }
  return baseType;
}

/**
 * Get the options type name.
 */
function getOptionsTypeName(hookType: QueryHookType): string {
  switch (hookType) {
    case "useSuspenseQuery":
      return "UseSuspenseQueryOptions";
    case "useInfiniteQuery":
      return "UseInfiniteQueryOptions";
    default:
      return "UseQueryOptions";
  }
}

/**
 * Build the client options parameter string.
 */
function buildClientOptionsParam(
  op: OperationInfo,
  ctx: GenerationContext,
): string {
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const hasParams = op.parameters.length > 0;
  if (!hasParams) {
    return `clientOptions: Options<${dataTypeName}, true> = {}`;
  }

  const defaultValue = op.allParamsOptional ? " = {}" : "";
  return `clientOptions: Options<${dataTypeName}, true>${defaultValue}`;
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
 *   queryFn: () => findPets({ ...clientOptions }).then(response => response.data as TData) as TData,
 *   ...options
 * });
 */
export function buildUseQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const hookName = `use${op.capitalizedMethodName}`;
  const errorType = getErrorType(op, ctx);
  const dataTypeDefault = getDataTypeDefault(op, "useQuery");
  const clientOptionsParam = buildClientOptionsParam(op, ctx);
  const hasParams = op.parameters.length > 0;

  // Build the queryFn body
  const callArgs = hasParams ? "{ ...clientOptions }" : "{ ...clientOptions }";
  const queryFn = `() => ${op.methodName}(${callArgs}).then(response => response.data as TData) as TData`;

  const body = `useQuery<TData, TError>({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
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
  const dataTypeDefault = getDataTypeDefault(op, "useSuspenseQuery");
  const clientOptionsParam = buildClientOptionsParam(op, ctx);
  const hasParams = op.parameters.length > 0;

  const callArgs = hasParams ? "{ ...clientOptions }" : "{ ...clientOptions }";
  const queryFn = `() => ${op.methodName}(${callArgs}).then(response => response.data as TData) as TData`;

  const body = `useSuspenseQuery<TData, TError>({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
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
 * Build the nested type for getNextPageParam.
 * E.g., "meta.next" becomes "{ meta: { next: number } }"
 */
function buildNestedNextPageType(nextPageParam: string): string {
  const segments = nextPageParam.split(".");
  return segments.reduceRight((acc, segment) => {
    return `{ ${segment}: ${acc} }`;
  }, "number");
}

/**
 * Build useInfiniteQuery hook.
 */
export function buildUseInfiniteQueryHook(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  if (!op.isPaginatable) {
    return null;
  }

  const hookName = `use${op.capitalizedMethodName}Infinite`;
  const errorType = getErrorType(op, ctx);
  const baseDataType = `Common.${op.capitalizedMethodName}DefaultResponse`;
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const clientOptionsParam = `clientOptions: Options<${dataTypeName}, true>${defaultValue}`;

  // Build the queryFn with pageParam handling
  const queryFn = `({ pageParam }) => ${op.methodName}({ ...clientOptions, query: { ...clientOptions.query, ${ctx.pageParam}: pageParam as number } }).then(response => response.data as TData) as TData`;

  // Build getNextPageParam with nested type
  const nestedType = buildNestedNextPageType(ctx.nextPageParam);
  const getNextPageParam = `getNextPageParam: (response) => (response as ${nestedType}).${ctx.nextPageParam}`;

  // initialPageParam is a string literal
  const infiniteOptions = `initialPageParam: "${ctx.initialPageParam}", ${getNextPageParam}`;

  const body = `useInfiniteQuery({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: hookName,
        initializer: `<TData = InfiniteData<${baseDataType}>, TError = ${errorType}, TQueryKey extends Array<unknown> = unknown[]>(${clientOptionsParam}, queryKey?: TQueryKey, options?: Omit<UseInfiniteQueryOptions<TData, TError>, "queryKey" | "queryFn">) => ${body}`,
      },
    ],
  };
}

/**
 * Build prefetch function.
 * Example:
 * export const prefetchUseFindPets = (queryClient: QueryClient, clientOptions: Options<FindPetsData, true> = {}) =>
 *   queryClient.prefetchQuery({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions),
 *     queryFn: () => findPets({ ...clientOptions }).then(response => response.data)
 *   });
 */
export function buildPrefetchFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `prefetchUse${op.capitalizedMethodName}`;
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const hasParams = op.parameters.length > 0;
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const clientOptionsParam = hasParams
    ? `clientOptions: Options<${dataTypeName}, true>${defaultValue}`
    : `clientOptions: Options<${dataTypeName}, true> = {}`;

  const callArgs = "{ ...clientOptions }";
  const queryFn = `() => ${op.methodName}(${callArgs}).then(response => response.data)`;

  const body = `queryClient.prefetchQuery({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions), queryFn: ${queryFn} })`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(queryClient: QueryClient, ${clientOptionsParam}) => ${body}`,
      },
    ],
  };
}

/**
 * Build ensureQueryData function.
 * Example:
 * export const ensureUseFindPetsData = (queryClient: QueryClient, clientOptions: Options<FindPetsData, true> = {}) =>
 *   queryClient.ensureQueryData({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions),
 *     queryFn: () => findPets({ ...clientOptions }).then(response => response.data)
 *   });
 */
export function buildEnsureQueryDataFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `ensureUse${op.capitalizedMethodName}Data`;
  const dataTypeName = ctx.modelNames.includes(
    `${op.capitalizedMethodName}Data`,
  )
    ? `${op.capitalizedMethodName}Data`
    : "unknown";

  const hasParams = op.parameters.length > 0;
  const defaultValue = op.allParamsOptional ? " = {}" : "";
  const clientOptionsParam = hasParams
    ? `clientOptions: Options<${dataTypeName}, true>${defaultValue}`
    : `clientOptions: Options<${dataTypeName}, true> = {}`;

  const callArgs = "{ ...clientOptions }";
  const queryFn = `() => ${op.methodName}(${callArgs}).then(response => response.data)`;

  const body = `queryClient.ensureQueryData({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions), queryFn: ${queryFn} })`;

  return {
    kind: StructureKind.VariableStatement,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(queryClient: QueryClient, ${clientOptionsParam}) => ${body}`,
      },
    ],
  };
}
