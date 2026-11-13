import type { GenerationContext, OperationInfo } from "../types.mjs";
import {
  buildClientOptionsParam,
  buildGetNextPageParamExpr,
  buildInfiniteClientOptionsParam,
  buildPagedQueryFn,
  formatInitialPageParam,
  getPageType,
  pagedModels,
  QUERY_SDK_CALL_ARGS,
} from "./buildQueryHooks.mjs";
import { dataModels, operationConst } from "./operationNames.mjs";
import type { ConstStatement } from "./statement.mjs";

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
export function buildQueryOptionsFn(op: OperationInfo): ConstStatement {
  const fnName = `${op.methodName}Options`;
  const clientOptionsParam = buildClientOptionsParam(op);

  const queryFn = `({ signal }) => ${op.methodName}(${QUERY_SDK_CALL_ARGS}).then(response => response.data)`;
  const body = `queryOptions({ queryKey: Common.Use${op.capitalizedMethodName}KeyFn(clientOptions, queryKey), queryFn: ${queryFn} })`;

  return operationConst(
    op,
    fnName,
    `(${clientOptionsParam}, queryKey?: Array<unknown>) => ${body}`,
    dataModels(op),
  );
}

/**
 * Build an infiniteQueryOptions factory for a paginatable GET operation.
 * Uses the dedicated infinite query key and page-less options type.
 * Example:
 * export const findPaginatedPetsInfiniteOptions = (clientOptions: Common.FindPaginatedPetsInfiniteClientOptions = {}, queryKey?: Array<unknown>, options?: Partial<Pick<UseInfiniteQueryOptions<NonNullable<Common.FindPaginatedPetsDefaultResponse>>, "initialPageParam" | "getNextPageParam">>) =>
 *   infiniteQueryOptions({
 *     queryKey: Common.UseFindPaginatedPetsInfiniteKeyFn(clientOptions, queryKey),
 *     queryFn: ({ pageParam }) => findPaginatedPets({ ...clientOptions, query: { ...clientOptions.query, page: pageParam as number }, throwOnError: true } as Options<FindPaginatedPetsData, true>).then(response => response.data as NonNullable<Common.FindPaginatedPetsDefaultResponse>),
 *     initialPageParam: 1,
 *     getNextPageParam: (response: unknown) => (response as { nextPage: number }).nextPage,
 *     ...options,
 *   });
 */
export function buildInfiniteQueryOptionsFn(
  op: OperationInfo,
  ctx: GenerationContext,
): ConstStatement {
  const fnName = `${op.methodName}InfiniteOptions`;

  const queryFn = buildPagedQueryFn(op, ctx);
  const infiniteOptions = `initialPageParam: ${formatInitialPageParam(ctx, op)}, getNextPageParam: ${buildGetNextPageParamExpr(ctx, op)}`;

  // Only the pagination fields are overridable here: the factory's return type
  // is what every downstream consumer infers from, and a wider options type
  // (select, placeholderData, ...) would make that inference ambiguous (#203).
  const optionsParam = `options?: Partial<Pick<UseInfiniteQueryOptions<${getPageType(op)}>, "initialPageParam" | "getNextPageParam">>`;

  const body = `infiniteQueryOptions({ queryKey: Common.Use${op.capitalizedMethodName}InfiniteKeyFn(clientOptions, queryKey), queryFn: ${queryFn}, ${infiniteOptions}, ...options })`;

  return operationConst(
    op,
    fnName,
    `(${buildInfiniteClientOptionsParam(op)}, queryKey?: Array<unknown>, ${optionsParam}) => ${body}`,
    pagedModels(op),
  );
}
