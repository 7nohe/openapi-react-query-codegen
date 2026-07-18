import {
  StructureKind,
  VariableDeclarationKind,
  type VariableStatementStructure,
} from "ts-morph";
import type { GenerationContext, OperationInfo } from "../types.mjs";
import {
  buildClientOptionsParam,
  buildGetNextPageParamExpr,
  buildInfiniteClientOptionsParam,
  buildPagedQueryFn,
  formatInitialPageParam,
  SDK_CALL_ARGS,
} from "./buildQueryHooks.mjs";

/**
 * Build a queryOptions factory for a GET operation.
 * The factory centralizes queryKey and queryFn so they can be reused with
 * every TanStack Query utility (useQuery, useQueries, prefetchQuery,
 * ensureQueryData, setQueryData, ...) with full type safety.
 * Example:
 * export const findPetsOptions = (clientOptions: Options<FindPetsData, true> = {}, queryKey?: Array<unknown>) =>
 *   queryOptions({
 *     queryKey: Common.UseFindPetsKeyFn(clientOptions, queryKey),
 *     queryFn: () => findPets({ ...clientOptions, throwOnError: true }).then(response => response.data),
 *   });
 */
export function buildQueryOptionsFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure {
  const fnName = `${op.methodName}Options`;
  const clientOptionsParam = buildClientOptionsParam(op, ctx);

  const queryFn = `() => ${op.methodName}(${SDK_CALL_ARGS}).then(response => response.data)`;
  const body = `queryOptions({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn} })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(${clientOptionsParam}, queryKey?: Array<unknown>) => ${body}`,
      },
    ],
  };
}

/**
 * Build an infiniteQueryOptions factory for a paginatable GET operation.
 * Uses the dedicated infinite query key and page-less options type.
 * Example:
 * export const findPaginatedPetsInfiniteOptions = (clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}, queryKey?: Array<unknown>) =>
 *   infiniteQueryOptions({
 *     queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey),
 *     queryFn: ({ pageParam }) => findPaginatedPets({ ...clientOptions, query: { ...clientOptions.query, page: pageParam as number }, throwOnError: true } as Options<FindPaginatedPetsData, true>).then(response => response.data),
 *     initialPageParam: 1,
 *     getNextPageParam: (response: unknown) => (response as { nextPage: number }).nextPage,
 *   });
 */
export function buildInfiniteQueryOptionsFn(
  op: OperationInfo,
  ctx: GenerationContext,
): VariableStatementStructure | null {
  if (!op.isPaginatable) {
    return null;
  }

  const fnName = `${op.methodName}InfiniteOptions`;

  const queryFn = buildPagedQueryFn(op, ctx, false);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx)}`;

  const body = `infiniteQueryOptions({ queryKey: Common.Use${op.capitalizedMethodName}InfiniteKeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ${infiniteOptions} })`;

  return {
    kind: StructureKind.VariableStatement,
    // Copy the operation's JSDoc (description and @deprecated) from the SDK function
    leadingTrivia: op.jsDoc ? `${op.jsDoc}\n` : undefined,
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: fnName,
        initializer: `(${buildInfiniteClientOptionsParam(op)}, queryKey?: Array<unknown>) => ${body}`,
      },
    ],
  };
}
